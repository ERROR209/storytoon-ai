const canvas = document.getElementById('stageCanvas');
const ctx = canvas.getContext('2d');
const apiKeyInput = document.getElementById('apiKeyInput');
const topicInput = document.getElementById('topicInput');
const toneSelect = document.getElementById('toneSelect');
const lengthSelect = document.getElementById('lengthSelect');
const scriptEditor = document.getElementById('scriptEditor');
const statusBar = document.getElementById('statusBar');
const downloadLink = document.getElementById('downloadLink');

apiKeyInput.value = localStorage.getItem('gemini_api_key') || '';
apiKeyInput.addEventListener('change', () => {
  localStorage.setItem('gemini_api_key', apiKeyInput.value.trim());
});

const DEMO_SCRIPT = [
  { char: "hero", other: "bro", emotion: "smug", otherEmotion: "normal", cutaway: "insta", bg: "white", zoom: "normal", sfx: "none", text: "Bhai kal Rahul ne Insta par ek ladki ki photo like kar di." },
  { char: "bro", other: "hero", emotion: "shocked", otherEmotion: "smug", cutaway: "phone", bg: "white", zoom: "in", sfx: "gasp", text: "Bas ek heart react kiya tha yaar, itna bada crime hai kya?" },
  { char: "hero", other: "bro", emotion: "shadow", otherEmotion: "shocked", cutaway: "none", bg: "dramatic", zoom: "in", sfx: "boom", text: "Crime nahi bhai, tune seedha maut ko DM bhej diya hai!" },
  { char: "bro", other: "hero", emotion: "crying", otherEmotion: "smug", cutaway: "money", bg: "white", zoom: "normal", sfx: "none", text: "Ab maafi maangne ke liye iPhone aur mehenga bag maang rahi hai!" },
  { char: "mom", other: "bro", emotion: "angry", otherEmotion: "shocked", cutaway: "chappal", bg: "red", zoom: "shake", sfx: "slap", text: "Ghar mein chappal aur tawa dono taiyar hain, aaja tu!" },
  { char: "npc", other: "bro", emotion: "smug", otherEmotion: "dead", cutaway: "none", bg: "dramatic", zoom: "normal", sfx: "boom", text: "Rest in peace Rahul. Agle janam mein single rehna!" }
];
scriptEditor.value = JSON.stringify(DEMO_SCRIPT, null, 2);

function setStatus(msg) { statusBar.textContent = msg; }

// Voice Cache (Instant Replay without re-fetching API!)
let cachedScriptHash = '';
let cachedAudioSlices = [];
const customMicBuffers = {};

// Mic Voiceover Panel
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
      if (recordingSceneIdx === idx && activeMediaRecorder) {
        activeMediaRecorder.stop();
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const chunks = [];
        activeMediaRecorder = new MediaRecorder(stream);
        recordingSceneIdx = idx;
        renderMicControls();
        setStatus(`🎙️ Recording Scene ${idx + 1}... Bolo aur Stop dabao!`);

        activeMediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
        activeMediaRecorder.onstop = async () => {
          stream.getTracks().forEach(t => t.stop());
          const blob = new Blob(chunks, { type: 'audio/webm' });
          const arr = await blob.arrayBuffer();
          customMicBuffers[idx] = await audioCtx.decodeAudioData(arr);
          recordingSceneIdx = -1;
          renderMicControls();
          setStatus(`✅ Scene ${idx + 1} voice saved!`);
        };
        activeMediaRecorder.start();
      } catch (err) {
        setStatus('Mic error: ' + err.message);
      }
    };

    row.appendChild(label);
    row.appendChild(btn);
    micPanel.appendChild(row);
  });
}
scriptEditor.addEventListener('change', () => {
  cachedScriptHash = '';
  renderMicControls();
});

document.getElementById('loadDemoBtn').onclick = () => {
  scriptEditor.value = JSON.stringify(DEMO_SCRIPT, null, 2);
  cachedScriptHash = '';
  renderMicControls();
  setStatus('Demo script loaded!');
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
    bgmGain.gain.value = 0.11;
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
    noteGain.gain.linearRampToValueAtTime(0.28, now + 0.02);
    noteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(noteGain);
    noteGain.connect(bgmGain);
    osc.start(now);
    osc.stop(now + 0.23);
  }, 270);
}

