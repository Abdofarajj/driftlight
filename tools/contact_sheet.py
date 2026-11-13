"""Contact sheet: each capture next to its reference, labelled. Usage: contact_sheet.py outDir name cap ref [name cap ref ...]"""
import sys
from PIL import Image, ImageDraw

out = sys.argv[1]
items = [sys.argv[i:i + 3] for i in range(2, len(sys.argv), 3)]
H = 640
rows = []
for name, cap, ref in items:
    a = Image.open(cap).convert('RGB'); b = Image.open(ref).convert('RGB')
    a = a.resize((int(a.width * H / a.height), H)); b = b.resize((int(b.width * H / b.height), H))
    row = Image.new('RGB', (a.width + b.width + 30, H + 44), '#fbf1e4')
    row.paste(a, (0, 44)); row.paste(b, (a.width + 30, 44))
    d = ImageDraw.Draw(row)
    d.text((8, 12), f"{name}  (game, iPhone 15 Pro)", fill='#6b4a55')
    d.text((a.width + 38, 12), "reference", fill='#6b4a55')
    rows.append(row)
W = max(r.width for r in rows)
sheet = Image.new('RGB', (W, sum(r.height for r in rows) + 20 * len(rows)), '#fbf1e4')
y = 0
for r in rows:
    sheet.paste(r, (0, y)); y += r.height + 20
sheet.save(f"{out}/contact.jpg", quality=88)
print(f"{out}/contact.jpg")
