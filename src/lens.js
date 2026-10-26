// Yokai Lens (百鬼夜行) and Edo Window (時の窓): live AI on a photo you take in the city.
// The Cloudflare Worker in worker/ holds every key; this client only knows the demo access code the user types in.
import * as maplibregl from 'maplibre-gl';
import sekien from '../data/sekien.json';

const API = import.meta.env.VITE_API || 'https://tokyo-monogatari-api.ken-ed7.workers.dev';
const CODE_KEY = 'tokyo-monogatari:access-code';

const STRINGS = {
  en: {
    yokaiTitle: '👹 Yokai Lens',
    yokaiIntro: 'Photograph any spot in Tokyo. The AI reads the scene and the local legends, then reveals the spirit that haunts it.',
    edoTitle: '⏳ Edo Window',
    edoIntro: 'Photograph any view. The AI repaints it as the same spot around 1850, in Hiroshige’s woodblock style.',
    take: '📷 Take a photo',
    code: 'Hackathon access code',
    codeHint: 'Ask the team for today’s code',
    steps: {
      yokai: ['Reading the scene…', 'Consulting the local legends…', 'Something stirs…', 'The spirit takes shape in ink…'],
      edo: ['Reading the scene…', 'Unrolling the old maps of Edo…', 'Carving the woodblocks…', 'Printing in Hiroshige’s colours…'],
    },
    painting: 'Painting…',
    listen: '🎙️ Hear the tale',
    then: 'Then and now',
    drag: '← drag →',
    observed: 'What the AI saw',
    rank: { common: 'Common', rare: 'Rare', legendary: 'Legendary' },
    again: 'Try another spot',
    error: 'The spirits are silent: ',
    parade: 'Night Parade',
    noGps: 'No GPS: using the map centre as your location',
    ancestor: 'Its ancestor in Sekien’s 1776 bestiary',
    ancestorStep: (n) => `Its ancestor stirs: ${n}…`,
  },
  ja: {
    yokaiTitle: '👹 妖怪レンズ',
    yokaiIntro: '東京のどこかを撮影してください。AIが景色と土地の伝説を読み解き、そこに棲む妖怪を見つけ出します。',
    edoTitle: '⏳ 時の窓',
    edoIntro: '景色を撮影すると、AIが同じ場所の1850年頃の姿を広重風の浮世絵で描き直します。',
    take: '📷 写真を撮る',
    code: 'ハッカソン参加コード',
    codeHint: 'チームに今日のコードを聞いてください',
    steps: {
      yokai: ['景色を読み解いています…', '土地の伝説をひもといています…', '何かが動き出した…', '墨の中から妖怪が姿を現す…'],
      edo: ['景色を読み解いています…', '江戸の古地図を広げています…', '版木を彫っています…', '広重の色で刷っています…'],
    },
    painting: '描いています…',
    listen: '🎙️ 語りを聴く',
    then: '今と昔',
    drag: '← ドラッグ →',
    observed: 'AIが見たもの',
    rank: { common: 'よく出る', rare: 'めずらしい', legendary: '伝説級' },
    again: '別の場所で試す',
    error: '妖怪は沈黙している：',
    parade: '百鬼夜行',
    noGps: 'GPSなし：地図の中心を現在地として使います',
    ancestor: '鳥山石燕『画図百鬼夜行』（1776年）に見る祖先',
    ancestorStep: (n) => `祖先の${n}が目を覚ます…`,
  },
};

// Edo Window uses a real Hiroshige print as reference when one was painted this close to you
const PRINT_RADIUS_KM = 0.8;

