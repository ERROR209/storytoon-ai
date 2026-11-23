const canvas = document.getElementById('stageCanvas');
const ctx = canvas.getContext('2d');
const canvasWrap = document.getElementById('canvasWrap');
const apiKeyInput = document.getElementById('apiKeyInput');
const topicInput = document.getElementById('topicInput');
const formatSelect = document.getElementById('formatSelect');
const toneSelect = document.getElementById('toneSelect');
const lengthSelect = document.getElementById('lengthSelect');
const scriptEditor = document.getElementById('scriptEditor');
const statusBar = document.getElementById('statusBar');
const downloadLink = document.getElementById('downloadLink');

apiKeyInput.value = localStorage.getItem('gemini_api_key') || '';
apiKeyInput.addEventListener('change', () => {
  localStorage.setItem('gemini_api_key', apiKeyInput.value.trim());
});

// Aspect Ratio Switcher (YouTube 16:9, Reels/Shorts 9:16, Post 1:1)
function applyFormat() {
  const fmt = formatSelect.value;
  if (fmt === '16:9') {
    canvas.width = 1280;
    canvas.height = 720;
    canvasWrap.style.aspectRatio = '16 / 9';
    canvasWrap.style.maxWidth = '100%';
  } else if (fmt === '1:1') {
    canvas.width = 960;
    canvas.height = 960;
    canvasWrap.style.aspectRatio = '1 / 1';
    canvasWrap.style.maxWidth = '380px';
  } else {
    canvas.width = 720;
    canvas.height = 1280;
    canvasWrap.style.aspectRatio = '9 / 16';
    canvasWrap.style.maxWidth = '330px';
  }
}
formatSelect.addEventListener('change', applyFormat);
applyFormat();

const DEMO_SCRIPT = [
  { char: "hero", other: "bro", emotion: "normal", otherEmotion: "normal", action: "walk", location: "gaon", power: "none", card: null, zoom: "normal", sfx: "none", text: "Gaon ki kachchi sadak par chalte hue mujhe ek chamakta patthar mila." },
  { char: "bro", other: "hero", emotion: "shocked", otherEmotion: "smug", action: "idle", location: "gaon", power: "energy", card: { icon: "⚡", label: "POWER UNLOCKED" }, zoom: "in", sfx: "gasp", text: "Bhai tere haath se toh neeli bijli nikal rahi hai!" },
  { char: "villain", other: "hero", emotion: "angry", otherEmotion: "shocked", action: "walk", location: "shehar", power: "fire", card: { icon: "😈", label: "VILLAIN ENTRY" }, zoom: "shake", sfx: "boom", text: "Shehar par ab mera raaj hoga, koi mujhe rok nahi sakta!" },
  { char: "hero", other: "villain", emotion: "shadow", otherEmotion: "angry", action: "run", location: "shehar", power: "aura", card: null, zoom: "in", sfx: "boom", text: "Gaon wale jab jaagte hain toh bade se bada villain udd jata hai!" },
  { char: "villain", other: "hero", emotion: "dead", otherEmotion: "smug", action: "idle", location: "shehar", power: "none", card: { icon: "💥", label: "GAME OVER" }, zoom: "normal", sfx: "slap", text: "Maaf kar de bhai, main wapas apne ghar ja raha hoon!" }
];
// Ensure dead char doesn't speak in demo
DEMO_SCRIPT[4].char = "bro";
DEMO_SCRIPT[4].other = "villain";
DEMO_SCRIPT[4].text = "Ek hi mukke mein villain ki hawa nikal gayi bhai!";

scriptEditor.value = JSON.stringify(DEMO_SCRIPT, null, 2);
let episodePartNum = 1;

function setStatus(msg) { statusBar.textContent = msg; }

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
  micPanel.innerHTML = '<div style="font-size:0.75rem;color:#94a3b8;font-weight:700;margin-top:4px;">🎙️ Optional: Apni Real Voice Record Karo (Scene-by-Scene)</div>';
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
    row.appendChild(label);
    row.appendChild(btn);
    micPanel.appendChild(row);
  });
}

scriptEditor.addEventListener('change', () => { cachedScriptHash = ''; renderMicControls(); });
document.getElementById('loadDemoBtn').onclick = () => {
  scriptEditor.value = JSON.stringify(DEMO_SCRIPT, null, 2);
  cachedScriptHash = '';
  episodePartNum = 1;
  renderMicControls();
  setStatus('Action & Superpower Demo loaded!');
};

