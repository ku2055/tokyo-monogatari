#!/usr/bin/env node
// Build the Sekien yokai line-art set (public/sekien/*.svg + data/sekien.json)
// from Toriyama Sekien's 画図百鬼夜行 (blocks cut 1776, this impression 文化2/1805)
// as scanned by the National Diet Library (NDL Digital Collections, PDM / public domain).
//
// Requirements: node >= 18, ffmpeg on PATH, and the pure-JS tracer potrace@2.1.8
// installed somewhere outside the app (so package.json stays untouched):
//   npm i --prefix /tmp/svgtool potrace@2.1.8
//   SVGTOOL=/tmp/svgtool node scripts/fetch_sekien.mjs [--only kappa,tengu] [--refetch]
//
// Raw IIIF crops are cached in .cache/sekien/crops (git-ignored); requests are
// rate-limited to < 1/s with an identifying User-Agent.
//
// Crop boxes / masks are given in the coordinates of the 1200px-wide preview
// (https://dl.ndl.go.jp/api/iiif/<pid>/<page>/full/1200,/0/default.jpg) of the
// 5819x5053 spread; they are scaled to full-resolution IIIF regions below.

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cache/sekien');
const OUT_SVG = path.join(ROOT, 'public/sekien');
const OUT_JSON = path.join(ROOT, 'data/sekien.json');
const UA = 'tokyo-monogatari-hackathon/0.1';

const PID = '2553975';
const FULL_W = 5819;
const PREVIEW_W = 1200;
const S = FULL_W / PREVIEW_W;
const BOOK = { 陰: '画図百鬼夜行 前編 陰', 陽: '画図百鬼夜行 前編 陽', 風: '画図百鬼夜行 前編 風' };
const RIGHTS =
  'Public Domain Mark (PDM) — 保護期間満了 / インターネット公開; ' +
  '「国立国会図書館デジタルコレクション」収録資料, 鳥山石燕 画『百鬼夜行 3巻拾遺3巻』[1] 文化2 [1805], 長野屋勘吉, 請求記号 辰-23 (DOI 10.11501/2553975)';

