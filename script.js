// Heatmap areas on the 2D foot
const toeArea = document.querySelector('.hit-toe');
const insideArea = document.querySelector('.hit-inside');
const lacesArea = document.querySelector('.hit-laces');

// Control buttons
const simButton = document.getElementById('toggle-sim');
const generatorButton = document.getElementById('toggle-generator');
const viewButtons = document.querySelectorAll('.view-selector-btn');
const showcaseViews = document.querySelectorAll('.showcase-view');
const overlays = {
  1: document.getElementById('shoe-overlay-1'),
  2: document.getElementById('shoe-overlay-2'),
  3: document.getElementById('shoe-overlay-3'),
};

// Numeric sensor readouts (exist in multiple views)
const toeNDisplays = document.querySelectorAll('[id^="toeN-display"]');
const insideNDisplays = document.querySelectorAll('[id^="insideN-display"]');
const lacesNDisplays = document.querySelectorAll('[id^="lacesN-display"]');


// ==========================================================
// 2) STATE & TIMERS (what is currently running?)
// ==========================================================

let simInterval = null;        // Simple random simulation timer
let generatorInterval = null;  // Realistic kick generator timer


// ==========================================================
// 3) CONSTANTS (TUNING / CALIBRATION VALUES)
// ==========================================================

// Raw Arduino-like values
const MAX_RAW_VALUE = 800;              // Typical FSR usable range
const BASE_NOISE = 10;                  // Sensor noise floor

// Generator timing
const GENERATOR_FREQUENCY_MS = 150;     // How often data updates
const IMPACT_PHASE_DURATION_MS = 600;   // One full kick duration

// Spike limits (realistic kick force)
const MAX_SPIKE = MAX_RAW_VALUE * 0.95;
const MIN_SPIKE = MAX_RAW_VALUE * 0.7;

// Generator state
let impactEndTime = 0;
let impactZone = null;


// ==========================================================
// 4) VISUAL HELPERS (pressure → color → style)
// ==========================================================

/**
 * Converts normalized pressure (0–1) into green → yellow → red color
 */
function pressureToColor(value) {
  const clamped = Math.min(Math.max(value, 0), 1);

  const hueGreen = 138;
  const hueYellow = 50;
  const hueRed = 0;

  let hue;
  if (clamped < 0.5) {
    const t = clamped / 0.5;
    hue = hueGreen + (hueYellow - hueGreen) * t;
  } else {
    const t = (clamped - 0.5) / 0.5;
    hue = hueYellow + (hueRed - hueYellow) * t;
  }

  return `hsl(${hue}, 85%, ${52 + clamped * 10}%)`;
}

/**
 * Applies glow, scale, color and accessibility label
 */
function applyPressureStyles(area, value) {
  if (!area) return;

  const color = pressureToColor(value);

  area.style.background =
    `radial-gradient(circle at center, ${color} 0%, rgba(12, 20, 27, 0.7) 70%)`;

  area.style.transform = `scale(${0.95 + value * 0.15})`;

  area.style.boxShadow =
    `0 0 ${14 + value * 22}px rgba(13, 242, 119, ${0.25 + value * 0.35})`;

  area.setAttribute(
    'aria-label',
    `${area.dataset.label} trykk: ${(value * 100).toFixed(0)}%`
  );

}
// ==========================================================
// 4.5) 3D OVERLAY DOTS (impact circles on shoe views)
// ==========================================================

// позиции точек в процентах (можешь подвинуть потом)
// left/top — это проценты контейнера shoe-wrapper
const dotPositionsByView = {
  1: { // FRONT
    toe:   { left: 52, top: 72 },
    laces: { left: 52, top: 52 },
    inside:{ left: 40, top: 55 },
  },
  2: { // RIGHT SIDE
    toe:   { left: 58, top: 72 },
    laces: { left: 54, top: 52 },
    inside:{ left: 45, top: 58 },
  },
  3: { // LEFT SIDE
    toe:   { left: 46, top: 72 },
    laces: { left: 50, top: 52 },
    inside:{ left: 58, top: 58 },
  }
};

function ensureDotsForOverlay(overlayEl) {
  if (!overlayEl) return null;
  if (overlayEl._dots) return overlayEl._dots;

  const makeDot = (key, label) => {
    const d = document.createElement('div');
    d.className = 'impact-dot';
    d.dataset.key = key;
    d.dataset.label = label;
    overlayEl.appendChild(d);
    return d;
  };

  overlayEl._dots = {
    toe: makeDot('toe', 'Toe'),
    inside: makeDot('inside', 'Inside'),
    laces: makeDot('laces', 'Laces'),
  };

  return overlayEl._dots;
}

