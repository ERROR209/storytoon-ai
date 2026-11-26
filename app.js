const APP_VERSION = 'v32.0';
const canvas = document.getElementById('stageCanvas');
const ctx = canvas.getContext('2d');
const canvasWrap = document.getElementById('canvasWrap');
const apiKeyInput = document.getElementById('apiKeyInput');
const topicInput = document.getElementById('topicInput');
const formatSelect = document.getElementById('formatSelect');
const episodeModeSelect = document.getElementById('episodeModeSelect');
const toneSelect = document.getElementById('toneSelect');
const voiceEngineSelect = document.getElementById('voiceEngineSelect');
const scriptEditor = document.getElementById('scriptEditor');
const statusBar = document.getElementById('statusBar');
const downloadLink = document.getElementById('downloadLink');

apiKeyInput.value = localStorage.getItem('gemini_api_key') || '';
apiKeyInput.addEventListener('change', () => {
  localStorage.setItem('gemini_api_key', apiKeyInput.value.trim());
});

function parseEpisodeConfig() {
  const val = episodeModeSelect.value;
  if (val === '1_60') return { totalParts: 1, targetLines: 16, label: '1 Minute (~60s)' };
  if (val === '1_45') return { totalParts: 1, targetLines: 12, label: 'Single Short (~45s)' };
  const parts = parseInt(val, 10) || 1;
  return { totalParts: parts, targetLines: 12, label: `${parts}-Part Episode` };
}

function setCrewState(role, state) {
  const roles = ['writer', 'director', 'light', 'sound', 'editor'];
  if (role === 'reset') {
    roles.forEach(r => {
      const el = document.getElementById(`crew-${r}`);
      if (el) el.className = 'crew-chip';
    });
    return;
  }
  const el = document.getElementById(`crew-${role}`);
  if (el) el.className = `crew-chip ${state}`;
}

function applyFormat() {
  canvas.style.width = '100%';
  canvas.style.height = '100%';
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
  { char: "hero", other: "gf", emotion: "sweat", otherEmotion: "smug", gesture: "explain", shot: "normal", location: "room", lighting: "pastel", punch: "Date Night", prop: "none", sfx: "none", text: "Aaj tum bahut khoobsurat lag rahi ho, maine special dinner plan kiya hai!" },
  { char: "gf", other: "hero", emotion: "smug", otherEmotion: "normal", gesture: "explain", shot: "in", location: "room", lighting: "pastel", punch: "Sweet Surprise", prop: "none", sfx: "none", text: "Aww tum kitne sweet ho, chalo jaldi chalte hain mujhe bahut bhook lagi hai!" },
  { char: "hero", other: "gf", emotion: "shocked", otherEmotion: "smug", gesture: "facepalm", shot: "normal", location: "room", lighting: "pastel", punch: "Wallet Check", prop: "phone", sfx: "gasp", text: "Ek minute ruko, mera wallet toh ghar par hi reh gaya aur UPI down hai!" },
  { char: "gf", other: "hero", emotion: "angry", otherEmotion: "sweat", gesture: "crossed", shot: "in", location: "room", lighting: "pastel", punch: "Popat Ho Gaya", prop: "none", sfx: "bonk", text: "Har baar tumhara yahi bahana hota hai, aaj bill tum hi bharoge chahe bartan dho!" }
];
scriptEditor.value = JSON.stringify(DEMO_SCRIPT, null, 2);

function setStatus(msg) { statusBar.textContent = `[${APP_VERSION}] ${msg}`; }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let cachedScriptHash = '';
let cachedAudioSlices = [];
const customMicBuffers = {};

const scriptCard = document.querySelector('.script-card');
const micPanel = document.createElement('div');
micPanel.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:6px;';
scriptCard.appendChild(micPanel);

let activeMediaRecorder = null;
let recordingSceneIdx = -1;

function renderMicControls() {
  micPanel.innerHTML = '<div style="font-size:0.74rem;color:#94a3b8;font-weight:700;margin-top:4px;">🎙️ Dubbing Booth: Apni Voice Record Karo (Optional)</div>';
  let scenes = [];
  try { scenes = JSON.parse(scriptEditor.value); } catch { return; }

  scenes.forEach((sc, idx) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;background:#0b0e14;padding:6px 8px;border-radius:8px;border:1px solid #262c3d;gap:6px;';
    const label = document.createElement('span');
    label.style.cssText = 'font-size:0.71rem;color:#e2e8f0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    label.textContent = `${idx + 1}. [${(sc.shot || 'normal').toUpperCase()} • ${(sc.char || 'hero').toUpperCase()}] ${sc.text}`;

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
        setStatus(`🎙️ Dubbing Scene ${idx + 1}...`);
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
  setStatus('Clean Female & Comedy Demo loaded!');
};

// =========================================================================
// WEB AUDIO ENGINE + AMBIENT LOFI + FOLEY SFX
// =========================================================================
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null, destNode = null, analyser = null, timeDomainArray = null, bgmGain = null, bgmInterval = null;
let isPlayingSequence = false;
let isSpeakingNow = false;
let smoothedMouth = 0;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new AudioCtx();
    destNode = audioCtx.createMediaStreamDestination();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.55;
    timeDomainArray = new Uint8Array(analyser.fftSize);

    bgmGain = audioCtx.createGain();
    bgmGain.gain.value = 0.07;
    bgmGain.connect(audioCtx.destination);
    bgmGain.connect(destNode);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function createSilentBuffer(seconds = 2.4) {
  initAudio();
  const sr = audioCtx.sampleRate || 44100;
  return audioCtx.createBuffer(1, Math.floor(sr * seconds), sr);
}

function startComedyBGM() {
  stopComedyBGM();
  const notes = [261.63, 329.63, 392.00, 493.88, 220.00, 261.63, 329.63, 392.00];
  let step = 0;
  bgmInterval = setInterval(() => {
    if (!audioCtx || audioCtx.state !== 'running') return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator(), noteGain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(notes[step % notes.length], now);
    step++;
    noteGain.gain.setValueAtTime(0.001, now);
    noteGain.gain.linearRampToValueAtTime(0.16, now + 0.04);
    noteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    osc.connect(noteGain); noteGain.connect(bgmGain);
    osc.start(now); osc.stop(now + 0.38);
  }, 380);
}
function stopComedyBGM() { if (bgmInterval) { clearInterval(bgmInterval); bgmInterval = null; } }
function duckBGM(speaking) {
  isSpeakingNow = speaking;
  if (!speaking) smoothedMouth = 0;
  if (bgmGain && audioCtx) bgmGain.gain.setTargetAtTime(speaking ? 0.025 : 0.08, audioCtx.currentTime, 0.05);
}

function playSFX(type) {
  if (!type || type === 'none') return;
  initAudio();
  const now = audioCtx.currentTime;
  if (type === 'boom' || type === 'vine') {
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(125, now);
    osc.frequency.exponentialRampToValueAtTime(24, now + 0.7);
    gain.gain.setValueAtTime(0.95, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    osc.connect(gain); gain.connect(audioCtx.destination); gain.connect(destNode);
    osc.start(now); osc.stop(now + 0.72);
  } else if (type === 'bonk') {
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.16);
    gain.gain.setValueAtTime(0.85, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    osc.connect(gain); gain.connect(audioCtx.destination); gain.connect(destNode);
    osc.start(now); osc.stop(now + 0.18);
  } else if (type === 'sting') {
    [220, 261.63, 329.63].forEach(freq => {
      const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc.connect(gain); gain.connect(audioCtx.destination); gain.connect(destNode);
      osc.start(now); osc.stop(now + 0.66);
    });
  } else if (type === 'gasp') {
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(280, now); osc.frequency.exponentialRampToValueAtTime(760, now + 0.18);
    gain.gain.setValueAtTime(0.4, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain); gain.connect(audioCtx.destination); gain.connect(destNode);
    osc.start(now); osc.stop(now + 0.2);
  }
}

// =========================================================================
// VIRTUAL FILM CREW PIPELINE
// =========================================================================
async function getBestGeminiModel(key) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return ['gemini-2.5-flash', 'gemini-2.0-flash'];
    const data = await res.json();
    const live = (data.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace('models/', ''))
      .filter(name => name.includes('flash') && !name.includes('tts') && !name.includes('image') && !name.includes('audio'));
    return live.length > 0 ? live : ['gemini-2.5-flash', 'gemini-2.0-flash'];
  } catch {
    return ['gemini-2.5-flash', 'gemini-2.0-flash'];
  }
}

