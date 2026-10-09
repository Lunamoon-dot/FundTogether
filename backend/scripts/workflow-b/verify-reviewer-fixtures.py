"""Verify hashes/text/bounds for every new PDF and render representative templates."""
import json
from pathlib import Path
import hashlib
import pdfplumber
import pypdfium2 as pdfium
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[3]
folder = root / '.local/workflow-b/reviewer-corpus-v3'
catalog = json.loads((folder / 'reviewer/catalog.json').read_text())
hidden = json.loads((folder / 'evaluator-reference.json').read_text())
out = folder / 'render-checks'
out.mkdir(exist_ok=True)
pages, documents = 0, 0
for item in catalog['items']:
    for doc in item['documents']:
        path = folder / 'reviewer' / doc['path']
        assert '0x' + hashlib.sha256(path.read_bytes()).hexdigest() == doc['sha256']
        if doc['mediaType'] != 'application/pdf':
            with Image.open(path) as image:
                assert image.size == (1200, 780)
            continue
        documents += 1
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                pages += 1
                assert item['id'] in page.extract_text()
                assert all(entry['historicalSource'] not in page.extract_text() for entry in hidden['items']), 'Historical variant leaks authored label'
                assert all(c['x0'] >= 45 and c['x1'] <= 550 and c['top'] > 20 and c['bottom'] <= page.height - 20 for c in page.chars), str(path)
        # Cover every distinct template, including both pages of long recipient lists.
        if item['id'] == 'R-250' or (item['channel'] == 'DIRECT' and item['id'] == 'R-246' and doc['kind'] in ['DELIVERY_RECORD', 'SOURCES']):
            pdf = pdfium.PdfDocument(path)
            for i in range(len(pdf)):
                image = pdf[i].render(scale=1.5).to_pil()
                image.save(out / f'{item["id"]}-{doc["visibility"]}-{doc["kind"]}-{i + 1}.png')
            pdf.close()
images = sorted(out.glob('R-*.png'))
for index in range(0, len(images), 4):
    canvas = Image.new('RGB', (1800, 2630), 'white')
    draw = ImageDraw.Draw(canvas)
    for j, path in enumerate(images[index:index + 4]):
        with Image.open(path) as image:
            image.thumbnail((880, 1260))
            x, y = (j % 2) * 900, (j // 2) * 1315
            draw.text((x + 8, y + 8), path.stem, fill='black')
            canvas.paste(image, (x + 8, y + 30))
    canvas.save(out / f'contact-{index // 4 + 1}.png')
report = {'status': 'PASS_HASH_TEXT_BOUNDS', 'pdfs': documents, 'pages': pages, 'representativeRenders': len(images),
          'visualInspection': 'Record separately after inspecting contact PNGs', 'humanReviewerDecisions': 'TODO'}
(out / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
