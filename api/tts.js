const crypto = require('crypto');

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const WIN_EPOCH = 11644473600n;
const S_TO_NS = 10000000n;

function generateSecMsGec() {
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  let ticks = (nowSec + WIN_EPOCH) * S_TO_NS;
  ticks -= ticks % 3000000000n;
  const str = `${ticks}${TRUSTED_CLIENT_TOKEN}`;
  return crypto.createHash('sha256').update(str, 'ascii').digest('hex').toUpperCase();
}

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getExpressiveVoiceConfig(char = 'hero', emotion = 'normal') {
  let voice = 'hi-IN-MadhurNeural';
  let lang = 'hi-IN';
  let pitch = '+4Hz';
  let rate = '+8%';

  if (char === 'bro') {
    voice = 'en-IN-PrabhatNeural';
    lang = 'en-IN';
    pitch = '+14Hz';
    rate = '+11%';
  } else if (char === 'gf' || char === 'sister') {
    voice = 'en-IN-NeerjaNeural';
    lang = 'en-IN';
    pitch = char === 'sister' ? '+16Hz' : '+8Hz';
    rate = '+9%';
  } else if (char === 'mom' || char === 'bhabhi') {
    voice = 'hi-IN-SwaraNeural';
    lang = 'hi-IN';
    pitch = '-4Hz';
    rate = '+5%';
  } else if (char === 'villain') {
    voice = 'hi-IN-MadhurNeural';
    lang = 'hi-IN';
    pitch = '-22Hz';
    rate = '+0%';
  }

  if (emotion === 'angry') {
    rate = '+15%';
    pitch = char === 'villain' ? '-14Hz' : '+18Hz';
  } else if (emotion === 'shocked' || emotion === 'sweat') {
    rate = '+13%';
    pitch = '+20Hz';
  } else if (emotion === 'crying') {
    rate = '-6%';
    pitch = '-10Hz';
  }

  return { voice, lang, pitch, rate };
}

function synthesizeEdgeNeural(text, char = 'hero', emotion = 'normal') {
  return new Promise((resolve, reject) => {
    const { voice, lang, pitch, rate } = getExpressiveVoiceConfig(char, emotion);
    const reqId = crypto.randomBytes(16).toString('hex');
    const secMsGec = generateSecMsGec();
    const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=1-130.0.2849.68&ConnectionId=${reqId}`;

    const WebSocketImpl = global.WebSocket || require('ws');
    const ws = new WebSocketImpl(wsUrl, {
      headers: {
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
        'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0'
      }
    });

    const audioChunks = [];
    const timer = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error('Edge Neural timeout'));
    }, 8500);

    ws.onopen = () => {
      const cfg = `X-Timestamp:${new Date().toISOString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":false,"wordBoundaryEnabled":false},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`;
      ws.send(cfg);

      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'><voice name='${voice}'><prosody pitch='${pitch}' rate='${rate}'>${escapeXml(text)}</prosody></voice></speak>`;
      const msg = `X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${new Date().toISOString()}\r\nPath:ssml\r\n\r\n${ssml}`;
      ws.send(msg);
    };

    ws.onmessage = async (event) => {
      const data = event.data;
      if (typeof data === 'string') {
        if (data.includes('Path:turn.end')) {
          clearTimeout(timer);
          try { ws.close(); } catch {}
          if (audioChunks.length === 0) return reject(new Error('Empty audio stream'));
          resolve(Buffer.concat(audioChunks));
        }
      } else {
        const buf = Buffer.isBuffer(data)
          ? data
          : Buffer.from(data instanceof ArrayBuffer ? data : await data.arrayBuffer());
        if (buf.length > 2) {
          const headerLen = buf.readUInt16BE(0);
          const headerStr = buf.subarray(2, 2 + headerLen).toString('utf8');
          if (headerStr.includes('Path:audio')) {
            audioChunks.push(buf.subarray(2 + headerLen));
          }
        }
      }
    };

    ws.onerror = (err) => {
      clearTimeout(timer);
      reject(new Error(err?.message || 'Edge WebSocket error'));
    };
  });
}

async function synthesizeElevenLabsTTS(text, char = 'hero', emotion = 'normal', elevenKeyRaw = '') {
  const keys = String(elevenKeyRaw || '').split(',').map(k => k.trim()).filter(Boolean);
  if (keys.length === 0) throw new Error('Missing ElevenLabs API key');

  // Distinct pre-made ElevenLabs voices mapped to Desi characters
  const voiceMap = {
    hero: 'TxGEqnHWrfWFTfGW9XjX',    // Josh (energetic young male)
    bro: 'yoZ06aMxZJJ28mfd3POQ',     // Sam (expressive buddy)
    villain: 'VR6AewLTigWG4xSOukaG', // Arnold (deep heavy boss)
    npc: 'pNInz6obpgDQGcFmaJgB',     // Adam
    gf: 'EXAVITQu4vr4xnSDxMaL',      // Bella (expressive young female)
    sister: 'MF3mGyEYCl7XYWbV9V6O',  // Elli
    mom: '21m00Tcm4TlvDq8ikWAM',     // Rachel
    bhabhi: 'AZnzlk1XvdvUeBnXmlld'   // Domi
  };
  const voiceId = voiceMap[char] || voiceMap.hero;
  const stability = (emotion === 'angry' || emotion === 'shocked') ? 0.30 : 0.45;

  let lastErr = 'ElevenLabs failed';
  for (const apiKey of keys) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 11000);
    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
          'Accept': 'audio/mpeg'
        },
        signal: ctrl.signal,
        body: JSON.stringify({
          text,
          model_id: 'eleven_flash_v2_5',
          voice_settings: {
            stability,
            similarity_boost: 0.78,
            style: 0.45,
            use_speaker_boost: true
          }
        })
      });
      clearTimeout(timer);
      if (!res.ok) {
        lastErr = `ElevenLabs HTTP ${res.status}`;
        continue; // Auto-rotate to next ElevenLabs key if quota/block hit
      }
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      clearTimeout(timer);
      lastErr = err.message;
    }
  }
  throw new Error(lastErr);
}

