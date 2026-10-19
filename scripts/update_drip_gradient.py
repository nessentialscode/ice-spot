with open('assets/organic-cream-drips.svg', 'r', encoding='utf-8') as f:
    svg = f.read()

# Replace the gradient stops with the exact bottom tone of the hero section
old_grad = '''    <linearGradient id="meltedRoseDripGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#C52352" />
      <stop offset="35%" stop-color="#B81A49" />
      <stop offset="70%" stop-color="#A1123D" />
      <stop offset="100%" stop-color="#840A2E" />
    </linearGradient>'''

new_grad = '''    <linearGradient id="meltedRoseDripGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#B11D47" />
      <stop offset="35%" stop-color="#9E163D" />
      <stop offset="70%" stop-color="#880E31" />
      <stop offset="100%" stop-color="#6E0824" />
    </linearGradient>'''

svg = svg.replace(old_grad, new_grad)

with open('assets/organic-cream-drips.svg', 'w', encoding='utf-8') as f:
    f.write(svg)

print("Updated organic-cream-drips.svg with seamless matched gradient!")
