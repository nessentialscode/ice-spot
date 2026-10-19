import json

with open(r'c:\Users\jasim\Web Project\Enterprises\Ice cream\Icespot\assets\sticks\sticks_data.json') as f:
    data = json.load(f)

html = []
html.append('      <!-- ====================================================================')
html.append('           TEN ICE CREAM STICKS CIRCULAR ATTRACTION')
html.append('           ==================================================================== -->')
html.append('      <div class="sticks-wheel-stage" id="sticksWheelStage" aria-label="Ten signature Icespot ice cream sticks arranged in a circle">')
html.append('        <!-- Subtle Icespot Wordmark & Aura Behind Sticks -->')
html.append('        <div class="wheel-backdrop-aura" aria-hidden="true">')
html.append('          <div class="wheel-aura-glow"></div>')
html.append('          <div class="wheel-center-wordmark">')
html.append('            <span class="wm-text">icespot</span>')
html.append('            <span class="wm-sub">Live in Freshness</span>')
html.append('          </div>')
html.append('        </div>')
html.append('')
html.append('        <!-- Interactive Central Flavor Indicator (Updates on hover / mobile tap) -->')
html.append('        <div class="wheel-center-hub" id="wheelCenterHub" aria-live="polite">')
html.append('          <span class="hub-badge" id="hubBadge">Artisanal Sticks</span>')
html.append('          <h2 class="hub-title" id="hubTitle">10 Real Flavours</h2>')
html.append('          <p class="hub-desc" id="hubDesc">Hover or tap any stick to explore</p>')
html.append('        </div>')
html.append('')
html.append('        <!-- The 10 Interactive Ice Cream Sticks -->')
html.append('        <div class="sticks-ring" id="sticksRing">')

for s in data:
    idx = s['index']
    flv = s['flavor']
    left = s['left']
    top = s['top']
    width = s['width']
    height = s['height']
    clip = s['clip_path']
    file_path = s['file']
    name = flv['name']
    tagline = flv['tagline']
    color = flv['color']
    
    html.append(f'          <!-- Stick {idx+1}: {name} -->')
    html.append(f'          <div class="stick-item" id="stick-{flv["id"]}" data-index="{idx}" data-flavor="{name}" data-tagline="{tagline}" data-color="{color}" style="left: {left}%; top: {top}%; width: {width}%; height: {height}%; --stick-color: {color};" role="button" tabindex="0" aria-label="{name}: {tagline}">')
    html.append(f'            <div class="stick-hit-area" style="clip-path: {clip}; -webkit-clip-path: {clip};">')
    html.append(f'              <img src="{file_path}" alt="{name} ice cream stick" class="stick-product-img" loading="eager" draggable="false">')
    html.append('            </div>')
    html.append(f'            <div class="stick-floating-tooltip" aria-hidden="true">{name}</div>')
    html.append('          </div>')

html.append('        </div>')
html.append('      </div>')

output_html = '\n'.join(html)
with open(r'c:\Users\jasim\Web Project\Enterprises\Ice cream\Icespot\scripts\wheel_snippet.html', 'w', encoding='utf-8') as f:
    f.write(output_html)

print('wheel_snippet.html created successfully!')
