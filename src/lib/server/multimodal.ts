import "server-only";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { database } from "./database";
import { getFileStorage } from "./file-storage";
import { KimiVisionProvider } from "../multimodal/kimi-vision";
import { PortableOCRProvider } from "../multimodal/portable-ocr";
import { MultimodalPipeline, mergeKnowledge } from "../multimodal/pipeline";
import { MultimodalRepository, MultimodalRecordSchema } from "../multimodal/repository";
import { validateImage } from "../multimodal/image-validation";
import { MULTIMODAL_INDEX_VERSION, VISION_PROMPT_VERSION } from "../multimodal/config";
import type { WorkspaceSnapshot } from "../workspace/schemas";
import type { RetrievalScope } from "../retrieval/types";
import { WorkspaceError } from "../workspace/authorization";
import { recoveryService } from "./reliability";
import { realAIRequired } from "../competition";
export const multimodalRepository = new MultimodalRepository(database);
async function visionProvider() {
  if (!realAIRequired()) return null;
  const gate = await readFile(resolve(".filemind/vision-verification.json"), "utf8").then(s => JSON.parse(s), () => null);
  if (!gate?.verified || gate.model !== "kimi-k2.6" || gate.baseURL !== (process.env.KIMI_BASE_URL || "https://api.moonshot.cn/v1")) return null;
  try { return new KimiVisionProvider({ apiKey: process.env.KIMI_API_KEY, baseURL: process.env.KIMI_BASE_URL }); } catch { return null; }
}
export async function imageSource(scope: RetrievalScope, documentId: string) {
  const result = await database.query(scope.userId, "select id,workspace_id,original_name,display_name,mime_type,content_hash,image_width,image_height,case when storage_path is null then 'not_stored' else storage_status end as storage_status from filemind.documents where user_id=$1 and id=$2 and file_type='image' and ($3::uuid is null or workspace_id=$3)", [scope.userId, documentId, scope.workspaceId ?? null]);
  if (!result.rows.length) throw new WorkspaceError("NOT_FOUND", "Image not found.", 404);
  return z.object({ id: z.uuid(), workspace_id: z.uuid(), original_name: z.string(), display_name: z.string(), mime_type: z.enum(["image/png", "image/jpeg"]), content_hash: z.string(), image_width: z.number().nullable(), image_height: z.number().nullable(),storage_status:z.enum(["available","missing","not_stored"]) }).parse(result.rows[0]);
}
export async function analyzeWorkspaceImage(userId: string, snapshot: WorkspaceSnapshot, documentId: string, signal: AbortSignal, event?: (message: string) => Promise<void>) {
  const doc = snapshot.documents.find(d => d.id === documentId && d.type === "image");
  if (!doc) throw new WorkspaceError("NOT_FOUND", "Image not found.", 404);
  const original = await imageSource({ userId, workspaceId: snapshot.id }, documentId);
  const bytes = await getFileStorage().readOriginal({ userId, workspaceId: snapshot.id, documentId, extension: original.original_name.split(".").at(-1)!.toLowerCase() });
  const metadata = await validateImage(bytes, original.original_name, original.mime_type);
  const scope = { userId, workspaceId: snapshot.id };
  const result = await new MultimodalPipeline(await visionProvider(), process.env.OCR_ENGINE === "disabled" ? null : new PortableOCRProvider(), process.env).analyze(documentId,
    { bytes, filename: original.original_name, mimeType: metadata.mimeType }, original.content_hash, signal, await multimodalRepository.get(scope, documentId), event);
  await multimodalRepository.save(scope, result.analysis);
  Object.assign(doc.metadata, { width: metadata.width, height: metadata.height, characters: result.text.length, structure: result.structure });
  snapshot.texts[documentId] = result.text;
  await database.query(userId, "update filemind.documents set vision_status=$4,ocr_status=$5,vision_model=$6,ocr_engine=$7,text_content=$8,metadata=$9 where user_id=$1 and workspace_id=$2 and id=$3", [userId, snapshot.id, documentId, result.analysis.visionStatus, result.analysis.ocrStatus, result.analysis.model, result.analysis.ocrEngine, result.text, doc.metadata]);
  return result.analysis;
}
export async function refreshMultimodalVersions(scope: RetrievalScope) {
  const vision = await visionProvider(); const info = vision?.getModelInfo();
  const result = await database.query(scope.userId, "select a.document_id,a.analysis,d.content_hash from filemind.multimodal_analysis a join filemind.documents d on d.id=a.document_id and d.user_id=a.user_id where a.user_id=$1 and ($2::uuid is null or a.workspace_id=$2) and ($3::uuid[] is null or d.id=any($3::uuid[]))", [scope.userId, scope.workspaceId ?? null, scope.documentIds ?? null]);
  const { imageCacheKey } = await import("../multimodal/pipeline");
  const ocrInfo = process.env.OCR_ENGINE === "disabled" ? { engine: "disabled", version: "none" } : new PortableOCRProvider().getEngineInfo();
  const stale: string[] = [];
  for (const row of result.rows as { document_id: string; analysis: unknown; content_hash: string }[]) {
    const record = MultimodalRecordSchema.parse(row.analysis);
    const source = { content_hash: row.content_hash };
    const changed = record.analysisVersion !== MULTIMODAL_INDEX_VERSION || (info && record.visionCacheKey !== imageCacheKey(source.content_hash, info.provider, info.model, VISION_PROMPT_VERSION)) || record.ocrCacheKey !== imageCacheKey(source.content_hash, ocrInfo.engine, ocrInfo.version, "ocr-v1");
    if (changed) stale.push(row.document_id);
  }
  if (stale.length) await database.query(scope.userId, "update filemind.documents set index_status='stale',vision_status='stale' where user_id=$1 and id=any($2::uuid[]) and index_status='ready'", [scope.userId, stale]);
}
export async function prepareImageIndexes(scope: RetrievalScope, documentId?: string) {
  return recoveryService().journal.lock(scope.userId,"storage",async leaseSignal=>{
  const rows = await database.query(scope.userId, "select id,workspace_id from filemind.documents where user_id=$1 and file_type='image' and parse_status='completed' and storage_path is not null and storage_status='available' and ($2::uuid is null or workspace_id=$2) and ($3::uuid is null or id=$3)", [scope.userId, scope.workspaceId ?? null, documentId ?? null]);
  const { workspaceRepository } = await import("./workspace-repository");
  for (const row of rows.rows as { id: string; workspace_id: string }[]) {
    const snapshot = await workspaceRepository.get(scope.userId, row.workspace_id);
    await analyzeWorkspaceImage(scope.userId, snapshot, row.id, AbortSignal.any([leaseSignal,AbortSignal.timeout(120000)]));
    // Save only if server knowledge differs; index retries retain stable content.
    const persisted = mergeKnowledge((await multimodalRepository.get(scope, row.id))!);
    snapshot.texts[row.id] = persisted.text;
    await workspaceRepository.save(scope.userId, snapshot);
  }
  });
}
