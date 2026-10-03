import { z } from "zod";
import type { TenantDatabase } from "../workspace/postgres-repository";
import type { RetrievalScope } from "../retrieval/types";
import { ImageAnalysisSchema, OCRResultSchema, type MultimodalAnalysis } from "./schemas";
export const MultimodalRecordSchema = z.object({ documentId: z.uuid(), imageType: ImageAnalysisSchema.shape.imageType.nullable(), vision: ImageAnalysisSchema.nullable(), ocr: OCRResultSchema.nullable(),
  visionStatus: z.enum(["pending", "ready", "failed", "disabled", "stale"]), ocrStatus: z.enum(["pending", "ready", "failed", "disabled", "stale"]),
  provider: z.string(), model: z.string(), ocrEngine: z.string(), analysisVersion: z.string(), visionCacheKey: z.string(), ocrCacheKey: z.string(), createdAt: z.iso.datetime(),
  usage: z.object({ requests: z.number(), latencyMs: z.number(), inputTokens: z.number().optional(), outputTokens: z.number().optional(), totalTokens: z.number().optional() }),
});
export class MultimodalRepository {
  constructor(private db: TenantDatabase) {}
  async get(scope: RetrievalScope, documentId: string): Promise<MultimodalAnalysis | null> {
    const result = await this.db.query(scope.userId, "select analysis from filemind.multimodal_analysis where user_id=$1 and document_id=$2 and ($3::uuid is null or workspace_id=$3)", [scope.userId, documentId, scope.workspaceId ?? null]);
    return result.rows.length ? MultimodalRecordSchema.parse((result.rows[0] as { analysis: unknown }).analysis) : null;
  }
  async save(scope: RetrievalScope & { workspaceId: string }, analysis: MultimodalAnalysis) {
    const value = MultimodalRecordSchema.parse(analysis);
    const result = await this.db.query(scope.userId, `insert into filemind.multimodal_analysis(user_id,workspace_id,document_id,image_type,ocr_text,vision_summary,topics,tags,visible_concepts,confidence,provider,model,analysis_version,analysis)
      select $1,$2,id,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14 from filemind.documents where user_id=$1 and workspace_id=$2 and id=$3 and file_type='image'
      on conflict(document_id) do update set image_type=excluded.image_type,ocr_text=excluded.ocr_text,vision_summary=excluded.vision_summary,topics=excluded.topics,tags=excluded.tags,visible_concepts=excluded.visible_concepts,confidence=excluded.confidence,provider=excluded.provider,model=excluded.model,analysis_version=excluded.analysis_version,analysis=excluded.analysis,created_at=now() returning document_id`,
    [scope.userId, scope.workspaceId, value.documentId, value.imageType, value.ocr?.text ?? "", value.vision?.summary ?? "", value.vision?.topics ?? [], value.vision?.tags ?? [], value.vision?.visibleConcepts ?? [], value.vision?.confidence ?? value.ocr?.confidence ?? 0, value.provider, value.model, value.analysisVersion, value]);
    if (!result.rows.length) throw new Error("Image inaccessible");
  }
}
