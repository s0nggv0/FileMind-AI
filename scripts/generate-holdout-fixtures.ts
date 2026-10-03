import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import { holdoutDocuments, holdoutImages, holdoutQueries } from "../tests/fixtures/rag-holdout/corpus";
const root = "tests/fixtures/rag-holdout";
const escape = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
export function syntheticPdf(text: string) {
  const words = text.replaceAll("\n", " ").split(" "); const lines: string[] = []; let line = "";
  for (const word of words) { if (line.length + word.length > 80) { lines.push(line); line = ""; } line += `${line ? " " : ""}${word}`; } if (line) lines.push(line);
  const quote = (s: string) => s.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
  const stream = `BT /F1 11 Tf 40 750 Td 16 TL ${lines.map((s,i) => `${i ? "T* " : ""}(${quote(s)}) Tj`).join("\n")} ET`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let result = "%PDF-1.4\n"; const offsets: number[] = [];
  objects.forEach((object,i) => { offsets.push(Buffer.byteLength(result)); result += `${i+1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(result);
  result += `xref\n0 6\n0000000000 65535 f \n${offsets.map(o=>`${String(o).padStart(10,"0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(result);
}
export function syntheticDocx(text: string) {
  return Buffer.from(zipSync({
    "[Content_Types].xml": strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    "_rels/.rels": strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    "word/document.xml": strToU8(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${text.split("\n\n").map(p=>`<w:p><w:r><w:t xml:space="preserve">${escape(p)}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`),
  }));
}
export async function generateHoldoutFixtures() {
  if (existsSync(`${root}/freeze.json`)) throw new Error("Holdout already frozen; do not regenerate or retune it.");
  await mkdir(`${root}/files`, {recursive:true});
  for (const d of holdoutDocuments) await writeFile(`${root}/files/${d.name}`, d.name.endsWith("pdf") ? syntheticPdf(d.text) : d.name.endsWith("docx") ? syntheticDocx(d.text) : d.text);
  const browser = await chromium.launch({ headless:true, executablePath:"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
  try {
    const page = await browser.newPage({viewport:{width:1200,height:760}});
    for (const [name,title,lines] of holdoutImages) {
      await page.setContent(`<html><meta charset="utf-8"><style>body{margin:0;padding:65px;background:#f6f7f3;color:#17372e;font:29px Arial,'Microsoft YaHei',sans-serif}h1{font-size:43px;margin:0 0 40px}p{line-height:1.8;padding:14px 0;border-bottom:1px solid #ccd7d0}footer{font-size:18px;color:#526b60;margin-top:40px}</style><h1>${escape(title)}</h1>${lines.map(l=>`<p>${escape(l)}</p>`).join("")}<footer>Original synthetic Phase 7 holdout specimen</footer></html>`);
      await page.screenshot({path:resolve(root,"files",name)});
    }
  } finally {await browser.close();}
  const files: Record<string,string> = {};
  for (const name of (await readdir(`${root}/files`)).sort()) files[name]=createHash("sha256").update(await readFile(`${root}/files/${name}`)).digest("hex");
  const algorithm: Record<string,string> = {};
  for (const path of ["src/lib/retrieval/query-analyzer.ts","src/lib/retrieval/retrieval-router.ts","src/lib/retrieval/engine.ts","src/lib/retrieval/evidence-sufficiency.ts","src/lib/retrieval/rag.ts","src/lib/retrieval/config.ts","src/lib/retrieval/ranking.ts"]) algorithm[path]=createHash("sha256").update((await readFile(path,"utf8")).replaceAll("\r\n","\n")).digest("hex");
  await writeFile(`${root}/freeze.json`, JSON.stringify({frozenAt:new Date().toISOString(),documents:holdoutDocuments.length+holdoutImages.length,images:holdoutImages.length,queries:holdoutQueries.length,corpusHash:createHash("sha256").update((await readFile(`${root}/corpus.ts`,"utf8")).replaceAll("\r\n","\n")).digest("hex"),files,algorithm,noTuningRule:"One final live evaluation. Infrastructure retries must reuse the frozen corpus and algorithm; no quality-driven changes or repeated sampling."},null,2)+"\n");
  console.log(`Frozen ${holdoutDocuments.length+holdoutImages.length} sources, ${holdoutQueries.length} queries, ${holdoutImages.length} images.`);
}
if (process.argv[1] && resolve(process.argv[1])===resolve("scripts/generate-holdout-fixtures.ts")) void generateHoldoutFixtures();