function stopComedyBGM() {
  if (bgmInterval) { clearInterval(bgmInterval); bgmInterval = null; }
}

function duckBGM(speaking) {
  if (!bgmGain || !audioCtx) return;
  bgmGain.gain.setTargetAtTime(speaking ? 0.035 : 0.13, audioCtx.currentTime, 0.06);
}

function playSFX(type) {
  if (!type || type === 'none') return;
  initAudio();
  const now = audioCtx.currentTime;

  if (type === 'boom') {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(26, now + 0.5);
    gain.gain.setValueAtTime(0.95, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc.connect(gain); gain.connect(audioCtx.destination); gain.connect(destNode);
    osc.start(now); osc.stop(now + 0.55);
  } else if (type === 'slap') {
    const bufferSize = audioCtx.sampleRate * 0.15;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
    const whiteNoise = audioCtx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.9, now);
    whiteNoise.connect(gain); gain.connect(audioCtx.destination); gain.connect(destNode);
    whiteNoise.start(now);
  } else if (type === 'gasp') {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(750, now + 0.16);
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain); gain.connect(audioCtx.destination); gain.connect(destNode);
    osc.start(now); osc.stop(now + 0.18);
  }
}

// Fast Gemini Script Writer (Hits fastest flash models directly)
document.getElementById('generateScriptBtn').onclick = async () => {
  const key = apiKeyInput.value.trim();
  const topic = topicInput.value.trim();
  if (!key) return setStatus('Enter your Google AI Studio API Key first!');
  if (!topic) return setStatus('Enter a video topic!');

  const prompt = `Viral Indian storytime animator ("NOT YOUR TYPE" style). Write a ${lengthSelect.value}-line funny Hinglish script on: "${topic}". Tone: ${toneSelect.value}.
Characters: "hero", "bro", "mom", "npc".
Emotions: "normal", "shocked", "smug", "angry", "crying", "dead", "shadow".
Cutaways: "none", "insta", "phone", "money", "chappal", "exam".
Backgrounds: "white", "dramatic", "red".
Zooms: "normal", "in", "shake".
SFX: "none", "boom", "slap", "gasp".
Return ONLY JSON array: [{"char":"hero","other":"bro","emotion":"smug","otherEmotion":"shocked","cutaway":"insta","bg":"white","zoom":"normal","sfx":"none","text":"7-12 words Hinglish"}]. Dead chars never speak.`;

  const fastModels = ['gemini-3.8-flash', 'gemini-3.8-flash-lite'];
  let lastErr = 'API busy';

  for (const model of fastModels) {
    try {
      setStatus(`⚡ Fast-writing script (${model})...`);
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.9 }
        })
      });

      const data = await res.json();
      if (!res.ok) { lastErr = data.error?.message || `HTTP ${res.status}`; continue; }

      let raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const startIdx = raw.indexOf('[');
      const endIdx = raw.lastIndexOf(']');
      if (startIdx === -1 || endIdx === -1) { lastErr = 'Invalid AI format'; continue; }

      const parsed = JSON.parse(raw.slice(startIdx, endIdx + 1));
      scriptEditor.value = JSON.stringify(parsed, null, 2);
      cachedScriptHash = '';
      Object.keys(customMicBuffers).forEach(k => delete customMicBuffers[k]);
      renderMicControls();
      setStatus(`✅ Script ready (${parsed.length} scenes)! Tap "2. Play & Save Video".`);
      return;
    } catch (err) {
      lastErr = err.message;
    }
  }
  setStatus(`Error: ${lastErr}`);
};

// Stage & Full-Body Cartoon Character Renderer
let currentScene = DEMO_SCRIPT[0];
let mouthOpen = 0;
let frameTick = 0;
let scenePop = 1;
let blinkTimer = 0;

