import { z } from "zod";
export const FallbackReasonSchema=z.enum(["plan_validation","plan_provider_failure","planner_no_tool","unknown_tool","tool_validation","timeout","step_limit","provider_failure"]);
export const PlannerMetricsSchema=z.object({planner_runs:z.number().int().min(0),llm_success:z.number().int().min(0),fallback_count:z.number().int().min(0),fallback_reason:z.array(FallbackReasonSchema).max(10),tool_validation_failure:z.number().int().min(0),timeout:z.number().int().min(0)}).strict();
export type PlannerMetrics=z.infer<typeof PlannerMetricsSchema>;
