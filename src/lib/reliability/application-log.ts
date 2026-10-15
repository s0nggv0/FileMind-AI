import { appendFile, rename, rm, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { z } from "zod";
import { ensureStorageDirectory } from "../../../scripts/runtime/storage-recovery.mjs";
import { withPathMutex } from "./atomic-file";
export const ApplicationLogSchema = z.object({
  timestamp:z.iso.datetime(),level:z.enum(["info","warn","error"]),
  event:z.enum(["operation_started","operation_committed","operation_failed","planner_completed","search_completed","request_failed"]),
  request_id:z.uuid(),workspace_id:z.uuid().nullable(),operation_id:z.uuid().nullable(),
  provider:z.enum(["kimi","dashscope","tesseract","mock","other"]).nullable(),
  error_code:z.enum(["TIMEOUT","RATE_LIMIT","INVALID_KEY","UNAVAILABLE","STRUCTURED_OUTPUT","NETWORK","CONTENT_TOO_LONG","STEP_LIMIT","CONFIGURATION","OPERATION_FAILED","CITATION_INVALID","VERIFICATION_REJECTED","VERIFIER_INVALID","CLAIM_LIMIT","INCOMPLETE_CLAIM_COVERAGE","INCOMPLETE_SUPPORT_COVERAGE","INCOMPLETE_UNIT_COVERAGE","OUTSIDE_VERIFIER_CONTEXT","INVALID_CONFLICT_CONTEXT"]).nullable(),
  duration:z.number().finite().min(0).max(86400000),
}).strict();
type LogInput = Omit<z.infer<typeof ApplicationLogSchema>,"timestamp">;
export async function applicationLog(input:LogInput, directory=resolve(".filemind","logs")) {
  const parsed=ApplicationLogSchema.safeParse({...input,timestamp:new Date().toISOString()});
  if(!parsed.success)return false; // Never echo invalid fields or raw errors.
  try {
    await withPathMutex(directory,async()=>{
      const root=await ensureStorageDirectory(directory),path=join(root,"application.jsonl");
      const size=await stat(/*turbopackIgnore: true*/ path).then(s=>s.size,()=>0);
      if(size>=1024*1024) {
        await rm(join(root,"application.3.jsonl"),{force:true});
        for(let n=2;n>=1;n--)await rename(join(root,`application.${n}.jsonl`),join(root,`application.${n+1}.jsonl`)).catch(error=>{if(error.code!=="ENOENT")throw error;});
        await rename(path,join(root,"application.1.jsonl"));
      }
      await appendFile(path,JSON.stringify(parsed.data)+"\n",{encoding:"utf8",mode:0o600});
    });
    return true;
  }catch{return false;} // Logging outages never pretend the business operation failed.
}
export function loggedProvider(name:string) {return ["kimi","dashscope","tesseract","mock"].includes(name)?name as "kimi"|"dashscope"|"tesseract"|"mock":"other" as const;}
