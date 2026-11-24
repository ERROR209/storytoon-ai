import { Communicate } from 'edge-tts-universal';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, char } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });

    const profiles = {
      hero:   { voice: 'hi-IN-MadhurNeural', rate: '+12%', pitch: '+4Hz' },
      bro:    { voice: 'hi-IN-MadhurNeural', rate: '+18%', pitch: '+28Hz' },
      mom:    { voice: 'hi-IN-SwaraNeural',  rate: '+6%',  pitch: '-2Hz' },
      bhabhi: { voice: 'hi-IN-SwaraNeural',  rate: '+10%', pitch: '+10Hz' },
      npc:    { voice: 'en-IN-PrabhatNeural', rate: '-2%', pitch: '-18Hz' }
    };

    const profile = profiles[char] || profiles.hero;
    const communicate = new Communicate(text, {
      voice: profile.voice,
      rate: profile.rate,
      pitch: profile.pitch
    });

    const chunks = [];
    for await (const chunk of communicate.stream()) {
      if (chunk.type === 'audio' && chunk.data) {
        chunks.push(chunk.data);
      }
    }

    if (chunks.length === 0) throw new Error('Empty audio stream');

    const audioBuffer = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(audioBuffer);
  } catch (err) {
    try {
      const cleanText = req.body.text.replace(/[\r\n]+/g, ' ').trim();
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleanText)}&tl=hi&client=tw-ob`;
      const ttsRes = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const buf = Buffer.from(await ttsRes.arrayBuffer());
      res.setHeader('Content-Type', 'audio/mpeg');
      return res.status(200).send(buf);
    } catch (fallbackErr) {
      return res.status(500).json({ error: err.message });
    }
  }
}
