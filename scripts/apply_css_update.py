with open(r'c:\Users\jasim\Web Project\Enterprises\Ice cream\Icespot\css\styles.css', 'r', encoding='utf-8') as f:
    css = f.read()

# 1. Update root color tokens
old_tokens = '''  /* Brand Color Tokens */
  --color-hero-red: #E71938;
  --color-hero-red-deep: #D01431;
  --color-hero-crimson: #BA0F29;
  --color-hero-glow: #FF3B56;'''

new_tokens = '''  /* Brand Color Tokens - Elegant Rose-Pink Palette */
  --color-hero-red: #D83162;
  --color-hero-red-deep: #B51B47;
  --color-hero-crimson: #8E1035;
  --color-hero-glow: #FF6584;
  --color-rose-blush: #FF9EBB;
  --color-rose-soft: #FDE8ED;
  --color-rose-deep: #6D0C27;'''

css = css.replace(old_tokens, new_tokens)

# 2. Update brand-logo in header
old_logo = '''.brand-logo {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-decoration: none;
}

.logo-text {
  font-family: var(--font-main);
  font-size: 2.1rem;
  font-weight: 800;
  color: var(--color-white);
  letter-spacing: -0.5px;
  line-height: 1;
  text-shadow: 0 2px 8px rgba(186, 15, 41, 0.4);
}

.logo-sub {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 2.5px;
  color: rgba(255, 255, 255, 0.9);
  text-transform: uppercase;
  margin-top: 3px;
  margin-left: 2px;
}'''

new_logo = '''.brand-logo {
  display: flex;
  align-items: center;
  text-decoration: none;
}

.header-logo-img {
  height: clamp(38px, 4.5vw, 52px);
  width: auto;
  max-width: 175px;
  object-fit: contain;
  filter: drop-shadow(0 3px 8px rgba(0, 0, 0, 0.2));
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.header-logo-img:hover {
  transform: scale(1.05);
}'''

css = css.replace(old_logo, new_logo)

# 3. Replace hero section and carousel styles with sticks wheel styles
hero_start = '/* ==========================================================================\n   HERO SECTION - FIRST VIEW OF LANDING PAGE (100VH)\n   ========================================================================== */'
hero_end = '/* ==========================================================================\n   SIGNATURE DRIPPING CREAM DIVIDER (IMAGE 2 MATCH)'

start_idx = css.find(hero_start)
end_idx = css.find(hero_end)

if start_idx == -1 or end_idx == -1:
    print('Error: hero sections not found in styles.css', start_idx, end_idx)
    exit(1)

