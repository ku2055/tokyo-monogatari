import * as maplibregl from 'maplibre-gl';
// MapLibre v6 ships its worker as a separate ES module; let Vite bundle it and hand MapLibre the URL
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import legends from '../data/legends.json';
import placesUrl from '../data/places.geojson?url';
import { initLens } from './lens.js';
import prints from '../data/edo-prints.json';

// OpenFreeMap: free OSM vector tiles, no API key required
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const TOKYO = [139.767, 35.681];
const COLLECT_RADIUS_M = 150;
const STORAGE_KEY = 'tokyo-monogatari:stamps';
const PHOTO_KEY = 'tokyo-monogatari:photos';
const asset = (path) => `${import.meta.env.BASE_URL}${path}`;

const $ = (sel) => document.querySelector(sel);

// ---------- i18n (English / 日本語) ----------
const STRINGS = {
  en: {
    collected: '✅ Stamp collected',
    collect: '🔴 Collect stamp',
    turnOnLocation: 'Turn on 📍 location to collect',
    away: (d, r) => `${d} away · come within ${r} m`,
    teleport: '✨ Demo: teleport here',
    spirit: 'Spirit',
    source: 'Source ↗',
    book: '御朱印帳 · Stamp Book',
    noGeo: 'Geolocation is not available',
    geoDenied: 'Location denied: use “Teleport” to try the demo',
    allDone: '🎉 You collected every legend of Tokyo!',
    nightOn: '🌙 Yokai hour: the spirits are restless…',
    nightOff: '☀️ Dawn breaks over Edo',
    types: { temple: 'temple', shrine: 'shrine', 'legend-site': 'legend site', yokai: 'yokai' },
    listen: '🎙️ Hear the tale',
    stop: '⏹ Stop',
    photo: '📸 Add your field photo',
    retake: '📸 Retake photo',
    photoSaved: '📸 Photo saved to your stamp book',
  },
  ja: {
    collected: '✅ 御朱印をいただきました',
    collect: '🔴 御朱印を集める',
    turnOnLocation: '📍 位置情報をオンにして集めよう',
    away: (d, r) => `あと ${d} · ${r} m 以内に近づこう`,
    teleport: '✨ デモ：ここへワープ',
    spirit: '妖怪・神霊',
    source: '出典 ↗',
    book: '御朱印帳',
    noGeo: '位置情報が利用できません',
    geoDenied: '位置情報が拒否されました。「ワープ」でデモを試せます',
    allDone: '🎉 東京の伝説をすべて集めました！',
    nightOn: '🌙 妖怪の刻：百鬼夜行が始まる…',
    nightOff: '☀️ 江戸に夜明けが訪れた',
    types: { temple: '寺', shrine: '神社', 'legend-site': '伝説の地', yokai: '妖怪' },
    listen: '🎙️ 語りを聴く',
    stop: '⏹ 停止',
    photo: '📸 現地の写真を残す',
    retake: '📸 撮り直す',
    photoSaved: '📸 写真を御朱印帳に保存しました',
  },
};
function loadLang() {
  try {
    const saved = localStorage.getItem('tokyo-monogatari:lang');
    if (saved === 'en' || saved === 'ja') return saved;
  } catch {
    /* ignore */
  }
  return navigator.language?.startsWith('ja') ? 'ja' : 'en';
}
let lang = loadLang();
const t = (key) => STRINGS[lang][key];
// Localized field of a legend, falling back to English when no Japanese text exists
const f = (legend, field) => (lang === 'ja' && legend[field + 'Ja']) || legend[field];
const legendName = (legend) => (lang === 'ja' ? legend.nameJa || legend.name : legend.name);
const legendSub = (legend) => (lang === 'ja' ? legend.name : legend.nameJa);
let openId = null;

// ---------- persistence (best effort; private mode may block storage) ----------
function loadStamps() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
  } catch {
    return new Set();
  }
}
function saveStamps() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...stamps]));
  } catch {
    /* ignore */
  }
}

const stamps = loadStamps();
// Loaded once and shared by the map layer and the AI lens (nearest shrines ground the story)
const placesPromise = fetch(placesUrl).then((r) => r.json());

function loadPhotos() {
  try {
    return JSON.parse(localStorage.getItem(PHOTO_KEY) || '{}');
  } catch {
    return {};
  }
}
const photos = loadPhotos();
function savePhoto(id, dataUrl) {
  photos[id] = dataUrl;
  try {
    localStorage.setItem(PHOTO_KEY, JSON.stringify(photos));
  } catch {
    /* storage full or blocked: keep it for this session only */
  }
}

