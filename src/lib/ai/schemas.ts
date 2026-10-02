import { z } from "zod";
export const DocumentAnalysisSchema = z.object({
  summary: z.string().trim().min(1).max(3000), category: z.string().trim().min(1).max(80),
  isNewCategory: z.boolean(), reason: z.string().max(300), tags: z.array(z.string().trim().min(1).max(40)).min(3).max(8),
  filenameSuggestion: z.object({ shouldRename: z.boolean(), suggestedFilename: z.string().max(255).nullable(), reason: z.string().max(300) }),
  confidence: z.number().min(0).max(1),
});
export type DocumentAnalysis = z.infer<typeof DocumentAnalysisSchema>;
export const OrganizationOutputSchema = z.object({ workspaceSummary: z.string().max(1500), documents: z.array(z.object({ id: z.uuid(), category: z.string().min(1).max(80) })).min(1).max(30) });
