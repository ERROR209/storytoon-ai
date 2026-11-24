const canvas = document.getElementById('stageCanvas');
const ctx = canvas.getContext('2d');
const canvasWrap = document.getElementById('canvasWrap');
const apiKeyInput = document.getElementById('apiKeyInput');
const topicInput = document.getElementById('topicInput');
const formatSelect = document.getElementById('formatSelect');
const episodeModeSelect = document.getElementById('episodeModeSelect');
const toneSelect = document.getElementById('toneSelect');
const scriptEditor = document.getElementById('scriptEditor');
const statusBar = document.getElementById('statusBar');
const downloadLink = document.getElementById('downloadLink');

apiKeyInput.value = localStorage.getItem('gemini_api_key') || '';
apiKeyInput.addEventListener('change', () => {
  localStorage.setItem('gemini_api_key', apiKeyInput.value.trim());
});

function applyFormat() {
  const fmt = formatSelect.value;
  if (fmt === '16:9') {
    canvas.width = 1280; canvas.height = 720;
    canvasWrap.style.aspectRatio = '16 / 9'; canvasWrap.style.maxWidth = '100%';
  } else if (fmt === '1:1') {
    canvas.width = 960; canvas.height = 960;
    canvasWrap.style.aspectRatio = '1 / 1'; canvasWrap.style.maxWidth = '380px';
  } else {
    canvas.width = 720; canvas.height = 1280;
    canvasWrap.style.aspectRatio = '9 / 16'; canvasWrap.style.maxWidth = '330px';
  }
}
formatSelect.addEventListener('change', applyFormat);
applyFormat();

const DEMO_SCRIPT = [
  { char: "hero", other: "bro", emotion: "smug", otherEmotion: "normal", action: "walk", location: "park", power: "none", card: null, zoom: "normal", sfx: "none", text: "Bhai aaj park mein maine ek aisa jugad nikala hai ki sab hil jayenge!" },
  { char: "bro", other: "hero", emotion: "shocked", otherEmotion: "smug", action: "idle", location: "park", power: "energy", card: { icon: "⚡", label: "SECRET TRICK" }, zoom: "in", sfx: "gasp", text: "Oye tere haath mein ye neela gola kahan se aa gaya?!" },
  { char: "villain", other: "hero", emotion: "angry", otherEmotion: "shocked", action: "walk", location: "street", power: "fire", card: { icon: "😈", label: "GALI KA BOSS" }, zoom: "shake", sfx: "boom", text: "Is gali mein sirf mera raaj chalta hai, ye shakti mujhe de de!" },
  { char: "hero", other: "villain", emotion: "shadow", otherEmotion: "angry", action: "run", location: "street", power: "aura", card: null, zoom: "in", sfx: "boom", text: "Sapne dekhna band kar, ab tera pack-up hone wala hai!" },
  { char: "bro", other: "villain", emotion: "smug", otherEmotion: "dead", action: "idle", location: "street", power: "none", card: { icon: "💥", label: "PACK UP!" }, zoom: "normal", sfx: "slap", text: "Ek hi jhatke mein bhai ne boss ko zameen par leta diya!" }
];
scriptEditor.value = JSON.stringify(DEMO_SCRIPT, null, 2);

function setStatus(msg) { statusBar.textContent = msg; }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let cachedScriptHash = '';
let cachedAudioSlices = [];
const customMicBuffers = {};

// Per-Scene Mic Recorder
const scriptCard = document.querySelector('.script-card');
const micPanel = document.createElement('div');
micPanel.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:6px;';
scriptCard.appendChild(micPanel);

let activeMediaRecorder = null;
let recordingSceneIdx = -1;

function renderMicControls() {
  micPanel.innerHTML = '<div style="font-size:0.75rem;color:#94a3b8;font-weight:700;margin-top:4px;">🎙️ Optional: Apni Real Voice Record Karo</div>';
  let scenes = [];
  try { scenes = JSON.parse(scriptEditor.value); } catch { return; }

  scenes.forEach((sc, idx) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;background:#0f1117;padding:6px 8px;border-radius:8px;border:1px solid #2a2f3d;gap:6px;';
    const label = document.createElement('span');
    label.style.cssText = 'font-size:0.72rem;color:#e2e8f0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    label.textContent = `${idx + 1}. [${sc.char.toUpperCase()}] ${sc.text}`;

    const btn = document.createElement('button');
    btn.className = 'btn tiny';
    btn.style.background = customMicBuffers[idx] ? '#10b981' : '#334155';
    btn.style.color = '#fff';
    btn.textContent = recordingSceneIdx === idx ? '⏹ Stop' : (customMicBuffers[idx] ? '✅ Re-rec' : '🎙️ Rec');

    btn.onclick = async () => {
      initAudio();
      if (recordingSceneIdx === idx && activeMediaRecorder) { activeMediaRecorder.stop(); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const chunks = [];
        activeMediaRecorder = new MediaRecorder(stream);
        recordingSceneIdx = idx;
        renderMicControls();
        setStatus(`🎙️ Recording Scene ${idx + 1}...`);
        activeMediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
        activeMediaRecorder.onstop = async () => {
          stream.getTracks().forEach(t => t.stop());
          const blob = new Blob(chunks, { type: 'audio/webm' });
          customMicBuffers[idx] = await audioCtx.decodeAudioData(await blob.arrayBuffer());
          recordingSceneIdx = -1;
          renderMicControls();
          setStatus(`✅ Scene ${idx + 1} voice saved!`);
        };
        activeMediaRecorder.start();
      } catch (err) { setStatus('Mic error: ' + err.message); }
    };
    row.appendChild(label); row.appendChild(btn); micPanel.appendChild(row);
  });
}

scriptEditor.addEventListener('change', () => { cachedScriptHash = ''; renderMicControls(); });
document.getElementById('loadDemoBtn').onclick = () => {
  scriptEditor.value = JSON.stringify(DEMO_SCRIPT, null, 2);
  cachedScriptHash = '';
  renderMicControls();
  setStatus('NOT YOUR TYPE Action Demo loaded!');
};

