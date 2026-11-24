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
  { char: "hero", other: "bro", emotion: "normal", otherEmotion: "normal", pose: "normal", action: "idle", location: "room", lighting: "warm", camera: "normal", gag: "none", prop: "none", power: "none", sfx: "none", text: "Bhai kal exam hai aur maine abhi tak kitaab kholi bhi nahi!" },
  { char: "bro", other: "hero", emotion: "smug", otherEmotion: "sweat", pose: "lean", action: "idle", location: "room", lighting: "warm", camera: "in", gag: "none", prop: "none", power: "none", sfx: "vine", text: "Chinta mat kar bhai, raat bhar mein poora syllabus khatam kar denge!" },
  { char: "hero", other: "bro", emotion: "cursed", otherEmotion: "shocked", pose: "normal", action: "idle", location: "room", lighting: "night", camera: "normal", gag: "none", prop: "phone", power: "none", sfx: "bonk", text: "Par pehle bas 5 minute phone pe ek short dekh leta hoon!" },
  { char: "mom", other: "hero", emotion: "angry", otherEmotion: "sweat", pose: "normal", action: "walk", location: "room", lighting: "dramatic", camera: "in", gag: "none", prop: "none", power: "aura", sfx: "boom", text: "Subah ke 4 baj gaye aur tum dono abhi tak phone chala rahe ho?!" },
  { char: "hero", other: "mom", emotion: "sweat", otherEmotion: "angry", pose: "bonk", action: "idle", location: "room", lighting: "spotlight", camera: "zoomout", gag: "lagg_gaye", prop: "none", power: "none", sfx: "sting", text: "Ab toh sach mein lagg gaye guru, exam hall mein kya likhenge!" }
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
  micPanel.innerHTML = '<div style="font-size:0.74rem;color:#94a3b8;font-weight:700;margin-top:4px;">🎙️ Dubbing Booth: Apni Voice Record Karo (Optional)</div>';
  let scenes = [];
  try { scenes = JSON.parse(scriptEditor.value); } catch { return; }

  scenes.forEach((sc, idx) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;background:#0b0e14;padding:6px 8px;border-radius:8px;border:1px solid #262c3d;gap:6px;';
    const label = document.createElement('span');
    label.style.cssText = 'font-size:0.71rem;color:#e2e8f0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    label.textContent = `${idx + 1}. [${(sc.char || 'hero').toUpperCase()} • ${sc.camera || 'normal'}/${sc.lighting || 'day'}] ${sc.text}`;

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
  setStatus('Film Crew Demo loaded!');
};

// Web Audio Engine + Foley SFX
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
    bgmGain.gain.value = 0.08;
    bgmGain.connect(audioCtx.destination);
    bgmGain.connect(destNode);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function createSilentBuffer(seconds = 2.2) {
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
    noteGain.gain.linearRampToValueAtTime(0.20, now + 0.02);
    noteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.20);
    osc.connect(noteGain); noteGain.connect(bgmGain);
    osc.start(now); osc.stop(now + 0.21);
  }, 250);
}
function stopComedyBGM() { if (bgmInterval) { clearInterval(bgmInterval); bgmInterval = null; } }
function duckBGM(speaking) { if (bgmGain && audioCtx) bgmGain.gain.setTargetAtTime(speaking ? 0.025 : 0.09, audioCtx.currentTime, 0.04); }

