import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {holdoutDocuments,holdoutImages,holdoutQueries} from "./fixtures/rag-holdout/corpus";
import {hardTextDocuments} from "./fixtures/rag-hard/corpus";
test("independent holdout has frozen real files, required types, unique labels and no reused Phase 6 text",async()=>{
 const freeze=JSON.parse(await readFile("tests/fixtures/rag-holdout/freeze.json","utf8"));
 assert.equal(holdoutDocuments.length+holdoutImages.length,50);assert.equal(holdoutImages.length,8);assert.equal(holdoutQueries.length,100);
 const names=new Set([...holdoutDocuments.map(d=>d.name),...holdoutImages.map(d=>d[0])]);assert.equal(names.size,50);
 assert.equal(new Set(holdoutQueries.map(q=>q.id)).size,100);
 for(const query of holdoutQueries)for(const name of query.expected)assert.ok(names.has(name));
 for(const type of ["semantic","exact","mixed","cross-language","hard-negative","multimodal","no-answer","filename","code","identifier","multi-document"])assert.ok(holdoutQueries.some(q=>q.kind===type),type);
 assert.ok(holdoutDocuments.every(d=>!hardTextDocuments.some(old=>old.text===d.text)));
 for(const ext of ["txt","md","docx","pdf"])assert.ok(holdoutDocuments.some(d=>d.name.endsWith(`.${ext}`)));
 for(const [name,hash]of Object.entries(freeze.files))assert.equal(createHash("sha256").update(await readFile(`tests/fixtures/rag-holdout/files/${name}`)).digest("hex"),hash);
});
