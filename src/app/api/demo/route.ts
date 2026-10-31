import { competitionMode } from "@/lib/competition";
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { zipSync } from "fflate";
import { z } from "zod";
import { getUserId, issueIdentityCookie } from "@/lib/server/identity";
import { recoveryService } from "@/lib/server/reliability";
import { persistenceConfigured } from "@/lib/server/database";
import { apiError, sameOrigin, readJSON } from "@/lib/server/http";
import { DemoWorkspaceService } from "@/lib/reliability/demo-workspace";
import { WorkspaceError } from "@/lib/workspace/authorization";
const headers={"cache-control":"private, no-store"};
function enabled(){return process.env.DEMO_MODE==="true" || competitionMode();}
function service(){if(!enabled()||!persistenceConfigured())throw new WorkspaceError("NOT_FOUND","当前未启用演示模式。",404);return new DemoWorkspaceService(recoveryService());}
export async function GET(request:Request) {
  try {
    if(!enabled())return Response.json({enabled:false},{headers});
    const demo=service();
    if(new URL(request.url).searchParams.get("download")==="fixtures") {
      // Fixed bundled manifest; no caller-controlled filesystem path.
      // next-turbopack-ignore
      const root=resolve("tests/fixtures/demo");
      const manifest=z.object({files:z.array(z.object({name:z.string().regex(/^[a-z0-9-]+\.(pdf|docx|md|txt|png|jpg)$/),sha256:z.string().regex(/^[a-f0-9]{64}$/),bytes:z.number().int().max(3_000_000),recommended:z.boolean()})).max(12)}).parse(JSON.parse(await readFile(join(root,"manifest.json"),"utf8")));
      const files:Record<string,Uint8Array>={};
      for(const file of manifest.files.filter(f=>f.recommended)){const bytes=await readFile(join(root,"files",file.name));if(bytes.length!==file.bytes||createHash("sha256").update(bytes).digest("hex")!==file.sha256)throw new Error("DEMO_FIXTURE_CHANGED");files[file.name]=bytes;}
      return new Response(Buffer.from(zipSync(files)),{headers:{...headers,"content-type":"application/zip","content-disposition":"attachment; filename=FileMind-demo-fixtures.zip"}});
    }
    return Response.json({enabled:true,...await demo.status(await getUserId())},{headers});
  }catch(error){return apiError(error);}
}
export async function POST(request:Request) {
  try {
    sameOrigin(request);const demo=service();
    const body=z.discriminatedUnion("action",[z.object({action:z.literal("open")}).strict(),z.object({action:z.literal("reset"),workspaceId:z.uuid(),confirm:z.literal("RESET_DEMO_WORKSPACE")}).strict()]).parse(await readJSON(request,1024));
    if(body.action==="open"){const identity=await demo.open();await issueIdentityCookie(identity.userId);return Response.json({workspaceId:identity.workspaceId},{headers});}
    const user=await getUserId();if(!user)throw new WorkspaceError("NOT_FOUND","演示工作区不存在。",404);
    await demo.reset(user,body.workspaceId,body.confirm);return Response.json({workspaceId:body.workspaceId,reset:true},{headers});
  }catch(error){return apiError(error);}
}
