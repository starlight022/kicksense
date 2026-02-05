// ==========================================================
// KickSense - script.js (cleaned)
// - View buttons (1/2/3) ONLY change view angle/pose
// - "Change Model" button ONLY changes the (src) for all views
// - Edit shoe pose per view in VIEW_POSE below
// ==========================================================


// ==========================================================
// 1) DOM REFERENCES (HTML → JavaScript bindings)
// ==========================================================

// Heatmap areas on the 2D foot (if present)
const toeArea = document.querySelector('.hit-toe');
const insideArea = document.querySelector('.hit-inside');
const lacesArea = document.querySelector('.hit-laces');

// Control buttons
const startButton = document.getElementById('toggle-start');

// View switching
const viewButtons = document.querySelectorAll('.view-selector-btn');
const showcaseViews = document.querySelectorAll('.showcase-view');

// 3D overlay containers (must exist in HTML)
const overlays = {
  1: document.getElementById('shoe-overlay-1'),
  2: document.getElementById('shoe-overlay-2'),
  3: document.getElementById('shoe-overlay-3'),
};

// 3D stage containers (we move the whole stage so overlay + model move together)
const stages = {
  1: document.getElementById('shoe-3d-container-1'),
  2: document.getElementById('shoe-3d-container-2'),
  3: document.getElementById('shoe-3d-container-3'),
};

// Model viewers (one per view)
const modelViewers = {
  1: document.getElementById('model-viewer-1'),
  2: document.getElementById('model-viewer-2'),
  3: document.getElementById('model-viewer-3'),
};

// Numeric sensor readouts (optional)
const toeNDisplays = document.querySelectorAll('[id^="toeN-display"]');
const insideNDisplays = document.querySelectorAll('[id^="insideN-display"]');
const lacesNDisplays = document.querySelectorAll('[id^="lacesN-display"]');

// dev
const devToggle = document.getElementById('devToggle');
const devPanel = document.getElementById('devPanel');

devToggle?.addEventListener('click', () => {
  if (!devPanel) return;
  devPanel.classList.toggle('is-hidden');

  const isHidden = devPanel.classList.contains('is-hidden');
  devToggle.textContent = isHidden ? '⚙️' : '💥';
});


// ==========================================================
// 2) STATE (Start/Stop + last data)
// ==========================================================

let systemRunning = false;
let activeViewNumber = 1;

// last known normalized values (for immediate redraw on view switch)
window.normalizedValues = { toeN: 0, insideN: 0, lacesN: 0 };


// ==========================================================
// 3) CONSTANTS (TUNING / CALIBRATION VALUES)
// ==========================================================

const MAX_RAW_VALUE = 800; // FSR raw range (adjust later if needed)


// ==========================================================
// 4) VISUAL HELPERS (pressure → color → style)
// ==========================================================

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
// 4.4) PER-MODEL × PER-VIEW POSES (EDIT HERE)
// - View buttons (1/2/3) ONLY change view angle + shoe position.
// - Poses depend on BOTH: selected model + selected view.
// - stageTransform moves the whole 3D stage (model + overlay together).
// ==========================================================

// Models that the "Change Model" button cycles through
const MODELS = [
  { key: 'model1', label: '1', src: 'model1.glb' },
  { key: 'model2', label: '2', src: 'model2.glb' },
];

// Current selected model
let currentModelIndex = 0;
let currentModelKey = MODELS[currentModelIndex].key;