export function initLens({ map, legends, prints, placesPromise, getLang, getUserPos, toast }) {
  const s = () => STRINGS[getLang()];
  const panel = document.querySelector('#lens');
  const body = panel.querySelector('.lens-body');
  const paradeMarkers = new Map();
  let mode = 'yokai';
  let busy = false;

  const close = () => {
    if (busy) return;
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
  };
  panel.querySelector('.lens-close').addEventListener('click', close);

  function open(newMode) {
    mode = newMode;
    renderIntro();
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
  }

  function accessCode() {
    try {
      return localStorage.getItem(CODE_KEY) || '';
    } catch {
      return '';
    }
  }

  function renderIntro() {
    const str = s();
    body.innerHTML = `
      <h2>${mode === 'edo' ? str.edoTitle : str.yokaiTitle}</h2>
      <p class="lens-intro">${mode === 'edo' ? str.edoIntro : str.yokaiIntro}</p>
      <label class="lens-code">${str.code}
        <input type="text" autocomplete="off" autocapitalize="off" placeholder="${str.codeHint}" value="${accessCode()}" />
      </label>
      <label class="btn primary lens-take">${str.take}
        <input type="file" accept="image/*" capture="environment" hidden />
      </label>`;
    body.querySelector('.lens-take input').addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      const code = body.querySelector('.lens-code input').value.trim();
      try {
        localStorage.setItem(CODE_KEY, code);
      } catch {
        /* ignore */
      }
      if (file) run(file, code);
    });
  }

  async function run(file, code) {
    busy = true;
    const str = s();
    const photo = await downscale(file, 1280, 0.85);
    let pos = getUserPos();
    if (!pos) {
      const c = map.getCenter();
      pos = [c.lng, c.lat];
      toast(str.noGps);
    }
    body.innerHTML = `
      <div class="summon">
        <img class="summon-photo" src="${photo}" alt="" />
        <div class="summon-veil"></div>
        <p class="summon-step"></p>
      </div>`;
    const stepEl = body.querySelector('.summon-step');
    const steps = str.steps[mode];
    let i = 0;
    stepEl.textContent = steps[0];
    const ticker = setInterval(() => (stepEl.textContent = steps[Math.min(++i, steps.length - 1)]), 7000);

    try {
      const context = await nearbyContext(pos);
      const reference = mode === 'edo' ? nearestPrint(pos) : undefined;
      if (reference) stepEl.textContent = getLang() === 'ja' ? `広重がここを描いています：${reference.titleJa}` : `Hiroshige painted this spot: “${reference.titleEn}”`;
      let rec = await api('POST', '/api/conjure', code, { image: photo, lat: pos[1], lng: pos[0], mode, context, reference });
      clearInterval(ticker);
      renderResult(rec, photo);
      while (rec.status === 'painting') {
        await new Promise((r) => setTimeout(r, 5000));
        rec = await api('GET', `/api/job/${rec.id}`, code);
      }
      if (rec.status === 'error') throw new Error(rec.error);
      renderResult(rec, photo);
      addParadeMarker(rec);
    } catch (e) {
      clearInterval(ticker);
      body.innerHTML = `<p class="lens-error">${str.error}${e.message}</p>
        <button class="btn ghost lens-again">${str.again}</button>`;
      body.querySelector('.lens-again').addEventListener('click', renderIntro);
    } finally {
      busy = false;
    }
  }

  // Nearest legends and shrines ground the AI in real local lore
  async function nearbyContext([lng, lat]) {
    const dist = (a, b) => Math.hypot((a - lat) * 111, (b - lng) * 91);
    const places = (await placesPromise).features;
    return {
      legends: [...legends]
        .sort((a, b) => dist(a.lat, a.lng) - dist(b.lat, b.lng))
        .slice(0, 3)
        .map((l) => ({ name: l.name, km: +dist(l.lat, l.lng).toFixed(2), legend: l.legend })),
      places: [...places]
        .sort((a, b) => dist(a.geometry.coordinates[1], a.geometry.coordinates[0]) - dist(b.geometry.coordinates[1], b.geometry.coordinates[0]))
        .slice(0, 6)
        .map((f) => f.properties.name),
    };
  }

  function nearestPrint([lng, lat]) {
    const dist = (p) => Math.hypot((p.lat - lat) * 111, (p.lng - lng) * 91);
    const best = [...prints].sort((a, b) => dist(a) - dist(b))[0];
    return best && dist(best) <= PRINT_RADIUS_KM ? best : undefined;
  }

  function renderResult(rec, localPhoto) {
    const str = s();
    const ja = getLang() === 'ja';
    const st = rec.story;
    const before = localPhoto || rec.photo;
    const after = rec.image;
    const ancestor = rec.mode === 'yokai' && sekien.find((y) => y.id === rec.story?.ancestor);
    const ancestorArt = ancestor ? `<div class="sekien-art" style="--svg: url('${new URL(ancestor.svg, document.baseURI).href}')"></div>` : '';
    const visual = after
      ? `<div class="compare" style="--cut: 50%">
           <img src="${before}" alt="" />
           <img class="compare-after" src="${after}" alt="" />
           <input type="range" min="0" max="100" value="50" aria-label="${str.then}" />
           <span class="compare-hint">${str.drag}</span>
         </div>`
      : `<div class="summon"><img class="summon-photo" src="${before}" alt="" /><div class="summon-veil"></div>
           ${ancestorArt.replace('sekien-art', 'sekien-art summon-ancestor')}
           <p class="summon-step">${ancestor ? str.ancestorStep(ja ? ancestor.nameJa : ancestor.nameEn) : str.painting}</p></div>`;

    let heading, text, extra = '';
    if (rec.mode === 'edo') {
      heading = `<div class="lens-kicker">⏳ ${ja ? '時の窓' : 'Edo Window'}</div>
        <h2>${ja ? st.title?.ja : st.title?.en}</h2><div class="ja">${ja ? st.title?.en : st.title?.ja}</div>`;
      text = ja ? st.storyJa : st.storyEn;
      if (st.then?.length) extra = `<ul class="lens-then">${st.then.map((x) => `<li>${x}</li>`).join('')}</ul>`;
      if (rec.print) {
        extra += `<figure class="lens-print">
          <img src="${rec.print.image}" alt="" loading="lazy" />
          <figcaption>${ja ? `歌川広重「名所江戸百景」${rec.print.no}　${rec.print.titleJa}` : `Hiroshige, 100 Famous Views of Edo #${rec.print.no}: ${rec.print.titleEn}`}</figcaption>
        </figure>`;
      }
    } else {
      const y = st.yokai || {};
      heading = `<div class="lens-kicker">👹 ${str.rank[y.rank] || ''}</div>
        <h2>${ja ? y.nameJa : y.nameEn}</h2><div class="ja">${ja ? `${y.nameEn} · ${y.reading}` : `${y.nameJa} · ${y.reading}`}</div>`;
      text = ja ? st.kaidanJa : st.kaidanEn;
      extra = `<p class="lens-habit">${y.appearance || ''}</p>
        ${
          ancestor
            ? `<figure class="lens-ancestor">${ancestorArt}
                <figcaption><strong>${str.ancestor}</strong><br>${ancestor.nameJa} ${ancestor.nameEn}<br>
                ${(ja ? st.ancestorWhyJa : st.ancestorWhy) || (ja ? ancestor.descJa : ancestor.descEn)}
                <br><a href="${ancestor.source}" target="_blank" rel="noopener">${ja ? '国立国会図書館デジタルコレクション' : 'National Diet Library'} ↗</a></figcaption>
              </figure>`
            : ''
        }
        <p class="tip">🏯 ${(ja && st.edoPastJa) || st.edoPast || ''}</p>`;
    }
    body.innerHTML = `
      ${visual}
      ${heading}
      <p class="story">${text}</p>
      <button class="btn listen" data-act="narrate">${str.listen}</button>
      ${extra}
      <details class="lens-observed"><summary>${str.observed}</summary><ul>${(st.observations || []).map((o) => `<li>${o}</li>`).join('')}</ul></details>
      <button class="btn ghost lens-again">${str.again}</button>`;

    const cmp = body.querySelector('.compare');
    cmp?.querySelector('input').addEventListener('input', (e) => cmp.style.setProperty('--cut', `${e.target.value}%`));
    body.querySelector('.lens-again').addEventListener('click', renderIntro);
    body.querySelector('[data-act="narrate"]').addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        const { url } = await api('POST', `/api/narrate/${rec.id}`, accessCode(), { lang: getLang() });
        new Audio(url).play().catch(() => {});
      } catch (err) {
        toast(str.error + err.message);
      } finally {
        e.target.disabled = false;
      }
    });
  }

  // ---------- Night Parade: everyone's spirits and Edo windows on the map ----------
  function addParadeMarker(rec) {
    if (paradeMarkers.has(rec.id) || !rec.image || rec.lat == null) return;
    const el = document.createElement('button');
    el.className = `parade-marker ${rec.mode}`;
    el.style.backgroundImage = `url("${rec.image}")`;
    el.title = rec.mode === 'edo' ? rec.story.title?.en : rec.story.yokai?.nameEn;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (busy) return;
      renderResult(rec);
      panel.classList.add('open');
      panel.setAttribute('aria-hidden', 'false');
    });
    paradeMarkers.set(rec.id, new maplibregl.Marker({ element: el }).setLngLat([rec.lng, rec.lat]).addTo(map));
  }

  fetch(`${API}/api/parade`)
    .then((r) => (r.ok ? r.json() : []))
    .then((list) => list.forEach(addParadeMarker))
    .catch(() => {});

  return { open };
}

async function api(method, path, code, body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Access-Code': code },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

function downscale(file, maxSide, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
