// Tokyo Monogatari API: the live AI behind Yokai Lens and Edo Window.
//
// Keys live only in Worker secrets (OPENROUTER_KEY, DUOMI_KEY, ELEVENLABS_KEY, ACCESS_CODE): never in the repo or client.
//
//   POST /api/conjure      photo + GPS + nearby lore -> Gemini story, then a Duomi Nano Banana edit task
//   GET  /api/job/:id      poll the painting; on success the image is copied into R2 (Duomi links expire)
//   POST /api/narrate/:id  storyteller narration (EN: ElevenLabs, JA: Gemini TTS), cached in R2
//   GET  /api/parade       everyone's finished yokai and Edo windows, for the Night Parade map
//   GET  /img/*            public R2 files (Duomi must be able to fetch the uploaded photo)

const GEMINI = 'google/gemini-3.8-flash';
const GEMINI_TTS = 'google/gemini-3.8-flash-tts';
const IMAGE_MODEL = 'gemini-nano-banana-2.1';
const ELEVEN_VOICE = 'nPczCjzI2devNBz1zQrb'; // "Brian", deep narration

const YOKAI_PROMPT = `You are a yokai scholar in the tradition of Toriyama Sekien and Lafcadio Hearn, working in present-day Tokyo.
Given a traveller's photo, GPS position and the real folklore and shrines nearby, you discover the spirit that haunts THIS exact spot.
Rules: ground the spirit in (1) concrete things visible in the photo and (2) the real local lore and history provided. Invent a NEW yokai
(not a copy of an existing one) that feels authentically Edo. Be specific, eerie, a little playful. Never mock real religions or people.
Return ONLY JSON:
{"observations": [3-5 concrete things seen in the photo],
 "edoPast": "1-2 sentences: what this spot was in the Edo period (use the lore; say 'tradition says' if unsure)",
 "edoPastJa": "the same in Japanese",
 "yokai": {"nameJa": "kanji name", "reading": "romaji", "nameEn": "English name", "appearance": "1-2 sentences",
           "habit": "what it does to passers-by, tied to a feature in the photo", "rank": "common|rare|legendary"},
 "kaidanEn": "a 70-90 word kaidan told like a rakugo storyteller, second person, set at this spot",
 "kaidanJa": "the same kaidan in natural Japanese (rakugo storyteller tone), 150-200 characters",
 "imagePrompt": "an image-edit instruction to add this yokai into the photo: where it stands relative to visible objects, pose, ukiyo-e ink style creature with a subtle supernatural glow, keep the rest of the photo unchanged, no text"}`;

const EDO_PROMPT = `You are a historian of Edo and a master of Hiroshige's woodblock style.
Given a traveller's photo of present-day Tokyo, the GPS position and the real lore and shrines nearby, work out what this exact
viewpoint looked like around 1850 (moats, canals, daimyo estates, temples, fields, the bay shoreline, Mount Fuji views).
Map each modern element you see to its Edo counterpart. Be historically plausible; say 'likely' when unsure.
If a Hiroshige print of this place is provided (second image), it is real evidence of how the spot looked: use its landmarks,
and say in the story that Hiroshige painted this place. The edit model will also receive that print as Image 2.
Return ONLY JSON:
{"observations": [3-5 concrete modern things seen in the photo],
 "then": [3-5 short 'modern thing -> Edo counterpart' mappings],
 "title": {"en": "a Hiroshige-style print title for this view", "ja": "日本語の題 (e.g. 名所江戸百景 style)"},
 "storyEn": "70-90 words, a narrator standing here guiding the listener back to 1850: what they would see, hear and smell",
 "storyJa": "the same in natural Japanese, 150-200 characters",
 "imagePrompt": "an image-edit instruction: repaint this photo as the SAME viewpoint and perspective in about 1850 Edo, as an authentic ukiyo-e woodblock print in Hiroshige's style; list concretely which modern objects become what; add a few Edo-period people; no modern objects, no text, no letters"}`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    try {
      if (url.pathname.startsWith('/img/')) return serveImage(env, url.pathname.slice(5));
      if (url.pathname === '/api/parade' && request.method === 'GET') return json(await parade(env, url.origin), cors);

      if (url.pathname.startsWith('/api/')) {
        if (request.headers.get('X-Access-Code') !== env.ACCESS_CODE) {
          return json({ error: 'access code required' }, cors, 401);
        }
      }
      if (url.pathname === '/api/conjure' && request.method === 'POST') {
        return json(await conjure(await request.json(), env, url.origin), cors);
      }
      let m = url.pathname.match(/^\/api\/job\/([\w-]+)$/);
      if (m && request.method === 'GET') return json(await job(env, m[1], url.origin), cors);
      m = url.pathname.match(/^\/api\/narrate\/([\w-]+)$/);
      if (m && request.method === 'POST') {
        const { lang } = await request.json();
        return json(await narrate(env, m[1], lang === 'ja' ? 'ja' : 'en', url.origin), cors);
      }
      return json({ error: 'not found' }, cors, 404);
    } catch (e) {
      return json({ error: e.message || String(e) }, cors, e.status || 500);
    }
  },
};