// Web Audio Engine (Guaranteed non-null AudioContext & fallback buffer)
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null, destNode = null, analyser = null, dataArray = null, bgmGain = null, bgmInterval = null;
let isPlayingSequence = false;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new AudioCtx();
    destNode = audioCtx.createMediaStreamDestination();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    dataArray = new Uint8Array(analyser.frequencyBinCount);

    bgmGain = audioCtx.createGain();
    bgmGain.gain.value = 0.09;
    bgmGain.connect(audioCtx.destination);
    bgmGain.connect(destNode);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function createSilentBuffer(seconds = 2.5) {
  initAudio();
  const sr = audioCtx.sampleRate || 44100;
  return audioCtx.createBuffer(1, Math.floor(sr * seconds), sr);
}

function startComedyBGM() {
  stopComedyBGM();
  const notes = [261.63, 329.63, 392.00, 329.63, 293.66, 349.23, 440.00, 349.23];
  let step = 0;
  bgmInterval = setInterval(() => {
    if (!audioCtx || audioCtx.state !== 'running') return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator(), noteGain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(notes[step % notes.length], now);
    step++;
    noteGain.gain.setValueAtTime(0.001, now);
    noteGain.gain.linearRampToValueAtTime(0.22, now + 0.02);
    noteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(noteGain); noteGain.connect(bgmGain);
    osc.start(now); osc.stop(now + 0.23);
  }, 270);
}
function stopComedyBGM() { if (bgmInterval) { clearInterval(bgmInterval); bgmInterval = null; } }
function duckBGM(speaking) { if (bgmGain && audioCtx) bgmGain.gain.setTargetAtTime(speaking ? 0.03 : 0.10, audioCtx.currentTime, 0.06); }

function playSFX(type) {
  if (!type || type === 'none') return;
  initAudio();
  const now = audioCtx.currentTime;
  if (type === 'boom') {
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(120, now); osc.frequency.exponentialRampToValueAtTime(24, now + 0.55);
    gain.gain.setValueAtTime(0.95, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc.connect(gain); gain.connect(audioCtx.destination); gain.connect(destNode);
    osc.start(now); osc.stop(now + 0.55);
  } else if (type === 'slap') {
    const bufferSize = audioCtx.sampleRate * 0.15;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
    const whiteNoise = audioCtx.createBufferSource(); whiteNoise.buffer = noiseBuffer;
    const gain = audioCtx.createGain(); gain.gain.setValueAtTime(0.9, now);
    whiteNoise.connect(gain); gain.connect(audioCtx.destination); gain.connect(destNode);
    whiteNoise.start(now);
  } else if (type === 'gasp') {
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(280, now); osc.frequency.exponentialRampToValueAtTime(780, now + 0.18);
    gain.gain.setValueAtTime(0.4, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain); gain.connect(audioCtx.destination); gain.connect(destNode);
    osc.start(now); osc.stop(now + 0.2);
  }
}

// Resilient Gemini Script Generator
async function getAvailableTextModels(key) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return ['gemini-3.8-flash', 'gemini-3.0-flash', 'gemini-2.0-flash'];
    const data = await res.json();
    const live = (data.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace('models/', ''))
      .filter(name => name.includes('flash') && !name.includes('tts') && !name.includes('image') && !name.includes('audio'));
    live.sort((a, b) => (b.includes('lite') ? 1 : 0) - (a.includes('lite') ? 1 : 0));
    return live.length > 0 ? live : ['gemini-3.8-flash', 'gemini-3.0-flash'];
  } catch {
    return ['gemini-3.8-flash', 'gemini-3.0-flash', 'gemini-2.0-flash'];
  }
}

async function fetchPartScriptFromGemini(key, topic, partNum, totalParts, prevEnding) {
  const continuationNote = partNum > 1
    ? `Part ${partNum} of ${totalParts}. Continue seamlessly from: "${prevEnding}".`
    : (totalParts > 1 ? `Part 1 of ${totalParts}-part story. End on a funny cliffhanger!` : `Complete funny story with punchy ending.`);

  const prompt = `Viral Indian animated story creator ("NOT YOUR TYPE" style). Write a 9-line Hinglish script on: "${topic}". Genre: ${toneSelect.value}. ${continuationNote}
Characters: "hero", "bro", "villain", "npc", "mom" (ONLY if home/family story).
Emotions: "normal", "shocked", "smug", "angry", "crying", "dead", "shadow".
Actions: "idle", "walk", "run".
Locations: "park" (park/ground), "room" (house/bedroom), "street" (gali/city road), "gaon" (village/fields), "jungle" (night forest), "dramatic", "red".
Superpowers: "none", "energy", "fire", "lightning", "aura".
Card: null OR {"icon":"emoji","label":"2 WORD TEXT"} ONLY when visually helpful.
Zooms: "normal", "in", "shake". SFX: "none", "boom", "slap", "gasp".
Rule: Dead characters NEVER speak. Match location and action naturally to the story.
Return ONLY JSON array: [{"char":"hero","other":"bro","emotion":"smug","otherEmotion":"normal","action":"walk","location":"park","power":"none","card":null,"zoom":"normal","sfx":"none","text":"8-13 words Hinglish"}].`;

  const models = await getAvailableTextModels(key);
  let lastErr = 'Server busy';

  for (let attempt = 0; attempt < 2; attempt++) {
    for (const model of models.slice(0, 8)) {
      try {
        setStatus(`⚡ Writing Part ${partNum}/${totalParts} (${model})...`);
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 45000);
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: ctrl.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.9 }
          })
        });
        clearTimeout(timer);
        const data = await res.json();
        if (!res.ok) { lastErr = data.error?.message || `HTTP ${res.status}`; await sleep(800); continue; }
        let raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const sIdx = raw.indexOf('['), eIdx = raw.lastIndexOf(']');
        if (sIdx === -1 || eIdx === -1) { lastErr = 'Invalid JSON'; continue; }
        return JSON.parse(raw.slice(sIdx, eIdx + 1));
      } catch (err) {
        lastErr = err.name === 'AbortError' ? `${model} timed out` : err.message;
        await sleep(800);
      }
    }
    await sleep(2000);
  }
  throw new Error(lastErr);
}

// =========================================================================
// NOT YOUR TYPE STYLE LAYERED 2D BACKGROUNDS & EXPRESSIVE CHARACTERS
// =========================================================================
let currentScene = DEMO_SCRIPT[0];
let mouthOpen = 0, frameTick = 0, scenePop = 1, blinkTimer = 0;