// Downscale a camera photo so dozens fit in localStorage
function shrinkPhoto(file, maxSide = 520) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// ---------- narration + yokai-hour music ----------
const MUSIC_VOLUME = 0.5;
const music = new Audio(asset('music/yokai-hour.mp3'));
music.loop = true;
music.volume = MUSIC_VOLUME;
const narrator = new Audio();
let narratingId = null;
// Duck the music under the storyteller
narrator.addEventListener('play', () => (music.volume = MUSIC_VOLUME * 0.3));
narrator.addEventListener('pause', () => (music.volume = MUSIC_VOLUME));
narrator.addEventListener('ended', () => {
  music.volume = MUSIC_VOLUME;
  narratingId = null;
  if (openId) openLegend(legends.find((l) => l.id === openId), { fly: false });
});
function toggleNarration(legend) {
  if (narratingId === legend.id) {
    narrator.pause();
    narratingId = null;
  } else {
    narrator.src = asset(`audio/${lang}/${legend.id}.mp3`);
    narrator.play().catch(() => {});
    narratingId = legend.id;
  }
  openLegend(legend, { fly: false });
}
let userPos = null; // [lng, lat]
let userMarker = null;
let touring = false;
const markers = new Map();

// ---------- map ----------
maplibregl.setWorkerUrl(workerUrl);
// A map position in the URL (#zoom/lat/lng/bearing/pitch) makes demo links shareable
const deepLinked = /^#[\d.]+\/[\d.-]+\/[\d.-]+/.test(location.hash);
const map = new maplibregl.Map({
  hash: true,
  container: 'map',
  style: STYLE_URL,
  center: TOKYO,
  zoom: 11.5,
  pitch: 55,
  bearing: -17,
  maxPitch: 75,
  attributionControl: { compact: true },
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-left');

map.on('load', () => {
  // Warm the 3D buildings so temples and towers stand out at street level
  if (map.getLayer('building-3d')) {
    map.setPaintProperty('building-3d', 'fill-extrusion-color', [
      'interpolate', ['linear'], ['get', 'render_height'],
      0, '#e9e1d4', 60, '#d9c9b0', 200, '#c7a983',
    ]);
    map.setPaintProperty('building-3d', 'fill-extrusion-opacity', 0.85);
  }
  addPlacesLayer();
  addPrintsLayer();
  legends.forEach(addLegendMarker);
  updateProgress();

  // Gentle intro flight
  if (!deepLinked) map.flyTo({ center: [139.7745, 35.6995], zoom: 12.6, pitch: 60, bearing: -25, duration: 3500 });
});

// Every shrine and temple in the 23 wards from OpenStreetMap: the shared "Tokyo Graph" base layer
function addPlacesLayer() {
  map.addSource('places', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    attribution: '© OpenStreetMap contributors',
  });
  placesPromise.then((data) => map.getSource('places').setData(data));
  map.addLayer({
    id: 'places',
    type: 'circle',
    source: 'places',
    minzoom: 12,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 2, 17, 6],
      'circle-color': ['match', ['get', 'religion'], 'shinto', '#d23f2f', '#7a5c2e'],
      'circle-opacity': 0.75,
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 1,
    },
  });
  map.on('click', 'places', (e) => {
    const p = e.features[0].properties;
    const label = lang === 'ja' ? p.name : p.nameEn || p.name;
    const kind = p.religion === 'shinto' ? (lang === 'ja' ? '⛩️ 神社' : '⛩️ Shrine') : (lang === 'ja' ? '🛕 寺院' : '🛕 Temple');
    new maplibregl.Popup({ closeButton: false, offset: 8 })
      .setLngLat(e.lngLat)
      .setHTML(`<strong>${label}</strong><br><small>${kind}</small>`)
      .addTo(map);
  });
  map.on('mouseenter', 'places', () => (map.getCanvas().style.cursor = 'pointer'));
  map.on('mouseleave', 'places', () => (map.getCanvas().style.cursor = ''));
}

// Hiroshige's One Hundred Famous Views of Edo (1856-59), each at its real viewpoint
function addPrintsLayer() {
  map.addSource('prints', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: prints.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { no: p.no } })),
    },
    attribution: 'Hiroshige prints: public domain (Wikimedia Commons)',
  });
  map.addLayer({
    id: 'prints',
    type: 'circle',
    source: 'prints',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4, 16, 9],
      'circle-color': '#2f5d8a',
      'circle-stroke-color': '#c9a24a',
      'circle-stroke-width': 2,
    },
  });
  map.on('click', 'prints', (e) => {
    const p = prints.find((x) => x.no === e.features[0].properties.no);
    const ja = lang === 'ja';
    new maplibregl.Popup({ offset: 10, maxWidth: '260px', className: 'print-popup' })
      .setLngLat([p.lng, p.lat])
      .setHTML(
        `<img src="${p.image}" alt="" loading="lazy" />
         <div class="print-no">${ja ? '名所江戸百景' : 'Hiroshige · 100 Views of Edo'} #${p.no}</div>
         <strong>${ja ? p.titleJa : p.titleEn}</strong>
         <div class="print-now">${ja ? '現在：' : 'Today: '}${p.modernPlace}</div>`
      )
      .addTo(map);
  });
  map.on('mouseenter', 'prints', () => (map.getCanvas().style.cursor = 'pointer'));
  map.on('mouseleave', 'prints', () => (map.getCanvas().style.cursor = ''));
}