// EDIT THIS TABLE:
// POSES[modelKey][viewNumber] = { cameraOrbit, cameraTarget, fieldOfView, stageTransform }
const POSES = {
  model1: {
    1: {
      cameraOrbit: '90deg 70deg 1.5m',
      cameraTarget: '0m 5m 0m',
      fieldOfView: null,
      stageTransform: 'translate(0px, 0px) scale(1)',
    },
    2: {
      cameraOrbit: '10deg 70deg 1.5m',
      cameraTarget: '0m 3m 0m',
      fieldOfView: null,
      stageTransform: 'translate(0px, 0px) scale(1)',
    },
    3: {
      cameraOrbit: '290deg 70deg 1.5m',
      cameraTarget: '0m 5m 0m',
      fieldOfView: '130deg',
      stageTransform: 'translate(0px, 0px) scale(1)',
    },
  },

  // By default model2 uses the same poses.
  // Change these freely so model2 can be framed differently in each view.
  model2: {
    1: {
      cameraOrbit: '90deg 90deg 1.5m',
      cameraTarget: '0m 0m 0m',
      fieldOfView: null,
      stageTransform: 'translate(0px, 0px) scale(1)',
    },
    2: {
      cameraOrbit: '30deg 75deg 1.5m',
      cameraTarget: '0m 0m 0m',
      fieldOfView: null,
      stageTransform: 'translate(0px, 0px) scale(1)',
    },
    3: {
      cameraOrbit: '300deg 75deg 1.5m',
      cameraTarget: '0m -1m 0m',
      fieldOfView: '130deg',
      stageTransform: 'translate(0px, 0px) scale(1)',
    },
  },
};

function applyPoseFor(modelKey, viewNumber) {
  const pose = POSES?.[modelKey]?.[viewNumber];
  if (!pose) return;

  const viewer = modelViewers[viewNumber];
  if (viewer) {
    if (pose.cameraOrbit != null) {
      viewer.setAttribute('camera-orbit', pose.cameraOrbit);
      try { viewer.cameraOrbit = pose.cameraOrbit; } catch {}
    }

    if (pose.cameraTarget != null) {
      viewer.setAttribute('camera-target', pose.cameraTarget);
      try { viewer.cameraTarget = pose.cameraTarget; } catch {}
    }

    if (pose.fieldOfView) {
      viewer.setAttribute('field-of-view', pose.fieldOfView);
      try { viewer.fieldOfView = pose.fieldOfView; } catch {}
    } else {
      viewer.removeAttribute('field-of-view');
    }
  }

  const stage = stages[viewNumber];
  if (stage && pose.stageTransform != null) {
    stage.style.transform = pose.stageTransform;
    stage.style.transformOrigin = '50% 50%';
  }
}

// Apply pose for the CURRENT model on the given view
function applyPose(viewNumber) {
  applyPoseFor(currentModelKey, viewNumber);
}
// ==========================================================
// 4.5) 3D OVERLAY DOTS (toe=front, laces=out, inside=inside)
// ==========================================================

const dotPositionsByView = {
  1: {
    toe:   { left: 8, top: 65 },
    laces: { left: 28, top: 65 },
    inside:{ left: 20, top: 50 },
  },
  2: {
    toe:   { left: 85, top: 62 },
    laces: { left: 54, top: 52 },
    inside:{ left: 66, top: 62 },
  },
  3: {
    toe:   { left: 53, top: 90 },
    laces: { left: 35, top: 73 },
    inside:{ left: 68, top: 73 },
  },
};

function ensureDotsForOverlay(overlayEl) {
  if (!overlayEl) return null;
  if (overlayEl._dots) return overlayEl._dots;

  const makeDot = (key) => {
    const d = document.createElement('div');
    d.className = 'impact-dot';
    d.dataset.key = key;
    d.dataset.label = key;
    overlayEl.appendChild(d);
    return d;
  };

  overlayEl._dots = {
    toe: makeDot('toe'),
    inside: makeDot('inside'),
    laces: makeDot('laces'),
  };

  return overlayEl._dots;
}

function setDotVisual(dotEl, value01) {
  if (!dotEl) return;

  const on = value01 > 0.08;
  dotEl.classList.toggle('is-on', on);

  const color = pressureToColor(value01);
  const sizeScale = 0.85 + value01 * 1.4;

  dotEl.style.setProperty('--v', value01.toFixed(3));
  dotEl.style.color = color; // ripples use currentColor

  dotEl.style.background =
    `radial-gradient(circle, rgba(255,255,255,0.85) 0%, ${color} 35%, rgba(0,0,0,0) 70%)`;
  dotEl.style.transform =
    `translate(-50%, -50%) scale(${sizeScale.toFixed(2)})`;
  dotEl.style.boxShadow =
    `0 0 ${8 + value01 * 26}px ${color}`;

  dotEl.dataset.label = `${dotEl.dataset.key}: ${(value01 * 100).toFixed(0)}%`;
}

