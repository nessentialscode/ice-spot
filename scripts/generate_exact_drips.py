import cv2
import numpy as np
from scipy.interpolate import splprep, splev

# Load reference image
img_path = r'C:\Users\jasim\.gemini\antigravity-ide\brain\747871f2-c6c6-4430-99d9-00131e3466c3\.user_uploaded\media_1792387939700.png'
img = cv2.imread(img_path)
h, w = img.shape[:2]

# HSV mask to isolate pink drips
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
mask1 = cv2.inRange(hsv, np.array([150, 50, 50]), np.array([180, 255, 255]))
mask2 = cv2.inRange(hsv, np.array([0, 50, 50]), np.array([10, 255, 255]))
mask = cv2.bitwise_or(mask1, mask2)

# Ensure top and sides are solid
mask[:40, :] = 255
mask[:, 0] = 255
mask[:, -1] = 255

# Morphological closing to smooth tiny pixel noise
kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
mask_clean = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

# Find contour
contours, _ = cv2.findContours(mask_clean, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
cnt = max(contours, key=cv2.contourArea)[:, 0, :]

# Filter only the bottom edge (points where Y > 40, sorted from x=0 to x=w-1)
# Trace x from 0 to w-1
bottom_pts = []
for x in range(w):
    col = np.where(mask_clean[:, x] > 0)[0]
    if len(col) > 0:
        y_max = np.max(col)
        bottom_pts.append([x, y_max])
    else:
        bottom_pts.append([x, 140])

bottom_pts = np.array(bottom_pts, dtype=np.float64)

# Apply Gaussian smoothing to remove raster discretization artifacts while preserving drip curves
from scipy.ndimage import gaussian_filter1d
y_smoothed = gaussian_filter1d(bottom_pts[:, 1], sigma=2.0)

# Resample along the curve with N equidistant points
N = 250
x_samples = np.linspace(0, w-1, N)
y_samples = np.interp(x_samples, bottom_pts[:, 0], y_smoothed)

# Generate smooth SVG path using cubic Bezier curve segments (Catmull-Rom to Cubic Bezier conversion)
points = list(zip(x_samples, y_samples))

def catmull_rom_to_bezier(pts):
    d = []
    # Start at top-left
    d.append("M 0 0")
    d.append(f"L 0 {pts[0][1]:.1f}")
    
    n = len(pts)
    for i in range(n - 1):
        p0 = pts[max(0, i - 1)]
        p1 = pts[i]
        p2 = pts[i + 1]
        p3 = pts[min(n - 1, i + 2)]
        
        # Control points for cubic bezier
        c1x = p1[0] + (p2[0] - p0[0]) / 6.0
        c1y = p1[1] + (p2[1] - p0[1]) / 6.0
        c2x = p2[0] - (p3[0] - p1[0]) / 6.0
        c2y = p2[1] - (p3[1] - p1[1]) / 6.0
        
        d.append(f"C {c1x:.2f} {c1y:.2f}, {c2x:.2f} {c2y:.2f}, {p2[0]:.2f} {p2[1]:.2f}")
    
    # Close path at top-right
    d.append(f"L {w} 0")
    d.append("Z")
    return " ".join(d)

path_d = catmull_rom_to_bezier(points)

# We want the SVG viewBox to correspond to the drip area
# In the reference image, the drips start around Y=0 (or we normalize so top is Y=0 and max height is ~240)
# ViewBox: 0 0 1024 240
svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} 248" preserveAspectRatio="none" style="display:block; width:100%; height:100%;">
  <defs>
    <!-- Perfectly matched rose-pink to deep crimson gradient -->
    <linearGradient id="roseCreamGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#D83162" />
      <stop offset="35%" stop-color="#C72251" />
      <stop offset="70%" stop-color="#B21644" />
      <stop offset="100%" stop-color="#960E36" />
    </linearGradient>

    <!-- Subtle soft 3D melted drip shadow -->
    <filter id="softMeltShadow" x="-5%" y="0%" width="110%" height="140%">
      <feDropShadow dx="0" dy="5" stdDeviation="5.5" flood-color="#52071C" flood-opacity="0.22" />
    </filter>

    <!-- Translucent liquid gloss sheen overlay -->
    <linearGradient id="liquidGloss" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.0)" />
      <stop offset="25%" stop-color="rgba(255,255,255,0.12)" />
      <stop offset="50%" stop-color="rgba(255,255,255,0.04)" />
      <stop offset="75%" stop-color="rgba(255,255,255,0.15)" />
      <stop offset="100%" stop-color="rgba(255,255,255,0.0)" />
    </linearGradient>
  </defs>

  <!-- Solid white backing in case of any subpixel gap -->
  <g filter="url(#softMeltShadow)">
    <path d="{path_d}" fill="url(#roseCreamGrad)" />
  </g>
  <path d="{path_d}" fill="url(#liquidGloss)" opacity="0.6" />
</svg>'''

with open('assets/exact-ref-drips.svg', 'w', encoding='utf-8') as f:
    f.write(svg_content)

print(f"Generated assets/exact-ref-drips.svg with {len(points)} smooth bezier nodes!")
