with open(r'c:\Users\jasim\Web Project\Enterprises\Ice cream\Icespot\js\main.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Replace initHeroCarousel() call in DOMContentLoaded
js = js.replace('  initHeroCarousel();', '  initSticksWheel();')

# Find start and end of initHeroCarousel function
start_marker = '/* ==========================================================================\n   HERO 3-SLIDE PROMOTIONAL CAROUSEL'
end_marker = '/* ==========================================================================\n   FLAVOURS FILTERING'

start_idx = js.find(start_marker)
end_idx = js.find(end_marker)

if start_idx == -1 or end_idx == -1:
    print('Error finding markers in main.js', start_idx, end_idx)
    exit(1)

new_sticks_wheel_js = '''/* ==========================================================================
   TEN ICE CREAM STICKS INTERACTIVE CIRCULAR WHEEL
   Desktop hover & mobile tap interactions
   ========================================================================== */
function initSticksWheel() {
  const wheelStage = document.getElementById('sticksWheelStage');
  const sticks = document.querySelectorAll('.stick-item');
  const centerHub = document.getElementById('wheelCenterHub');
  const hubBadge = document.getElementById('hubBadge');
  const hubTitle = document.getElementById('hubTitle');
  const hubDesc = document.getElementById('hubDesc');

  if (!wheelStage || !sticks.length) return;

  let activeStick = null;
  let resetTimeout = null;

  function activateStick(stick) {
    if (!stick) return;

    if (resetTimeout) {
      clearTimeout(resetTimeout);
      resetTimeout = null;
    }

    // Remove active state from any other stick
    sticks.forEach(s => {
      if (s !== stick) {
        s.classList.remove('is-selected');
      }
    });

    stick.classList.add('is-selected');
    activeStick = stick;
    wheelStage.classList.add('has-active');

    // Update central hub info
    const flavor = stick.getAttribute('data-flavor') || '';
    const tagline = stick.getAttribute('data-tagline') || '';
    const color = stick.getAttribute('data-color') || '#ffffff';

    if (hubTitle) hubTitle.textContent = flavor;
    if (hubDesc) hubDesc.textContent = tagline;
    if (hubBadge) {
      hubBadge.textContent = 'Flavour Highlight';
      hubBadge.style.borderColor = color;
      hubBadge.style.boxShadow = `0 0 14px ${color}88`;
    }

    if (centerHub) {
      centerHub.classList.add('is-active');
    }
  }

  function deactivateStick(stick) {
    if (!stick) return;
    stick.classList.remove('is-selected');

    if (activeStick === stick) {
      activeStick = null;
    }

    // Smooth reset timeout
    resetTimeout = setTimeout(() => {
      const anySelected = document.querySelector('.stick-item.is-selected');
      if (!anySelected) {
        wheelStage.classList.remove('has-active');
        if (centerHub) centerHub.classList.remove('is-active');
      }
    }, 180);
  }

  // Attach hover and click/tap handlers
  sticks.forEach((stick, idx) => {
    // Desktop hover
    stick.addEventListener('mouseenter', () => {
      activateStick(stick);
    });

    stick.addEventListener('mouseleave', () => {
      deactivateStick(stick);
    });

    // Keyboard focus accessibility
    stick.addEventListener('focus', () => {
      activateStick(stick);
    });

    stick.addEventListener('blur', () => {
      deactivateStick(stick);
    });

    // Click & Mobile tap
    stick.addEventListener('click', (e) => {
      e.stopPropagation();
      activateStick(stick);
    });

    // Keyboard navigation between sticks (Arrow keys)
    stick.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activateStick(stick);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIdx = (idx + 1) % sticks.length;
        sticks[nextIdx].focus();
        activateStick(sticks[nextIdx]);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIdx = (idx - 1 + sticks.length) % sticks.length;
        sticks[prevIdx].focus();
        activateStick(sticks[prevIdx]);
      }
    });
  });

  // Tap outside to deselect on touch devices
  document.addEventListener('click', (e) => {
    if (!wheelStage.contains(e.target)) {
      sticks.forEach(s => s.classList.remove('is-selected'));
      wheelStage.classList.remove('has-active');
      if (centerHub) centerHub.classList.remove('is-active');
      activeStick = null;
    }
  });
}

'''

js = js[:start_idx] + new_sticks_wheel_js + js[end_idx:]

with open(r'c:\Users\jasim\Web Project\Enterprises\Ice cream\Icespot\js\main.js', 'w', encoding='utf-8') as f:
    f.write(js)

print('Updated main.js successfully!')
