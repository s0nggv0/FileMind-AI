import { z } from "zod";
import { CHUNK_VERSION } from "../retrieval/config";
import { MULTIMODAL_INDEX_VERSION, VISION_PROMPT_VERSION } from "../multimodal/config";
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_SCHEMA_VERSION = "filemind-phase7-v1";
export const BACKUP_LIMITS = { archiveBytes: 128 * 1024 * 1024, totalBytes: 256 * 1024 * 1024, metadataBytes: 64 * 1024 * 1024, fileBytes: 20 * 1024 * 1024, entries: 12000, rows: 100000 };
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const ManifestSchema = z.object({ format: z.literal("filemind-backup"), version: z.literal(BACKUP_FORMAT_VERSION), createdAt: z.iso.datetime(), filemindVersion: z.string().max(80), schemaVersion: z.literal(BACKUP_SCHEMA_VERSION), chunkVersion: z.string().max(80), embeddingProvider: z.string().nullable(), embeddingModel: z.string().nullable(), embeddingDimensions: z.number().int().positive().max(65536).nullable(), visionProvider: z.string().nullable(), visionModel: z.string().nullable(), analysisVersion: z.string(), visionPromptVersion: z.string(), documentsCount: z.number().int().nonnegative(), workspacesCount: z.number().int().nonnegative(), filesCount: z.number().int().nonnegative(), checksumAlgorithm: z.literal("SHA-256"), checksums: z.record(z.string(), digest), encrypted: z.literal(false) }).strict();
export type BackupManifest = z.infer<typeof ManifestSchema>;
export interface BackupCompatibility {
    embedding: {
        provider: string;
        model: string;
        dimensions: number;
    } | null;
    vision: {
        provider: string;
        model: string;
        analysisVersion: string;
        promptVersion: string;
    } | null;
    chunkVersion: string;
}
export function compatibility(embedding: BackupCompatibility["embedding"], vision: BackupCompatibility["vision"] = { provider: "kimi", model: "kimi-k2.6", analysisVersion: MULTIMODAL_INDEX_VERSION, promptVersion: VISION_PROMPT_VERSION }): BackupCompatibility { return { embedding, vision, chunkVersion: CHUNK_VERSION }; }
export type BackupRow = Record<string, unknown>;
export const tables = [
    { table: "workspaces", file: "workspaces", columns: "id name status revision snapshot created_at updated_at last_opened_at" },
    { table: "documents", file: "documents", columns: "id workspace_id original_name display_name mime_type file_type file_size storage_path parse_status processing_status text_content content_preview summary category suggested_filename content_hash normalized_text_hash analysis_cache_key analysis_json metadata created_at updated_at index_status indexed_at embedding_model embedding_provider chunk_version index_generation index_error_code content_source image_width image_height vision_status ocr_status vision_model ocr_engine" },
    { table: "agent_runs", file: "agent-runs", columns: "id workspace_id engine model prompt_version status started_at completed_at error_code error_message prompt_tokens completion_tokens total_tokens run_json created_at" },
    { table: "agent_steps", file: "agent-steps", columns: "id workspace_id run_id position tool_name status input output started_at completed_at error_message" },
    { table: "organization_proposals", file: "proposals", columns: "id run_id workspace_id status proposal_json created_at updated_at" },
    { table: "document_tags", file: "tags", columns: "workspace_id document_id tag" },
    { table: "document_relations", file: "relations", columns: "id workspace_id source_id target_id kind reason" },
    { table: "document_chunks", file: "chunks", columns: "id workspace_id document_id chunk_index content content_hash page_start page_end line_start line_end paragraph_start paragraph_end heading_path char_start char_end token_estimate chunk_version lexical_tokens created_at updated_at chunk_source" },
    { table: "chunk_embeddings", file: "embeddings", columns: "id workspace_id document_id chunk_id provider model dimensions embedding embedding_hash chunk_version created_at" },
    { table: "multimodal_analysis", file: "multimodal", columns: "document_id workspace_id image_type ocr_text vision_summary topics tags visible_concepts confidence provider model analysis_version analysis created_at" },
    { table: "retrieval_runs", file: "retrieval-runs", columns: "id workspace_id query rewritten_query mode vector_model vector_provider top_k retrieved_chunk_ids evidence_ids reranker_status latency result created_at" },
] as const;
export type BackupTable = typeof tables[number]["table"];
export type BackupData = Record<BackupTable, BackupRow[]>;
export class BackupError extends Error {
    constructor(message = "Backup integrity check failed.", public status = 400) { super(message); }
}
export const metadataPaths = new Set(["data/profile.json", ...tables.map(t => `data/${t.file}.json`)]);
export function safeArchivePath(path: string) { return path === "manifest.json" || path === "manifest.sha256" || metadataPaths.has(path) || /^files\/[a-f0-9-]{36}\.(?:pdf|docx|txt|md|png|jpg|jpeg)$/.test(path); }
export function jsonSafe(value: unknown, depth = 0): void {
    if (depth > 32)
        throw new BackupError("Invalid backup schema.");
    if (value === null || typeof value === "boolean" || typeof value === "string")
        return;
    if (typeof value === "number") {
        if (!Number.isFinite(value))
            throw new BackupError("Invalid backup schema.");
        return;
    }
    if (Array.isArray(value)) {
        if (value.length > BACKUP_LIMITS.rows)
            throw new BackupError("Backup exceeds supported limits.");
        for (const v of value)
            jsonSafe(v, depth + 1);
        return;
    }
    if (typeof value !== "object")
        throw new BackupError("Invalid backup schema.");
    for (const [k, v] of Object.entries(value)) {
        if (["__proto__", "prototype", "constructor"].includes(k))
            throw new BackupError("Invalid backup schema.");
        jsonSafe(v, depth + 1);
    }
}
export function parseRows(value: unknown, table: typeof tables[number]): BackupRow[] {
    jsonSafe(value);
    const rows = z.array(z.record(z.string(), z.unknown())).max(BACKUP_LIMITS.rows).parse(value);
    const cols = table.columns.split(" ");
    for (const row of rows) {
        if (Object.keys(row).some(k => !cols.includes(k)) || cols.some(k => !(k in row)))
            throw new BackupError("Invalid backup schema.");
        for (const field of ["id", "workspace_id", "document_id", "run_id", "source_id", "target_id", "chunk_id"]) {
            if (row[field] !== undefined && row[field] !== null) {
                if (field === "id" && table.table === "document_relations")
                    z.string().min(1).max(200).parse(row[field]);
                else
                    z.uuid().parse(row[field]);
            }
        }
    }
    return rows;
}
