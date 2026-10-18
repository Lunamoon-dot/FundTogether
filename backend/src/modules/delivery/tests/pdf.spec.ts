import { PDFDocument } from "pdf-lib";
import { validatePdf } from "../policies/pdf";

describe("Final PDF structural validation", () => {
  let bytes: Buffer;
  beforeAll(async () => { const pdf = await PDFDocument.create(); pdf.addPage().drawText("A local comic proof"); bytes = Buffer.from(await pdf.save()); });
  it("opens a real PDF without changing its bytes", async () => {
    const copy = Buffer.from(bytes);
    await expect(validatePdf(bytes)).resolves.toBeUndefined();
    expect(bytes).toEqual(copy);
  });
  it.each([Buffer.from("%PDF-1.7\nnot a document\n%%EOF"), Buffer.from("not a PDF")])("rejects spoofed or broken documents", async value => {
    await expect(validatePdf(value)).rejects.toMatchObject({ status: 400 });
  });
  it("rejects truncated content", async () => {
    await expect(validatePdf(bytes.subarray(0, bytes.length - 15))).rejects.toMatchObject({ status: 400 });
  });
});
