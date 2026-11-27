const APP_VERSION = 'v42.0';
const canvas = document.getElementById('stageCanvas');
const ctx = canvas.getContext('2d');
const canvasWrap = document.getElementById('canvasWrap');
const apiKeyInput = document.getElementById('apiKeyInput');
const sarvamKeyInput = document.getElementById('sarvamKeyInput');
const topicInput = document.getElementById('topicInput');
const formatSelect = document.getElementById('formatSelect');
const episodeModeSelect = document.getElementById('episodeModeSelect');
const toneSelect = document.getElementById('toneSelect');
const voiceEngineSelect = document.getElementById('voiceEngineSelect');
const scriptEditor = document.getElementById('scriptEditor');
const statusBar = document.getElementById('statusBar');
const downloadLink = document.getElementById('downloadLink');

const VALID_LOCATIONS = ['room', 'cafe', 'college', 'office', 'park', 'street', 'hospital', 'gym'];
const FEMALE_ROLES = ['mom', 'bhabhi', 'gf', 'sister'];

const randomTopics = [
  "Office mein boss ki chugli karte waqt peeche khud boss khada tha",
  "Dost ke saath room mein gf ki naughty baatein aur achanak behen ki entry",
  "Gym mein sundar ladki ko impress karne ke chakkar mein dost ne beizzati karwa di",
  "Cafe date par bill aaya 5000 aur dost ne bola mera wallet ghar reh gaya",
  "Late night hostel room mein lights off karke bhoot ki baatein aur pant geeli",
  "Girlfriend ne phone ka password manga aur dost ke naughty messages khul gaye"
];
const rndBtn = document.getElementById("randomTopicBtn");
if (rndBtn) {
  rndBtn.onclick = () => {
    const pick = randomTopics[Math.floor(Math.random() * randomTopics.length)];
    topicInput.value = pick;
    setStatus("🎲 Viral Desi topic loaded! Click Action to shoot.");
  };
}

apiKeyInput.value = localStorage.getItem('gemini_api_key') || '';
apiKeyInput.addEventListener('change', () => {
  localStorage.setItem('gemini_api_key', apiKeyInput.value.trim());
});

if (sarvamKeyInput) {
  sarvamKeyInput.value = localStorage.getItem('sarvam_api_key') || '';
  sarvamKeyInput.addEventListener('change', () => {
    localStorage.setItem('sarvam_api_key', sarvamKeyInput.value.trim());
  });
}

// =========================================================================
// DUAL INPUT MODE: TOPIC MODE (AI) vs CUSTOM SCRIPT MODE (USER SCRIPT)
// =========================================================================
let inputMode = "topic";
const modeTopicBtn = document.getElementById("modeTopicBtn");
const modeCustomScriptBtn = document.getElementById("modeCustomScriptBtn");
const topicInputWrap = document.getElementById("topicInputWrap");
const customScriptWrap = document.getElementById("customScriptWrap");
const customScriptInput = document.getElementById("customScriptInput");
const fillSampleCustomBtn = document.getElementById("fillSampleCustomBtn");

function setInputMode(mode) {
  inputMode = mode;
  if (mode === "custom") {
    modeCustomScriptBtn.className = "btn primary";
    modeTopicBtn.className = "btn secondary";
    customScriptWrap.classList.remove("hidden");
    topicInputWrap.classList.add("hidden");
    setStatus("📝 Custom Script Mode active! Apni script paste karke Action dabao.");
  } else {
    modeTopicBtn.className = "btn primary";
    modeCustomScriptBtn.className = "btn secondary";
    topicInputWrap.classList.remove("hidden");
    customScriptWrap.classList.add("hidden");
    setStatus("💡 Topic Mode active! Topic likho ya Random Viral Topic chuno.");
  }
}

if (modeTopicBtn) modeTopicBtn.onclick = () => setInputMode("topic");
if (modeCustomScriptBtn) modeCustomScriptBtn.onclick = () => setInputMode("custom");

if (fillSampleCustomBtn) {
  fillSampleCustomBtn.onclick = () => {
    customScriptInput.value = [
      "Hero: Bhai aaj meri girlfriend cafe mein milne aa rahi hai, bilkul hero lag raha hoon na?",
      "Bro: Saale shakal dekh apni, aur bill ke paise hain ya phir mera wallet lootega?",
      "GF: Sorry guys late ho gayi! Waise aaj ka coffee treat kaun de raha hai?",
      "Bro: Bhabhi ji aaj toh isne khud bola hai ki chahe 5000 ka bill aaye wahi pay karega!"
    ].join("\n");
    setStatus("✨ Sample Custom Script loaded! Ab Action dabao.");
  };
}

function mapSpeakerLabelToRole(rawName, fallbackIdx = 0) {
  const n = (rawName || "").toLowerCase().trim();
  if (/^(gf|girlfriend|crush|ladki|baby|jaan|riya|priya|ananya|neha)$/.test(n)) return "gf";
  if (/^(sister|behen|didi|sis)$/.test(n)) return "sister";
  if (/^(bhabhi)$/.test(n)) return "bhabhi";
  if (/^(mom|mummy|maa|mother)$/.test(n)) return "mom";
  if (/^(bro|dost|friend|yaar|rahul|rohit|aman)$/.test(n)) return "bro";
  if (/^(boss|villain|sir|teacher|doctor|uncle|papa|dad)$/.test(n)) return "villain";
  if (/^(hero|main|me|boy|guy)$/.test(n)) return "hero";
  return fallbackIdx % 2 === 0 ? "hero" : "bro";
}

function parseCustomUserScript(rawText) {
  const trimmed = (rawText || "").trim();
  if (!trimmed) throw new Error("Pehle apni script paste ya type karo!");

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("JSON script empty hai!");
    return parsed;
  }

  const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const fullStoryText = lines.join(" ");
  const detectedLoc = inferTopicLocation(fullStoryText) || "room";
  const activeCast = ["hero", "bro"];
  const scenes = [];

  lines.forEach((line, idx) => {
    let speaker = idx % 2 === 0 ? "hero" : "bro";
    let dialogue = line;

    const colonMatch = line.match(/^([a-zA-Z0-9_\s]{1,18})\s*:\s*(.+)$/);
    if (colonMatch) {
      speaker = mapSpeakerLabelToRole(colonMatch[1], idx);
      dialogue = colonMatch[2].trim();
    }

    if (!activeCast.includes(speaker)) {
      if (activeCast.length < 3) activeCast.push(speaker);
      else activeCast[2] = speaker;
    }

    const t = dialogue.toLowerCase();
    let emotion = "normal";
    let sfx = "none";
    let punch = "";
    if (/!|\?|kya|kaise|shock|omg|pagal/.test(t)) { emotion = "shocked"; sfx = idx > 0 ? "gasp" : "none"; }
    if (/saale|kamine|harami|gussa|maar|bhag|nikal|bsdk|chomu|fire|bakwas/.test(t)) { emotion = "angry"; sfx = "bonk"; punch = "Savage Roast"; }
    if (/haha|treat|bill|wallet|maza|chill|smart/.test(t)) { emotion = "smug"; }
    if (/sorry|dard|rona|cry|tension|darr|maaf/.test(t)) { emotion = "sweat"; }

    const reactions = {};
    activeCast.forEach((r) => {
      if (r === speaker) reactions[r] = emotion;
      else if (r === 'villain' && emotion === 'sweat') reactions[r] = 'angry';
      else if (emotion === 'angry') reactions[r] = 'sweat';
      else reactions[r] = 'normal';
    });

    const lineLoc = inferTopicLocation(dialogue) || detectedLoc;
    scenes.push({
      char: speaker,
      cast: [...activeCast],
      reactions,
      emotion,
      otherEmotion: emotion === "angry" ? "sweat" : "normal",
      gesture: emotion === "angry" ? "point" : (emotion === "smug" ? "crossed" : "explain"),
      shot: activeCast.length >= 3 ? "wide" : (idx % 3 === 1 ? "in" : "normal"),
      location: lineLoc,
      lighting: /raat|night|andhera|light off/.test(t) ? "night" : "pastel",
      punch,
      prop: /phone|mobile|upi|message|call/.test(t) ? "phone" : (/chai|coffee|tea/.test(t) ? "chai" : "none"),
      sfx,
      text: dialogue
    });
  });

  return scenes;
}

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
  { char: "bro", cast: ["hero", "bro"], reactions: { hero: "sweat", bro: "smug" }, emotion: "smug", otherEmotion: "sweat", gesture: "point", shot: "normal", location: "office", lighting: "pastel", punch: "Boss Ki Chugli", prop: "none", sfx: "none", text: "Bhai ye boss khud ko bahut bada tees maar khan samajhta hai, par ek number ka kanjoos hai!" },
  { char: "hero", cast: ["hero", "bro"], reactions: { hero: "smug", bro: "smug" }, emotion: "smug", otherEmotion: "smug", gesture: "explain", shot: "in", location: "office", lighting: "pastel", punch: "Full Attitude", prop: "none", sfx: "none", text: "Sahi bola bhai, agar aaj samne aa gaya na toh seedha uske muh par bol dunga!" },
  { char: "villain", cast: ["hero", "bro", "villain"], reactions: { hero: "sweat", bro: "shocked", villain: "angry" }, emotion: "angry", otherEmotion: "sweat", gesture: "point", shot: "wide", location: "office", lighting: "dramatic", punch: "Boss Entry!", prop: "none", sfx: "boom", text: "Achha beta! Chalo aaj mera muh samne hai, ab bol kya bolna chahta tha?" },
  { char: "hero", cast: ["hero", "bro", "villain"], reactions: { hero: "sweat", bro: "sweat", villain: "angry" }, emotion: "sweat", otherEmotion: "angry", gesture: "facepalm", shot: "wide", location: "office", lighting: "dramatic", punch: "Lag Gayi", prop: "none", sfx: "gasp", text: "S-Sorry sir! Hum toh aapki tareef kar rahe the ki aap kitne mehnati hain!" }
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
    const castCount = Array.isArray(sc.cast) ? sc.cast.length : 2;
    const label = document.createElement('span');
    label.style.cssText = 'font-size:0.71rem;color:#e2e8f0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    label.textContent = `${idx + 1}. [${castCount}P • ${(sc.location || 'room').toUpperCase()} • ${(sc.char || 'hero').toUpperCase()}] ${sc.text}`;

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
  setStatus('Office Boss Entry + Per-Character Reactions Demo loaded!');
};

