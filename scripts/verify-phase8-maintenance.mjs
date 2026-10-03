import { spawn } from "node:child_process";
import { join } from "node:path";
import { prepareEnvironment, startEnvironment, disposeEnvironment, projectRoot } from "./phase8-environment.mjs";
let environment;
try {
  environment=await prepareEnvironment();
  console.log("Starting isolated PostgreSQL maintenance acceptance without provider credentials.");
  await startEnvironment(environment);
  const child=spawn(process.execPath,[join(projectRoot,"node_modules/@playwright/test/cli.js"),"test","--config","playwright.reliability.config.ts"],{cwd:projectRoot,windowsHide:true,stdio:"inherit",env:{...process.env,FILEMIND_TEST_ROOT:environment.root,FILEMIND_TEST_ORIGIN:environment.origin}});
  const code=await new Promise((done,reject)=>{child.once("error",reject);child.once("exit",done);});
  if(code!==0)process.exitCode=1;
}finally{if(environment)await disposeEnvironment(environment);}