new_hero_css = '''/* ==========================================================================
   HERO SECTION - ROSE-PINK LANDING PAGE WITH 10 CIRCULAR ICE CREAM STICKS
   ========================================================================== */
.hero-section {
  position: relative;
  width: 100%;
  min-height: 100vh;
  padding-top: 95px;
  padding-bottom: 35px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  overflow: visible;
  color: var(--color-white);
  background: radial-gradient(circle at 50% 46%, #F46087 0%, #D83162 42%, #B51B47 75%, #6D0C27 100%);
}

/* Giant Low-Opacity Background Wordmark */
.hero-watermark {
  position: absolute;
  top: 8%;
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-main);
  font-size: clamp(4.5rem, 11vw, 10rem);
  font-weight: 900;
  color: rgba(255, 255, 255, 0.09);
  letter-spacing: -2px;
  user-select: none;
  pointer-events: none;
  z-index: 1;
  white-space: nowrap;
  line-height: 0.9;
  font-style: italic;
}

/* Floating Decorative Elements */
.floating-decor {
  position: absolute;
  pointer-events: none;
  z-index: 15;
  user-select: none;
}

.decor-strawberry-top {
  top: 95px;
  left: max(20px, calc(50% - 620px));
  width: 100px;
  filter: blur(2px) drop-shadow(0 12px 20px rgba(0,0,0,0.25));
  animation: floatSubtle 7s ease-in-out infinite;
}

.decor-almonds-right {
  top: 260px;
  right: max(20px, calc(50% - 620px));
  width: 140px;
  filter: blur(1.5px) drop-shadow(0 12px 20px rgba(0,0,0,0.22));
  animation: floatReverse 8s ease-in-out infinite;
}

.decor-almonds-bottom-left {
  bottom: -80px;
  left: max(10px, calc(50% - 660px));
  width: 240px;
  filter: drop-shadow(0 18px 25px rgba(60, 5, 20, 0.35));
  animation: floatSubtle 9s ease-in-out infinite 1s;
}

.decor-strawberry-bottom-right {
  bottom: -45px;
  right: max(15px, calc(50% - 620px));
  width: 175px;
  filter: drop-shadow(0 18px 25px rgba(60, 5, 20, 0.35));
  animation: floatReverse 8.5s ease-in-out infinite 0.5s;
}

@keyframes floatSubtle {
  0%, 100% { transform: translateY(0px) rotate(0deg); }
  50% { transform: translateY(-10px) rotate(2deg); }
}

@keyframes floatReverse {
  0%, 100% { transform: translateY(0px) rotate(0deg); }
  50% { transform: translateY(12px) rotate(-2deg); }
}

/* ==========================================================================
   TEN ICE CREAM STICKS CIRCULAR ARRANGEMENT
   ========================================================================== */
.sticks-wheel-stage {
  position: relative;
  width: min(92vw, 650px);
  height: min(88vw, 625px);
  aspect-ratio: 1024 / 985;
  margin: 10px auto 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
  user-select: none;
}

/* Backdrop Soft Aura & Subtle icespot Wordmark Behind Sticks */
.wheel-backdrop-aura {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 52%;
  height: 52%;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 5;
}

.wheel-aura-glow {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.25) 0%, rgba(255, 158, 187, 0.15) 50%, transparent 72%);
  filter: blur(16px);
  animation: auraPulse 6s ease-in-out infinite alternate;
}

@keyframes auraPulse {
  0% { transform: scale(0.94); opacity: 0.65; }
  100% { transform: scale(1.08); opacity: 1; }
}

.wheel-center-wordmark {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  pointer-events: none;
  transition: opacity 0.35s ease, transform 0.35s ease;
}

.wheel-center-wordmark .wm-text {
  font-family: var(--font-main);
  font-size: clamp(2.2rem, 5.5vw, 3.8rem);
  font-weight: 900;
  color: rgba(255, 255, 255, 0.22);
  letter-spacing: -1.5px;
  line-height: 0.95;
  text-transform: lowercase;
  text-shadow: 0 2px 14px rgba(109, 12, 39, 0.35);
}

.wheel-center-wordmark .wm-sub {
  font-family: var(--font-body);
  font-size: clamp(0.55rem, 1.2vw, 0.75rem);
  font-weight: 700;
  letter-spacing: 2.2px;
  color: rgba(255, 255, 255, 0.32);
  text-transform: uppercase;
  margin-top: 5px;
}

/* Interactive Central Flavor Hub */
.wheel-center-hub {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0.92);
  width: 52%;
  max-width: 260px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  pointer-events: none;
  z-index: 8;
  opacity: 0;
  transition: opacity 0.32s ease, transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.wheel-center-hub.is-active {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
}

.wheel-center-hub .hub-badge {
  font-size: 0.65rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: #FFFFFF;
  background: rgba(255, 255, 255, 0.22);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  padding: 3px 12px;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  margin-bottom: 5px;
}

.wheel-center-hub .hub-title {
  font-family: var(--font-main);
  font-size: clamp(1rem, 2.4vw, 1.35rem);
  font-weight: 800;
  color: #FFFFFF;
  line-height: 1.15;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
  margin-bottom: 3px;
}

.wheel-center-hub .hub-desc {
  font-size: clamp(0.68rem, 1.4vw, 0.8rem);
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.25;
  max-width: 90%;
}

/* The Sticks Ring Container */
.sticks-ring {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 12;
}

/* Individual Stick Item */
.stick-item {
  position: absolute;
  transform-origin: center center;
  cursor: pointer;
  z-index: 15;
  outline: none;
  touch-action: manipulation;
  transition: transform 0.38s cubic-bezier(0.34, 1.56, 0.64, 1),
              filter 0.35s cubic-bezier(0.25, 1, 0.5, 1);
  will-change: transform, filter;
}

/* Hit Area with precise convex polygon clip-path */
.stick-hit-area {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}

.stick-product-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  pointer-events: none;
  filter: drop-shadow(0 8px 16px rgba(60, 5, 20, 0.28));
  transition: filter 0.35s ease;
}

/* Floating Tooltip */
.stick-floating-tooltip {
  position: absolute;
  bottom: -22px;
  left: 50%;
  transform: translateX(-50%) translateY(5px);
  background: rgba(30, 5, 15, 0.88);
  color: #FFFFFF;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 8px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.25s ease, transform 0.25s ease;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  z-index: 60;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

/* ==========================================================================
   INTERACTIVE HOVER & ACTIVE/TAP STATES
   ========================================================================== */
.stick-item:hover,
.stick-item:focus-visible,
.stick-item.is-selected {
  z-index: 50;
  transform: scale(1.16);
}

.stick-item:hover .stick-product-img,
.stick-item:focus-visible .stick-product-img,
.stick-item.is-selected .stick-product-img {
  filter: drop-shadow(0 16px 30px rgba(0, 0, 0, 0.42))
          drop-shadow(0 0 22px var(--stick-color, rgba(255, 255, 255, 0.7)));
}

.stick-item:hover .stick-floating-tooltip,
.stick-item.is-selected .stick-floating-tooltip {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) translateY(0);
}

.sticks-wheel-stage.has-active .wheel-center-wordmark {
  opacity: 0.12;
  transform: scale(0.9);
}

/* Hero Typography Block */
.hero-content {
  position: relative;
  z-index: 20;
  max-width: 800px;
  margin-top: 0;
}

.hero-headline {
  font-family: var(--font-main);
  font-size: clamp(1.8rem, 3.2vw, 2.6rem);
  font-weight: 800;
  letter-spacing: -0.5px;
  line-height: 1.15;
  color: var(--color-white);
  text-shadow: 0 3px 12px rgba(109, 12, 39, 0.4);
  margin-bottom: 4px;
}

.hero-subtitle {
  font-family: var(--font-body);
  font-size: clamp(0.88rem, 1.2vw, 1.05rem);
  font-weight: 500;
  color: rgba(255, 255, 255, 0.95);
  margin-bottom: 12px;
  letter-spacing: 0.2px;
}

@media (max-width: 768px) {
  .site-header {
    padding: 16px 20px;
  }
  .header-logo-img {
    height: 40px;
  }
  .sticks-wheel-stage {
    width: min(94vw, 420px);
    height: min(90vw, 404px);
    margin: 8px auto 16px;
  }
  .hero-section {
    padding-top: 80px;
    padding-bottom: 40px;
  }
  .stick-floating-tooltip {
    display: none;
  }
}

'''

css = css[:start_idx] + new_hero_css + css[end_idx:]

with open(r'c:\Users\jasim\Web Project\Enterprises\Ice cream\Icespot\css\styles.css', 'w', encoding='utf-8') as f:
    f.write(css)

print('Updated styles.css successfully!')
