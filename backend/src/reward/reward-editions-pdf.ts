import { BadRequestException } from "@nestjs/common";
import { Worker } from "node:worker_threads";

// Parse untrusted PDFs off the API thread with bounded memory/time. This validates
// structure/openability, not visual quality or authorship; Resolver still reviews the file.
export async function validateEditionsPdf(bytes: Buffer) {
  if (!bytes.subarray(0, 8).toString("ascii").startsWith("%PDF-") || !/%%EOF\s*$/.test(bytes.subarray(-1024).toString("ascii")))
    throw new BadRequestException("A complete, unencrypted PDF is required");
  await new Promise<void>((resolve, reject) => {
    const worker = new Worker(`
      const { parentPort, workerData } = require('node:worker_threads');
      const { PDFDocument } = require(workerData.library);
      PDFDocument.load(workerData.bytes, { ignoreEncryption: false, throwOnInvalidObject: true, updateMetadata: false })
        .then(pdf => {
          const pages = pdf.getPages();
          if (!pages.length || pdf.isEncrypted || pages.some(page => {
            const size = page.getSize();
            return !Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0;
          })) throw new Error('Invalid pages');
          parentPort.postMessage(true);
        }).catch(() => parentPort.postMessage(false));
    `, { eval: true, workerData: { bytes, library: require.resolve("pdf-lib") }, resourceLimits: { maxOldGenerationSizeMb: 64 } });
    const fail = () => reject(new BadRequestException("PDF cannot be opened within the local file limits; check encryption or corruption"));
    const timer = setTimeout(() => { void worker.terminate(); fail(); }, 5000);
    worker.once("message", valid => { clearTimeout(timer); void worker.terminate(); valid ? resolve() : fail(); });
    worker.once("error", () => { clearTimeout(timer); fail(); });
    worker.once("exit", () => { clearTimeout(timer); fail(); });
  });
}
