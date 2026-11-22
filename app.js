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

document.getElementById('loadDemoBtn').onclick = () => {
  scriptEditor.value = JSON.stringify(DEMO_SCRIPT, null, 2);
  renderMicControls();
  setStatus('Demo script loaded!');
};

function setStatus(msg) { statusBar.textContent = msg; }

// Custom Mic Recordings Store (Scene Index -> AudioBuffer)
const customMicBuffers = {};

// Inject Mic Voiceover Panel dynamically below Script Editor
const scriptCard = document.querySelector('.script-card');
const micPanel = document.createElement('div');
micPanel.id = 'micPanel';
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
    btn.textContent = recordingSceneIdx === idx ? '⏹ Stop' : (customMicBuffers[idx] ? '✅ Re-record' : '🎙️ Rec');

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
          setStatus(`✅ Scene ${idx + 1} ki tumhari real voice save ho gayi!`);
        };
        activeMediaRecorder.start();
      } catch (err) {
        setStatus('Mic permission denied: ' + err.message);
      }
    };

    row.appendChild(label);
    row.appendChild(btn);
    micPanel.appendChild(row);
  });
}
scriptEditor.addEventListener('change', renderMicControls);

// Audio Engine
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

// Gemini Script Writer
document.getElementById('generateScriptBtn').onclick = async () => {
  const key = apiKeyInput.value.trim();
  const topic = topicInput.value.trim();
  if (!key) return setStatus('Please enter your Google AI Studio API Key first!');
  if (!topic) return setStatus('Please enter a video topic!');

  const prompt = `You are a viral Indian storytime animator like "NOT YOUR TYPE".
Write a ${lengthSelect.value}-line fast-paced funny Hinglish story on topic: "${topic}".
Tone: ${toneSelect.value}.
Characters: "hero" (Main guy), "bro" (Best friend), "mom" (Strict Indian mom/teacher), "npc" (Savage bystander).
Emotions: "normal", "shocked", "smug", "angry", "crying", "dead", "shadow"
Cutaways: "none", "insta", "phone", "money", "chappal", "exam"
Backgrounds: "white", "dramatic", "red"
Zooms: "normal", "in", "shake"
SFX: "none", "boom", "slap", "gasp"

Return ONLY a valid JSON array like:
[{"char":"hero","other":"bro","emotion":"smug","otherEmotion":"shocked","cutaway":"insta","bg":"white","zoom":"normal","sfx":"none","text":"Short punchy Hinglish line"}]
Keep each line 7-13 words max. Dead characters must NEVER speak.`;

  const models = ['gemini-3.8-flash', 'gemini-3.8-flash-lite', 'gemini-3.5-flash', 'gemini-3.0-flash'];
  let lastErr = 'All models busy';

  for (const model of models) {
    try {
      setStatus(`Writing script with ${model}...`);
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
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
      Object.keys(customMicBuffers).forEach(k => delete customMicBuffers[k]);
      renderMicControls();
      setStatus(`Script ready (${parsed.length} scenes)! Tap "2. Play & Save Video" or record your own voice below.`);
      return;
    } catch (err) {
      lastErr = err.message;
    }
  }
  setStatus(`Error: ${lastErr}`);
};

// Stage & Animation State
let currentScene = DEMO_SCRIPT[0];
let mouthOpen = 0;
let fallbackSpeaking = false;
let frameTick = 0;
let scenePop = 1;
let blinkTimer = 0;

function drawBackground(bg) {
  if (bg === 'red') {
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 8;
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2 + frameTick * 0.04;
      ctx.beginPath();
      ctx.moveTo(360 + Math.cos(angle) * 190, 620 + Math.sin(angle) * 190);
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
    for (let y = 160; y < 1100; y += 48) {
      ctx.beginPath(); ctx.moveTo(36, y); ctx.lineTo(684, y); ctx.stroke();
    }
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 4;
    ctx.strokeRect(22, 22, canvas.width - 44, canvas.height - 44);
  }
}

