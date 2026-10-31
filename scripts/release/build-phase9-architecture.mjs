import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
const version=JSON.parse(await readFile('package.json','utf8')).version;
const layers = [
 ['Frontend', 'Next.js / React / TypeScript - Workspace, Library, Search, Graph, Settings'],
 ['FileMind Agent + Tool Registry', 'Plan -> bounded tools -> Review -> Apply'],
 ['Document Pipeline', 'PDF / DOCX / TXT / Markdown / images - originals retained'],
 ['AI Services', 'Kimi text | Kimi Vision | Tesseract local OCR | DashScope Embedding'],
 ['Knowledge Layer', 'Chunking -> Adaptive Retrieval -> RAG -> source citations'],
 ['Data Layer', 'PostgreSQL | PrivateFileStorage | PortableVectorStore'],
 ['Safety + Recovery', 'Human review | prompt-injection boundaries | fact gate | backup | recovery'],
];
const out=resolve('docs/competition');
const boxes=layers.map(([name,detail],i)=>{const y=117+i*94;return `<rect x="48" y="${y}" width="1004" height="76" rx="9" fill="${i%2?'#edf2ea':'#ffffff'}" stroke="#b5c6bc"/><text x="72" y="${y+29}" font-size="20" font-weight="600" fill="#17685b">${name.replaceAll('&','&amp;')}</text><text x="72" y="${y+55}" font-size="15" fill="#34463e">${detail.replaceAll('&','&amp;').replaceAll('->','&#8594;')}</text>${i<6?`<path d="M550 ${y+79}v11m-4-4 4 4 4-4" fill="none" stroke="#17685b" stroke-width="2"/>`:''}`;}).join('');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="830" viewBox="0 0 1100 830"><rect width="1100" height="830" fill="#fbfaf6"/><g font-family="Arial, sans-serif"><text x="48" y="47" font-size="13" fill="#66716b">FILEMIND AI / ARCHITECTURE / v${version}</text><text x="48" y="84" font-size="29" fill="#17685b">From personal files to evidence-backed answers</text>${boxes}<text x="48" y="804" font-size="13" fill="#66716b">Originals preserved. Answers checked before release. See dated acceptance records.</text></g></svg>`;
await writeFile(out+'/architecture.svg',svg);await sharp(Buffer.from(svg)).png().toFile(out+'/architecture.png');
console.log('One-page SVG and PNG generated; no AI calls.');