// =========================================================================
// WEB AUDIO ENGINE + SCENE-ADAPTIVE BGM + FOLEY SFX
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

function startAdaptiveBGM() {
  stopAdaptiveBGM();
  const brightNotes = [261.63, 329.63, 392.00, 493.88, 220.00, 261.63, 329.63, 392.00];
  const suspenseNotes = [220.00, 246.94, 261.63, 246.94, 196.00, 220.00, 246.94, 164.81];
  let step = 0;
  bgmInterval = setInterval(() => {
    if (!audioCtx || audioCtx.state !== 'running') return;
    const now = audioCtx.currentTime;
    const isSuspense = currentScene.lighting === 'night' || currentScene.lighting === 'dramatic';
    const scale = isSuspense ? suspenseNotes : brightNotes;
    const osc = audioCtx.createOscillator(), noteGain = audioCtx.createGain();
    osc.type = isSuspense ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(scale[step % scale.length], now);
    step++;
    noteGain.gain.setValueAtTime(0.001, now);
    noteGain.gain.linearRampToValueAtTime(0.15, now + 0.04);
    noteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    osc.connect(noteGain); noteGain.connect(bgmGain);
    osc.start(now); osc.stop(now + 0.38);
  }, 380);
}
function stopAdaptiveBGM() { if (bgmInterval) { clearInterval(bgmInterval); bgmInterval = null; } }
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
// ADVANCED HUMAN FILM CREW + PER-CHARACTER REACTION SUPERVISOR
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

async function callGeminiAgent(key, models, prompt, temp = 0.85, expectObject = false) {
  let lastErr = 'Server busy';
  const openCh = expectObject ? '{' : '[';
  const closeCh = expectObject ? '}' : ']';

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
      const sIdx = raw.indexOf(openCh), eIdx = raw.lastIndexOf(closeCh);
      if (sIdx === -1 || eIdx === -1) { lastErr = 'Invalid JSON'; continue; }
      return JSON.parse(raw.slice(sIdx, eIdx + 1));
    } catch (err) {
      lastErr = err.name === 'AbortError' ? `${model} timed out` : err.message;
      await sleep(600);
    }
  }
  throw new Error(lastErr);
}

// AGENT 1: UNFILTERED DESI SCRIPTWRITER + PER-CHARACTER REACTION DIRECTOR
async function runScriptwriterAgent(key, models, topic, partNum, totalParts, prevEnding, targetLines) {
  setCrewState('writer', 'active');
  setStatus(`✍️ [1/4 Unfiltered Writer] Crafting raw Desi hook & ${targetLines}-line script (Part ${partNum}/${totalParts})...`);
  const cont = partNum > 1
    ? `Continue seamlessly from: "${prevEnding}".`
    : (totalParts > 1 ? `Part 1 of ${totalParts}. End on a wild cliffhanger!` : `Complete short story with a killer callback punchline.`);

  const genre = toneSelect.value;
  let styleDirection = 'RAW UNFILTERED DESI YOUTUBE COMEDY (CarryMinati / BB Ki Vines / Ashish Chanchlani vibe)! Characters roast each other mercilessly using natural Indian street slang & mild gaaliyan ("saale", "kamine", "harami", "chomu", "ullu ke patthe", "abey bsdk", "nikamme", "tharki") + bold naughty/double-meaning adult banter when talking about girls, dates, or night scenes! Zero boring moral gyaan!';

  if (genre.includes('Double Meaning')) {
    styleDirection = 'BOLD 18+ DOUBLE MEANING (NAUGHTY DESI) COMEDY! Heavy adult innuendos, spicy bedroom/gym/date misunderstandings, naughty teasing between friends or couple, and raw Desi slang ("saale", "tharki", "kamine") that hilariously turns out to be about gaming, food, or gym in the climax!';
  } else if (genre.includes('Savage')) {
    styleDirection = 'ULTRA SAVAGE & BRUTAL ROAST! Ruthless personal insults, raw Desi gaali-style comebacks ("saale", "harami", "chomu", "aukaat dekh"), zero mercy!';
  } else if (genre.includes('Emotional')) {
    styleDirection = 'DEEP EMOTIONAL & RELATABLE storytelling! Heartfelt Hinglish conversation about life, heartbreak, career, and reality checks.';
  } else if (genre.includes('Dark')) {
    styleDirection = 'DARK COMEDY & IRONIC TWIST! Clever betrayal, catching someone red-handed, or savage karma — WITHOUT killing characters!';
  } else if (genre.includes('Relatable')) {
    styleDirection = 'Relatable, witty Indian Hinglish banter like NOT YOUR TYPE with natural friend-group slang ("saale", "bhai", "kamine") and a sharp punchline.';
  }

  const prompt = `You are an unfiltered, top-tier Indian YouTube comedy scriptwriter & acting director (BB Ki Vines / CarryMinati / NOT YOUR TYPE style).
Write an EXACTLY ${targetLines}-line raw Hinglish dialogue script about: "${topic}".
STYLE & TONE: ${styleDirection}
${cont}

VIRAL RETENTION & ACTING RULES:
1. 3-SECOND SCROLL-STOPPER HOOK: Lines 1 and 2 MUST start directly in the middle of juicy action, a wild accusation, or a naughty/funny confession — NEVER boring greetings like "Hello bhai kaise ho"!
2. NATURAL DESI SLANG & NAUGHTY BANTER: Write how real Indian guys and couples actually talk in private — use spicy teasing, naughty double-meanings, and raw Desi slang ("saale", "kamine", "harami", "tharki", "chomu", "abey bsdk") naturally where anger or roasting happens.
3. STRICT CHARACTER ENTRY ("cast"): Do NOT put a character in "cast" before they physically arrive in the scene! Only add "villain" / "gf" / "sister" / "bhabhi" / "mom" to "cast" in the exact scene where they enter and speak!
4. PER-CHARACTER INDIVIDUAL REACTIONS ("reactions"): You MUST assign a separate, realistic emotion to EVERY character present in "cast" based on the scene context!
   - Valid emotions: "normal", "shocked", "smug", "angry", "crying", "sweat".
   - Example 1 (Boss catches employees gossiping): {"villain": "angry", "hero": "sweat", "bro": "shocked"} — NEVER make the Boss scared/sweating when he catches them!
   - Example 2 (GF catches BF lying): {"gf": "angry", "hero": "sweat", "bro": "smug"} — NEVER make the GF scared!
5. ROLE IDS:
   - Male roles: "hero", "bro", "villain" (Boss/Sir/Teacher/Dad), "npc".
   - Female roles: "gf", "sister", "bhabhi", "mom".
6. STORY-MATCHED LOCATIONS ("location"): Choose from: "room", "cafe", "college", "office", "park", "street", "hospital", "gym".
7. DIRECT SPOKEN DIALOGUE ONLY: 100% ROMAN ENGLISH LETTERS ONLY (never Hindi Devanagari).
8. EXACT LENGTH: Return EXACTLY ${targetLines} dialogue objects inside "scenes".
9. LIGHTING: "pastel", "night", or "dramatic".
10. PUNCH TEXT ("punch"): Short 1-to-3 word bold label for key moments (or "" for normal lines).

Return ONLY a JSON object:
{
  "bible": { "primaryLocation": "office", "characters": ["hero", "bro", "villain"], "summary": "1-sentence plot" },
  "scenes": [
    {"char":"villain","cast":["hero","bro","villain"],"reactions":{"hero":"sweat","bro":"shocked","villain":"angry"},"location":"office","lighting":"dramatic","punch":"Boss Entry","text":"10-14 words punchy raw Roman Hinglish"}
  ]
}`;

  const result = await callGeminiAgent(key, models, prompt, 0.88, true);
  setCrewState('writer', 'done');
  return Array.isArray(result) ? result : (result.scenes || []);
}

