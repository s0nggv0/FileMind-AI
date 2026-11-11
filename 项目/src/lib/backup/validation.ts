import { z } from "zod";
import { BackupError, ManifestSchema, metadataPaths, parseRows, tables, jsonSafe, type BackupData, type BackupCompatibility, type BackupManifest, type BackupRow } from "./format";
import { unpackArchive, sha256 } from "./archive";
import { WorkspaceSnapshotSchema, RunSchema, OrganizationProposalSchema } from "../workspace/schemas";
import { MultimodalRecordSchema } from "../multimodal/repository";
import { validateVector } from "../retrieval/embedding-provider";
export interface ValidatedBackup {
    manifest: BackupManifest;
    data: BackupData;
    profile: {
        created_at: string;
    };
    files: Record<string, Uint8Array>;
    embeddingCompatible: boolean;
    visionCompatible: boolean;
    preview: {
        createdAt: string;
        filemindVersion: string;
        workspaces: number;
        documents: number;
        files: number;
        images: number;
        chunks: number;
        embeddingModel: string | null;
        embeddingCompatible: boolean;
        visionCompatible: boolean;
        encrypted: false;
    };
}
const ids = (rows: BackupRow[], field = "id") => new Map(rows.map(r => [String(r[field]), r]));
function typedRows(data: BackupData) {
    const required: Record<string, string> = {
        workspaces: "id name status revision snapshot created_at updated_at",
        documents: "id workspace_id original_name display_name mime_type file_type file_size parse_status processing_status text_content metadata created_at updated_at index_status content_source vision_status ocr_status",
        agent_runs: "id workspace_id engine status run_json created_at",
        agent_steps: "id workspace_id run_id position tool_name status",
        organization_proposals: "id run_id workspace_id status proposal_json created_at updated_at",
        document_tags: "workspace_id document_id tag",
        document_relations: "id workspace_id source_id target_id kind reason",
        document_chunks: "id workspace_id document_id chunk_index content content_hash heading_path char_start char_end token_estimate chunk_version lexical_tokens created_at updated_at chunk_source",
        chunk_embeddings: "id workspace_id document_id chunk_id provider model dimensions embedding embedding_hash chunk_version created_at",
        multimodal_analysis: "document_id workspace_id ocr_text vision_summary topics tags visible_concepts confidence provider model analysis_version analysis created_at",
        retrieval_runs: "id query mode top_k retrieved_chunk_ids evidence_ids reranker_status latency result created_at",
    };
    const numbers = new Set("revision file_size position chunk_index char_start char_end token_estimate dimensions top_k image_width image_height prompt_tokens completion_tokens total_tokens page_start page_end line_start line_end paragraph_start paragraph_end".split(" "));
    const arrays = new Set("heading_path lexical_tokens topics tags visible_concepts retrieved_chunk_ids evidence_ids".split(" "));
    const objects = new Set("snapshot run_json proposal_json metadata analysis_json analysis input output latency result".split(" "));
    for (const t of tables)
        for (const row of data[t.table])
            for (const [key, value] of Object.entries(row)) {
                if (value === null) {
                    if (required[t.table].split(" ").includes(key))
                        throw new BackupError("Invalid backup schema.");
                    continue;
                }
                if (numbers.has(key))
                    z.number().int().safe().parse(value);
                else if (key.endsWith("_at"))
                    z.iso.datetime({ offset: true }).parse(value);
                else if (key === "embedding")
                    z.array(z.number().finite()).max(65536).parse(value);
                else if (key === "confidence")
                    z.number().min(0).max(1).parse(value);
                else if (arrays.has(key))
                    z.array(z.string().max(250000)).max(100000).parse(value);
                else if (objects.has(key)) {
                    if (typeof value !== "object" && key !== "output")
                        throw new BackupError("Invalid backup schema.");
                }
                else
                    z.string().max(250000).parse(value);
            }
    for (const row of data.workspaces)
        z.enum(["draft", "processing", "review", "completed"]).parse(row.status);
    for (const row of data.documents) {
        z.enum(["not_indexed", "chunking", "embedding", "ready", "failed", "stale"]).parse(row.index_status);
        z.enum(["text", "image", "scan", "mixed"]).parse(row.content_source);
    }
    for (const row of data.agent_runs) {
        z.enum(["mock", "llm"]).parse(row.engine);
        z.enum(["planning", "running", "waiting_for_review", "applying", "completed", "failed", "cancelled"]).parse(row.status);
    }
    for (const row of data.organization_proposals)
        z.enum(["draft", "reviewing", "accepted", "partially_accepted", "rejected", "applied"]).parse(row.status);
    for (const row of data.document_relations)
        z.enum(["rule-based", "ai-inferred", "shared_concept", "semantic"]).parse(row.kind);
    for (const row of data.document_chunks)
        z.enum(["text", "ocr", "vision_summary", "concepts", "mixed"]).parse(row.chunk_source);
    for (const row of data.retrieval_runs)
        z.enum(["ask", "find"]).parse(row.mode);
}
export function validateReferences(data: BackupData) {
    typedRows(data);
    const primaryIds = new Set<string>();
    for (const t of tables)
        for (const row of data[t.table])
            if (row.id != null) {
                if (primaryIds.has(String(row.id)))
                    throw new BackupError("Invalid backup references.");
                primaryIds.add(String(row.id));
            }
    const workspaces = ids(data.workspaces), documents = ids(data.documents), runs = ids(data.agent_runs), chunks = ids(data.document_chunks);
    for (const table of tables) {
        const seen = new Set<string>();
        for (const row of data[table.table]) {
            const key = table.table === "document_tags" ? `${row.document_id}:${row.tag}` : String(row.id ?? row.document_id);
            if (seen.has(key))
                throw new BackupError("Invalid backup references.");
            seen.add(key);
            const workspace = row.workspace_id == null ? null : workspaces.get(String(row.workspace_id));
            if (table.table !== "workspaces" && row.workspace_id != null && !workspace)
                throw new BackupError("Invalid backup references.");
            for (const [field, map] of [["document_id", documents], ["run_id", runs], ["source_id", documents], ["target_id", documents], ["chunk_id", chunks]] as const) {
                if (row[field] != null) {
                    const target = map.get(String(row[field]));
                    if (!target || target.workspace_id !== row.workspace_id)
                        throw new BackupError("Invalid backup references.");
                    if (field === "chunk_id" && target.document_id !== row.document_id)
                        throw new BackupError("Invalid backup references.");
                }
            }
            for (const field of ["retrieved_chunk_ids", "evidence_ids"])
                if (Array.isArray(row[field]))
                    for (const id of row[field]) {
                        const c = chunks.get(String(id));
                        if (!c || (row.workspace_id != null && c.workspace_id !== row.workspace_id))
                            throw new BackupError("Invalid backup references.");
                    }
        }
    }
    for (const row of data.documents) {
        z.number().int().min(0).max(20 * 1024 * 1024).parse(row.file_size);
        z.enum(["pdf", "docx", "txt", "md", "image"]).parse(row.file_type);
        z.string().max(250000).parse(row.text_content);
        z.string().min(1).max(255).parse(row.original_name);
        z.string().min(1).max(255).parse(row.display_name);
        if (row.content_hash !== null)
            z.string().regex(/^[a-f0-9]{64}$/).parse(row.content_hash);
    }
    for (const row of data.workspaces) {
        const docs = data.documents.filter(d => d.workspace_id === row.id);
        const snapshot = WorkspaceSnapshotSchema.parse({ ...row.snapshot as object, texts: Object.fromEntries(docs.map(d => [String(d.id), d.text_content])) });
        if (snapshot.id !== row.id || snapshot.revision !== row.revision || snapshot.documents.length !== docs.length || snapshot.documents.some(d => !docs.some(r => r.id === d.id)))
            throw new BackupError("Invalid backup references.");
    }
    for (const row of data.agent_runs) {
        const run = RunSchema.parse(row.run_json);
        const workspace = workspaces.get(String(row.workspace_id))!;
        if (run.id !== row.id || run.documents.some(d => documents.get(d.id)?.workspace_id !== workspace.id) || run.steps.some(s => s.input.documentId && documents.get(s.input.documentId)?.workspace_id !== workspace.id) || run.result?.documents.some(d => documents.get(d.id)?.workspace_id !== workspace.id))
            throw new BackupError("Invalid backup references.");
    }
    for (const row of data.agent_steps) {
        const input = row.input as {
            documentId?: string;
        } | null;
        if (input?.documentId && documents.get(input.documentId)?.workspace_id !== row.workspace_id)
            throw new BackupError("Invalid backup references.");
    }
    for (const row of data.organization_proposals) {
        const proposal = OrganizationProposalSchema.parse(row.proposal_json);
        if (proposal.documents.some(d => documents.get(d.id)?.workspace_id !== row.workspace_id))
            throw new BackupError("Invalid backup references.");
    }
    for (const row of data.multimodal_analysis) {
        const analysis = MultimodalRecordSchema.parse(row.analysis);
        if (analysis.documentId !== row.document_id || documents.get(String(row.document_id))?.file_type !== "image")
            throw new BackupError("Invalid backup references.");
    }
    for (const row of data.document_chunks) {
        if (Number(row.char_start) < 0 || Number(row.char_end) <= Number(row.char_start) || Number(row.chunk_index) < 0 || sha256(String(row.content)) !== row.content_hash)
            throw new BackupError("Invalid backup chunks.");
    }
    for (const row of data.chunk_embeddings) {
        validateVector(row.embedding as number[], Number(row.dimensions));
        if (row.chunk_version !== chunks.get(String(row.chunk_id))?.chunk_version)
            throw new BackupError("Invalid backup references.");
    }
    for (const row of data.retrieval_runs) {
        const result = z.object({ id: z.uuid(), sources: z.array(z.object({ id: z.uuid(), documentId: z.uuid(), workspaceId: z.uuid() })), nearest: z.array(z.object({ id: z.uuid(), documentId: z.uuid(), workspaceId: z.uuid() })), answer: z.object({ citations: z.array(z.object({ chunkId: z.uuid(), documentId: z.uuid(), sourceId: z.string() })) }).passthrough().nullable() }).passthrough().parse(row.result);
        if (result.id !== row.id)
            throw new BackupError("Invalid backup references.");
        for (const source of [...result.sources, ...result.nearest]) {
            const chunk = chunks.get(source.id);
            if (!chunk || chunk.document_id !== source.documentId || chunk.workspace_id !== source.workspaceId)
                throw new BackupError("Invalid backup references.");
        }
        for (const c of result.answer?.citations ?? [])
            if (chunks.get(c.chunkId)?.document_id !== c.documentId)
                throw new BackupError("Invalid backup references.");
    }
}
export function validateBackup(bytes: Uint8Array, current: BackupCompatibility): ValidatedBackup {
    try {
        const files = unpackArchive(bytes);
        if (!files["manifest.json"] || !files["manifest.sha256"] || Buffer.from(files["manifest.sha256"]).toString("utf8").trim() !== sha256(files["manifest.json"]))
            throw new BackupError();
        const raw = JSON.parse(Buffer.from(files["manifest.json"]).toString("utf8"));
        jsonSafe(raw);
        if (Number(raw.version) > 1)
            throw new BackupError("This backup format is newer than this FileMind version.");
        const manifest = ManifestSchema.parse(raw);
        const listed = Object.keys(manifest.checksums);
        if (listed.length !== Object.keys(files).length - 2 || listed.some(path => path === "manifest.json" || path === "manifest.sha256" || !files[path] || sha256(files[path]) !== manifest.checksums[path]))
            throw new BackupError();
        for (const path of metadataPaths)
            if (!listed.includes(path))
                throw new BackupError();
        const data = {} as BackupData;
        for (const t of tables)
            data[t.table] = parseRows(JSON.parse(Buffer.from(files[`data/${t.file}.json`]).toString("utf8")), t);
        const profile = z.object({ created_at: z.iso.datetime({ offset: true }) }).strict().parse(JSON.parse(Buffer.from(files["data/profile.json"]).toString("utf8")));
        validateReferences(data);
        const originals = Object.keys(files).filter(p => p.startsWith("files/"));
        const paths = new Set<string>();
        for (const row of data.documents) {
            if (row.storage_path === null)
                continue;
            const path = z.string().parse(row.storage_path), ext = String(row.original_name).split(".").at(-1)?.toLowerCase();
            if (path !== `files/${row.id}.${ext}` || (row.file_type === "image" ? !["png", "jpg", "jpeg"].includes(ext ?? "") : ext !== row.file_type) || !files[path] || files[path].length !== row.file_size || sha256(files[path]) !== row.content_hash)
                throw new BackupError();
            paths.add(path);
        }
        if (paths.size !== originals.length || manifest.documentsCount !== data.documents.length || manifest.workspacesCount !== data.workspaces.length || manifest.filesCount !== originals.length)
            throw new BackupError();
        const embeddingCompatible = !!current.embedding && manifest.embeddingProvider === current.embedding.provider && manifest.embeddingModel === current.embedding.model && manifest.embeddingDimensions === current.embedding.dimensions && manifest.chunkVersion === current.chunkVersion && data.chunk_embeddings.every(e => e.provider === current.embedding!.provider && e.model === current.embedding!.model && e.dimensions === current.embedding!.dimensions && e.chunk_version === current.chunkVersion);
        const visionCompatible = !!current.vision && manifest.visionProvider === current.vision.provider && manifest.visionModel === current.vision.model && manifest.analysisVersion === current.vision.analysisVersion && manifest.visionPromptVersion === current.vision.promptVersion && data.multimodal_analysis.every(row => { const a = MultimodalRecordSchema.parse(row.analysis); return a.provider === current.vision!.provider && a.model === current.vision!.model && a.analysisVersion === current.vision!.analysisVersion && a.visionPromptVersion === current.vision!.promptVersion; });
        return { manifest, data, profile, files, embeddingCompatible, visionCompatible, preview: { createdAt: manifest.createdAt, filemindVersion: manifest.filemindVersion, workspaces: data.workspaces.length, documents: data.documents.length, files: originals.length, images: data.documents.filter(d => d.file_type === "image").length, chunks: data.document_chunks.length, embeddingModel: manifest.embeddingModel, embeddingCompatible, visionCompatible, encrypted: false } };
    }
    catch (error) {
        if (error instanceof BackupError)
            throw error;
        throw new BackupError("Invalid backup schema or references.");
    }
}
