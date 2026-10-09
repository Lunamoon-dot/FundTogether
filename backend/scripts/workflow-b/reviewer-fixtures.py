"""Render new neutral-ID review inputs; historical authored data stays unchanged.

Requires reportlab, pillow and pypdf. No network, wallet or database writes.
These are fictional sources and illustrations, never field photographs.
"""
import csv
import hashlib
import json
import random
from pathlib import Path
from xml.sax.saxutils import escape

from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parents[3]
OUTPUT = ROOT / '.local/workflow-b/reviewer-corpus-v3'
HISTORY = ROOT / 'docs/examples/fixtures/workflow-b'
read = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
sha = lambda b: '0x' + hashlib.sha256(b).hexdigest()
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='SmallCopy', fontName='Helvetica', fontSize=9, leading=13, textColor=colors.HexColor('#334155')))
styles.add(ParagraphStyle(name='TableCopy', fontName='Helvetica', fontSize=9, leading=13))


def json_file(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def money(value):
    n = int(value)
    return f'{n // 1_000_000:,}.{n % 1_000_000:06d} USDC ({n} base units)'


def printable(value):
    if isinstance(value, list):
        return ', '.join(map(str, value)) if value else '(none recorded)'
    if isinstance(value, bool):
        return 'Yes' if value else 'No'
    return str(value)


def paragraph(text, style='TableCopy'):
    return Paragraph(escape(str(text)), styles[style])


def document(path, case, title, sections, public):
    body = [paragraph('FUNDTOGETHER / CONTROLLED REVIEW EXERCISE', 'SmallCopy'), Spacer(1, 12),
            paragraph(f'{case} | {title}', 'Title'), paragraph('Public redacted copy' if public else 'Restricted synthetic source copy', 'SmallCopy'), Spacer(1, 16),
            paragraph('Fictional data. No actual purchase, payment, beneficiary or handover is asserted. Assess consistency within the supplied scenario, including its limitations.', 'SmallCopy'), Spacer(1, 18)]
    for heading, rows in sections:
        body += [paragraph(heading, 'Heading2')]
        cells = [[paragraph(label), paragraph(printable(value))] for label, value in rows]
        table = Table(cells, colWidths=[148, 351], hAlign='LEFT')
        table.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 9),
                                  ('RIGHTPADDING', (0, 0), (-1, -1), 9), ('TOPPADDING', (0, 0), (-1, -1), 7),
                                  ('BOTTOMPADDING', (0, 0), (-1, -1), 7), ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#edf2f7')),
                                  ('LINEBELOW', (0, 0), (-1, -1), .35, colors.HexColor('#d6dde6'))]))
        body += [table, Spacer(1, 17)]
    def footer(canvas, doc):
        canvas.setFont('Helvetica', 8)
        canvas.setFillColor(colors.HexColor('#64748b'))
        canvas.drawString(48, 28, f'{case} | Synthetic exercise only | ' + ('PUBLIC' if public else 'RESTRICTED'))
        canvas.drawRightString(547, 28, str(doc.page))
    SimpleDocTemplate(str(path), pagesize=A4, rightMargin=48, leftMargin=48, topMargin=38, bottomMargin=48,
                      title=f'{case} {title}', author='FundTogether synthetic exercise', invariant=1).build(body, onFirstPage=footer, onLaterPages=footer)
    text = '\n'.join(p.extract_text() or '' for p in PdfReader(path).pages)
    assert case in text and 'Fictional data.' in text
    return len(PdfReader(path).pages)


