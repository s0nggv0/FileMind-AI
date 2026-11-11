import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import sharp from "sharp";
const sha=(bytes:Buffer|string)=>createHash("sha256").update(bytes).digest("hex");
test("blind corpus was created after code freeze and immutable raw formats and all relevance labels agree",async()=>{
  const root="tests/fixtures/rag-blind",algorithm=await readFile("docs/evaluation/phase8-algorithm-freeze.json","utf8"),freeze=JSON.parse(await readFile(`${root}/freeze.json`,"utf8")),manifest=await readFile(`${root}/manifest.json`),questions=await readFile(`${root}/queries.json`),documents=JSON.parse(manifest.toString()).documents as {name:string;sha256:string;group:string}[],queries=JSON.parse(questions.toString()) as {id:string;expected:string[];answerability:string;parent?:string}[];
  assert.equal(freeze.algorithmFreezeHash,sha(algorithm.replaceAll("\r\n","\n")));assert.equal(freeze.manifestHash,sha(manifest));assert.equal(freeze.queryHash,sha(questions));assert.ok(new Date(JSON.parse(manifest.toString()).createdAt)>new Date(JSON.parse(algorithm).frozenAt));
  assert.equal(documents.length,90);assert.equal(new Set(documents.map(d=>d.name)).size,90);assert.equal(documents.filter(d=>d.group==="image").length,18);assert.equal(documents.filter(d=>d.group==="tricky").length,9);assert.equal(queries.length,180);assert.equal(new Set(queries.map(q=>q.id)).size,180);assert.equal(queries.filter(q=>q.answerability==="no-answer").length,36);
  const oldHashes=new Set(await Promise.all((await readdir("tests/fixtures/rag-holdout/files")).map(async name=>sha(await readFile(`tests/fixtures/rag-holdout/files/${name}`))))),names=new Set(documents.map(d=>d.name));
  for(const d of documents){const bytes=await readFile(`${root}/files/${d.name}`);assert.equal(sha(bytes),d.sha256);assert.equal(oldHashes.has(d.sha256),false);if(d.group==="image"){const info=await sharp(bytes).metadata();assert.ok(info.width!>=1400&&info.height!>=900);assert.ok(info.format==="png"||info.format==="jpeg");}}
  const seen=new Set<string>();for(const q of queries){assert.ok(q.expected.every(name=>names.has(name)));if(q.parent)assert.ok(seen.has(q.parent));seen.add(q.id);}
  assert.deepEqual(new Set(documents.map(d=>d.name.split(".").at(-1))),new Set(["pdf","docx","md","txt","png","jpg"]));
});
