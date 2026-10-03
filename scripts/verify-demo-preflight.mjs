import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prepareEnvironment,startEnvironment,disposeEnvironment,projectRoot,freePort } from "./phase8-environment.mjs";
let environment;
try {
  environment=await prepareEnvironment({live:true});await startEnvironment(environment);
  console.log("Checking synthetic demo readiness against a freshly initialized, empty acceptance database.");
  const child=spawn(process.execPath,[join(projectRoot,"node_modules/tsx/dist/cli.mjs"),join(projectRoot,"scripts/demo-check.ts")],{cwd:environment.root,windowsHide:true,stdio:"inherit",env:{...process.env,FILEMIND_DEMO_CHECK_ROOT:environment.root,PORT:String(await freePort())}});
  const code=await new Promise((done,reject)=>{child.once("error",reject);child.once("exit",done);});
  const report=await readFile(join(environment.root,".filemind/diagnostics/demo-preflight.json"),"utf8");
  await writeFile(join(projectRoot,"docs/evaluation/phase8-demo-preflight.json"),report);
  if(code!==0)process.exitCode=1;
}finally{if(environment)await disposeEnvironment(environment);}