function drawCutaway(type) {
  if (!type || type === 'none') return;
  const bob = Math.sin(frameTick * 0.14) * 8;
  ctx.save();
  ctx.translate(495, 290 + bob);
  ctx.rotate(0.05);

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.roundRect(-135, -105, 270, 210, 18);
  ctx.fill();
  ctx.stroke();

  if (type === 'insta') {
    ctx.fillStyle = '#ec4899';
    ctx.fillRect(-115, -85, 230, 115);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, -28, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 42px sans-serif';
    ctx.fillText('❤️ 1 LIKE', -95, 78);
  } else if (type === 'phone') {
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-55, -85, 110, 170);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(-45, -70, 90, 130);
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('99+ MISSED', -85, 95);
  } else if (type === 'money') {
    ctx.fillStyle = '#10b981';
    ctx.fillRect(-95, -55, 190, 85);
    ctx.strokeRect(-95, -55, 190, 85);
    ctx.fillStyle = '#064e3b';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText('₹₹₹', -45, 2);
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('KHARCHA ALERT!', -105, 75);
  } else if (type === 'chappal') {
    ctx.save();
    ctx.rotate(Math.sin(frameTick * 0.4) * 0.45);
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.ellipse(0, -10, 38, 78, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#dc2626';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('FLYING CHAPPAL!', -112, 88);
  } else if (type === 'exam') {
    ctx.fillStyle = '#dc2626';
    ctx.font = 'bold 110px sans-serif';
    ctx.fillText('F-', -45, 25);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('0 / 100 MARKS', -82, 78);
  }
  ctx.restore();
}

