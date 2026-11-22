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
  { char: "hero", emotion: "smug", bg: "white", zoom: "normal", sfx: "none", text: "Bhai kal exam hai, par aaj raat sirf 10 minute reel dekh ke so jaunga." },
  { char: "bro", emotion: "shocked", bg: "white", zoom: "in", sfx: "boom", text: "Bro subah ke 4 baj gaye hain! Tune ek chapter bhi nahi khola!" },
  { char: "hero", emotion: "crying", bg: "dramatic", zoom: "shake", sfx: "gasp", text: "Kya?! Ab toh bhagwan hi bacha sakta hai mujhe!" },
  { char: "mom", emotion: "angry", bg: "red", zoom: "in", sfx: "slap", text: "Uth ja nalayak! Tera phone aaj se mere locker mein rahega!" },
  { char: "npc", emotion: "smug", bg: "white", zoom: "normal", sfx: "cricket", text: "Rest in peace bro. Agle saal phir milenge." }
];
scriptEditor.value = JSON.stringify(DEMO_SCRIPT, null, 2);

document.getElementById('loadDemoBtn').onclick = () => {
  scriptEditor.value = JSON.stringify(DEMO_SCRIPT, null, 2);
  setStatus('Demo script loaded!');
};

function setStatus(msg) { statusBar.textContent = msg; }

// Web Audio API Setup (Neural Voice + SFX + Real-Time Lip-Sync + Video Audio Track)
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

function playSFX(type) {
  if (!type || type === 'none') return;
  initAudio();
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  gain.connect(destNode);

  if (type === 'boom') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.65);
    gain.gain.setValueAtTime(0.9, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.7);
    osc.start(now); osc.stop(now + 0.7);
  } else if (type === 'slap') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.18);
    gain.gain.setValueAtTime(0.8, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    osc.start(now); osc.stop(now + 0.2);
  } else if (type === 'gasp') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.25);
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);
    osc.start(now); osc.stop(now + 0.28);
  } else if (type === 'cricket') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(4200, now);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.start(now); osc.stop(now + 0.35);
  }
}

// Fixed & Bulletproof Gemini AI Script Generator
document.getElementById('generateScriptBtn').onclick = async () => {
  const key = apiKeyInput.value.trim();
  const topic = topicInput.value.trim();
  if (!key) return setStatus('Please enter your Google AI Studio API Key first!');
  if (!topic) return setStatus('Please enter a video topic!');

  setStatus('Gemini AI writing funny Hinglish script...');
  const prompt = `You are a viral Indian storytime animator like "NOT YOUR TYPE".
Write a ${lengthSelect.value}-line funny Hinglish script on topic: "${topic}".
Tone: ${toneSelect.value}.
Available characters: "hero", "bro", "mom", "npc"
Available emotions: "normal", "shocked", "smug", "angry", "crying", "dead"
Available backgrounds: "white", "dramatic", "red"
Available zooms: "normal", "in", "shake"
Available sfx: "none", "boom", "slap", "gasp", "cricket"

Return ONLY a valid JSON array like:
[{"char":"hero","emotion":"smug","bg":"white","zoom":"normal","sfx":"none","text":"Dialogue in Hinglish"}]
Keep each dialogue punchy (8-15 words max).`;

  const models = ['gemini-3.8-flash', 'gemini-3.8-flash-lite', 'gemini-3.5-flash', 'gemini-3.0-flash'];
  let lastErr = 'All models busy';

  for (const model of models) {
    try {
      setStatus(`Trying ${model}...`);
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      const data = await res.json();
      if (!res.ok) {
        lastErr = data.error?.message || `HTTP ${res.status}`;
        continue;
      }

      let raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const startIdx = raw.indexOf('[');
      const endIdx = raw.lastIndexOf(']');
      if (startIdx === -1 || endIdx === -1) {
        lastErr = 'Invalid AI format';
        continue;
      }

      const parsed = JSON.parse(raw.slice(startIdx, endIdx + 1));
      scriptEditor.value = JSON.stringify(parsed, null, 2);
      setStatus(`Script ready (${parsed.length} scenes via ${model})! Tap "2. Play & Save Video".`);
      return;
    } catch (err) {
      lastErr = err.message;
    }
  }
  setStatus(`Error: ${lastErr}`);
};

let currentScene = { char: 'hero', emotion: 'normal', bg: 'white', zoom: 'normal', text: 'Tap Play & Save Video to start!' };
let mouthOpen = 0;
let fallbackSpeaking = false;
let frameTick = 0;

function drawBackground(bg) {
  if (bg === 'red') {
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 6;
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2 + frameTick * 0.02;
      ctx.beginPath();
      ctx.moveTo(360 + Math.cos(angle) * 240, 640 + Math.sin(angle) * 240);
      ctx.lineTo(360 + Math.cos(angle) * 900, 640 + Math.sin(angle) * 900);
      ctx.stroke();
    }
  } else if (bg === 'dramatic') {
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const grad = ctx.createRadialGradient(360, 620, 60, 360, 620, 420);
    grad.addColorStop(0, '#374151');
    grad.addColorStop(1, '#111827');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 4;
    ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);
  }
}