function updateDotsForView(viewNumber, toeN, insideN, lacesN) {
  const overlay = overlays[viewNumber];
  if (!overlay) return;

  const dots = ensureDotsForOverlay(overlay);
  const pos = dotPositionsByView[viewNumber];
  if (!dots || !pos) return;

  dots.toe.style.left = `${pos.toe.left}%`;
  dots.toe.style.top  = `${pos.toe.top}%`;

  dots.inside.style.left = `${pos.inside.left}%`;
  dots.inside.style.top  = `${pos.inside.top}%`;

  dots.laces.style.left = `${pos.laces.left}%`;
  dots.laces.style.top  = `${pos.laces.top}%`;

  setDotVisual(dots.toe, toeN);
  setDotVisual(dots.inside, insideN);
  setDotVisual(dots.laces, lacesN);
}


// ==========================================================
// 4.6) IMPACT BARS (under the shoe model in each view)
// ==========================================================

function updateImpactBars(viewNumber, toeN, insideN, lacesN) {
  const setBar = (key, value01) => {
    const fill = document.getElementById(`bar-${key}-${viewNumber}`);
    const pct  = document.getElementById(`bar-${key}-pct-${viewNumber}`);
    if (!fill || !pct) return;

    const v = Math.min(Math.max(value01, 0), 1);
    const percent = v * 100;
    const color = pressureToColor(v);

    fill.style.width = `${percent.toFixed(1)}%`;
    fill.style.backgroundColor = color;
    fill.style.boxShadow = `0 0 ${10 + v * 18}px ${color}`;
    fill.style.color = color;

    pct.textContent = `${Math.round(percent)}%`;
  };

  setBar('toe', toeN);
  setBar('inside', insideN);
  setBar('laces', lacesN);
}


// ==========================================================
// 5) CORE PIPELINE (RAW → NORMALIZED → UI)
// ==========================================================

function normalizeAndDisplay(rawToe, rawInside, rawLaces) {
  const normalize = raw => Math.min(Math.max(raw, 0), MAX_RAW_VALUE) / MAX_RAW_VALUE;

  const toeN = normalize(rawToe);
  const insideN = normalize(rawInside);
  const lacesN = normalize(rawLaces);

  // 2D heatmap (if present)
  applyPressureStyles(toeArea, toeN);
  applyPressureStyles(insideArea, insideN);
  applyPressureStyles(lacesArea, lacesN);

  // numeric readouts (if present)
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

  // highlight strongest sensor (if you kept the sensor-display)
  if (maxVal > 0.1) {
    const maxSensor =
      (toeN >= insideN && toeN >= lacesN) ? 'toeN' :
      (insideN >= toeN && insideN >= lacesN) ? 'insideN' :
      'lacesN';

    document.querySelectorAll('.sensor-display .sensor-value')
      .forEach(el => {
        if (el.id.startsWith(maxSensor)) {
          el.classList.add('highlight');
        }
      });
  }

  // update 3D overlay dots + bars on ACTIVE view only
  updateDotsForView(activeViewNumber, toeN, insideN, lacesN);
  updateImpactBars(activeViewNumber, toeN, insideN, lacesN);

  // store globally
  window.normalizedValues = { toeN, insideN, lacesN };
}


// ==========================================================
// 6) SINGLE INPUT POINT (manual now, Arduino Serial later)
// ==========================================================

function pushSensorData(rawToe, rawInside, rawLaces) {
  if (!systemRunning) startSystem();
  normalizeAndDisplay(rawToe, rawInside, rawLaces);
}
window.pushSensorData = pushSensorData;


// ==========================================================
// 7) START / STOP BUTTON
// ==========================================================