function drawCloud(x, y, s = 1) {
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.arc(x, y, 28 * s, 0, Math.PI * 2);
  ctx.arc(x + 26 * s, y - 10 * s, 34 * s, 0, Math.PI * 2);
  ctx.arc(x + 56 * s, y, 26 * s, 0, Math.PI * 2);
  ctx.fill();
}

function drawEnvironment(loc, isMoving) {
  const W = canvas.width, H = canvas.height;
  const floorY = Math.round(H * 0.77);
  const scrollX = isMoving ? (frameTick * 4.5) % W : 0;

  if (loc === 'red' || loc === 'dramatic') {
    // Anime Speed Lines Background (NOT YOUR TYPE dramatic punchline style!)
    ctx.fillStyle = loc === 'red' ? '#dc2626' : '#0f172a';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = loc === 'red' ? '#fef08a' : '#38bdf8';
    ctx.lineWidth = 6;
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2 + frameTick * 0.05;
      const r1 = 150 + (i % 3) * 35;
      ctx.beginPath();
      ctx.moveTo(W * 0.5 + Math.cos(a) * r1, H * 0.46 + Math.sin(a) * r1);
      ctx.lineTo(W * 0.5 + Math.cos(a) * W, H * 0.46 + Math.sin(a) * H);
      ctx.stroke();
    }
  } else if (loc === 'park' || loc === 'gaon') {
    // Layered Sky Gradient + Soft Clouds + Rolling Grass Hills + Trees/Bench/Hut
    const sky = ctx.createLinearGradient(0, 0, 0, floorY);
    sky.addColorStop(0, '#38bdf8');
    sky.addColorStop(1, '#bae6fd');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, floorY);

    drawCloud(((W * 0.2 - scrollX * 0.3) + W) % W, H * 0.14, 1.1);
    drawCloud(((W * 0.72 - scrollX * 0.3) + W) % W, H * 0.20, 0.9);

    // Distant Hill Layer
    ctx.fillStyle = '#4ade80';
    ctx.beginPath(); ctx.arc(W * 0.28, floorY + 20, W * 0.5, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#22c55e';
    ctx.beginPath(); ctx.arc(W * 0.78, floorY + 20, W * 0.55, Math.PI, 0); ctx.fill();

    // Tree with Thick Hand-Drawn Outline
    const treeX = ((W * 0.80 - scrollX) + W) % W;
    ctx.fillStyle = '#78350f'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 5;
    ctx.fillRect(treeX - 14, floorY - 150, 28, 150); ctx.strokeRect(treeX - 14, floorY - 150, 28, 150);
    ctx.fillStyle = '#16a34a';
    ctx.beginPath(); ctx.arc(treeX, floorY - 175, 64, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    if (loc === 'gaon') {
      const hutX = ((W * 0.18 - scrollX) + W) % W;
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(hutX, floorY - 105, 115, 105); ctx.strokeRect(hutX, floorY - 105, 115, 105);
      ctx.fillStyle = '#b45309';
      ctx.beginPath(); ctx.moveTo(hutX - 16, floorY - 105); ctx.lineTo(hutX + 58, floorY - 168); ctx.lineTo(hutX + 132, floorY - 105); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      // Park Bench
      const benchX = ((W * 0.20 - scrollX) + W) % W;
      ctx.fillStyle = '#b45309';
      ctx.fillRect(benchX, floorY - 52, 110, 14); ctx.strokeRect(benchX, floorY - 52, 110, 14);
      ctx.fillRect(benchX + 12, floorY - 38, 10, 38); ctx.fillRect(benchX + 88, floorY - 38, 10, 38);
    }
  } else if (loc === 'street' || loc === 'shehar') {
    // Sunset / Warm Gali Sky + Buildings + Electric Pole & Hanging Wires
    const sky = ctx.createLinearGradient(0, 0, 0, floorY);
    sky.addColorStop(0, '#60a5fa');
    sky.addColorStop(1, '#fed7aa');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, floorY);

    const buildings = [
      { x: 0.05, w: 145, h: 270, c: '#94a3b8' },
      { x: 0.35, w: 165, h: 330, c: '#cbd5e1' },
      { x: 0.70, w: 150, h: 290, c: '#94a3b8' }
    ];
    buildings.forEach(b => {
      const bx = ((W * b.x - scrollX) + W) % W;
      ctx.fillStyle = b.c; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 5;
      ctx.fillRect(bx, floorY - b.h, b.w, b.h); ctx.strokeRect(bx, floorY - b.h, b.w, b.h);
      ctx.fillStyle = '#fef08a';
      for (let wy = floorY - b.h + 26; wy < floorY - 35; wy += 48) {
        ctx.fillRect(bx + 22, wy, 24, 26); ctx.strokeRect(bx + 22, wy, 24, 26);
        ctx.fillRect(bx + b.w - 46, wy, 24, 26); ctx.strokeRect(bx + b.w - 46, wy, 24, 26);
      }
    });

    // Electric Pole + Hanging Wires (Classic Desi Gali Look!)
    const poleX = ((W * 0.56 - scrollX) + W) % W;
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(poleX, floorY); ctx.lineTo(poleX, floorY - 340); ctx.stroke();
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(poleX - 35, floorY - 320); ctx.lineTo(poleX + 35, floorY - 320); ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, floorY - 300); ctx.quadraticCurveTo(poleX * 0.5, floorY - 260, poleX, floorY - 320); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(poleX, floorY - 320); ctx.quadraticCurveTo((poleX + W) * 0.5, floorY - 260, W, floorY - 300); ctx.stroke();
  } else if (loc === 'jungle' || loc === 'night') {
    // Dark Purple/Blue Night Forest with Full Moon
    ctx.fillStyle = '#1e1b4b'; ctx.fillRect(0, 0, W, floorY);
    ctx.fillStyle = '#fef9c3'; ctx.beginPath(); ctx.arc(W * 0.80, H * 0.16, 42, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 5; i++) {
      const tx = ((W * (i * 0.23) - scrollX) + W) % W;
      ctx.fillStyle = '#312e81'; ctx.fillRect(tx, floorY - 260, 30, 260);
      ctx.fillStyle = '#1e1b4b'; ctx.beginPath(); ctx.arc(tx + 15, floorY - 270, 82, 0, Math.PI * 2); ctx.fill();
    }
  } else {
    // Interior Room (Wall + Window + Wooden Door + Sofa)
    ctx.fillStyle = '#fef3c7'; ctx.fillRect(0, 0, W, floorY);
    ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 4;
    for (let x = 40; x < W; x += 65) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, floorY); ctx.stroke(); }

    // Wooden Door
    ctx.fillStyle = '#b45309'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 5;
    ctx.fillRect(W * 0.12, floorY - 240, 115, 240); ctx.strokeRect(W * 0.12, floorY - 240, 115, 240);
    ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(W * 0.12 + 92, floorY - 115, 7, 0, Math.PI * 2); ctx.fill();

    // Window
    ctx.fillStyle = '#bae6fd';
    ctx.fillRect(W * 0.68, floorY - 250, 130, 115); ctx.strokeRect(W * 0.68, floorY - 250, 130, 115);
    ctx.beginPath(); ctx.moveTo(W * 0.68 + 65, floorY - 250); ctx.lineTo(W * 0.68 + 65, floorY - 135);
    ctx.moveTo(W * 0.68, floorY - 192); ctx.lineTo(W * 0.68 + 130, floorY - 192); ctx.stroke();
  }

  // Ground Layer with Thick Hand-Drawn Horizon Line
  ctx.fillStyle = (loc === 'park' || loc === 'gaon') ? '#15803d' : (loc === 'street' || loc === 'shehar') ? '#475569' : (loc === 'jungle' || loc === 'night') ? '#0f172a' : '#d97706';
  ctx.fillRect(0, floorY, W, H - floorY);
  ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(0, floorY); ctx.lineTo(W, floorY); ctx.stroke();
}