function setDotVisual(dotEl, value01) {
  if (!dotEl) return;

  // показываем точку только если есть заметный сигнал
  const on = value01 > 0.08;
  dotEl.classList.toggle('is-on', on);

  // цвет — твоя функция
  const color = pressureToColor(value01);

  // размер/свечение — от силы
  const sizeScale = 0.85 + value01 * 1.4;

  dotEl.style.background = `radial-gradient(circle, rgba(255,255,255,0.85) 0%, ${color} 35%, rgba(0,0,0,0) 70%)`;
  dotEl.style.transform = `translate(-50%, -50%) scale(${sizeScale.toFixed(2)})`;
  dotEl.style.boxShadow = `0 0 ${8 + value01 * 26}px ${color}`;

  // подпись со значением
  dotEl.dataset.label = `${dotEl.dataset.key}: ${(value01 * 100).toFixed(0)}%`;
}

function updateDotsForView(viewNumber, toeN, insideN, lacesN) {
  const overlay = overlays[viewNumber];
  if (!overlay) return;

  const dots = ensureDotsForOverlay(overlay);
  const pos = dotPositionsByView[viewNumber];
  if (!pos) return;

  // позиция
  dots.toe.style.left = `${pos.toe.left}%`;
  dots.toe.style.top  = `${pos.toe.top}%`;

  dots.inside.style.left = `${pos.inside.left}%`;
  dots.inside.style.top  = `${pos.inside.top}%`;

  dots.laces.style.left = `${pos.laces.left}%`;
  dots.laces.style.top  = `${pos.laces.top}%`;

  // визуал
  setDotVisual(dots.toe, toeN);
  setDotVisual(dots.inside, insideN);
  setDotVisual(dots.laces, lacesN);
}


// ==========================================================
// 5) CORE PIPELINE (RAW → NORMALIZED → UI)
// ==========================================================

/**
 * This is THE MOST IMPORTANT FUNCTION.
 * Everything (simulation, generator, Arduino later) goes through this.
 */
function normalizeAndDisplay(rawToe, rawInside, rawLaces) {

  // --- Normalize raw sensor values (0–800 → 0–1) ---
  const normalize = raw => Math.min(raw, MAX_RAW_VALUE) / MAX_RAW_VALUE;

  const toeN = normalize(rawToe);
  const insideN = normalize(rawInside);
  const lacesN = normalize(rawLaces);

  // --- Update 2D heatmap ---
  applyPressureStyles(toeArea, toeN);
  applyPressureStyles(insideArea, insideN);
  applyPressureStyles(lacesArea, lacesN);

  // --- Update numeric readouts ---
  const sensorData = [
    { displays: toeNDisplays, value: toeN, name: 'toeN' },
    { displays: insideNDisplays, value: insideN, name: 'insideN' },
    { displays: lacesNDisplays, value: lacesN, name: 'lacesN' },
  ];

  let maxVal = -1;

  sensorData.forEach(data => {
    data.displays.forEach(el => {
      el.textContent = `${data.name}: ${data.value.toFixed(2)}`;
      el.classList.remove('highlight');
      maxVal = Math.max(maxVal, data.value);
    });
  });

  // --- Highlight strongest sensor ---
  if (maxVal > 0.1) {
    const maxSensor =
      maxVal === toeN ? 'toeN' :
      maxVal === insideN ? 'insideN' :
      'lacesN';

    document.querySelectorAll('.sensor-display .sensor-value')
      .forEach(el => {
        if (el.id.startsWith(maxSensor)) {
          el.classList.add('highlight');
        }
      });
  }

    // --- Update 3D overlay dots on the ACTIVE view ---
  const activeBtn = document.querySelector('.view-selector-btn.is-active');
  const activeView = activeBtn ? Number(activeBtn.dataset.view) : 1;

  updateDotsForView(activeView, toeN, insideN, lacesN);

  // --- Expose globally (debug / Arduino hook) ---
  window.normalizedValues = { toeN, insideN, lacesN };
}


// ==========================================================
// 6) A) SIMPLE RANDOM SIMULATION (DEMO MODE)
// ==========================================================

function simulateHit() {
  normalizeAndDisplay(
    Math.random() * MAX_RAW_VALUE,
    Math.random() * MAX_RAW_VALUE,
    Math.random() * MAX_RAW_VALUE
  );
}

