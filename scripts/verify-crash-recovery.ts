// Real process termination against a fresh, isolated PostgreSQL cluster. This
// script never uses DATABASE_URL or an existing PostgreSQL data directory.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { Client, Pool } from "pg";
import { applyMigrations } from "./migrate-database.mjs";
import { createOperationLease } from "./operation-lease.mjs";
import { startupRecovery } from "./startup-recovery.mjs";
import { runTenantQuery, runTenantTransaction } from "../src/lib/workspace/tenant-query";
import { PostgresWorkspaceRepository, type TransactionalTenantDatabase } from "../src/lib/workspace/postgres-repository";
import { PrivateFileStorage } from "../src/lib/workspace/private-file-storage";
import { BackupService } from "../src/lib/backup/service";
import { compatibility } from "../src/lib/backup/format";
import { RecoveryService } from "../src/lib/reliability/recovery";

const project = resolve(fileURLToPath(new URL("..", import.meta.url)));
function tenantDatabase(connectionString: string) {
  const pool = new Pool({ connectionString, max: 5 }), locks = new Pool({ connectionString, max: 5 });
  pool.on("error", () => {}); locks.on("error", () => {});
  const tenant: TransactionalTenantDatabase = {
    query: async (u,s,p) => runTenantQuery(await pool.connect(),u,s,p),
    transaction: async (u,w,r) => runTenantTransaction(await pool.connect(),u,w,r),
    withOperationLock: createOperationLease(locks),
  };
  return { tenant, close: () => Promise.all([pool.end(),locks.end()]) };
}
function contained(base: string, target: string) { const r=relative(resolve(base),resolve(target)); assert.ok(r && !r.startsWith("..") && !isAbsolute(r),"Drill target must stay in its disposable directory"); }
async function worker() {
  const connection = process.env.FILEMIND_DRILL_CONNECTION!, root=process.env.FILEMIND_DRILL_ROOT!, user=process.env.FILEMIND_DRILL_USER!, mode=process.env.FILEMIND_DRILL_MODE!;
  assert.ok(connection && root && user && ["published","before_commit","committed"].includes(mode));
  assert.ok(resolve(root).startsWith(resolve(tmpdir()) + "\\") || resolve(root).startsWith(resolve(tmpdir()) + "/"));
  const {tenant,close}=tenantDatabase(connection);
  const barrier=async () => { process.stdout.write("DRILL_BARRIER\n"); await new Promise<void>(()=>{setInterval(()=>{},10000);}); };
  try {
    await new BackupService(tenant,join(root,"storage"),compatibility(null)).import(user,await readFile(join(root,"fixture.filemind-backup")), {
      beforeCommit: mode==="before_commit" ? barrier : undefined,
      checkpoint: async (stage,progress) => { if (stage===mode && (stage==="committed" || progress>=0.3)) await barrier(); },
    });
    throw new Error("Worker reached end without barrier");
  } finally { await close(); }
}
async function command(exe: string,args: string[]) {
  const child=spawn(exe,args,{windowsHide:true,stdio:["ignore","pipe","pipe"]});
  let diagnostic=""; child.stdout.on("data",v=>{diagnostic+=v;}); child.stderr.on("data",v=>{diagnostic+=v;});
  const timer=setTimeout(()=>child.kill(),55000);
  try { await new Promise<void>((done,failed)=>{child.on("error",failed);child.on("exit",code=>code===0?done():failed(new Error("Isolated PostgreSQL command failed: " + diagnostic.slice(-900))));}); }
  finally { clearTimeout(timer); }
}
async function freePort() {
  const server=createServer(); await new Promise<void>(done=>server.listen(0,"127.0.0.1",done));
  const port=(server.address() as {port:number}).port; await new Promise<void>((done,failed)=>server.close(e=>e?failed(e):done())); return port;
}
async function main() {
  const root=await mkdtemp(join(tmpdir(),"filemind-crash-")), bin=join(project,".filemind/postgresql/runtime/pgsql/bin");
  const data=join(root,"postgresql"), password=randomBytes(32).toString("hex"), pwfile=join(root,"password.txt"), port=await freePort();
  const admin=new Client({host:"127.0.0.1",port,user:"filemind_drill_admin",password,database:"postgres"});
  let started=false, env: ReturnType<typeof tenantDatabase>|undefined, child: ChildProcess|undefined;
  const report={checkedAt:new Date().toISOString(),faultType:"real Windows process termination",isolatedDatabase:true,installationPath:"ASCII temporary directory",passed:false,checks:[] as Record<string,unknown>[]};
  try {
    await writeFile(pwfile,password,{mode:0o600});
    await command(join(bin,"initdb.exe"),["-D",data,"-U","filemind_drill_admin",`--pwfile=${pwfile}`,"--auth-host=scram-sha-256","--auth-local=scram-sha-256","--encoding=UTF8","--locale=C"]);
    await rm(pwfile); await command(join(bin,"pg_ctl.exe"),["start","-D",data,"-l",join(root,"postgresql.log"),"-o",`-h 127.0.0.1 -p ${port}`,"-w","-t","30"]); started=true;
    await admin.connect();
    const rolePassword=randomBytes(32).toString("hex");
    await admin.query(`create role filemind_drill_tenant login nosuperuser nocreatedb nocreaterole nobypassrls password '${rolePassword}'`);
    await admin.query("create database filemind_drill owner filemind_drill_tenant");
    const connection=`postgresql://filemind_drill_tenant:${rolePassword}@127.0.0.1:${port}/filemind_drill`;
    const migration=new Client({connectionString:connection}); await migration.connect();
    try { await applyMigrations(migration); } finally { await migration.end(); }
    env=tenantDatabase(connection);
    const repository=new PostgresWorkspaceRepository(env.tenant), user=randomUUID(), original=await repository.create(user,"Drill source");
    const documents=[],texts:Record<string,string>={},storage=new PrivateFileStorage(join(root,"storage"));
    for(let n=0;n<10;n++) {
      const id=randomUUID(),bytes=Buffer.from(`Synthetic recovery record ${n}: checkpoint ${100+n}.`);
      documents.push({id,name:`record-${n}.txt`,type:"txt" as const,mimeType:"text/plain",size:bytes.length,parseStatus:"completed" as const,contentHash:createHash("sha256").update(bytes).digest("hex"),storagePath:await storage.putOriginal({userId:user,workspaceId:original.id,documentId:id,extension:"txt",bytes}),metadata:{addedAt:new Date().toISOString()}});
      texts[id]=bytes.toString();
    }
    await repository.save(user,{...original,documents,texts});
    const backup=await new BackupService(env.tenant,join(root,"storage"),compatibility(null)).export(user);
    await writeFile(join(root,"fixture.filemind-backup"),backup.bytes,{mode:0o600});
    const priorHash=createHash("sha256").update(JSON.stringify(await repository.get(user,original.id))).digest("hex");
    for(const mode of ["published","before_commit","committed"]) {
      const target=randomUUID(),retained=await repository.create(target,"Existing target workspace");
      child=spawn(process.execPath,["--import","tsx",fileURLToPath(import.meta.url),"--worker"],{cwd:project,env:{...process.env,DATABASE_URL:"",FILEMIND_DRILL_CONNECTION:connection,FILEMIND_DRILL_ROOT:root,FILEMIND_DRILL_USER:target,FILEMIND_DRILL_MODE:mode},windowsHide:true,stdio:["ignore","pipe","pipe"]});
      let diagnostic="";
      await new Promise<void>((done,failed)=> {
        const timer=setTimeout(()=>{child?.kill();failed(new Error("Crash barrier timed out"));},45000);
        child!.stdout!.on("data",part=>{diagnostic+=part;if(diagnostic.includes("DRILL_BARRIER")){clearTimeout(timer);done();}});
        child!.on("error",error=>{clearTimeout(timer);failed(error);});
        child!.on("exit",()=>{clearTimeout(timer);failed(new Error("Worker exited before crash barrier"));});
      });
      const running=(await env.tenant.query(target,"select id,status,stage from filemind.operation_journal where user_id=$1",[target])).rows[0] as {id:string;status:string;stage:string};
      // While a real worker holds its lease, recovery must not take over.
      assert.equal((await new RecoveryService(env.tenant,join(root,"storage")).recover(target)).active,1);
      const killed=child; const ended=new Promise<void>(done=>killed.once("exit",()=>done())); assert.equal(killed.kill("SIGKILL"),true); await ended; child=undefined;
      const repaired=await startupRecovery([target],Pool,connection,join(root,"storage")); assert.equal(repaired.recovered,1);
      const rows=(await env.tenant.query(target,"select status,stage,payload from filemind.operation_journal where id=$1",[running.id])).rows[0] as {status:string;stage:string;payload:{quarantineIds?:string[]}};
      const count=(await env.tenant.query(target,"select count(*)::int as n from filemind.documents where user_id=$1",[target])).rows[0] as {n:number};
      assert.equal(count.n,mode==="committed"?10:0);
      assert.equal((await repository.get(target,retained.id)).name,retained.name);
      assert.equal(rows.status,mode==="committed"?"committed":"interrupted"); assert.equal(rows.stage,mode==="committed"?"settled":"recovered");
      assert.ok((rows.payload.quarantineIds?.length??0)>0);
      const reconciliation=await new RecoveryService(env.tenant,join(root,"storage")).reconcile(target);
      assert.equal(reconciliation.missing,0); assert.equal(reconciliation.orphan,0); assert.equal(reconciliation.referenced,mode==="committed"?10:0);
      assert.equal((await startupRecovery([target],Pool,connection,join(root,"storage"))).recovered,0);
      assert.equal(createHash("sha256").update(JSON.stringify(await repository.get(user,original.id))).digest("hex"),priorHash);
      report.checks.push({window:mode,pass:true,status:rows.status,visibleImportedDocuments:count.n,quarantineCount:rows.payload.quarantineIds!.length,repeatRecovery:0,originalOwnerUnchanged:true});
      process.stdout.write(`Crash recovery ${mode}: PASS\n`);
    }
    report.passed=true;
  } finally {
    child?.kill("SIGKILL"); await env?.close(); await admin.end().catch(()=>{});
    if(started) await command(join(bin,"pg_ctl.exe"),["stop","-D",data,"-m","fast","-w","-t","30"]);
    await mkdir(join(project,"docs/evaluation"),{recursive:true});
    await writeFile(join(project,"docs/evaluation/phase8-crash-results.json"),JSON.stringify(report,null,2)+"\n");
    contained(tmpdir(),root); await rm(root,{recursive:true,force:true});
  }
}
if(process.argv.includes("--worker")) worker().catch(()=>{console.error("Isolated crash worker failed.");process.exitCode=1;});
else main().catch(error=>{console.error(error instanceof Error?error.message:"Crash recovery verification failed.");process.exitCode=1;});
