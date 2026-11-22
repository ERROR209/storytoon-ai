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
  { char: "hero", other: "bro", emotion: "smug", otherEmotion: "normal", prop: "chai", bg: "white", zoom: "normal", sfx: "none", text: "Mera dost Rahul kal bolta hai, biwi se bada dar lagta hai." },
  { char: "bro", other: "hero", emotion: "crying", otherEmotion: "smug", prop: "sweat", bg: "white", zoom: "in", sfx: "boom", text: "Bhai usne mera phone, password aur meri azaadi sab cheen li!" },
  { char: "hero", other: "bro", emotion: "smug", otherEmotion: "shocked", prop: "none", bg: "white", zoom: "normal", sfx: "none", text: "Toh maine kaha, mard ban aur uski aankhon me aankhein daal!" },
  { char: "bro", other: "hero", emotion: "shocked", otherEmotion: "smug", prop: "sweat", bg: "dramatic", zoom: "in", sfx: "gasp", text: "Phir kya bolu? Seedha bol du ki daal me namak kam hai?" },
  { char: "hero", other: "bro", emotion: "angry", otherEmotion: "shocked", prop: "anger", bg: "red", zoom: "shake", sfx: "slap", text: "Bol de, aur kehna meri mummy tere se accha banati hai!" },
  { char: "bro", other: "hero", emotion: "dead", otherEmotion: "shocked", prop: "none", bg: "dramatic", zoom: "in", sfx: "boom", text: "Agli subah tawa fek ke maara, khopdi pe fracture ho gaya!" }
];
scriptEditor.value = JSON.stringify(DEMO_SCRIPT, null, 2);

document.getElementById('loadDemoBtn').onclick = () => {
  scriptEditor.value = JSON.stringify(DEMO_SCRIPT, null, 2);
  setStatus('Demo script loaded!');
};

function setStatus(msg) { statusBar.textContent = msg; }

// Web Audio API Setup
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
let destNode = null;
let analyser = null;
let dataArray = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new AudioCtx();
    destNode = audioCtx.createMediaStreamDestination();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    dataArray = new Uint8Array(analyser.frequencyBinCount);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

// Punchy Noise + Sub-Bass Meme SFX (No cheap beeps!)
function playSFX(type) {
  if (!type || type === 'none') return;
  initAudio();
  const now = audioCtx.currentTime;

  if (type === 'boom') {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.55);
    gain.gain.setValueAtTime(1.0, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc.connect(gain); gain.connect(audioCtx.destination); gain.connect(destNode);
    osc.start(now); osc.stop(now + 0.6);
  } else if (type === 'slap') {
    // White noise burst + low punch for real slap sound
    const bufferSize = audioCtx.sampleRate * 0.16;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
    const whiteNoise = audioCtx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.95, now);
    whiteNoise.connect(gain); gain.connect(audioCtx.destination); gain.connect(destNode);
    whiteNoise.start(now);
  } else if (type === 'gasp') {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(720, now + 0.18);
    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain); gain.connect(audioCtx.destination); gain.connect(destNode);
    osc.start(now); osc.stop(now + 0.2);
  }
}