// AGENT 2: DOP / MULTI-CAST CAMERAMAN + VFX DIRECTOR
async function runDirectorDOPAgent(key, models, draftScript) {
  setCrewState('director', 'active');
  setStatus(`🎥 [2/4 DOP & VFX] Framing wide ensemble zoom-outs & solo close-ups...`);

  const prompt = `You are a Film Director & Cinematographer. Direct camera framing for each line:
- shot:
  * "wide": Wide ensemble zoom-out shot whenever 3 characters are on screen in "cast".
  * "normal": Medium two-shot when 2 characters are on screen (~65% of 2-person lines).
  * "in": Focused solo speaker close-up for punchlines/reactions (~35% of lines).
- gesture: "explain", "point", "facepalm", "crossed", "shocked_hands", "shrug".
- prop: "none" (default), "phone", "chai" (ONLY if literally mentioned in that line).
- sfx: "none", "bonk", "boom", "sting", "gasp".

Script to direct:
${JSON.stringify(draftScript)}

Return the SAME scenes array with "shot", "gesture", "prop", "sfx" added (preserve "reactions"). JSON array ONLY.`;

  const directed = await callGeminiAgent(key, models, prompt, 0.35, false);
  setCrewState('director', 'done');
  return directed;
}

function inferTopicLocation(topicText) {
  const t = (topicText || '').toLowerCase();
  if (/cafe|coffee|restaurant|date|dinner|lunch|chai|hotel|bill|waiter/.test(t)) return 'cafe';
  if (/college|school|class|exam|teacher|sir|madam|padhai|lecture|campus/.test(t)) return 'college';
  if (/office|boss|interview|salary|job|company|meeting|corporate/.test(t)) return 'office';
  if (/gym|workout|body|muscle|trainer|protein|diet|exercise|dumbbell/.test(t)) return 'gym';
  if (/hospital|doctor|clinic|dawai|patient|bimari|checkup|injection/.test(t)) return 'hospital';
  if (/road|street|traffic|bike|scooty|car|market|bazaar|gali/.test(t)) return 'street';
  if (/park|garden|bench|walk|ground/.test(t)) return 'park';
  return null;
}

function hasFemaleCueInText(text) {
  const t = (text || '').toLowerCase();
  if (/\b(meri\s+girlfriend|meri\s+gf|meri\s+behen|meri\s+didi|meri\s+bhabhi|meri\s+mummy|uski\s+girlfriend)\b/.test(t)) return false;
  return /\b(main\s+.*?(sakti|rahi|karti|karungi|jaungi)|ladki\s+hoon)\b/.test(t);
}

// AGENT 3: SET, COSTUME & PER-CHARACTER REACTION SUPERVISOR
function runContinuityAndCostumeSupervisor(directedScenes, topicHint = '') {
  setCrewState('light', 'active');
  setStatus(`👔 [3/4 Set, Costume & Continuity] Locking outfits, per-character reactions & lighting...`);

  const inferredTopicLoc = inferTopicLocation(topicHint);
  const topicWantsGirl = /ladki|girl|crush|gf|girlfriend|bhabhi|sister|behen|mom|mummy|wife|biwi|aurat|lady/.test((topicHint || '').toLowerCase());
  let persistentLightState = null;

  const litScenes = directedScenes.map((sc, idx) => {
    const txt = (sc.text || '').toLowerCase();
    const s = { ...sc };

    if (s.emotion === 'dead') s.emotion = 'shocked';

    // 1. First-person Gender Lock
    if (hasFemaleCueInText(txt) && !FEMALE_ROLES.includes(s.char)) {
      s.char = 'gf';
    }

    // 2. Clean deduplicated cast array (2 or 3 characters)
    let castList = Array.isArray(s.cast) ? [...new Set(s.cast.filter(Boolean))] : [];
    if (!castList.includes(s.char)) castList.unshift(s.char);
    if (castList.length < 2) {
      const fallbackOther = (s.other && s.other !== s.char) ? s.other : (s.char === 'hero' ? 'bro' : 'hero');
      castList.push(fallbackOther);
    }
    if (castList.length > 3) castList = castList.slice(0, 3);
    s.cast = castList;
    s.other = castList.find(c => c !== s.char) || 'bro';

    // 3. Entry Continuity Guard
    if (s.char !== 'gf' && /\b(aane\s+wali|aa\s+rahi\s+hai|intezaar|wait\s+kar|call\s+karke|pahunch\s+gaye|kab\s+aayegi)\b/.test(txt)) {
      s.cast = s.cast.filter(c => c !== 'gf');
      if (s.cast.length < 2) s.cast.push(s.char === 'hero' ? 'bro' : 'hero');
      s.other = s.cast.find(c => c !== s.char) || 'bro';
    }

    // 4. Cameraman Auto-Framing Rule
    if (s.cast.length >= 3) {
      s.shot = 'wide';
    } else if (s.shot !== 'normal' && s.shot !== 'in') {
      s.shot = 'normal';
    }

    // 5. Location Continuity
    let loc = (s.location || '').toLowerCase().trim();
    if (!VALID_LOCATIONS.includes(loc)) {
      loc = inferredTopicLoc || (idx > 0 ? directedScenes[idx - 1].location : 'room') || 'room';
    }
    if (loc === 'room' && inferredTopicLoc && !/ghar|home|bedroom|kamra|room/.test(txt)) {
      loc = inferredTopicLoc;
    }
    s.location = VALID_LOCATIONS.includes(loc) ? loc : 'room';

    // 6. Stateful Light Switch Continuity
    if (/light\s*off|lights\s*off|batti\s*bujha|batti\s*band|andhera\s*kar|light\s*band/.test(txt)) {
      persistentLightState = 'night';
    } else if (/light\s*on|lights\s*on|batti\s*jala|light\s*jala|roshni/.test(txt)) {
      persistentLightState = 'pastel';
    }

    if (persistentLightState !== null) {
      s.lighting = persistentLightState;
    } else if (s.lighting !== 'night' && s.lighting !== 'dramatic' && s.lighting !== 'pastel') {
      if (/raat|night|andhera|bhoot|kabr|aatma/.test(txt)) {
        s.lighting = 'night';
        persistentLightState = 'night';
      } else if (s.emotion === 'angry') {
        s.lighting = 'dramatic';
      } else {
        s.lighting = 'pastel';
      }
    }

    // 7. Build Per-Character Individual Reactions Map!
    const rx = (s.reactions && typeof s.reactions === 'object') ? { ...s.reactions } : {};
    if (!rx[s.char]) rx[s.char] = s.emotion || 'normal';
    s.cast.forEach((role) => {
      if (role === s.char) return;
      if (!rx[role]) {
        rx[role] = s.otherEmotion || 'normal';
      }
    });

    // Context-aware sanity guard: Boss/Authority scolding employees is NEVER scared/sweating
    const bossScaredCue = /\b(sorry|maaf|darr|bhoot|biwi|wife|galti|bachao|kaamp|haath\s*jod|rehem)\b/.test(txt);
    if (s.cast.includes('villain') && !bossScaredCue) {
      if (s.char === 'villain') {
        if (['sweat', 'shocked', 'crying'].includes(rx.villain)) rx.villain = 'angry';
        if (s.gesture === 'facepalm' || s.gesture === 'shocked_hands') s.gesture = 'point';
        s.cast.forEach((r) => {
          if (r !== 'villain' && ['angry', 'smug'].includes(rx[r])) rx[r] = 'sweat';
        });
      } else if (/\b(sir|boss|sorry|maaf|galti|aap\s*yahan)\b/.test(txt)) {
        if (['sweat', 'shocked', 'crying'].includes(rx.villain)) rx.villain = 'angry';
        if (['angry', 'smug'].includes(rx[s.char])) rx[s.char] = 'sweat';
      }
    }

    // Context-aware sanity guard: GF/Mom confronting BF/Son is NEVER scared unless ghost/danger
    if (s.cast.includes('gf') && !bossScaredCue && s.char === 'gf' && ['sweat', 'shocked'].includes(rx.gf)) {
      rx.gf = 'angry';
    }

    s.reactions = rx;
    s.emotion = rx[s.char] || 'normal';
    const firstListener = s.cast.find(c => c !== s.char);
    s.otherEmotion = firstListener ? (rx[firstListener] || 'normal') : 'normal';

    if (!s.gesture) {
      if (s.emotion === 'angry') s.gesture = 'point';
      else if (s.emotion === 'smug') s.gesture = 'crossed';
      else if (s.emotion === 'sweat' || s.emotion === 'crying') s.gesture = 'facepalm';
      else if (s.emotion === 'shocked') s.gesture = 'shocked_hands';
      else s.gesture = 'explain';
    }

    if (s.prop === 'phone' && !/phone|mobile|reel|video|game|call|password|message|chat|upi|scan/.test(txt)) s.prop = 'none';
    if (s.prop === 'chai' && !/chai|tea|coffee|cup/.test(txt)) s.prop = 'none';

    return s;
  });

  const anyFemaleCast = litScenes.some(s => s.cast.some(c => FEMALE_ROLES.includes(c)));
  if (topicWantsGirl && !anyFemaleCast && litScenes.length >= 3) {
    const climaxIdx = Math.max(1, litScenes.length - 3);
    litScenes[climaxIdx].cast = ['hero', 'gf', 'bro'];
    litScenes[climaxIdx].reactions = { hero: 'sweat', gf: 'angry', bro: 'shocked' };
    litScenes[climaxIdx].shot = 'wide';
  }

  // Pre-Flight QC Inspector: Break monotonous camera angles
  let qcFixes = 0;
  for (let i = 2; i < litScenes.length; i++) {
    if (litScenes[i].cast.length === 2 &&
        litScenes[i].shot === litScenes[i - 1].shot &&
        litScenes[i - 1].shot === litScenes[i - 2].shot) {
      litScenes[i - 1].shot = litScenes[i - 1].shot === 'normal' ? 'in' : 'normal';
      qcFixes++;
    }
  }
  if (qcFixes > 0) {
    setStatus(`📋 [Pre-Flight QC] Auto-optimized ${qcFixes} repetitive camera angle(s)!`);
  }

  setCrewState('light', 'done');
  return litScenes;
}