function drawSuperpowerVFX(power, x, y) {
  if (!power || power === 'none') return;
  ctx.save(); ctx.translate(x, y);
  const pulse = 1 + Math.sin(frameTick * 0.35) * 0.18;
  if (power === 'energy') {
    const grad = ctx.createRadialGradient(0, 0, 5, 0, 0, 58 * pulse);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.4, '#38bdf8'); grad.addColorStop(1, 'rgba(37, 99, 235, 0)');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(0, 0, 58 * pulse, 0, Math.PI * 2); ctx.fill();
  } else if (power === 'fire') {
    ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.arc(0, 0, 42 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(0, 0, 24 * pulse, 0, Math.PI * 2); ctx.fill();
  } else if (power === 'lightning') {
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 5;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + frameTick * 0.3;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 40, Math.sin(a) * 40); ctx.lineTo(Math.cos(a + 0.3) * 75, Math.sin(a + 0.3) * 75); ctx.stroke();
    }
  } else if (power === 'aura') {
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.8)'; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.ellipse(0, -160, 125 * pulse, 235 * pulse, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

// NOT YOUR TYPE Character Renderer (Bean Torso, Noodle Limbs, Conjoined Oversized Eyes, D/O Mouths!)
function drawFullBodyCharacter(char, emotion, action, power, talkAmt, footX, groundY, scaleVal, isSpeaker, lookDir = 1) {
  const isWalking = action === 'walk' || action === 'run';
  const walkSpeed = action === 'run' ? 0.38 : 0.22;
  const legSwing = isWalking ? Math.sin(frameTick * walkSpeed) * 26 : 0;

  let jumpY = 0;
  if (emotion === 'shocked' && isSpeaker) jumpY = Math.abs(Math.sin(frameTick * 0.26)) * 28;
  else if (isWalking) jumpY = Math.abs(Math.sin(frameTick * walkSpeed)) * 12;
  else if (isSpeaker) jumpY = talkAmt * 10;

  // Ground Contact Shadow
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(footX, groundY + 4, 65 * scaleVal, 13 * scaleVal, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(footX, groundY - jumpY);
  ctx.scale(scaleVal * (isSpeaker ? scenePop : 1), scaleVal * (isSpeaker ? (2 - scenePop) : 1));
  if (power === 'aura' && isSpeaker) drawSuperpowerVFX('aura', 0, -30);
  if (emotion === 'dead') { ctx.translate(0, -35); ctx.rotate(Math.PI / 2); }

  ctx.strokeStyle = '#0f172a'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // 1. NOODLE LEGS + SIMPLE CARTOON SHOES
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(-18, -125); ctx.quadraticCurveTo(-24 - legSwing * 0.5, -70, -24 - legSwing, -12); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(18, -125); ctx.quadraticCurveTo(24 + legSwing * 0.5, -70, 24 + legSwing, -12); ctx.stroke();

  // Shoes
  ctx.fillStyle = '#0f172a';
  ctx.beginPath(); ctx.ellipse(-20 - legSwing, -8, 22, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(28 + legSwing, -8, 22, 10, 0, 0, Math.PI * 2); ctx.fill();

  // 2. BEAN-SHAPED TORSO (Not stiff rectangle!)
  ctx.lineWidth = 8;
  if (char === 'villain') {
    const capeWave = Math.sin(frameTick * 0.16) * 14;
    ctx.fillStyle = '#7f1d1d';
    ctx.beginPath(); ctx.moveTo(-40, -255); ctx.lineTo(40, -255); ctx.lineTo(88 + capeWave, -40); ctx.lineTo(-80 + capeWave, -40); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1e293b';
  } else if (char === 'mom') {
    ctx.fillStyle = '#ec4899';
  } else {
    ctx.fillStyle = char === 'hero' ? '#3b82f6' : char === 'bro' ? '#f59e0b' : '#10b981';
  }

  ctx.beginPath();
  ctx.moveTo(-42, -125);
  ctx.quadraticCurveTo(-52, -200, -36, -262);
  ctx.quadraticCurveTo(0, -272, 36, -262);
  ctx.quadraticCurveTo(52, -200, 42, -125);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // 3. EXPRESSIVE NOODLE ARMS (Curved bezier arms!)
  ctx.lineWidth = 8;
  if (power && power !== 'none' && power !== 'aura' && isSpeaker) {
    ctx.beginPath(); ctx.moveTo(-42, -235); ctx.quadraticCurveTo(-75, -205, -65, -165); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(42, -238); ctx.quadraticCurveTo(95, -245, 138, -238); ctx.stroke();
    drawSuperpowerVFX(power, 155, -238);
  } else if (emotion === 'shocked') {
    ctx.beginPath(); ctx.moveTo(-42, -238); ctx.quadraticCurveTo(-98, -275, -86, -352); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(42, -238); ctx.quadraticCurveTo(98, -275, 86, -352); ctx.stroke();
  } else {
    const wave = isSpeaker ? Math.sin(frameTick * 0.35) * 26 * talkAmt : 0;
    ctx.beginPath(); ctx.moveTo(-42, -235); ctx.quadraticCurveTo(-78, -195, -62, -155); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(42, -235); ctx.quadraticCurveTo(86, -210 - wave, 76, -165 - wave * 1.4); ctx.stroke();
  }

  // 4. HEAD (Slightly Squashed Organic Circle + Shading)
  const headY = -362;
  ctx.fillStyle = char === 'villain' ? '#e2e8f0' : '#ffffff';
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.ellipse(0, headY, 102, 96, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  // Cheek / Dark Circle Shading (Signature NOT YOUR TYPE detail!)
  if (emotion === 'shadow' || emotion === 'angry' || char === 'villain') {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.16)';
    ctx.beginPath(); ctx.ellipse(0, headY - 22, 85, 36, 0, 0, Math.PI * 2); ctx.fill();
  }

  // Hair / Cap / Horns
  ctx.fillStyle = '#0f172a';
  if (char === 'villain') {
    ctx.fillStyle = '#991b1b';
    ctx.beginPath(); ctx.moveTo(-82, headY - 52); ctx.lineTo(-102, headY - 125); ctx.lineTo(-42, headY - 82); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(82, headY - 52); ctx.lineTo(102, headY - 125); ctx.lineTo(42, headY - 82); ctx.fill(); ctx.stroke();
  } else if (char === 'hero') {
    // Messy Spiky Doodle Hair
    ctx.beginPath();
    ctx.moveTo(-95, headY - 30); ctx.lineTo(-78, headY - 118); ctx.lineTo(-35, headY - 88);
    ctx.lineTo(0, headY - 135); ctx.lineTo(36, headY - 88); ctx.lineTo(80, headY - 115); ctx.lineTo(95, headY - 30);
    ctx.quadraticCurveTo(0, headY - 68, -95, headY - 30); ctx.fill();
  } else if (char === 'bro') {
    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.arc(0, headY - 32, 98, Math.PI, 0); ctx.fill(); ctx.stroke();
    ctx.fillRect(-135, headY - 40, 68, 15); ctx.strokeRect(-135, headY - 40, 68, 15);
  } else if (char === 'mom') {
    ctx.beginPath(); ctx.arc(0, headY - 118, 36, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, headY - 32, 100, Math.PI, 0); ctx.fill();
  }

  // 5. CONJOINED OVERSIZED EXPRESSIVE EYES (Signature NOT YOUR TYPE Look!)
  const eyeY = headY - 6;
  const pupilShift = lookDir * 6;
  const isBlinking = (blinkTimer + (isSpeaker ? 0 : 45)) % 150 > 143;

  if (emotion === 'dead') {
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(-48, eyeY - 16); ctx.lineTo(-20, eyeY + 12); ctx.moveTo(-20, eyeY - 16); ctx.lineTo(-48, eyeY + 12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(20, eyeY - 16); ctx.lineTo(48, eyeY + 12); ctx.moveTo(48, eyeY - 16); ctx.lineTo(20, eyeY + 12); ctx.stroke();
  } else {
    // Two big touching white eye circles with black outlines
    const eyeR = emotion === 'shocked' ? 30 : 25;
    ctx.fillStyle = char === 'villain' ? '#fecaca' : '#ffffff';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(-23, eyeY, eyeR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(23, eyeY, eyeR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    if (isBlinking && emotion === 'normal') {
      ctx.beginPath(); ctx.moveTo(-46, eyeY); ctx.lineTo(46, eyeY); ctx.stroke();
    } else {
      const pupR = emotion === 'shocked' ? 5 : 8;
      ctx.fillStyle = char === 'villain' ? '#dc2626' : '#0f172a';
      ctx.beginPath(); ctx.arc(-23 + pupilShift, eyeY, pupR, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(23 + pupilShift, eyeY, pupR, 0, Math.PI * 2); ctx.fill();
    }

    // Expressive Eyebrows
    ctx.lineWidth = 7;
    if (emotion === 'angry' || char === 'villain') {
      ctx.beginPath(); ctx.moveTo(-54, eyeY - 34); ctx.lineTo(-6, eyeY - 22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(54, eyeY - 34); ctx.lineTo(6, eyeY - 22); ctx.stroke();
    } else if (emotion === 'smug') {
      ctx.beginPath(); ctx.moveTo(-50, eyeY - 30); ctx.lineTo(-8, eyeY - 26); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(8, eyeY - 38); ctx.lineTo(52, eyeY - 28); ctx.stroke();
    }
  }

  // 6. DYNAMIC LIP-SYNC MOUTHS (D-shape with teeth/tongue, O-shock, Smirk)
  const mouthY = headY + 46;
  ctx.lineWidth = 6;
  if (isSpeaker && talkAmt > 0.08) {
    if (talkAmt > 0.52) {
      // Big 'D' Talking Mouth with White Teeth & Pink Tongue
      ctx.fillStyle = '#7f1d1d';
      ctx.beginPath(); ctx.arc(0, mouthY - 8, 28, 0, Math.PI, false); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-20, mouthY - 8, 40, 7);
      ctx.fillStyle = '#fb7185'; ctx.beginPath(); ctx.arc(0, mouthY + 12, 12, Math.PI, 0); ctx.fill();
    } else {
      // 'O' Speaking Mouth
      ctx.fillStyle = '#7f1d1d';
      ctx.beginPath(); ctx.ellipse(0, mouthY, 16, Math.max(8, talkAmt * 24), 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  } else {
    ctx.beginPath();
    if (emotion === 'smug' || char === 'villain') ctx.arc(0, mouthY - 6, 24, 0.1 * Math.PI, 0.85 * Math.PI);
    else if (emotion === 'shocked') { ctx.fillStyle = '#7f1d1d'; ctx.arc(0, mouthY + 4, 14, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.moveTo(-18, mouthY); ctx.lineTo(18, mouthY); }
    ctx.stroke();
  }

  ctx.restore();
}

function drawCutaway(scene) {
  const card = scene.card;
  if (!card || !card.icon) return;
  const W = canvas.width, bob = Math.sin(frameTick * 0.14) * 8;
  ctx.save(); ctx.translate(W * 0.78, 175 + bob);
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.roundRect(-110, -75, 220, 150, 18); ctx.fill(); ctx.stroke();
  ctx.font = '68px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(card.icon, 0, 10);
  if (card.label) { ctx.fillStyle = '#0f172a'; ctx.font = '900 20px sans-serif'; ctx.fillText(String(card.label).toUpperCase().slice(0, 18), 0, 58); }
  ctx.textAlign = 'left'; ctx.restore();
}

function drawCaptions(text, char) {
  if (!text) return;
  const W = canvas.width, H = canvas.height;
  const names = { hero: 'HERO', bro: 'BRO', villain: 'VILLAIN', mom: 'MUMMY', npc: 'DOST' };
  const colors = { hero: '#3b82f6', bro: '#f59e0b', villain: '#991b1b', mom: '#ec4899', npc: '#10b981' };

  ctx.fillStyle = colors[char] || '#ef4444'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.roundRect(36, 36, 185, 44, 12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.font = '900 24px sans-serif'; ctx.fillText(names[char] || 'HERO', 58, 66);

  ctx.font = '900 34px sans-serif'; ctx.textAlign = 'center';
  const words = text.split(' '), lines = []; let line = '', maxLineW = W - 100;
  for (let n = 0; n < words.length; n++) {
    const test = line + words[n] + ' ';
    if (ctx.measureText(test).width > maxLineW && n > 0) { lines.push(line.trim()); line = words[n] + ' '; }
    else line = test;
  }
  lines.push(line.trim());

  let startY = H - 55 - (lines.length - 1) * 42;
  for (let i = 0; i < lines.length; i++) {
    const y = startY + i * 44;
    ctx.strokeStyle = '#000000'; ctx.lineWidth = 9; ctx.lineJoin = 'round';
    ctx.strokeText(lines[i], W * 0.5, y);
    ctx.fillStyle = i === lines.length - 1 ? '#facc15' : '#ffffff';
    ctx.fillText(lines[i], W * 0.5, y);
  }
  ctx.textAlign = 'left';
}

function renderLoop() {
  frameTick++; blinkTimer++; scenePop += (1 - scenePop) * 0.28;
  const W = canvas.width, H = canvas.height, groundY = Math.round(H * 0.77);
  const charScale = H < 800 ? 0.74 : 0.96;

  if (analyser && dataArray) {
    analyser.getByteFrequencyData(dataArray);
    let sum = 0; for (let i = 0; i < 32; i++) sum += dataArray[i];
    mouthOpen = Math.min(1, Math.max(0, ((sum / 32) - 10) / 65));
  } else mouthOpen = 0;

  ctx.save();
  if (currentScene.zoom === 'in') { ctx.translate(W * 0.5, groundY - 180); ctx.scale(1.18, 1.18); ctx.translate(-W * 0.5, -(groundY - 180)); }
  else if (currentScene.zoom === 'shake') { ctx.translate((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22); }

  const isMoving = currentScene.action === 'walk' || currentScene.action === 'run';
  drawEnvironment(currentScene.location || 'park', isMoving);

  const speaker = currentScene.char || 'hero';
  const listener = currentScene.other || (speaker === 'hero' ? 'bro' : 'hero');

  if (currentScene.zoom !== 'in') {
    drawFullBodyCharacter(listener, currentScene.otherEmotion || 'normal', 'idle', 'none', 0, W * 0.70, groundY, charScale * 0.88, false, -1);
    drawFullBodyCharacter(speaker, currentScene.emotion || 'normal', currentScene.action || 'idle', currentScene.power || 'none', mouthOpen, W * 0.32, groundY, charScale, true, 1);
  } else {
    drawFullBodyCharacter(speaker, currentScene.emotion || 'normal', currentScene.action || 'idle', currentScene.power || 'none', mouthOpen, W * 0.48, groundY, charScale * 1.06, true, 0);
  }

  drawCutaway(currentScene);
  ctx.restore();
  drawCaptions(currentScene.text, speaker);
  requestAnimationFrame(renderLoop);
}
renderLoop();

// Audio & Voice Helpers
function pcmToWavBuffer(base64Pcm, sampleRate = 24000) {
  const binary = atob(base64Pcm), pcmLen = binary.length, wavBuffer = new ArrayBuffer(44 + pcmLen), view = new DataView(wavBuffer);
  const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF'); view.setUint32(4, 36 + pcmLen, true); writeStr(8, 'WAVE');
  writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeStr(36, 'data'); view.setUint32(40, pcmLen, true);
  const bytes = new Uint8Array(wavBuffer, 44);
  for (let i = 0; i < pcmLen; i++) bytes[i] = binary.charCodeAt(i);
  return wavBuffer;
}

async function fetchAllHumanVoicesInOneCall(scenes, partLabel = '') {
  const key = apiKeyInput.value.trim();
  if (!key) throw new Error('Gemini API Key required!');
  const dialogueLines = scenes.map((sc) => `${sc.char === 'mom' ? 'FemaleVoice' : 'MaleVoice'}: ${sc.text}`).join('\n');
  const promptText = `Act out this funny Indian Hinglish story with expressive emotions and brief pauses:\n${dialogueLines}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    setStatus(`🎙️ Generating Human Voices ${partLabel} (attempt ${attempt + 1})...`);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              multiSpeakerVoiceConfig: {
                speakerVoiceConfigs: [
                  { speaker: 'MaleVoice', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
                  { speaker: 'FemaleVoice', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
                ]
              }
            }
          }
        })
      });
      clearTimeout(timer);
      if (res.status === 503 || res.status === 429) { await sleep(3500); continue; }
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `HTTP ${res.status}`); }
      const data = await res.json();
      const inlineData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (!inlineData?.data) throw new Error('No audio returned');
      return await audioCtx.decodeAudioData(pcmToWavBuffer(inlineData.data, 24000));
    } catch (err) {
      clearTimeout(timer);
      if (attempt === 2) throw err;
      await sleep(2500);
    }
  }
  throw new Error('Could not generate audio');
}

function splitAudioBufferByScenes(fullBuffer, scenes) {
  if (!fullBuffer || !fullBuffer.sampleRate) {
    return scenes.map(() => createSilentBuffer(2.5));
  }
  const sampleRate = fullBuffer.sampleRate, channelData = fullBuffer.getChannelData(0), totalSamples = channelData.length;
  const weights = scenes.map(s => Math.max(4, (s.text || '').length)), totalWeight = weights.reduce((a, b) => a + b, 0);
  const slices = []; let cursorSample = 0;

  for (let i = 0; i < scenes.length; i++) {
    if (i === scenes.length - 1) { slices.push(extractSubBuffer(fullBuffer, cursorSample, totalSamples)); break; }
    const idealEnd = Math.min(totalSamples - 1, cursorSample + Math.floor((weights[i] / totalWeight) * totalSamples));
    const searchRadius = Math.floor(sampleRate * 0.65);
    const minS = Math.max(cursorSample + Math.floor(sampleRate * 0.35), idealEnd - searchRadius);
    const maxS = Math.min(totalSamples - Math.floor(sampleRate * 0.35), idealEnd + searchRadius);
    let bestSample = idealEnd, lowestEnergy = Infinity, win = Math.floor(sampleRate * 0.04);
    for (let pos = minS; pos < maxS; pos += win) {
      let energy = 0; for (let j = 0; j < win && pos + j < totalSamples; j++) energy += Math.abs(channelData[pos + j]);
      if (energy < lowestEnergy) { lowestEnergy = energy; bestSample = pos + Math.floor(win / 2); }
    }
    slices.push(extractSubBuffer(fullBuffer, cursorSample, bestSample));
    cursorSample = bestSample;
  }
  return slices;
}

function extractSubBuffer(srcBuffer, startSample, endSample) {
  const sr = (srcBuffer && srcBuffer.sampleRate) ? srcBuffer.sampleRate : 44100;
  const len = Math.max(100, endSample - startSample);
  const sub = audioCtx.createBuffer(1, len, sr);
  const s = srcBuffer.getChannelData(0), d = sub.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = s[startSample + i] || 0;
  return sub;
}

function playAudioOnce(audioBuffer, char = "hero") {
  const safeBuf = (audioBuffer && audioBuffer.sampleRate) ? audioBuffer : createSilentBuffer(2.5);
  return new Promise((resolve) => {
    let resolved = false; duckBGM(true);
    const source = audioCtx.createBufferSource();
    source.buffer = safeBuf;
    if (char === 'bro') { source.detune.value = 140; source.playbackRate.value = 1.04; }
    else if (char === 'villain') { source.detune.value = -240; source.playbackRate.value = 0.94; }
    else if (char === 'npc') { source.detune.value = -120; source.playbackRate.value = 0.99; }
    source.connect(analyser); analyser.connect(audioCtx.destination); analyser.connect(destNode);
    source.onended = () => { if (!resolved) { resolved = true; duckBGM(false); setTimeout(resolve, 35); } };
    source.start(0);
  });
}

// =========================================================================
// BULLETPROOF VIDEO RECORDER (Real H.264 MP4 with Direct AudioBuffer + WebM Fallback)
// Fixes the 1.01 KB empty file bug permanently!
// =========================================================================
async function createBulletproofRecorder(audioList) {
  const W = canvas.width, H = canvas.height;
  const sr = (audioCtx && audioCtx.sampleRate) ? audioCtx.sampleRate : 44100;

  // Try Hardware H.264 + AAC MP4 Muxer first (feeds AudioBuffers directly without MediaStreamTrackProcessor crash!)
  if (typeof Mp4Muxer !== 'undefined' && typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined') {
    try {
      const muxer = new Mp4Muxer.Muxer({
        target: new Mp4Muxer.ArrayBufferTarget(),
        video: { codec: 'avc', width: W, height: H },
        audio: { codec: 'aac', numberOfChannels: 1, sampleRate: sr },
        fastStart: 'in-memory'
      });

      const videoEncoder = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => console.error(e) });
      videoEncoder.configure({ codec: 'avc1.42001f', width: W, height: H, bitrate: 2_200_000, framerate: 30 });

      const audioEncoder = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => console.error(e) });
      audioEncoder.configure({ codec: 'mp4a.40.2', numberOfChannels: 1, sampleRate: sr, bitrate: 128_000 });

      // Encode all scene AudioBuffers directly into AAC track upfront!
      let audioTimestampUs = 0;
      for (const buf of audioList) {
        const safeBuf = (buf && buf.sampleRate) ? buf : createSilentBuffer(2.0);
        const pcm = safeBuf.getChannelData(0);
        const chunkSize = 1024;
        for (let offset = 0; offset < pcm.length; offset += chunkSize) {
          const len = Math.min(chunkSize, pcm.length - offset);
          const slice = pcm.subarray(offset, offset + len);
          const audioData = new AudioData({
            format: 'f32',
            sampleRate: safeBuf.sampleRate,
            numberOfFrames: len,
            numberOfChannels: 1,
            timestamp: audioTimestampUs,
            data: slice
          });
          audioEncoder.encode(audioData);
          audioData.close();
          audioTimestampUs += Math.round((len / safeBuf.sampleRate) * 1_000_000);
        }
      }

      const startTime = performance.now();
      let frameIdx = 0;
      const frameTimer = setInterval(() => {
        if (videoEncoder.state !== 'configured') return;
        const timestampUs = Math.round((performance.now() - startTime) * 1000);
        const frame = new VideoFrame(canvas, { timestamp: timestampUs });
        videoEncoder.encode(frame, { keyFrame: frameIdx % 60 === 0 });
        frame.close();
        frameIdx++;
      }, 33);

      return {
        stop: async () => {
          clearInterval(frameTimer);
          await videoEncoder.flush();
          await audioEncoder.flush();
          muxer.finalize();
          const secs = Math.max(1, Math.round((performance.now() - startTime) / 1000));
          return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), ext: 'mp4', secs };
        }
      };
    } catch (e) {
      console.warn('MP4 WebCodecs fallback to MediaRecorder:', e);
    }
  }

  // Fallback: MediaRecorder with proper stream
  const canvasStream = canvas.captureStream(30);
  const audioTracks = destNode ? destNode.stream.getAudioTracks() : [];
  const combined = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus' : 'video/webm';
  const rec = new MediaRecorder(combined, { mimeType: mime });
  const chunks = [];
  const startTime = performance.now();
  rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
  rec.start(200);

  return {
    stop: () => new Promise((resolve) => {
      rec.onstop = () => {
        const secs = Math.max(1, Math.round((performance.now() - startTime) / 1000));
        resolve({ blob: new Blob(chunks, { type: 'video/webm' }), ext: 'webm', secs });
      };
      rec.stop();
    })
  };
}

function triggerAutoDownload(blob, filename) {
  if (!blob || blob.size < 5000) {
    setStatus('⚠️ Video file too small — try Preview or check permissions.');
    return;
  }
  const url = URL.createObjectURL(blob);
  downloadLink.href = url;
  downloadLink.download = filename;
  downloadLink.classList.remove('hidden');
  downloadLink.click();
}

async function renderSinglePart(scenes, partNum, totalParts, recordVideo = true, autoSave = false) {
  const partLabel = totalParts > 1 ? `[Part ${partNum}/${totalParts}]` : '';
  const currentHash = JSON.stringify(scenes.map(s => `${s.char}:${s.text}`));
  let audioList = [];
  const allMic = scenes.every((_, idx) => !!customMicBuffers[idx]);

  if (allMic) audioList = scenes.map((_, idx) => customMicBuffers[idx]);
  else if (cachedScriptHash === currentHash && cachedAudioSlices.length === scenes.length) {
    audioList = scenes.map((_, idx) => customMicBuffers[idx] || cachedAudioSlices[idx]);
  } else {
    const fullAudio = await fetchAllHumanVoicesInOneCall(scenes, partLabel);
    cachedAudioSlices = splitAudioBufferByScenes(fullAudio, scenes);
    cachedScriptHash = currentHash;
    audioList = scenes.map((_, idx) => customMicBuffers[idx] || cachedAudioSlices[idx]);
  }

  let recorderSession = recordVideo ? await createBulletproofRecorder(audioList) : null;
  startComedyBGM();
  for (let i = 0; i < scenes.length; i++) {
    currentScene = scenes[i];
    scenePop = 0.78;
    playSFX(scenes[i].sfx);
    setStatus(`🎬 ${partLabel} Rendering Scene ${i + 1}/${scenes.length}...`);
    await playAudioOnce(audioList[i], scenes[i].char);
  }
  stopComedyBGM();

  if (recorderSession) {
    setStatus(`📦 ${partLabel} Finalizing Video File...`);
    const { blob, ext, secs } = await recorderSession.stop();
    const fname = `storytoon_part${partNum}of${totalParts}_${secs}s.${ext}`;
    if (autoSave) triggerAutoDownload(blob, fname);
    else {
      downloadLink.href = URL.createObjectURL(blob);
      downloadLink.download = fname;
      downloadLink.classList.remove('hidden');
    }
    return { secs, sizeKB: Math.round(blob.size / 1024) };
  }
  return { secs: 0, sizeKB: 0 };
}

// 🚀 1-CLICK AUTO-PILOT
document.getElementById('oneClickAutoBtn').onclick = async () => {
  if (isPlayingSequence) return;
  const key = apiKeyInput.value.trim();
  const topic = topicInput.value.trim();
  if (!key) return setStatus('Enter your Google AI Studio API Key first!');
  if (!topic) return setStatus('Enter a Story Topic first!');

  const totalParts = parseInt(episodeModeSelect.value, 10) || 1;
  isPlayingSequence = true;
  initAudio();
  downloadLink.classList.add('hidden');
  Object.keys(customMicBuffers).forEach(k => delete customMicBuffers[k]);

  let prevEnding = '';
  try {
    for (let part = 1; part <= totalParts; part++) {
      const scenes = await fetchPartScriptFromGemini(key, topic, part, totalParts, prevEnding);
      scriptEditor.value = JSON.stringify(scenes, null, 2);
      cachedScriptHash = '';
      renderMicControls();
      prevEnding = scenes.slice(-2).map(s => s.text).join(' ');

      const { secs, sizeKB } = await renderSinglePart(scenes, part, totalParts, true, true);
      setStatus(`✅ Part ${part}/${totalParts} saved (${secs}s • ${sizeKB} KB)!`);
      if (part < totalParts) await sleep(1500);
    }
    setStatus(`🎉 ALL ${totalParts} PART(S) COMPLETE! Real playable video saved in Downloads!`);
  } catch (err) {
    setStatus(`Error: ${err.message}`);
  } finally {
    isPlayingSequence = false;
  }
};

// Manual Buttons
document.getElementById('generateScriptBtn').onclick = async () => {
  if (isPlayingSequence) return;
  const key = apiKeyInput.value.trim();
  const topic = topicInput.value.trim();
  if (!key || !topic) return setStatus('Enter API Key & Topic first!');
  try {
    const scenes = await fetchPartScriptFromGemini(key, topic, 1, 1, '');
    scriptEditor.value = JSON.stringify(scenes, null, 2);
    cachedScriptHash = '';
    renderMicControls();
    setStatus(`✅ Script ready (${scenes.length} scenes)!`);
  } catch (err) { setStatus(`Error: ${err.message}`); }
};

document.getElementById('playRecordBtn').onclick = async () => {
  if (isPlayingSequence) return;
  let scenes;
  try { scenes = JSON.parse(scriptEditor.value); } catch { return setStatus('Invalid JSON script!'); }
  isPlayingSequence = true; initAudio();
  try {
    const { secs, sizeKB } = await renderSinglePart(scenes, 1, 1, true, true);
    setStatus(`✅ Saved Real Video (${secs}s • ${sizeKB} KB)!`);
  } catch (err) { setStatus(`Error: ${err.message}`); }
  finally { isPlayingSequence = false; }
};

document.getElementById('previewOnlyBtn').onclick = async () => {
  if (isPlayingSequence) return;
  let scenes;
  try { scenes = JSON.parse(scriptEditor.value); } catch { return setStatus('Invalid JSON script!'); }
  isPlayingSequence = true; initAudio();
  try { await renderSinglePart(scenes, 1, 1, false, false); setStatus('Preview finished!'); }
  catch (err) { setStatus(`Error: ${err.message}`); }
  finally { isPlayingSequence = false; }
};

renderMicControls();
