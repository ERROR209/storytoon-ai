import { Communicate } from 'edge-tts-universal';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, char } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });

    // 4 Distinct Realistic Indian Neural Voices
    const profiles = {
      hero: { voice: 'hi-IN-MadhurNeural', rate: '+10%', pitch: '+3Hz' },   // Energetic main guy
      bro:  { voice: 'hi-IN-MadhurNeural', rate: '+18%', pitch: '+26Hz' },  // High-pitch funny friend
      mom:  { voice: 'hi-IN-SwaraNeural',  rate: '+4%',  pitch: '-4Hz' },   // Strict Indian mom/teacher
      npc:  { voice: 'en-IN-PrabhatNeural', rate: '-4%', pitch: '-20Hz' }   // Deep savage guy
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

    const audioBuffer = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(audioBuffer);
  } catch (err) {
    console.error('TTS Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