function drawBackground(bg) {
  if (bg === 'red') {
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 8;
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2 + frameTick * 0.04;
      ctx.beginPath();
      ctx.moveTo(360 + Math.cos(angle) * 180, 620 + Math.sin(angle) * 180);
      ctx.lineTo(360 + Math.cos(angle) * 900, 620 + Math.sin(angle) * 900);
      ctx.stroke();
    }
  } else if (bg === 'dramatic') {
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const grad = ctx.createRadialGradient(360, 620, 40, 360, 620, 420);
    grad.addColorStop(0, '#1e293b');
    grad.addColorStop(1, '#090d16');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    for (let y = 160; y < 980; y += 48) {
      ctx.beginPath(); ctx.moveTo(36, y); ctx.lineTo(684, y); ctx.stroke();
    }
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 4;
    ctx.strokeRect(22, 22, canvas.width - 44, canvas.height - 44);
  }

  // Stage Ground Floor Line (So full-body characters stand solidly on ground!)
  const floorY = 985;
  ctx.fillStyle = bg === 'dramatic' ? '#1e293b' : bg === 'red' ? '#991b1b' : '#e2e8f0';
  ctx.fillRect(24, floorY, canvas.width - 48, 120);
  ctx.strokeStyle = bg === 'dramatic' || bg === 'red' ? '#ffffff' : '#0f172a';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(24, floorY);
  ctx.lineTo(canvas.width - 24, floorY);
  ctx.stroke();
}

function drawCutaway(type) {
  if (!type || type === 'none') return;
  const bob = Math.sin(frameTick * 0.14) * 8;
  ctx.save();
  ctx.translate(495, 250 + bob);
  ctx.rotate(0.05);

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.roundRect(-130, -95, 260, 190, 18);
  ctx.fill();
  ctx.stroke();

  if (type === 'insta') {
    ctx.fillStyle = '#ec4899';
    ctx.fillRect(-110, -78, 220, 105);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, -25, 24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 38px sans-serif';
    ctx.fillText('❤️ 1 LIKE', -90, 72);
  } else if (type === 'phone') {
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-50, -78, 100, 155);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(-40, -64, 80, 118);
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('99+ MISSED', -80, 88);
  } else if (type === 'money') {
    ctx.fillStyle = '#10b981';
    ctx.fillRect(-90, -50, 180, 78);
    ctx.strokeRect(-90, -50, 180, 78);
    ctx.fillStyle = '#064e3b';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText('₹₹₹', -42, 2);
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('KHARCHA ALERT!', -100, 70);
  } else if (type === 'chappal') {
    ctx.save();
    ctx.rotate(Math.sin(frameTick * 0.4) * 0.45);
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.ellipse(0, -10, 34, 70, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#dc2626';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('FLYING CHAPPAL!', -106, 80);
  } else if (type === 'exam') {
    ctx.fillStyle = '#dc2626';
    ctx.font = 'bold 100px sans-serif';
    ctx.fillText('F-', -42, 22);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('0 / 100 MARKS', -78, 72);
  }
  ctx.restore();
}

function drawShoe(x, y, flip = false) {
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(-16, 0);
  ctx.lineTo(28, 0);
  ctx.quadraticCurveTo(42, 0, 42, 18);
  ctx.lineTo(-18, 18);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Shoe sole stripe
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(-16, 12, 56, 5);
  ctx.restore();
}

