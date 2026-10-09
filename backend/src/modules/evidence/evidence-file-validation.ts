import { BadRequestException } from "@nestjs/common";
const { fileTypeFromBuffer } = require("file-type") as {
  fileTypeFromBuffer: (buffer: Uint8Array) => Promise<{ mime: string } | undefined>;
};
export const MAX_EVIDENCE_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_EVIDENCE_FILES = 20;
export interface EvidenceUploadFile { buffer: Buffer; originalname: string; mimetype: string; }
export async function validateEvidenceFile(file?: EvidenceUploadFile) {
  if (!file?.buffer.length || file.buffer.length > MAX_EVIDENCE_FILE_BYTES)
    throw new BadRequestException("File must be between 1 byte and 10 MiB");
  let detected;
  try { detected = await fileTypeFromBuffer(file.buffer); } catch { /* Invalid header. */ }
  if (!detected || !["application/pdf", "image/jpeg", "image/png"].includes(detected.mime) || detected.mime !== file.mimetype)
    throw new BadRequestException("File content must match its PDF/JPEG/PNG media type");
  return detected.mime as "application/pdf" | "image/jpeg" | "image/png";
}
