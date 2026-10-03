import {zipSync,strToU8} from "fflate";
// Small synthetic fixtures, not copies of third-party documents.
export function syntheticPdf(text:string) {
  if(/[^\x00-\x7f]/.test(text))throw new Error("This fixture PDF writer accepts ASCII text only");
  const lines:string[]=[];let line="";for(const word of text.replaceAll("\n"," ").split(" ")){if(line.length+word.length>80){lines.push(line);line="";}line+=`${line?" ":""}${word}`;}if(line)lines.push(line);
  if(lines.length>42)throw new Error("Single-page fixture exceeds its printable region");
  const quote=(s:string)=>s.replaceAll("\\","\\\\").replaceAll("(","\\(").replaceAll(")","\\)");
  const stream=`BT /F1 11 Tf 40 750 Td 16 TL ${lines.map((s,i)=>`${i?"T* ":""}(${quote(s)}) Tj`).join("\n")} ET`;
  const objects=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>","<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let result="%PDF-1.4\n";const offsets:number[]=[];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(result));result+=`${i+1} 0 obj\n${o}\nendobj\n`;});const xref=Buffer.byteLength(result);
  result+=`xref\n0 6\n0000000000 65535 f \n${offsets.map(o=>`${String(o).padStart(10,"0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return Buffer.from(result);
}
export const escapeXML=(s:string)=>s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
export function syntheticDocx(text:string) {
  return Buffer.from(zipSync({
    "[Content_Types].xml":strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    "_rels/.rels":strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    "word/document.xml":strToU8(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${text.split("\n\n").map(p=>`<w:p><w:r><w:t xml:space="preserve">${escapeXML(p)}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`),
  }));
}