// Web Audio Engine
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
let destNode = null;
let analyser = null;
let dataArray = null;
let bgmGain = null;
let bgmInterval = null;
let isPlayingSequence = false;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new AudioCtx();
    destNode = audioCtx.createMediaStreamDestination();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    dataArray = new Uint8Array(analyser.frequencyBinCount);

    bgmGain = audioCtx.createGain();
    bgmGain.gain.value = 0.10;
    bgmGain.connect(audioCtx.destination);
    bgmGain.connect(destNode);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function startComedyBGM() {
  stopComedyBGM();
  const notes = [261.63, 329.63, 392.00, 329.63, 293.66, 349.23, 440.00, 349.23];
  let step = 0;
  bgmInterval = setInterval(() => {
    if (!audioCtx || audioCtx.state !== 'running') return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const noteGain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(notes[step % notes.length], now);
    step++;
    noteGain.gain.setValueAtTime(0.001, now);
    noteGain.gain.linearRampToValueAtTime(0.25, now + 0.02);
    noteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(noteGain); noteGain.connect(bgmGain);
    osc.start(now); osc.stop(now + 0.23);
  }, 270);
}

function stopComedyBGM() { if (bgmInterval) { clearInterval(bgmInterval); bgmInterval = null; } }
function duckBGM(speaking) { if (bgmGain && audioCtx) bgmGain.gain.setTargetAtTime(speaking ? 0.03 : 0.11, audioCtx.currentTime, 0.06); }

function playSFX(type) {
  if (!type || type === 'none') return;
  initAudio();
  const now = audioCtx.currentTime;
  if (type === 'boom') {
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
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
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(280, now); osc.frequency.exponentialRampToValueAtTime(780, now + 0.18);
    gain.gain.setValueAtTime(0.4, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain); gain.connect(audioCtx.destination); gain.connect(destNode);
    osc.start(now); osc.stop(now + 0.2);
  }
}

// Auto-Detect Live Gemini Model + Story / Next-Part Episode Generator
async function getAvailableTextModels(key) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return ['gemini-3.8-flash', 'gemini-3.0-flash'];
    const data = await res.json();
    const live = (data.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace('models/', ''))
      .filter(name => name.includes('flash') && !name.includes('tts') && !name.includes('image') && !name.includes('audio'));
    live.sort((a, b) => (b.includes('lite') ? 1 : 0) - (a.includes('lite') ? 1 : 0));
    return live.length > 0 ? live : ['gemini-3.8-flash', 'gemini-3.0-flash'];
  } catch {
    return ['gemini-3.8-flash', 'gemini-3.0-flash'];
  }
}

async function generateStoryScript(isContinuation = false) {
  const key = apiKeyInput.value.trim();
  const topic = topicInput.value.trim();
  if (!key) return setStatus('Enter your Google AI Studio API Key first!');
  if (!topic) return setStatus('Enter a story topic first!');

  let prevSummary = '';
  if (isContinuation) {
    try {
      const prev = JSON.parse(scriptEditor.value);
      prevSummary = `Continue directly from Part ${episodePartNum} which ended with: "${prev.slice(-2).map(s => s.text).join(' ')}". Write Part ${++episodePartNum}!`;
    } catch { prevSummary = ''; }
  } else {
    episodePartNum = 1;
  }

  const prompt = `Viral Indian animated story creator ("NOT YOUR TYPE" style). Write a ${lengthSelect.value}-line Hinglish episode script on: "${topic}". Genre: ${toneSelect.value}. ${prevSummary}
Characters: "hero" (main guy), "bro" (best friend), "villain" (evil boss/enemy with cape), "npc" (villager/stranger), "mom" (ONLY if home/family story).
Emotions: "normal", "shocked", "smug", "angry", "crying", "dead", "shadow".
Actions: "idle", "walk" (walking animation), "run" (running animation).
Locations: "gaon" (village/fields/huts), "shehar" (city/buildings/road), "room", "school", "jungle", "night", "dramatic", "red".
Superpowers: "none", "energy" (blue rasengan ball), "fire" (fireball), "lightning" (electric bolts), "aura" (golden power aura).
Card: null OR {"icon":"emoji","label":"2 WORD TEXT"} ONLY when visually helpful.
Zooms: "normal", "in", "shake". SFX: "none", "boom", "slap", "gasp".
Rule: Match locations ("gaon", "shehar", etc.), walking actions, villains, and superpowers strictly to the story events. Dead characters NEVER speak.
Return ONLY JSON array: [{"char":"hero","other":"bro","emotion":"smug","otherEmotion":"normal","action":"walk","location":"gaon","power":"none","card":null,"zoom":"normal","sfx":"none","text":"8-13 words Hinglish"}].`;

  setStatus('🔍 Connecting to Gemini...');
  const models = await getAvailableTextModels(key);
  let lastErr = 'Timed out';

  for (const model of models.slice(0, 8)) {
    try {
      setStatus(`⚡ Writing Part ${episodePartNum} with ${model}...`);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 11000);
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
      if (!res.ok) { lastErr = data.error?.message || `HTTP ${res.status}`; continue; }

      let raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const sIdx = raw.indexOf('[');
      const eIdx = raw.lastIndexOf(']');
      if (sIdx === -1 || eIdx === -1) { lastErr = 'Invalid JSON'; continue; }

      const parsed = JSON.parse(raw.slice(sIdx, eIdx + 1));
      scriptEditor.value = JSON.stringify(parsed, null, 2);
      cachedScriptHash = '';
      Object.keys(customMicBuffers).forEach(k => delete customMicBuffers[k]);
      renderMicControls();
      setStatus(`✅ Part ${episodePartNum} ready (${parsed.length} scenes)! Tap "2. Render Real MP4".`);
      return;
    } catch (err) {
      lastErr = err.name === 'AbortError' ? `${model} timed out` : err.message;
    }
  }
  setStatus(`Error: ${lastErr}`);
}