function addLegendMarker(legend) {
  const el = document.createElement('button');
  el.className = 'legend-marker';
  el.setAttribute('aria-label', legendName(legend));
  el.innerHTML = `<span>${legend.emoji || '⛩️'}</span>`;
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    openLegend(legend);
  });
  const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
    .setLngLat([legend.lng, legend.lat])
    .addTo(map);
  markers.set(legend.id, el);
  refreshMarker(legend.id);
}

function refreshMarker(id) {
  markers.get(id)?.classList.toggle('collected', stamps.has(id));
}

function updateProgress() {
  $('#progress-count').textContent = `${stamps.size}/${legends.length}`;
}

// ---------- geo ----------
function distanceMeters([lng1, lat1], [lng2, lat2]) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function formatDistance(m) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

function setUserPos(pos) {
  userPos = pos;
  if (!userMarker) {
    const el = document.createElement('div');
    el.className = 'user-dot';
    userMarker = new maplibregl.Marker({ element: el }).setLngLat(pos).addTo(map);
  } else {
    userMarker.setLngLat(pos);
  }
}

function locate() {
  if (!navigator.geolocation) return toast(t('noGeo'));
  navigator.geolocation.watchPosition(
    (p) => {
      const first = !userPos;
      setUserPos([p.coords.longitude, p.coords.latitude]);
      if (first) map.flyTo({ center: userPos, zoom: 15.5, pitch: 60 });
    },
    () => toast(t('geoDenied')),
    { enableHighAccuracy: true, maximumAge: 10000 }
  );
}

// ---------- legend sheet ----------
function openLegend(legend, { fly = true } = {}) {
  if (fly) {
    map.flyTo({ center: [legend.lng, legend.lat], zoom: 16.5, pitch: 65, bearing: map.getBearing() + 30, duration: 2200, offset: [0, -120] });
  }
  openId = legend.id;
  const collected = stamps.has(legend.id);
  const dist = userPos ? distanceMeters(userPos, [legend.lng, legend.lat]) : null;
  const near = dist !== null && dist <= COLLECT_RADIUS_M;

  let action;
  if (collected) {
    action = `<div class="stamped">${t('collected')}</div>`;
  } else if (near) {
    action = `<button class="btn primary" data-act="collect">${t('collect')}</button>`;
  } else {
    const where = dist === null ? t('turnOnLocation') : t('away')(formatDistance(dist), COLLECT_RADIUS_M);
    action = `<p class="hint">${where}</p>
      <button class="btn ghost" data-act="teleport">${t('teleport')}</button>`;
  }

  const narrating = narratingId === legend.id;
  const photo = photos[legend.id];
  $('#sheet .sheet-body').innerHTML = `
    <img class="art" src="${asset(`art/${legend.id}.webp`)}" alt="" onerror="this.remove()" />
    <div class="sheet-kicker">${legend.emoji || '⛩️'} ${t('types')[legend.type] ?? legend.type ?? ''} · ${f(legend, 'ward') ?? ''}${legend.era ? ' · ' + f(legend, 'era') : ''}</div>
    <h2>${legendName(legend)}</h2>
    <div class="ja">${legendSub(legend) ?? ''}</div>
    <p class="story">${f(legend, 'legend')}</p>
    <button class="btn listen" data-act="listen">${narrating ? t('stop') : t('listen')}</button>
    ${legend.yokai ? `<p class="yokai">👹 <strong>${t('spirit')}:</strong> ${f(legend, 'yokai')}</p>` : ''}
    ${legend.visitTip ? `<p class="tip">💡 ${f(legend, 'visitTip')}</p>` : ''}
    <div class="actions">${action}</div>
    ${collected ? `<img class="stamp-img" src="${asset(`stamps/${legend.id}.webp`)}" alt="" onerror="this.remove()" />` : ''}
    ${collected ? `<label class="btn ghost photo-btn">${photo ? t('retake') : t('photo')}<input type="file" accept="image/*" capture="environment" hidden /></label>` : ''}
    ${photo ? `<img class="field-photo" src="${photo}" alt="" />` : ''}
    ${legend.source ? `<a class="source" href="${legend.source}" target="_blank" rel="noopener">${t('source')}</a>` : ''}
  `;
  const sheet = $('#sheet');
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');

  sheet.querySelector('[data-act="listen"]').addEventListener('click', () => toggleNarration(legend));
  sheet.querySelector('.photo-btn input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    savePhoto(legend.id, await shrinkPhoto(file));
    toast(t('photoSaved'));
    openLegend(legend, { fly: false });
  });
  sheet.querySelector('[data-act="collect"]')?.addEventListener('click', () => collect(legend));
  sheet.querySelector('[data-act="teleport"]')?.addEventListener('click', () => {
    setUserPos([legend.lng + 0.0004, legend.lat + 0.0003]);
    openLegend(legend, { fly: false });
  });
}

