#!/usr/bin/env python3
"""Second Seat - all art drawn in code with PIL. No AI images, no downloads.
Original sun-faded repair-shop town: warm sky, rooftop skyline, shop
awnings, a three-lane road. Side view, 1136x640. PIL y is down.
Lanes (GUI y, up): lane 1 y=300, lane 2 y=400, lane 3 y=500. Road band
in the background spans PIL y 300..640 (GUI y 340..40 -> PIL 300..600
covers the lane centres after the y-flip: GUI y 300 -> PIL 340).
"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(os.path.dirname(HERE), "art")
os.makedirs(ART, exist_ok=True)

rng = random.Random(20261124)

OUT = (48, 38, 30, 255)
SKY_TOP = (255, 214, 150, 255)
SKY_BOT = (255, 238, 200, 255)
ROAD = (96, 92, 100, 255)
ROAD_D = (72, 68, 78, 255)
TEAL = (32, 160, 150, 255)
ORANGE = (240, 130, 40, 255)
WHITE = (250, 246, 236, 255)


def save(img, name):
    p = os.path.join(ART, name)
    img.save(p, "PNG")
    print("wrote", p, img.size)


def circle(d, cx, cy, r, fill, outline=None, width=1):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill,
              outline=outline, width=width)


def rrect(d, box, rad, fill, outline=None, width=1):
    d.rounded_rectangle(box, radius=rad, fill=fill, outline=outline, width=width)


def font(size):
    for path in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                 "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


# ---------------------------------------------------------------- background --
def background():
    # PIL y is down; GUI y is up, so GUI lane y 300/400/500 map to
    # PIL y 340/240/140. The road must span PIL 100..640 so all three
    # lanes sit on asphalt; sky + skyline live above PIL 100.
    W, H = 1136, 640
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # sky gradient (0..100)
    for y in range(100):
        t = y / 100.0
        d.line([(0, y), (W, y)], fill=tuple(
            int(SKY_TOP[i] + (SKY_BOT[i] - SKY_TOP[i]) * t) for i in range(3)) + (255,))
    # sun + clouds
    circle(d, 980, 42, 26, (255, 246, 190, 255))
    circle(d, 980, 42, 34, (255, 250, 210, 90))
    for cx, cy, s in ((180, 40, 22), (420, 60, 28), (700, 34, 20)):
        circle(d, cx, cy, s, (255, 250, 235, 220))
        circle(d, cx + s, cy + 5, s * 0.7, (255, 250, 235, 220))
        circle(d, cx - s, cy + 6, s * 0.6, (255, 250, 235, 220))
    # rooftop skyline, bottoms at PIL 100
    wall_cols = [(214, 170, 130, 255), (196, 150, 118, 255), (224, 186, 142, 255),
                 (186, 140, 112, 255), (206, 162, 124, 255)]
    roof_cols = [(176, 92, 62, 255), (150, 78, 58, 255), (190, 110, 70, 255)]
    x = -10
    i = 0
    while x < W:
        bw = rng.randint(90, 170)
        bh = rng.randint(34, 62)
        by = 100 - bh
        d.rectangle([x, by, x + bw, 100], fill=wall_cols[i % len(wall_cols)],
                    outline=OUT, width=3)
        d.polygon([(x - 6, by), (x + bw / 2, by - 18), (x + bw + 6, by)],
                  fill=roof_cols[i % len(roof_cols)], outline=OUT)
        for wx in range(x + 14, x + bw - 18, 30):
            d.rectangle([wx, by + 12, wx + 18, by + 30],
                        fill=(90, 70, 60, 255), outline=OUT, width=2)
        if i % 3 == 0:
            d.rectangle([x + bw - 26, by - 26, x + bw - 12, by - 10],
                        fill=(150, 90, 70, 255), outline=OUT, width=2)
        if i % 4 == 1:
            d.line([(x + 20, by - 18), (x + 20, by - 38)], fill=OUT, width=3)
            circle(d, x + 20, by - 41, 4, (220, 60, 50, 255))
        x += bw + 4
        i += 1
    # shop awning strip (PIL 100..128)
    d.rectangle([0, 100, W, 128], fill=(120, 90, 80, 255), outline=OUT, width=3)
    awn = [(214, 90, 70, 255), (240, 200, 90, 255), (70, 160, 140, 255),
           (150, 110, 170, 255)]
    for k in range(8):
        c = awn[k % len(awn)]
        x0 = k * 142
        d.rectangle([x0, 100, x0 + 142, 112], fill=c, outline=OUT, width=2)
        d.polygon([(x0, 112), (x0 + 142, 112), (x0 + 128, 128), (x0 + 14, 128)],
                  fill=c, outline=OUT)
    # road band PIL 128..640 (GUI 0..512) - all three lanes on asphalt
    d.rectangle([0, 128, W, 640], fill=ROAD, outline=OUT, width=3)
    d.rectangle([0, 128, W, 140], fill=(170, 160, 148, 255), outline=OUT, width=2)
    # lane dashes between lane centres (PIL 190 and 290) + lower edge
    for x in range(10, W, 70):
        d.rectangle([x, 188, x + 40, 194], fill=(250, 240, 200, 255))
        d.rectangle([x, 288, x + 40, 294], fill=(250, 240, 200, 255))
        d.rectangle([x, 388, x + 40, 394], fill=(250, 240, 200, 255))
    save(img, "background.png")


# ------------------------------------------------------------------- scooter --
def rider(d, cx, base_y, helmet, shirt, pants, lean):
    # legs
    d.line([(cx - 6, base_y - 52), (cx - 26 + lean, base_y)], fill=pants, width=12)
    d.line([(cx + 8, base_y - 52), (cx + 30 + lean, base_y)], fill=pants, width=12)
    # torso
    d.line([(cx, base_y - 52), (cx + 6 + lean, base_y - 96)], fill=shirt, width=20)
    # arm to handlebar / to partner shoulder
    d.line([(cx + 4 + lean, base_y - 92), (cx + 34 + lean, base_y - 74)],
           fill=shirt, width=10)
    # head + helmet
    circle(d, cx + 8 + lean, base_y - 112, 15, (245, 205, 170, 255), OUT, 3)
    d.pieslice([cx + 8 + lean - 17, base_y - 130, cx + 8 + lean + 17, base_y - 96],
               180, 360, fill=helmet, outline=OUT)
    d.rectangle([cx + 8 + lean - 17, base_y - 114, cx + 8 + lean + 17, base_y - 108],
                fill=helmet, outline=OUT)


def scooter(name, front_helmet, back_helmet):
    W, H = 320, 190
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # shadow
    d.ellipse([28, 158, 292, 176], fill=(0, 0, 0, 90))
    # wheels
    for cx in (70, 250):
        circle(d, cx, 138, 30, (40, 40, 48, 255), OUT, 4)
        circle(d, cx, 138, 13, (200, 200, 210, 255), OUT, 3)
    # body: floorboard + rear hump + front shield
    d.polygon([(60, 138), (250, 138), (238, 108), (96, 108)],
              fill=(214, 90, 70, 255), outline=OUT)
    d.polygon([(238, 138), (268, 138), (262, 96), (238, 108)],
              fill=(190, 70, 55, 255), outline=OUT)
    d.polygon([(250, 138), (292, 138), (286, 84), (262, 96)],
              fill=(230, 110, 80, 255), outline=OUT)
    # front shield + headlight + handlebar
    d.polygon([(272, 96), (296, 40), (282, 36), (258, 88)],
              fill=(240, 120, 85, 255), outline=OUT)
    d.line([(286, 42), (306, 30)], fill=OUT, width=6)
    circle(d, 296, 66, 9, (255, 240, 150, 255), OUT, 3)
    # seat
    rrect(d, [96, 92, 210, 108], 8, (60, 50, 44, 255), OUT, 3)
    # riders: front rider sits forward (x 210), back rider (x 140)
    rider(d, 205, 108, front_helmet, (70, 120, 200, 255), (50, 50, 60, 255), 10)
    rider(d, 138, 108, back_helmet, (240, 200, 90, 255), (60, 60, 70, 255), 4)
    # exhaust puff hint
    circle(d, 44, 128, 8, (220, 220, 220, 180))
    save(img, name)


# ------------------------------------------------------------------- traffic --
def car(name, body_col, dark_col):
    W, H = 210, 120
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([14, 96, 196, 110], fill=(0, 0, 0, 90))
    # body
    rrect(d, [10, 52, 200, 96], 14, body_col, OUT, 4)
    # cabin
    d.polygon([(58, 52), (76, 20), (140, 20), (158, 52)], fill=dark_col, outline=OUT)
    d.polygon([(66, 48), (80, 26), (104, 26), (104, 48)], fill=(180, 220, 240, 255), outline=OUT)
    d.polygon([(110, 26), (136, 26), (150, 48), (110, 48)], fill=(180, 220, 240, 255), outline=OUT)
    # lights + bumper
    circle(d, 196, 70, 8, (255, 240, 150, 255), OUT, 2)
    d.rectangle([8, 88, 202, 96], fill=(60, 60, 66, 255), outline=OUT, width=2)
    for cx in (52, 160):
        circle(d, cx, 94, 20, (40, 40, 48, 255), OUT, 4)
        circle(d, cx, 94, 8, (200, 200, 210, 255), OUT, 2)
    save(img, name)


def truck(name):
    W, H = 300, 150
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([14, 126, 286, 142], fill=(0, 0, 0, 90))
    # cargo box
    rrect(d, [10, 22, 210, 122], 8, (200, 170, 110, 255), OUT, 4)
    d.line([(10, 52), (210, 52)], fill=OUT, width=3)
    d.line([(10, 82), (210, 82)], fill=OUT, width=3)
    for x in (60, 110, 160):
        d.line([(x, 22), (x, 122)], fill=OUT, width=2)
    # cab
    d.polygon([(214, 122), (214, 52), (252, 52), (272, 78), (286, 78), (286, 122)],
              fill=(90, 140, 190, 255), outline=OUT)
    d.polygon([(222, 60), (246, 60), (258, 76), (222, 76)], fill=(180, 220, 240, 255), outline=OUT)
    circle(d, 284, 100, 7, (255, 240, 150, 255), OUT, 2)
    for cx in (56, 150, 246):
        circle(d, cx, 122, 20, (40, 40, 48, 255), OUT, 4)
        circle(d, cx, 122, 8, (200, 200, 210, 255), OUT, 2)
    save(img, name)


def pothole():
    W, H = 130, 46
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([4, 4, 126, 42], fill=(40, 36, 40, 255), outline=OUT, width=3)
    d.ellipse([22, 12, 108, 34], fill=(28, 24, 28, 255))
    for cx, cy in ((30, 14), (90, 30), (60, 12)):
        d.line([(cx, cy), (cx + 8, cy + 4)], fill=(90, 84, 90, 255), width=3)
    save(img, "pothole.png")


def parcel():
    W, H = 100, 100
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([20, 30, 80, 88], fill=(205, 160, 95, 255), outline=OUT, width=4)
    d.line([(50, 30), (50, 88)], fill=(150, 90, 50, 255), width=6)
    d.line([(20, 58), (80, 58)], fill=(150, 90, 50, 255), width=6)
    # sparkle
    for cx, cy, r in ((88, 20, 8), (14, 22, 6), (90, 70, 5)):
        d.line([(cx - r, cy), (cx + r, cy)], fill=(255, 230, 120, 255), width=3)
        d.line([(cx, cy - r), (cx, cy + r)], fill=(255, 230, 120, 255), width=3)
    save(img, "parcel.png")


def stop_sign():
    W, H = 120, 170
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([54, 78, 66, 168], fill=(120, 120, 125, 255), outline=OUT, width=3)
    pts = []
    cx, cy, r = 60, 46, 42
    for k in range(8):
        a = math.pi / 8 + k * math.pi / 4
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    d.polygon(pts, fill=(210, 60, 50, 255), outline=OUT)
    d.text((60, 46), "GO", font=font(20), fill=(255, 255, 255, 255), anchor="mm")
    d.rectangle([18, 118, 102, 146], fill=(240, 200, 90, 255), outline=OUT, width=3)
    d.text((60, 132), "STOP", font=font(16), fill=(60, 40, 20, 255), anchor="mm")
    save(img, "stop.png")


def star():
    W, H = 90, 90
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy, r1, r2 = 45, 45, 40, 17
    pts = []
    for k in range(10):
        r = r1 if k % 2 == 0 else r2
        a = -math.pi / 2 + k * math.pi / 5
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    d.polygon(pts, fill=(255, 205, 60, 255), outline=OUT)
    save(img, "star.png")


def lock():
    W, H = 60, 80
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.arc([14, 6, 46, 40], 180, 360, fill=OUT, width=7)
    rrect(d, [8, 34, 52, 74], 6, (120, 120, 130, 255), OUT, 3)
    circle(d, 30, 52, 6, (40, 40, 44, 255))
    d.rectangle([27, 52, 33, 64], fill=(40, 40, 44, 255))
    save(img, "lock.png")


def particle():
    W, H = 32, 32
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    circle(d, 16, 16, 13, (255, 255, 255, 255))
    circle(d, 16, 16, 7, (255, 240, 180, 255))
    save(img, "particle.png")


background()
scooter("scooter_front.png", TEAL, ORANGE)   # you drive (teal front)
scooter("scooter_back.png", ORANGE, TEAL)    # partner drives (orange front)
car("car_red.png", (210, 70, 60, 255), (150, 45, 40, 255))
car("car_blue.png", (70, 120, 200, 255), (45, 85, 160, 255))
truck("truck.png")
pothole()
parcel()
stop_sign()
star()
lock()
particle()
print("art done")