async function runPreProductionCrew(key, topic, partNum, totalParts, prevEnding, targetLines = 12) {
  setCrewState('reset');
  const models = await getBestGeminiModel(key);
  const draft = await runScriptwriterAgent(key, models, topic, partNum, totalParts, prevEnding, targetLines);
  const directed = await runDirectorDOPAgent(key, models, draft);
  return runContinuityAndCostumeSupervisor(directed, topic);
}

// =========================================================================
// 8-SET RENDERER + HUMAN BODY ACTING + EXPRESSIVE FACES + SMART CAMERAMAN
// =========================================================================
let currentScene = DEMO_SCRIPT[0];
let sceneStartTime = performance.now();
let mouthOpen = 0, frameTick = 0, blinkTimer = 0;

function easeOutCubic(t) {
  const c = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - c, 3);
}

function isFemaleChar(char) {
  return FEMALE_ROLES.includes(char);
}

function getCharacterPalette(char, loc = 'room') {
  const base = {
    hero:    { shirt: '#e2e8f0', collar: '#cbd5e1', hair: '#1e293b', skin: '#fde6d8', skinShadow: '#f5ccb8', pants: '#334155', tie: null, coat: false, vest: false },
    bro:     { shirt: '#fed7aa', collar: '#fdba74', hair: '#1e293b', skin: '#f9dcc4', skinShadow: '#ecc0a0', pants: '#1e3a8a', tie: null, coat: false, vest: false },
    villain: { shirt: '#334155', collar: '#1e293b', hair: '#0f172a', skin: '#f1d5c5', skinShadow: '#dfb9a4', pants: '#0f172a', tie: null, coat: false, vest: false },
    mom:     { shirt: '#fbcfe8', collar: '#f472b6', hair: '#291d18', skin: '#fde6d8', skinShadow: '#f5ccb8', pants: '#831843', tie: null, coat: false, vest: false },
    bhabhi:  { shirt: '#ddd6fe', collar: '#a78bfa', hair: '#1e1b18', skin: '#fde6d8', skinShadow: '#f5ccb8', pants: '#4c1d95', tie: null, coat: false, vest: false },
    gf:      { shirt: '#fecdd3', collar: '#fb7185', hair: '#3b2316', skin: '#fde6d8', skinShadow: '#f5ccb8', pants: '#881337', tie: null, coat: false, vest: false },
    sister:  { shirt: '#bae6fd', collar: '#38bdf8', hair: '#291d18', skin: '#fde6d8', skinShadow: '#f5ccb8', pants: '#0369a1', tie: null, coat: false, vest: false },
    npc:     { shirt: '#bbf7d0', collar: '#4ade80', hair: '#334155', skin: '#f9dcc4', skinShadow: '#ecc0a0', pants: '#14532d', tie: null, coat: false, vest: false }
  };
  const pal = { ...(base[char] || base.hero) };

  if (loc === 'office') {
    pal.shirt = char === 'villain' ? '#1e293b' : '#f8fafc';
    pal.collar = '#cbd5e1';
    pal.pants = '#0f172a';
    if (!isFemaleChar(char)) pal.tie = char === 'hero' ? '#2563eb' : (char === 'villain' ? '#f59e0b' : '#dc2626');
  } else if (loc === 'gym') {
    pal.vest = true;
    pal.shirt = char === 'hero' ? '#38bdf8' : (char === 'bro' ? '#fb923c' : '#f472b6');
    pal.pants = '#1e293b';
  } else if (loc === 'hospital' && (char === 'npc' || char === 'villain')) {
    pal.shirt = '#ffffff';
    pal.collar = '#38bdf8';
    pal.coat = true;
  } else if (loc === 'college') {
    pal.tie = '#0284c7';
  }
  return pal;
}