def illustration(path, provenance, count, public):
    image = Image.new('RGB', (1200, 780), '#f7fafc')
    draw = ImageDraw.Draw(image)
    font = lambda size: ImageFont.truetype('C:/Windows/Fonts/arial.ttf', size)
    draw.text((50, 36), 'SYNTHETIC INVENTORY ILLUSTRATION', font=font(34), fill='#153047')
    draw.text((50, 91), 'Not a photograph. Does not prove delivery.', font=font(24), fill='#7a3e13')
    draw.text((50, 138), f'Provenance: {provenance} | declared packages: {count}', font=font(24), fill='#334155')
    for i in range(15):
        x, y = 60 + (i % 5) * 225, 215 + (i // 5) * 150
        draw.rounded_rectangle((x, y, x + 190, y + 113), radius=10, fill='#dde9ee', outline='#43697a', width=2)
        draw.text((x + 16, y + 14), '2 kg rice', font=font(22), fill='#153047')
        draw.text((x + 16, y + 44), '1 L oil', font=font(22), fill='#153047')
        draw.text((x + 16, y + 74), '5 noodle packs', font=font(20), fill='#153047')
    draw.text((50, 699), 'PUBLIC COPY - contact removed' if public else 'RESTRICTED - fictional contact: local-contact.invalid', font=font(22), fill='#334155')
    image.save(path)


def main():
    if OUTPUT.exists():
        catalog = read(OUTPUT / 'reviewer/catalog.json')
        for item in catalog['items']:
            for d in item['documents']:
                assert sha((OUTPUT / 'reviewer' / d['path']).read_bytes()) == d['sha256']
        print('Existing neutral reviewer corpus hashes verified; no bytes regenerated')
        return
    manifest = read(ROOT / '.local/workflow-b/generated/deployment.local.json')
    labels = read(HISTORY / 'reference-labels.json')['entries']
    rng = random.Random(31338)
    ids = rng.sample(range(100, 1000), len(labels))
    mapping = {row['key']: f'R-{ids[i]}' for i, row in enumerate(labels)}
    reviewer = OUTPUT / 'reviewer'
    reviewer.mkdir(parents=True)
    catalog = {'schemaVersion': 'advance.reviewer-input.v1', 'synthetic': True, 'chainContext': manifest,
               'binding': 'SOURCE_INPUT_ONLY: upload and freeze against the selected live campaign to obtain schema0.2 package/hash', 'items': []}
    evaluator = {'schemaVersion': 'advance.authored-reference.v1', 'independentValidation': 'TODO', 'humanResults': 'TODO', 'items': []}
    pages = 0
    for row in labels:
        key, case = row['key'], mapping[row['key']]
        original = HISTORY / key / 'original'
        delivery, inventory, budget, contact = [read(original / f'{name}.json') for name in ['delivery', 'inventory', 'budget', 'contact-check']]
        payment = read(original / 'payment-proof.json')
        payment['paymentReference'] = f'SIM-PAY-{case}'
        stage, count = delivery['stage'], 100 if key.startswith('G1') else 50
        docs = []
        for public in [False, True]:
            folder = reviewer / case / ('public' if public else 'original'); folder.mkdir(parents=True)
            sets = {
                'PLAN': [('Frozen exercise criteria', [('Channel', 'INSTITUTION' if key.startswith('G1') else 'DIRECT'), ('Stage (zero based)', stage),
                    ('Target packages', count), ('Budget', money(budget['budget'])), ('C1', 'Full planned number and composition:2kg rice,1L oil,5 noodle packs'),
                    ('C2', 'Invoice/payment reconcile; distinguish campaign and organizer funds'), ('C3', 'Correct recipient scope and authorized signer independently checked'),
                    ('C4', 'Campaign spent plus unused reconciles; actual return needed before finalization')])],
                'REPORT': [('Inventory report', [(k, v) for k, v in inventory.items() if k != 'synthetic']),
                           ('Financial report', [(k, money(v) if k in ['budget', 'campaignSpent', 'unused', 'returnsActuallyReceived'] else v) for k, v in budget.items() if k != 'synthetic'])],
                'PAYMENT_PROOF': [('Payment record', [(k, v) for k, v in payment.items() if k != 'synthetic' and not (public and k.lower().startswith('private'))])],
                'DELIVERY_RECORD': [('Handover record', [(k, ('REDACTED: fictional contact' if public and k == 'privateContact' else v)) for k, v in delivery.items()
                                                       if k not in ['synthetic', 'recipientIds', 'campaignKey']]),
                                    ('Recipient scope', [('Count of listed recipients', len(delivery.get('recipientIds', []))),
                                      ('Recipients', 'Individual synthetic IDs removed' if public else ', '.join(delivery.get('recipientIds', []))),
                                      ('Limits', 'Institution receipt proves handover to institution only. Direct sample does not prove every beneficiary.')])],
                'SOURCES': [('Controlled authority/contact check', [(k, v) for k, v in contact.items() if k != 'synthetic']),
                            ('Source limitations', [('Independence', 'Scenario source authored for simulation; not independent field research'),
                              ('Exercise method', 'Compare supplied authority, counts, expenses and image provenance; record uncertainty when sources are insufficient.')])],
            }
            invoice = original / 'invoice.json'
            if invoice.exists():
                sets['INVOICE'] = [('Invoice', [(k, money(v) if k in ['unitPrice', 'goods'] else v) for k, v in read(invoice).items() if k != 'synthetic'])]
            for kind, sections in sets.items():
                file = folder / f'{kind}.pdf'
                pages += document(file, case, kind.replace('_', ' ').title(), sections, public)
                docs.append({'kind': kind, 'visibility': 'PUBLIC_REDACTED' if public else 'RESTRICTED_ORIGINAL',
                             'path': file.relative_to(reviewer).as_posix(), 'mediaType': 'application/pdf', 'byteSize': file.stat().st_size, 'sha256': sha(file.read_bytes())})
            photoSource = 'G2-stage-1-pass' if 'reused-photo' in key else key
            provenance = mapping.get(photoSource, case)
            photo = folder / 'PHOTO.png'
            illustration(photo, provenance, 50 if photoSource.startswith('G2') else count, public)
            docs.append({'kind': 'PHOTO', 'visibility': 'PUBLIC_REDACTED' if public else 'RESTRICTED_ORIGINAL',
                         'path': photo.relative_to(reviewer).as_posix(), 'mediaType': 'image/png', 'byteSize': photo.stat().st_size, 'sha256': sha(photo.read_bytes())})
        item = {'id': case, 'channel': 'INSTITUTION' if key.startswith('G1') else 'DIRECT', 'stage': stage,
                'targetPackages': count, 'budgetUnits': budget['budget'], 'documents': docs}
        json_file(reviewer / case / 'manifest.json', item)
        catalog['items'].append(item)
        evaluator['items'].append({'id': case, 'historicalSource': key, 'authoredLabel': row['label'], 'reason': row['reason'],
                                   'source': row['source'], 'independentReview': 'TODO'})
    rng.shuffle(catalog['items'])
    json_file(reviewer / 'catalog.json', catalog)
    json_file(OUTPUT / 'evaluator-reference.json', evaluator)
    with (OUTPUT / 'reviewer-decisions.csv').open('w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['reviewer_id', 'sample_id', 'criterion_id', 'outcome', 'reason', 'sources', 'limits', 'started_at', 'finished_at', 'independent_reviewer'])
        for item in catalog['items']:
            for criterion in ['C1', 'C2', 'C3', 'C4', 'OVERALL']:
                writer.writerow(['', item['id'], criterion, '', '', '', '', '', '', ''])
    (reviewer / 'README.txt').write_text('Synthetic controlled review inputs. All persons, contacts and transactions are fictional.\n'
        'Review PLAN, REPORT, INVOICE if supplied, PAYMENT_PROOF, DELIVERY_RECORD, SOURCES and PHOTO provenance.\n'
        'PHOTO is an illustration, never a field photograph. Evaluate internal consistency of the scenario; record limits.\n'
        'Use MET / NEEDS_INFORMATION / NOT_MET / INCONCLUSIVE, with a reason and sources for every criterion.\n'
        'MET with unused funds does not finalize until actual on-chain return. No document proves transfer by itself.\n'
        'Do not read evaluator-reference.json before submitting decisions. Its labels are authored, not independently validated.\n'
        'Upload individual evidence files through B UI; PLAN/SOURCES are references. Server creates actual package identity on freeze.\n', encoding='utf-8')
    assert len(catalog['items']) == 12
    assert len({d['sha256'] for item in catalog['items'] for d in item['documents'] if d['kind'] == 'PHOTO'}) < 24, 'Reuse scenario must retain identical image bytes'
    print(f'Neutral reviewer corpus created:12 samples, {sum(d["mediaType"] == "application/pdf" for i in catalog["items"] for d in i["documents"])} PDFs, {pages} pages; labels separate, human results TODO')


if __name__ == '__main__':
    main()