function startSimulation() {
  if (simInterval) return;
  if (generatorInterval) stopGenerator();

  simulateHit();
  simInterval = setInterval(simulateHit, 500);

  simButton?.classList.add('is-active');
  simButton.textContent = 'Pause simulering';
}

function stopSimulation() {
  clearInterval(simInterval);
  simInterval = null;

  simButton?.classList.remove('is-active');
  simButton.textContent = 'Simuler treff';
}


// ==========================================================
// 7) B) REALISTIC KICK GENERATOR (FSR-LIKE)
// ==========================================================

function generateRealisticImpact() {
  const now = Date.now();

  if (now < impactEndTime) {
    // --- Active kick ---
    const elapsed = impactEndTime - now;
    const peak = IMPACT_PHASE_DURATION_MS * 0.2;

    const ratio =
      elapsed > peak
        ? 1 - (elapsed - peak) / (IMPACT_PHASE_DURATION_MS - peak)
        : elapsed / peak;

    const spikeValue =
      MIN_SPIKE + (MAX_SPIKE - MIN_SPIKE) * ratio;

    let rawToe = BASE_NOISE;
    let rawInside = BASE_NOISE;
    let rawLaces = BASE_NOISE;

    if (impactZone === 'toe') rawToe = spikeValue;
    if (impactZone === 'inside') rawInside = spikeValue;
    if (impactZone === 'laces') rawLaces = spikeValue;

    normalizeAndDisplay(rawToe, rawInside, rawLaces);

  } else {
    // --- Idle noise ---
    normalizeAndDisplay(BASE_NOISE, BASE_NOISE, BASE_NOISE);

    // Random chance to start a kick
    if (Math.random() < 0.01) {
      impactZone = ['toe', 'inside', 'laces'][Math.floor(Math.random() * 3)];
      impactEndTime = now + IMPACT_PHASE_DURATION_MS;
      console.log(`KICK: ${impactZone}`);
    }
  }
}

function startGenerator() {
  if (generatorInterval) return;
  if (simInterval) stopSimulation();

  generatorInterval = setInterval(generateRealisticImpact, GENERATOR_FREQUENCY_MS);
  generatorButton.textContent = 'Pause Generator';
  generatorButton.classList.add('is-active');
}

function stopGenerator() {
  clearInterval(generatorInterval);
  generatorInterval = null;

  normalizeAndDisplay(BASE_NOISE, BASE_NOISE, BASE_NOISE);
  generatorButton.textContent = 'Generator';
  generatorButton.classList.remove('is-active');
}


// ==========================================================
// 8) BUTTON EVENTS
// ==========================================================

simButton?.addEventListener('click', () =>
  simInterval ? stopSimulation() : startSimulation()
);

generatorButton?.addEventListener('click', () =>
  generatorInterval ? stopGenerator() : startGenerator()
);

// --- Showcase View Switching Logic ---
viewButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    // 1. Get the target view number (1, 2, or 3)
    const viewNumber = btn.dataset.view;

    // 2. Deactivate all buttons and activate the clicked one
    viewButtons.forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');

    // 3. Deactivate all showcase views and activate the target one
    showcaseViews.forEach(view => {
      if (view.id === `showcase-${viewNumber}`) {
        view.classList.add('is-active');
      } else {
        view.classList.remove('is-active');
      }
    });

    const v = window.normalizedValues || { toeN: 0, insideN: 0, lacesN: 0 };
    updateDotsForView(Number(viewNumber), v.toeN, v.insideN, v.lacesN);

  });
});


// ==========================================================
// 9) COLLAPSIBLE SECTIONS (How / Why panels)
// ==========================================================

function initCollapsibleSection(titleId, content) {
  const title = document.getElementById(titleId);
  if (!title) return;

  title.addEventListener('click', () => {
    const open = title.getAttribute('aria-expanded') === 'true';
    title.setAttribute('aria-expanded', !open);
    content.style.maxHeight = open ? '0' : content.scrollHeight + 'px';
    content.style.opacity = open ? 0 : 1;
  });
}

initCollapsibleSection('how-title', document.querySelector('.how-it-works .collapsible-content'));
initCollapsibleSection('why-title', document.querySelector('.why-it-matters .collapsible-content'));


// ==========================================================
// 10) 3D SHOE MODEL (THREE.JS – STATIC VIEW)
// ==========================================================

// (Code unchanged – static camera, no rotation)
// Purpose: visual context only, not data-driven yet
// Future: highlight mesh zones based on toe/inside/laces
