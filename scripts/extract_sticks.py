import cv2
from PIL import Image
import numpy as np
import math
import json
import os

src = r'C:\Users\jasim\.gemini\antigravity-ide\brain\7d9fc608-0300-4d8d-954e-bad0d496039c\.user_uploaded\media_1792250250918.png'
im = Image.open(src)
arr = np.array(im)
alpha = (arr[:, :, 3] > 10).astype(np.uint8)

contours, _ = cv2.findContours(alpha, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
center_all = (512, 476)

items = []
for cnt in contours:
    if cv2.contourArea(cnt) > 5000:
        rect = cv2.minAreaRect(cnt)
        (cx, cy), (w, h), angle = rect
        dx = cx - center_all[0]
        dy = cy - center_all[1]
        ang = math.degrees(math.atan2(dx, -dy))
        if ang < 0:
            ang += 360
        items.append((ang, cx, cy, rect, cnt))

items.sort(key=lambda x: x[0])

flavors = [
    {'id': 'strawberry', 'name': 'Sweet Strawberry', 'tagline': 'Sun-ripened strawberry indulgence', 'color': '#ff2a6d', 'bg': 'rgba(255, 42, 109, 0.15)'},
    {'id': 'guava', 'name': 'Creamy Guava & Mint', 'tagline': 'Exotic tropical guava with herbal freshness', 'color': '#2ec4b6', 'bg': 'rgba(46, 196, 182, 0.15)'},
    {'id': 'mango', 'name': 'Alphonso Mango', 'tagline': 'Pure king-of-fruits sweetness & sunshine', 'color': '#ff9f1c', 'bg': 'rgba(255, 159, 28, 0.15)'},
    {'id': 'coconut', 'name': 'Tender Coconut', 'tagline': 'Rich Malabar coastal coconut creme', 'color': '#a3704c', 'bg': 'rgba(163, 112, 76, 0.15)'},
    {'id': 'chocolate', 'name': 'Belgian Chocolate', 'tagline': 'Deep velvety cocoa with roasted crunch', 'color': '#4a2810', 'bg': 'rgba(74, 40, 16, 0.15)'},
    {'id': 'watermelon', 'name': 'Fresh Watermelon', 'tagline': 'Hydrating summer crunch with choc seeds', 'color': '#ff3366', 'bg': 'rgba(255, 51, 102, 0.15)'},
    {'id': 'kiwi', 'name': 'Zesty Kiwi', 'tagline': 'Tart & tangy New Zealand kiwi zest', 'color': '#70a224', 'bg': 'rgba(112, 162, 36, 0.15)'},
    {'id': 'blueberry', 'name': 'Wild Blueberry', 'tagline': 'Antioxidant-rich wild forest berry swirl', 'color': '#4361ee', 'bg': 'rgba(67, 97, 238, 0.15)'},
    {'id': 'lemon', 'name': 'Sunshine Lemon', 'tagline': 'Crisp citrus burst with candied peel', 'color': '#ffb703', 'bg': 'rgba(255, 183, 3, 0.15)'},
    {'id': 'pomegranate', 'name': 'Royal Pomegranate', 'tagline': 'Ruby-red aril infusion & sweet zest', 'color': '#d90429', 'bg': 'rgba(217, 4, 41, 0.15)'}
]

out_dir = r'c:\Users\jasim\Web Project\Enterprises\Ice cream\Icespot\assets\sticks'
os.makedirs(out_dir, exist_ok=True)

sticks_data = []
W_CANVAS = 1024.0
H_CANVAS = 985.0

for i, (ang, cx, cy, rect, cnt) in enumerate(items):
    x, y, w, h = cv2.boundingRect(cnt)
    
    # Generate clip-path polygon from convex hull
    hull = cv2.convexHull(cnt)
    epsilon = 0.008 * cv2.arcLength(hull, True)
    approx = cv2.approxPolyDP(hull, epsilon, True)
    
    pts = []
    for pt in approx:
        px = pt[0][0] - x
        py = pt[0][1] - y
        pct_x = round((px / w) * 100, 1)
        pct_y = round((py / h) * 100, 1)
        pts.append(f"{pct_x}% {pct_y}%")
    
    pts_str = ', '.join(pts)
    clip_polygon = f'polygon({pts_str})'
    
    stick_mask = np.zeros_like(alpha)
    cv2.drawContours(stick_mask, [cnt], -1, 255, -1)
    
    stick_img = np.zeros_like(arr)
    stick_img[stick_mask > 0] = arr[stick_mask > 0]
    
    cropped_img = stick_img[y:y+h, x:x+w]
    flavor_id = flavors[i]['id']
    out_file = f'stick_{flavor_id}.png'
    out_path = os.path.join(out_dir, out_file)
    Image.fromarray(cropped_img).save(out_path)
    
    stick_entry = {
        'index': i,
        'flavor': flavors[i],
        'angle': round(ang, 1),
        'file': f'assets/sticks/{out_file}',
        'left': round((x / W_CANVAS) * 100, 3),
        'top': round((y / H_CANVAS) * 100, 3),
        'width': round((w / W_CANVAS) * 100, 3),
        'height': round((h / H_CANVAS) * 100, 3),
        'cx': round((cx / W_CANVAS) * 100, 3),
        'cy': round((cy / H_CANVAS) * 100, 3),
        'clip_path': clip_polygon
    }
    sticks_data.append(stick_entry)

with open(os.path.join(out_dir, 'sticks_data.json'), 'w') as f:
    json.dump(sticks_data, f, indent=2)

print('Successfully extracted all 10 sticks and saved sticks_data.json!')