function closeSheet() {
  const sheet = $('#sheet');
  sheet.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');
  openId = null;
  narrator.pause();
  narratingId = null;
}

function collect(legend) {
  stamps.add(legend.id);
  saveStamps();
  refreshMarker(legend.id);
  updateProgress();
  const seal = $('#seal');
  seal.classList.remove('show');
  void seal.offsetWidth; // restart animation
  seal.classList.add('show');
  navigator.vibrate?.(60);
  openLegend(legend, { fly: false });
  if (stamps.size === legends.length) setTimeout(() => toast(t('allDone')), 1200);
}

// ---------- stamp book ----------
function openBook() {
  $('#book .book-grid').innerHTML = legends
    .map((l) => {
      const got = stamps.has(l.id);
      return `<button class="book-cell ${got ? 'got' : ''}" data-id="${l.id}">
        ${
          got && photos[l.id]
            ? `<img class="book-photo" src="${photos[l.id]}" alt="" />`
            : ''
        }
        ${
          got
            ? `<img class="book-stamp" src="${asset(`stamps/${l.id}.webp`)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'book-emoji',textContent:'${l.emoji || '⛩️'}'}))" />`
            : '<span class="book-emoji">？</span>'
        }
        <span class="book-name">${legendName(l)}</span>
        <span class="book-ja">${legendSub(l) ?? ''}</span>
      </button>`;
    })
    .join('');
  $('#book .book-head h2').textContent = t('book');
  $('#book').classList.add('open');
  $('#book').setAttribute('aria-hidden', 'false');
}
function closeBook() {
  $('#book').classList.remove('open');
  $('#book').setAttribute('aria-hidden', 'true');
}

// ---------- guided tour (stage demo mode) ----------
async function tour() {
  if (touring) {
    touring = false;
    $('#btn-tour').classList.remove('active');
    return;
  }
  touring = true;
  $('#btn-tour').classList.add('active');
  closeBook();
  for (const legend of legends) {
    if (!touring) break;
    openLegend(legend);
    await new Promise((r) => setTimeout(r, 6000));
  }
  touring = false;
  $('#btn-tour').classList.remove('active');
}

// ---------- yokai hour (night mode) ----------
function toggleNight() {
  const on = document.body.classList.toggle('night');
  $('#btn-night').classList.toggle('active', on);
  if (on) music.play().catch(() => {});
  else music.pause();
  toast(on ? t('nightOn') : t('nightOff'));
}

function applyLang() {
  document.documentElement.lang = lang;
  $('#btn-lang').textContent = lang === 'ja' ? 'EN' : '日本';
  markers.forEach((el, id) => el.setAttribute('aria-label', legendName(legends.find((l) => l.id === id))));
  if (openId) openLegend(legends.find((l) => l.id === openId), { fly: false });
  if ($('#book').classList.contains('open')) openBook();
}

function toggleLang() {
  lang = lang === 'ja' ? 'en' : 'ja';
  narrator.pause();
  narratingId = null;
  try {
    localStorage.setItem('tokyo-monogatari:lang', lang);
  } catch {
    /* ignore */
  }
  applyLang();
}

// ---------- toast ----------
let toastTimer;
function toast(msg) {
  let el = $('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ---------- wiring ----------
const lens = initLens({ map, legends, prints, placesPromise, getLang: () => lang, getUserPos: () => userPos, toast });
$('#btn-yokai').addEventListener('click', () => lens.open('yokai'));
$('#btn-edo').addEventListener('click', () => lens.open('edo'));
$('#btn-lang').addEventListener('click', toggleLang);
$('#btn-locate').addEventListener('click', locate);
$('#btn-tour').addEventListener('click', tour);
$('#btn-night').addEventListener('click', toggleNight);
$('#btn-book').addEventListener('click', openBook);
$('#progress').addEventListener('click', openBook);
$('.sheet-close').addEventListener('click', closeSheet);
$('.book-close').addEventListener('click', closeBook);
$('#book .book-grid').addEventListener('click', (e) => {
  const cell = e.target.closest('.book-cell');
  if (!cell) return;
  closeBook();
  openLegend(legends.find((l) => l.id === cell.dataset.id));
});
map.on('click', closeSheet);

applyLang();