// box/masks: [x, y, w, h] in 1200px preview coords. thr: potrace threshold (0-255).
const ITEMS = [
  { id: 'kappa', nameJa: '河童', reading: 'かっぱ', nameEn: 'Kappa', vol: '陰', page: 13, box: [680, 380, 370, 410], masks: [],
    descEn: 'A river imp with a water-filled dish on its head, lurking among lotus leaves to drag the careless into the water.',
    descJa: '頭の皿に水をたたえた川の妖怪。蓮の葉の陰にひそみ、油断した者を水中へ引きずり込む。' },
  { id: 'kitsunebi', nameJa: '狐火', reading: 'きつねび', nameEn: 'Kitsunebi (Fox-fire)', vol: '陰', page: 16, box: [600, 400, 455, 360], masks: [],
    descEn: 'A fox breathes ghostly flame from its mouth, the will-o’-the-wisp lights seen dancing over fields at night.',
    descJa: '狐が口から吐く怪しい火。夜の野に連なって揺れる鬼火の正体とされた。' },
  { id: 'tengu', nameJa: '天狗', reading: 'てんぐ', nameEn: 'Tengu', vol: '陰', page: 10, box: [665, 300, 380, 515], masks: [],
    descEn: 'A beaked, feathered mountain goblin perched in the pines, master of swordsmanship and scourge of proud monks.',
    descJa: '松の上に羽を休める嘴の天狗。深山に住み、剣術に通じ、慢心した僧をこらしめる。' },
  { id: 'nuppeppo', nameJa: 'ぬっぺっぽう', reading: 'ぬっぺっぽう', nameEn: 'Nuppeppō (faceless blob)', vol: '風', page: 35, box: [120, 215, 400, 545], masks: [],
    descEn: 'A faceless lump of flesh that waddles out of temple grounds at night — Sekien’s cousin of the nopperabō.',
    descJa: '夜の寺のあたりをのそのそ歩く、顔のない肉のかたまり。のっぺらぼうの仲間とされる。' },
  { id: 'rokurokubi', nameJa: '飛頭蛮', reading: 'ろくろくび', nameEn: 'Rokurokubi', vol: '陽', page: 24, box: [600, 345, 450, 385], masks: [],
    descEn: 'While she sleeps, a woman’s head floats off on an impossibly long neck to peer over the folding screen.',
    descJa: '眠る女の首がするすると伸び、屏風の上から覗き込む。' },
  { id: 'nekomata', nameJa: '猫また', reading: 'ねこまた', nameEn: 'Nekomata', vol: '陰', page: 12, box: [135, 250, 395, 520], masks: [],
    descEn: 'An old cat whose tail has split in two dances on its hind legs with a towel on its head.',
    descJa: '年を経て尾が二つに裂けた猫。手ぬぐいをかぶり、後ろ足で立って踊る。' },
  { id: 'tanuki', nameJa: '狸', reading: 'たぬき', nameEn: 'Tanuki', vol: '陰', page: 14, box: [135, 300, 450, 460], masks: [],
    descEn: 'A shape-shifting raccoon dog standing upright by a stone lantern under the autumn moon.',
    descJa: '秋の月の下、石灯籠のそばに立つ化け狸。人を化かす名人。' },
  { id: 'yurei', nameJa: '幽霊', reading: 'ゆうれい', nameEn: 'Yūrei (ghost)', vol: '陽', page: 22, box: [660, 165, 390, 650], masks: [],
    descEn: 'A long-haired ghost in a white robe that trails away into nothing, leaning over a garden fence.',
    descJa: '長い黒髪に白い衣、足のない幽霊が垣根に身を乗り出す。' },
  { id: 'kodama', nameJa: '木魅', reading: 'こだま', nameEn: 'Kodama (tree spirit)', vol: '陰', page: 9, box: [135, 245, 915, 570], masks: [[680, 245, 190, 145]],
    descEn: 'The spirits of hundred-year-old trees, appearing as an old couple beneath the pines.',
    descJa: '百年を経た木に宿る精霊。松の下に老夫婦の姿で現れる。' },
  { id: 'ubume', nameJa: '姑獲鳥', reading: 'うぶめ', nameEn: 'Ubume', vol: '陽', page: 20, box: [135, 325, 455, 470], masks: [],
    descEn: 'The ghost of a woman who died in childbirth, standing in the rain by a river and begging passers-by to hold her baby.',
    descJa: 'お産で亡くなった女の霊。雨の川辺に立ち、通る人に赤子を抱いてくれと頼む。' },
  { id: 'kamaitachi', nameJa: '窮奇', reading: 'かまいたち', nameEn: 'Kamaitachi', vol: '陰', page: 15, box: [600, 255, 450, 545], masks: [[600, 255, 65, 75]],
    descEn: 'A sickle-clawed weasel riding a whirlwind, leaving painless cuts on anyone it brushes past.',
    descJa: 'つむじ風に乗った鎌の爪の鼬。触れた人に痛みのない切り傷を残す。' },
  { id: 'tesso', nameJa: '鉄鼠', reading: 'てっそ', nameEn: 'Tesso (iron rat)', vol: '陽', page: 23, box: [610, 250, 440, 580], masks: [[610, 250, 150, 165]],
    descEn: 'The vengeful monk Raigō reborn as a giant rat, leading a horde of rats to gnaw the temple’s sutras.',
    descJa: '恨みを残した頼豪阿闍梨が大鼠となり、無数の鼠を率いて寺の経典を食い破る。' },
  { id: 'yukionna', nameJa: '雪女', reading: 'ゆきおんな', nameEn: 'Yuki-onna (snow woman)', vol: '陽', page: 25, box: [135, 240, 400, 400], masks: [],
    descEn: 'A pale woman who appears in snowstorms among bamboo, her breath freezing travellers where they stand.',
    descJa: '吹雪の竹林に現れる白い女。その息は旅人を凍りつかせる。' },
];

// per-item tracing overrides (tuned visually)
const TUNE = {
  default: { width: 1400, thr: 150, turdSize: 12, optTolerance: 0.6, blur: 0.7 },
};

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const refetch = args.includes('--refetch');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pageId = (n) => 'R' + String(n).padStart(7, '0');
const full = (b) => b.map((v) => Math.round(v * S));

