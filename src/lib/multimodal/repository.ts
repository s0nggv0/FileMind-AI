import { z } from "zod";
import type { TenantDatabase } from "../workspace/postgres-repository";
import type { RetrievalScope } from "../retrieval/types";
import { ImageAnalysisSchema, OCRResultSchema, type MultimodalAnalysis } from "./schemas";
import { imageConcepts } from "./shared-concepts";
export const MultimodalRecordSchema = z.object({ documentId: z.uuid(), imageType: ImageAnalysisSchema.shape.imageType.nullable(), vision: ImageAnalysisSchema.nullable(), ocr: OCRResultSchema.nullable(),
  imageHash: z.string().optional(), visionPromptVersion: z.string().optional(), ocrVersion: z.string().optional(),
  visionStatus: z.enum(["pending", "ready", "failed", "disabled", "stale"]), ocrStatus: z.enum(["pending", "ready", "failed", "disabled", "stale"]),
  provider: z.string(), model: z.string(), ocrEngine: z.string(), analysisVersion: z.string(), visionCacheKey: z.string(), ocrCacheKey: z.string(), createdAt: z.iso.datetime(),
  usage: z.object({ requests: z.number(), latencyMs: z.number(), inputTokens: z.number().optional(), outputTokens: z.number().optional(), totalTokens: z.number().optional() }),
});
export class MultimodalRepository {
  constructor(private db: TenantDatabase) {}
  async related(scope: RetrievalScope, documentId: string) {
    const analysis = await this.get(scope, documentId);
    const concepts = imageConcepts(analysis?.vision ?? null);
    const result = await this.db.query(scope.userId, `select d.id,d.display_name as name,d.file_type as type from filemind.documents d
      where d.user_id=$1 and d.id<>$2 and ($4::uuid is null or d.workspace_id=$4) and (
        exists(select 1 from filemind.document_tags a join filemind.document_tags b on lower(regexp_replace(a.tag,'[^[:alnum:]]+',' ','g'))=lower(regexp_replace(b.tag,'[^[:alnum:]]+',' ','g')) and a.user_id=b.user_id where a.document_id=$2 and b.document_id=d.id and a.user_id=$1 and lower(a.tag) not in ('image','document'))
        or exists(select 1 from unnest($3::text[]) c where position(case when c ~ '[^a-z0-9 ]' then c else ' '||c||' ' end in ' '||regexp_replace(lower(coalesce(d.text_content,'')||' '||coalesce(d.summary,'')),'[^[:alnum:]]+',' ','g')||' ')>0)
      ) order by d.display_name limit 10`, [scope.userId, documentId, concepts, scope.workspaceId ?? null]);
    return result.rows;
  }
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