// Gemini Script Writer (Two-character conversation aware)
document.getElementById('generateScriptBtn').onclick = async () => {
  const key = apiKeyInput.value.trim();
  const topic = topicInput.value.trim();
  if (!key) return setStatus('Please enter your Google AI Studio API Key first!');
  if (!topic) return setStatus('Please enter a video topic!');

  const prompt = `You are a viral Indian storytime animator like "NOT YOUR TYPE".
Write a ${lengthSelect.value}-line fast-paced funny Hinglish conversation on topic: "${topic}".
Tone: ${toneSelect.value}.
Characters: "hero" (Main guy), "bro" (Best friend), "mom" (Strict Indian mom/teacher), "npc" (Savage bystander).
Emotions: "normal", "shocked", "smug", "angry", "crying", "dead"
Props: "none", "phone", "chai", "anger", "sweat"
Backgrounds: "white", "dramatic", "red"
Zooms: "normal", "in", "shake"
SFX: "none", "boom", "slap", "gasp"

Return ONLY a valid JSON array like:
[{"char":"hero","other":"bro","emotion":"smug","otherEmotion":"shocked","prop":"chai","bg":"white","zoom":"normal","sfx":"none","text":"Short punchy Hinglish line"}]
Keep each line 7-13 words max. Spell Hindi words clearly (e.g. "ab" as "ab", "mein" as "mein").`;

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
      setStatus(`Script ready (${parsed.length} scenes)! Tap "2. Play & Save Video".`);
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
      const angle = (i / 24) * Math.PI * 2 + frameTick * 0.035;
      ctx.beginPath();
      ctx.moveTo(360 + Math.cos(angle) * 200, 620 + Math.sin(angle) * 200);
      ctx.lineTo(360 + Math.cos(angle) * 900, 620 + Math.sin(angle) * 900);
      ctx.stroke();
    }
  } else if (bg === 'dramatic') {
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const grad = ctx.createRadialGradient(360, 620, 60, 360, 620, 440);
    grad.addColorStop(0, '#374151');
    grad.addColorStop(1, '#111827');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Subtle notebook / sketch lines for authentic NOT YOUR TYPE aesthetic
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    for (let y = 180; y < 980; y += 48) {
      ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(680, y); ctx.stroke();
    }
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 4;
    ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);
  }
}

