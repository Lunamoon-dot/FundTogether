import { PDFDocument } from "pdf-lib";
import { validateEditionsPdf } from "./reward-editions-pdf";

describe("Final PDF structural validation", () => {
  let bytes: Buffer;
  beforeAll(async () => { const pdf = await PDFDocument.create(); pdf.addPage().drawText("A local comic proof"); bytes = Buffer.from(await pdf.save()); });
  it("opens a real PDF without changing its bytes", async () => {
    const copy = Buffer.from(bytes);
    await expect(validateEditionsPdf(bytes)).resolves.toBeUndefined();
    expect(bytes).toEqual(copy);
  });
  it.each([Buffer.from("%PDF-1.7\nnot a document\n%%EOF"), Buffer.from("not a PDF")])("rejects spoofed or broken documents", async value => {
    await expect(validateEditionsPdf(value)).rejects.toMatchObject({ status: 400 });
  });
  it("rejects truncated content", async () => {
    await expect(validateEditionsPdf(bytes.subarray(0, bytes.length - 15))).rejects.toMatchObject({ status: 400 });
  });
});
