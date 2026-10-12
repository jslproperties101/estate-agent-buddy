"""Builds synthetic, non-confidential sample files for the local pipeline tests.
All names, numbers and properties are invented."""
import io, os, zipfile, random
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
import docx
from PIL import Image

OUT = os.path.dirname(os.path.abspath(__file__))

def pdf(name, pages):
    c = canvas.Canvas(os.path.join(OUT, name), pagesize=A4)
    for lines in pages:
        y = 800
        if lines is None:  # a scanned page: a picture, no text layer
            c.rect(60, 300, 470, 450, fill=1)
        else:
            for ln in lines:
                c.setFont('Helvetica', 12); c.drawString(60, y, ln); y -= 22
        c.showPage()
    c.save()

def word(name, paras, table=None):
    d = docx.Document()
    for p in paras: d.add_paragraph(p)
    if table:
        t = d.add_table(rows=len(table), cols=2)
        for i, (a, b) in enumerate(table):
            t.cell(i, 0).text = a; t.cell(i, 1).text = b
    d.save(os.path.join(OUT, name))

pdf('brochure_en.pdf', [
    ['SEMI-D FACTORY FOR SALE', 'Unit 7, Jalan Perindustrian 2/3, Nilai (sample)', 'Asking Price: RM 3.4 mil', 'Contact: 012-345 6789 (sample agent)'],
    ['Specifications', 'Land area: 8,000 sq ft', 'Built-up: 6,500 sq ft', 'Tenure: Freehold', 'Individual title', 'Ceiling height: 28 ft', 'Power supply: 150 kVA', 'Lot 2/14'],
])
word('brochure_bm.docx',
    ['KILANG BERKEMBAR UNTUK DIJUAL', 'Lokasi: Jalan Perindustrian 2/3, Nilai', 'Harga: RM 3,200,000'],
    [('Keluasan tanah', '8,000 kaki persegi'), ('Keluasan binaan', '6,500 kaki persegi'), ('Pegangan', 'Pegangan bebas'), ('Hakmilik', 'Hakmilik individu'), ('Bekalan elektrik', '150 kVA')])
pdf('spa_sample.pdf', [
    ['SALE AND PURCHASE AGREEMENT (sample, invented)', 'Vendor: Tan Ah Kow (NRIC No. 680101-10-5678)', 'Purchaser: Sample Sdn Bhd', 'Property: Lot 2/14, Jalan Perindustrian 2/3, Nilai', 'Purchase price: RM 3,200,000', 'Account no: 1234 5678 9012'],
])
pdf('scanned.pdf', [None, None])
word('brochure_zh.docx', ['半独立式厂房出售', '地点：Nilai', '售价：RM 3.2 mil', '土地面积：8,000 平方尺', '永久地契'])
word('brochure_ta.docx', ['தொழிற்சாலை விற்பனைக்கு', 'விலை: RM 3,200,000', 'நில பரப்பு: 8,000 சதுர அடி'])
random.seed(1)
img = Image.effect_noise((3000, 2000), 64).convert('RGB')
img.save(os.path.join(OUT, 'photo_large.png'))
with open(os.path.join(OUT, 'old_format.doc'), 'wb') as f:
    f.write(bytes.fromhex('d0cf11e0a1b11ae1') + b'\0' * 504)
print('fixtures written')