// ---------------------------------------------------------------- conjure

async function conjure(body, env, origin) {
  const { image, lat, lng, mode = 'yokai', context = {}, reference } = body;
  // Optional real Hiroshige print near this spot (Edo Window). Only Wikimedia-hosted public-domain scans are accepted.
  const print =
    mode === 'edo' && typeof reference?.image === 'string' && reference.image.startsWith('https://upload.wikimedia.org/')
      ? { image: reference.image, no: reference.no, titleEn: reference.titleEn, titleJa: reference.titleJa }
      : null;
  if (!image?.startsWith('data:image/')) throw httpError(400, 'image must be a data URL');
  if (!['yokai', 'edo'].includes(mode)) throw httpError(400, 'mode must be yokai or edo');
  await spendGuard(env);

  const id = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  const bytes = Uint8Array.from(atob(image.split(',')[1]), (c) => c.charCodeAt(0));
  if (bytes.length > 4_000_000) throw httpError(413, 'photo too large');
  const photoKey = `photos/${id}.jpg`;
  await env.BUCKET.put(photoKey, bytes, { httpMetadata: { contentType: 'image/jpeg' } });
  const photoUrl = `${origin}/img/${photoKey}`;

  // 1. Gemini looks at the photo with the local lore and writes the story plus an edit instruction
  const ctx = {
    gps: [lat, lng],
    nearest_legends: (context.legends || []).slice(0, 3),
    nearest_shrines_temples: (context.places || []).slice(0, 6),
    ...(print && { hiroshige_print: { no: print.no, title: `${print.titleJa} (${print.titleEn})` } }),
  };
  const story = await geminiJson(env, mode === 'edo' ? EDO_PROMPT : YOKAI_PROMPT, ctx, image, print?.image);
  if (print) {
    story.imagePrompt = `Image 1 is the traveller's photo; Image 2 is Hiroshige's print of this place, a reference for Edo-period landmarks and style. Keep Image 1's viewpoint and perspective. ${story.imagePrompt}`;
  }

  // 2. Nano Banana paints it into the real photo (async; the client polls /api/job/:id)
  const taskId = await duomi(env, 'POST', '/api/gemini/nano-banana-edit', {
    model: IMAGE_MODEL,
    prompt: story.imagePrompt,
    image_urls: print ? [photoUrl, print.image] : [photoUrl],
    aspect_ratio: 'auto',
    image_size: '1K',
  }).then((r) => r.data.task_id);

  const record = {
    id,
    mode,
    lat,
    lng,
    created: new Date().toISOString(),
    photo: photoUrl,
    story,
    ...(print && { print }),
    taskId,
    status: 'painting',
  };
  await putRecord(env, record);
  return publicRecord(record);
}

async function job(env, id, origin) {
  const record = await getRecord(env, id);
  if (record.status !== 'painting') return publicRecord(record);

  const t = (await duomi(env, 'GET', `/api/gemini/nano-banana/${record.taskId}`)).data;
  if (t.state === 'succeeded') {
    const src = t.data.images[0].url;
    const img = await fetch(src);
    if (!img.ok) throw httpError(502, 'could not download painting');
    const key = `art/${id}.png`;
    await env.BUCKET.put(key, img.body, { httpMetadata: { contentType: img.headers.get('content-type') || 'image/png' } });
    record.image = `${origin}/img/${key}`;
    record.status = 'done';
    await putRecord(env, record);
  } else if (t.state === 'error') {
    record.status = 'error';
    record.error = t.msg || 'painting failed';
    await putRecord(env, record);
  }
  return publicRecord(record);
}

// ---------------------------------------------------------------- narration

