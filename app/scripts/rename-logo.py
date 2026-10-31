# EA AI Buddy rename (31 Oct 2026): replaces the "ESTATE AGENT" line of the gold logo with "EA", keeping the original
# "— AI BUDDY —" line, the robot and the house untouched. Run once from app/:  python3 scripts/rename-logo.py
# Works on the 512 px logo images and the full-size splash screens (the same logo, scaled, centred on black).
from PIL import Image, ImageDraw, ImageFont, ImageFilter

FONT = '/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf'
# Line 1 in the 512 px logo: x 30..490, y 340..388 (measured from logo-512.webp).
BAND = (30, 339, 490, 389)


def rename(img, ox, oy, s):
    img = img.convert('RGBA')
    x0, y0, x1, y1 = [round(v * s) for v in BAND]
    x0 += ox; x1 += ox; y0 += oy; y1 += oy
    # Remove the old words: every pixel of the band becomes a blend of the pixels just above and just below it in the
    # same column, so the tile's own dark shading carries on with no visible patch.
    px = img.load()
    for x in range(x0, x1 + 1):
        a, b = px[x, y0 - 1], px[x, y1 + 1]
        for y in range(y0, y1 + 1):
            t = (y - y0 + 1) / (y1 - y0 + 2)
            px[x, y] = tuple(round(a[i] * (1 - t) + b[i] * t) for i in range(3)) + (255,)

    size = round(66 * s)
    font = ImageFont.truetype(FONT, size)
    text = 'EA'
    spacing = round(3 * s)
    widths = [font.getbbox(c)[2] - font.getbbox(c)[0] for c in text]
    total = sum(widths) + spacing * (len(text) - 1)
    top_cap = font.getbbox('E')[1]
    cap_h = font.getbbox('E')[3] - top_cap
    cx = ox + round(256 * s)
    cy = oy + round(364 * s)
    tx = cx - total // 2
    ty = cy - cap_h // 2 - top_cap

    # Text mask, then a white-to-silver vertical gradient through it (like the original "ESTATE AGENT").
    mask = Image.new('L', img.size, 0)
    md = ImageDraw.Draw(mask)
    x = tx
    for c, w in zip(text, widths):
        md.text((x - font.getbbox(c)[0], ty), c, font=font, fill=255)
        x += w + spacing
    grad = Image.new('RGBA', img.size)
    gd = ImageDraw.Draw(grad)
    gy0, gy1 = cy - cap_h // 2, cy + cap_h // 2
    for y in range(gy0, gy1 + 1):
        t = (y - gy0) / max(1, gy1 - gy0)
        v = round(255 - 120 * t) if t < 0.55 else round(189 + 66 * (t - 0.55) / 0.45)
        gd.line([(x0, y), (x1, y)], fill=(v, v, min(255, v + 4), 255))
    shadow = mask.filter(ImageFilter.GaussianBlur(max(1, round(2 * s))))
    img.paste((0, 0, 0, 255), (0, round(2 * s)), shadow.point(lambda p: p * 0.8))
    img.paste(grad, (0, 0), mask)
    return img


def run(path, ox, oy, s, fmt=None):
    im = Image.open(path)
    mode = im.mode
    out = rename(im, ox, oy, s)
    if mode == 'RGB':
        out = out.convert('RGB')
    out.save(path, **({'quality': 92, 'method': 6} if path.endswith('.webp') else {}))
    print('updated', path)


if __name__ == '__main__':
    run('src/brand/logo-512.webp', 0, 0, 1)
    run('src/brand/splash-512.webp', 0, 0, 1)
    run('assets/brand/logo.png', 0, 0, 2)
    k = 820 / 512
    run('assets/splash.png', 956, 956, k)
    run('assets/splash-dark.png', 956, 956, k)
    # The 256 px copies are the 512 px images scaled down.
    for n in ('logo', 'splash'):
        Image.open(f'src/brand/{n}-512.webp').convert('RGBA').resize((256, 256), Image.LANCZOS).save(f'src/brand/{n}-256.webp', quality=92, method=6)
        print('updated', f'src/brand/{n}-256.webp')
