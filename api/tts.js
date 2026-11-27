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

function synthesizeEdgeNeural(text, char = 'hero') {
  return new Promise((resolve, reject) => {
    const isFemale = ['mom', 'bhabhi', 'gf', 'sister'].includes(char);
    const voice = isFemale ? 'hi-IN-SwaraNeural' : 'hi-IN-MadhurNeural';
    let pitch = '+0Hz';
    let rate = '+4%';
    if (char === 'bro') { pitch = '+12Hz'; rate = '+7%'; }
    else if (char === 'villain') { pitch = '-18Hz'; rate = '-3%'; }
    else if (char === 'sister') { pitch = '+18Hz'; rate = '+8%'; }
    else if (char === 'mom' || char === 'bhabhi') { pitch = '-6Hz'; rate = '+2%'; }

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
    }, 8000);

    ws.onopen = () => {
      const cfg = `X-Timestamp:${new Date().toISOString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":false,"wordBoundaryEnabled":false},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`;
      ws.send(cfg);

      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='hi-IN'><voice name='${voice}'><prosody pitch='${pitch}' rate='${rate}'>${escapeXml(text)}</prosody></voice></speak>`;
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

async function synthesizeHuggingFaceTTS(text, char = 'hero') {
  const isFemale = ['mom', 'bhabhi', 'gf', 'sister'].includes(char);
  const voice = isFemale ? 'hi-IN-SwaraNeural - hi-IN (Female)' : 'hi-IN-MadhurNeural - hi-IN (Male)';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9500);
  try {
    const callRes = await fetch('https://innoai-edge-tts-text-to-speech.hf.space/gradio_api/call/tts_interface', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({ data: [text, voice, 0, 0] })
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
    const { text, char = 'hero', provider = 'edge' } = req.body || {};
    if (!text || !text.trim()) return res.status(400).json({ error: 'Missing text' });

    let audioBuf;
    if (provider === 'hf') {
      try {
        audioBuf = await synthesizeHuggingFaceTTS(text.trim(), char);
      } catch {
        audioBuf = await synthesizeEdgeNeural(text.trim(), char);
      }
    } else {
      try {
        audioBuf = await synthesizeEdgeNeural(text.trim(), char);
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