function drawPastelEnvironment(loc, lighting = 'pastel') {
  const W = canvas.width, H = canvas.height;
  const floorY = Math.round(H * 0.78);
  const isNight = lighting === 'night' || lighting === 'dramatic';

  if (loc === 'cafe') {
    const wall = ctx.createLinearGradient(0, 0, 0, floorY);
    wall.addColorStop(0, isNight ? '#1c1917' : '#ffedd5');
    wall.addColorStop(1, isNight ? '#292524' : '#fed7aa');
    ctx.fillStyle = wall;
    ctx.fillRect(-W, -H, W * 3, floorY + H);

    [W * 0.22, W * 0.78].forEach(lx => {
      ctx.strokeStyle = '#334155'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, H * 0.16); ctx.stroke();
      ctx.fillStyle = isNight ? '#fbbf24' : '#ea580c';
      ctx.beginPath(); ctx.arc(lx, H * 0.18, 24, Math.PI, 0); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(254, 240, 138, 0.22)';
      ctx.beginPath(); ctx.moveTo(lx - 22, H * 0.18); ctx.lineTo(lx + 22, H * 0.18); ctx.lineTo(lx + 65, floorY); ctx.lineTo(lx - 65, floorY); ctx.closePath(); ctx.fill();
    });

    ctx.fillStyle = '#1e293b'; ctx.strokeStyle = '#92400e'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.roundRect(W * 0.5 - 75, floorY - 475, 150, 82, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fef08a'; ctx.font = '800 18px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('CAFE MENU', W * 0.5, floorY - 445);
    ctx.fillStyle = '#e2e8f0'; ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText('Coffee • Chai • Pizza', W * 0.5, floorY - 418);

    ctx.fillStyle = isNight ? '#1c1917' : '#d6a87c';
    ctx.fillRect(-W, floorY, W * 3, H * 2);

  } else if (loc === 'college') {
    const wall = ctx.createLinearGradient(0, 0, 0, floorY);
    wall.addColorStop(0, isNight ? '#0f172a' : '#ecfdf5');
    wall.addColorStop(1, isNight ? '#1e293b' : '#d1fae5');
    ctx.fillStyle = wall;
    ctx.fillRect(-W, -H, W * 3, floorY + H);

    ctx.fillStyle = isNight ? '#064e3b' : '#15803d';
    ctx.strokeStyle = '#78350f'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.roundRect(W * 0.5 - 125, floorY - 455, 250, 120, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '700 17px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('CLASS 101 • EXAM TODAY', W * 0.5, floorY - 405);
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.fillText('E = mc²   |   Syllabus = ∞', W * 0.5, floorY - 372);

    ctx.fillStyle = isNight ? '#334155' : '#cbd5e1';
    ctx.fillRect(-W, floorY, W * 3, H * 2);

  } else if (loc === 'office') {
    const wall = ctx.createLinearGradient(0, 0, 0, floorY);
    wall.addColorStop(0, isNight ? '#090d16' : '#f1f5f9');
    wall.addColorStop(1, isNight ? '#1e293b' : '#cbd5e1');
    ctx.fillStyle = wall;
    ctx.fillRect(-W, -H, W * 3, floorY + H);

    const wx = W * 0.5 - 135, wy = floorY - 455, ww = 270, wh = 140;
    ctx.fillStyle = isNight ? '#0f172a' : '#bae6fd';
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.roundRect(wx, wy, ww, wh, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = isNight ? '#334155' : '#94a3b8';
    ctx.fillRect(wx + 24, wy + 50, 45, 87);
    ctx.fillRect(wx + 85, wy + 30, 55, 107);
    ctx.fillRect(wx + 160, wy + 60, 50, 77);

    ctx.fillStyle = isNight ? '#1e293b' : '#94a3b8';
    ctx.fillRect(-W, floorY, W * 3, H * 2);

  } else if (loc === 'hospital') {
    const wall = ctx.createLinearGradient(0, 0, 0, floorY);
    wall.addColorStop(0, isNight ? '#0f172a' : '#f0fdf4');
    wall.addColorStop(1, isNight ? '#1e293b' : '#dcfce7');
    ctx.fillStyle = wall;
    ctx.fillRect(-W, -H, W * 3, floorY + H);

    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.roundRect(W * 0.16, floorY - 420, 72, 72, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(W * 0.16 + 30, floorY - 405, 12, 42);
    ctx.fillRect(W * 0.16 + 15, floorY - 390, 42, 12);

    ctx.fillStyle = '#0f172a'; ctx.strokeStyle = '#475569'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(W * 0.72, floorY - 415, 96, 65, 8); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(W * 0.73, floorY - 381); ctx.lineTo(W * 0.76, floorY - 381);
    ctx.lineTo(W * 0.78, floorY - 403); ctx.lineTo(W * 0.80, floorY - 361);
    ctx.lineTo(W * 0.82, floorY - 381); ctx.lineTo(W * 0.84, floorY - 381);
    ctx.stroke();

    ctx.fillStyle = isNight ? '#1e293b' : '#bbf7d0';
    ctx.fillRect(-W, floorY, W * 3, H * 2);

  } else if (loc === 'gym') {
    const wall = ctx.createLinearGradient(0, 0, 0, floorY);
    wall.addColorStop(0, '#1e293b');
    wall.addColorStop(1, '#334155');
    ctx.fillStyle = wall;
    ctx.fillRect(-W, -H, W * 3, floorY + H);

    ctx.fillStyle = '#0f172a'; ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.roundRect(W * 0.5 - 110, floorY - 465, 220, 75, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fbbf24'; ctx.font = '900 21px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('NO PAIN • NO GAIN', W * 0.5, floorY - 420);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-W, floorY, W * 3, H * 2);

  } else if (loc === 'street') {
    const sky = ctx.createLinearGradient(0, 0, 0, floorY);
    sky.addColorStop(0, isNight ? '#090d16' : '#fed7aa');
    sky.addColorStop(1, isNight ? '#1e1b4b' : '#fef3c7');
    ctx.fillStyle = sky;
    ctx.fillRect(-W, -H, W * 3, floorY + H);

    ctx.fillStyle = isNight ? '#1e293b' : '#cbd5e1';
    ctx.fillRect(W * 0.08, floorY - 340, 120, 340);
    ctx.fillRect(W * 0.72, floorY - 380, 140, 380);

    ctx.fillStyle = '#334155';
    ctx.fillRect(-W, floorY, W * 3, H * 2);
    ctx.fillStyle = '#fef08a';
    for (let rx = -W; rx < W * 2; rx += 110) {
      ctx.fillRect(rx, floorY + 55, 60, 10);
    }

  } else if (loc === 'park') {
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
      ctx.beginPath(); ctx.arc(W * 0.80, H * 0.14, 34, 0, Math.PI * 2); ctx.fill();
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

  } else {
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

    const winW = 120, winH = 115;
    const winX = W * 0.14;
    const winY = floorY - 410;
    ctx.fillStyle = isNight ? '#1e3a8a' : '#e0f2fe';
    ctx.strokeStyle = isNight ? '#475569' : '#334155';
    ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.roundRect(winX, winY, winW, winH, 8); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(winX + winW * 0.5, winY); ctx.lineTo(winX + winW * 0.5, winY + winH); ctx.stroke();

    if (isNight) {
      ctx.fillStyle = '#fef08a';
      ctx.beginPath(); ctx.arc(winX + 32, winY + 32, 13, 0, Math.PI * 2); ctx.fill();
    }

    ctx.fillStyle = isNight ? '#1e293b' : '#ffffff';
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(W * 0.74, floorY - 400, 95, 75, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fb7185';
    ctx.beginPath(); ctx.arc(W * 0.74 + 47, floorY - 362, 18, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = isNight ? '#334155' : '#e7c697';
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

  if (!pal.vest) {
    const sleeveX = sx + (ex - sx) * 0.55;
    const sleeveY = sy + (ey - sy) * 0.55;
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 28;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sleeveX, sleeveY); ctx.stroke();
    ctx.strokeStyle = pal.shirt;
    ctx.lineWidth = 21;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sleeveX, sleeveY); ctx.stroke();
  }

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

function drawPastelCharacter(char, emotion, gesture, talkAmt, footX, groundY, scaleVal, isSpeaker, lookDir = 1, heldProp = 'none', loc = 'room') {
  const pal = getCharacterPalette(char, loc);
  const fem = isFemaleChar(char);
  const dir = lookDir >= 0 ? 1 : -1;
  const breath = Math.sin(frameTick * 0.08) * 2.5;
  const speakBounce = isSpeaker ? talkAmt * 5.0 : 0;

  // Human Body Acting: Shivering when scared/sweating, leaning forward when angry!
  const isScared = emotion === 'sweat' || emotion === 'shocked' || emotion === 'crying';
  const isAngry = emotion === 'angry';
  const shiverX = isScared ? Math.sin(frameTick * 0.85) * 2.2 : 0;
  const bodyLean = isAngry ? dir * 0.055 : (isScared ? -dir * 0.035 : 0);

  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.16)';
  ctx.beginPath(); ctx.ellipse(footX, groundY + 3, 52 * scaleVal, 10 * scaleVal, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(footX + shiverX, groundY - speakBounce);
  ctx.scale(scaleVal, scaleVal);
  ctx.rotate(bodyLean);

  if (fem) {
    ctx.fillStyle = pal.hair;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 3.2;
    if (char === 'mom') {
      ctx.beginPath();
      ctx.arc(-dir * 38, -356 + breath * 0.4, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
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

  ctx.fillStyle = pal.pants;
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.roundRect(-25, -118, 21, 108, 8); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(4, -118, 21, 108, 8); ctx.fill(); ctx.stroke();

  ctx.fillStyle = fem ? '#fbcfe8' : '#ffffff';
  ctx.beginPath(); ctx.roundRect(-29, -16, 27, 16, 7); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(2, -16, 27, 16, 7); ctx.fill(); ctx.stroke();

  ctx.save();
  ctx.translate(0, breath * 0.5);
  ctx.fillStyle = pal.shirt;
  if (fem) {
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

  if (pal.tie) {
    ctx.fillStyle = pal.tie;
    ctx.beginPath();
    ctx.moveTo(-5, -214); ctx.lineTo(5, -214); ctx.lineTo(8, -162); ctx.lineTo(0, -150); ctx.lineTo(-8, -162);
    ctx.closePath(); ctx.fill();
  }
  if (pal.coat) {
    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(0, -214); ctx.lineTo(0, -112); ctx.stroke();
  }

  ctx.fillStyle = pal.collar;
  ctx.beginPath();
  ctx.arc(0, -230, 17, 0, Math.PI);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = pal.skin;
  ctx.fillRect(-11, -254, 22, 26);
  ctx.strokeRect(-11, -254, 22, 26);
  ctx.fillStyle = pal.skinShadow;
  ctx.fillRect(-10, -254, 20, 9);

  const actWave = isSpeaker ? Math.sin(frameTick * 0.16) * (6 + talkAmt * 14) : Math.sin(frameTick * 0.07) * 3;
  // Individual listener gesture matches their own emotion!
  const effGesture = isSpeaker
    ? gesture
    : (emotion === 'shocked' ? 'shocked_hands'
      : (emotion === 'sweat' || emotion === 'crying' ? 'facepalm'
        : (emotion === 'smug' || emotion === 'angry' ? 'crossed' : 'idle')));
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

  const headY = -318;
  const headNod = isSpeaker ? (talkAmt * 5.0 + breath * 0.4) : (Math.sin(frameTick * 0.1) * 2);
  const headTilt = isSpeaker ? Math.sin(frameTick * 0.14) * 0.045 * (0.3 + talkAmt) : (isAngry ? dir * 0.04 : 0.01);

  ctx.save();
  ctx.translate(0, headY + headNod);
  ctx.rotate(headTilt);

  ctx.fillStyle = pal.skin;
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 3.6;
  ctx.beginPath();
  ctx.ellipse(0, 0, fem ? 64 : 68, 70, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = fem ? 'rgba(244, 114, 182, 0.32)' : 'rgba(244, 114, 182, 0.20)';
  ctx.beginPath(); ctx.ellipse(-32, 14, 12, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(32, 14, 12, 7, 0, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = pal.hair;
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 3.4;
  if (char === 'bro') {
    ctx.fillStyle = '#f87171';
    ctx.beginPath(); ctx.arc(0, -24, 66, Math.PI, 0); ctx.fill(); ctx.stroke();
    ctx.fillRect(dir > 0 ? -90 : 44, -30, 46, 11); ctx.strokeRect(dir > 0 ? -90 : 44, -30, 46, 11);
  } else if (fem) {
    ctx.beginPath();
    ctx.moveTo(-64, -10);
    ctx.quadraticCurveTo(-56, -84, 0, -82);
    ctx.quadraticCurveTo(56, -84, 64, -10);
    ctx.quadraticCurveTo(60, 12, 52, 16);
    ctx.quadraticCurveTo(50, -28, 12, -44);
    ctx.quadraticCurveTo(-24, -34, -50, -26);
    ctx.quadraticCurveTo(-52, 12, -52, 16);
    ctx.quadraticCurveTo(-60, 12, -64, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

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

  // VFX ARTIST: Anime Sweat Drop & Red Anger Vein
  if (emotion === 'sweat' || emotion === 'shocked') {
    const dropOffset = (frameTick % 45) * 0.35;
    const sx = -dir * 48;
    const sy = -22 + dropOffset;
    ctx.fillStyle = '#38bdf8';
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 11);
    ctx.quadraticCurveTo(sx + 8, sy + 2, sx, sy + 8);
    ctx.quadraticCurveTo(sx - 8, sy + 2, sx, sy - 11);
    ctx.fill();
    ctx.stroke();
  } else if (emotion === 'angry') {
    const vx = -dir * 42;
    const vy = -38;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(vx - 8, vy - 2); ctx.lineTo(vx - 2, vy - 2); ctx.lineTo(vx - 2, vy - 8);
    ctx.moveTo(vx + 8, vy + 2); ctx.lineTo(vx + 2, vy + 2); ctx.lineTo(vx + 2, vy + 8);
    ctx.stroke();
  }

  // Dynamic Eye Gaze: Looks directly toward the other character!
  const eyeY = -4;
  const pupilX = dir * 6.5;
  const pupilY = isScared ? 1.5 : (isAngry ? -1 : 0);
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
    const pr = emotion === 'shocked' ? 4.2 : (isAngry ? 5.5 : 6.5);
    ctx.beginPath(); ctx.arc(-20 + pupilX, eyeY + pupilY, pr, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(20 + pupilX, eyeY + pupilY, pr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(-22 + pupilX, eyeY + pupilY - 2.5, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(18 + pupilX, eyeY + pupilY - 2.5, 2.2, 0, Math.PI * 2); ctx.fill();
  }

  const browLift = isSpeaker ? -talkAmt * 3.5 : 0;
  ctx.strokeStyle = pal.hair;
  ctx.lineWidth = fem ? 3.8 : 4.8;
  ctx.lineCap = 'round';
  if (emotion === 'angry') {
    ctx.beginPath(); ctx.moveTo(-36, eyeY - 23 + browLift); ctx.lineTo(-7, eyeY - 12 + browLift); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(36, eyeY - 23 + browLift); ctx.lineTo(7, eyeY - 12 + browLift); ctx.stroke();
  } else if (emotion === 'crying' || emotion === 'sweat') {
    ctx.beginPath(); ctx.moveTo(-36, eyeY - 13); ctx.lineTo(-10, eyeY - 24); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(36, eyeY - 13); ctx.lineTo(10, eyeY - 24); ctx.stroke();
  } else if (emotion === 'smug') {
    ctx.beginPath(); ctx.moveTo(-34, eyeY - 22); ctx.lineTo(-8, eyeY - 18); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(8, eyeY - 23); ctx.lineTo(34, eyeY - 25); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(-34, eyeY - 19 + browLift); ctx.lineTo(-8, eyeY - 21 + browLift); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(8, eyeY - 21 + browLift); ctx.lineTo(34, eyeY - 19 + browLift); ctx.stroke();
  }

  // Expressive Human Mouth (Gritted teeth on angry, trembling wave on scared, smirk on smug)
  const mouthY = 30;
  ctx.strokeStyle = fem ? '#be123c' : '#334155';
  ctx.lineWidth = 3.2;
  if (isSpeaker && talkAmt > 0.08) {
    if (isAngry) {
      const h = 8 + talkAmt * 9;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.roundRect(-14, mouthY - h * 0.5, 28, h, 5); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-13, mouthY); ctx.lineTo(13, mouthY); ctx.stroke();
    } else if (talkAmt > 0.52) {
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
    if (isAngry) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.roundRect(-13, mouthY - 4, 26, 9, 4); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-12, mouthY); ctx.lineTo(12, mouthY); ctx.stroke();
    } else if (emotion === 'smug') {
      ctx.beginPath();
      ctx.moveTo(-12, mouthY + 2);
      ctx.quadraticCurveTo(2, mouthY + 5, 14, mouthY - 6);
      ctx.stroke();
    } else if (isScared) {
      ctx.beginPath();
      ctx.moveTo(-12, mouthY + 4);
      ctx.quadraticCurveTo(-4, mouthY - 2, 0, mouthY + 4);
      ctx.quadraticCurveTo(4, mouthY + 9, 12, mouthY + 3);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-11, mouthY); ctx.lineTo(11, mouthY);
      ctx.stroke();
    }
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

function getCharEmotionForScene(scene, role, isSpeaker) {
  if (scene.reactions && scene.reactions[role]) return scene.reactions[role];
  return isSpeaker ? (scene.emotion || 'normal') : (scene.otherEmotion || 'normal');
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

  const speaker = currentScene.char || 'hero';
  let castList = Array.isArray(currentScene.cast) && currentScene.cast.length >= 2
    ? currentScene.cast
    : [speaker, (currentScene.other && currentScene.other !== speaker) ? currentScene.other : (speaker === 'hero' ? 'bro' : 'hero')];
  if (!castList.includes(speaker)) castList = [speaker, ...castList.slice(0, 2)];

  const isMultiCast = castList.length >= 3;
  const shot = isMultiCast ? 'wide' : (currentScene.shot === 'in' ? 'in' : 'normal');
  const loc = currentScene.location || 'room';
  const lighting = currentScene.lighting || 'pastel';
  const isDarkBg = lighting === 'night' || lighting === 'dramatic' || loc === 'gym';

  ctx.save();
  const speakerEm = getCharEmotionForScene(currentScene, speaker, true);
  if (speakerEm === 'angry' && elapsed < 0.45) {
    const shake = (1 - elapsed / 0.45) * 5;
    ctx.translate(Math.sin(frameTick * 1.7) * shake, Math.cos(frameTick * 1.9) * shake * 0.6);
  }

  const baseScale = H < 800 ? 0.84 : 1.08;
  const activeProp = currentScene.prop || 'none';
  const speakerGesture = currentScene.gesture || 'explain';

  if (shot === 'wide') {
    const t = easeOutCubic(Math.min(1, elapsed / 0.45));
    const camZoom = 1 - t * 0.14;
    ctx.translate(W * 0.5, groundY);
    ctx.scale(camZoom, camZoom);
    ctx.translate(-W * 0.5, -groundY);

    drawPastelEnvironment(loc, lighting);

    const slots = [W * 0.19, W * 0.50, W * 0.81];
    const speakerIdx = castList.indexOf(speaker);

    castList.forEach((role, idx) => {
      if (role === speaker) return;
      const lookDir = idx < speakerIdx ? 1 : (idx > speakerIdx ? -1 : (idx === 0 ? 1 : -1));
      const roleEm = getCharEmotionForScene(currentScene, role, false);
      drawPastelCharacter(role, roleEm, 'idle', 0, slots[idx], groundY, baseScale * 0.90, false, lookDir, 'none', loc);
    });
    const spLook = speakerIdx === 2 ? -1 : 1;
    drawPastelCharacter(speaker, speakerEm, speakerGesture, mouthOpen, slots[speakerIdx], groundY, baseScale * 0.94, true, spLook, activeProp, loc);

  } else if (shot === 'in') {
    const heroIsSpeaker = speaker === 'hero';
    const leftX = W * 0.28, rightX = W * 0.72;
    const listener = castList.find(c => c !== speaker) || 'bro';
    const listenerEm = getCharEmotionForScene(currentScene, listener, false);
    const t = easeOutCubic(Math.min(1, elapsed / 0.45));
    const zoom = 1 + t * 0.16;
    const speakerStartX = heroIsSpeaker ? leftX : rightX;
    const speakerSoloX = heroIsSpeaker ? W * 0.44 : W * 0.56;
    const speakerX = speakerStartX + (speakerSoloX - speakerStartX) * t;

    ctx.translate(W * 0.5, groundY);
    ctx.scale(zoom, zoom);
    ctx.translate(-speakerX, -groundY);

    drawPastelEnvironment(loc, lighting);

    if (t < 0.95) {
      const offX = heroIsSpeaker ? rightX + t * (W * 0.55) : leftX - t * (W * 0.55);
      drawPastelCharacter(listener, listenerEm, 'idle', 0, offX, groundY, baseScale * 0.94, false, heroIsSpeaker ? -1 : 1, 'none', loc);
    }
    drawPastelCharacter(speaker, speakerEm, speakerGesture, mouthOpen, speakerX, groundY, baseScale, true, heroIsSpeaker ? 1 : -1, activeProp, loc);

  } else {
    const leftX = W * 0.28, rightX = W * 0.72;
    const listener = castList.find(c => c !== speaker) || 'bro';
    const listenerEm = getCharEmotionForScene(currentScene, listener, false);
    const speakerOnLeft = speaker === 'hero' || (listener !== 'hero' && castList.indexOf(speaker) === 0);

    if (elapsed > 2.2 && (listenerEm === 'shocked' || speakerEm === 'shocked')) {
      const rt = easeOutCubic(Math.min(1, (elapsed - 2.2) / 0.4));
      const rZoom = 1 + rt * 0.10;
      const listenerX = speakerOnLeft ? rightX : leftX;
      ctx.translate(W * 0.5, groundY);
      ctx.scale(rZoom, rZoom);
      ctx.translate(-(W * 0.5 + (listenerX - W * 0.5) * 0.35 * rt), -groundY);
    }

    drawPastelEnvironment(loc, lighting);
    if (speakerOnLeft) {
      drawPastelCharacter(listener, listenerEm, 'idle', 0, rightX, groundY, baseScale * 0.94, false, -1, 'none', loc);
      drawPastelCharacter(speaker, speakerEm, speakerGesture, mouthOpen, leftX, groundY, baseScale, true, 1, activeProp, loc);
    } else {
      drawPastelCharacter(listener, listenerEm, 'idle', 0, leftX, groundY, baseScale * 0.94, false, 1, 'none', loc);
      drawPastelCharacter(speaker, speakerEm, speakerGesture, mouthOpen, rightX, groundY, baseScale, true, -1, activeProp, loc);
    }
  }
  ctx.restore();

  drawCleanSubtitlesAndPunch(currentScene.text || '', speaker, currentScene.punch || '', isDarkBg);
  requestAnimationFrame(renderLoop);
}
renderLoop();

// =========================================================================
// AGENT 4: MULTI-ENGINE REALISTIC SOUND DIRECTOR (Sarvam + Expressive Neural + Gemini)
// =========================================================================
function pcmToWavBuffer(base64Pcm, sampleRate = 24000) {
  const binary = atob(base64Pcm), pcmLen = binary.length, wavBuffer = new ArrayBuffer(44 + pcmLen), view = new DataView(wavBuffer);
  const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF'); view.setUint32(4, 36 + pcmLen, true); view.setUint32(8, 'WAVE');
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

function prepareTextForTTS(rawText) {
  let hasCensor = false;
  let t = String(rawText || '')
    .replace(/\b(bsdk|mkc|bkl|mc|bc)\b/gi, () => { hasCensor = true; return '...'; })
    .replace(/\bfir\b/gi, 'phir')
    .replace(/\bkyu\b/gi, 'kyun')
    .replace(/\bnhi\b/gi, 'nahin')
    .replace(/\bpls\b/gi, 'please');
  return { ttsText: t, hasCensor };
}

function playCensorBeep() {
  if (!audioCtx || !destNode) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1000, now);
  gain.gain.setValueAtTime(0.32, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  gain.connect(destNode);
  osc.start(now);
  osc.stop(now + 0.25);
}

async function fetchBackendRealisticTTS(scene, provider = 'edge', isLast = false) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 11000);
  const sKey = sarvamKeyInput ? sarvamKeyInput.value.trim() : '';
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        text: prepareTextForTTS(scene.text).ttsText,
        char: scene.char,
        emotion: scene.emotion || 'normal',
        provider,
        sarvamKey: sKey
      })
    });
    if (!res.ok) throw new Error(`${provider.toUpperCase()} TTS HTTP ${res.status}`);
    const arr = await res.arrayBuffer();
    const decoded = await audioCtx.decodeAudioData(arr);
    return trimDeadSilence(decoded, isLast);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBackendTTSPerScene(scenes, provider = 'edge', partLabel = '') {
  const label = provider === 'sarvam' ? 'Sarvam AI Desi' : (provider === 'hf' ? 'HuggingFace Realistic AI' : '4-Voice Expressive Neural');
  const buffers = [];
  for (let i = 0; i < scenes.length; i++) {
    setStatus(`🎙️ [Sound Director] ${label} ${partLabel} (${i + 1}/${scenes.length})...`);
    try {
      buffers.push(await fetchBackendRealisticTTS(scenes[i], provider, i === scenes.length - 1));
    } catch {
      buffers.push(createSilentBuffer(Math.max(2.4, (scenes[i].text || '').split(' ').length * 0.36)));
    }
  }
  return buffers;
}

function mapCharToGeminiActor(char) {
  if (isFemaleChar(char)) return 'FemaleActor';
  if (char === 'bro') return 'BroActor';
  if (char === 'villain') return 'BossActor';
  return 'HeroActor';
}

async function fetchGeminiBatchWithMultiKeys(batch, keysList) {
  const dialogueLines = batch.map((sc) => {
    const actor = mapCharToGeminiActor(sc.char);
    const cue = sc.emotion === 'angry' ? '(shouting angrily) ' : (sc.emotion === 'sweat' || sc.emotion === 'shocked' ? '(panicking nervously) ' : (sc.emotion === 'smug' ? '(teasing sarcastically) ' : ''));
    return `${actor}: ${cue}${prepareTextForTTS(sc.text).ttsText}`;
  }).join('\n');
  let lastErr = 'Gemini TTS quota exceeded';

  for (let kIdx = 0; kIdx < keysList.length; kIdx++) {
    const apiKey = keysList[kIdx];
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 32000);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Perform EVERY single line with natural Indian Hindi/Hinglish acting emotion from start to finish without cutting off:\n' + dialogueLines }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              multiSpeakerVoiceConfig: {
                speakerVoiceConfigs: [
                  { speaker: 'HeroActor', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
                  { speaker: 'BroActor', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } } },
                  { speaker: 'BossActor', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } } },
                  { speaker: 'FemaleActor', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } } }
                ]
              }
            }
          }
        })
      });
      clearTimeout(timer);
      if (!res.ok) {
        lastErr = `Key #${kIdx + 1} HTTP ${res.status}`;
        continue;
      }
      const data = await res.json();
      const inlineData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (!inlineData?.data) { lastErr = 'No audio returned'; continue; }
      const batchBuf = await audioCtx.decodeAudioData(pcmToWavBuffer(inlineData.data, 24000));
      if (batchBuf.duration < batch.length * 1.1) { lastErr = 'Audio too short'; continue; }
      return splitAudioBufferByScenes(batchBuf, batch);
    } catch (err) {
      clearTimeout(timer);
      lastErr = err.message;
    }
  }
  throw new Error(lastErr);
}

