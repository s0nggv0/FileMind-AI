import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prepareEnvironment,startEnvironment,disposeEnvironment,projectRoot,freePort } from "../shared/phase8-environment.mjs";
let environment;
try {
  environment=await prepareEnvironment({live:true});await startEnvironment(environment);
  console.log("Checking synthetic demo readiness against a freshly initialized, empty acceptance database.");
  const child=spawn(process.execPath,[join(projectRoot,"node_modules/tsx/dist/cli.mjs"),join(projectRoot,"scripts/verification/demo-check.ts")],{cwd:environment.root,windowsHide:true,stdio:"inherit",env:{...process.env,FILEMIND_DEMO_CHECK_ROOT:environment.root,PORT:String(await freePort())}});
  const code=await new Promise((done,reject)=>{child.once("error",reject);child.once("exit",done);});
  const report=JSON.parse(await readFile(join(environment.root,".filemind/diagnostics/demo-preflight.json"),"utf8"));report.build=JSON.parse(await readFile(join(environment.root,".next/standalone/build-info.json"),"utf8"));
  await writeFile(join(projectRoot,process.env.FILEMIND_PREFLIGHT_REPORT||"docs/evaluation/phase8-demo-preflight.json"),JSON.stringify(report,null,2)+"\n");
  if(code!==0)process.exitCode=1;
}finally{if(environment)await disposeEnvironment(environment);}
