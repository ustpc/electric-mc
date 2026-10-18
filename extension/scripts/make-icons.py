"""Draw the toolbar icons: "MC" with a lightning bolt through it.

On: white letters on E-MC brown (#b45309) with a gold bolt.
Off: the same in greys. Drawn at 512px and scaled down.
Run: python3 scripts/make-icons.py  (needs Pillow and DejaVu Sans Bold)
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
S = 512
OUT = Path(__file__).resolve().parent.parent / 'public'

# Bolt outline in a 512 box, from top right to bottom left.
BOLT = [(330, 18), (150, 268), (248, 268), (176, 494), (372, 214), (270, 214), (352, 18)]


def draw(bg, fg, bolt, edge):
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=96, fill=bg)
    font = ImageFont.truetype(FONT, 250)
    text = 'MC'
    l, t, r, b = d.textbbox((0, 0), text, font=font)
    d.text(((S - (r - l)) / 2 - l, (S - (b - t)) / 2 - t), text, font=font, fill=fg)
    # The bolt cuts through the letters: a background-colored edge, then the bolt.
    d.polygon(BOLT, fill=edge, outline=edge, width=26)
    d.polygon(BOLT, fill=bolt)
    return im


def save(im, name):
    (OUT / name).mkdir(parents=True, exist_ok=True)
    for n in (16, 32, 48, 128):
        im.resize((n, n), Image.LANCZOS).save(OUT / name / f'{n}.png')


save(draw('#b45309', '#ffffff', '#fcd34d', '#b45309'), 'icon')
save(draw('#9ca3af', '#f3f4f6', '#e5e7eb', '#9ca3af'), 'icon-off')