async function runSoundArtistAgent(scenes, partLabel = '') {
  setCrewState('sound', 'active');
  const mode = voiceEngineSelect.value;
  const keysList = apiKeyInput.value.split(',').map(k => k.trim()).filter(Boolean);
  const sKey = sarvamKeyInput ? sarvamKeyInput.value.trim() : '';

  // Mode 1: Sarvam AI Explicit Mode (Strict check so it never silently switches to Gemini!)
  if (mode === 'sarvam') {
    if (!sKey) {
      throw new Error('Sarvam AI Key khali hai! Upar Sarvam AI Key box mein key dalo ya Auto / 4-Voice Neural chuno.');
    }
    const list = await fetchBackendTTSPerScene(scenes, 'sarvam', partLabel);
    setCrewState('sound', 'done');
    return list;
  }

  // Mode 2: 4-Voice Expressive Indian Neural (Unlimited Free)
  if (mode === 'edge') {
    const list = await fetchBackendTTSPerScene(scenes, 'edge', partLabel);
    setCrewState('sound', 'done');
    return list;
  }

  // Mode 3: Hugging Face Realistic AI (Free)
  if (mode === 'hf') {
    const list = await fetchBackendTTSPerScene(scenes, 'hf', partLabel);
    setCrewState('sound', 'done');
    return list;
  }

  // Mode 4: Auto (Uses Sarvam AI if key is entered, otherwise 4-Voice Expressive Neural)
  if (mode === 'auto') {
    const primaryProv = sKey ? 'sarvam' : 'edge';
    const buffers = [];
    for (let i = 0; i < scenes.length; i++) {
      setStatus(`🎙️ [Sound Director] ${sKey ? 'Sarvam Desi Voice' : '4-Voice Expressive Acting'} ${partLabel} (${i + 1}/${scenes.length})...`);
      try {
        buffers.push(await fetchBackendRealisticTTS(scenes[i], primaryProv, i === scenes.length - 1));
      } catch {
        try {
          buffers.push(await fetchBackendRealisticTTS(scenes[i], 'edge', i === scenes.length - 1));
        } catch {
          buffers.push(createSilentBuffer(Math.max(2.4, (scenes[i].text || '').split(' ').length * 0.36)));
        }
      }
    }
    setCrewState('sound', 'done');
    return buffers;
  }

  // Mode 5: Gemini Multi-Speaker TTS
  const chunkSize = 6;
  const allSlices = [];
  for (let start = 0; start < scenes.length; start += chunkSize) {
    const batch = scenes.slice(start, start + chunkSize);
    setStatus(`🎙️ [Sound Director] Gemini 4-Actor Studio ${partLabel} (${start + 1}-${start + batch.length}/${scenes.length})...`);
    try {
      const geminiSlices = await fetchGeminiBatchWithMultiKeys(batch, keysList);
      allSlices.push(...geminiSlices);
    } catch {
      for (let j = 0; j < batch.length; j++) {
        const globalIdx = start + j;
        setStatus(`🎙️ [Sound Director] Expressive Neural Fallback ${partLabel} (${globalIdx + 1}/${scenes.length})...`);
        try {
          allSlices.push(await fetchBackendRealisticTTS(batch[j], 'edge', globalIdx === scenes.length - 1));
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

function playAudioOnce(audioBuffer, char = "hero", emotion = "normal") {
  const safeBuf = (audioBuffer && audioBuffer.sampleRate) ? audioBuffer : createSilentBuffer(2.4);
  return new Promise((resolve) => {
    let resolved = false; duckBGM(true);
    const source = audioCtx.createBufferSource();
    source.buffer = safeBuf;

    let detune = 0;
    let rate = 1.02;
    if (char === 'bro') { detune = 110; rate = 1.04; }
    else if (char === 'gf') { detune = 140; rate = 1.05; }
    else if (char === 'sister') { detune = 200; rate = 1.07; }
    else if (char === 'villain') { detune = -200; rate = 0.96; }

    if (emotion === 'angry') { rate += 0.05; detune += 40; }
    else if (emotion === 'shocked') { rate += 0.04; detune += 65; }
    else if (emotion === 'crying' || emotion === 'sweat') { rate -= 0.03; detune -= 25; }

    source.detune.value = detune;
    source.playbackRate.value = rate;

    source.connect(analyser); analyser.connect(audioCtx.destination); analyser.connect(destNode);
    source.onended = () => { if (!resolved) { resolved = true; duckBGM(false); resolve(); } };
    source.start(0);
  });
}

// =========================================================================
// AGENT 5: EDITOR & FINAL QC SUPERVISOR
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
  const litScenes = runContinuityAndCostumeSupervisor(scenes, topicInput.value.trim());
  const partLabel = totalParts > 1 ? `[Part ${partNum}/${totalParts}]` : '';
  const currentHash = JSON.stringify(litScenes.map(s => `${s.char}:${s.emotion}:${s.text}`));
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
  startAdaptiveBGM();
  for (let i = 0; i < litScenes.length; i++) {
    currentScene = litScenes[i];
    sceneStartTime = performance.now();
    playSFX(litScenes[i].sfx);
    if (prepareTextForTTS(litScenes[i].text).hasCensor) setTimeout(playCensorBeep, 350);
    setStatus(`✂️ [Editor] Shooting Take ${i + 1}/${litScenes.length} [${litScenes[i].cast.length}P • ${litScenes[i].location.toUpperCase()}] ${partLabel}...`);
    await playAudioOnce(audioList[i], litScenes[i].char, litScenes[i].emotion);
  }
  stopAdaptiveBGM();

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
  const rawKeys = apiKeyInput.value.split(",").map(k => k.trim()).filter(Boolean);
  const key = rawKeys[0] || "";

  if (inputMode === "custom") {
    let customScenes;
    try {
      setCrewState("reset");
      setCrewState("writer", "active");
      customScenes = parseCustomUserScript(customScriptInput.value);
      setCrewState("writer", "done");
      setCrewState("director", "done");
    } catch (err) {
      return setStatus(`Script Error: ${err.message}`);
    }
    isPlayingSequence = true;
    initAudio();
    downloadLink.classList.add("hidden");
    try {
      const prepared = runContinuityAndCostumeSupervisor(customScenes, customScriptInput.value);
      scriptEditor.value = JSON.stringify(prepared, null, 2);
      if (prepared[0]) { currentScene = prepared[0]; sceneStartTime = performance.now(); }
      cachedScriptHash = "";
      renderMicControls();
      const { secs, sizeKB, ext } = await renderSinglePart(prepared, 1, 1, true, true);
      setStatus(`🎉 Custom Script Video Ready! (${secs}s • ${sizeKB} KB ${ext.toUpperCase()})`);
    } catch (err) {
      setStatus(`Production Error: ${err.message}`);
    } finally {
      isPlayingSequence = false;
    }
    return;
  }

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
      if (scenes[0]) { currentScene = scenes[0]; sceneStartTime = performance.now(); }
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
  if (inputMode === "custom") {
    try {
      setCrewState("reset");
      setCrewState("writer", "done");
      setCrewState("director", "done");
      const parsed = parseCustomUserScript(customScriptInput.value);
      const prepared = runContinuityAndCostumeSupervisor(parsed, customScriptInput.value);
      scriptEditor.value = JSON.stringify(prepared, null, 2);
      if (prepared[0]) { currentScene = prepared[0]; sceneStartTime = performance.now(); }
      cachedScriptHash = "";
      renderMicControls();
      setStatus(`✅ Custom Script Prepared! (${prepared.length} shots ready to shoot).`);
    } catch (err) { setStatus(`Script Error: ${err.message}`); }
    return;
  }
  const rawKeys = apiKeyInput.value.split(",").map(k => k.trim()).filter(Boolean);
  const key = rawKeys[0] || "";
  const topic = topicInput.value.trim();
  if (!key || !topic) return setStatus('Enter API Key & Topic first!');
  const { targetLines } = parseEpisodeConfig();
  try {
    const scenes = await runPreProductionCrew(key, topic, 1, 1, '', targetLines);
    scriptEditor.value = JSON.stringify(scenes, null, 2);
    if (scenes[0]) { currentScene = scenes[0]; sceneStartTime = performance.now(); }
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
