import { spawn } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { prepareEnvironment,startEnvironment,disposeEnvironment,projectRoot } from "./phase8-environment.mjs";
let environment;
try {
  const live=process.argv.includes("--live");environment=await prepareEnvironment({live});
  await appendFile(join(environment.root,".env.local"),"DEMO_MODE=true\n");await startEnvironment(environment);
  console.log(`Starting dedicated demo browser acceptance (${live?"real configured providers":"mock laboratory; no AI quality claim"}).`);
  const child=spawn(process.execPath,[join(projectRoot,"node_modules/@playwright/test/cli.js"),"test","--config","playwright.demo.config.ts"],{cwd:projectRoot,windowsHide:true,stdio:"inherit",env:{...process.env,FILEMIND_TEST_ROOT:environment.root,FILEMIND_TEST_ORIGIN:environment.origin,FILEMIND_DEMO_LIVE:String(live)}});
  const code=await new Promise((done,reject)=>{child.once("error",reject);child.once("exit",done);});if(code!==0)process.exitCode=1;
}finally{if(environment)await disposeEnvironment(environment);}
