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
const vrist2NDisplays = document.querySelectorAll('[id^="vrist2N-display"]');
const innside2NDisplays = document.querySelectorAll('[id^="innside2N-display"]');
const bridgeNDisplays = document.querySelectorAll('[id^="bridgeN-display"]');

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
let manualInputActive = false;

// last known normalized values (for immediate redraw on view switch)
window.normalizedValues = { toeN: 0, insideN: 0, lacesN: 0, vrist2N: 0, innside2N: 0, bridgeN: 0 };


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
      cameraOrbit: '40deg 90deg 2.5m',
      cameraTarget: '0m 1m 0m',
      fieldOfView: null,
      stageTransform: 'translate(0px, 0px) scale(1)',
    },
    2: {
      cameraOrbit: '305deg 75deg 1.5m',
      cameraTarget: '0m -1m 0m',
      fieldOfView: null,
      stageTransform: 'translate(0px, 0px) scale(1)',
    },
    3: {
      cameraOrbit: '250deg 75deg 1m',
      cameraTarget: '0m 0m 0m',
      fieldOfView: null,
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
// 4.5) 3D OVERLAY DOTS (EDIT LEFT/TOP TO MOVE EACH SENSOR DOT)
// Sensors: toe, inside, laces, vrist2, innside2, bridge
// ==========================================================

const dotPositionsByView = {
  1: {
    toe:   { left: 8, top: 65 },
    laces: { left: 20, top: 50 },
    inside:{ left: 20, top: 78 },
    vrist2:  { left: 30, top: 48 },
    innside2: { left: 30, top: 83 },
    bridge: { left: 26, top: 62 },
  },
  2: {
    toe:   { left: 45, top: 88 },
    laces: { left: 33, top: 52 },
    inside:{ left: 62, top: 52 },
    vrist2:  { left: 30, top: 73 },
    innside2: { left: 60, top: 73 },
    bridge: { left: 48, top: 62 },
  },
  3: {
    toe:   { left: 95, top: 73 },
    laces: { left: 80, top: 83 },
    inside:{ left: 86, top: 57 },
    vrist2:  { left: 66, top: 85 },
    innside2: { left: 72, top: 50 },
    bridge: { left: 78, top: 66 },
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
    vrist2: makeDot('vrist2'),
    innside2: makeDot('innside2'),
    bridge: makeDot('bridge'),
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

function updateDotsForView(viewNumber, toeN, insideN, lacesN, vrist2N, innside2N, bridgeN) {
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

  dots.vrist2.style.left = `${pos.vrist2.left}%`;
  dots.vrist2.style.top  = `${pos.vrist2.top}%`;

  dots.innside2.style.left = `${pos.innside2.left}%`;
  dots.innside2.style.top  = `${pos.innside2.top}%`;

  dots.bridge.style.left = `${pos.bridge.left}%`;
  dots.bridge.style.top  = `${pos.bridge.top}%`;

  setDotVisual(dots.toe, toeN);
  setDotVisual(dots.inside, insideN);
  setDotVisual(dots.laces, lacesN);
  setDotVisual(dots.vrist2, vrist2N);
  setDotVisual(dots.innside2, innside2N);
  setDotVisual(dots.bridge, bridgeN);
}


// ==========================================================
// 4.6) IMPACT BARS (under the shoe model in each view)
// ==========================================================

function updateImpactBars(viewNumber, toeN, insideN, lacesN, vrist2N, innside2N, bridgeN) {
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
  setBar('vrist2', vrist2N);
  setBar('innside2', innside2N);
  setBar('bridge', bridgeN);
}


// ==========================================================
// 5) CORE PIPELINE (RAW → NORMALIZED → UI)
// ==========================================================

function normalizeAndDisplay(rawToe, rawInside, rawLaces, rawVrist2, rawInnside2, rawBridge) {
  const normalize = raw => Math.min(Math.max(raw, 0), MAX_RAW_VALUE) / MAX_RAW_VALUE;

  const toeN = normalize(rawToe);
  const insideN = normalize(rawInside);
  const lacesN = normalize(rawLaces);
  const vrist2N = normalize(rawVrist2);
  const innside2N = normalize(rawInnside2);
  const bridgeN = normalize(rawBridge);

  // 2D heatmap (if present)
  applyPressureStyles(toeArea, toeN);
  applyPressureStyles(insideArea, insideN);
  applyPressureStyles(lacesArea, lacesN);

  // numeric readouts (if present)
  const sensorData = [
    { displays: toeNDisplays, value: toeN, name: 'toeN' },
    { displays: insideNDisplays, value: insideN, name: 'insideN' },
    { displays: lacesNDisplays, value: lacesN, name: 'lacesN' },
    { displays: vrist2NDisplays, value: vrist2N, name: 'vrist2N' },
    { displays: innside2NDisplays, value: innside2N, name: 'innside2N' },
    { displays: bridgeNDisplays, value: bridgeN, name: 'bridgeN' },
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
    const maxSensor = sensorData.reduce(
      (best, item) => (item.value > best.value ? item : best),
      { name: 'toeN', value: -1 }
    ).name;

    document.querySelectorAll('.sensor-display .sensor-value')
      .forEach(el => {
        if (el.id.startsWith(maxSensor)) {
          el.classList.add('highlight');
        }
      });
  }

  // update 3D overlay dots + bars on ACTIVE view only
  updateDotsForView(activeViewNumber, toeN, insideN, lacesN, vrist2N, innside2N, bridgeN);
  updateImpactBars(activeViewNumber, toeN, insideN, lacesN, vrist2N, innside2N, bridgeN);

  // store globally
  window.normalizedValues = { toeN, insideN, lacesN, vrist2N, innside2N, bridgeN };
}


// ==========================================================
// 6) SINGLE INPUT POINT (manual now, Arduino Serial later)
// ==========================================================

function pushSensorData(rawToe, rawInside, rawLaces, rawVrist2 = 0, rawInnside2 = 0, rawBridge = 0) {
  if (!systemRunning) startSystem();
  normalizeAndDisplay(rawToe, rawInside, rawLaces, rawVrist2, rawInnside2, rawBridge);
}
window.pushSensorData = pushSensorData;


// =====================
// FIREBASE (Realtime DB) - Poll latest
// =====================
const FIREBASE_BASE = "https://kicksense-33-default-rtdb.europe-west1.firebasedatabase.app";
const FIREBASE_LATEST_URL = `${FIREBASE_BASE}/kicksense/latest.json`;

let firebasePollTimer = null;
let lastPayloadReceivedAtMs = 0; // when any valid payload was last received
const NO_DATA_TIMEOUT_MS = 10000; // no payload for 10s => off
const TS_STALE_TIMEOUT_MS = 10000; // same ts for 10s => off
const WAITING_THRESHOLD = 10; // all sensors below this => waiting for shoot
const ACTIVE_SHOT_THRESHOLD = 50; // any sensor above this => connected/active
const ACTIVE_HOLD_MS = 10000; // keep "connected" this long after last shot
let hasReceivedLiveData = false;
let lastActiveShotAtMs = 0;
let hasSeenTs = false;
let lastTsValue = null;
let lastTsChangeAtMs = 0;

function resolveConnectionStateFromRaw(toe, inside, laces, vrist2, innside2, bridge) {
  const now = Date.now();
  const maxVal = Math.max(toe, inside, laces, vrist2, innside2, bridge);
  if (maxVal > ACTIVE_SHOT_THRESHOLD) {
    lastActiveShotAtMs = now;
    return 'on';
  }

  // Hysteresis: after a shot, keep "connected" for a short period
  // to avoid immediate flicker to waiting on the next low payload.
  if (lastActiveShotAtMs && (now - lastActiveShotAtMs) <= ACTIVE_HOLD_MS) {
    return 'on';
  }

  if (maxVal < WAITING_THRESHOLD) return 'idle';
  return 'idle';
}

function markLivePayload(toe, inside, laces, vrist2, innside2, bridge) {
  hasReceivedLiveData = true;
  lastPayloadReceivedAtMs = Date.now();
  setConnectionState?.(resolveConnectionStateFromRaw(toe, inside, laces, vrist2, innside2, bridge));
}


async function fetchLatestFromFirebase() {
  try {
    const res = await fetch(FIREBASE_LATEST_URL, { cache: "no-store" });
    const data = await res.json();

    // If empty database => null
    if (!data) return;

    const now = Date.now();
    const tsRaw = data.ts ?? null;
    if (tsRaw !== null && tsRaw !== undefined) {
      const tsValue = String(tsRaw);
      if (!hasSeenTs) {
        hasSeenTs = true;
        lastTsValue = tsValue;
        lastTsChangeAtMs = now;
      } else if (tsValue !== lastTsValue) {
        lastTsValue = tsValue;
        lastTsChangeAtMs = now;
      }
    }

    const isTsStale = hasSeenTs && ((now - lastTsChangeAtMs) > TS_STALE_TIMEOUT_MS);

    const toe = Number(data.toe ?? 0);
    const inside = Number(data.inside ?? 0);
    const laces = Number(data.laces ?? 0);
    // Backward compatibility: also accept old keys heel/outside.
    const vrist2 = Number(data.vrist2 ?? data.wrist2 ?? data.heel ?? 0);
    const innside2 = Number(data.inside2 ?? data.innside2 ?? data.outside ?? 0);
    const bridge = Number(data.bridge ?? 0);
    const safeToe = Number.isFinite(toe) ? toe : 0;
    const safeInside = Number.isFinite(inside) ? inside : 0;
    const safeLaces = Number.isFinite(laces) ? laces : 0;
    const safeVrist2 = Number.isFinite(vrist2) ? vrist2 : 0;
    const safeInnside2 = Number.isFinite(innside2) ? innside2 : 0;
    const safeBridge = Number.isFinite(bridge) ? bridge : 0;

    if (!isTsStale) {
      markLivePayload(safeToe, safeInside, safeLaces, safeVrist2, safeInnside2, safeBridge);
    } else {
      setConnectionState?.("off");
    }

    pushSensorData(
      safeToe,
      safeInside,
      safeLaces,
      safeVrist2,
      safeInnside2,
      safeBridge
    );
  } catch (e) {
    setConnectionState?.("off");
    console.warn("[Firebase] fetch failed:", e);
  }
}

function startFirebasePolling(intervalMs = 120) {
  stopFirebasePolling();
  hasReceivedLiveData = false;
  lastPayloadReceivedAtMs = 0;
  lastActiveShotAtMs = 0;
  hasSeenTs = false;
  lastTsValue = null;
  lastTsChangeAtMs = 0;
  setConnectionState?.("off");
  startOfflineWatch();
  firebasePollTimer = setInterval(fetchLatestFromFirebase, intervalMs);
}

function stopFirebasePolling() {
  if (firebasePollTimer) clearInterval(firebasePollTimer);
  firebasePollTimer = null;
  stopOfflineWatch();
}

let offlineWatchTimer = null;

function startOfflineWatch() {
  stopOfflineWatch();
  offlineWatchTimer = setInterval(() => {
    if (hasSeenTs) {
      const tsAge = Date.now() - lastTsChangeAtMs;
      if (tsAge > TS_STALE_TIMEOUT_MS) {
        setConnectionState?.("off");
        return;
      }
    }

    if (!hasReceivedLiveData) {
      setConnectionState?.("off");
      return;
    }

    const age = Date.now() - lastPayloadReceivedAtMs;
    if (age > NO_DATA_TIMEOUT_MS) {
      setConnectionState?.("off");
    }
  }, 500); // check twice per second
}

function stopOfflineWatch() {
  if (offlineWatchTimer) clearInterval(offlineWatchTimer);
  offlineWatchTimer = null;
}

// ==========================================================
// 7) START / STOP BUTTON
// ==========================================================

function startSystem() {
  systemRunning = true;
  if (startButton) {
    startButton.textContent = 'Stop';
    startButton.classList.add('is-active');
  }

  if (!manualInputActive) {
    startFirebasePolling(120);
  }
}

function stopSystem() {
  systemRunning = false;
  if (startButton) {
    startButton.textContent = 'Start';
    startButton.classList.remove('is-active');
  }

  stopFirebasePolling();
  normalizeAndDisplay(0, 0, 0, 0, 0, 0);
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
  const v = window.normalizedValues || { toeN: 0, insideN: 0, lacesN: 0, vrist2N: 0, innside2N: 0, bridgeN: 0 };
  updateDotsForView(vn, v.toeN, v.insideN, v.lacesN, v.vrist2N, v.innside2N, v.bridgeN);
  updateImpactBars(vn, v.toeN, v.insideN, v.lacesN, v.vrist2N, v.innside2N, v.bridgeN);
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
const rawVrist2Input = document.getElementById('raw-vrist2');
const rawInnside2Input = document.getElementById('raw-innside2');
const rawBridgeInput = document.getElementById('raw-bridge');
const sendManualBtn = document.getElementById('send-manual');

function readManualInputs() {
  const toe = Number(rawToeInput?.value ?? 0);
  const inside = Number(rawInsideInput?.value ?? 0);
  const laces = Number(rawLacesInput?.value ?? 0);
  const vrist2 = Number(rawVrist2Input?.value ?? 0);
  const innside2 = Number(rawInnside2Input?.value ?? 0);
  const bridge = Number(rawBridgeInput?.value ?? 0);

  return {
    toe: Number.isFinite(toe) ? toe : 0,
    inside: Number.isFinite(inside) ? inside : 0,
    laces: Number.isFinite(laces) ? laces : 0,
    vrist2: Number.isFinite(vrist2) ? vrist2 : 0,
    innside2: Number.isFinite(innside2) ? innside2 : 0,
    bridge: Number.isFinite(bridge) ? bridge : 0,
  };
}

function sendManualValues() {
  // Manual mode should not be instantly overwritten by live Firebase polling.
  setManualMode(true);
  if (!systemRunning) startSystem();
  const { toe, inside, laces, vrist2, innside2, bridge } = readManualInputs();
  pushSensorData(toe, inside, laces, vrist2, innside2, bridge);
}

sendManualBtn?.addEventListener('click', sendManualValues);

[rawToeInput, rawInsideInput, rawLacesInput, rawVrist2Input, rawInnside2Input, rawBridgeInput].forEach(inp => {
  inp?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendManualValues();
  });
});


// ==========================================================
// 10) TOGGLE MANUAL INPUT VISIBILITY
// ==========================================================

const manualPanel = document.querySelector('.manual-input');
const toggleManualBtn = document.getElementById('toggle-manual');

function setManualMode(isManual) {
  manualInputActive = Boolean(isManual);

  if (manualPanel) {
    manualPanel.classList.toggle('is-hidden', !manualInputActive);
  }

  if (toggleManualBtn) {
    toggleManualBtn.textContent = manualInputActive ? 'Live' : 'Manual';
  }

  if (!systemRunning) return;

  if (manualInputActive) {
    stopFirebasePolling();
  } else {
    startFirebasePolling(120);
  }
}

toggleManualBtn?.addEventListener('click', () => {
  setManualMode(!manualInputActive);
});

if (manualPanel && !manualPanel.classList.contains('is-hidden')) {
  setManualMode(true);
} else {
  setManualMode(false);
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
let currentConnectionState = null;

function setConnectionState(state) {
  if (!connBtn) return;
  if (state === currentConnectionState) return;
  currentConnectionState = state;

  connBtn.classList.remove('conn-off','conn-on','conn-idle','conn-connecting');

  if (state === 'off') {
    connBtn.classList.add('conn-off');
    connText.textContent = 'Ingen tilkobling';
    connIcon.textContent = '\u{1F50C}';
  }

  if (state === 'idle') {
    connBtn.classList.add('conn-idle');
    connText.textContent = 'Tilkoblet – venter på treff';
    connIcon.textContent = '\u23F3';
  }

  if (state === 'on') {
    connBtn.classList.add('conn-on');
    connText.textContent = 'Tilkoblet';
    connIcon.textContent = '\u26A1';
  }
}
setConnectionState('off')

// ==========================================================
// 12) WEB SERIAL (Arduino over USB) — robust JSON line reader
// Expects lines like: {"toe":123,"inside":456,"laces":78}\n
// ==========================================================

let serialPort = null;
let serialReader = null;
let serialKeepReading = false;
let serialBuffer = "";

// optional: if you have a button label state function, keep it.
// If not, you can remove these calls.
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
  } else if (state === 'disconnected') {
    btn.textContent = 'Disconnected';
  }
}

async function disconnectArduinoSerial() {
  serialKeepReading = false;

  try { await serialReader?.cancel(); } catch {}
  try { serialReader?.releaseLock?.(); } catch {}
  serialReader = null;

  try { await serialPort?.close?.(); } catch {}
  serialPort = null;

  serialBuffer = "";

  setConnectionState('off');
  setSerialButtonState('idle');
}

function extractJsonLine(line) {
  // Some boards/monitors may inject garbage before/after JSON.
  // Try to locate first "{" and last "}" and parse that substring.
  const start = line.indexOf('{');
  const end = line.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;

  const candidate = line.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

async function connectArduinoSerial() {
  if (!('serial' in navigator)) {
    alert('Web Serial is not supported in this browser. Use Chrome/Edge.');
    return;
  }

  // If already connected: toggle disconnect (nice UX)
  if (serialPort) {
    await disconnectArduinoSerial();
    return;
  }

  setConnectionState('connecting');
  setSerialButtonState('connecting');

  try {
    serialPort = await navigator.serial.requestPort();

    // optional: listen for unplug
    navigator.serial.addEventListener('disconnect', (event) => {
      if (event.target === serialPort) {
        disconnectArduinoSerial();
      }
    }, { once: true });

    await serialPort.open({ baudRate: 115200 });

    const decoder = new TextDecoderStream();
    const readableStreamClosed = serialPort.readable.pipeTo(decoder.writable);
    serialReader = decoder.readable.getReader();

    serialKeepReading = true;
    serialBuffer = "";

    setConnectionState('on');
    setSerialButtonState('connected');

    while (serialKeepReading) {
      const { value, done } = await serialReader.read();
      if (done) break;
      if (!value) continue;

      serialBuffer += value;

      // handle both \n and \r\n
      let nlIndex;
      while ((nlIndex = serialBuffer.indexOf('\n')) >= 0) {
        let line = serialBuffer.slice(0, nlIndex);
        serialBuffer = serialBuffer.slice(nlIndex + 1);

        line = line.replace(/\r/g, '').trim();
        if (!line) continue;

        const data = extractJsonLine(line);
        if (!data) continue;

        // Your Arduino prints adc values (0..1023), so use them directly:
        const toe = Number(data.toe ?? 0);
        const inside = Number(data.inside ?? 0);
        const laces = Number(data.laces ?? 0);
        // Backward compatibility: also accept old keys heel/outside.
        const vrist2 = Number(data.vrist2 ?? data.wrist2 ?? data.heel ?? 0);
        const innside2 = Number(data.inside2 ?? data.innside2 ?? data.outside ?? 0);
        const bridge = Number(data.bridge ?? 0);

        const safeToe = Number.isFinite(toe) ? toe : 0;
        const safeInside = Number.isFinite(inside) ? inside : 0;
        const safeLaces = Number.isFinite(laces) ? laces : 0;
        const safeVrist2 = Number.isFinite(vrist2) ? vrist2 : 0;
        const safeInnside2 = Number.isFinite(innside2) ? innside2 : 0;
        const safeBridge = Number.isFinite(bridge) ? bridge : 0;
        markLivePayload(safeToe, safeInside, safeLaces, safeVrist2, safeInnside2, safeBridge);

        pushSensorData(
          safeToe,
          safeInside,
          safeLaces,
          safeVrist2,
          safeInnside2,
          safeBridge
        );
      }
    }

    // If we exit loop normally, clean up
    await readableStreamClosed.catch(() => {});
    await disconnectArduinoSerial();

  } catch (err) {
    console.warn('[Serial] connect failed:', err);
    setConnectionState('off');
    setSerialButtonState('error');
    await disconnectArduinoSerial();
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

applyModel(currentModelIndex);
[1,2,3].forEach(applyPose);
setActiveView(1);
// AUTO START (no Start button needed)
startSystem();