document.getElementById('generateScriptBtn').onclick = () => generateStoryScript(false);
document.getElementById('nextPartBtn').onclick = () => generateStoryScript(true);

// Dynamic Stage Renderer (Supports 16:9 YouTube, 9:16 Shorts/Reels, 1:1 Post + Gaon/Shehar/Villain/Powers)
let currentScene = DEMO_SCRIPT[0];
let mouthOpen = 0;
let frameTick = 0;
let scenePop = 1;
let blinkTimer = 0;

function drawEnvironment(loc, isMoving) {
  const W = canvas.width;
  const H = canvas.height;
  const floorY = Math.round(H * 0.78);
  const scrollX = isMoving ? (frameTick * 4) % W : 0;

  if (loc === 'red') {
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 8;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 + frameTick * 0.04;
      ctx.beginPath();
      ctx.moveTo(W * 0.5 + Math.cos(a) * 140, H * 0.45 + Math.sin(a) * 140);
      ctx.lineTo(W * 0.5 + Math.cos(a) * W, H * 0.45 + Math.sin(a) * H);
      ctx.stroke();
    }
  } else if (loc === 'gaon') {
    // Village Sky + Sun + Distant Green Hills + Huts + Trees
    ctx.fillStyle = '#bae6fd';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fde047';
    ctx.beginPath(); ctx.arc(W * 0.82, H * 0.16, 44, 0, Math.PI * 2); ctx.fill();

    // Rolling Green Hills
    ctx.fillStyle = '#4ade80';
    ctx.beginPath(); ctx.arc(W * 0.25, floorY, W * 0.45, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#22c55e';
    ctx.beginPath(); ctx.arc(W * 0.78, floorY, W * 0.5, Math.PI, 0); ctx.fill();

    // Village Hut & Tree (Parallax scrolling when walking!)
    const hutX = ((W * 0.22 - scrollX) + W) % W;
    ctx.fillStyle = '#fde68a'; ctx.strokeStyle = '#78350f'; ctx.lineWidth = 5;
    ctx.fillRect(hutX, floorY - 110, 120, 110); ctx.strokeRect(hutX, floorY - 110, 120, 110);
    ctx.fillStyle = '#b45309';
    ctx.beginPath(); ctx.moveTo(hutX - 18, floorY - 110); ctx.lineTo(hutX + 60, floorY - 175); ctx.lineTo(hutX + 138, floorY - 110); ctx.closePath(); ctx.fill(); ctx.stroke();

    const treeX = ((W * 0.75 - scrollX) + W) % W;
    ctx.fillStyle = '#78350f'; ctx.fillRect(treeX - 12, floorY - 140, 24, 140);
    ctx.fillStyle = '#15803d';
    ctx.beginPath(); ctx.arc(treeX, floorY - 160, 58, 0, Math.PI * 2); ctx.fill();
  } else if (loc === 'shehar') {
    // City Skyline + Buildings + Street Lights
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, 0, W, H);
    const buildings = [
      { x: 0.08, w: 130, h: 290, c: '#64748b' },
      { x: 0.32, w: 150, h: 360, c: '#475569' },
      { x: 0.62, w: 140, h: 320, c: '#64748b' },
      { x: 0.85, w: 120, h: 260, c: '#334155' }
    ];
    buildings.forEach(b => {
      const bx = ((W * b.x - scrollX) + W) % W;
      ctx.fillStyle = b.c;
      ctx.fillRect(bx, floorY - b.h, b.w, b.h);
      ctx.fillStyle = '#fef08a';
      for (let wy = floorY - b.h + 25; wy < floorY - 30; wy += 45) {
        ctx.fillRect(bx + 20, wy, 22, 24);
        ctx.fillRect(bx + b.w - 42, wy, 22, 24);
      }
    });
  } else if (loc === 'jungle') {
    ctx.fillStyle = '#dcfce7';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 5; i++) {
      const tx = ((W * (i * 0.22) - scrollX) + W) % W;
      ctx.fillStyle = '#713f12'; ctx.fillRect(tx, floorY - 220, 28, 220);
      ctx.fillStyle = '#166534'; ctx.beginPath(); ctx.arc(tx + 14, floorY - 240, 75, 0, Math.PI * 2); ctx.fill();
    }
  } else if (loc === 'dramatic' || loc === 'night') {
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fef08a';
    ctx.beginPath(); ctx.arc(W * 0.8, H * 0.16, 36, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2;
    for (let y = 120; y < floorY; y += 46) {
      ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(W - 24, y); ctx.stroke();
    }
  }

  // Ground Floor
  ctx.fillStyle = loc === 'gaon' ? '#d97706' : loc === 'shehar' ? '#334155' : (loc === 'night' || loc === 'dramatic') ? '#1e293b' : '#cbd5e1';
  ctx.fillRect(0, floorY, W, H - floorY);
  ctx.strokeStyle = (loc === 'night' || loc === 'dramatic' || loc === 'red') ? '#ffffff' : '#0f172a';
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(0, floorY); ctx.lineTo(W, floorY); ctx.stroke();

  // Moving Road Dashes when walking/running!
  if (loc === 'shehar' || isMoving) {
    ctx.fillStyle = '#ffffff';
    for (let dx = -scrollX; dx < W; dx += 120) {
      ctx.fillRect(dx, floorY + 28, 55, 8);
    }
  }
}

