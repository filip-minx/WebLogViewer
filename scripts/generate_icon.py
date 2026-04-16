"""
Generate app icon for WebLogAnalyzer.
Design: dark rounded document with three colored log lines + magnifying glass overlay.
Produces build/icon.ico (multi-size: 256, 128, 64, 48, 32, 16).
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).parent.parent
OUT  = ROOT / "build" / "icon.ico"
OUT.parent.mkdir(exist_ok=True)

def draw_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d   = ImageDraw.Draw(img)
    s   = size

    # ── Document body ────────────────────────────────────────────────────────
    pad   = round(s * 0.10)
    doc_l = pad
    doc_t = round(s * 0.06)
    doc_r = round(s * 0.82)
    doc_b = s - pad
    r     = max(2, round(s * 0.08))   # corner radius

    BG       = (28, 30, 36, 255)
    BORDER   = (60, 65, 80, 255)

    d.rounded_rectangle([doc_l, doc_t, doc_r, doc_b], radius=r, fill=BG, outline=BORDER, width=max(1, round(s*0.02)))

    # ── Log lines ────────────────────────────────────────────────────────────
    inner_l = doc_l + round(s * 0.10)
    inner_r = doc_r - round(s * 0.10)
    lh      = max(2, round(s * 0.055))   # line height
    gap     = round(s * 0.025)

    lines = [
        # (color, width_fraction)  — mimic INFO / ERROR / WARN / INFO entries
        ((100, 180, 255, 255), 0.85),   # blue  INFO
        ((230,  70,  70, 255), 0.70),   # red   ERROR
        ((240, 180,  40, 255), 0.55),   # amber WARN
        ((100, 180, 255, 255), 0.78),   # blue  INFO
    ]

    total_h   = len(lines) * lh + (len(lines) - 1) * gap
    doc_mid_y = (doc_t + doc_b) // 2
    y         = doc_mid_y - total_h // 2

    lr = max(2, round(lh * 0.45))  # line corner radius
    for color, wf in lines:
        x1 = inner_l
        x2 = inner_l + round((inner_r - inner_l) * wf)
        d.rounded_rectangle([x1, y, x2, y + lh], radius=lr, fill=color)
        y += lh + gap

    # ── Magnifying glass ─────────────────────────────────────────────────────
    # Circle center: lower-right quadrant
    cx = round(s * 0.72)
    cy = round(s * 0.72)
    cr = round(s * 0.22)   # outer radius of lens ring
    ci = round(cr * 0.68)  # inner (glass) radius
    sw = max(2, round(s * 0.055))  # ring stroke width

    GLASS_RIM  = (200, 210, 230, 255)
    GLASS_FILL = (50, 130, 220, 80)   # translucent blue tint

    # Glass fill
    d.ellipse([cx - ci, cy - ci, cx + ci, cy + ci], fill=GLASS_FILL)
    # Ring
    d.ellipse([cx - cr, cy - cr, cx + cr, cy + cr],
              outline=GLASS_RIM, width=sw)

    # Handle — diagonal down-right
    hlen  = round(s * 0.20)
    angle_offset = round(cr * 0.68)
    hx1 = cx + angle_offset
    hy1 = cy + angle_offset
    hx2 = hx1 + round(hlen * 0.72)
    hy2 = hy1 + round(hlen * 0.72)
    hw  = max(2, round(s * 0.075))
    d.line([(hx1, hy1), (hx2, hy2)], fill=GLASS_RIM, width=hw)
    # Round cap on handle end
    d.ellipse([hx2 - hw//2, hy2 - hw//2, hx2 + hw//2, hy2 + hw//2], fill=GLASS_RIM)

    return img

sizes = [256, 128, 64, 48, 32, 16]
images = [draw_icon(s) for s in sizes]

images[0].save(
    OUT,
    format="ICO",
    sizes=[(s, s) for s in sizes],
    append_images=images[1:],
)
print(f"Icon written to {OUT}  ({len(sizes)} sizes: {sizes})")