async function narrate(env, id, lang, origin) {
  const record = await getRecord(env, id);
  record.audio ||= {};
  if (record.audio[lang]) return { url: record.audio[lang] };

  const s = record.story;
  const text =
    record.mode === 'edo'
      ? lang === 'ja' ? s.storyJa : s.storyEn
      : lang === 'ja'
        ? `${s.yokai.nameJa}。${s.kaidanJa}`
        : `${s.yokai.nameEn}. ${s.kaidanEn}`;

  let audio, ext, type;
  if (lang === 'en') {
    const r = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE}?output_format=mp3_44100_64`,
      {
        method: 'POST',
        headers: { 'xi-api-key': env.ELEVENLABS_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
      }
    );
    if (!r.ok) throw httpError(502, `ElevenLabs ${r.status}`);
    [audio, ext, type] = [await r.arrayBuffer(), 'mp3', 'audio/mpeg'];
  } else {
    // ElevenLabs premade voices misread kanji; Gemini TTS scored 9/10 in QC. It returns raw 24 kHz PCM.
    const r = await fetch('https://openrouter.ai/api/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.OPENROUTER_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: GEMINI_TTS, input: text, voice: 'Charon', response_format: 'pcm' }),
    });
    if (!r.ok) throw httpError(502, `Gemini TTS ${r.status}`);
    [audio, ext, type] = [pcmToWav(new Uint8Array(await r.arrayBuffer())), 'wav', 'audio/wav'];
  }
  const key = `audio/${id}-${lang}.${ext}`;
  await env.BUCKET.put(key, audio, { httpMetadata: { contentType: type } });
  record.audio[lang] = `${origin}/img/${key}`;
  await putRecord(env, record);
  return { url: record.audio[lang] };
}

function pcmToWav(pcm, rate = 24000) {
  const header = new DataView(new ArrayBuffer(44));
  const write = (o, s) => [...s].forEach((c, i) => header.setUint8(o + i, c.charCodeAt(0)));
  write(0, 'RIFF');
  header.setUint32(4, 36 + pcm.length, true);
  write(8, 'WAVEfmt ');
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true); // PCM
  header.setUint16(22, 1, true); // mono
  header.setUint32(24, rate, true);
  header.setUint32(28, rate * 2, true);
  header.setUint16(32, 2, true);
  header.setUint16(34, 16, true);
  write(36, 'data');
  header.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length);
  out.set(new Uint8Array(header.buffer), 0);
  out.set(pcm, 44);
  return out;
}

// ---------------------------------------------------------------- parade

async function parade(env, origin) {
  const list = await env.BUCKET.list({ prefix: 'records/', limit: 200 });
  let records = await Promise.all(
    list.objects.map(async (o) => (await env.BUCKET.get(o.key))?.json())
  );
  // Finish paintings whose author closed the app before polling completed (a few per request)
  const stuck = records.filter((r) => r?.status === 'painting').slice(0, 5);
  const finished = await Promise.all(stuck.map((r) => job(env, r.id, origin).catch(() => r)));
  const byId = new Map(finished.map((r) => [r.id, r]));
  records = records.map((r) => (r && byId.has(r.id) ? { ...r, ...byId.get(r.id) } : r));
  return records
    .filter((r) => r?.status === 'done')
    .sort((a, b) => b.created.localeCompare(a.created))
    .map(publicRecord);
}

// ---------------------------------------------------------------- helpers

async function geminiJson(env, system, ctx, imageDataUrl, referenceUrl) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENROUTER_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GEMINI,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: [
            { type: 'text', text: JSON.stringify(ctx) },
            { type: 'image_url', image_url: { url: imageDataUrl } },
            ...(referenceUrl ? [{ type: 'image_url', image_url: { url: referenceUrl } }] : []),
          ],
        },
      ],
    }),
  });
  if (!r.ok) throw httpError(502, `Gemini ${r.status}`);
  const text = (await r.json()).choices?.[0]?.message?.content || '';
  try {
    return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  } catch {
    throw httpError(502, 'Gemini returned no JSON');
  }
}

async function duomi(env, method, path, body) {
  const r = await fetch(`https://duomiapi.com${path}`, {
    method,
    headers: { Authorization: env.DUOMI_KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => null);
  // Legacy Duomi routes report failures inside an HTTP 200
  if (!r.ok || !data || (data.code !== undefined && ![200, 0].includes(data.code))) {
    throw httpError(502, `Duomi ${r.status} ${data?.code ?? ''} ${data?.msg ?? ''}`.trim());
  }
  return data;
}

// Daily cap on paid generations so a leaked access code can't run up the bill
async function spendGuard(env) {
  const key = `meta/count-${new Date().toISOString().slice(0, 10)}`;
  const n = parseInt((await (await env.BUCKET.get(key))?.text()) || '0', 10);
  if (n >= parseInt(env.DAILY_CAP || '150', 10)) throw httpError(429, 'daily spirit quota reached: try tomorrow');
  await env.BUCKET.put(key, String(n + 1));
}

const getRecord = async (env, id) => {
  const obj = await env.BUCKET.get(`records/${id}.json`);
  if (!obj) throw httpError(404, 'unknown id');
  return obj.json();
};
const putRecord = (env, r) =>
  env.BUCKET.put(`records/${r.id}.json`, JSON.stringify(r), { httpMetadata: { contentType: 'application/json' } });

// Strip internal fields (the edit prompt and Duomi task id stay server-side)
function publicRecord(r) {
  const { taskId, ...rest } = r;
  const { imagePrompt, ...story } = r.story || {};
  return { ...rest, story };
}

async function serveImage(env, key) {
  const obj = await env.BUCKET.get(key);
  if (!obj) return new Response('not found', { status: 404 });
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
  const ok = allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$/.test(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : allowed[0] || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Access-Code',
    Vary: 'Origin',
  };
}

const json = (data, headers, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
