/**
 * ICE SPOT VARAVOOR - CORE CLIENT APPLICATION
 * Production Factory & Central Franchise Hub
 * High-performance, dependency-free vanilla JS
 */

document.addEventListener('DOMContentLoaded', () => {
  initSticksWheel();
  initFlavoursShowcase();
  initBranchDirectory();
  initOrderModal();
  initNavigation();
});

/* ==========================================================================
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

/* ==========================================================================
   EXPLORE OUR FLAVOURS - SEMICIRCULAR HORIZONTAL SCROLLING SHOWCASE
   High-performance curved arc physics, pointer drag, wheel, inertia,
   and dynamic transform calculations.
   ========================================================================== */
function initFlavoursShowcase() {
  const stage = document.getElementById('semicircleStage');
  const viewport = document.getElementById('semicircleViewport');
  const track = document.getElementById('semicircleTrack');
  const prevBtn = document.getElementById('showcasePrevBtn');
  const nextBtn = document.getElementById('showcaseNextBtn');
  const dotsContainer = document.getElementById('showcaseDots');
  const hubCard = document.getElementById('showcaseHubCard');
  const hubTitle = document.getElementById('hubTitleText');
  const hubCategory = document.getElementById('hubCategoryPill');
  const hubDesc = document.getElementById('hubDescText');
  const hubInquireBtn = document.getElementById('hubInquireBtn');

  if (!viewport || !track) return;

  const items = Array.from(track.querySelectorAll('.showcase-item'));
  const dotBtns = dotsContainer ? Array.from(dotsContainer.querySelectorAll('.showcase-dot-btn')) : [];
  const total = items.length;
  if (!total) return;

  // Initial state: Start at index 2 (Alphonso Mango)
  let currentPos = 2; // Floating current index
  let targetPos = 2;  // Target index
  let lastCenteredIdx = -1;
  let isDragging = false;
  let hasMoved = false;
  let startX = 0;
  let startY = 0;
  let startPos = 0;
  let lastX = 0;
  let lastTime = 0;
  let velocityX = 0;
  let rafId = null;

  // Responsive geometry parameters
  function getMetrics() {
    const w = window.innerWidth;
    if (w <= 480) {
      return {
        spacingX: 110,
        apexY: 25,
        angleStep: 13.0,
        curveDrop: 24,
        maxVisibleU: 2.8,
        itemWidth: 100,
        itemHeight: 250
      };
    } else if (w <= 768) {
      return {
        spacingX: 140,
        apexY: 30,
        angleStep: 11.5,
        curveDrop: 20,
        maxVisibleU: 3.3,
        itemWidth: 115,
        itemHeight: 285
      };
    } else if (w <= 1024) {
      return {
        spacingX: 175,
        apexY: 36,
        angleStep: 10.2,
        curveDrop: 17,
        maxVisibleU: 3.8,
        itemWidth: 130,
        itemHeight: 315
      };
    } else {
      return {
        spacingX: 210,
        apexY: 42,
        angleStep: 9.4,
        curveDrop: 15,
        maxVisibleU: 4.4,
        itemWidth: 145,
        itemHeight: 345
      };
    }
  }

  let metrics = getMetrics();

  window.addEventListener('resize', () => {
    metrics = getMetrics();
    items.forEach(it => {
      it.style.setProperty('--item-w', `${metrics.itemWidth}px`);
      it.style.setProperty('--item-h', `${metrics.itemHeight}px`);
    });
    renderPositions();
  }, { passive: true });

  // Set initial dimensions
  items.forEach(it => {
    it.style.setProperty('--item-w', `${metrics.itemWidth}px`);
    it.style.setProperty('--item-h', `${metrics.itemHeight}px`);
  });

  // Calculate and apply position/rotation/scale for each item along the semicircular arc
  function renderPositions() {
    const maxU = metrics.maxVisibleU;

    items.forEach((item, idx) => {
      // u: relative distance from center in index units
      const u = idx - currentPos;
      const absU = Math.abs(u);

      if (absU > maxU + 0.9) {
        item.style.visibility = 'hidden';
        item.style.opacity = '0';
        item.style.pointerEvents = 'none';
        return;
      }

      item.style.visibility = 'visible';
      item.style.pointerEvents = 'auto';

      // Arc coordinates
      const x = u * metrics.spacingX;
      // Downward-opening arc: y = apexY + drop * (u^2)
      const y = metrics.apexY + metrics.curveDrop * (u * u);
      // Rotation: tangent angle along downward arc
      const rotation = u * metrics.angleStep;

      // Base scale slightly diminishes at extreme flanks
      const scale = Math.max(0.82, 1 - (absU * 0.045));

      // Natural z-index: center is higher, flanks lower
      const zIndex = Math.round(150 - absU * 15);

      // Smooth opacity falloff beyond visible bounds
      let opacity = 1;
      if (absU > maxU) {
        opacity = Math.max(0, 1 - (absU - maxU) / 0.9);
      }

      item.style.zIndex = zIndex;
      item.style.opacity = opacity.toFixed(3);
      item.style.transform = `translate3d(calc(-50% + ${x.toFixed(1)}px), ${y.toFixed(1)}px, 0) rotate(${rotation.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
    });

    // Update Hub and active states
    const centerIdx = Math.max(0, Math.min(total - 1, Math.round(currentPos)));
    if (centerIdx !== lastCenteredIdx) {
      lastCenteredIdx = centerIdx;
      updateActiveFlavour(centerIdx);
    }

    // Update navigation arrow states
    if (prevBtn) {
      const isAtStart = targetPos <= 0.05;
      prevBtn.disabled = isAtStart;
      prevBtn.classList.toggle('is-disabled', isAtStart);
    }
    if (nextBtn) {
      const isAtEnd = targetPos >= total - 1 - 0.05;
      nextBtn.disabled = isAtEnd;
      nextBtn.classList.toggle('is-disabled', isAtEnd);
    }
  }

  function updateActiveFlavour(idx) {
    items.forEach((it, i) => {
      it.classList.toggle('is-center-item', i === idx);
    });

    dotBtns.forEach((dot, i) => {
      const isActive = i === idx;
      dot.classList.toggle('active', isActive);
      dot.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    const activeItem = items[idx];
    if (!activeItem) return;

    const flavor = activeItem.getAttribute('data-flavor') || '';
    const tagline = activeItem.getAttribute('data-tagline') || '';
    const category = activeItem.getAttribute('data-category') || 'Artisanal Flavour';
    const color = activeItem.getAttribute('data-color') || '#d83162';

    if (hubTitle) hubTitle.textContent = flavor;
    if (hubDesc) hubDesc.textContent = tagline;
    if (hubCategory) {
      hubCategory.textContent = category;
      hubCategory.style.borderColor = `${color}44`;
      hubCategory.style.color = color;
      hubCategory.style.background = `${color}14`;
    }
    if (hubInquireBtn) {
      hubInquireBtn.setAttribute('data-item', flavor);
    }
  }

  // Physics animation loop with smooth lerp
  function animate() {
    const diff = targetPos - currentPos;
    if (Math.abs(diff) > 0.001) {
      currentPos += diff * 0.12;
      renderPositions();
      rafId = requestAnimationFrame(animate);
    } else {
      currentPos = targetPos;
      renderPositions();
      rafId = null;
    }
  }

  function startAnimation() {
    if (!rafId) {
      rafId = requestAnimationFrame(animate);
    }
  }

  function goToIndex(idx) {
    targetPos = Math.max(0, Math.min(total - 1, idx));
    startAnimation();
  }

  // Previous & Next navigation buttons
  if (prevBtn) {
    prevBtn.addEventListener('click', (e) => {
      e.preventDefault();
      goToIndex(Math.round(targetPos) - 1);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', (e) => {
      e.preventDefault();
      goToIndex(Math.round(targetPos) + 1);
    });
  }

  // Dot click navigation
  dotBtns.forEach((dot, idx) => {
    dot.addEventListener('click', (e) => {
      e.preventDefault();
      goToIndex(idx);
    });
  });

  // Pointer drag interactions (Touch + Mouse)
  viewport.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    isDragging = true;
    hasMoved = false;
    startX = e.clientX;
    startY = e.clientY;
    startPos = targetPos;
    lastX = e.clientX;
    lastTime = performance.now();
    velocityX = 0;

    viewport.classList.add('is-dragging');
    viewport.setPointerCapture(e.pointerId);
  });

  viewport.addEventListener('pointermove', (e) => {
    if (!isDragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!hasMoved && Math.hypot(dx, dy) > 6) {
      hasMoved = true;
    }

    const now = performance.now();
    const dt = Math.max(1, now - lastTime);
    velocityX = (e.clientX - lastX) / dt;
    lastX = e.clientX;
    lastTime = now;

    const deltaIndex = -dx / metrics.spacingX;
    targetPos = Math.max(-0.4, Math.min(total - 0.6, startPos + deltaIndex));
    startAnimation();
  });

  function endDrag(e) {
    if (!isDragging) return;
    isDragging = false;
    viewport.classList.remove('is-dragging');

    try {
      viewport.releasePointerCapture(e.pointerId);
    } catch (_) {}

    if (hasMoved) {
      let flickOffset = 0;
      if (Math.abs(velocityX) > 0.35) {
        flickOffset = -velocityX * 0.45;
      }
      targetPos = Math.round(targetPos + flickOffset);
      targetPos = Math.max(0, Math.min(total - 1, targetPos));
      startAnimation();
    }
  }

  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);

  // Click on individual items: click to center
  items.forEach((item, idx) => {
    item.addEventListener('click', () => {
      if (hasMoved) return;
      goToIndex(idx);
    });

    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        goToIndex(idx);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        goToIndex(Math.min(total - 1, idx + 1));
        const next = items[Math.min(total - 1, idx + 1)];
        if (next) next.focus();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goToIndex(Math.max(0, idx - 1));
        const prev = items[Math.max(0, idx - 1)];
        if (prev) prev.focus();
      }
    });
  });

  // Trackpad horizontal swipe & mouse wheel
  let wheelTimeout = null;
  viewport.addEventListener('wheel', (e) => {
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : (e.shiftKey ? e.deltaY : 0);
    if (Math.abs(delta) > 5) {
      e.preventDefault();
      targetPos += delta * 0.0022;
      targetPos = Math.max(0, Math.min(total - 1, targetPos));
      startAnimation();

      if (wheelTimeout) clearTimeout(wheelTimeout);
      wheelTimeout = setTimeout(() => {
        targetPos = Math.round(targetPos);
        startAnimation();
      }, 120);
    }
  }, { passive: false });

  // Initial draw
  renderPositions();
}

/* ==========================================================================
   BRANCHES DIRECTORY SEARCH & FILTER
   ========================================================================== */
const branchData = [
  { name: "Ice Spot Varavoor Factory", location: "Main Production Factory & Central Franchise Hub, Varavoor, Wadakkanchery", district: "Thrissur", region: "thrissur", status: "factory" },
  { name: "Ice Spot Thrissur Town", location: "Round West, Thrissur Central", district: "Thrissur", region: "thrissur", status: "confirmed" },
  { name: "Ice Spot Ollur", location: "Company Padi, Bus Stop, High Road, near Fun Movies", district: "Thrissur", region: "thrissur", status: "confirmed" },
  { name: "Ice Spot Thrissur Shakthan", location: "Shakthan Nagar, Thrissur Central", district: "Thrissur", region: "thrissur", status: "candidate" },
  { name: "Ice Spot Pudukad", location: "Pudukad, Thrissur district", district: "Thrissur", region: "thrissur", status: "candidate" },
  { name: "Ice Spot Pallimoola", location: "Pallimoola Junction", district: "Thrissur", region: "thrissur", status: "candidate" },
  { name: "Ice Spot Guruvayur", location: "Near LF College, opposite Rajah Petrol Pump, Mammiyoor–Guruvayur Road", district: "Thrissur", region: "thrissur", status: "candidate" },
  { name: "Ice Spot Kechery", location: "Dubai Road, Kechery", district: "Thrissur", region: "thrissur", status: "candidate" },
  { name: "Ice Spot Vadanappally", location: "Vadanappally, Coastal Thrissur", district: "Thrissur", region: "thrissur", status: "candidate" },
  { name: "Ice Spot Chalakudy", location: "Junction, Tramway Lane, Chalakudy", district: "Thrissur", region: "thrissur", status: "candidate" },
  { name: "Ice Spot Triprayar", location: "Triprayar Temple Road", district: "Thrissur", region: "thrissur", status: "candidate" },
  { name: "Ice Spot Kattoor", location: "Kattoor Town, Thrissur", district: "Thrissur", region: "thrissur", status: "candidate" },
  { name: "Ice Spot Wadakkanchery", location: "Wadakkanchery Junction", district: "Thrissur", region: "thrissur", status: "candidate" },
  { name: "Ice Spot Kanjani", location: "Kanjani Road, Thrissur", district: "Thrissur", region: "thrissur", status: "candidate" },
  { name: "Ice Spot Palakkad", location: "Palakkad Town", district: "Palakkad", region: "palakkad", status: "candidate" },
  { name: "Ice Spot Kadampuzha", location: "Kadampuzha Temple Road", district: "Malappuram", region: "other", status: "candidate" },
  { name: "Ice Spot Cusat Road", location: "Cusat Road, Kalamassery, Ernakulam", district: "Ernakulam", region: "ernakulam", status: "candidate" }
];

function initBranchDirectory() {
  const grid = document.getElementById('branchesGrid');
  const searchInput = document.getElementById('branchSearch');
  const filterBtns = document.querySelectorAll('.branch-filter-btn');

  if (!grid) return;

  function renderBranches(filterRegion = 'all', searchQuery = '') {
    grid.innerHTML = '';

    const query = searchQuery.toLowerCase().trim();

    const filtered = branchData.filter(b => {
      const matchesRegion = (filterRegion === 'all' || b.region === filterRegion);
      const matchesSearch = !query || b.name.toLowerCase().includes(query) || b.location.toLowerCase().includes(query) || b.district.toLowerCase().includes(query);

      return matchesRegion && matchesSearch;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--color-text-muted);">No matching branch locations found. You can visit our confirmed flagship factory at <strong>Varavoor, Thrissur</strong>!</div>`;
      return;
    }

    filtered.forEach(branch => {
      const card = document.createElement('div');
      card.className = 'branch-card';
      
      let badgeLabel = 'Location Listing';
      let badgeClass = 'status-candidate';
      if (branch.status === 'factory') {
        badgeLabel = 'Main Franchise';
        badgeClass = 'status-factory';
      } else if (branch.status === 'confirmed') {
        badgeLabel = 'Verified Branch';
        badgeClass = 'status-confirmed';
      }

      card.innerHTML = `
        <div class="branch-card-header">
          <h4 class="branch-card-title">${branch.name}</h4>
          <span class="branch-status-badge ${badgeClass}">
            ${badgeLabel}
          </span>
        </div>
        <p class="branch-card-location">${branch.location}</p>
        <div class="branch-card-footer">
          <span class="branch-region-tag">📍 ${branch.district}</span>
          <a href="#contact" class="branch-link">View Details &rarr;</a>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  // Initial render
  renderBranches();

  // Region filter clicks
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderBranches(btn.dataset.region, searchInput ? searchInput.value : '');
    });
  });

  // Search input typing
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const activeBtn = document.querySelector('.branch-filter-btn.active');
      const currentRegion = activeBtn ? activeBtn.dataset.region : 'all';
      renderBranches(currentRegion, e.target.value);
    });
  }
}

/* ==========================================================================
   ORDER MODAL & DIRECT ORDERING
   ========================================================================== */
function initOrderModal() {
  const modal = document.getElementById('orderModal');
  const closeBtn = document.querySelector('.modal-close');
  const orderBtns = document.querySelectorAll('.open-order-modal, .btn-order-pill, .btn-card-inquire');

  orderBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const itemName = btn.dataset.item || 'Ice Cream Special';
      const modalItemLabel = document.getElementById('modalSelectedProduct');
      if (modalItemLabel) {
        modalItemLabel.textContent = itemName;
      }
      if (modal) modal.classList.add('open');
    });
  });

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('open');
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });
  }

  // WhatsApp Order Button in modal
  const waBtn = document.getElementById('btnOrderWhatsApp');
  if (waBtn) {
    waBtn.addEventListener('click', () => {
      const modalItemLabel = document.getElementById('modalSelectedProduct');
      const item = modalItemLabel ? modalItemLabel.textContent : 'Ice Cream Flavours';
      const message = encodeURIComponent(`Hello Ice Spot Varavoor Factory! I would like to inquire about: ${item}. Could you please share available flavours, franchise details, and factory timings?`);
      window.open(`https://wa.me/?text=${message}`, '_blank');
      if (modal) modal.classList.remove('open');
    });
  }
}

/* ==========================================================================
   NAVIGATION & SCROLL SPY
   ========================================================================== */
function initNavigation() {
  const links = document.querySelectorAll('.nav-link');
  const sections = document.querySelectorAll('section[id], header[id]');
  const mobileToggle = document.querySelector('.mobile-nav-toggle');
  const mainNav = document.querySelector('.main-nav');

  // Mobile menu toggle
  if (mobileToggle && mainNav) {
    mobileToggle.addEventListener('click', () => {
      mainNav.classList.toggle('mobile-open');
      mobileToggle.textContent = mainNav.classList.contains('mobile-open') ? '✕' : '☰';
    });

    links.forEach(link => {
      link.addEventListener('click', () => {
        mainNav.classList.remove('mobile-open');
        if (mobileToggle) mobileToggle.textContent = '☰';
      });
    });
  }

  // Scroll spy to update active link
  window.addEventListener('scroll', () => {
    let current = '';
    const scrollPos = window.scrollY + 150;

    sections.forEach(section => {
      const top = section.offsetTop;
      const height = section.offsetHeight;
      if (scrollPos >= top && scrollPos < top + height) {
        current = section.getAttribute('id');
      }
    });

    links.forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('href') === `#${current}`) {
        link.classList.add('active');
      }
    });
  });
}