function startSystem() {
  systemRunning = true;
  if (startButton) {
    startButton.textContent = 'Stop';
    startButton.classList.add('is-active');
  }
}

function stopSystem() {
  systemRunning = false;
  if (startButton) {
    startButton.textContent = 'Start';
    startButton.classList.remove('is-active');
  }
  normalizeAndDisplay(0, 0, 0);
}

startButton?.addEventListener('click', () => {
  systemRunning ? stopSystem() : startSystem();
});


// ==========================================================
// 8) VIEW SWITCHING (1 / 2 / 3)
// - ONLY changes view + pose (angle/position)
// ==========================================================

function setActiveView(viewNumber) {
  const vn = Number(viewNumber);
  if (![1,2,3].includes(vn)) return;

  // sync active state across all view buttons
  viewButtons.forEach(b => {
    b.classList.toggle('is-active', Number(b.dataset.view) === vn);
  });

  activeViewNumber = vn;

  // show correct showcase
  showcaseViews.forEach(view => {
    view.classList.toggle('is-active', view.id === `showcase-${vn}`);
  });

  // Apply pose for that view
  applyPose(vn);

  // redraw dots/bars instantly on the new view
  const v = window.normalizedValues || { toeN: 0, insideN: 0, lacesN: 0 };
  updateDotsForView(vn, v.toeN, v.insideN, v.lacesN);
  updateImpactBars(vn, v.toeN, v.insideN, v.lacesN);
}

viewButtons.forEach(btn => {
  btn.addEventListener('click', () => setActiveView(btn.dataset.view));
});


// ==========================================================
// 9) MANUAL INPUT (inputs + Send button)
// ==========================================================

const rawToeInput = document.getElementById('raw-toe');
const rawInsideInput = document.getElementById('raw-inside');
const rawLacesInput = document.getElementById('raw-laces');
const sendManualBtn = document.getElementById('send-manual');

function readManualInputs() {
  const toe = Number(rawToeInput?.value ?? 0);
  const inside = Number(rawInsideInput?.value ?? 0);
  const laces = Number(rawLacesInput?.value ?? 0);

  return {
    toe: Number.isFinite(toe) ? toe : 0,
    inside: Number.isFinite(inside) ? inside : 0,
    laces: Number.isFinite(laces) ? laces : 0,
  };
}

function sendManualValues() {
  if (!systemRunning) startSystem();
  const { toe, inside, laces } = readManualInputs();
  pushSensorData(toe, inside, laces);
}

sendManualBtn?.addEventListener('click', sendManualValues);

[rawToeInput, rawInsideInput, rawLacesInput].forEach(inp => {
  inp?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendManualValues();
  });
});


// ==========================================================
// 10) TOGGLE MANUAL INPUT VISIBILITY
// ==========================================================

const manualPanel = document.querySelector('.manual-input');
const toggleManualBtn = document.getElementById('toggle-manual');

toggleManualBtn?.addEventListener('click', () => {
  if (!manualPanel) return;
  manualPanel.classList.toggle('is-hidden');

  const hidden = manualPanel.classList.contains('is-hidden');
  toggleManualBtn.textContent = hidden ? 'Manual' : 'Hide';
});

if (toggleManualBtn && manualPanel && !manualPanel.classList.contains('is-hidden')) {
  toggleManualBtn.textContent = 'Hide';
}


// ==========================================================
// 11) CHANGE MODEL BUTTON
// - Changes ONLY the model (src) across all views
// - After changing the model, we re-apply poses per view for that model
// ==========================================================

const modelBtn = document.getElementById('toggle-model');

function applyModel(index) {
  const m = MODELS[index];
  if (!m) return;

  currentModelIndex = index;
  currentModelKey = m.key;

  // Apply the SAME model to all views, but keep each view's own pose
  [1, 2, 3].forEach((vn) => {
    const viewer = modelViewers[vn];
    if (!viewer) return;

    // When src changes, model-viewer may reset camera after load.
    // So: apply pose immediately + once again after the new model finishes loading.
    viewer.src = m.src;
    viewer.dismissPoster?.();

    applyPoseFor(m.key, vn);
    viewer.addEventListener('load', () => applyPoseFor(m.key, vn), { once: true });
  });

  if (modelBtn) modelBtn.textContent = `Bytte 👟`;
}