async function callGeminiAgent(key, models, prompt, temp = 0.85) {
  let lastErr = 'Server busy';
  for (const model of models.slice(0, 6)) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 45000);
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: temp }
        })
      });
      clearTimeout(timer);
      const data = await res.json();
      if (!res.ok) { lastErr = data.error?.message || `HTTP ${res.status}`; await sleep(600); continue; }
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const sIdx = raw.indexOf('['), eIdx = raw.lastIndexOf(']');
      if (sIdx === -1 || eIdx === -1) { lastErr = 'Invalid JSON'; continue; }
      return JSON.parse(raw.slice(sIdx, eIdx + 1));
    } catch (err) {
      lastErr = err.name === 'AbortError' ? `${model} timed out` : err.message;
      await sleep(600);
    }
  }
  throw new Error(lastErr);
}

// AGENT 1: SCRIPTWRITER (Strict Ban on Fake Death / Ghost Endings!)
async function runScriptwriterAgent(key, models, topic, partNum, totalParts, prevEnding, targetLines) {
  setCrewState('writer', 'active');
  setStatus(`✍️ [1/3 Scriptwriter] Writing ${targetLines}-line ${toneSelect.value} script (Part ${partNum}/${totalParts})...`);
  const cont = partNum > 1
    ? `Continue seamlessly from: "${prevEnding}".`
    : (totalParts > 1 ? `Part 1 of ${totalParts}. End on a strong cliffhanger!` : `Complete short story with a grounded, realistic, and entertaining ending.`);

  const genre = toneSelect.value;
  let styleDirection = 'Relatable, witty Indian Hinglish conversation like NOT YOUR TYPE. End with a funny everyday punchline.';
  if (genre.includes('Emotional')) {
    styleDirection = 'DEEP EMOTIONAL & RELATABLE storytelling! Heartfelt Hinglish conversation about life, career, relationships, and reality checks.';
  } else if (genre.includes('Savage')) {
    styleDirection = 'ULTRA SAVAGE & BRUTAL ROAST style! Cold-blooded comebacks and ruthless Desi humor.';
  } else if (genre.includes('Dark')) {
    styleDirection = 'DARK COMEDY & IRONIC TWIST style! Clever betrayal, catching someone lying, or funny karma — WITHOUT killing characters!';
  } else if (genre.includes('Double Meaning')) {
    styleDirection = 'CLEVER DOUBLE MEANING (NAUGHTY DESI) comedy! Spicy misunderstandings, teasing banter, and witty innuendos that turn out to be totally innocent in the end!';
  }

  const prompt = `You are a viral Indian YouTube animated storyteller ("NOT YOUR TYPE" style).
Write an EXACTLY ${targetLines}-line Hinglish two-person dialogue script about: "${topic}".
STYLE: ${styleDirection}
${cont}
CRITICAL RULES:
1. NO FAKE DEATH / NO GHOST CLICHÉ: NEVER end the story with "someone died in an accident / is a ghost / funeral / dead body"! Keep the story grounded in real life unless the user explicitly asked for a ghost/afterlife topic.
2. DIRECT SPOKEN DIALOGUE ONLY: Every line must be spoken directly by "char" (so their voice and lip-sync match!). Do NOT write third-person narration like "Usne kaha ki...". Instead let "gf" or "bro" speak their own line directly!
3. EXACT LENGTH: Return an array of EXACTLY ${targetLines} dialogue objects so the video lasts ${targetLines >= 15 ? '60 seconds (1 full minute)' : '45 seconds'}.
4. 100% ROMAN ENGLISH LETTERS ONLY (e.g., "chupchap", "sapne"). NEVER use Hindi Devanagari!
5. LOGICAL CASTING: "char" and "other" MUST NEVER be the same character!
   - Role IDs: "hero", "bro", "bhabhi", "gf", "sister", "mom", "villain", "npc".
6. EMOTIONS: "normal", "shocked", "smug", "angry", "crying", "sweat" (NEVER "dead").
7. LOCATION: "room" or "park".
8. PUNCH TEXT ("punch"): Short 1-to-3 word visual label for key moments (or "" for normal lines).
Return ONLY JSON array: [{"char":"hero","other":"gf","emotion":"normal","otherEmotion":"normal","location":"room","punch":"","text":"10-14 words punchy spoken Roman Hinglish"}]`;

  const draft = await callGeminiAgent(key, models, prompt, 0.85);
  setCrewState('writer', 'done');
  return draft;
}

// AGENT 2: CINEMATIC DIRECTOR
async function runDirectorDOPAgent(key, models, draftScript) {
  setCrewState('director', 'active');
  setStatus(`🎥 [2/3 Director] Framing clean character shots...`);

  const prompt = `You are the Film Director. Choose clean, natural camera shots for each dialogue line.
- shot:
  * "normal": Clean medium two-shot (Hero left, Co-star right) — use for 65% of lines.
  * "in": Smooth speaker close-up zoom for jokes, reactions, or punchlines — use for 35% of lines.
  (ONLY use "normal" or "in"!)
- gesture: "explain", "point", "facepalm", "crossed", "shocked_hands", "shrug".
- prop: "none" (default), "phone", "chai" (ONLY if literally mentioned in that line).
- sfx: "none", "bonk", "boom", "sting", "gasp".

Script to direct:
${JSON.stringify(draftScript)}

Return the SAME array with "shot", "gesture", "prop", "sfx" added. JSON ONLY.`;

  const directed = await callGeminiAgent(key, models, prompt, 0.4);
  setCrewState('director', 'done');
  return directed;
}