function playSFX(type) {
  if (!type || type === 'none') return;
  initAudio();
  const now = audioCtx.currentTime;
  if (type === 'boom' || type === 'vine') {
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(type === 'vine' ? 95 : 130, now);
    osc.frequency.exponentialRampToValueAtTime(22, now + 0.65);
    gain.gain.setValueAtTime(1.0, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    osc.connect(gain); gain.connect(audioCtx.destination); gain.connect(destNode);
    osc.start(now); osc.stop(now + 0.65);
  } else if (type === 'bonk') {
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.16);
    gain.gain.setValueAtTime(0.95, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    osc.connect(gain); gain.connect(audioCtx.destination); gain.connect(destNode);
    osc.start(now); osc.stop(now + 0.18);
  } else if (type === 'sting') {
    [220, 233.08, 311.13].forEach(freq => {
      const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc.connect(gain); gain.connect(audioCtx.destination); gain.connect(destNode);
      osc.start(now); osc.stop(now + 0.56);
    });
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
    gain.gain.setValueAtTime(0.45, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
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
      const timer = setTimeout(() => ctrl.abort(), 40000);
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

// AGENT 1: SCRIPTWRITER (With Savage, Dark & Double Meaning Style Guides!)
async function runScriptwriterAgent(key, models, topic, partNum, totalParts, prevEnding) {
  setCrewState('writer', 'active');
  setStatus(`✍️ [1/3 Scriptwriter] Writing ${toneSelect.value} script (Part ${partNum}/${totalParts})...`);
  const cont = partNum > 1
    ? `Continue seamlessly from: "${prevEnding}".`
    : (totalParts > 1 ? `Part 1 of ${totalParts}. End on a crazy cliffhanger!` : `Complete story with a mind-blowing ending.`);

  const genre = toneSelect.value;
  let styleDirection = 'Relatable, fast-paced Indian Hinglish comedy like NOT YOUR TYPE.';
  if (genre.includes('Savage')) {
    styleDirection = 'ULTRA SAVAGE & BRUTAL ROAST style! Characters drop ruthless, unfiltered Desi roasts, ego-destroying comebacks, and cold-blooded one-liners. Use "smug" and "dead" emotions heavily.';
  } else if (genre.includes('Dark')) {
    styleDirection = 'DARK COMEDY & SHOCKING PLOT TWIST style! Start innocent, build tension, and drop a twisted, morbid, or spine-chilling dark humor twist at the end. Use "cursed", "shocked", and "dead" emotions.';
  } else if (genre.includes('Double Meaning')) {
    styleDirection = 'CLEVER DOUBLE MEANING (NAUGHTY DESI) comedy! Write innocent-sounding Hinglish dialogues with hilarious, spicy double-meaning innuendos and naughty misunderstandings (like CarryMinati / adult Desi comedy skits), keeping words clever without explicit slurs. Use "smug", "cursed", and "shocked" emotions.';
  }

  const prompt = `You are a viral Indian YouTube comedy Scriptwriter ("NOT YOUR TYPE" style).
Write an 8-line Hinglish script about: "${topic}".
STYLE & VIBE: ${styleDirection}
${cont}
Characters (ONLY use these exact IDs):
- "hero": main boy
- "bro": best friend boy
- "mom": mother / aunty
- "bhabhi": wife / sister-in-law / girl / didi (ALWAYS use "bhabhi" for any female/wife/girl character, NEVER "npc")
- "villain": rival / boss / angry uncle
- "npc": random male bystander/shopkeeper
Emotions: "normal", "shocked", "smug", "angry", "crying", "cursed" (derpy meme face), "sweat", "dead".
Location: pick ONE primary setting ("room", "park", "street", "gaon", "jungle").
Return ONLY JSON array: [{"char":"hero","other":"bro","emotion":"normal","otherEmotion":"normal","location":"room","text":"8-13 words punchy Hinglish"}]`;

  const draft = await callGeminiAgent(key, models, prompt, 0.92);
  setCrewState('writer', 'done');
  return draft;
}

// AGENT 2: DIRECTOR & CAMERAMAN (DOP)
async function runDirectorDOPAgent(key, models, draftScript) {
  setCrewState('director', 'active');
  setStatus(`🎥 [2/3 Director & Cameraman] Planning camera angles, poses & props...`);

  const prompt = `You are the Film Director & Cameraman (DOP). Take this dialogue script and add camera shots, character poses, props, and SFX.
STRICT RULE: Keep 75% of shots clean ("camera":"normal" or "in", "gag":"none", "prop":"none").
ONLY use a special "gag" or "prop" or "top" camera if the dialogue line LITERALLY talks about it!
- camera: "normal" (eye-level), "in" (dramatic close-up on punchline), "zoomout" (lonely "lagg gaye" moment), "top" (bird's-eye view ONLY if outdoor street/park chase/traffic), "shake" (impact).
- pose: "normal", "lean" (punchline close lean), "fly" (knocked in air), "bonk" (hit/defeated).
- action: "idle", "walk", "run".
- gag: "none" (default), "train_crowd" (ONLY if dialogue mentions train/crowd), "gali_alto" (ONLY if car stuck in gali), "tyre_run" (ONLY if rolling tyre), "chai_kaand" (ONLY if chai/rasgulla), "lagg_gaye" (ONLY if trapped/caught/doomed).
- prop: "none" (default), "phone", "chai", "car", "train", "tyre" (ONLY if mentioned in that dialogue line).
- power: "none" (default, or "energy", "fire", "lightning", "aura" if superpower/anger).
- sfx: "none", "bonk", "vine", "sting", "boom", "slap", "gasp".

Script to direct:
${JSON.stringify(draftScript)}

Return the SAME array with these fields added to every object. JSON ONLY.`;

  const directed = await callGeminiAgent(key, models, prompt, 0.55);
  setCrewState('director', 'done');
  return directed;
}

// AGENT 3: LIGHTMAN / GAFFER
function runLightmanAgent(directedScenes) {
  setCrewState('light', 'active');
  setStatus(`💡 [3/3 Lightman] Setting scene lighting & atmosphere...`);

  let topCount = 0;
  const isDarkMode = toneSelect.value.includes('Dark');
  const litScenes = directedScenes.map((sc) => {
    const txt = (sc.text || '').toLowerCase();
    const s = { ...sc };

    if (s.gag === 'train_crowd' && !/train|station|metro|local|dabba|bheed/.test(txt)) s.gag = 'none';
    if (s.gag === 'gali_alto' && !/car|alto|gaadi|gali|traffic|jam/.test(txt)) s.gag = 'none';
    if (s.gag === 'tyre_run' && !/tyre|chakka|bachpan|cycle/.test(txt)) s.gag = 'none';
    if (s.gag === 'chai_kaand' && !/chai|rasgulla|mithai|dukaan|samosa/.test(txt)) s.gag = 'none';
    if (s.gag === 'lagg_gaye' && !/lagg|gaye|phas|pakda|mummy|papa|teacher|fail|kaand|khatam/.test(txt)) s.gag = 'none';

    if (s.prop === 'car' && !/car|alto|gaadi|drive/.test(txt)) s.prop = 'none';
    if (s.prop === 'train' && !/train|station|metro/.test(txt)) s.prop = 'none';
    if (s.prop === 'chai' && !/chai|tea|rasgulla|dukaan/.test(txt)) s.prop = 'none';
    if (s.prop === 'tyre' && !/tyre|chakka|wheel/.test(txt)) s.prop = 'none';
    if (s.prop === 'phone' && !/phone|mobile|reel|video|game|call/.test(txt)) s.prop = 'none';

    const isOutdoor = ['street', 'shehar', 'park', 'gaon', 'jungle'].includes(s.location);
    if (s.camera === 'top') {
      if (!isOutdoor || !/bhaag|daud|gali|road|sadak|upar|traffic|chase/.test(txt) || topCount >= 2) {
        s.camera = 'normal';
      } else {
        topCount++;
      }
    }

    if (s.gag === 'lagg_gaye' || s.camera === 'zoomout') {
      s.lighting = 'spotlight';
    } else if (isDarkMode || /raat|night|4 baj|2 baj|andhera|soja|bhoot|khoon/.test(txt) || s.location === 'jungle') {
      s.lighting = 'night';
    } else if (s.emotion === 'angry' || s.char === 'villain' || s.power !== 'none') {
      s.lighting = 'dramatic';
    } else if (s.location === 'room') {
      s.lighting = 'warm';
    } else {
      s.lighting = 'daylight';
    }
    return s;
  });

  setCrewState('light', 'done');
  return litScenes;
}

async function runPreProductionCrew(key, topic, partNum, totalParts, prevEnding) {
  setCrewState('reset');
  const models = await getBestGeminiModel(key);
  const draft = await runScriptwriterAgent(key, models, topic, partNum, totalParts, prevEnding);
  const directed = await runDirectorDOPAgent(key, models, draft);
  const finalShotList = runLightmanAgent(directed);
  return finalShotList;
}

// =========================================================================
// STAGE RENDERER
// =========================================================================
let currentScene = DEMO_SCRIPT[0];
let mouthOpen = 0, frameTick = 0, smearTimer = 0, blinkTimer = 0;

const paperPatternCanvas = document.createElement('canvas');
paperPatternCanvas.width = 160; paperPatternCanvas.height = 160;
const pCtx = paperPatternCanvas.getContext('2d');
for (let i = 0; i < 300; i++) {
  pCtx.fillStyle = i % 2 === 0 ? 'rgba(15,23,42,0.025)' : 'rgba(255,255,255,0.04)';
  pCtx.fillRect(Math.random() * 160, Math.random() * 160, 2, 2);
}
const paperPattern = ctx.createPattern(paperPatternCanvas, 'repeat');

function applySketchTexture() {
  if (!paperPattern) return;
  ctx.save();
  ctx.fillStyle = paperPattern;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function applyLightmanMood(lighting) {
  const W = canvas.width, H = canvas.height;
  ctx.save();
  if (lighting === 'night') {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.34)';
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W * 0.45, H * 0.55, 30, W * 0.45, H * 0.55, W * 0.65);
    g.addColorStop(0, 'rgba(56, 189, 248, 0.14)');
    g.addColorStop(1, 'rgba(2, 6, 23, 0.45)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else if (lighting === 'dramatic') {
    const g = ctx.createRadialGradient(W * 0.5, H * 0.45, W * 0.15, W * 0.5, H * 0.45, W * 0.75);
    g.addColorStop(0, 'rgba(239, 68, 68, 0.08)');
    g.addColorStop(1, 'rgba(15, 23, 42, 0.48)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else if (lighting === 'warm') {
    ctx.fillStyle = 'rgba(251, 191, 36, 0.08)';
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

function drawSmearLines() {
  if (smearTimer <= 0) return;
  const W = canvas.width, H = canvas.height;
  ctx.save();
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.3)';
  ctx.lineWidth = 5;
  for (let i = 0; i < 10; i++) {
    const y = (H / 10) * i + 25;
    const x1 = (i % 2 === 0 ? 40 : 120) + Math.random() * 80;
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x1 + W * 0.4, y); ctx.stroke();
  }
  ctx.restore();
}

function drawFullScreenVisualGag(gag, talkAmt) {
  const W = canvas.width, H = canvas.height;
  const shake = Math.sin(frameTick * 0.8) * 6;

  if (gag === 'train_crowd') {
    ctx.fillStyle = '#fef08a'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1d4ed8'; ctx.fillRect(0, 0, W, H * 0.16);
    ctx.fillStyle = '#1e293b'; ctx.fillRect(0, H * 0.84, W, H * 0.16);
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 6;
    for (let sx = W * 0.2; sx <= W * 0.8; sx += W * 0.2) {
      ctx.beginPath(); ctx.moveTo(sx, H * 0.16); ctx.lineTo(sx + shake, H * 0.28); ctx.stroke();
      ctx.beginPath(); ctx.arc(sx + shake, H * 0.30, 14, 0, Math.PI * 2); ctx.stroke();
    }
    const crowdColors = ['#94a3b8', '#fde68a', '#ffffff', '#fecaca', '#e2e8f0', '#fed7aa', '#ffffff'];
    for (let i = 0; i < 7; i++) {
      const cx = (W * 0.14) + i * (W * 0.12) + Math.sin(frameTick * 0.4 + i) * 7;
      const cy = H * 0.56 + (i % 2 === 0 ? -25 : 25);
      ctx.fillStyle = i === 3 ? '#3b82f6' : i % 2 === 0 ? '#64748b' : '#f59e0b';
      ctx.beginPath(); ctx.roundRect(cx - 48, cy + 45, 96, 170, 20); ctx.fill(); ctx.stroke();
      ctx.fillStyle = crowdColors[i];
      ctx.beginPath(); ctx.ellipse(cx, cy, 46, 62, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(cx - 12, cy - 8, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + 12, cy - 8, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath(); ctx.arc(cx - 10, cy - 8, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 14, cy - 8, 4, 0, Math.PI * 2); ctx.fill();
    }
    return true;
  }

  if (gag === 'gali_alto') {
    ctx.fillStyle = '#475569'; ctx.fillRect(0, 0, W, H);
    const wallW = W * 0.27;
    ctx.fillStyle = '#b91c1c'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 7;
    ctx.fillRect(0, 0, wallW, H); ctx.strokeRect(-5, -5, wallW + 5, H + 10);
    ctx.fillRect(W - wallW, 0, wallW, H); ctx.strokeRect(W - wallW, -5, wallW + 5, H + 10);
    const carW = W - wallW * 2 + 12;
    const carX = W * 0.5 + Math.sin(frameTick * 0.9) * 4;
    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.roundRect(carX - carW * 0.5, H * 0.48 - 135, carW, 270, 26); ctx.fill(); ctx.stroke();
    return true;
  }

  if (gag === 'tyre_run') {
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.76);
    sky.addColorStop(0, '#38bdf8'); sky.addColorStop(1, '#fef08a');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    const floorY = H * 0.76;
    ctx.fillStyle = '#d97706'; ctx.fillRect(0, floorY, W, H - floorY);
    const tyreX = W * 0.68, tyreY = floorY - 58;
    ctx.save(); ctx.translate(tyreX, tyreY); ctx.rotate(frameTick * 0.35);
    ctx.fillStyle = '#1e293b'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(0, 0, 58, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
    drawFullBodyCharacter('hero', 'cursed', 'run', 'none', talkAmt, W * 0.36, floorY, H < 800 ? 0.72 : 0.90, true, 1);
    ctx.strokeStyle = '#78350f'; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(W * 0.42, floorY - 165); ctx.lineTo(tyreX - 42, tyreY - 12); ctx.stroke();
    return true;
  }

  if (gag === 'lagg_gaye') {
    ctx.fillStyle = '#090d16'; ctx.fillRect(0, 0, W, H);
    const floorY = H * 0.80;
    const grad = ctx.createLinearGradient(W * 0.5, 0, W * 0.5, floorY);
    grad.addColorStop(0, 'rgba(250, 204, 21, 0.55)');
    grad.addColorStop(1, 'rgba(250, 204, 21, 0.08)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.moveTo(W * 0.44, 0); ctx.lineTo(W * 0.56, 0); ctx.lineTo(W * 0.76, floorY); ctx.lineTo(W * 0.24, floorY); ctx.closePath(); ctx.fill();
    drawFullBodyCharacter(currentScene.char || 'hero', 'sweat', 'idle', 'none', talkAmt, W * 0.5, floorY, H < 800 ? 0.44 : 0.56, true, 0);
    return true;
  }

  if (gag === 'chai_kaand') {
    ctx.fillStyle = '#bae6fd'; ctx.fillRect(0, 0, W, H);
    const floorY = H * 0.78;
    ctx.fillStyle = '#64748b'; ctx.fillRect(0, floorY, W, H - floorY);
    drawSceneProp('chai', W * 0.55, floorY, H < 800 ? 1.15 : 1.35, false);
    drawFullBodyCharacter(currentScene.char || 'hero', currentScene.emotion || 'smug', 'idle', 'none', talkAmt, W * 0.28, floorY, H < 800 ? 0.72 : 0.90, true, 1);
    return true;
  }

  return false;
}

function drawCloud(x, y, s = 1) {
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.arc(x, y, 28 * s, 0, Math.PI * 2);
  ctx.arc(x + 26 * s, y - 10 * s, 34 * s, 0, Math.PI * 2);
  ctx.arc(x + 56 * s, y, 26 * s, 0, Math.PI * 2);
  ctx.fill();
}

function drawSceneProp(prop, x, y, scale = 1, isTopDown = false) {
  if (!prop || prop === 'none') return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 6;

  if (prop === 'car') {
    if (isTopDown) {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath(); ctx.roundRect(-55, -92, 110, 184, 22); ctx.fill(); ctx.stroke();
    } else {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath(); ctx.roundRect(-110, -75, 220, 55, 14); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(-70, -120, 130, 50, 16); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1e293b';
      ctx.beginPath(); ctx.arc(-65, -18, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(65, -18, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  } else if (prop === 'train') {
    ctx.fillStyle = '#eab308';
    ctx.fillRect(-150, -170, 300, 150); ctx.strokeRect(-150, -170, 300, 150);
  } else if (prop === 'chai') {
    ctx.fillStyle = '#b45309';
    ctx.fillRect(-75, -95, 150, 95); ctx.strokeRect(-75, -95, 150, 95);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(-85, -128, 170, 32); ctx.strokeRect(-85, -128, 170, 32);
  } else if (prop === 'tyre') {
    ctx.fillStyle = '#1e293b';
    ctx.beginPath(); ctx.arc(0, -34, 34, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else if (prop === 'phone') {
    ctx.fillStyle = '#1e293b';
    ctx.beginPath(); ctx.roundRect(-28, -95, 56, 95, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(-22, -85, 44, 72);
  }
  ctx.restore();
}

function drawTopDownScene(scene) {
  const W = canvas.width, H = canvas.height;
  const loc = scene.location || 'street';
  const isMoving = scene.action === 'walk' || scene.action === 'run';
  const scrollY = isMoving ? (frameTick * 5) % 160 : 0;

  if (loc === 'park' || loc === 'gaon') {
    ctx.fillStyle = '#22c55e'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fde68a'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 6;
    ctx.fillRect(W * 0.25, 0, W * 0.5, H); ctx.strokeRect(W * 0.25, -10, W * 0.5, H + 20);
  } else {
    ctx.fillStyle = '#475569'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#cbd5e1'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 7;
    ctx.fillRect(-10, -10, W * 0.22 + 10, H + 20); ctx.strokeRect(-10, -10, W * 0.22 + 10, H + 20);
    ctx.fillRect(W * 0.78, -10, W * 0.22 + 10, H + 20); ctx.strokeRect(W * 0.78, -10, W * 0.22 + 10, H + 20);
    ctx.fillStyle = '#facc15';
    for (let dy = -120 + scrollY; dy < H + 120; dy += 160) ctx.fillRect(W * 0.5 - 8, dy, 16, 75);
  }

  if (scene.prop && scene.prop !== 'none') drawSceneProp(scene.prop, W * 0.5, H * 0.34, 1.15, true);
  const speaker = scene.char || 'hero';
  const listener = scene.other || (speaker === 'hero' ? 'bro' : 'hero');
  drawTopDownCharacter(listener, W * 0.62, H * 0.64, false, false);
  drawTopDownCharacter(speaker, W * 0.38, H * 0.58, true, isMoving);
}

function drawTopDownCharacter(char, x, y, isSpeaker, isMoving) {
  const bob = isMoving ? Math.sin(frameTick * 0.35) * 10 : (isSpeaker ? mouthOpen * 6 : 0);
  const colors = { hero: '#3b82f6', bro: '#f59e0b', villain: '#1e293b', mom: '#ec4899', bhabhi: '#a855f7', npc: '#10b981' };
  ctx.save(); ctx.translate(x, y + bob);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(26, 22, 52, 34, 0.35, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = colors[char] || '#3b82f6'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.ellipse(0, 0, 56, 34, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = char === 'bro' ? '#ef4444' : '#0f172a';
  ctx.beginPath(); ctx.arc(0, -4, 34, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(0, -34, 14, Math.PI, 0); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function drawEnvironment(loc, isMoving) {
  const W = canvas.width, H = canvas.height;
  const floorY = Math.round(H * 0.77);
  const scrollX = isMoving ? (frameTick * 4.5) % W : 0;

  if (loc === 'red' || loc === 'dramatic') {
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
    const sky = ctx.createLinearGradient(0, 0, 0, floorY);
    sky.addColorStop(0, '#38bdf8'); sky.addColorStop(1, '#bae6fd');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, floorY);
    drawCloud(((W * 0.2 - scrollX * 0.3) + W) % W, H * 0.14, 1.1);
    drawCloud(((W * 0.72 - scrollX * 0.3) + W) % W, H * 0.20, 0.9);
    ctx.fillStyle = '#4ade80';
    ctx.beginPath(); ctx.arc(W * 0.28, floorY + 20, W * 0.5, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#22c55e';
    ctx.beginPath(); ctx.arc(W * 0.78, floorY + 20, W * 0.55, Math.PI, 0); ctx.fill();
    const treeX = ((W * 0.80 - scrollX) + W) % W;
    ctx.fillStyle = '#78350f'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 5;
    ctx.fillRect(treeX - 14, floorY - 150, 28, 150); ctx.strokeRect(treeX - 14, floorY - 150, 28, 150);
    ctx.fillStyle = '#16a34a';
    ctx.beginPath(); ctx.arc(treeX, floorY - 175, 64, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else if (loc === 'street' || loc === 'shehar') {
    const sky = ctx.createLinearGradient(0, 0, 0, floorY);
    sky.addColorStop(0, '#60a5fa'); sky.addColorStop(1, '#fed7aa');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, floorY);
    const buildings = [
      { x: 0.05, w: 145, h: 270, c: '#94a3b8' },
      { x: 0.35, w: 165, h: 330, c: '#cbd5e1' },
      { x: 0.70, w: 150, h: 290, c: '#94a3b8' }
    ];
    buildings.forEach((b) => {
      const bx = ((W * b.x - scrollX) + W) % W;
      ctx.fillStyle = b.c; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 5;
      ctx.fillRect(bx, floorY - b.h, b.w, b.h); ctx.strokeRect(bx, floorY - b.h, b.w, b.h);
      ctx.fillStyle = '#fef08a';
      for (let wy = floorY - b.h + 26; wy < floorY - 35; wy += 48) {
        ctx.fillRect(bx + 22, wy, 24, 26); ctx.strokeRect(bx + 22, wy, 24, 26);
        ctx.fillRect(bx + b.w - 46, wy, 24, 26); ctx.strokeRect(bx + b.w - 46, wy, 24, 26);
      }
    });
  } else if (loc === 'jungle' || loc === 'night') {
    ctx.fillStyle = '#1e1b4b'; ctx.fillRect(0, 0, W, floorY);
    ctx.fillStyle = '#fef9c3'; ctx.beginPath(); ctx.arc(W * 0.80, H * 0.16, 42, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = '#fef3c7'; ctx.fillRect(0, 0, W, floorY);
    ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 4;
    for (let x = 40; x < W; x += 65) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, floorY); ctx.stroke(); }
    ctx.fillStyle = '#b45309'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 5;
    ctx.fillRect(W * 0.12, floorY - 240, 115, 240); ctx.strokeRect(W * 0.12, floorY - 240, 115, 240);
    ctx.fillStyle = '#bae6fd';
    ctx.fillRect(W * 0.68, floorY - 250, 130, 115); ctx.strokeRect(W * 0.68, floorY - 250, 130, 115);
  }

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

function drawFullBodyCharacter(char, emotion, action, power, talkAmt, footX, groundY, scaleVal, isSpeaker, lookDir = 1, pose = 'normal') {
  const isWalking = action === 'walk' || action === 'run';
  const walkSpeed = action === 'run' ? 0.38 : 0.22;
  const rawSin = Math.sin(frameTick * walkSpeed);
  const snappyStep = Math.sign(rawSin) * (Math.abs(rawSin) > 0.4 ? 1 : 0);
  const legSwing = isWalking ? snappyStep * 26 : 0;

  let jumpY = 0;
  if (isSpeaker && pose === 'fly') jumpY = 75 + Math.sin(frameTick * 0.4) * 18;
  else if (emotion === 'shocked' && isSpeaker) jumpY = 26;
  else if (isWalking) jumpY = Math.abs(snappyStep) * 14;
  else if (isSpeaker && talkAmt > 0.2) jumpY = 8;

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(footX, groundY + 4, 65 * scaleVal, 13 * scaleVal, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(footX, groundY - jumpY);

  let sx = scaleVal, sy = scaleVal;
  if (isSpeaker && pose === 'lean') { sx *= 1.24; sy *= 1.24; ctx.rotate(0.12); }
  else if (isSpeaker && pose === 'bonk') { sx *= 1.28; sy *= 0.65; }
  else if (isSpeaker && pose === 'fly') { ctx.rotate(-0.25); }
  ctx.scale(sx, sy);

  if (power === 'aura' && isSpeaker) drawSuperpowerVFX('aura', 0, -30);
  if (emotion === 'dead') { ctx.translate(0, -102); ctx.rotate(Math.PI / 2); }

  ctx.strokeStyle = '#0f172a'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(-18, -125); ctx.quadraticCurveTo(-24 - legSwing * 0.5, -70, -24 - legSwing, -12); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(18, -125); ctx.quadraticCurveTo(24 + legSwing * 0.5, -70, 24 + legSwing, -12); ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.beginPath(); ctx.ellipse(-20 - legSwing, -8, 22, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(28 + legSwing, -8, 22, 10, 0, 0, Math.PI * 2); ctx.fill();

  if (char === 'villain') {
    const capeWave = Math.sin(frameTick * 0.16) * 14;
    ctx.fillStyle = '#7f1d1d';
    ctx.beginPath(); ctx.moveTo(-40, -255); ctx.lineTo(40, -255); ctx.lineTo(88 + capeWave, -40); ctx.lineTo(-80 + capeWave, -40); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1e293b';
  } else if (char === 'mom') ctx.fillStyle = '#ec4899';
  else if (char === 'bhabhi') ctx.fillStyle = '#a855f7';
  else ctx.fillStyle = char === 'hero' ? '#3b82f6' : char === 'bro' ? '#f59e0b' : '#10b981';

  ctx.beginPath();
  ctx.moveTo(-42, -125);
  ctx.quadraticCurveTo(-52, -200, -36, -262);
  ctx.quadraticCurveTo(0, -272, 36, -262);
  ctx.quadraticCurveTo(52, -200, 42, -125);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  if (power && power !== 'none' && power !== 'aura' && isSpeaker) {
    ctx.beginPath(); ctx.moveTo(-42, -235); ctx.quadraticCurveTo(-75, -205, -65, -165); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(42, -238); ctx.quadraticCurveTo(95, -245, 138, -238); ctx.stroke();
    drawSuperpowerVFX(power, 155, -238);
  } else if (emotion === 'shocked' || pose === 'fly') {
    ctx.beginPath(); ctx.moveTo(-42, -238); ctx.quadraticCurveTo(-105, -285, -92, -365); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(42, -238); ctx.quadraticCurveTo(105, -285, 92, -365); ctx.stroke();
  } else {
    const wave = isSpeaker && talkAmt > 0.25 ? 24 : 0;
    ctx.beginPath(); ctx.moveTo(-42, -235); ctx.quadraticCurveTo(-78, -195, -62, -155); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(42, -235); ctx.quadraticCurveTo(86, -210 - wave, 76, -165 - wave * 1.4); ctx.stroke();
  }

  const headY = -362;
  if (char === 'bhabhi') {
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(-108, headY - 30, 216, 175, 45);
    ctx.fill();
  }

  ctx.fillStyle = char === 'villain' ? '#e2e8f0' : '#ffffff';
  ctx.beginPath(); ctx.ellipse(0, headY, 102, 96, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  if (emotion === 'sweat') {
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath(); ctx.arc(-78, headY - 22, 8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(82, headY - 12, 7, 0, Math.PI * 2); ctx.fill();
  }

  ctx.fillStyle = '#0f172a';
  if (char === 'villain') {
    ctx.fillStyle = '#991b1b';
    ctx.beginPath(); ctx.moveTo(-82, headY - 52); ctx.lineTo(-102, headY - 125); ctx.lineTo(-42, headY - 82); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(82, headY - 52); ctx.lineTo(102, headY - 125); ctx.lineTo(42, headY - 82); ctx.fill(); ctx.stroke();
  } else if (char === 'hero') {
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
  } else if (char === 'bhabhi') {
    ctx.beginPath(); ctx.arc(0, headY - 32, 100, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.arc(0, headY - 34, 7, 0, Math.PI * 2); ctx.fill();
  }

  const eyeY = headY - 6;
  const pupilShift = lookDir * 6;
  const isBlinking = (blinkTimer + (isSpeaker ? 0 : 45)) % 150 > 143;

  if (emotion === 'dead') {
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(-48, eyeY - 16); ctx.lineTo(-20, eyeY + 12); ctx.moveTo(-20, eyeY - 16); ctx.lineTo(-48, eyeY + 12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(20, eyeY - 16); ctx.lineTo(48, eyeY + 12); ctx.moveTo(48, eyeY - 16); ctx.lineTo(20, eyeY + 12); ctx.stroke();
  } else if (emotion === 'cursed') {
    ctx.fillStyle = '#ffffff'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(-28, eyeY, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(28, eyeY - 6, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.arc(-34, eyeY, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(36, eyeY - 6, 4, 0, Math.PI * 2); ctx.fill();
  } else {
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

    ctx.lineWidth = 7;
    if (emotion === 'angry' || char === 'villain') {
      ctx.beginPath(); ctx.moveTo(-54, eyeY - 34); ctx.lineTo(-6, eyeY - 22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(54, eyeY - 34); ctx.lineTo(6, eyeY - 22); ctx.stroke();
    } else if (emotion === 'smug') {
      ctx.beginPath(); ctx.moveTo(-50, eyeY - 30); ctx.lineTo(-8, eyeY - 26); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(8, eyeY - 38); ctx.lineTo(52, eyeY - 28); ctx.stroke();
    }
  }

  const mouthY = headY + 46;
  ctx.lineWidth = 6;
  if (isSpeaker && talkAmt > 0.08) {
    if (talkAmt > 0.50) {
      ctx.fillStyle = '#7f1d1d';
      ctx.beginPath(); ctx.arc(0, mouthY - 8, 28, 0, Math.PI, false); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-20, mouthY - 8, 40, 7);
      ctx.fillStyle = '#fb7185'; ctx.beginPath(); ctx.arc(0, mouthY + 12, 12, Math.PI, 0); ctx.fill();
    } else {
      ctx.fillStyle = '#7f1d1d';
      ctx.beginPath(); ctx.ellipse(0, mouthY, 16, Math.max(8, talkAmt * 24), 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  } else {
    ctx.beginPath();
    if (emotion === 'cursed') { ctx.moveTo(-24, mouthY + 6); ctx.quadraticCurveTo(0, mouthY - 12, 26, mouthY + 8); }
    else if (emotion === 'smug' || char === 'villain') { ctx.arc(0, mouthY - 6, 24, 0.1 * Math.PI, 0.85 * Math.PI); }
    else if (emotion === 'shocked') { ctx.fillStyle = '#7f1d1d'; ctx.arc(0, mouthY + 4, 14, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.moveTo(-18, mouthY); ctx.lineTo(18, mouthY); }
    ctx.stroke();
  }
  ctx.restore();
}

function drawCaptions(text, char) {
  if (!text) return;
  const W = canvas.width, H = canvas.height;
  const names = { hero: 'HERO', bro: 'BRO', villain: 'VILLAIN', mom: 'MUMMY', bhabhi: 'BHABHI', npc: 'DOST' };
  const colors = { hero: '#3b82f6', bro: '#f59e0b', villain: '#991b1b', mom: '#ec4899', bhabhi: '#a855f7', npc: '#10b981' };

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
  frameTick++; blinkTimer++;
  if (smearTimer > 0) smearTimer--;

  const W = canvas.width, H = canvas.height, groundY = Math.round(H * 0.77);
  // Guarantee solid base fill so stream never has transparent/black alpha frames
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(0, 0, W, H);

  const charScale = H < 800 ? 0.74 : 0.96;
  const cam = currentScene.camera || 'normal';
  const gag = currentScene.gag || 'none';

  if (analyser && dataArray) {
    analyser.getByteFrequencyData(dataArray);
    let sum = 0; for (let i = 0; i < 32; i++) sum += dataArray[i];
    mouthOpen = Math.min(1, Math.max(0, ((sum / 32) - 10) / 65));
  } else mouthOpen = 0;

  ctx.save();
  if (cam === 'shake') ctx.translate((Math.random() - 0.5) * 24, (Math.random() - 0.5) * 24);

  const drewGag = gag !== 'none' && drawFullScreenVisualGag(gag, mouthOpen);

  if (!drewGag) {
    if (cam === 'top') {
      drawTopDownScene(currentScene);
    } else {
      if (cam === 'in') {
        ctx.translate(W * 0.5, groundY - 180); ctx.scale(1.22, 1.22); ctx.translate(-W * 0.5, -(groundY - 180));
      } else if (cam === 'zoomout') {
        ctx.translate(W * 0.5, groundY - 140); ctx.scale(0.76, 0.76); ctx.translate(-W * 0.5, -(groundY - 140));
      }

      const isMoving = currentScene.action === 'walk' || currentScene.action === 'run';
      drawEnvironment(currentScene.location || 'room', isMoving);

      if (currentScene.prop && currentScene.prop !== 'none') {
        drawSceneProp(currentScene.prop, W * 0.52, groundY, H < 800 ? 0.78 : 0.95, false);
      }

      const speaker = currentScene.char || 'hero';
      const listener = currentScene.other || (speaker === 'hero' ? 'bro' : 'hero');
      const speakerPose = currentScene.pose || 'normal';

      if (cam !== 'in') {
        drawFullBodyCharacter(listener, currentScene.otherEmotion || 'normal', 'idle', 'none', 0, W * 0.74, groundY, charScale * 0.88, false, -1, 'normal');
        drawFullBodyCharacter(speaker, currentScene.emotion || 'normal', currentScene.action || 'idle', currentScene.power || 'none', mouthOpen, W * 0.28, groundY, charScale, true, 1, speakerPose);
      } else {
        drawFullBodyCharacter(speaker, currentScene.emotion || 'normal', currentScene.action || 'idle', currentScene.power || 'none', mouthOpen, W * 0.48, groundY, charScale * 1.08, true, 0, speakerPose);
      }
    }
  }

  applyLightmanMood(currentScene.lighting || 'daylight');
  applySketchTexture();
  drawSmearLines();
  ctx.restore();
  drawCaptions(currentScene.text, currentScene.char || 'hero');
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

function trimDeadSilence(buf) {
  if (!buf || !buf.sampleRate) return buf;
  const sr = buf.sampleRate;
  const data = buf.getChannelData(0);
  const threshold = 0.012;
  let start = 0, end = data.length - 1;
  while (start < end && Math.abs(data[start]) < threshold) start++;
  while (end > start && Math.abs(data[end]) < threshold) end--;
  start = Math.max(0, start - Math.floor(sr * 0.03));
  end = Math.min(data.length, end + Math.floor(sr * 0.04));
  const len = Math.max(200, end - start);
  const out = audioCtx.createBuffer(1, len, sr);
  const dst = out.getChannelData(0);
  for (let i = 0; i < len; i++) dst[i] = data[start + i] || 0;
  return out;
}

async function fetchEdgeTTSPerScene(scenes, partLabel = '') {
  const buffers = [];
  for (let i = 0; i < scenes.length; i++) {
    setStatus(`🎙️ [Sound Artist] Recording Edge Hindi Voice ${partLabel} (${i + 1}/${scenes.length})...`);
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: scenes[i].text, char: scenes[i].char })
    });
    if (!res.ok) throw new Error(`Edge TTS HTTP ${res.status}`);
    const arr = await res.arrayBuffer();
    const decoded = await audioCtx.decodeAudioData(arr);
    buffers.push(trimDeadSilence(decoded));
  }
  return buffers;
}

async function fetchGeminiMultiSpeakerVoices(scenes, partLabel = '') {
  const key = apiKeyInput.value.trim();
  if (!key) throw new Error('Gemini API Key missing');
  const isFemale = (c) => c === 'mom' || c === 'bhabhi';
  const dialogueLines = scenes.map((sc) => `${isFemale(sc.char) ? 'FemaleVoice' : 'MaleVoice'}: ${sc.text}`).join('\n');

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: 'Act out this fast-paced Indian Hinglish comedy story with expressive reactions:\n' + dialogueLines }] }],
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
  if (!res.ok) throw new Error(`Gemini TTS HTTP ${res.status}`);
  const data = await res.json();
  const inlineData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inlineData?.data) throw new Error('No audio returned');
  const fullBuf = await audioCtx.decodeAudioData(pcmToWavBuffer(inlineData.data, 24000));
  return splitAudioBufferByScenes(fullBuf, scenes);
}

async function runSoundArtistAgent(scenes, partLabel = '') {
  setCrewState('sound', 'active');
  const mode = voiceEngineSelect.value;

  try {
    if (mode === 'edge') {
      const list = await fetchEdgeTTSPerScene(scenes, partLabel);
      setCrewState('sound', 'done');
      return list;
    }
    if (mode === 'gemini') {
      setStatus(`🎙️ [Sound Artist] Recording Gemini Multi-Speaker Voices ${partLabel}...`);
      const list = await fetchGeminiMultiSpeakerVoices(scenes, partLabel);
      setCrewState('sound', 'done');
      return list;
    }
    try {
      setStatus(`🎙️ [Sound Artist] Recording Gemini Voices ${partLabel}...`);
      const list = await fetchGeminiMultiSpeakerVoices(scenes, partLabel);
      setCrewState('sound', 'done');
      return list;
    } catch {
      const list = await fetchEdgeTTSPerScene(scenes, partLabel);
      setCrewState('sound', 'done');
      return list;
    }
  } catch {
    setStatus(`⚠️ Voice API busy, rendering ${partLabel} with BGM + SFX + Captions...`);
    setCrewState('sound', 'done');
    return scenes.map((s) => createSilentBuffer(Math.max(2.0, (s.text || '').split(' ').length * 0.35)));
  }
}

function splitAudioBufferByScenes(fullBuffer, scenes) {
  const sampleRate = fullBuffer.sampleRate, channelData = fullBuffer.getChannelData(0), totalSamples = channelData.length;
  const weights = scenes.map(s => Math.max(4, (s.text || '').length)), totalWeight = weights.reduce((a, b) => a + b, 0);
  const slices = []; let cursorSample = 0;

  for (let i = 0; i < scenes.length; i++) {
    if (i === scenes.length - 1) {
      slices.push(trimDeadSilence(extractSubBuffer(fullBuffer, cursorSample, totalSamples)));
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
    slices.push(trimDeadSilence(extractSubBuffer(fullBuffer, cursorSample, bestSample)));
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
  const safeBuf = (audioBuffer && audioBuffer.sampleRate) ? audioBuffer : createSilentBuffer(2.2);
  return new Promise((resolve) => {
    let resolved = false; duckBGM(true);
    const source = audioCtx.createBufferSource();
    source.buffer = safeBuf;
    if (char === 'bro') { source.detune.value = 120; source.playbackRate.value = 1.06; }
    else if (char === 'villain') { source.detune.value = -220; source.playbackRate.value = 0.97; }
    else { source.playbackRate.value = 1.04; }
    source.connect(analyser); analyser.connect(audioCtx.destination); analyser.connect(destNode);
    source.onended = () => { if (!resolved) { resolved = true; duckBGM(false); resolve(); } };
    source.start(0);
  });
}

// =========================================================================
// AGENT 5: EDITOR & NATIVE COMPOSITOR VIDEO RECORDER (100% BLACK-SCREEN FREE)
// =========================================================================
async function createBulletproofRecorder() {
  const canvasStream = canvas.captureStream(30);
  const videoTrack = canvasStream.getVideoTracks()[0];
  const audioTracks = destNode ? destNode.stream.getAudioTracks() : [];
  const combined = new MediaStream([videoTrack, ...audioTracks]);

  const candidates = [
    { mime: 'video/mp4;codecs=avc1,mp4a.40.2', ext: 'mp4' },
    { mime: 'video/mp4', ext: 'mp4' },
    { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' }
  ];

  let chosen = { mime: '', ext: 'webm' };
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c.mime)) {
      chosen = c;
      break;
    }
  }

  const options = chosen.mime
    ? { mimeType: chosen.mime, videoBitsPerSecond: 3_000_000 }
    : { videoBitsPerSecond: 3_000_000 };

  const rec = new MediaRecorder(combined, options);
  const chunks = [];
  const startTime = performance.now();

  rec.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  // Push frame tick explicitly every 33ms so Android stream never stalls
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
  downloadLink.click();
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
    smearTimer = 3;
    playSFX(litScenes[i].sfx);
    setStatus(`✂️ [Editor] Shooting Take ${i + 1}/${litScenes.length} ${partLabel}...`);
    await playAudioOnce(audioList[i], litScenes[i].char);
  }
  stopComedyBGM();

  if (recorderSession) {
    setStatus(`📦 [Editor] Saving Final Video ${partLabel}...`);
    const { blob, ext, secs } = await recorderSession.stop();
    setCrewState('editor', 'done');
    const fname = `storytoon_part${partNum}of${totalParts}_${secs}s.${ext}`;
    if (autoSave) triggerAutoDownload(blob, fname);
    else {
      downloadLink.href = URL.createObjectURL(blob);
      downloadLink.download = fname;
      downloadLink.classList.remove('hidden');
    }
    return { secs, sizeKB: Math.round(blob.size / 1024), ext };
  }
  setCrewState('editor', 'done');
  return { secs: 0, sizeKB: 0, ext: 'mp4' };
}

// 🎬 ACTION!
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
      const scenes = await runPreProductionCrew(key, topic, part, totalParts, prevEnding);
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
  try {
    const scenes = await runPreProductionCrew(key, topic, 1, 1, '');
    scriptEditor.value = JSON.stringify(scenes, null, 2);
    cachedScriptHash = '';
    renderMicControls();
    setStatus(`✅ Pre-Production Done! Writer, DOP & Lightman ready (${scenes.length} shots).`);
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