async function synthesizeSarvamTTS(text, char = 'hero', emotion = 'normal', sarvamKey = '') {
  if (!sarvamKey) throw new Error('Missing Sarvam API key');
  const speakerMap = {
    hero: 'abhilash',
    bro: 'karun',
    villain: 'hitesh',
    npc: 'abhilash',
    gf: 'anushka',
    sister: 'vidya',
    mom: 'manisha',
    bhabhi: 'manisha'
  };
  const speaker = speakerMap[char] || 'abhilash';
  const pitch = char === 'villain' ? -0.25 : (char === 'bro' ? 0.15 : 0.05);
  const pace = emotion === 'angry' ? 1.18 : (emotion === 'crying' ? 0.94 : 1.10);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': sarvamKey
      },
      signal: ctrl.signal,
      body: JSON.stringify({
        inputs: [text],
        target_language_code: 'hi-IN',
        speaker,
        pitch,
        pace,
        loudness: 1.3,
        speech_sample_rate: 22050,
        enable_preprocessing: true,
        model: 'bulbul:v2'
      })
    });
    if (!res.ok) throw new Error(`Sarvam HTTP ${res.status}`);
    const data = await res.json();
    const b64 = data.audios && data.audios[0];
    if (!b64) throw new Error('No Sarvam audio');
    return { buffer: Buffer.from(b64, 'base64'), mime: 'audio/wav' };
  } finally {
    clearTimeout(timer);
  }
}

async function synthesizeHuggingFaceTTS(text, char = 'hero') {
  const isFemale = ['mom', 'bhabhi', 'gf', 'sister'].includes(char);
  const voice = isFemale ? 'en-IN-NeerjaNeural - en-IN (Female)' : 'en-IN-PrabhatNeural - en-IN (Male)';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9500);
  try {
    const callRes = await fetch('https://innoai-edge-tts-text-to-speech.hf.space/gradio_api/call/tts_interface', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({ data: [text, voice, 8, 8] })
    });
    if (!callRes.ok) throw new Error(`HF Call ${callRes.status}`);
    const { event_id } = await callRes.json();
    if (!event_id) throw new Error('No HF event_id');

    const streamRes = await fetch(`https://innoai-edge-tts-text-to-speech.hf.space/gradio_api/call/tts_interface/${event_id}`, {
      signal: ctrl.signal
    });
    const sseText = await streamRes.text();
    const match = sseText.match(/"url"\s*:\s*"([^"]+)"/);
    if (!match) throw new Error('No HF audio URL');

    const audioRes = await fetch(match[1], { signal: ctrl.signal });
    if (!audioRes.ok) throw new Error('HF audio download failed');
    return Buffer.from(await audioRes.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { text, char = 'hero', emotion = 'normal', provider = 'edge', sarvamKey = '', elevenKey = '' } = req.body || {};
    if (!text || !text.trim()) return res.status(400).json({ error: 'Missing text' });

    if (provider === 'elevenlabs' && elevenKey) {
      try {
        const mp3Buf = await synthesizeElevenLabsTTS(text.trim(), char, emotion, elevenKey);
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).send(mp3Buf);
      } catch {
        // Fallback to Sarvam or Edge Neural if ElevenLabs quota/block hit
      }
    }

    if ((provider === 'sarvam' || (provider === 'elevenlabs' && sarvamKey)) && sarvamKey) {
      try {
        const out = await synthesizeSarvamTTS(text.trim(), char, emotion, sarvamKey);
        res.setHeader('Content-Type', out.mime);
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).send(out.buffer);
      } catch {
        // Fallback to expressive Edge Neural
      }
    }

    let audioBuf;
    if (provider === 'hf') {
      try {
        audioBuf = await synthesizeHuggingFaceTTS(text.trim(), char);
      } catch {
        audioBuf = await synthesizeEdgeNeural(text.trim(), char, emotion);
      }
    } else {
      try {
        audioBuf = await synthesizeEdgeNeural(text.trim(), char, emotion);
      } catch {
        audioBuf = await synthesizeHuggingFaceTTS(text.trim(), char);
      }
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(audioBuf);
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
};