function drawSuperpowerVFX(power, x, y) {
  if (!power || power === 'none') return;
  ctx.save();
  ctx.translate(x, y);
  const pulse = 1 + Math.sin(frameTick * 0.35) * 0.18;

  if (power === 'energy') {
    // Blue Rasengan / Energy Sphere
    const grad = ctx.createRadialGradient(0, 0, 5, 0, 0, 58 * pulse);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.4, '#38bdf8');
    grad.addColorStop(1, 'rgba(37, 99, 235, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0, 0, 58 * pulse, 0, Math.PI * 2); ctx.fill();
  } else if (power === 'fire') {
    // Fireball Flames
    ctx.fillStyle = '#f97316';
    ctx.beginPath(); ctx.arc(0, 0, 42 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#facc15';
    ctx.beginPath(); ctx.arc(0, 0, 24 * pulse, 0, Math.PI * 2); ctx.fill();
  } else if (power === 'lightning') {
    // Electric Bolts
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 5;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + frameTick * 0.3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 40, Math.sin(a) * 40);
      ctx.lineTo(Math.cos(a + 0.3) * 75, Math.sin(a + 0.3) * 75);
      ctx.stroke();
    }
  } else if (power === 'aura') {
    // Golden Super Aura around Character
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.75)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.ellipse(0, -140, 130 * pulse, 240 * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawShoe(x, y, flip = false) {
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-14, 0); ctx.lineTo(26, 0); ctx.quadraticCurveTo(38, 0, 38, 16); ctx.lineTo(-16, 16);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ef4444'; ctx.fillRect(-14, 10, 50, 5);
  ctx.restore();
}