function drawHand(x, y, radius = 19) {
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

// Full-Body Expressive Cartoon Character (Head + Torso/Hoodie + Legs + Sneakers + Dynamic Poses)
function drawFullBodyCharacter(char, emotion, talkAmt, footX, groundY, scaleVal, isSpeaker) {
  const isDarkBg = currentScene.bg === 'dramatic' || currentScene.bg === 'red';
  const ink = isDarkBg ? '#ffffff' : '#0f172a';

  // Ground Shadow
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(footX, groundY + 6, 85 * scaleVal, 16 * scaleVal, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Dynamic Vertical Jump/Bounce
  let jumpY = 0;
  if (emotion === 'shocked' && isSpeaker) {
    jumpY = Math.abs(Math.sin(frameTick * 0.25)) * 32;
  } else if (isSpeaker) {
    jumpY = talkAmt * 14;
  } else {
    jumpY = Math.abs(Math.sin(frameTick * 0.06)) * 3;
  }

  ctx.save();
  ctx.translate(footX, groundY - jumpY);
  ctx.scale(scaleVal * (isSpeaker ? scenePop : 1), scaleVal * (isSpeaker ? (2 - scenePop) : 1));
  if (!isSpeaker) ctx.globalAlpha = 0.92;

  // Special "DEAD" Pose: Lying flat on the ground!
  if (emotion === 'dead') {
    ctx.translate(0, -45);
    ctx.rotate(Math.PI / 2);
  }

  const bodyTilt = isSpeaker ? talkAmt * Math.sin(frameTick * 0.26) * 0.05 : 0;
  ctx.rotate(bodyTilt);

  ctx.strokeStyle = ink;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 1. LEGS & SNEAKERS (Full-Body!)
  ctx.lineWidth = 11;
  ctx.strokeStyle = '#1e293b';
  if (emotion === 'crying') {
    // Kneeling / Sitting pose on floor
    ctx.beginPath(); ctx.moveTo(-28, -135); ctx.lineTo(-55, -55); ctx.lineTo(-20, -15); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(28, -135); ctx.lineTo(55, -55); ctx.lineTo(20, -15); ctx.stroke();
    drawShoe(-20, -18, true);
    drawShoe(20, -18, false);
  } else {
    // Standing / Bouncing Cartoon Legs
    const kneeBend = isSpeaker ? talkAmt * 6 : 0;
    ctx.beginPath(); ctx.moveTo(-26, -140 + kneeBend); ctx.lineTo(-32, -18); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(26, -140 + kneeBend); ctx.lineTo(32, -18); ctx.stroke();
    drawShoe(-34, -18, !isSpeaker);
    drawShoe(34, -18, !isSpeaker);
  }

  // 2. TORSO / HOODIE / DRESS
  ctx.strokeStyle = ink;
  ctx.lineWidth = 9;
  if (char === 'mom') {
    // Saree / Long Kurta silhouette
    ctx.fillStyle = '#ec4899';
    ctx.beginPath();
    ctx.moveTo(-45, -270);
    ctx.lineTo(45, -270);
    ctx.lineTo(68, -95);
    ctx.lineTo(-68, -95);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Saree pallu sash
    ctx.strokeStyle = '#fbcfe8';
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(-42, -265); ctx.lineTo(48, -145); ctx.stroke();
    ctx.strokeStyle = ink;
  } else {
    // Rounded Cartoon Hoodie Torso
    ctx.fillStyle = char === 'hero' ? '#3b82f6' : char === 'bro' ? '#f59e0b' : '#475569';
    ctx.beginPath();
    ctx.roundRect(-56, -275, 112, 145, 34);
    ctx.fill(); ctx.stroke();

    // Hoodie pocket & strings
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-20, -255); ctx.lineTo(-22, -210); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(20, -255); ctx.lineTo(22, -210); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-34, -180, 68, 36, 10); ctx.stroke();
  }

  // 3. EXPRESSIVE ARMS & HANDS
  ctx.lineWidth = 9;
  ctx.strokeStyle = ink;
  if (emotion === 'shocked') {
    // Both hands up near head in panic!
    ctx.beginPath(); ctx.moveTo(-54, -250); ctx.quadraticCurveTo(-115, -280, -105, -365); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(54, -250); ctx.quadraticCurveTo(115, -280, 105, -365); ctx.stroke();
    drawHand(-105, -368, 18);
    drawHand(105, -368, 18);
  } else if (emotion === 'angry') {
    // Pointing / shaking fist forward!
    const fistShake = Math.sin(frameTick * 0.5) * 14;
    ctx.beginPath(); ctx.moveTo(-54, -245); ctx.lineTo(-85, -185); ctx.stroke();
    drawHand(-85, -185, 17);
    ctx.beginPath(); ctx.moveTo(54, -250); ctx.quadraticCurveTo(115, -260, 140, -295 + fistShake); ctx.stroke();
    drawHand(140, -295 + fistShake, 20);
  } else if (emotion === 'crying') {
    // Hands rubbing eyes
    ctx.beginPath(); ctx.moveTo(-52, -245); ctx.lineTo(-65, -335); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(52, -245); ctx.lineTo(65, -335); ctx.stroke();
    drawHand(-65, -338, 17);
    drawHand(65, -338, 17);
  } else if (emotion === 'smug') {
    // Cool pose: one hand on hip, one hand gesturing
    ctx.beginPath(); ctx.moveTo(-54, -250); ctx.lineTo(-88, -205); ctx.lineTo(-52, -165); ctx.stroke();
    const wave = isSpeaker ? talkAmt * 25 : 0;
    ctx.beginPath(); ctx.moveTo(54, -250); ctx.quadraticCurveTo(105, -230, 115, -280 - wave); ctx.stroke();
    drawHand(115, -280 - wave, 18);
  } else {
    // Natural talking hand gestures
    const gestureL = isSpeaker ? talkAmt * 35 : 0;
    const gestureR = isSpeaker ? talkAmt * 25 : 0;
    ctx.beginPath(); ctx.moveTo(-54, -250); ctx.quadraticCurveTo(-95, -210, -90, -175 - gestureL); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(54, -250); ctx.quadraticCurveTo(95, -210, 90, -175 - gestureR); ctx.stroke();
    drawHand(-90, -175 - gestureL, 17);
    drawHand(90, -175 - gestureR, 17);
  }

  // 4. OVERSIZED CARTOON HEAD (Classic Storytime Proportion)
  const headY = -385;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(0, headY, 112, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Anime Dark Shadow Overlay on Upper Face
  if (emotion === 'shadow') {
    ctx.save();
    ctx.beginPath(); ctx.arc(0, headY, 108, Math.PI, 0); ctx.clip();
    ctx.fillStyle = '#1e1b4b';
    ctx.fillRect(-120, headY - 120, 240, 125);
    ctx.restore();
  }

  // Hair & Accessories
  ctx.fillStyle = '#0f172a';
  if (char === 'hero') {
    ctx.beginPath();
    ctx.moveTo(-104, headY - 36); ctx.lineTo(-84, headY - 132); ctx.lineTo(-34, headY - 100);
    ctx.lineTo(0, headY - 152); ctx.lineTo(38, headY - 100); ctx.lineTo(88, headY - 128); ctx.lineTo(104, headY - 36);
    ctx.quadraticCurveTo(0, headY - 76, -104, headY - 36);
    ctx.fill();
  } else if (char === 'bro') {
    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.arc(0, headY - 38, 108, Math.PI, 0); ctx.fill(); ctx.stroke();
    ctx.fillRect(-152, headY - 46, 74, 18); ctx.strokeRect(-152, headY - 46, 74, 18);
  } else if (char === 'mom') {
    ctx.beginPath(); ctx.arc(0, headY - 132, 40, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, headY - 38, 110, Math.PI, 0); ctx.fill();
  } else if (char === 'npc') {
    ctx.fillStyle = '#000';
    ctx.fillRect(-80, headY - 24, 66, 32); ctx.fillRect(14, headY - 24, 66, 32);
    ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-14, headY - 10); ctx.lineTo(14, headY - 10); ctx.stroke();
  }

  // Eyes
  const isBlinking = (blinkTimer + (isSpeaker ? 0 : 45)) % 150 > 143;
  ctx.strokeStyle = '#0f172a'; ctx.fillStyle = '#0f172a';
  if (char !== 'npc') {
    if (emotion === 'shadow') {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(-38, headY - 6, 15, 7, 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(38, headY - 6, 15, 7, -0.2, 0, Math.PI * 2); ctx.fill();
    } else if (isBlinking && emotion === 'normal') {
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(-54, headY - 6); ctx.lineTo(-24, headY - 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(24, headY - 6); ctx.lineTo(54, headY - 6); ctx.stroke();
    } else if (emotion === 'shocked') {
      ctx.fillStyle = '#fff'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(-40, headY - 8, 24, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(40, headY - 8, 24, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath(); ctx.arc(-40, headY - 8, 7, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(40, headY - 8, 7, 0, Math.PI * 2); ctx.fill();
    } else if (emotion === 'angry') {
      ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(-68, headY - 30); ctx.lineTo(-16, headY - 10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(68, headY - 30); ctx.lineTo(16, headY - 10); ctx.stroke();
      ctx.fillStyle = '#ef4444';
      ctx.beginPath(); ctx.arc(-38, headY, 11, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(38, headY, 11, 0, Math.PI * 2); ctx.fill();
    } else if (emotion === 'crying') {
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(-58, headY - 20); ctx.lineTo(-28, headY - 6); ctx.lineTo(-58, headY + 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(58, headY - 20); ctx.lineTo(28, headY - 6); ctx.lineTo(58, headY + 8); ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(-56, headY + 10, 16, 72); ctx.fillRect(40, headY + 10, 16, 72);
    } else if (emotion === 'dead') {
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(-54, headY - 20); ctx.lineTo(-26, headY + 8); ctx.moveTo(-26, headY - 20); ctx.lineTo(-54, headY + 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(26, headY - 20); ctx.lineTo(54, headY + 8); ctx.moveTo(54, headY - 20); ctx.lineTo(26, headY + 8); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(-38, headY - 6, 10, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(38, headY - 6, 10, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 6;
      if (emotion === 'smug') {
        ctx.beginPath(); ctx.moveTo(-62, headY - 28); ctx.lineTo(-20, headY - 20); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(20, headY - 34); ctx.lineTo(62, headY - 22); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.moveTo(-58, headY - 26); ctx.lineTo(-20, headY - 26); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(20, headY - 26); ctx.lineTo(58, headY - 26); ctx.stroke();
      }
    }
  }

  if (char === 'mom') {
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 5;
    ctx.strokeRect(-70, headY - 28, 56, 40); ctx.strokeRect(14, headY - 28, 56, 40);
    ctx.beginPath(); ctx.moveTo(-14, headY - 8); ctx.lineTo(14, headY - 8); ctx.stroke();
  }

  // Multi-Shape Lip-Sync Mouth
  ctx.fillStyle = '#991b1b'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 6;
  const mouthY = headY + 54;
  if (isSpeaker && talkAmt > 0.08) {
    const shapeCycle = Math.floor(frameTick / 4) % 3;
    if (talkAmt > 0.55 && shapeCycle === 0) {
      ctx.beginPath(); ctx.arc(0, mouthY - 8, 28, 0, Math.PI, false); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-20, mouthY - 8, 40, 8);
    } else if (shapeCycle === 1) {
      ctx.beginPath(); ctx.ellipse(0, mouthY, 22, Math.max(8, talkAmt * 28), 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.ellipse(0, mouthY, 28, 9, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
  } else {
    ctx.beginPath();
    if (emotion === 'smug' || emotion === 'shadow') {
      ctx.arc(0, mouthY - 8, 26, 0.15 * Math.PI, 0.85 * Math.PI);
    } else if (emotion === 'angry' || emotion === 'crying') {
      ctx.arc(0, mouthY + 12, 24, 1.15 * Math.PI, 1.85 * Math.PI);
    } else {
      ctx.moveTo(-22, mouthY); ctx.lineTo(22, mouthY);
    }
    ctx.stroke();
  }

  ctx.restore();
}

function drawCaptions(text, char) {
  if (!text) return;
  const names = { hero: 'ME', bro: 'BRO', mom: 'MUMMY', npc: 'RANDOM GUY' };
  const colors = { hero: '#3b82f6', bro: '#f59e0b', mom: '#ec4899', npc: '#ef4444' };

  ctx.fillStyle = colors[char] || '#ef4444';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(45, 58, 195, 48, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 26px sans-serif';
  ctx.fillText(names[char] || 'ME', 68, 91);

  ctx.font = '900 38px sans-serif';
  ctx.textAlign = 'center';
  const words = text.split(' ');
  const lines = [];
  let line = '';

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    if (ctx.measureText(testLine).width > 620 && n > 0) {
      lines.push(line.trim());
      line = words[n] + ' ';
    } else {
      line = testLine;
    }
  }
  lines.push(line.trim());

  let startY = 1155 - (lines.length - 1) * 46;
  for (let i = 0; i < lines.length; i++) {
    const y = startY + i * 48;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 10;
    ctx.lineJoin = 'round';
    ctx.strokeText(lines[i], 360, y);

    ctx.fillStyle = i === lines.length - 1 ? '#facc15' : '#ffffff';
    ctx.fillText(lines[i], 360, y);
  }
  ctx.textAlign = 'left';
}

function renderLoop() {
  frameTick++;
  blinkTimer++;
  scenePop += (1 - scenePop) * 0.28;

  if (analyser && dataArray) {
    analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < 32; i++) sum += dataArray[i];
    const avg = sum / 32;
    mouthOpen = Math.min(1, Math.max(0, (avg - 10) / 65));
  } else {
    mouthOpen = 0;
  }

  ctx.save();
  if (currentScene.zoom === 'in') {
    ctx.translate(360, 720);
    ctx.scale(1.18, 1.18);
    ctx.translate(-360, -720);
  } else if (currentScene.zoom === 'shake') {
    ctx.translate((Math.random() - 0.5) * 24, (Math.random() - 0.5) * 24);
  }

  drawBackground(currentScene.bg || 'white');

  const speaker = currentScene.char || 'hero';
  const listener = currentScene.other || (speaker === 'hero' ? 'bro' : 'hero');
  const groundY = 985;

  if (currentScene.zoom !== 'in') {
    drawFullBodyCharacter(listener, currentScene.otherEmotion || 'normal', 0, 520, groundY, 0.86, false);
    drawFullBodyCharacter(speaker, currentScene.emotion || 'normal', mouthOpen, 225, groundY, 1.0, true);
  } else {
    drawFullBodyCharacter(speaker, currentScene.emotion || 'normal', mouthOpen, 350, groundY, 1.08, true);
  }

  drawCutaway(currentScene.cutaway);
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

  const writeStr = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + pcmLen, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, pcmLen, true);

  const bytes = new Uint8Array(wavBuffer, 44);
  for (let i = 0; i < pcmLen; i++) bytes[i] = binary.charCodeAt(i);
  return wavBuffer;
}

// Fast Single-Call 2-Speaker Gemini Human Acting Engine
async function fetchAllHumanVoicesInOneCall(scenes) {
  const key = apiKeyInput.value.trim();
  if (!key) throw new Error('Gemini API Key needed for real human voice acting!');

  const dialogueLines = scenes.map((sc) => {
    const spk = sc.char === 'mom' ? 'FemaleVoice' : 'MaleVoice';
    return `${spk}: ${sc.text}`;
  }).join('\n');

  const promptText = `Act out this funny Indian Hinglish conversation fast with expressive emotions and brief pauses:\n${dialogueLines}`;

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
              { speaker: 'MaleVoice',   voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
              { speaker: 'FemaleVoice', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
            ]
          }
        }
      }
    })
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Voice HTTP ${res.status}`);
  }

  const data = await res.json();
  const inlineData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inlineData?.data) throw new Error('No audio returned from Gemini');

  const wavBuf = pcmToWavBuffer(inlineData.data, 24000);
  return await audioCtx.decodeAudioData(wavBuf);
}

function splitAudioBufferByScenes(fullBuffer, scenes) {
  const sampleRate = fullBuffer.sampleRate;
  const channelData = fullBuffer.getChannelData(0);
  const totalSamples = channelData.length;

  const weights = scenes.map(s => Math.max(4, (s.text || '').length));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  const slices = [];
  let cursorSample = 0;

  for (let i = 0; i < scenes.length; i++) {
    if (i === scenes.length - 1) {
      slices.push(extractSubBuffer(fullBuffer, cursorSample, totalSamples));
      break;
    }

    const ratio = weights[i] / totalWeight;
    const idealEnd = Math.min(totalSamples - 1, cursorSample + Math.floor(ratio * totalSamples));

    const searchRadius = Math.floor(sampleRate * 0.65);
    const minSearch = Math.max(cursorSample + Math.floor(sampleRate * 0.35), idealEnd - searchRadius);
    const maxSearch = Math.min(totalSamples - Math.floor(sampleRate * 0.35), idealEnd + searchRadius);

    let bestSample = idealEnd;
    let lowestEnergy = Infinity;
    const windowSize = Math.floor(sampleRate * 0.04);

    for (let pos = minSearch; pos < maxSearch; pos += windowSize) {
      let energy = 0;
      for (let j = 0; j < windowSize && pos + j < totalSamples; j++) {
        energy += Math.abs(channelData[pos + j]);
      }
      if (energy < lowestEnergy) {
        lowestEnergy = energy;
        bestSample = pos + Math.floor(windowSize / 2);
      }
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
    const srcData = srcBuffer.getChannelData(ch);
    const dstData = sub.getChannelData(ch);
    for (let i = 0; i < len; i++) dstData[i] = srcData[startSample + i] || 0;
  }
  return sub;
}

function playAudioOnce(audioBuffer, char = "hero") {
  return new Promise((resolve) => {
    let resolved = false;
    duckBGM(true);

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    if (char === 'bro') { source.detune.value = 140; source.playbackRate.value = 1.04; }
    else if (char === 'npc') { source.detune.value = -180; source.playbackRate.value = 0.98; }

    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    analyser.connect(destNode);

    source.onended = () => {
      if (!resolved) {
        resolved = true;
        duckBGM(false);
        setTimeout(resolve, 35);
      }
    };

    source.start(0);
  });
}

async function runAnimation(recordVideo = false) {
  if (isPlayingSequence) return;
  let scenes;
  try {
    scenes = JSON.parse(scriptEditor.value);
    if (!Array.isArray(scenes) || scenes.length === 0) throw new Error('Empty script');
  } catch (e) {
    return setStatus('Script Error: Click "Load Demo" or generate valid JSON first!');
  }

  isPlayingSequence = true;
  initAudio();
  downloadLink.classList.add('hidden');

  const currentHash = JSON.stringify(scenes.map(s => `${s.char}:${s.text}`));
  let audioList = [];
  const allRecordedByMic = scenes.every((_, idx) => !!customMicBuffers[idx]);

  if (allRecordedByMic) {
    audioList = scenes.map((_, idx) => customMicBuffers[idx]);
  } else if (cachedScriptHash === currentHash && cachedAudioSlices.length === scenes.length) {
    setStatus('⚡ Playing from instant cache...');
    audioList = scenes.map((_, idx) => customMicBuffers[idx] || cachedAudioSlices[idx]);
  } else {
    setStatus('⚡ Generating ALL human voices in 1 fast call...');
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

  let recorder = null;
  const recordedChunks = [];
  if (recordVideo) {
    try {
      const canvasStream = canvas.captureStream(30);
      const audioTracks = destNode ? destNode.stream.getAudioTracks() : [];
      const combinedStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);

      let options = {};
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) options = { mimeType: 'video/webm;codecs=vp8,opus' };
      else if (MediaRecorder.isTypeSupported('video/webm')) options = { mimeType: 'video/webm' };

      recorder = new MediaRecorder(combinedStream, options);
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) recordedChunks.push(e.data); };
      recorder.onstop = () => {
        const videoBlob = new Blob(recordedChunks, { type: 'video/webm' });
        downloadLink.href = URL.createObjectURL(videoBlob);
        downloadLink.classList.remove('hidden');
        setStatus('✅ Done! Tap "⬇ Save Video" below.');
      };
      recorder.start(200);
    } catch (recErr) {
      setStatus('Recording note: ' + recErr.message);
    }
  }

  startComedyBGM();

  for (let i = 0; i < scenes.length; i++) {
    currentScene = scenes[i];
    scenePop = 0.78;
    playSFX(scenes[i].sfx);
    setStatus(`▶ Playing Scene ${i + 1}/${scenes.length}...`);
    await playAudioOnce(audioList[i], scenes[i].char);
  }

  stopComedyBGM();
  isPlayingSequence = false;
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  else setStatus('Playback finished!');
}

document.getElementById('previewOnlyBtn').onclick = () => runAnimation(false);
document.getElementById('playRecordBtn').onclick = () => runAnimation(true);
renderMicControls();
