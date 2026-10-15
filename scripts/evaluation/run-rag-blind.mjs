import { spawn } from "node:child_process";
import { join } from "node:path";
import { prepareEnvironment,startEnvironment,disposeEnvironment,projectRoot } from "../shared/phase8-environment.mjs";
let environment;
try {
  environment=await prepareEnvironment({live:true});await startEnvironment(environment);
  console.log("Formal Blind Run #1: frozen sources and fresh empty PostgreSQL; immutable outputs are reserved before indexing.");
  const child=spawn(process.execPath,[join(projectRoot,"node_modules/tsx/dist/cli.mjs"),join(projectRoot,"scripts/evaluation/evaluate-rag-blind.ts"),"--live"],{cwd:environment.root,windowsHide:true,stdio:"inherit",env:{...process.env,FILEMIND_TEST_ROOT:environment.root}});
  const code=await new Promise((done,reject)=>{child.once("error",reject);child.once("exit",done);});if(code!==0)process.exitCode=1;
}finally{if(environment)await disposeEnvironment(environment);}