function drawCartoonHand(x, y, radius = 22) {
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawSingleCharacter(char, emotion, talkAmt, posX, posY, scaleVal, isSpeaker) {
  const isDarkBg = currentScene.bg === 'dramatic' || currentScene.bg === 'red';
  const ink = isDarkBg ? '#ffffff' : '#0f172a';
  const bounce = isSpeaker ? talkAmt * 16 : Math.sin(frameTick * 0.06) * 3;
  const tilt = isSpeaker ? talkAmt * Math.sin(frameTick * 0.28) * 0.06 : 0;

  ctx.save();
  ctx.translate(posX, posY - bounce);
  ctx.scale(scaleVal * (isSpeaker ? scenePop : 1), scaleVal * (isSpeaker ? (2 - scenePop) : 1));
  ctx.rotate(tilt);

  if (!isSpeaker) ctx.globalAlpha = 0.9;

  ctx.strokeStyle = ink;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Body
  ctx.lineWidth = 10;
  ctx.fillStyle = char === 'hero' ? '#3b82f6' : char === 'bro' ? '#f59e0b' : char === 'mom' ? '#ec4899' : '#475569';
  ctx.beginPath();
  ctx.moveTo(-120, 340);
  ctx.quadraticCurveTo(-105, 110, 0, 110);
  ctx.quadraticCurveTo(105, 110, 120, 340);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  if (char === 'hero' || char === 'bro') {
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-25, 125); ctx.lineTo(-28, 195); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(25, 125); ctx.lineTo(28, 195); ctx.stroke();
  }

  // Arms & Cartoon Hands
  ctx.lineWidth = 10;
  if (emotion === 'shocked' || emotion === 'crying') {
    ctx.beginPath(); ctx.moveTo(-105, 185); ctx.quadraticCurveTo(-155, 120, -135, 35); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(105, 185); ctx.quadraticCurveTo(155, 120, 135, 35); ctx.stroke();
    drawCartoonHand(-135, 30, 22);
    drawCartoonHand(135, 30, 22);
  } else if (emotion === 'angry') {
    const fistY = 45 - Math.sin(frameTick * 0.45) * 18;
    ctx.beginPath(); ctx.moveTo(105, 180); ctx.quadraticCurveTo(175, 135, 175, fistY); ctx.stroke();
    drawCartoonHand(175, fistY, 24);
  } else if (isSpeaker && talkAmt > 0.1) {
    const handY = 115 - talkAmt * 38;
    ctx.beginPath(); ctx.moveTo(-105, 190); ctx.quadraticCurveTo(-165, 165, -165, handY); ctx.stroke();
    drawCartoonHand(-165, handY, 22);
  }

  // Head
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 11;
  ctx.beginPath(); ctx.arc(0, -35, 140, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  if (emotion === 'shadow') {
    ctx.save();
    ctx.beginPath(); ctx.arc(0, -35, 136, Math.PI, 0); ctx.clip();
    ctx.fillStyle = '#1e1b4b';
    ctx.fillRect(-145, -180, 290, 155);
    ctx.restore();
  }

  // Hair & Accessories
  ctx.fillStyle = '#0f172a';
  if (char === 'hero') {
    ctx.beginPath();
    ctx.moveTo(-130, -80); ctx.lineTo(-105, -200); ctx.lineTo(-42, -160);
    ctx.lineTo(0, -225); ctx.lineTo(48, -160); ctx.lineTo(110, -195); ctx.lineTo(130, -80);
    ctx.quadraticCurveTo(0, -130, -130, -80);
    ctx.fill();
  } else if (char === 'bro') {
    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.arc(0, -82, 134, Math.PI, 0); ctx.fill(); ctx.stroke();
    ctx.fillRect(-190, -92, 92, 22); ctx.strokeRect(-190, -92, 92, 22);
  } else if (char === 'mom') {
    ctx.beginPath(); ctx.arc(0, -200, 50, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -82, 138, Math.PI, 0); ctx.fill();
  } else if (char === 'npc') {
    ctx.fillStyle = '#000';
    ctx.fillRect(-100, -65, 82, 40); ctx.fillRect(18, -65, 82, 40);
    ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-18, -48); ctx.lineTo(18, -48); ctx.stroke();
  }

  // Eyes
  const isBlinking = (blinkTimer + (isSpeaker ? 0 : 45)) % 150 > 143;
  ctx.strokeStyle = '#0f172a'; ctx.fillStyle = '#0f172a';
  if (char !== 'npc') {
    if (emotion === 'shadow') {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(-48, -42, 18, 9, 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(48, -42, 18, 9, -0.2, 0, Math.PI * 2); ctx.fill();
    } else if (isBlinking && emotion === 'normal') {
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(-66, -42); ctx.lineTo(-30, -42); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(30, -42); ctx.lineTo(66, -42); ctx.stroke();
    } else if (emotion === 'shocked') {
      ctx.fillStyle = '#fff'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(-50, -45, 30, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(50, -45, 30, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath(); ctx.arc(-50, -45, 8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(50, -45, 8, 0, Math.PI * 2); ctx.fill();
    } else if (emotion === 'angry') {
      ctx.lineWidth = 10;
      ctx.beginPath(); ctx.moveTo(-84, -72); ctx.lineTo(-20, -46); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(84, -72); ctx.lineTo(20, -46); ctx.stroke();
      ctx.fillStyle = '#ef4444';
      ctx.beginPath(); ctx.arc(-48, -35, 13, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(48, -35, 13, 0, Math.PI * 2); ctx.fill();
    } else if (emotion === 'crying') {
      ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(-72, -60); ctx.lineTo(-34, -42); ctx.lineTo(-72, -24); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(72, -60); ctx.lineTo(34, -42); ctx.lineTo(72, -24); ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(-70, -22, 20, 90); ctx.fillRect(50, -22, 20, 90);
    } else if (emotion === 'dead') {
      ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(-68, -60); ctx.lineTo(-32, -26); ctx.moveTo(-32, -60); ctx.lineTo(-68, -26); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(32, -60); ctx.lineTo(68, -26); ctx.moveTo(68, -60); ctx.lineTo(32, -26); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(-48, -42, 12, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(48, -42, 12, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 7;
      if (emotion === 'smug') {
        ctx.beginPath(); ctx.moveTo(-76, -70); ctx.lineTo(-26, -60); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(24, -76); ctx.lineTo(76, -62); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.moveTo(-72, -66); ctx.lineTo(-26, -66); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(26, -66); ctx.lineTo(72, -66); ctx.stroke();
      }
    }
  }

  if (char === 'mom') {
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 6;
    ctx.strokeRect(-88, -70, 70, 50); ctx.strokeRect(18, -70, 70, 50);
    ctx.beginPath(); ctx.moveTo(-18, -45); ctx.lineTo(18, -45); ctx.stroke();
  }

  // Multi-Shape Lip-Sync Mouth
  ctx.fillStyle = '#991b1b'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 7;
  if (isSpeaker && talkAmt > 0.08) {
    const shapeCycle = Math.floor(frameTick / 4) % 3;
    if (talkAmt > 0.55 && shapeCycle === 0) {
      ctx.beginPath(); ctx.arc(0, 26, 36, 0, Math.PI, false); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-26, 26, 52, 10);
    } else if (shapeCycle === 1) {
      ctx.beginPath(); ctx.ellipse(0, 38, 28, Math.max(10, talkAmt * 34), 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.ellipse(0, 38, 34, 11, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
  } else {
    ctx.beginPath();
    if (emotion === 'smug' || emotion === 'shadow') {
      ctx.arc(0, 26, 34, 0.15 * Math.PI, 0.85 * Math.PI);
    } else if (emotion === 'angry' || emotion === 'crying') {
      ctx.arc(0, 54, 30, 1.15 * Math.PI, 1.85 * Math.PI);
    } else {
      ctx.moveTo(-26, 38); ctx.lineTo(26, 38);
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
  ctx.roundRect(45, 65, 195, 48, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 26px sans-serif';
  ctx.fillText(names[char] || 'ME', 68, 98);

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

  let startY = 1140 - (lines.length - 1) * 46;
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
  scenePop += (1 - scenePop) * 0.25;

  if (analyser && dataArray && !fallbackSpeaking) {
    analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < 32; i++) sum += dataArray[i];
    const avg = sum / 32;
    mouthOpen = Math.min(1, Math.max(0, (avg - 10) / 65));
  } else if (fallbackSpeaking) {
    mouthOpen = 0.3 + Math.abs(Math.sin(frameTick * 0.45)) * 0.7;
  } else {
    mouthOpen = 0;
  }

  ctx.save();
  if (currentScene.zoom === 'in') {
    ctx.translate(360, 640);
    ctx.scale(1.16, 1.16);
    ctx.translate(-360, -640);
  } else if (currentScene.zoom === 'shake') {
    ctx.translate((Math.random() - 0.5) * 24, (Math.random() - 0.5) * 24);
  }

  drawBackground(currentScene.bg || 'white');

  const speaker = currentScene.char || 'hero';
  const listener = currentScene.other || (speaker === 'hero' ? 'bro' : 'hero');

  if (currentScene.zoom !== 'in') {
    drawSingleCharacter(listener, currentScene.otherEmotion || 'normal', 0, 525, 760, 0.74, false);
    drawSingleCharacter(speaker, currentScene.emotion || 'normal', mouthOpen, 235, 810, 0.94, true);
  } else {
    drawSingleCharacter(speaker, currentScene.emotion || 'normal', mouthOpen, 360, 800, 1.04, true);
  }

  drawCutaway(currentScene.cutaway);
  ctx.restore();

  drawCaptions(currentScene.text, speaker);
  requestAnimationFrame(renderLoop);
}
renderLoop();

// Gemini Native Human Voice Acting (100% Real Male & Female Acting, Zero Robotic TTS)
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

async function fetchHumanActingVoice(scene, sceneIdx) {
  // 1. Priority: User's own recorded mic voice!
  if (customMicBuffers[sceneIdx]) {
    return customMicBuffers[sceneIdx];
  }

  const key = apiKeyInput.value.trim();
  if (!key) throw new Error('Gemini API Key needed for real human voice acting!');

  const voiceMap = {
    hero: 'Puck',    // Young expressive Indian male
    bro:  'Fenrir',  // Energetic funny male friend
    mom:  'Kore',    // Strict Indian mom female
    npc:  'Charon'   // Deep savage male
  };
  const emotionStyle = {
    angry:   'Speak loudly and angrily like an Indian parent scolding:',
    shocked: 'Speak in a shocked, panicked voice:',
    crying:  'Speak in a dramatic crying, whining comedic tone:',
    smug:    'Speak in a confident, sarcastic, funny tone:',
    shadow:  'Speak in a dark, dramatic anime villain tone:',
    normal:  'Speak naturally like an Indian YouTuber telling a funny story:'
  };

  const voiceName = voiceMap[scene.char] || 'Puck';
  const stylePrompt = emotionStyle[scene.emotion] || emotionStyle.normal;

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${stylePrompt} "${scene.text}"` }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } }
        }
      })
    });

    if (res.status === 429) {
      // Wait smoothly for rate limit reset instead of falling back to robotic lady voice!
      setStatus(`Rate limit pause (waiting 3s for real human voice ${sceneIdx + 1})...`);
      await new Promise((r) => setTimeout(r, 3200));
      continue;
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || `Voice HTTP ${res.status}`);
    }

    const data = await res.json();
    const inlineData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (inlineData?.data) {
      const wavBuf = pcmToWavBuffer(inlineData.data, 24000);
      return await audioCtx.decodeAudioData(wavBuf);
    }
  }
  throw new Error('Could not fetch human voice after retries');
}

function playAudioOnce(audioBuffer) {
  return new Promise((resolve) => {
    let resolved = false;
    duckBGM(true);

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    analyser.connect(destNode);

    source.onended = () => {
      if (!resolved) {
        resolved = true;
        duckBGM(false);
        setTimeout(resolve, 60);
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

  const audioList = [];
  for (let i = 0; i < scenes.length; i++) {
    setStatus(`Generating human acting voice ${i + 1}/${scenes.length} (${scenes[i].char.toUpperCase()})...`);
    try {
      const buf = await fetchHumanActingVoice(scenes[i], i);
      audioList.push(buf);
    } catch (err) {
      isPlayingSequence = false;
      return setStatus(`Voice Error on Scene ${i + 1}: ${err.message}`);
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
        setStatus('Done! Tap "⬇ Save Video" below.');
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
    setStatus(`Playing Scene ${i + 1}/${scenes.length}...`);
    await playAudioOnce(audioList[i]);
  }

  stopComedyBGM();
  isPlayingSequence = false;
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  else setStatus('Playback finished!');
}

document.getElementById('previewOnlyBtn').onclick = () => runAnimation(false);
document.getElementById('playRecordBtn').onclick = () => runAnimation(true);
renderMicControls();