// AGENT 3: LIGHTMAN & STRICT CONTINUITY GUARD
function runLightmanAgent(directedScenes) {
  setCrewState('light', 'active');
  setStatus(`💡 [3/3 Lightman] Verifying scene logic, anti-clone & lighting...`);

  const litScenes = directedScenes.map((sc) => {
    const txt = (sc.text || '').toLowerCase();
    const s = { ...sc };
    if (s.emotion === 'dead') s.emotion = 'shocked';

    if (s.shot !== 'normal' && s.shot !== 'in') {
      s.shot = 'in';
    }

    if (!s.other || s.other === s.char) {
      s.other = s.char === 'hero' ? 'bro' : 'hero';
    }

    if (!s.gesture) {
      if (s.emotion === 'angry') s.gesture = 'point';
      else if (s.emotion === 'smug') s.gesture = 'crossed';
      else if (s.emotion === 'sweat' || s.emotion === 'crying') s.gesture = 'facepalm';
      else if (s.emotion === 'shocked') s.gesture = 'shocked_hands';
      else s.gesture = 'explain';
    }

    if (s.prop === 'phone' && !/phone|mobile|reel|video|game|call|password|message|chat/.test(txt)) s.prop = 'none';
    if (s.prop === 'chai' && !/chai|tea|coffee|cup/.test(txt)) s.prop = 'none';

    if (/raat|night|andhera|sad|akela|toot|mar|maut|bhoot|thand|fridge|kabr|aatma/.test(txt)) {
      s.lighting = 'night';
    } else if (s.emotion === 'angry') {
      s.lighting = 'dramatic';
    } else {
      s.lighting = 'pastel';
    }
    return s;
  });

  setCrewState('light', 'done');
  return litScenes;
}

async function runPreProductionCrew(key, topic, partNum, totalParts, prevEnding, targetLines = 12) {
  setCrewState('reset');
  const models = await getBestGeminiModel(key);
  const draft = await runScriptwriterAgent(key, models, topic, partNum, totalParts, prevEnding, targetLines);
  const directed = await runDirectorDOPAgent(key, models, draft);
  return runLightmanAgent(directed);
}

// =========================================================================
// UNHOLY TALES PASTEL RENDERER (Clean Feminine Hair & Face Rig!)
// =========================================================================
let currentScene = DEMO_SCRIPT[0];
let sceneStartTime = performance.now();
let mouthOpen = 0, frameTick = 0, blinkTimer = 0;

function easeOutCubic(t) {
  const c = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - c, 3);
}

function isFemaleChar(char) {
  return ['mom', 'bhabhi', 'gf', 'sister'].includes(char);
}

function getCharacterPalette(char) {
  const map = {
    hero:    { shirt: '#e2e8f0', collar: '#cbd5e1', hair: '#1e293b', skin: '#fde6d8', skinShadow: '#f5ccb8', pants: '#334155' },
    bro:     { shirt: '#fed7aa', collar: '#fdba74', hair: '#1e293b', skin: '#f9dcc4', skinShadow: '#ecc0a0', pants: '#1e3a8a' },
    villain: { shirt: '#334155', collar: '#1e293b', hair: '#0f172a', skin: '#f1d5c5', skinShadow: '#dfb9a4', pants: '#0f172a' },
    mom:     { shirt: '#fbcfe8', collar: '#f472b6', hair: '#291d18', skin: '#fde6d8', skinShadow: '#f5ccb8', pants: '#831843' },
    bhabhi:  { shirt: '#ddd6fe', collar: '#a78bfa', hair: '#1e1b18', skin: '#fde6d8', skinShadow: '#f5ccb8', pants: '#4c1d95' },
    gf:      { shirt: '#fecdd3', collar: '#fb7185', hair: '#3b2316', skin: '#fde6d8', skinShadow: '#f5ccb8', pants: '#881337' },
    sister:  { shirt: '#bae6fd', collar: '#38bdf8', hair: '#291d18', skin: '#fde6d8', skinShadow: '#f5ccb8', pants: '#0369a1' },
    npc:     { shirt: '#bbf7d0', collar: '#4ade80', hair: '#334155', skin: '#f9dcc4', skinShadow: '#ecc0a0', pants: '#14532d' }
  };
  return map[char] || map.hero;
}