modelBtn?.addEventListener('click', () => {
  const next = (currentModelIndex + 1) % MODELS.length;
  applyModel(next);
});

// Connection status
const connBtn  = document.getElementById('connStatus');
const connText = connBtn?.querySelector('.conn-text');
const connIcon = connBtn?.querySelector('.conn-icon');

function setConnectionState(state) {
  if (!connBtn) return;

  connBtn.classList.remove('conn-off','conn-on','conn-connecting');

  if (state === 'off') {
    connBtn.classList.add('conn-off');
    connText.textContent = 'Ingen tilkobling';
    connIcon.textContent = '🔌';
  }

  if (state === 'connecting') {
    connBtn.classList.add('conn-connecting');
    connText.textContent = 'Connecting…';
    connIcon.textContent = '🔌';
  }

  if (state === 'on') {
    connBtn.classList.add('conn-on');
    connText.textContent = 'KickSense connected';
    connIcon.textContent = '⚡';
  }
}
setConnectionState('off')

// ==========================================================
// 12) WEB SERIAL (Arduino over USB)
// - Reads line-delimited JSON: {"toe":123,"inside":456,"laces":78}
// ==========================================================

let serialPort = null;
let serialReader = null;
let serialKeepReading = false;

function setSerialButtonState(state) {
  const btn = document.getElementById('btnSerial');
  if (!btn) return;

  btn.classList.remove('is-connected');
  btn.disabled = false;

  if (state === 'idle') {
    btn.textContent = 'Connect Arduino';
  } else if (state === 'connecting') {
    btn.textContent = 'Connecting...';
    btn.disabled = true;
  } else if (state === 'connected') {
    btn.textContent = 'Arduino Connected';
    btn.classList.add('is-connected');
  } else if (state === 'error') {
    btn.textContent = 'Connect failed';
  }
}

async function connectArduinoSerial() {
  if (!('serial' in navigator)) {
    alert('Web Serial not supported. Use Chrome/Edge on desktop.');
    return;
  }

  if (serialPort) {
    setConnectionState('on');
   return;
  }

  setConnectionState('connecting');

  try {
    serialPort = await navigator.serial.requestPort();
    await serialPort.open({ baudRate: 115200 });

    const decoder = new TextDecoderStream();
    serialPort.readable.pipeTo(decoder.writable);
    serialReader = decoder.readable.getReader();
    serialKeepReading = true;

    setConnectionState('on');

    let buffer = '';

    while (serialKeepReading) {
      const { value, done } = await serialReader.read();
      if (done) break;
      if (!value) continue;

      buffer += value;

      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;

        try {
          const data = JSON.parse(line);
          pushSensorData(data.toe ?? 0, data.inside ?? 0, data.laces ?? 0);
        } catch {
          // ignore non-JSON lines
        }
      }
    }
  } catch (err) {
    console.warn('[Serial] connect failed:', err);
    setSerialButtonState('error');

    serialKeepReading = false;
    try { await serialReader?.cancel(); } catch {}
    try { serialReader?.releaseLock?.(); } catch {}
    try { await serialPort?.close?.(); } catch {}
    serialReader = null;
    serialPort = null;
  }
}

document.getElementById('btnSerial')?.addEventListener('click', connectArduinoSerial);


// ==========================================================
// 13) FEEDBACK (5-star rating) + confetti burst
// ==========================================================

