import { createWorker, OEM } from "tesseract.js";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { cp, mkdir } from "node:fs/promises";
import { OCRResultSchema } from "./schemas";
import type { ImageInput, OCRProvider } from "./provider";
const requireLocal = createRequire(import.meta.url);
let languagePathPromise: Promise<string> | undefined;
function prepareLanguages() {
  languagePathPromise ??= (async () => {
    const directory = resolve(".filemind/ocr/languages"); await mkdir(directory, { recursive: true });
    for (const code of ["eng", "chi_sim"]) await cp(join(dirname(requireLocal.resolve(`@tesseract.js-data/${code}/package.json`)), "4.0.0_best_int", `${code}.traineddata.gz`), join(directory, `${code}.traineddata.gz`));
    return directory;
  })();
  return languagePathPromise;
}
export class PortableOCRProvider implements OCRProvider {
  getEngineInfo() { return { engine: "tesseract.js", version: "7-eng-chi_sim-4.0.0_best_int" }; }
  async extractText(image: ImageInput, signal: AbortSignal) {
    signal.throwIfAborted();
    // Bundled compressed language bytes eliminate runtime network downloads.
    const worker = await createWorker("eng+chi_sim", OEM.LSTM_ONLY, {
      langPath: await prepareLanguages(),
      workerPath: requireLocal.resolve("tesseract.js/src/worker-script/node/index.js"),
      corePath: dirname(requireLocal.resolve("tesseract.js-core/package.json")), cacheMethod: "none", logger: () => {},
    });
    const abort = () => { void worker.terminate(); }; signal.addEventListener("abort", abort, { once: true });
    try {
      signal.throwIfAborted();
      const { data } = await worker.recognize(Buffer.from(image.bytes), {}, { text: true, blocks: true });
      signal.throwIfAborted();
      return OCRResultSchema.parse({ text: data.text.slice(0, 180000), confidence: Math.max(0, Math.min(1, data.confidence / 100)),
        blocks: (data.blocks ?? []).slice(0, 10000).map(block => ({ text: block.text, confidence: Math.max(0, Math.min(1, block.confidence / 100)),
          box: { x: block.bbox.x0, y: block.bbox.y0, width: block.bbox.x1 - block.bbox.x0, height: block.bbox.y1 - block.bbox.y0 },
        })),
      });
    } finally { signal.removeEventListener("abort", abort); await worker.terminate().catch(() => {}); }
  }
}
