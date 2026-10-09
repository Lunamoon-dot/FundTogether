const { deflateSync } = require('node:zlib');
// Minimal valid documents for transport/integrity checks, not labelled reviewer evidence.
function pdf(text) {
  const escaped = text.replace(/[\\()]/g, c => `\\${c}`);
  const stream = `BT /F1 12 Tf 40 760 Td (${escaped}) Tj ET\n`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`];
  let body = '%PDF-1.7\n', offsets = [0];
  objects.forEach((o, i) => { offsets.push(Buffer.byteLength(body)); body += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
}
function crc(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); }
  return (c ^ 0xffffffff) >>> 0;
}
function png() {
  const chunk = (kind, data) => {
    const head = Buffer.from(kind), length = Buffer.alloc(4), checksum = Buffer.alloc(4);
    length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc(Buffer.concat([head, data])));
    return Buffer.concat([length, head, data, checksum]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr),
    chunk('tEXt', Buffer.from('Description\0SYNTHETIC FORMAT PROBE - not an activity photo')),
    chunk('IDAT', deflateSync(Buffer.from([0, 128, 160, 192]))), chunk('IEND', Buffer.alloc(0))]);
}
module.exports = { pdf, png };