function drawPastelEnvironment(loc, lighting = 'pastel') {
  const W = canvas.width, H = canvas.height;
  const floorY = Math.round(H * 0.78);
  const isNight = lighting === 'night' || lighting === 'dramatic';

  if (loc === 'room') {
    const wall = ctx.createLinearGradient(0, 0, 0, floorY);
    if (isNight) {
      wall.addColorStop(0, '#0f172a');
      wall.addColorStop(1, '#1e293b');
    } else {
      wall.addColorStop(0, '#fef9c3');
      wall.addColorStop(1, '#fde68a');
    }
    ctx.fillStyle = wall;
    ctx.fillRect(-W, -H, W * 3, floorY + H);

    const winW = 140, winH = 125;
    const winX = W * 0.5 - winW * 0.5;
    const winY = floorY - 395;
    ctx.fillStyle = isNight ? '#1e3a8a' : '#e0f2fe';
    ctx.strokeStyle = isNight ? '#475569' : '#334155';
    ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.roundRect(winX, winY, winW, winH, 8); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(winX + winW * 0.5, winY); ctx.lineTo(winX + winW * 0.5, winY + winH); ctx.stroke();

    if (isNight) {
      ctx.fillStyle = '#fef08a';
      ctx.beginPath(); ctx.arc(winX + 36, winY + 34, 14, 0, Math.PI * 2); ctx.fill();
    }

    ctx.fillStyle = isNight ? 'rgba(147, 197, 253, 0.08)' : 'rgba(255, 255, 255, 0.24)';
    ctx.beginPath();
    ctx.moveTo(winX, winY + winH);
    ctx.lineTo(winX + winW, winY + winH);
    ctx.lineTo(W * 0.72, floorY);
    ctx.lineTo(W * 0.28, floorY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = isNight ? '#334155' : '#e7c697';
    ctx.fillRect(-W, floorY, W * 3, H * 2);
  } else {
    const sky = ctx.createLinearGradient(0, 0, 0, floorY);
    if (isNight) {
      sky.addColorStop(0, '#090d16');
      sky.addColorStop(1, '#1e1b4b');
    } else {
      sky.addColorStop(0, '#bae6fd');
      sky.addColorStop(0.65, '#e0f2fe');
      sky.addColorStop(1, '#fef3c7');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(-W, -H, W * 3, floorY + H);

    if (isNight) {
      ctx.fillStyle = '#fef9c3';
      ctx.beginPath(); ctx.arc(W * 0.78, H * 0.14, 34, 0, Math.PI * 2); ctx.fill();
    } else {
      const drift = (frameTick * 0.25) % (W + 200);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      [W * 0.15 + drift, W * 0.65 + drift].forEach((cx, i) => {
        const x = (cx % (W + 180)) - 90;
        const y = H * (0.14 + i * 0.08);
        ctx.beginPath();
        ctx.arc(x, y, 32, 0, Math.PI * 2);
        ctx.arc(x + 28, y - 10, 38, 0, Math.PI * 2);
        ctx.arc(x + 62, y, 30, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    ctx.fillStyle = isNight ? '#064e3b' : '#bbf7d0';
    ctx.beginPath(); ctx.arc(W * 0.25, floorY + 25, W * 0.52, Math.PI, 0); ctx.fill();
    ctx.fillStyle = isNight ? '#065f46' : '#86efac';
    ctx.beginPath(); ctx.arc(W * 0.78, floorY + 25, W * 0.56, Math.PI, 0); ctx.fill();

    ctx.fillStyle = isNight ? '#022c22' : '#a7f3d0';
    ctx.fillRect(-W, floorY, W * 3, H * 2);
  }

  ctx.strokeStyle = isNight ? '#475569' : '#334155';
  ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(-W, floorY); ctx.lineTo(W * 2, floorY); ctx.stroke();
}

function drawFilledArm(sx, sy, ex, ey, hx, hy, pal, dir = 1, heldProp = 'none') {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 22;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();

  ctx.strokeStyle = pal.skin;
  ctx.lineWidth = 15;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();

  const sleeveX = sx + (ex - sx) * 0.55;
  const sleeveY = sy + (ey - sy) * 0.55;
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 28;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sleeveX, sleeveY); ctx.stroke();
  ctx.strokeStyle = pal.shirt;
  ctx.lineWidth = 21;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sleeveX, sleeveY); ctx.stroke();

  if (heldProp === 'phone') {
    ctx.save();
    ctx.translate(hx, hy - 14);
    ctx.rotate(dir * 0.16);
    ctx.fillStyle = '#1e293b'; ctx.strokeStyle = '#334155'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(-12, -24, 24, 44, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#bae6fd';
    ctx.fillRect(-9, -19, 18, 32);
    ctx.restore();
  } else if (heldProp === 'chai') {
    ctx.save();
    ctx.translate(hx, hy - 8);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#334155'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-10, -12); ctx.lineTo(10, -12); ctx.lineTo(8, 10); ctx.lineTo(-8, 10); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = pal.skin;
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.arc(hx, hy, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

function drawPastelCharacter(char, emotion, gesture, talkAmt, footX, groundY, scaleVal, isSpeaker, lookDir = 1, heldProp = 'none') {
  const pal = getCharacterPalette(char);
  const fem = isFemaleChar(char);
  const dir = lookDir >= 0 ? 1 : -1;
  const breath = Math.sin(frameTick * 0.08) * 2.5;
  const speakBounce = isSpeaker ? talkAmt * 4.5 : 0;

  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.16)';
  ctx.beginPath(); ctx.ellipse(footX, groundY + 3, 52 * scaleVal, 10 * scaleVal, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(footX, groundY - speakBounce);
  ctx.scale(scaleVal, scaleVal);

  // Female Long Hair Back-Drape BEHIND shoulders & neck (narrower than jawline so ZERO beard effect!)
  if (fem) {
    ctx.fillStyle = pal.hair;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 3.2;
    if (char === 'mom') {
      // Neat Mom Hair Bun behind head
      ctx.beginPath();
      ctx.arc(-dir * 38, -356 + breath * 0.4, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      // Flowing Shoulder-Length Hair behind neck/shoulders (only width ±50, never wider than chin!)
      ctx.beginPath();
      ctx.moveTo(-48, -310);
      ctx.quadraticCurveTo(-56, -230, -46, -185);
      ctx.lineTo(46, -185);
      ctx.quadraticCurveTo(56, -230, 48, -310);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  // Pants / Legs
  ctx.fillStyle = pal.pants;
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.roundRect(-25, -118, 21, 108, 8); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(4, -118, 21, 108, 8); ctx.fill(); ctx.stroke();

  // Shoes
  ctx.fillStyle = fem ? '#fbcfe8' : '#ffffff';
  ctx.beginPath(); ctx.roundRect(-29, -16, 27, 16, 7); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(2, -16, 27, 16, 7); ctx.fill(); ctx.stroke();

  // Torso
  ctx.save();
  ctx.translate(0, breath * 0.5);
  ctx.fillStyle = pal.shirt;
  if (fem) {
    // Slightly tapered feminine top / kurti
    ctx.beginPath();
    ctx.moveTo(-34, -230);
    ctx.lineTo(34, -230);
    ctx.lineTo(40, -112);
    ctx.lineTo(-40, -112);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.roundRect(-38, -232, 76, 122, 22);
    ctx.fill();
    ctx.stroke();
  }

  ctx.fillStyle = pal.collar;
  ctx.beginPath();
  ctx.arc(0, -230, 17, 0, Math.PI);
  ctx.fill();
  ctx.stroke();

  // Neck
  ctx.fillStyle = pal.skin;
  ctx.fillRect(-11, -254, 22, 26);
  ctx.strokeRect(-11, -254, 22, 26);
  ctx.fillStyle = pal.skinShadow;
  ctx.fillRect(-10, -254, 20, 9);

  // Arms
  const actWave = isSpeaker ? Math.sin(frameTick * 0.16) * (6 + talkAmt * 14) : Math.sin(frameTick * 0.07) * 3;
  const effGesture = isSpeaker ? gesture : (emotion === 'shocked' ? 'shocked_hands' : (emotion === 'smug' || emotion === 'angry' ? 'crossed' : 'idle'));
  const shoulderX = fem ? 33 : 38;

  if (heldProp === 'phone' || heldProp === 'chai') {
    drawFilledArm(-dir * shoulderX, -214, -dir * 52, -172, -dir * 40, -135, pal, dir, 'none');
    drawFilledArm(dir * shoulderX, -214, dir * 64, -185, dir * 78, -220 + actWave * 0.3, pal, dir, heldProp);
  } else if (effGesture === 'point') {
    drawFilledArm(-dir * shoulderX, -214, -dir * 54, -172, -dir * 38, -135, pal, dir);
    drawFilledArm(dir * shoulderX, -214, dir * 74, -206 + actWave * 0.3, dir * 112, -214 + actWave * 0.4, pal, dir);
  } else if (effGesture === 'facepalm') {
    drawFilledArm(-dir * shoulderX, -214, -dir * 50, -172, -dir * 38, -132, pal, dir);
    drawFilledArm(dir * shoulderX, -214, dir * 72, -262, dir * 24, -312, pal, dir);
  } else if (effGesture === 'crossed') {
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 17; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-34, -210); ctx.quadraticCurveTo(-48, -178, 28, -178); ctx.stroke();
    ctx.strokeStyle = pal.skin; ctx.lineWidth = 11;
    ctx.beginPath(); ctx.moveTo(-34, -210); ctx.quadraticCurveTo(-48, -178, 28, -178); ctx.stroke();
  } else if (effGesture === 'shocked_hands') {
    drawFilledArm(-shoulderX, -214, -72, -238, -60, -288, pal, dir);
    drawFilledArm(shoulderX, -214, 72, -238, 60, -288, pal, dir);
  } else if (effGesture === 'explain') {
    drawFilledArm(-shoulderX, -214, -64, -182 - actWave * 0.4, -82, -204 - actWave * 0.8, pal, dir);
    drawFilledArm(shoulderX, -214, 64, -182 + actWave * 0.4, 84, -202 + actWave * 0.8, pal, dir);
  } else {
    drawFilledArm(-shoulderX, -214, -50, -170, -42, -126, pal, dir);
    drawFilledArm(shoulderX, -214, 50, -170, 42, -126, pal, dir);
  }
  ctx.restore();

  // Head
  const headY = -318;
  const headNod = isSpeaker ? (talkAmt * 4.5 + breath * 0.4) : (Math.sin(frameTick * 0.1) * 2);
  const headTilt = isSpeaker ? Math.sin(frameTick * 0.12) * 0.035 * (0.3 + talkAmt) : 0.02;

  ctx.save();
  ctx.translate(0, headY + headNod);
  ctx.rotate(headTilt);

  // Clean Skin Face (100% unobstructed jawline — NO beard box!)
  ctx.fillStyle = pal.skin;
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 3.6;
  ctx.beginPath();
  ctx.ellipse(0, 0, fem ? 64 : 68, 70, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Soft Blush Cheeks
  ctx.fillStyle = fem ? 'rgba(244, 114, 182, 0.32)' : 'rgba(244, 114, 182, 0.20)';
  ctx.beginPath(); ctx.ellipse(-32, 14, 12, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(32, 14, 12, 7, 0, 0, Math.PI * 2); ctx.fill();

  // Hair Top & Side-Locks (Above ears/temples ONLY — never below cheeks!)
  ctx.fillStyle = pal.hair;
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 3.4;
  if (char === 'bro') {
    ctx.fillStyle = '#f87171';
    ctx.beginPath(); ctx.arc(0, -24, 66, Math.PI, 0); ctx.fill(); ctx.stroke();
    ctx.fillRect(dir > 0 ? -90 : 44, -30, 46, 11); ctx.strokeRect(dir > 0 ? -90 : 44, -30, 46, 11);
  } else if (fem) {
    // Sleek Feminine Side-Parted Hair with Temple Side-Strands
    ctx.beginPath();
    ctx.moveTo(-64, -10);
    ctx.quadraticCurveTo(-56, -84, 0, -82);
    ctx.quadraticCurveTo(56, -84, 64, -10);
    // Side framing strands tapering cleanly at ear level (y = +12)
    ctx.quadraticCurveTo(60, 12, 52, 16);
    ctx.quadraticCurveTo(50, -28, 12, -44);
    ctx.quadraticCurveTo(-24, -34, -50, -26);
    ctx.quadraticCurveTo(-52, 12, -52, 16);
    ctx.quadraticCurveTo(-60, 12, -64, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cute Hair Clip / Bindi detail
    if (char === 'mom' || char === 'bhabhi') {
      ctx.fillStyle = '#e11d48';
      ctx.beginPath(); ctx.arc(0, -22, 3.8, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath(); ctx.roundRect(26, -46, 16, 6, 3); ctx.fill();
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(-66, -18);
    ctx.quadraticCurveTo(-55, -86, 0, -84);
    ctx.quadraticCurveTo(55, -86, 66, -18);
    ctx.quadraticCurveTo(20, -48, -22, -32);
    ctx.quadraticCurveTo(-48, -42, -66, -18);
    ctx.fill();
    ctx.stroke();
  }

  // Eyes + Feminine Eyelashes
  const eyeY = -4;
  const pupilX = dir * 4;
  const isBlinking = (blinkTimer + (isSpeaker ? 0 : 45)) % 150 > 144;

  if (fem) {
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-34, eyeY - 6); ctx.lineTo(-40, eyeY - 11); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(34, eyeY - 6); ctx.lineTo(40, eyeY - 11); ctx.stroke();
  }

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 3.2;
  ctx.beginPath(); ctx.ellipse(-20, eyeY, 15, emotion === 'shocked' ? 18 : 13, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(20, eyeY, 15, emotion === 'shocked' ? 18 : 13, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  if (isBlinking && emotion === 'normal') {
    ctx.beginPath(); ctx.moveTo(-34, eyeY); ctx.lineTo(-6, eyeY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(6, eyeY); ctx.lineTo(34, eyeY); ctx.stroke();
  } else {
    ctx.fillStyle = '#0f172a';
    const pr = emotion === 'shocked' ? 4.5 : 6.5;
    ctx.beginPath(); ctx.arc(-20 + pupilX, eyeY, pr, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(20 + pupilX, eyeY, pr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(-22 + pupilX, eyeY - 2.5, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(18 + pupilX, eyeY - 2.5, 2.2, 0, Math.PI * 2); ctx.fill();
  }

  // Eyebrows
  const browLift = isSpeaker ? -talkAmt * 3.5 : 0;
  ctx.strokeStyle = pal.hair;
  ctx.lineWidth = fem ? 3.6 : 4.5;
  ctx.lineCap = 'round';
  if (emotion === 'angry') {
    ctx.beginPath(); ctx.moveTo(-36, eyeY - 22 + browLift); ctx.lineTo(-8, eyeY - 14 + browLift); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(36, eyeY - 22 + browLift); ctx.lineTo(8, eyeY - 14 + browLift); ctx.stroke();
  } else if (emotion === 'crying' || emotion === 'sweat') {
    ctx.beginPath(); ctx.moveTo(-36, eyeY - 14); ctx.lineTo(-10, eyeY - 23); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(36, eyeY - 14); ctx.lineTo(10, eyeY - 23); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(-34, eyeY - 19 + browLift); ctx.lineTo(-8, eyeY - 21 + browLift); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(8, eyeY - 21 + browLift); ctx.lineTo(34, eyeY - 19 + browLift); ctx.stroke();
  }

  // Mouth (Soft rose-pink lips for female characters!)
  const mouthY = 30;
  ctx.strokeStyle = fem ? '#be123c' : '#334155';
  ctx.lineWidth = 3.2;
  if (isSpeaker && talkAmt > 0.08) {
    if (talkAmt > 0.52) {
      ctx.fillStyle = '#881337';
      ctx.beginPath(); ctx.arc(0, mouthY - 5, 15, 0, Math.PI, false); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-10, mouthY - 5, 20, 4);
      ctx.fillStyle = '#fb7185';
      ctx.beginPath(); ctx.arc(0, mouthY + 6, 7, Math.PI, 0); ctx.fill();
    } else {
      const h = 4 + talkAmt * 12;
      const w = 9 + (1 - talkAmt) * 6;
      ctx.fillStyle = '#881337';
      ctx.beginPath(); ctx.ellipse(0, mouthY, w, h, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  } else {
    ctx.beginPath();
    if (emotion === 'smug') ctx.arc(0, mouthY - 4, 14, 0.1 * Math.PI, 0.85 * Math.PI);
    else if (emotion === 'crying' || emotion === 'shocked') ctx.arc(0, mouthY + 8, 11, Math.PI * 1.15, Math.PI * 1.85);
    else { ctx.moveTo(-11, mouthY); ctx.lineTo(11, mouthY); }
    ctx.stroke();
  }

  ctx.restore();
  ctx.restore();
}

function drawCleanSubtitlesAndPunch(text, char, punchText, isDarkBg) {
  const W = canvas.width, H = canvas.height;

  if (punchText && punchText.trim()) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '800 34px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = isDarkBg ? 'rgba(255, 255, 255, 0.92)' : '#1e293b';
    ctx.shadowColor = isDarkBg ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.85)';
    ctx.shadowBlur = 10;
    ctx.fillText(punchText.trim(), W * 0.5, H * 0.14);
    ctx.restore();
  }

  if (!text || !text.trim()) return;
  const speakerColors = {
    hero: '#60a5fa',
    bro: '#fbbf24',
    villain: '#f87171',
    mom: '#f472b6',
    bhabhi: '#c084fc',
    gf: '#fb7185',
    sister: '#38bdf8',
    npc: '#34d399'
  };

  ctx.save();
  ctx.font = '800 30px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';

  const words = text.trim().split(' ');
  const lines = [];
  let line = '';
  const maxLineW = W - 120;
  for (let n = 0; n < words.length; n++) {
    const test = line + words[n] + ' ';
    if (ctx.measureText(test).width > maxLineW && n > 0) {
      lines.push(line.trim());
      line = words[n] + ' ';
    } else {
      line = test;
    }
  }
  lines.push(line.trim());

  const lineH = 38;
  const boxH = lines.length * lineH + 26;
  const boxW = Math.min(W - 60, Math.max(...lines.map(l => ctx.measureText(l).width)) + 56);
  const boxX = (W - boxW) * 0.5;
  const boxY = H - boxH - 42;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
  ctx.strokeStyle = speakerColors[char] || 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxW, boxH, 18);
  ctx.fill();
  ctx.stroke();

  for (let i = 0; i < lines.length; i++) {
    const ty = boxY + 38 + i * lineH;
    ctx.fillStyle = i === lines.length - 1 ? '#fef08a' : '#ffffff';
    ctx.fillText(lines[i], W * 0.5, ty);
  }
  ctx.restore();
}

function renderLoop() {
  frameTick++; blinkTimer++;
  const W = canvas.width, H = canvas.height, groundY = Math.round(H * 0.78);
  const elapsed = (performance.now() - sceneStartTime) / 1000;

  if (isSpeakingNow && analyser && timeDomainArray) {
    analyser.getByteTimeDomainData(timeDomainArray);
    let sqSum = 0;
    for (let i = 0; i < timeDomainArray.length; i++) {
      const v = (timeDomainArray[i] - 128) / 128;
      sqSum += v * v;
    }
    const rms = Math.sqrt(sqSum / timeDomainArray.length);
    const targetOpen = rms > 0.015 ? Math.min(1, (rms - 0.015) * 9.0) : 0;
    const smoothFactor = targetOpen > smoothedMouth ? 0.35 : 0.22;
    smoothedMouth += (targetOpen - smoothedMouth) * smoothFactor;
    mouthOpen = smoothedMouth;
  } else {
    smoothedMouth *= 0.75;
    mouthOpen = smoothedMouth < 0.02 ? 0 : smoothedMouth;
  }

  const shot = currentScene.shot === 'in' ? 'in' : 'normal';
  const speaker = currentScene.char || 'hero';
  const listener = (currentScene.other && currentScene.other !== speaker)
    ? currentScene.other
    : (speaker === 'hero' ? 'bro' : 'hero');
  const lighting = currentScene.lighting || 'pastel';
  const isDarkBg = lighting === 'night' || lighting === 'dramatic';

  ctx.save();
  const charScale = H < 800 ? 0.84 : 1.08;
  const heroIsSpeaker = speaker === 'hero';
  const leftX = W * 0.28, rightX = W * 0.72;

  if (shot === 'in') {
    const zoom = 1 + easeOutCubic(Math.min(1, elapsed / 0.55)) * 0.14;
    const focusX = heroIsSpeaker ? leftX : rightX;
    ctx.translate(W * 0.5, groundY);
    ctx.scale(zoom, zoom);
    ctx.translate(-focusX, -groundY);
  }

  drawPastelEnvironment(currentScene.location || 'room', lighting);

  const activeProp = currentScene.prop || 'none';
  const speakerGesture = currentScene.gesture || 'explain';

  if (heroIsSpeaker) {
    drawPastelCharacter(listener, currentScene.otherEmotion || 'normal', 'idle', 0, rightX, groundY, charScale * 0.94, false, -1, 'none');
    drawPastelCharacter(speaker, currentScene.emotion || 'normal', speakerGesture, mouthOpen, leftX, groundY, charScale, true, 1, activeProp);
  } else {
    drawPastelCharacter(listener, currentScene.otherEmotion || 'normal', 'idle', 0, leftX, groundY, charScale * 0.94, false, 1, 'none');
    drawPastelCharacter(speaker, currentScene.emotion || 'normal', speakerGesture, mouthOpen, rightX, groundY, charScale, true, -1, activeProp);
  }
  ctx.restore();

  drawCleanSubtitlesAndPunch(currentScene.text || '', speaker, currentScene.punch || '', isDarkBg);
  requestAnimationFrame(renderLoop);
}
renderLoop();

// =========================================================================
// AGENT 4: SOUND & VOICE ARTIST
// =========================================================================
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

function trimDeadSilence(buf, isLastScene = false) {
  if (!buf || !buf.sampleRate) return buf;
  const sr = buf.sampleRate;
  const data = buf.getChannelData(0);
  const threshold = 0.010;
  let start = 0, end = data.length - 1;
  while (start < end && Math.abs(data[start]) < threshold) start++;
  while (end > start && Math.abs(data[end]) < threshold) end--;
  start = Math.max(0, start - Math.floor(sr * 0.04));
  const tailPad = isLastScene ? 0.35 : 0.08;
  end = Math.min(data.length, end + Math.floor(sr * tailPad));
  const len = Math.max(200, end - start);
  const out = audioCtx.createBuffer(1, len, sr);
  const dst = out.getChannelData(0);
  for (let i = 0; i < len; i++) dst[i] = data[start + i] || 0;
  return out;
}

async function fetchSingleEdgeTTS(scene, isLast = false) {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: scene.text, char: scene.char })
  });
  if (!res.ok) throw new Error(`Edge TTS HTTP ${res.status}`);
  const arr = await res.arrayBuffer();
  const decoded = await audioCtx.decodeAudioData(arr);
  return trimDeadSilence(decoded, isLast);
}

async function fetchEdgeTTSPerScene(scenes, partLabel = '') {
  const buffers = [];
  for (let i = 0; i < scenes.length; i++) {
    setStatus(`🎙️ [Sound Artist] Recording Edge Hindi Voice ${partLabel} (${i + 1}/${scenes.length})...`);
    try {
      buffers.push(await fetchSingleEdgeTTS(scenes[i], i === scenes.length - 1));
    } catch {
      buffers.push(createSilentBuffer(Math.max(2.4, (scenes[i].text || '').split(' ').length * 0.36)));
    }
  }
  return buffers;
}

async function fetchGeminiBatchVoices(batch, key) {
  const isFemale = (c) => ['mom', 'bhabhi', 'gf', 'sister'].includes(c);
  const dialogueLines = batch.map((sc) => `${isFemale(sc.char) ? 'FemaleVoice' : 'MaleVoice'}: ${sc.text}`).join('\n');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 35000);
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: ctrl.signal,
    body: JSON.stringify({
      contents: [{ parts: [{ text: 'Speak EVERY single line completely from start to finish without cutting off:\n' + dialogueLines }] }],
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
  if (!res.ok) throw new Error(`Gemini TTS HTTP ${res.status}`);
  const data = await res.json();
  const inlineData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inlineData?.data) throw new Error('No audio returned');
  const batchBuf = await audioCtx.decodeAudioData(pcmToWavBuffer(inlineData.data, 24000));
  if (batchBuf.duration < batch.length * 1.1) throw new Error('Gemini TTS audio too short');
  return splitAudioBufferByScenes(batchBuf, batch);
}

async function runSoundArtistAgent(scenes, partLabel = '') {
  setCrewState('sound', 'active');
  const mode = voiceEngineSelect.value;
  const key = apiKeyInput.value.trim();

  if (mode === 'edge' || !key) {
    const list = await fetchEdgeTTSPerScene(scenes, partLabel);
    setCrewState('sound', 'done');
    return list;
  }

  const chunkSize = 6;
  const allSlices = [];
  for (let start = 0; start < scenes.length; start += chunkSize) {
    const batch = scenes.slice(start, start + chunkSize);
    setStatus(`🎙️ [Sound Artist] Recording Voices ${partLabel} (${start + 1}-${start + batch.length}/${scenes.length})...`);
    try {
      const geminiSlices = await fetchGeminiBatchVoices(batch, key);
      allSlices.push(...geminiSlices);
    } catch {
      for (let j = 0; j < batch.length; j++) {
        const globalIdx = start + j;
        setStatus(`🎙️ [Sound Artist] Edge Hindi Backup ${partLabel} (${globalIdx + 1}/${scenes.length})...`);
        try {
          allSlices.push(await fetchSingleEdgeTTS(batch[j], globalIdx === scenes.length - 1));
        } catch {
          allSlices.push(createSilentBuffer(Math.max(2.4, (batch[j].text || '').split(' ').length * 0.36)));
        }
      }
    }
    if (start + chunkSize < scenes.length) await sleep(500);
  }

  setCrewState('sound', 'done');
  return allSlices;
}

function splitAudioBufferByScenes(fullBuffer, scenes) {
  const sampleRate = fullBuffer.sampleRate, channelData = fullBuffer.getChannelData(0), totalSamples = channelData.length;
  const weights = scenes.map(s => Math.max(4, (s.text || '').length)), totalWeight = weights.reduce((a, b) => a + b, 0);
  const slices = []; let cursorSample = 0;

  for (let i = 0; i < scenes.length; i++) {
    if (i === scenes.length - 1) {
      slices.push(trimDeadSilence(extractSubBuffer(fullBuffer, cursorSample, totalSamples), true));
      break;
    }
    const idealEnd = Math.min(totalSamples - 1, cursorSample + Math.floor((weights[i] / totalWeight) * totalSamples));
    const searchRadius = Math.floor(sampleRate * 0.65);
    const minS = Math.max(cursorSample + Math.floor(sampleRate * 0.35), idealEnd - searchRadius);
    const maxS = Math.min(totalSamples - Math.floor(sampleRate * 0.35), idealEnd + searchRadius);
    let bestSample = idealEnd, lowestEnergy = Infinity, win = Math.floor(sampleRate * 0.04);
    for (let pos = minS; pos < maxS; pos += win) {
      let energy = 0; for (let j = 0; j < win && pos + j < totalSamples; j++) energy += Math.abs(channelData[pos + j]);
      if (energy < lowestEnergy) { lowestEnergy = energy; bestSample = pos + Math.floor(win / 2); }
    }
    slices.push(trimDeadSilence(extractSubBuffer(fullBuffer, cursorSample, bestSample), false));
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
  const safeBuf = (audioBuffer && audioBuffer.sampleRate) ? audioBuffer : createSilentBuffer(2.4);
  return new Promise((resolve) => {
    let resolved = false; duckBGM(true);
    const source = audioCtx.createBufferSource();
    source.buffer = safeBuf;
    if (char === 'bro') { source.detune.value = 110; source.playbackRate.value = 1.04; }
    else if (char === 'gf') { source.detune.value = 140; source.playbackRate.value = 1.05; }
    else if (char === 'sister') { source.detune.value = 200; source.playbackRate.value = 1.07; }
    else if (char === 'villain') { source.detune.value = -200; source.playbackRate.value = 0.96; }
    else { source.playbackRate.value = 1.02; }
    source.connect(analyser); analyser.connect(audioCtx.destination); analyser.connect(destNode);
    source.onended = () => { if (!resolved) { resolved = true; duckBGM(false); resolve(); } };
    source.start(0);
  });
}

// =========================================================================
// AGENT 5: EDITOR & ANDROID HARDWARE-SAFE VIDEO RECORDER
// =========================================================================
async function createBulletproofRecorder() {
  const canvasStream = canvas.captureStream(30);
  const videoTrack = canvasStream.getVideoTracks()[0];
  const audioTracks = destNode ? destNode.stream.getAudioTracks() : [];
  const combined = new MediaStream([videoTrack, ...audioTracks]);

  const candidates = [
    { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
    { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' },
    { mime: 'video/mp4;codecs=avc1,mp4a.40.2', ext: 'mp4' },
    { mime: 'video/mp4', ext: 'mp4' }
  ];

  let chosen = { mime: '', ext: 'webm' };
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c.mime)) {
      chosen = c;
      break;
    }
  }

  const options = chosen.mime
    ? { mimeType: chosen.mime, videoBitsPerSecond: 2_800_000 }
    : { videoBitsPerSecond: 2_800_000 };

  const rec = new MediaRecorder(combined, options);
  const chunks = [];
  const startTime = performance.now();

  rec.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const pump = setInterval(() => {
    if (videoTrack && typeof videoTrack.requestFrame === 'function') {
      videoTrack.requestFrame();
    }
  }, 33);

  rec.start(250);

  return {
    stop: () => new Promise((resolve) => {
      clearInterval(pump);
      rec.onstop = () => {
        const secs = Math.max(1, Math.round((performance.now() - startTime) / 1000));
        const finalType = chosen.ext === 'mp4' ? 'video/mp4' : 'video/webm';
        resolve({ blob: new Blob(chunks, { type: finalType }), ext: chosen.ext, secs });
      };
      rec.stop();
    })
  };
}

function triggerAutoDownload(blob, filename) {
  if (!blob || blob.size < 5000) {
    setStatus('⚠️ Video file too small — try Preview Cut first.');
    return;
  }
  const url = URL.createObjectURL(blob);
  downloadLink.href = url;
  downloadLink.download = filename;
  downloadLink.classList.remove('hidden');
  setTimeout(() => downloadLink.click(), 120);
}

async function renderSinglePart(scenes, partNum, totalParts, recordVideo = true, autoSave = false) {
  const litScenes = runLightmanAgent(scenes);
  const partLabel = totalParts > 1 ? `[Part ${partNum}/${totalParts}]` : '';
  const currentHash = JSON.stringify(litScenes.map(s => `${s.char}:${s.text}`));
  let audioList = [];
  const allMic = litScenes.every((_, idx) => !!customMicBuffers[idx]);

  if (allMic) {
    setCrewState('sound', 'done');
    audioList = litScenes.map((_, idx) => customMicBuffers[idx]);
  } else if (cachedScriptHash === currentHash && cachedAudioSlices.length === litScenes.length) {
    setCrewState('sound', 'done');
    audioList = litScenes.map((_, idx) => customMicBuffers[idx] || cachedAudioSlices[idx]);
  } else {
    cachedAudioSlices = await runSoundArtistAgent(litScenes, partLabel);
    cachedScriptHash = currentHash;
    audioList = litScenes.map((_, idx) => customMicBuffers[idx] || cachedAudioSlices[idx]);
  }

  setCrewState('editor', 'active');
  let recorderSession = recordVideo ? await createBulletproofRecorder() : null;
  startComedyBGM();
  for (let i = 0; i < litScenes.length; i++) {
    currentScene = litScenes[i];
    sceneStartTime = performance.now();
    playSFX(litScenes[i].sfx);
    setStatus(`✂️ [Editor] Shooting Take ${i + 1}/${litScenes.length} ${partLabel}...`);
    await playAudioOnce(audioList[i], litScenes[i].char);
  }
  stopComedyBGM();

  if (recorderSession) {
    setStatus(`📦 [Editor] Saving Final Video ${partLabel}...`);
    const { blob, ext, secs } = await recorderSession.stop();
    setCrewState('editor', 'done');
    const fname = `storytoon_${APP_VERSION}_part${partNum}of${totalParts}_${secs}s.${ext}`;
    if (autoSave) triggerAutoDownload(blob, fname);
    else {
      downloadLink.href = URL.createObjectURL(blob);
      downloadLink.download = fname;
      downloadLink.classList.remove('hidden');
    }
    return { secs, sizeKB: Math.round(blob.size / 1024), ext };
  }
  setCrewState('editor', 'done');
  return { secs: 0, sizeKB: 0, ext: 'webm' };
}

document.getElementById('oneClickAutoBtn').onclick = async () => {
  if (isPlayingSequence) return;
  const key = apiKeyInput.value.trim();
  const topic = topicInput.value.trim();
  if (!key) return setStatus('Enter your Google AI Studio API Key first!');
  if (!topic) return setStatus('Enter a Story Topic first!');

  const { totalParts, targetLines } = parseEpisodeConfig();
  isPlayingSequence = true;
  initAudio();
  downloadLink.classList.add('hidden');
  Object.keys(customMicBuffers).forEach(k => delete customMicBuffers[k]);

  let prevEnding = '';
  try {
    for (let part = 1; part <= totalParts; part++) {
      const scenes = await runPreProductionCrew(key, topic, part, totalParts, prevEnding, targetLines);
      scriptEditor.value = JSON.stringify(scenes, null, 2);
      cachedScriptHash = '';
      renderMicControls();
      prevEnding = scenes.slice(-2).map(s => s.text).join(' ');

      const { secs, sizeKB, ext } = await renderSinglePart(scenes, part, totalParts, true, true);
      setStatus(`✅ Part ${part}/${totalParts} Wrapped! (${secs}s • ${sizeKB} KB ${ext.toUpperCase()})`);
      if (part < totalParts) await sleep(1500);
    }
    setStatus(`🎉 IT'S A WRAP! All ${totalParts} Episode(s) produced & saved in Downloads!`);
  } catch (err) {
    setStatus(`Production Error: ${err.message}`);
  } finally {
    isPlayingSequence = false;
  }
};

document.getElementById('generateScriptBtn').onclick = async () => {
  if (isPlayingSequence) return;
  const key = apiKeyInput.value.trim();
  const topic = topicInput.value.trim();
  if (!key || !topic) return setStatus('Enter API Key & Topic first!');
  const { targetLines } = parseEpisodeConfig();
  try {
    const scenes = await runPreProductionCrew(key, topic, 1, 1, '', targetLines);
    scriptEditor.value = JSON.stringify(scenes, null, 2);
    cachedScriptHash = '';
    renderMicControls();
    setStatus(`✅ Pre-Production Done! (${scenes.length} shots ready).`);
  } catch (err) { setStatus(`Crew Error: ${err.message}`); }
};

document.getElementById('playRecordBtn').onclick = async () => {
  if (isPlayingSequence) return;
  let scenes;
  try { scenes = JSON.parse(scriptEditor.value); } catch { return setStatus('Invalid JSON script!'); }
  isPlayingSequence = true; initAudio();
  try {
    const { secs, sizeKB, ext } = await renderSinglePart(scenes, 1, 1, true, true);
    setStatus(`✅ Exported ${ext.toUpperCase()} (${secs}s • ${sizeKB} KB)!`);
  } catch (err) { setStatus(`Error: ${err.message}`); }
  finally { isPlayingSequence = false; }
};

document.getElementById('previewOnlyBtn').onclick = async () => {
  if (isPlayingSequence) return;
  let scenes;
  try { scenes = JSON.parse(scriptEditor.value); } catch { return setStatus('Invalid JSON script!'); }
  isPlayingSequence = true; initAudio();
  try { await renderSinglePart(scenes, 1, 1, false, false); setStatus('Preview Cut finished!'); }
  catch (err) { setStatus(`Error: ${err.message}`); }
  finally { isPlayingSequence = false; }
};

renderMicControls();
