with open(r'c:\Users\jasim\Web Project\Enterprises\Ice cream\Icespot\scripts\wheel_snippet.html', 'r', encoding='utf-8') as f:
    wheel_html = f.read()

with open(r'c:\Users\jasim\Web Project\Enterprises\Ice cream\Icespot\index.html', 'r', encoding='utf-8') as f:
    idx_content = f.read()

start_target = '<header class="site-header" id="home">'
end_target = '    <!-- ====================================================================\n         SIGNATURE DRIPPING CREAM DIVIDER'

start_pos = idx_content.find(start_target)
end_pos = idx_content.find(end_target)

if start_pos == -1 or end_pos == -1:
    print('Error: targets not found', start_pos, end_pos)
    exit(1)

new_header_and_hero = '''<header class="site-header" id="home">
      <!-- Left: Brand Logo -->
      <a href="#home" class="brand-logo" id="headerLogo" aria-label="Icespot Ollur Home">
        <img src="assets/icespot-logo-new.png" alt="Icespot - Live in Freshness" class="header-logo-img">
      </a>

      <!-- Center: Navigation Links -->
      <nav class="main-nav" id="mainNav" aria-label="Main Navigation">
        <a href="#home" class="nav-link active" id="navHome">Home</a>
        <a href="#flavours" class="nav-link" id="navFlavours">Our Flavours</a>
        <a href="#about" class="nav-link" id="navAbout">Know Us</a>
        <a href="#contact" class="nav-link" id="navContact">Contact Us</a>
      </nav>

      <!-- Right: Explore Now Button & Mobile Toggle -->
      <div style="display: flex; align-items: center; gap: 12px;">
        <a href="#flavours" class="btn-order-pill" id="headerOrderBtn">
          Explore Now
        </a>
        <button class="mobile-nav-toggle" id="mobileNavToggle" aria-label="Toggle navigation menu">
          ☰
        </button>
      </div>
    </header>

    <!-- ====================================================================
         HERO SECTION - ROSE-PINK WITH 10 CIRCULAR ICE CREAM STICKS
         ==================================================================== -->
    <section class="hero-section" id="heroSection">
      
      <!-- Giant Low-Opacity Background Wordmark for Depth -->
      <div class="hero-watermark" aria-hidden="true">Icespot</div>

      <!-- Floating Decorative Objects with Depth of Field -->
      <div class="floating-decor decor-strawberry-top" aria-hidden="true">
        <img src="assets/floating-strawberry.png" alt="" width="110" height="110" loading="eager">
      </div>

      <div class="floating-decor decor-almonds-right" aria-hidden="true">
        <img src="assets/floating-almonds.png" alt="" width="150" height="150" loading="eager">
      </div>

      <div class="floating-decor decor-almonds-bottom-left" aria-hidden="true">
        <img src="assets/floating-almonds.png" alt="" width="220" height="220" loading="eager">
      </div>

      <div class="floating-decor decor-strawberry-bottom-right" aria-hidden="true">
        <img src="assets/floating-strawberry.png" alt="" width="170" height="170" loading="eager">
      </div>

''' + wheel_html + '''

      <!-- Hero Typography Block -->
      <div class="hero-content">
        <h1 class="hero-headline" id="heroHeadline">Indulge in Creamy Delights</h1>
        <p class="hero-subtitle" id="heroSubtitle">10 Signature Handcrafted Sticks &bull; Live in Freshness</p>
      </div>

    </section>

'''

updated_content = idx_content[:start_pos] + new_header_and_hero + idx_content[end_pos:]
with open(r'c:\Users\jasim\Web Project\Enterprises\Ice cream\Icespot\index.html', 'w', encoding='utf-8') as f:
    f.write(updated_content)

print('Updated index.html successfully!')