async function fetchCrop(it) {
  const f = path.join(CACHE, 'crops', `${it.id}.jpg`);
  if (fs.existsSync(f) && !refetch) return f;
  const [x, y, w, h] = full(it.box);
  const url = `https://dl.ndl.go.jp/api/iiif/${PID}/${pageId(it.page)}/${x},${y},${w},${h}/1600,/0/default.jpg`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  await sleep(1200);
  return f;
}

function preprocess(it, src, t) {
  // flatten paper tone (divide by heavy blur), white-out masked title text, scale, slight blur
  const out = path.join(CACHE, 'work', `${it.id}.png`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const k = 1600 / it.box[2]; // preview px -> fetched px
  const boxes = (it.masks || []).map(([mx, my, mw, mh]) =>
    `drawbox=x=${Math.round((mx - it.box[0]) * k)}:y=${Math.round((my - it.box[1]) * k)}:w=${Math.round(mw * k)}:h=${Math.round(mh * k)}:color=white:t=fill`);
  const chain = [
    'format=gray,split[a][b];[b]gblur=sigma=40[bg];[a][bg]blend=all_mode=divide',
    ...boxes,
    `scale=${t.width}:-1:flags=area`,
    `gblur=sigma=${t.blur}`,
    'format=gray',
  ].join(',');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', src, '-filter_complex', chain, out]);
  return out;
}

function trace(potrace, png, t) {
  return new Promise((resolve, reject) => {
    const p = new potrace.Potrace();
    p.setParameters({ threshold: t.thr, turdSize: t.turdSize, optTolerance: t.optTolerance, blackOnWhite: true, turnPolicy: potrace.Potrace.TURNPOLICY_MINORITY });
    p.loadImage(png, (err) => {
      if (err) return reject(err);
      const tag = p.getPathTag('currentColor');
      const d = (tag.match(/ d="([^"]*)"/) || [])[1] || '';
      const w = p._luminanceData.width, h = p._luminanceData.height;
      resolve({ d: d.replace(/(\d+\.\d)\d+/g, '$1').replace(/\s+/g, ' ').trim(), w, h });
    });
  });
}

async function main() {
  const tool = process.env.SVGTOOL;
  if (!tool) throw new Error('set SVGTOOL to a dir containing node_modules/potrace');
  const potrace = createRequire(path.join(tool, 'index.js'))('potrace');
  fs.mkdirSync(OUT_SVG, { recursive: true });
  const records = [];
  for (const it of ITEMS) {
    const t = { ...TUNE.default, ...(TUNE[it.id] || {}) };
    if (!only || only.includes(it.id)) {
      const src = await fetchCrop(it);
      const png = preprocess(it, src, t);
      const { d, w, h } = await trace(potrace, png, t);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${it.nameEn} (${it.nameJa}) — Toriyama Sekien">` +
        `<title>${it.nameJa} ${it.nameEn} — 鳥山石燕『画図百鬼夜行』</title>` +
        `<path fill="currentColor" fill-rule="evenodd" d="${d}"/></svg>\n`;
      fs.writeFileSync(path.join(OUT_SVG, `${it.id}.svg`), svg);
      console.log(`${it.id.padEnd(12)} ${(svg.length / 1024).toFixed(1)} KB`);
    }
    records.push({
      id: it.id, nameJa: it.nameJa, reading: it.reading, nameEn: it.nameEn,
      book: BOOK[it.vol], page: pageId(it.page), pid: PID,
      source: `https://dl.ndl.go.jp/pid/${PID}/1/${it.page}`,
      iiif: `https://dl.ndl.go.jp/api/iiif/${PID}/${pageId(it.page)}/${full(it.box).join(',')}/full/0/default.jpg`,
      rights: RIGHTS, svg: `sekien/${it.id}.svg`, descEn: it.descEn, descJa: it.descJa,
    });
  }
  fs.writeFileSync(OUT_JSON, JSON.stringify(records, null, 2) + '\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