function drawCharacter(char, emotion, talkAmt) {
  const isDarkBg = currentScene.bg === 'dramatic' || currentScene.bg === 'red';
  const ink = isDarkBg ? '#ffffff' : '#0f172a';
  const bounce = talkAmt * 14;

  ctx.save();
  ctx.translate(360, 740 - bounce);
  ctx.strokeStyle = ink;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.lineWidth = 10;
  ctx.fillStyle = char === 'hero' ? '#3b82f6' : char === 'bro' ? '#f59e0b' : char === 'mom' ? '#ec4899' : '#475569';
  ctx.beginPath();
  ctx.moveTo(-125, 340);
  ctx.quadraticCurveTo(-110, 110, 0, 110);
  ctx.quadraticCurveTo(110, 110, 125, 340);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.lineWidth = 9;
  if (emotion === 'shocked' || emotion === 'crying') {
    ctx.beginPath(); ctx.moveTo(-105, 190); ctx.lineTo(-145, 40); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(105, 190); ctx.lineTo(145, 40); ctx.stroke();
  } else if (emotion === 'angry') {
    ctx.beginPath(); ctx.moveTo(105, 180); ctx.lineTo(185, 60 - Math.sin(frameTick * 0.4) * 15); ctx.stroke();
  } else if (talkAmt > 0.15) {
    ctx.beginPath(); ctx.moveTo(-105, 200); ctx.lineTo(-165, 120 - talkAmt * 30); ctx.stroke();
  }

  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 11;
  ctx.beginPath();
  ctx.arc(0, -35, 145, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  if (char === 'hero') {
    ctx.beginPath();
    ctx.moveTo(-135, -80);
    ctx.lineTo(-110, -205); ctx.lineTo(-45, -165);
    ctx.lineTo(0, -230); ctx.lineTo(50, -165);
    ctx.lineTo(115, -200); ctx.lineTo(135, -80);
    ctx.quadraticCurveTo(0, -135, -135, -80);
    ctx.fill();
  } else if (char === 'bro') {
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(0, -85, 138, Math.PI, 0);
    ctx.fill(); ctx.stroke();
    ctx.fillRect(-195, -95, 95, 22);
    ctx.strokeRect(-195, -95, 95, 22);
  } else if (char === 'mom') {
    ctx.beginPath(); ctx.arc(0, -205, 52, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -85, 142, Math.PI, 0); ctx.fill();
  } else if (char === 'npc') {
    ctx.fillStyle = '#000';
    ctx.fillRect(-105, -68, 85, 42);
    ctx.fillRect(20, -68, 85, 42);
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(-20, -50); ctx.lineTo(20, -50); ctx.stroke();
  }

  ctx.strokeStyle = '#0f172a';
  ctx.fillStyle = '#0f172a';
  if (char !== 'npc') {
    if (emotion === 'shocked') {
      ctx.fillStyle = '#fff'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(-52, -45, 32, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(52, -45, 32, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath(); ctx.arc(-52, -45, 9, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(52, -45, 9, 0, Math.PI * 2); ctx.fill();
    } else if (emotion === 'angry') {
      ctx.lineWidth = 10;
      ctx.beginPath(); ctx.moveTo(-88, -75); ctx.lineTo(-22, -48); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(88, -75); ctx.lineTo(22, -48); ctx.stroke();
      ctx.fillStyle = '#ef4444';
      ctx.beginPath(); ctx.arc(-50, -35, 14, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(50, -35, 14, 0, Math.PI * 2); ctx.fill();
    } else if (emotion === 'crying') {
      ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(-75, -60); ctx.lineTo(-35, -42); ctx.lineTo(-75, -24); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(75, -60); ctx.lineTo(35, -42); ctx.lineTo(75, -24); ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(-72, -22, 22, 95);
      ctx.fillRect(50, -22, 22, 95);
    } else if (emotion === 'dead') {
      ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(-70, -62); ctx.lineTo(-34, -26); ctx.moveTo(-34, -62); ctx.lineTo(-70, -26); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(34, -62); ctx.lineTo(70, -26); ctx.moveTo(70, -62); ctx.lineTo(34, -26); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(-50, -42, 13, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(50, -42, 13, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 7;
      if (emotion === 'smug') {
        ctx.beginPath(); ctx.moveTo(-78, -72); ctx.lineTo(-28, -62); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(25, -78); ctx.lineTo(78, -64); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.moveTo(-75, -68); ctx.lineTo(-28, -68); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(28, -68); ctx.lineTo(75, -68); ctx.stroke();
      }
    }
  }

  if (char === 'mom') {
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 6;
    ctx.strokeRect(-92, -72, 74, 52);
    ctx.strokeRect(18, -72, 74, 52);
    ctx.beginPath(); ctx.moveTo(-18, -46); ctx.lineTo(18, -46); ctx.stroke();
  }

  const openH = Math.max(6, talkAmt * 48);
  ctx.fillStyle = '#991b1b';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 7;
  if (talkAmt > 0.08) {
    ctx.beginPath();
    ctx.ellipse(0, 38, 34, openH, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    if (emotion === 'smug') {
      ctx.arc(0, 26, 36, 0.15 * Math.PI, 0.85 * Math.PI);
    } else if (emotion === 'angry' || emotion === 'crying') {
      ctx.arc(0, 56, 32, 1.15 * Math.PI, 1.85 * Math.PI);
    } else {
      ctx.moveTo(-28, 38); ctx.lineTo(28, 38);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawCaptions(text, char) {
  if (!text) return;
  const names = { hero: 'ME', bro: 'BRO', mom: 'MUMMY', npc: 'RANDOM GUY' };
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(50, 110, 180, 42);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText(names[char] || 'ME', 68, 139);

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 7;
  ctx.fillRect(45, 1020, 630, 200);
  ctx.strokeRect(45, 1020, 630, 200);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 34px sans-serif';
  const words = text.split(' ');
  let line = '';
  let y = 1078;
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
  if (analyser && dataArray && !fallbackSpeaking) {
    analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < 32; i++) sum += dataArray[i];
    const avg = sum / 32;
    mouthOpen = Math.min(1, Math.max(0, (avg - 15) / 80));
  } else if (fallbackSpeaking) {
    mouthOpen = 0.35 + Math.abs(Math.sin(frameTick * 0.35)) * 0.65;
  } else {
    mouthOpen = 0;
  }

  ctx.save();
  if (currentScene.zoom === 'in') {
    ctx.translate(360, 640);
    ctx.scale(1.18, 1.18);
    ctx.translate(-360, -640);
  } else if (currentScene.zoom === 'shake') {
    ctx.translate((Math.random() - 0.5) * 24, (Math.random() - 0.5) * 24);
  }

  drawBackground(currentScene.bg || 'white');
  drawCharacter(currentScene.char || 'hero', currentScene.emotion || 'normal', mouthOpen);
  ctx.restore();

  drawCaptions(currentScene.text, currentScene.char);
  requestAnimationFrame(renderLoop);
}
renderLoop();

// Bulletproof Voice + Timer Fallback Engine (Never Hangs on Android)
async function speakLineNeural(scene) {
  currentScene = scene;
  playSFX(scene.sfx);

  const words = (scene.text || '').split(' ').length;
  const estimatedMs = Math.max(1800, words * 360);

  // 1. Try Vercel Neural TTS API first
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: scene.text, char: scene.char }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error('API ' + res.status);

    const arrayBuffer = await res.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; setTimeout(resolve, 220); } };

      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(analyser);
      analyser.connect(audioCtx.destination);
      analyser.connect(destNode);

      source.onended = finish;
      source.start(0);
      setTimeout(finish, (audioBuffer.duration * 1000) + 500);
    });
  } catch (err) {
    // 2. Bulletproof Android Browser TTS + Guaranteed Timer Fallback
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          fallbackSpeaking = false;
          setTimeout(resolve, 220);
        }
      };

      fallbackSpeaking = true;
      try {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance(scene.text);
          utter.pitch = scene.char === 'bro' ? 1.35 : scene.char === 'mom' ? 1.25 : scene.char === 'npc' ? 0.7 : 1.0;
          utter.rate = 1.1;
          utter.onend = finish;
          utter.onerror = finish;
          window.speechSynthesis.speak(utter);
        }
      } catch (e) {}

      // Guaranteed timer so Android never gets stuck
      setTimeout(finish, estimatedMs);
    });
  }
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
  let recorder = null;
  const recordedChunks = [];

  if (recordVideo) {
    try {
      const canvasStream = canvas.captureStream(30);
      const audioTracks = destNode ? destNode.stream.getAudioTracks() : [];
      const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioTracks
      ]);

      let options = {};
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
        options = { mimeType: 'video/webm;codecs=vp8,opus' };
      } else if (MediaRecorder.isTypeSupported('video/webm')) {
        options = { mimeType: 'video/webm' };
      }

      recorder = new MediaRecorder(combinedStream, options);
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) recordedChunks.push(e.data); };
      recorder.onstop = () => {
        const videoBlob = new Blob(recordedChunks, { type: 'video/webm' });
        const videoUrl = URL.createObjectURL(videoBlob);
        downloadLink.href = videoUrl;
        downloadLink.classList.remove('hidden');
        setStatus('Video ready! Tap "⬇ Save Video" below.');
      };
      recorder.start(250);
    } catch (recErr) {
      setStatus('Recording fallback mode: ' + recErr.message);
    }
  }

  for (let i = 0; i < scenes.length; i++) {
    setStatus(`Playing Scene ${i + 1}/${scenes.length}: ${(scenes[i].char || 'HERO').toUpperCase()}...`);
    await speakLineNeural(scenes[i]);
  }

  fallbackSpeaking = false;
  if (recorder && recorder.state !== 'inactive') {
    recorder.stop();
  } else {
    setStatus('Playback finished!');
  }
}

document.getElementById('previewOnlyBtn').onclick = () => runAnimation(false);
document.getElementById('playRecordBtn').onclick = () => runAnimation(true);