function drawProps(prop, emotion) {
  if (prop === 'anger' || emotion === 'angry') {
    ctx.save();
    ctx.translate(88, -130);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-16, -6); ctx.quadraticCurveTo(-4, -4, -6, -18);
    ctx.moveTo(16, -6); ctx.quadraticCurveTo(4, -4, 6, -18);
    ctx.moveTo(-16, 12); ctx.quadraticCurveTo(-4, 10, -6, 22);
    ctx.moveTo(16, 12); ctx.quadraticCurveTo(4, 10, 6, 22);
    ctx.stroke();
    ctx.restore();
  }
  if (prop === 'sweat' || emotion === 'shocked') {
    const dropY = (frameTick % 35) * 0.65;
    ctx.fillStyle = '#38bdf8'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(120, -105 + dropY);
    ctx.quadraticCurveTo(136, -80 + dropY, 120, -70 + dropY);
    ctx.quadraticCurveTo(104, -80 + dropY, 120, -105 + dropY);
    ctx.fill(); ctx.stroke();
  }
  if (prop === 'phone') {
    ctx.save(); ctx.translate(-145, 85); ctx.rotate(-0.2);
    ctx.fillStyle = '#1e293b'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 6;
    ctx.fillRect(-24, -42, 48, 84); ctx.strokeRect(-24, -42, 48, 84);
    ctx.fillStyle = '#38bdf8'; ctx.fillRect(-18, -34, 36, 66);
    ctx.restore();
  }
  if (prop === 'chai') {
    ctx.save(); ctx.translate(-145, 105);
    ctx.fillStyle = '#d97706'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(-22, -22); ctx.lineTo(22, -22); ctx.lineTo(16, 28); ctx.lineTo(-16, 28); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

function drawSingleCharacter(char, emotion, prop, talkAmt, posX, posY, scaleVal, isSpeaker) {
  const isDarkBg = currentScene.bg === 'dramatic' || currentScene.bg === 'red';
  const ink = isDarkBg ? '#ffffff' : '#0f172a';
  const bounce = isSpeaker ? talkAmt * 16 : Math.sin(frameTick * 0.06) * 3;
  const tilt = isSpeaker ? talkAmt * Math.sin(frameTick * 0.3) * 0.07 : 0;

  ctx.save();
  ctx.translate(posX, posY - bounce);
  ctx.scale(scaleVal * (isSpeaker ? scenePop : 1), scaleVal * (isSpeaker ? (2 - scenePop) : 1));
  ctx.rotate(tilt);

  if (!isSpeaker) ctx.globalAlpha = 0.88;

  ctx.strokeStyle = ink;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Body
  ctx.lineWidth = 10;
  ctx.fillStyle = char === 'hero' ? '#3b82f6' : char === 'bro' ? '#f59e0b' : char === 'mom' ? '#ec4899' : '#475569';
  ctx.beginPath();
  ctx.moveTo(-120, 330);
  ctx.quadraticCurveTo(-105, 110, 0, 110);
  ctx.quadraticCurveTo(105, 110, 120, 330);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // Hands
  ctx.lineWidth = 9;
  if (emotion === 'shocked' || emotion === 'crying') {
    ctx.beginPath(); ctx.moveTo(-100, 185); ctx.lineTo(-140, 40); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(100, 185); ctx.lineTo(140, 40); ctx.stroke();
  } else if (emotion === 'angry') {
    ctx.beginPath(); ctx.moveTo(100, 180); ctx.lineTo(180, 55 - Math.sin(frameTick * 0.45) * 18); ctx.stroke();
  } else if (isSpeaker && talkAmt > 0.12) {
    ctx.beginPath(); ctx.moveTo(-100, 195); ctx.lineTo(-165, 110 - talkAmt * 35); ctx.stroke();
  }

  // Head
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 11;
  ctx.beginPath(); ctx.arc(0, -35, 140, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

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
    if (isBlinking && emotion === 'normal') {
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

  // Multi-Shape Realistic Lip-Sync Mouth (Instead of static O!)
  ctx.fillStyle = '#991b1b'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 7;
  if (isSpeaker && talkAmt > 0.08) {
    const shapeCycle = Math.floor(frameTick / 4) % 3;
    if (talkAmt > 0.55 && shapeCycle === 0) {
      // Wide open D-shape with teeth
      ctx.beginPath();
      ctx.arc(0, 26, 36, 0, Math.PI, false);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-26, 26, 52, 10);
    } else if (shapeCycle === 1) {
      // Medium talking oval
      ctx.beginPath();
      ctx.ellipse(0, 38, 28, Math.max(10, talkAmt * 34), 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    } else {
      // Narrow syllable slit
      ctx.beginPath();
      ctx.ellipse(0, 38, 34, 11, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
  } else {
    ctx.beginPath();
    if (emotion === 'smug') {
      ctx.arc(0, 26, 34, 0.15 * Math.PI, 0.85 * Math.PI);
    } else if (emotion === 'angry' || emotion === 'crying') {
      ctx.arc(0, 54, 30, 1.15 * Math.PI, 1.85 * Math.PI);
    } else {
      ctx.moveTo(-26, 38); ctx.lineTo(26, 38);
    }
    ctx.stroke();
  }

  if (isSpeaker) drawProps(prop, emotion);
  ctx.restore();
}

function drawCaptions(text, char) {
  if (!text) return;
  const names = { hero: 'ME', bro: 'BRO', mom: 'MUMMY', npc: 'RANDOM GUY' };
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(45, 75, 185, 44);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 25px sans-serif';
  ctx.fillText(names[char] || 'ME', 65, 105);

  // Comic Speech Bubble Pointer
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 7;
  ctx.fillRect(45, 1015, 630, 205);
  ctx.strokeRect(45, 1015, 630, 205);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 34px sans-serif';
  const words = text.split(' ');
  let line = '';
  let y = 1072;
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    if (ctx.measureText(testLine).width > 580 && n > 0) {
      ctx.fillText(line, 70, y);
      line = words[n] + ' ';
      y += 44;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, 70, y);
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
    ctx.translate((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22);
  }

  drawBackground(currentScene.bg || 'white');

  // Dual-Character Stage: Listener in background + Active Speaker in foreground!
  const speaker = currentScene.char || 'hero';
  const listener = currentScene.other || (speaker === 'hero' ? 'bro' : 'hero');

  if (currentScene.zoom !== 'in') {
    // Draw Listener on Right Side
    drawSingleCharacter(listener, currentScene.otherEmotion || 'normal', 'none', 0, 525, 730, 0.72, false);
    // Draw Active Speaker on Left Side
    drawSingleCharacter(speaker, currentScene.emotion || 'normal', currentScene.prop || 'none', mouthOpen, 235, 770, 0.92, true);
  } else {
    // Close-up dramatic solo focus on Speaker
    drawSingleCharacter(speaker, currentScene.emotion || 'normal', currentScene.prop || 'none', mouthOpen, 360, 760, 1.02, true);
  }

  ctx.restore();
  drawCaptions(currentScene.text, speaker);
  requestAnimationFrame(renderLoop);
}
renderLoop();

// Gemini Native Multi-Voice TTS (Real Male & Female Human Voices!)
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

async function fetchGeminiVoice(scene) {
  const key = apiKeyInput.value.trim();
  const voiceMap = {
    hero: 'Puck',    // Energetic young Indian male vibe
    bro:  'Fenrir',  // Expressive funny male friend
    mom:  'Kore',    // Strict Indian mom female voice
    npc:  'Charon'   // Deep savage male voice
  };
  const voiceName = voiceMap[scene.char] || 'Puck';

  if (key) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Speak this Hinglish dialogue naturally with comedic timing: ${scene.text}` }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } }
          }
        })
      });
      if (res.ok) {
        const data = await res.json();
        const inlineData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
        if (inlineData?.data) {
          const wavBuf = pcmToWavBuffer(inlineData.data, 24000);
          return await audioCtx.decodeAudioData(wavBuf);
        }
      }
    } catch (e) {}
  }

  // Fallback to proxy TTS if Gemini TTS quota hits limit
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: scene.text })
  });
  if (!res.ok) throw new Error('Fallback TTS failed');
  const arr = await res.arrayBuffer();
  return await audioCtx.decodeAudioData(arr);
}

function playAudioBuffer(audioBuffer, rate = 1.06) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; setTimeout(resolve, 60); } }; // Crisp 60ms comic cut!

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = rate;
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    analyser.connect(destNode);

    source.onended = finish;
    source.start(0);
    setTimeout(finish, ((audioBuffer.duration / rate) * 1000) + 120);
  });
}

async function runAnimation(recordVideo = false) {
  let scenes;
  try {
    scenes = JSON.parse(scriptEditor.value);
    if (!Array.isArray(scenes) || scenes.length === 0) throw new Error('Empty script');
  } catch (e) {
    return setStatus('Script Error: Click "Load Demo" or generate valid JSON first!');
  }

  initAudio();
  downloadLink.classList.add('hidden');

  const audioBuffers = [];
  for (let i = 0; i < scenes.length; i++) {
    setStatus(`Generating real human voice ${i + 1}/${scenes.length} (${scenes[i].char.toUpperCase()})...`);
    try {
      const buf = await fetchGeminiVoice(scenes[i]);
      audioBuffers.push(buf);
    } catch {
      audioBuffers.push(null);
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

  for (let i = 0; i < scenes.length; i++) {
    currentScene = scenes[i];
    scenePop = 0.78;
    playSFX(scenes[i].sfx);
    setStatus(`Playing Scene ${i + 1}/${scenes.length}...`);

    if (audioBuffers[i]) {
      await playAudioBuffer(audioBuffers[i], 1.06);
    } else {
      const words = (scenes[i].text || '').split(' ').length;
      fallbackSpeaking = true;
      await new Promise((r) => setTimeout(r, Math.max(1200, words * 280)));
      fallbackSpeaking = false;
    }
  }

  fallbackSpeaking = false;
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  else setStatus('Playback finished!');
}

document.getElementById('previewOnlyBtn').onclick = () => runAnimation(false);
document.getElementById('playRecordBtn').onclick = () => runAnimation(true);