function drawHand(x, y, r = 17) {
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

function drawFullBodyCharacter(char, emotion, action, power, talkAmt, footX, groundY, scaleVal, isSpeaker) {
  const locNow = currentScene.location || 'room';
  const isDarkBg = locNow === 'dramatic' || locNow === 'night' || locNow === 'red';
  const ink = isDarkBg ? '#ffffff' : '#0f172a';

  const isWalking = action === 'walk' || action === 'run';
  const walkSpeed = action === 'run' ? 0.38 : 0.22;
  const legSwing = isWalking ? Math.sin(frameTick * walkSpeed) * 28 : 0;

  let jumpY = 0;
  if (emotion === 'shocked' && isSpeaker) jumpY = Math.abs(Math.sin(frameTick * 0.25)) * 28;
  else if (isWalking) jumpY = Math.abs(Math.sin(frameTick * walkSpeed)) * 12;
  else if (isSpeaker) jumpY = talkAmt * 12;

  ctx.save();
  ctx.translate(footX, groundY - jumpY);
  ctx.scale(scaleVal * (isSpeaker ? scenePop : 1), scaleVal * (isSpeaker ? (2 - scenePop) : 1));
  if (!isSpeaker) ctx.globalAlpha = 0.92;

  if (power === 'aura' && isSpeaker) drawSuperpowerVFX('aura', 0, -40);

  if (emotion === 'dead') {
    ctx.translate(0, -40);
    ctx.rotate(Math.PI / 2);
  }

  ctx.strokeStyle = ink; ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // 1. ANIMATED WALKING / RUNNING LEGS
  ctx.lineWidth = 10; ctx.strokeStyle = '#1e293b';
  if (emotion === 'crying') {
    ctx.beginPath(); ctx.moveTo(-26, -130); ctx.lineTo(-52, -50); ctx.lineTo(-18, -15); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(26, -130); ctx.lineTo(52, -50); ctx.lineTo(18, -15); ctx.stroke();
    drawShoe(-18, -16, true); drawShoe(18, -16, false);
  } else {
    ctx.beginPath(); ctx.moveTo(-22, -135); ctx.lineTo(-28 - legSwing, -16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(22, -135); ctx.lineTo(28 + legSwing, -16); ctx.stroke();
    drawShoe(-30 - legSwing, -16, false);
    drawShoe(30 + legSwing, -16, false);
  }

  // 2. TORSO / VILLAIN CAPE / HOODIE
  ctx.strokeStyle = ink; ctx.lineWidth = 8;
  if (char === 'villain') {
    // Evil Flowing Cape behind Villain!
    const capeWave = Math.sin(frameTick * 0.15) * 14;
    ctx.fillStyle = '#7f1d1d';
    ctx.beginPath();
    ctx.moveTo(-45, -265); ctx.lineTo(45, -265);
    ctx.lineTo(95 + capeWave, -45); ctx.lineTo(-85 + capeWave, -45);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#111827';
    ctx.beginPath(); ctx.roundRect(-54, -270, 108, 140, 28); ctx.fill(); ctx.stroke();
  } else if (char === 'mom') {
    ctx.fillStyle = '#ec4899';
    ctx.beginPath(); ctx.moveTo(-42, -265); ctx.lineTo(42, -265); ctx.lineTo(64, -90); ctx.lineTo(-64, -90); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else {
    ctx.fillStyle = char === 'hero' ? '#3b82f6' : char === 'bro' ? '#f59e0b' : '#10b981';
    ctx.beginPath(); ctx.roundRect(-52, -270, 104, 140, 32); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.roundRect(-30, -175, 60, 32, 8); ctx.stroke();
  }

  // 3. ARMS & SUPERPOWER HAND EFFECTS
  ctx.lineWidth = 8; ctx.strokeStyle = ink;
  if (power && power !== 'none' && power !== 'aura' && isSpeaker) {
    // Extending hand forward with Superpower!
    ctx.beginPath(); ctx.moveTo(-50, -240); ctx.lineTo(-80, -180); ctx.stroke();
    drawHand(-80, -180, 16);
    ctx.beginPath(); ctx.moveTo(50, -245); ctx.lineTo(145, -245); ctx.stroke();
    drawHand(145, -245, 18);
    drawSuperpowerVFX(power, 165, -245);
  } else if (emotion === 'shocked') {
    ctx.beginPath(); ctx.moveTo(-50, -245); ctx.quadraticCurveTo(-105, -275, -95, -355); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(50, -245); ctx.quadraticCurveTo(105, -275, 95, -355); ctx.stroke();
    drawHand(-95, -358, 16); drawHand(95, -358, 16);
  } else {
    const armSwing = isWalking ? -legSwing * 0.8 : (isSpeaker ? talkAmt * 28 : 0);
    ctx.beginPath(); ctx.moveTo(-50, -245); ctx.lineTo(-78 - armSwing * 0.4, -170 - armSwing); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(50, -245); ctx.lineTo(78 + armSwing * 0.4, -170 + armSwing); ctx.stroke();
    drawHand(-78 - armSwing * 0.4, -170 - armSwing, 16);
    drawHand(78 + armSwing * 0.4, -170 + armSwing, 16);
  }

  // 4. HEAD & CHARACTER IDENTITY
  const headY = -375;
  ctx.fillStyle = char === 'villain' ? '#e2e8f0' : '#ffffff';
  ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 9;
  ctx.beginPath(); ctx.arc(0, headY, 105, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  if (emotion === 'shadow') {
    ctx.save(); ctx.beginPath(); ctx.arc(0, headY, 101, Math.PI, 0); ctx.clip();
    ctx.fillStyle = '#1e1b4b'; ctx.fillRect(-110, headY - 110, 220, 115); ctx.restore();
  }

  // Hair / Villain Horns / Cap
  ctx.fillStyle = '#0f172a';
  if (char === 'villain') {
    ctx.fillStyle = '#991b1b';
    ctx.beginPath(); ctx.moveTo(-85, headY - 60); ctx.lineTo(-105, headY - 135); ctx.lineTo(-45, headY - 88); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(85, headY - 60); ctx.lineTo(105, headY - 135); ctx.lineTo(45, headY - 88); ctx.fill(); ctx.stroke();
  } else if (char === 'hero') {
    ctx.beginPath();
    ctx.moveTo(-98, headY - 34); ctx.lineTo(-78, headY - 125); ctx.lineTo(-32, headY - 95);
    ctx.lineTo(0, headY - 142); ctx.lineTo(35, headY - 95); ctx.lineTo(82, headY - 120); ctx.lineTo(98, headY - 34);
    ctx.quadraticCurveTo(0, headY - 72, -98, headY - 34); ctx.fill();
  } else if (char === 'bro') {
    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.arc(0, headY - 36, 102, Math.PI, 0); ctx.fill(); ctx.stroke();
    ctx.fillRect(-142, headY - 44, 70, 16); ctx.strokeRect(-142, headY - 44, 70, 16);
  } else if (char === 'mom') {
    ctx.beginPath(); ctx.arc(0, headY - 125, 38, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, headY - 36, 104, Math.PI, 0); ctx.fill();
  }

  // Eyes
  const isBlinking = (blinkTimer + (isSpeaker ? 0 : 45)) % 150 > 143;
  ctx.strokeStyle = '#0f172a'; ctx.fillStyle = '#0f172a';
  if (char === 'villain') {
    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.ellipse(-36, headY - 6, 16, 8, 0.25, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(36, headY - 6, 16, 8, -0.25, 0, Math.PI * 2); ctx.fill();
  } else if (emotion === 'shadow') {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(-36, headY - 6, 14, 7, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(36, headY - 6, 14, 7, -0.2, 0, Math.PI * 2); ctx.fill();
  } else if (emotion === 'dead') {
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(-50, headY - 18); ctx.lineTo(-24, headY + 8); ctx.moveTo(-24, headY - 18); ctx.lineTo(-50, headY + 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(24, headY - 18); ctx.lineTo(50, headY + 8); ctx.moveTo(50, headY - 18); ctx.lineTo(24, headY + 8); ctx.stroke();
  } else if (emotion === 'shocked') {
    ctx.fillStyle = '#fff'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(-38, headY - 8, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(38, headY - 8, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.arc(-38, headY - 8, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(38, headY - 8, 6, 0, Math.PI * 2); ctx.fill();
  } else if (isBlinking && emotion === 'normal') {
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(-50, headY - 6); ctx.lineTo(-22, headY - 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(22, headY - 6); ctx.lineTo(50, headY - 6); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(-36, headY - 6, 9, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(36, headY - 6, 9, 0, Math.PI * 2); ctx.fill();
  }

  // Mouth
  ctx.fillStyle = '#991b1b'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 6;
  const mouthY = headY + 50;
  if (isSpeaker && talkAmt > 0.08) {
    ctx.beginPath(); ctx.ellipse(0, mouthY, 22, Math.max(8, talkAmt * 26), 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  } else {
    ctx.beginPath();
    if (emotion === 'smug' || char === 'villain') ctx.arc(0, mouthY - 6, 24, 0.15 * Math.PI, 0.85 * Math.PI);
    else { ctx.moveTo(-20, mouthY); ctx.lineTo(20, mouthY); }
    ctx.stroke();
  }

  ctx.restore();
}

function drawCutaway(scene) {
  const card = scene.card;
  if (!card || !card.icon) return;
  const W = canvas.width;
  const bob = Math.sin(frameTick * 0.14) * 8;
  ctx.save();
  ctx.translate(W * 0.78, 175 + bob);
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.roundRect(-110, -75, 220, 150, 18); ctx.fill(); ctx.stroke();
  ctx.font = '68px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(card.icon, 0, 10);
  if (card.label) {
    ctx.fillStyle = '#0f172a'; ctx.font = '900 20px sans-serif';
    ctx.fillText(String(card.label).toUpperCase().slice(0, 18), 0, 58);
  }
  ctx.textAlign = 'left'; ctx.restore();
}

function drawCaptions(text, char) {
  if (!text) return;
  const W = canvas.width;
  const H = canvas.height;
  const names = { hero: 'HERO', bro: 'BRO', villain: 'VILLAIN', mom: 'MUMMY', npc: 'VILLAGER' };
  const colors = { hero: '#3b82f6', bro: '#f59e0b', villain: '#991b1b', mom: '#ec4899', npc: '#10b981' };

  ctx.fillStyle = colors[char] || '#ef4444';
  ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.roundRect(36, 36, 185, 44, 12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.font = '900 24px sans-serif';
  ctx.fillText(names[char] || 'HERO', 58, 66);

  ctx.font = '900 34px sans-serif'; ctx.textAlign = 'center';
  const words = text.split(' ');
  const lines = []; let line = '';
  const maxLineW = W - 100;

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
  const W = canvas.width;
  const H = canvas.height;
  const groundY = Math.round(H * 0.78);
  const charScale = H < 800 ? 0.72 : 0.94; // Auto-scale for 16:9 YouTube vs 9:16 Reels!

  if (analyser && dataArray) {
    analyser.getByteFrequencyData(dataArray);
    let sum = 0; for (let i = 0; i < 32; i++) sum += dataArray[i];
    mouthOpen = Math.min(1, Math.max(0, ((sum / 32) - 10) / 65));
  } else mouthOpen = 0;

  ctx.save();
  if (currentScene.zoom === 'in') {
    ctx.translate(W * 0.5, groundY - 180); ctx.scale(1.16, 1.16); ctx.translate(-W * 0.5, -(groundY - 180));
  } else if (currentScene.zoom === 'shake') {
    ctx.translate((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20);
  }

  const isMoving = currentScene.action === 'walk' || currentScene.action === 'run';
  drawEnvironment(currentScene.location || 'gaon', isMoving);

  const speaker = currentScene.char || 'hero';
  const listener = currentScene.other || (speaker === 'hero' ? 'bro' : 'hero');

  if (currentScene.zoom !== 'in') {
    drawFullBodyCharacter(listener, currentScene.otherEmotion || 'normal', 'idle', 'none', 0, W * 0.70, groundY, charScale * 0.88, false);
    drawFullBodyCharacter(speaker, currentScene.emotion || 'normal', currentScene.action || 'idle', currentScene.power || 'none', mouthOpen, W * 0.32, groundY, charScale, true);
  } else {
    drawFullBodyCharacter(speaker, currentScene.emotion || 'normal', currentScene.action || 'idle', currentScene.power || 'none', mouthOpen, W * 0.48, groundY, charScale * 1.06, true);
  }

  drawCutaway(currentScene);
  ctx.restore();
  drawCaptions(currentScene.text, speaker);
  requestAnimationFrame(renderLoop);
}
renderLoop();

// PCM to WAV Helper
function pcmToWavBuffer(base64Pcm, sampleRate = 24000) {
  const binary = atob(base64Pcm);
  const pcmLen = binary.length;
  const wavBuffer = new ArrayBuffer(44 + pcmLen);
  const view = new DataView(wavBuffer);
  const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF'); view.setUint32(4, 36 + pcmLen, true); writeStr(8, 'WAVE');
  writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeStr(36, 'data'); view.setUint32(40, pcmLen, true);
  const bytes = new Uint8Array(wavBuffer, 44);
  for (let i = 0; i < pcmLen; i++) bytes[i] = binary.charCodeAt(i);
  return wavBuffer;
}

// Single-Call 2-Speaker Gemini Human Acting Engine
async function fetchAllHumanVoicesInOneCall(scenes) {
  const key = apiKeyInput.value.trim();
  if (!key) throw new Error('Gemini API Key required!');
  const dialogueLines = scenes.map((sc) => `${sc.char === 'mom' ? 'FemaleVoice' : 'MaleVoice'}: ${sc.text}`).join('\n');
  const promptText = `Act out this funny Indian Hinglish story with expressive emotions and brief pauses:\n${dialogueLines}`;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `HTTP ${res.status}`); }
  const data = await res.json();
  const inlineData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inlineData?.data) throw new Error('No audio returned');
  return await audioCtx.decodeAudioData(pcmToWavBuffer(inlineData.data, 24000));
}

function splitAudioBufferByScenes(fullBuffer, scenes) {
  const sampleRate = fullBuffer.sampleRate;
  const channelData = fullBuffer.getChannelData(0);
  const totalSamples = channelData.length;
  const weights = scenes.map(s => Math.max(4, (s.text || '').length));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const slices = []; let cursorSample = 0;

  for (let i = 0; i < scenes.length; i++) {
    if (i === scenes.length - 1) { slices.push(extractSubBuffer(fullBuffer, cursorSample, totalSamples)); break; }
    const idealEnd = Math.min(totalSamples - 1, cursorSample + Math.floor((weights[i] / totalWeight) * totalSamples));
    const searchRadius = Math.floor(sampleRate * 0.65);
    const minS = Math.max(cursorSample + Math.floor(sampleRate * 0.35), idealEnd - searchRadius);
    const maxS = Math.min(totalSamples - Math.floor(sampleRate * 0.35), idealEnd + searchRadius);
    let bestSample = idealEnd, lowestEnergy = Infinity;
    const win = Math.floor(sampleRate * 0.04);
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
  const len = Math.max(100, endSample - startSample);
  const sub = audioCtx.createBuffer(srcBuffer.numberOfChannels, len, srcBuffer.sampleRate);
  for (let ch = 0; ch < srcBuffer.numberOfChannels; ch++) {
    const s = srcBuffer.getChannelData(ch), d = sub.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = s[startSample + i] || 0;
  }
  return sub;
}

function playAudioOnce(audioBuffer, char = "hero") {
  return new Promise((resolve) => {
    let resolved = false; duckBGM(true);
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    if (char === 'bro') { source.detune.value = 140; source.playbackRate.value = 1.04; }
    else if (char === 'villain') { source.detune.value = -240; source.playbackRate.value = 0.94; }
    else if (char === 'npc') { source.detune.value = -120; source.playbackRate.value = 0.99; }
    source.connect(analyser); analyser.connect(audioCtx.destination); analyser.connect(destNode);
    source.onended = () => { if (!resolved) { resolved = true; duckBGM(false); setTimeout(resolve, 35); } };
    source.start(0);
  });
}

// True Hardware H.264 + AAC MP4 Encoder (100% WhatsApp / YouTube / Insta Compatible!)
async function startRealMp4Recorder() {
  if (typeof Mp4Muxer === 'undefined' || typeof VideoEncoder === 'undefined') return null;
  const W = canvas.width;
  const H = canvas.height;
  const muxer = new Mp4Muxer.Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    video: { codec: 'avc', width: W, height: H },
    audio: { codec: 'aac', numberOfChannels: 2, sampleRate: audioCtx.sampleRate },
    fastStart: 'in-memory'
  });

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => console.error('VideoEncoder:', e)
  });
  videoEncoder.configure({
    codec: 'avc1.42001f',
    width: W,
    height: H,
    bitrate: 2_200_000,
    framerate: 30
  });

  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => console.error('AudioEncoder:', e)
  });
  audioEncoder.configure({
    codec: 'mp4a.40.2',
    numberOfChannels: 2,
    sampleRate: audioCtx.sampleRate,
    bitrate: 128_000
  });

  // Capture live audio stream via MediaStreamTrackProcessor
  const audioTrack = destNode.stream.getAudioTracks()[0];
  let audioReader = null;
  if (typeof MediaStreamTrackProcessor !== 'undefined' && audioTrack) {
    const processor = new MediaStreamTrackProcessor({ track: audioTrack });
    audioReader = processor.readable.getReader();
    (async () => {
      while (true) {
        const { done, value } = await audioReader.read();
        if (done) break;
        if (audioEncoder.state === 'configured') audioEncoder.encode(value);
        value.close();
      }
    })();
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
      if (audioReader) await audioReader.cancel().catch(() => {});
      await videoEncoder.flush();
      await audioEncoder.flush();
      muxer.finalize();
      const buffer = muxer.target.buffer;
      const secs = Math.max(1, Math.round((performance.now() - startTime) / 1000));
      return { blob: new Blob([buffer], { type: 'video/mp4' }), secs };
    }
  };
}

async function runAnimation(recordVideo = false) {
  if (isPlayingSequence) return;
  let scenes;
  try {
    scenes = JSON.parse(scriptEditor.value);
    if (!Array.isArray(scenes) || scenes.length === 0) throw new Error('Empty');
  } catch { return setStatus('Script Error: Click "Load Action Demo" or "1. Write Story" first!'); }

  isPlayingSequence = true;
  initAudio();
  downloadLink.classList.add('hidden');

  const currentHash = JSON.stringify(scenes.map(s => `${s.char}:${s.text}`));
  let audioList = [];
  const allMic = scenes.every((_, idx) => !!customMicBuffers[idx]);

  if (allMic) audioList = scenes.map((_, idx) => customMicBuffers[idx]);
  else if (cachedScriptHash === currentHash && cachedAudioSlices.length === scenes.length) {
    audioList = scenes.map((_, idx) => customMicBuffers[idx] || cachedAudioSlices[idx]);
  } else {
    setStatus('⚡ Generating human acting voices...');
    try {
      const fullAudio = await fetchAllHumanVoicesInOneCall(scenes);
      cachedAudioSlices = splitAudioBufferByScenes(fullAudio, scenes);
      cachedScriptHash = currentHash;
      audioList = scenes.map((_, idx) => customMicBuffers[idx] || cachedAudioSlices[idx]);
    } catch (err) {
      isPlayingSequence = false;
      return setStatus(`Voice Error: ${err.message}`);
    }
  }

  let mp4Session = null;
  if (recordVideo) {
    mp4Session = await startRealMp4Recorder();
  }

  startComedyBGM();
  for (let i = 0; i < scenes.length; i++) {
    currentScene = scenes[i];
    scenePop = 0.78;
    playSFX(scenes[i].sfx);
    setStatus(`🎬 Rendering Scene ${i + 1}/${scenes.length}...`);
    await playAudioOnce(audioList[i], scenes[i].char);
  }
  stopComedyBGM();
  isPlayingSequence = false;

  if (mp4Session) {
    setStatus('📦 Finalizing Real MP4 with duration metadata...');
    const { blob, secs } = await mp4Session.stop();
    downloadLink.href = URL.createObjectURL(blob);
    downloadLink.download = `storytoon_part${episodePartNum}_${secs}s.mp4`;
    downloadLink.classList.remove('hidden');
    setStatus(`✅ Real MP4 Ready (${secs}s)! Share directly on WhatsApp, YT & Insta!`);
  } else {
    setStatus('Preview finished!');
  }
}

document.getElementById('previewOnlyBtn').onclick = () => runAnimation(false);
document.getElementById('playRecordBtn').onclick = () => runAnimation(true);
renderMicControls();
