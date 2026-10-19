import cv2
import numpy as np
from scipy.ndimage import gaussian_filter1d

# Load user's reference image 2
img_path = r'C:\Users\jasim\.gemini\antigravity-ide\brain\747871f2-c6c6-4430-99d9-00131e3466c3\.user_uploaded\media_1792387939700.png'
img = cv2.imread(img_path)
h, w = img.shape[:2]

# Segment the rose-pink melted ice cream
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
mask = cv2.inRange(hsv, np.array([150, 45, 45]), np.array([180, 255, 255])) | cv2.inRange(hsv, np.array([0, 45, 45]), np.array([10, 255, 255]))
mask[:40, :] = 255
mask[:, 0] = 255
mask[:, -1] = 255

kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

# Trace bottom contour
pts = []
for x in range(w):
    col = np.where(mask[:, x] > 0)[0]
    y_val = float(np.max(col)) if len(col) > 0 else 135.0
    pts.append(y_val)

# Gentle Gaussian filter to ensure smooth continuous curvature and perfectly rounded drip bulbs
y_smooth = gaussian_filter1d(pts, sigma=1.6)

# Shift Y so the solid top is compact, starting around where valleys begin (e.g. shift by -50)
# Lowest valley is at ~129, so shifting by -50 means valleys are at ~79 and longest drips (232) are at ~182.
# Total viewBox height: 200. This makes the divider compact, elegant, and responsive.
OFFSET_Y = 50.0
y_shifted = [max(10.0, y - OFFSET_Y) for y in y_smooth]

# Sample 260 equidistant points along width 1024
N = 260
x_coords = np.linspace(0, w - 1, N)
y_coords = np.interp(x_coords, np.arange(w), y_shifted)

# Convert to cubic Bezier commands
d_cmds = []
d_cmds.append(f"M 0 0")
d_cmds.append(f"L 0 {y_coords[0]:.1f}")

for i in range(N - 1):
    p0 = (x_coords[max(0, i - 1)], y_coords[max(0, i - 1)])
    p1 = (x_coords[i], y_coords[i])
    p2 = (x_coords[i + 1], y_coords[i + 1])
    p3 = (x_coords[min(N - 1, i + 2)], y_coords[min(N - 1, i + 2)])
    
    c1x = p1[0] + (p2[0] - p0[0]) / 6.0
    c1y = p1[1] + (p2[1] - p0[1]) / 6.0
    c2x = p2[0] - (p3[0] - p1[0]) / 6.0
    c2y = p2[1] - (p3[1] - p1[1]) / 6.0
    
    d_cmds.append(f"C {c1x:.2f} {c1y:.2f}, {c2x:.2f} {c2y:.2f}, {p2[0]:.2f} {p2[1]:.2f}")

d_cmds.append(f"L {w} 0 Z")
path_d = " ".join(d_cmds)

# Build the complete SVG matching Reference Image 2
VIEWBOX_H = 195
svg_markup = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {VIEWBOX_H}" preserveAspectRatio="none" style="display:block; width:100%; height:100%;">
  <defs>
    <!-- Seamless vertical gradient matching bottom of rose-pink hero into deep berry drip tips -->
    <linearGradient id="meltedRoseDripGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#C52352" />
      <stop offset="35%" stop-color="#B81A49" />
      <stop offset="70%" stop-color="#A1123D" />
      <stop offset="100%" stop-color="#840A2E" />
    </linearGradient>

    <!-- Subtle, soft shadow under the pink drips onto the white background -->
    <filter id="meltedDropShadow" x="-5%" y="0%" width="110%" height="150%">
      <feDropShadow dx="0" dy="6" stdDeviation="5.5" flood-color="#450415" flood-opacity="0.22" />
    </filter>

    <!-- Translucent liquid specular highlight along rounded drip edges -->
    <linearGradient id="dripGlossSheen" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.0)" />
      <stop offset="20%" stop-color="rgba(255,255,255,0.14)" />
      <stop offset="45%" stop-color="rgba(255,255,255,0.03)" />
      <stop offset="70%" stop-color="rgba(255,255,255,0.16)" />
      <stop offset="90%" stop-color="rgba(255,255,255,0.05)" />
      <stop offset="100%" stop-color="rgba(255,255,255,0.0)" />
    </linearGradient>
  </defs>

  <!-- Melted Ice Cream Drip Silhouette with Soft Cast Shadow -->
  <path d="{path_d}" fill="url(#meltedRoseDripGrad)" filter="url(#meltedDropShadow)" />
  <!-- Gloss Surface Reflection -->
  <path d="{path_d}" fill="url(#dripGlossSheen)" opacity="0.65" />
</svg>'''

out_path = 'assets/organic-cream-drips.svg'
with open(out_path, 'w', encoding='utf-8') as f:
    f.write(svg_markup)

print(f"Successfully updated {out_path} with smooth reference-matching drips!")