function initFeedbackStars() {
  const wrap = document.getElementById('feedback-stars');
  const msg = document.getElementById('feedback-msg');
  if (!wrap || !msg) return;

  const stars = Array.from(wrap.querySelectorAll('.star'));
  let selected = 0;

  const paint = (value) => {
    stars.forEach((s) => {
      const v = Number(s.dataset.value);
      s.classList.toggle('is-on', v <= value);
      s.setAttribute('aria-checked', String(v === selected));
      s.setAttribute('role', 'radio');
      s.tabIndex = (selected === 0 ? v === 1 : v === selected) ? 0 : -1;
    });
  };

  stars.forEach((star) => {
    const preview = () => paint(Number(star.dataset.value));
    star.addEventListener('pointerenter', preview);
    star.addEventListener('focus', preview);

    star.addEventListener('click', () => {
      selected = Number(star.dataset.value);
      paint(selected);

      msg.textContent = 'Takk for feedback!';

      const r = star.getBoundingClientRect();
      Confetti.burst(r.left + r.width / 2, r.top + r.height / 2, 1);
    });
  });

  wrap.addEventListener('pointerleave', () => paint(selected));
  wrap.addEventListener('mouseleave', () => paint(selected));

  paint(selected);
}

document.addEventListener('DOMContentLoaded', initFeedbackStars);


// ==========================================================
// 14) THEME SWITCHER
// ==========================================================

const themeBtn = document.getElementById('themeBtn');
const themeModal = document.getElementById('themeModal');
const closeThemeModal = document.getElementById('closeThemeModal');
const themeOptions = document.querySelectorAll('.theme-option');

const THEMES = ['theme-dark','theme-light','theme-gray'];

themeBtn?.addEventListener('click', () => themeModal?.classList.remove('hidden'));
closeThemeModal?.addEventListener('click', () => themeModal?.classList.add('hidden'));

themeOptions.forEach(btn => {
  btn.addEventListener('click', () => {
    const selectedTheme = btn.dataset.theme;
    THEMES.forEach(t => document.body.classList.remove(t));
    document.body.classList.add(`theme-${selectedTheme}`);
    themeModal?.classList.add('hidden');
  });
});


// ==========================================================
// 15) CONFETTI / FIREWORK BURST (no libraries)
// ==========================================================

const Confetti = (() => {
  let canvas, ctx;
  let particles = [];
  let rafId = null;

  function ensureCanvas() {
    canvas = document.getElementById('confetti-canvas');
    if (!canvas) return false;
    ctx = canvas.getContext('2d');

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = '100vw';
      canvas.style.height = '100vh';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);
    return true;
  }

  function rand(min, max) { return min + Math.random() * (max - min); }

  function pickColor() {
    const colors = ['#facc15', '#60a5fa', '#22c55e', '#ef4444', '#a78bfa', '#fb7185'];
    return colors[(Math.random() * colors.length) | 0];
  }

  function burst(x, y, power = 1) {
    if (!ctx && !ensureCanvas()) return;

    const count = Math.floor(90 * power);
    for (let i = 0; i < count; i++) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(2.5, 7.5) * power;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - rand(1, 3),
        g: rand(0.06, 0.12),
        drag: rand(0.985, 0.995),
        size: rand(2, 4),
        rot: rand(0, Math.PI * 2),
        vr: rand(-0.25, 0.25),
        life: rand(40, 70),
        color: pickColor(),
        alpha: 1,
      });
    }

    if (!rafId) loop();
  }

  function loop() {
    rafId = requestAnimationFrame(loop);

    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    particles = particles.filter(p => p.life > 0);

    for (const p of particles) {
      p.life -= 1;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.vy += p.g;

      p.x += p.vx;
      p.y += p.vy;

      p.rot += p.vr;

      p.alpha = Math.max(0, Math.min(1, p.life / 25));

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size, -p.size / 2, p.size * 2, p.size);
      ctx.restore();
    }

    if (particles.length === 0) {
      cancelAnimationFrame(rafId);
      rafId = null;
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    }
  }

  return { burst };
})();


// ==========================================================
// INIT
// ==========================================================

// Apply initial model and initial poses for all views (so you can edit VIEW_POSE)
// then activate view 1
applyModel(currentModelIndex);
[1,2,3].forEach(applyPose);
setActiveView(1);
