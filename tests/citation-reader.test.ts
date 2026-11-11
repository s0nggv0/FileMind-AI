import { test } from "node:test";
import assert from "node:assert/strict";
import { isolatedKnowledge } from "./helpers/isolated-knowledge";
import { CitationReader } from "../src/lib/retrieval/citation-reader";
import { citationAnchor, citationLibraryURL, citationURL, parseCitationAnchor, returnToSearchURL } from "../src/lib/retrieval/citation-contract";
import { DocumentChunker, contentHash } from "../src/lib/retrieval/chunker";
import { SearchFailure } from "../src/lib/retrieval/search-failure";
import type { ParsedStructure } from "../src/lib/retrieval/types";

test("protected citation snapshots use saved positions for repeats, real PDF pages and paragraph/character locations", async () => {
  const f = await isolatedKnowledge();
  try {
    const userId = crypto.randomUUID(), workspace = await f.workspaces.create(userId, "Citation fixtures");
    const reader = new CitationReader(f.tenant);
    async function seed(fileType: "pdf" | "docx" | "txt" | "md" | "image", text: string, start: number, end: number, structure?: ParsedStructure) {
      const id = crypto.randomUUID();
      await f.tenant.query(userId, `insert into filemind.documents(id,user_id,workspace_id,original_name,display_name,file_type,mime_type,file_size,parse_status,metadata,text_content,content_hash)
        values($1,$2,$3,$4,$4,$5,'text/plain',30,'completed',$6,$7,$8)`, [id,userId,workspace.id,`fixture.${fileType}`,fileType,{structure},text,contentHash("original bytes")]);
      const base = new DocumentChunker().chunk({ id,userId,workspaceId:workspace.id,text,fileType,structure: fileType === "image" ? {knowledgeSections:[{charStart:0,charEnd:text.length,source:"ocr"}]} : undefined })[0];
      const source = { ...base,id:crypto.randomUUID(),content:text.slice(start,end),contentHash:contentHash(text.slice(start,end)),charStart:start,charEnd:end,chunkIndex:1,
        pageStart:fileType === "pdf" ? 7 : 99,pageEnd:fileType === "pdf" ? 7 : 99,paragraphStart:fileType === "docx" ? 3 : null,paragraphEnd:fileType === "docx" ? 3 : null,
        documentName:`fixture.${fileType}`,fileType,summary:"",tags:[],score:0,documentHash:contentHash("original bytes") };
      async function insert() { await f.tenant.query(userId, `insert into filemind.document_chunks(id,user_id,workspace_id,document_id,chunk_index,content,content_hash,char_start,char_end,token_estimate,chunk_version,page_start,page_end,paragraph_start,paragraph_end,chunk_source)
        values($1,$2,$3,$4,1,$5,$6,$7,$8,12,$9,$10,$11,$12,$13,$14)`, [source.id,userId,workspace.id,id,source.content,source.contentHash,start,end,source.chunkVersion,source.pageStart,source.pageEnd,source.paragraphStart,source.paragraphEnd,source.chunkSource]); }
      await insert(); return {source,id,insert};
    }
    const sentence = "Repeated cited sentence.";
    const text = `First context\n${sentence}\n${"intervening text ".repeat(80)}\nSecond context\n${sentence}\nFollowing context`;
    const start = text.lastIndexOf(sentence);
    for (const format of ["pdf","docx","txt","md","image"] as const) {
      const fixture = await seed(format,text,start,start+sentence.length,format === "pdf" ? {pages:[{page:2,charStart:0,charEnd:start-1},{page:7,charStart:start-1,charEnd:text.length}]} : undefined);
      const anchor = citationAnchor(fixture.source), preview = await reader.get(userId,anchor);
      assert.deepEqual(preview.citation!.range,{start,end:start+sentence.length});
      assert.equal(preview.citation!.before.endsWith("Second context\n"),true);
      assert.equal(preview.citation!.after,"\nFollowing context");
      assert.ok(preview.citation!.before.length<=400); assert.equal(preview.citation!.text,undefined);
      const full = await reader.get(userId,{...anchor,textVersion:preview.citation!.textVersion},"full");
      assert.equal(full.citation!.text!.slice(full.citation!.range!.start,full.citation!.range!.end),sentence);
      assert.ok(full.citation!.range!.start>text.indexOf(sentence));
      assert.equal(full.citation!.pdfPage,format==="pdf"?7:null);
      if(format==="docx")assert.match(full.citation!.label,/Paragraph 3/);
      if(format==="image")assert.match(full.citation!.label,/OCR/);
      const denied = (e:unknown) => e instanceof SearchFailure && e.reason==="SOURCES_CHANGED";
      await assert.rejects(reader.get(crypto.randomUUID(),anchor),denied);
      await assert.rejects(reader.get(userId,{...anchor,documentId:crypto.randomUUID()}),denied);
      for(const changed of [{contentHash:"old"},{chunkVersion:"old"},{charStart:0},{documentHash:"old"},{textVersion:"0".repeat(64)}]) await assert.rejects(reader.get(userId,{...anchor,...changed}),denied);
      const oldLink=await reader.get(userId,{chunkId:anchor.chunkId,documentId:anchor.documentId},"full");
      assert.equal(oldLink.citation!.status,"unavailable");assert.equal(oldLink.citation!.range,null);
      assert.equal(oldLink.citation!.pdfPage,null);
    }
    const missingPage=await seed("pdf",text,start,start+sentence.length);
    const noPage=await reader.get(userId,citationAnchor(missingPage.source));
    assert.equal(noPage.citation!.pdfPage,null);assert.match(noPage.citation!.label,/缺少可靠页码/);
    assert.equal(noPage.storageStatus,"not_stored");assert.equal(noPage.content,sentence);
    const anchor=citationAnchor(missingPage.source,noPage.citation!.textVersion);
    await f.tenant.query(userId,"update filemind.documents set text_content=text_content || ' Newly changed context' where id=$1",[missingPage.id]);
    await assert.rejects(reader.get(userId,anchor),SearchFailure);
    await missingPage.insert(); // Same cited text/position after a rebuild cannot reuse a full-body snapshot version.
    await assert.rejects(reader.get(userId,anchor),e=>e instanceof SearchFailure && e.status===409);
  } finally { await f.db.close(); }
});

test("citation deep links carry only bounded IDs, hashes and positions; return targets stay within search",()=>{
  const anchor={chunkId:crypto.randomUUID(),documentId:crypto.randomUUID(),contentHash:"a".repeat(64),chunkVersion:"chunk-v1",charStart:1200,charEnd:1300};
  const url=citationURL(anchor,"full"),run=crypto.randomUUID();
  assert.deepEqual(parseCitationAnchor(new URL(url,"http://localhost").searchParams),anchor);
  assert.equal(new URL(citationLibraryURL(anchor,run),"http://localhost").searchParams.get("run"),run);
  assert.match(returnToSearchURL(run,anchor.chunkId),/^\/search\?run=/);
  assert.throws(()=>returnToSearchURL("https://attacker.example/"));
  assert.throws(()=>parseCitationAnchor(new URLSearchParams({chunkId:anchor.chunkId,documentId:anchor.documentId,charStart:"-1"})));
});
