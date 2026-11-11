// Production HTTP/UI with a deliberately unavailable disposable database URL.
// No database server is stopped and no existing credentials or originals are used.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes,randomUUID } from "node:crypto";
import { mkdir,writeFile,rm } from "node:fs/promises";
import { join,relative,isAbsolute } from "node:path";
import { chromium,expect } from "@playwright/test";
import { freePort,projectRoot } from "../shared/phase8-environment.mjs";
const port=await freePort(),closedPort=await freePort(),origin=`http://127.0.0.1:${port}`,root=join(projectRoot,"artifacts",`phase8-outage-${randomUUID()}`);
await mkdir(root,{recursive:true});
const server=spawn(process.execPath,[join(projectRoot,".next/standalone/server.js")],{cwd:root,windowsHide:true,stdio:"ignore",env:{...process.env,HOSTNAME:"127.0.0.1",PORT:String(port),DATABASE_URL:`postgresql://synthetic:synthetic@127.0.0.1:${closedPort}/synthetic`,WORKSPACE_SESSION_SECRET:randomBytes(32).toString("hex"),WORKSPACE_COOKIE_SECURE:"false",WORKSPACE_ORIGIN:origin,AI_ENGINE:"mock",KIMI_API_KEY:"",DASHSCOPE_API_KEY:"",FILE_STORAGE_ROOT:join(root,"storage")}});
const finished=new Promise(done=>server.once("exit",done));let browser;
const report={passed:false,mode:"real production HTTP/UI with refused loopback database connection",existingDatabaseTouched:false,externalCalls:0,checks:{},checkedAt:new Date().toISOString()};
try{
  let ready=false;for(let n=0;n<80;n++){try{if((await fetch(origin+"/api/workspace-config")).ok){ready=true;break;}}catch{}await new Promise(done=>setTimeout(done,250));}assert.ok(ready);
  browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_BROWSER_EXECUTABLE||"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",headless:true});
  const context=await browser.newContext(),page=await context.newPage();
  const created=await context.request.post(origin+"/api/workspaces",{headers:{origin},data:{name:"Synthetic outage test"}});
  assert.equal(created.status(),503);assert.deepEqual(await created.json(),{error:"Workspace storage is temporarily unavailable.",code:"UNAVAILABLE"});report.checks.noFalseSave=true;
  const search=await context.request.post(origin+"/api/search",{headers:{origin},data:{query:"synthetic",mode:"find"}});assert.equal(search.status(),503);report.checks.searchExplicit503=true;
  await page.goto(origin+"/library");await expect(page.getByText("这个页面暂时无法打开",{exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"重新加载",exact:true})).toBeVisible();await expect(page.getByRole("link",{name:"Dashboard",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"重新加载",exact:true}).click();await expect(page.getByText("这个页面暂时无法打开",{exact:true})).toBeVisible();report.checks.routeRetryWithoutStack=true;
  const body=await page.locator("body").innerText();assert.doesNotMatch(body,/ECONNREFUSED|postgresql:\/\/|at .*\.js/);
  // Authenticated Settings also runs startup recovery before rendering. With
  // the database down, its route boundary is the correct visible fallback.
  await page.goto(origin+"/settings");await expect(page.getByText("这个页面暂时无法打开",{exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"重新加载",exact:true})).toBeVisible();report.checks.settingsRouteUnavailableWithRetry=true;
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);report.checks.mobileNoBlankOrOverflow=true;
  report.passed=true;console.log("Database outage HTTP 503 and recovery UI: PASS");
}catch{report.errorCode="ACCEPTANCE_FAILED";process.exitCode=1;console.error("Database outage HTTP/UI acceptance failed.");}
finally{
  await browser?.close();server.kill();await finished;
  const rel=relative(join(projectRoot,"artifacts"),root);assert.ok(rel&&!rel.startsWith("..")&&!isAbsolute(rel));await rm(root,{recursive:true,force:true});
  await writeFile(join(projectRoot,"docs/evaluation/phase8-database-outage.json"),JSON.stringify(report,null,2)+"\n");
}
