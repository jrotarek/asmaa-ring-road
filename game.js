/* أسماء على الدائري — pseudo-3D ring road racer */
(() => {
'use strict';

// ---------------------------------------------------------------- setup
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
const $ = id => document.getElementById(id);

const PHRASES = ['بص قدامك يا حيوان', 'متخلف', 'سهلة اهي', 'اقل حاجة عند اسماء'];
const LEVEL_TEXT = [
  'الطريق فاضي... لسه',
  'الزحمة بدأت',
  'الميكروباصات نزلت',
  'ساعة الذروة!',
  'الدائري وقت المغرب',
  'جنون الدائري!',
];

// road / camera
const SEG = 200;              // segment length
const RUMBLE = 3;
const ROAD_W = 2000;          // half road width
const LANES = 4;
const LANE_X = [-0.75, -0.25, 0.25, 0.75];
const FOV = 100;
const CAM_H = 1750;
const CAM_DEPTH = 1 / Math.tan((FOV / 2) * Math.PI / 180);
const DRAW_DIST = 300;
const PLAYER_Z = CAM_H * CAM_DEPTH;
const HORIZON_Y = H * 0.42;    // screen-space horizon; above centre so more of the road ahead shows
const MAX_SPEED = SEG * 60;   // units / s
const PLAYER_W = 680;
const LEVEL_TIME = 25;        // seconds per level

// ---------------------------------------------------------------- utils
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeIn = (a, b, t) => a + (b - a) * t * t;
const easeInOut = (a, b, t) => a + (b - a) * ((-Math.cos(t * Math.PI) / 2) + 0.5);
const toArabicDigits = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};
function mixColor(c1, c2, t) {
  const a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16);
  const r = Math.round(lerp(a >> 16, b >> 16, t)), g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t)), bl = Math.round(lerp(a & 255, b & 255, t));
  return `rgb(${r},${g},${bl})`;
}
function roundRect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// ---------------------------------------------------------------- assets
const IMG = {};
const IMG_LIST = ['kia_rear', 'kia_front', 'asmaa', 'corolla', 'sunny', 'hilux', 'microbus', 'hiace', 'verna', 'cerato', 'truck'];
function loadImage(name, src) {
  return new Promise(res => { const i = new Image(); i.onload = () => { IMG[name] = i; res(); }; i.onerror = () => res(); i.src = src; });
}

// Egyptian private-car plate drawn on top of the dealer placeholder plates
function drawPlate(c, x, y, w, h, letters, nums) {
  c.save();
  roundRect(c, x, y, w, h, h * 0.12); c.fillStyle = '#f7f7f2'; c.fill();
  c.lineWidth = Math.max(1, h * 0.05); c.strokeStyle = '#333'; c.stroke();
  c.save(); c.clip();
  c.fillStyle = '#3d8be0'; c.fillRect(x, y, w, h * 0.32);
  c.restore();
  c.fillStyle = '#fff'; c.textBaseline = 'middle';
  c.font = `900 ${h * 0.24}px Cairo, sans-serif`;
  c.textAlign = 'right'; c.fillText('مصر', x + w * 0.94, y + h * 0.17);
  c.textAlign = 'left'; c.font = `900 ${h * 0.2}px Cairo, sans-serif`; c.fillText('EGYPT', x + w * 0.06, y + h * 0.17);
  c.fillStyle = '#111'; c.textAlign = 'center';
  if (nums === null) {            // vanity plate: one word across the whole plate
    c.font = `900 ${h * 0.5}px Cairo, sans-serif`;
    c.fillText(letters, x + w / 2, y + h * 0.67, w * 0.9);
  } else {
    c.font = `800 ${h * 0.44}px Cairo, sans-serif`;
    c.fillText(nums, x + w * 0.27, y + h * 0.66);
    c.fillText(letters, x + w * 0.73, y + h * 0.66);
    c.fillRect(x + w * 0.5 - 0.5, y + h * 0.36, Math.max(1, w * 0.01), h * 0.58);
  }
  c.restore();
}
function platedSprite(img, frac, letters, nums) {
  const c = makeCanvas(img.width, img.height), g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const [fx, fy, fw, fh] = frac;
  const pad = 2;
  drawPlate(g, fx * img.width - pad, fy * img.height - pad, fw * img.width + pad * 2, fh * img.height + pad * 2, letters, nums);
  return c;
}

const PLATE_LETTERS = ['ن ط ص', 'ر ب ع', 'م ج د', 'ل ق و', 'ف ه ي', 'س ك ن', 'ط أ ر'];
let CAR_TYPES = [];
let PLAYER_SPR = null, START_CAR = null;

function buildCarTypes() {
  const plate = () => [pick(PLATE_LETTERS), toArabicDigits(randInt(100, 9999))];
  const t = [];
  const add = (key, spr, w, opts = {}) => t.push(Object.assign({ key, spr, w, collW: w, weight: 1, speed: [0.24, 0.42], changer: 0.15, lights: [0.1, 0.42] }, opts));
  if (IMG.corolla) add('corolla', platedSprite(IMG.corolla, [0.387, 0.497, 0.23, 0.105], ...plate()), 700, { lights: [0.1, 0.45] });
  if (IMG.sunny) add('sunny', platedSprite(IMG.sunny, [0.374, 0.499, 0.229, 0.131], ...plate()), 690, { lights: [0.08, 0.45] });
  if (IMG.cerato) add('cerato', IMG.cerato, 700, { lights: [0.12, 0.4] });
  if (IMG.hilux) add('hilux', IMG.hilux, 770, { speed: [0.22, 0.38], lights: [0.07, 0.45] });
  if (IMG.microbus) add('microbus', IMG.microbus, 780, { weight: 1.6, changer: 0.75, speed: [0.26, 0.46], lights: [0.1, 0.86] });
  if (IMG.hiace) add('hiace', IMG.hiace, 770, { weight: 1.3, changer: 0.65, speed: [0.26, 0.46], lights: [0.07, 0.55] });
  if (IMG.verna) add('verna', IMG.verna, 1050, { collW: 690, weight: 0.7, lights: [0.04, 0.4] });
  if (IMG.truck) add('truck', IMG.truck, 640, { weight: 0.8, speed: [0.16, 0.26], changer: 0.05, lights: [0.08, 0.95] });
  CAR_TYPES = t;
  if (IMG.kia_rear) PLAYER_SPR = platedSprite(IMG.kia_rear, [0.387, 0.699, 0.225, 0.143], 'Galaxy', null);
  if (IMG.kia_front) START_CAR = platedSprite(IMG.kia_front, [0.122, 0.625, 0.19, 0.15], 'Galaxy', null);
}
function pickCarType() {
  const total = CAR_TYPES.reduce((s, c) => s + c.weight, 0);
  let r = Math.random() * total;
  for (const c of CAR_TYPES) { if ((r -= c.weight) <= 0) return c; }
  return CAR_TYPES[0];
}

// ---------------------------------------------------------------- procedural roadside sprites
const SPR = { lamp: null, lampL: null, buildings: [], boards: [], palms: [], signs: [] };

function buildLamp() {
  const c = makeCanvas(220, 900), g = c.getContext('2d');
  g.strokeStyle = '#8b8f94'; g.lineCap = 'round';
  g.lineWidth = 12; g.beginPath(); g.moveTo(200, 900); g.lineTo(200, 90); g.stroke();
  g.lineWidth = 8; g.beginPath(); g.moveTo(200, 95); g.quadraticCurveTo(200, 40, 140, 40); g.lineTo(30, 44); g.stroke();
  g.fillStyle = '#5d6166'; roundRect(g, 4, 36, 60, 18, 6); g.fill();
  g.fillStyle = '#fff3c4'; g.fillRect(10, 52, 48, 5);
  g.fillStyle = '#6b6f74'; g.fillRect(188, 860, 24, 40);
  SPR.lamp = { img: c, w: 760 };
  const m = makeCanvas(220, 900), mg = m.getContext('2d');
  mg.translate(220, 0); mg.scale(-1, 1); mg.drawImage(c, 0, 0);
  SPR.lampL = { img: m, w: 760 };
}

function buildBuilding(seed) {
  const floors = randInt(4, 9), fw = randInt(3, 6);
  const fh = 46, colW = 52;
  const w = fw * colW + 12, h = floors * fh + 40;
  const c = makeCanvas(w, h), g = c.getContext('2d');
  const brick = pick(['#b45a3c', '#a9503a', '#bf6a45', '#9c4b34', '#c27a52']);
  // body
  g.fillStyle = brick; g.fillRect(6, 40, w - 12, h - 40);
  // brick texture
  g.strokeStyle = 'rgba(70,30,20,.25)'; g.lineWidth = 1;
  for (let y = 44; y < h; y += 6) { g.beginPath(); g.moveTo(6, y); g.lineTo(w - 6, y); g.stroke(); }
  // concrete frame
  g.fillStyle = '#a8a197';
  for (let f = 0; f <= floors; f++) g.fillRect(4, 40 + f * fh - 3, w - 8, 7);
  for (let i = 0; i <= fw; i++) g.fillRect(4 + i * colW, 40, 8, h - 40);
  // windows
  for (let f = 0; f < floors; f++) for (let i = 0; i < fw; i++) {
    const x = 16 + i * colW, y = 40 + f * fh + 10;
    const r = Math.random();
    if (r < 0.15) continue;                          // bricked
    g.fillStyle = r < 0.55 ? '#2a221d' : '#3d4a52';
    g.fillRect(x, y, colW - 24, fh - 22);
    if (Math.random() < 0.35) { g.fillStyle = '#d8d4cc'; g.fillRect(x - 2, y + fh - 26, colW - 18, 8); } // AC / balcony
    if (Math.random() < 0.2) { // laundry
      g.strokeStyle = '#333'; g.beginPath(); g.moveTo(x - 4, y + 4); g.lineTo(x + colW - 18, y + 4); g.stroke();
      for (let k = 0; k < 3; k++) { g.fillStyle = pick(['#e94e4e', '#f2c14e', '#4e8ee9', '#fff', '#6c4']); g.fillRect(x + k * 9, y + 4, 7, 10); }
    }
  }
  // unfinished top: columns + rebar
  g.fillStyle = '#a8a197';
  for (let i = 0; i <= fw; i++) g.fillRect(4 + i * colW, 16, 8, 26);
  g.strokeStyle = '#4a3b33'; g.lineWidth = 1.5;
  for (let i = 0; i <= fw; i++) for (let k = 0; k < 3; k++) {
    const x = 6 + i * colW + k * 2.5; g.beginPath(); g.moveTo(x, 18); g.lineTo(x + rand(-2, 2), rand(0, 10)); g.stroke();
  }
  // satellite dishes
  const dishes = randInt(1, 4);
  for (let k = 0; k < dishes; k++) {
    const x = rand(20, w - 20), y = rand(22, 36);
    g.fillStyle = '#eceae6'; g.beginPath(); g.ellipse(x, y, 9, 7, -0.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#999'; g.fillRect(x - 1, y, 2, 8);
  }
  // shade
  const grd = g.createLinearGradient(0, 0, w, 0);
  grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,.18)');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  return { img: c, w: w * 13 };
}

function buildBillboard(text, sub, bg, fg) {
  const c = makeCanvas(520, 380), g = c.getContext('2d');
  g.fillStyle = '#55595e'; g.fillRect(120, 200, 18, 180); g.fillRect(382, 200, 18, 180);
  g.fillStyle = '#2e3135'; g.fillRect(10, 10, 500, 210);
  g.fillStyle = bg; g.fillRect(20, 20, 480, 190);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
  g.font = `400 78px Lalezar, Cairo, sans-serif`; g.fillText(text, 260, 95);
  g.font = `800 34px Cairo, sans-serif`; g.fillText(sub, 260, 168);
  return { img: c, w: 2800 };
}

function buildPalm() {
  const c = makeCanvas(300, 560), g = c.getContext('2d');
  g.strokeStyle = '#7a5a3a'; g.lineWidth = 16; g.lineCap = 'round';
  g.beginPath(); g.moveTo(150, 560); g.quadraticCurveTo(165, 300, 150, 120); g.stroke();
  g.strokeStyle = 'rgba(60,40,25,.6)'; g.lineWidth = 2;
  for (let y = 140; y < 550; y += 14) { g.beginPath(); g.moveTo(141, y); g.lineTo(160, y + 4); g.stroke(); }
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i - 4) * 0.42 + rand(-0.08, 0.08), len = rand(110, 140);
    g.strokeStyle = pick(['#3f7a2a', '#4f8a32', '#356b24']); g.lineWidth = 10;
    g.beginPath(); g.moveTo(150, 120);
    g.quadraticCurveTo(150 + Math.cos(a) * len * 0.6, 120 + Math.sin(a) * len * 0.6 - 20, 150 + Math.cos(a) * len, 120 + Math.sin(a) * len + 40);
    g.stroke();
  }
  return { img: c, w: 1500 };
}

function buildSign(text) {
  const c = makeCanvas(420, 300), g = c.getContext('2d');
  g.fillStyle = '#6b6f74'; g.fillRect(60, 120, 12, 180); g.fillRect(348, 120, 12, 180);
  roundRect(g, 6, 6, 408, 140, 14); g.fillStyle = '#1f6b3a'; g.fill();
  g.lineWidth = 5; g.strokeStyle = '#fff'; roundRect(g, 14, 14, 392, 124, 10); g.stroke();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
  g.font = '900 48px Cairo, sans-serif'; g.fillText(text[0], 210, 58);
  g.font = '700 30px Cairo, sans-serif'; g.direction = 'ltr'; g.fillText(text[1], 210, 110);
  return { img: c, w: 2200 };
}

// roadside "15 May" sign whose km figure is redrawn as the distance drops
const MAY15 = { km: 25, shown: -1, spr: null };
function drawMay15Sign(g, w, h, km) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#6b6f74'; g.fillRect(w * 0.14, h * 0.45, w * 0.03, h * 0.55); g.fillRect(w * 0.83, h * 0.45, w * 0.03, h * 0.55);
  roundRect(g, 6, 6, w - 12, h * 0.5, 16); g.fillStyle = '#1f6b3a'; g.fill();
  g.lineWidth = 5; g.strokeStyle = '#fff'; roundRect(g, 14, 14, w - 28, h * 0.5 - 16, 11); g.stroke();
  g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.direction = 'rtl';
  g.textAlign = 'right'; g.font = '900 54px Cairo, sans-serif'; g.fillText('١٥ مايو', w - 40, h * 0.19);
  g.textAlign = 'left'; g.font = '900 46px Cairo, sans-serif'; g.fillText(`${toArabicDigits(km)} كم`, 40, h * 0.19);
  g.font = '700 26px Cairo, sans-serif'; g.textAlign = 'center'; g.direction = 'ltr';
  g.fillText('15 MAY  ↑', w / 2, h * 0.39);
}
function updateMay15Sprite() {
  const km = Math.max(0, Math.ceil(MAY15.km));
  if (km === MAY15.shown) return;
  MAY15.shown = km;
  const c = MAY15.spr.img; drawMay15Sign(c.getContext('2d'), c.width, c.height, km);
}

function buildRoadside() {
  MAY15.spr = { img: makeCanvas(460, 320), w: 2400 };
  updateMay15Sprite();
  buildLamp();
  for (let i = 0; i < 10; i++) SPR.buildings.push(buildBuilding(i));
  SPR.boards = [
    buildBillboard('زوسر', 'للأجهزة الكهربائية', '#f4f1ea', '#c0262d'),
    buildBillboard('كمبوند الأحلام', 'مقدم ٠٪ وقسط على ٢٠ سنة', '#0f3d5e', '#ffd36b'),
    buildBillboard('كشري التحرير', 'الأصلي من ١٩٧٤', '#ffcc29', '#1b1410'),
    buildBillboard('قريباً', 'فيلم أسماء في كل السينمات', '#1b1410', '#ff7a1a'),
    buildBillboard('شيبسي', 'طعم يفرّح', '#e8262b', '#fff'),
    buildBillboard('٠١٠٠٠٠٠٦٥٥٠', 'شقق للإيجار', '#ffffff', '#e0338a'),
  ];
  for (let i = 0; i < 3; i++) SPR.palms.push(buildPalm());
  SPR.signs = [
    buildSign(['التجمع الخامس', 'New Cairo']),
    buildSign(['المعادي', 'Maadi']),
    buildSign(['مدينة نصر', 'Nasr City']),
    buildSign(['المطار', 'Cairo Airport']),
    buildSign(['الهرم', 'Pyramids']),
  ];
}

// ---------------------------------------------------------------- track
let segments = [];
let trackLength = 0;
function lastY() { return segments.length === 0 ? 0 : segments[segments.length - 1].p2.world.y; }
function addSegment(curve, y) {
  const n = segments.length;
  segments.push({
    index: n,
    p1: { world: { y: lastY(), z: n * SEG }, camera: {}, screen: {} },
    p2: { world: { y, z: (n + 1) * SEG }, camera: {}, screen: {} },
    curve, sprites: [], dark: Math.floor(n / RUMBLE) % 2,
  });
}
function addRoad(enter, hold, leave, curve, y) {
  const startY = lastY(), endY = startY + y * SEG, total = enter + hold + leave;
  for (let n = 0; n < enter; n++) addSegment(easeIn(0, curve, n / enter), easeInOut(startY, endY, n / total));
  for (let n = 0; n < hold; n++) addSegment(curve, easeInOut(startY, endY, (enter + n) / total));
  for (let n = 0; n < leave; n++) addSegment(easeInOut(curve, 0, n / leave), easeInOut(startY, endY, (enter + hold + n) / total));
}
function buildTrack() {
  segments = [];
  addRoad(40, 60, 40, 0, 0);
  for (let i = 0; i < 26; i++) {
    const len = pick([30, 50, 70]);
    const curve = pick([0, 0, 1.5, -1.5, 2.5, -2.5, 4, -4]);
    const hill = pick([0, 0, 0, 15, -15, 30, -25]);
    addRoad(len, len, len, curve, hill);
  }
  // back to ground level for a seamless loop
  addRoad(60, 60, 60, 0, -lastY() / SEG);
  addRoad(30, 30, 30, 0, 0);
  trackLength = segments.length * SEG;

  // roadside dressing
  for (let n = 10; n < segments.length; n++) {
    const s = segments[n];
    if (n % 7 === 0) s.sprites.push({ src: SPR.lampL, offset: -1.07 });           // lamps on the median barrier
    if (n % 14 === 3) s.sprites.push({ src: pick(SPR.buildings), offset: rand(2.3, 3.8) });
    if (n % 17 === 5) s.sprites.push({ src: pick(SPR.buildings), offset: -rand(2.8, 4.4) });
    if (n % 5 === 2 && Math.random() < 0.5) s.sprites.push({ src: pick(SPR.palms), offset: rand(1.35, 1.7) });
    if (n % 60 === 30) s.sprites.push({ src: pick(SPR.boards), offset: 1.3 });
    if (n % 140 === 90) s.sprites.push({ src: pick(SPR.signs), offset: 1.25 });
    if (n % 140 === 20) s.sprites.push({ src: MAY15.spr, offset: 1.25 });
  }
}
const findSegment = z => segments[Math.floor(z / SEG) % segments.length];

// ---------------------------------------------------------------- state
const keys = {};
const state = {
  mode: 'loading',     // loading | start | count | play | pause | over
  position: 0, playerX: 0, speed: 0, steer: 0,
  score: 0, best: +store.get('asmaa_best', 0) || 0, distance: 0, nearCount: 0,
  time: 0, level: 1, lives: 3, invuln: 0, shake: 0,
  combo: 1, comboTimer: 0, bubble: null, bubbleCool: 0,
  floaters: [], cars: [], skyOffset: 0, countdown: 0, hornCool: 0, braking: false,
  bgIndex: 0, bgFade: 1, sparks: [],
};

// ---------------------------------------------------------------- audio
const audio = {
  ctx: null, muted: store.get('asmaa_mute', '0') === '1', engine: null, engineGain: null, filter: null,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.5; this.master.connect(this.ctx.destination);
      this.engine = this.ctx.createOscillator(); this.engine.type = 'sawtooth'; this.engine.frequency.value = 40;
      this.engine2 = this.ctx.createOscillator(); this.engine2.type = 'square'; this.engine2.frequency.value = 20;
      this.filter = this.ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 400;
      this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
      const g2 = this.ctx.createGain(); g2.gain.value = 0.4;
      this.engine.connect(this.filter); this.engine2.connect(g2); g2.connect(this.filter);
      this.filter.connect(this.engineGain); this.engineGain.connect(this.master);
      this.engine.start(); this.engine2.start();
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
  },
  setMuted(m) { this.muted = m; store.set('asmaa_mute', m ? '1' : '0'); if (this.master) this.master.gain.value = m ? 0 : 0.5; },
  setEngine(p, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engine.frequency.setTargetAtTime(45 + p * 140, t, 0.1);
    this.engine2.frequency.setTargetAtTime(22 + p * 70, t, 0.1);
    this.filter.frequency.setTargetAtTime(300 + p * 900, t, 0.1);
    this.engineGain.gain.setTargetAtTime(on ? 0.09 + p * 0.06 : 0, t, 0.15);
  },
  tone(freqs, dur, type = 'square', vol = 0.15) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.setValueAtTime(vol, t + dur * 0.8); g.gain.linearRampToValueAtTime(0, t + dur);
    g.connect(this.master);
    for (const f of freqs) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + dur); }
  },
  horn() { this.tone([392, 494], 0.18, 'square', 0.12); setTimeout(() => this.tone([392, 494], 0.32, 'square', 0.12), 230); },
  noiseBurst(dur, freq, vol) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur);
  },
  crash() { this.noiseBurst(0.7, 500, 0.9); this.tone([70], 0.25, 'sawtooth', 0.2); },
  whoosh() { this.noiseBurst(0.35, 1400, 0.35); },
  beep(f = 660, d = 0.12) { this.tone([f], d, 'sine', 0.2); },
};

// ---------------------------------------------------------------- traffic
function laneOf(offset) { let best = 0; for (let i = 1; i < LANES; i++) if (Math.abs(LANE_X[i] - offset) < Math.abs(LANE_X[best] - offset)) best = i; return best; }
function relZ(z, from) { let d = ((z - from) % trackLength + trackLength) % trackLength; if (d > trackLength / 2) d -= trackLength; return d; }
function playerWorldZ() { return state.position + PLAYER_Z; }

function trafficTarget() { return Math.min(14 + state.level * 4, 44); }

function laneBusy(lane, z, gap, except) {
  for (const c of state.cars) {
    if (c === except) continue;
    if ((c.lane === lane || laneOf(c.offset) === lane) && Math.abs(relZ(c.z, z)) < gap) return true;
  }
  return false;
}

function spawnCar(car, minAhead, maxAhead) {
  const type = pickCarType();
  for (let tries = 0; tries < 12; tries++) {
    const z = (playerWorldZ() + rand(minAhead, maxAhead) * SEG) % trackLength;
    const lane = randInt(0, LANES - 1);
    if (laneBusy(lane, z, SEG * 5, car)) continue;
    // never wall off the whole road: at least two lanes must stay open nearby
    let busy = 0; for (let l = 0; l < LANES; l++) if (l !== lane && laneBusy(l, z, SEG * 6, car)) busy++;
    if (busy >= 2) continue;
    const lvl = state.level - 1;
    Object.assign(car, {
      type, z, lane, offset: LANE_X[lane] + rand(-0.04, 0.04),
      base: MAX_SPEED * (rand(type.speed[0], type.speed[1]) + Math.min(lvl * 0.025, 0.18)),
      speed: 0, blink: 0, blinkDir: 0, changeTimer: rand(1, 6), passed: false, hit: false, bob: rand(0, 6),
    });
    car.speed = car.base;
    return true;
  }
  car.z = -1e9; // park off-track; retried next frame
  return false;
}

function updateTraffic(dt) {
  const target = trafficTarget();
  while (state.cars.length < target) { const c = {}; state.cars.push(c); spawnCar(c, 40, DRAW_DIST * 0.95); }
  const pz = playerWorldZ();
  const changeChance = 0.25 + state.level * 0.12;

  for (const car of state.cars) {
    if (car.z < -1e8) { spawnCar(car, DRAW_DIST * 0.6, DRAW_DIST * 0.95); continue; }
    const rel = relZ(car.z, pz);
    if (rel < -SEG * 12 || rel > DRAW_DIST * SEG * 1.1) { spawnCar(car, DRAW_DIST * 0.6, DRAW_DIST * 0.95); continue; }

    // follow car ahead in same lane
    let desired = car.base;
    const myLane = laneOf(car.offset);
    for (const o of state.cars) {
      if (o === car || laneOf(o.offset) !== myLane) continue;
      const d = relZ(o.z, car.z);
      if (d > 0 && d < SEG * 4) desired = Math.min(desired, o.speed * (d < SEG * 2 ? 0.9 : 1));
    }
    // don't ram the player from behind
    if (rel < 0 && rel > -SEG * 3 && Math.abs(state.playerX - car.offset) < 0.4) desired = Math.min(desired, state.speed * 0.95);
    car.speed = lerp(car.speed, desired, Math.min(1, dt * 2));

    // Egyptian-style lane changes (with a blinker, mostly)
    car.changeTimer -= dt;
    if (car.blink > 0) {
      car.blink -= dt;
      if (car.blink <= 0) {
        const nl = car.lane + car.blinkDir;
        const nearPlayer = Math.abs(rel) < SEG * 2.5 && laneOf(state.playerX) === nl;
        if (nl >= 0 && nl < LANES && !laneBusy(nl, car.z, SEG * 3, car) && !nearPlayer) car.lane = nl;
        car.blinkDir = 0;
      }
    } else if (car.changeTimer <= 0) {
      car.changeTimer = rand(2, 7) / (0.5 + state.level * 0.25);
      if (Math.random() < car.type.changer * changeChance && rel > SEG * 4) {
        const dir = car.lane === 0 ? 1 : car.lane === LANES - 1 ? -1 : (Math.random() < 0.5 ? -1 : 1);
        if (!laneBusy(car.lane + dir, car.z, SEG * 4, car)) {
          car.blinkDir = dir;
          car.blink = Math.random() < 0.15 + state.level * 0.04 ? 0.25 : rand(0.8, 1.2); // some drivers barely signal
        }
      }
    }
    const tx = LANE_X[car.lane];
    car.offset += clamp(tx - car.offset, -dt * 0.55, dt * 0.55);
    car.z = (car.z + car.speed * dt) % trackLength;
    car.bob += dt * 9;
  }
}

function honk() {
  if (state.hornCool > 0) return;
  state.hornCool = 1.2;
  audio.horn();
  const pz = playerWorldZ(), pl = laneOf(state.playerX);
  let best = null, bestD = SEG * 30;
  for (const c of state.cars) {
    const d = relZ(c.z, pz);
    if (d > 0 && d < bestD && Math.abs(c.offset - state.playerX) < 0.35) { best = c; bestD = d; }
  }
  if (!best) return;
  const dirs = pl === 0 ? [1] : pl === LANES - 1 ? [-1] : (Math.random() < 0.5 ? [-1, 1] : [1, -1]);
  for (const dir of dirs) {
    const nl = best.lane + dir;
    if (nl >= 0 && nl < LANES && !laneBusy(nl, best.z, SEG * 3, best)) { best.blinkDir = dir; best.blink = 0.35; best.changeTimer = 4; break; }
  }
}

// ---------------------------------------------------------------- update
function setBanner(title, sub, ms = 1800) {
  const b = $('banner');
  b.innerHTML = title + (sub ? `<small>${sub}</small>` : '');
  b.classList.add('show');
  clearTimeout(setBanner.t);
  if (ms) setBanner.t = setTimeout(() => b.classList.remove('show'), ms);
}

function say(text) {
  state.bubble = { text, t: 0, life: 1.8 };
}

function addFloater(text, color) { state.floaters.push({ text, color, t: 0 }); }

function crash(car) {
  state.lives--;
  state.invuln = 2;
  state.shake = 0.5;
  state.speed = Math.min(state.speed, car.speed * 0.5);
  car.hit = true;
  car.speed = car.base * 1.1;
  state.combo = 1; state.comboTimer = 0;
  audio.crash();
  try { navigator.vibrate && navigator.vibrate(200); } catch (e) {}
  for (let i = 0; i < 26; i++) state.sparks.push({ x: W / 2 + rand(-80, 80), y: H - 170 + rand(-30, 30), vx: rand(-420, 420), vy: rand(-520, -80), t: 0, life: rand(0.4, 0.9) });
  updateLives();
  if (state.lives <= 0) { gameOver(); return; }
  say(pick(['يا ساتر!', 'إيه ده!', 'آآآه العربية!']));
}

function update(dt) {
  if (state.mode !== 'play') return;
  const pct = state.speed / MAX_SPEED;
  const accel = MAX_SPEED / 4, brake = -MAX_SPEED * 1.1, decel = -MAX_SPEED / 5;
  const cruise = MAX_SPEED * Math.min(0.64 + (state.level - 1) * 0.045, 0.95);
  const boost = keys.up ? MAX_SPEED * 0.12 : 0;
  const limit = Math.min(cruise + boost, MAX_SPEED * 1.05);

  state.time += dt;
  const newLevel = 1 + Math.floor(state.time / LEVEL_TIME);
  if (newLevel !== state.level) {
    state.level = newLevel;
    $('level').textContent = state.level;
    setBanner(`المستوى ${toArabicDigits(state.level)}`, LEVEL_TEXT[Math.min(state.level - 1, LEVEL_TEXT.length - 1)], 2200);
    audio.beep(880, 0.1); setTimeout(() => audio.beep(1175, 0.18), 120);
    state.bgIndex = (state.level - 1) % 2; state.bgFade = 0;
  }

  const playerSegment = findSegment(playerWorldZ());
  const dx = dt * 2.2 * Math.max(pct, 0.25);
  const steerIn = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
  state.steer = lerp(state.steer, steerIn, Math.min(1, dt * 10));
  state.playerX += dx * state.steer;
  state.playerX -= dx * pct * playerSegment.curve * 0.32;   // centrifugal force on curves

  state.braking = !!keys.down;
  if (keys.down) state.speed += brake * dt;
  else if (state.speed < limit) state.speed += accel * dt * (1 - state.speed / (limit * 1.15));
  else state.speed += decel * dt;

  // off road: dusty shoulder on the right, concrete barrier on the left
  if (state.playerX > 1.02) {
    if (state.speed > MAX_SPEED / 4) state.speed += -MAX_SPEED * 0.6 * dt;
    state.shake = Math.max(state.shake, 0.08);
  }
  if (state.playerX < -1.0) {
    state.playerX = -1.0;
    if (state.speed > MAX_SPEED * 0.3) {
      state.speed *= 1 - dt * 1.5; state.shake = Math.max(state.shake, 0.12);
      if (Math.random() < 0.6) state.sparks.push({ x: W / 2 - 150, y: H - 70, vx: rand(-60, 200), vy: rand(-300, -60), t: 0, life: 0.4 });
    }
  }
  state.playerX = clamp(state.playerX, -1.0, 1.35);
  state.speed = clamp(state.speed, 0, MAX_SPEED * 1.05);

  state.position = (state.position + state.speed * dt) % trackLength;
  state.skyOffset += playerSegment.curve * pct * dt * 0.06;
  state.distance += state.speed * dt;
  state.score += state.speed * dt * 0.01 * (1 + (state.level - 1) * 0.15);

  updateTraffic(dt);

  const kmh = state.speed / MAX_SPEED * 190;
  MAY15.km -= kmh * dt / 360;            // game-time: the faster she drives, the faster the kilos fall
  if (MAY15.km <= 0) {
    state.score += 1000;
    addFloater('+1000 وصلنا!', '#7dff9a');
    setBanner('وصلتي ١٥ مايو!', 'المشوار الجاي بقى...', 2200);
    audio.beep(1175, 0.2);
    MAY15.km = 25 + state.level * 5;
  }
  updateMay15Sprite();
  const signOn = kmh > 100;
  $('may15').classList.toggle('on', signOn);
  if (signOn) $('may15km').textContent = `${toArabicDigits(MAY15.km.toFixed(1))} كم`;

  // collisions + near misses
  const pz = playerWorldZ();
  for (const car of state.cars) {
    const rel = relZ(car.z, pz);
    const gap = Math.abs(state.playerX - car.offset) * ROAD_W - (PLAYER_W + car.type.collW) / 2;
    if (!car.hit && state.invuln <= 0 && rel > -40 && rel < 170 && gap < -70 && state.speed > car.speed) { crash(car); if (state.mode !== 'play') return; }
    if (rel < 0 && !car.passed) {
      car.passed = true;
      if (!car.hit && gap < 230 && gap > -70 && state.speed > MAX_SPEED * 0.3) nearMiss(gap);
    } else if (rel > 60) car.passed = false;
    if (rel < -400) car.hit = false;
  }

  if (state.comboTimer > 0) { state.comboTimer -= dt; if (state.comboTimer <= 0) state.combo = 1; }
  if (state.bubble) { state.bubble.t += dt; if (state.bubble.t > state.bubble.life) state.bubble = null; }
  state.bubbleCool -= dt; state.invuln -= dt; state.shake = Math.max(0, state.shake - dt); state.hornCool -= dt;
  state.bgFade = Math.min(1, state.bgFade + dt * 0.5);

  audio.setEngine(state.speed / MAX_SPEED, true);
}

function nearMiss(gap) {
  const close = 1 - clamp(gap, 0, 230) / 230;
  const pts = Math.round((60 + close * 140) * state.combo);
  state.score += pts;
  state.nearCount++;
  addFloater(`+${pts} قريبة!`, close > 0.6 ? '#ffd23f' : '#fff');
  state.combo = Math.min(state.combo + 1, 9); state.comboTimer = 3;
  audio.whoosh();
  if (state.bubbleCool <= 0) { say(pick(PHRASES)); state.bubbleCool = 1.1; }
}

// ---------------------------------------------------------------- render: road
function project(p, camX, camY, camZ) {
  p.camera.x = -camX; p.camera.y = (p.world.y || 0) - camY; p.camera.z = p.world.z - camZ;
  p.screen.scale = CAM_DEPTH / p.camera.z;
  p.screen.x = Math.round(W / 2 + p.screen.scale * p.camera.x * W / 2);
  p.screen.y = Math.round(HORIZON_Y - p.screen.scale * p.camera.y * H / 2);
  p.screen.w = Math.round(p.screen.scale * ROAD_W * W / 2);
}

function palette() {
  // day -> golden hour as levels climb
  const t = clamp((state.level - 1) / 5, 0, 1);
  return {
    t,
    skyTop: mixColor('#3f86d6', '#2b2d63', t), skyBot: mixColor('#b9dbf5', '#f6a25a', t),
    sand: [mixColor('#cdb68a', '#b98d62', t), mixColor('#c4ac80', '#ae835a', t)],
    road: [mixColor('#55575a', '#4a4548', t), mixColor('#5b5d60', '#4f4a4d', t)],
    haze: mixColor('#d9d2c2', '#e6a072', t),
  };
}

function polygon(x1, y1, x2, y2, x3, y3, x4, y4, color) {
  ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.closePath(); ctx.fill();
}

function drawSegment(seg, pal, fog) {
  const p1 = seg.p1.screen, p2 = seg.p2.screen;
  const x1 = p1.x, y1 = p1.y, w1 = p1.w, x2 = p2.x, y2 = p2.y, w2 = p2.w;
  const d = seg.dark;
  ctx.fillStyle = pal.sand[d]; ctx.fillRect(0, y2, W, y1 - y2 + 1);
  // curbs: black / white like Cairo flyovers
  const r1 = w1 / 14, r2 = w2 / 14;
  polygon(x1 - w1 - r1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - r2, y2, d ? '#f2f2f2' : '#1d1d1d');
  polygon(x1 + w1 + r1, y1, x1 + w1, y1, x2 + w2, y2, x2 + w2 + r2, y2, d ? '#f2f2f2' : '#1d1d1d');
  // right shoulder (dust)
  polygon(x1 + w1 + r1, y1, x1 + w1 * 1.35, y1, x2 + w2 * 1.35, y2, x2 + w2 + r2, y2, d ? '#9d9384' : '#958b7c');
  polygon(x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2, pal.road[d]);
  if (d) {
    const l1 = w1 / 60, l2 = w2 / 60, lw1 = (w1 * 2) / LANES, lw2 = (w2 * 2) / LANES;
    for (let l = 1; l < LANES; l++) {
      const lx1 = x1 - w1 + lw1 * l, lx2 = x2 - w2 + lw2 * l;
      polygon(lx1 - l1, y1, lx1 + l1, y1, lx2 + l2, y2, lx2 - l2, y2, '#e9e6dc');
    }
  }
  // edge lines
  const e1 = w1 / 70, e2 = w2 / 70;
  polygon(x1 - w1, y1, x1 - w1 + e1 * 2, y1, x2 - w2 + e2 * 2, y2, x2 - w2, y2, '#e8c33a');
  polygon(x1 + w1 - e1 * 2, y1, x1 + w1, y1, x2 + w2, y2, x2 + w2 - e2 * 2, y2, '#efefef');
  if (fog > 0.01) { ctx.globalAlpha = fog; ctx.fillStyle = pal.haze; ctx.fillRect(0, y2, W, y1 - y2 + 1); ctx.globalAlpha = 1; }
}

// concrete New-Jersey barrier on the median (drawn back-to-front with sprites)
function drawBarrier(seg, fog, pal) {
  const p1 = seg.p1.screen, p2 = seg.p2.screen;
  if (seg.p1.camera.z <= CAM_DEPTH * 10) return;
  const r1 = p1.w / 14, r2 = p2.w / 14;
  const xa = p1.x - p1.w - r1, xb = p2.x - p2.w - r2;
  const h1 = p1.scale * 520 * H / 2, h2 = p2.scale * 520 * H / 2;
  const t1 = p1.w * 0.1, t2 = p2.w * 0.1;
  // inner face
  polygon(xa, p1.y, xb, p2.y, xb - t2 * 0.3, p2.y - h2, xa - t1 * 0.3, p1.y - h1, seg.dark ? '#b5afa6' : '#aaa49b');
  // top
  polygon(xa - t1 * 0.3, p1.y - h1, xb - t2 * 0.3, p2.y - h2, xb - t2, p2.y - h2, xa - t1, p1.y - h1, '#cfc9c0');
  if (seg.index % 3 === 0) { // painted stripe
    polygon(xa, p1.y - h1 * 0.15, xb, p2.y - h2 * 0.15, xb, p2.y - h2 * 0.3, xa, p1.y - h1 * 0.3, seg.index % 6 ? '#e8c33a' : '#222');
  }
  if (fog > 0.01) {
    ctx.globalAlpha = fog; polygon(xa, p1.y, xb, p2.y, xb - t2, p2.y - h2, xa - t1, p1.y - h1, pal.haze); ctx.globalAlpha = 1;
  }
}

function drawSprite(img, worldW, scale, x, y, offsetX, clipY, alpha = 1, flipX = false) {
  const destW = worldW * scale * W / 2;
  const destH = destW * img.height / img.width;
  const dx = x + destW * offsetX, dy = y - destH;
  const clipH = clipY ? Math.max(0, dy + destH - clipY) : 0;
  if (clipH >= destH || destW < 1 || dx > W || dx + destW < 0) return null;
  const sh = img.height - img.height * clipH / destH;
  if (alpha < 1) ctx.globalAlpha = alpha;
  if (flipX) { ctx.save(); ctx.translate(dx + destW, dy); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, img.width, sh, 0, 0, destW, destH - clipH); ctx.restore(); }
  else ctx.drawImage(img, 0, 0, img.width, sh, dx, dy, destW, destH - clipH);
  if (alpha < 1) ctx.globalAlpha = 1;
  return { dx, dy, destW, destH, clipH };
}

function drawBackground(pal) {
  const g = ctx.createLinearGradient(0, 0, 0, H * 0.55);
  g.addColorStop(0, pal.skyTop); g.addColorStop(1, pal.skyBot);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const imgs = [IMG.bg_cairo, IMG.bg_ring];
  const horizon = HORIZON_Y + 18;
  const drawBg = (img, alpha) => {
    if (!img || alpha <= 0) return;
    const scale = (W * 1.5) / img.width;
    const w = img.width * scale, h = img.height * scale;
    const y = horizon - h;
    let off = ((state.skyOffset * w) % (w * 2) + w * 2) % (w * 2);
    ctx.globalAlpha = alpha * 0.92;
    for (let k = -1; k < 3; k++) {
      const x = k * w - off;
      if (x > W || x + w < 0) continue;
      if (k % 2 === 0 || k % 2 === -0) ctx.drawImage(img, x, y, w, h);
      else { ctx.save(); ctx.translate(x + w, y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, w, h); ctx.restore(); }
    }
    ctx.globalAlpha = 1;
  };
  const cur = imgs[state.bgIndex], prev = imgs[1 - state.bgIndex];
  if (state.bgFade < 1) drawBg(prev, 1);
  drawBg(cur, state.bgFade);
  // golden-hour tint over the photo backdrop
  if (pal.t > 0) {
    const tg = ctx.createLinearGradient(0, 0, 0, horizon);
    tg.addColorStop(0, `rgba(60,40,110,${pal.t * 0.45})`); tg.addColorStop(1, `rgba(255,140,60,${pal.t * 0.4})`);
    ctx.fillStyle = tg; ctx.fillRect(0, 0, W, horizon);
  }
  // smog layer
  const hz = ctx.createLinearGradient(0, horizon - 90, 0, horizon + 10);
  hz.addColorStop(0, 'rgba(0,0,0,0)'); hz.addColorStop(1, pal.haze);
  ctx.globalAlpha = 0.55; ctx.fillStyle = hz; ctx.fillRect(0, horizon - 90, W, 100); ctx.globalAlpha = 1;
}

function drawCar(car, seg, clip, fog) {
  const rel = relZ(car.z, playerWorldZ());
  const passFade = rel < 0 ? clamp(1 + rel / 260, 0, 1) : 1;
  if (passFade <= 0) return;
  const pct = (car.z % SEG) / SEG;
  const s1 = seg.p1.screen, s2 = seg.p2.screen;
  const scale = lerp(s1.scale, s2.scale, pct);
  if (!(scale > 0)) return;
  const x = lerp(s1.x, s2.x, pct) + scale * car.offset * ROAD_W * W / 2;
  const y = lerp(s1.y, s2.y, pct) + Math.sin(car.bob) * scale * 6 * H / 2;
  const img = car.type.spr;
  const destW = car.type.w * scale * W / 2;
  // shadow
  ctx.fillStyle = `rgba(0,0,0,${0.35 * passFade})`;
  ctx.beginPath(); ctx.ellipse(x, y - destW * 0.01, destW * 0.52, destW * 0.06, 0, 0, Math.PI * 2);
  if (!clip || y < clip) ctx.fill();
  const r = drawSprite(img, car.type.w, scale, x, y, -0.5, clip, (1 - fog * 0.85) * passFade);
  if (!r) return;
  // blinker
  if (car.blink > 0 && Math.floor(car.blink * 7) % 2 === 0) {
    const bx = car.blinkDir > 0 ? r.dx + r.destW * (1 - car.type.lights[0]) : r.dx + r.destW * car.type.lights[0];
    const by = r.dy + r.destH * car.type.lights[1];
    if (!clip || by < clip) {
      const rad = Math.max(3, r.destW * 0.09);
      const gr = ctx.createRadialGradient(bx, by, 0, bx, by, rad);
      gr.addColorStop(0, 'rgba(255,220,120,1)'); gr.addColorStop(0.4, 'rgba(255,150,20,.9)'); gr.addColorStop(1, 'rgba(255,120,0,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(bx, by, rad, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawPlayer() {
  const img = PLAYER_SPR;
  if (!img) return;
  const destW = PLAYER_W / CAM_H * W / 2;
  const destH = destW * img.height / img.width;
  const bounce = state.speed > 0 ? Math.sin(state.time * 30) * (state.playerX > 1.02 ? 3 : 0.8) : 0;
  const x = W / 2 + state.steer * 6, y = HORIZON_Y + H / 2 - 8 + bounce;
  if (state.invuln > 0 && Math.floor(state.invuln * 10) % 2 === 0) return;
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.beginPath(); ctx.ellipse(x, y - 4, destW * 0.55, 14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(state.steer * 0.035);
  ctx.drawImage(img, -destW / 2, -destH, destW, destH);
  if (state.braking) {
    ctx.globalCompositeOperation = 'lighter';
    for (const fx of [0.17, 0.83]) {
      const bx = -destW / 2 + destW * fx, by = -destH + destH * 0.33;
      const gr = ctx.createRadialGradient(bx, by, 0, bx, by, destW * 0.13);
      gr.addColorStop(0, 'rgba(255,90,70,.95)'); gr.addColorStop(1, 'rgba(255,0,0,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(bx, by, destW * 0.13, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
  return { x, top: y - destH };
}

function drawBubble(anchorX, anchorY) {
  const b = state.bubble; if (!b) return;
  const pop = Math.min(1, b.t / 0.12), fade = b.t > b.life - 0.25 ? (b.life - b.t) / 0.25 : 1;
  ctx.save();
  ctx.globalAlpha = Math.max(0, fade);
  ctx.font = '900 34px Cairo, sans-serif';
  ctx.direction = 'rtl';
  const tw = ctx.measureText(b.text).width;
  const bw = tw + 56, bh = 70;
  const bx = anchorX - bw / 2 + 70, by = anchorY - bh - 46;
  ctx.translate(anchorX + 20, anchorY - 30); ctx.scale(0.6 + 0.4 * pop, 0.6 + 0.4 * pop); ctx.translate(-(anchorX + 20), -(anchorY - 30));
  // tail
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1b1410'; ctx.lineWidth = 4;
  roundRect(ctx, bx, by, bw, bh, 30); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(anchorX + 10, by + bh - 2); ctx.lineTo(anchorX - 14, anchorY - 20); ctx.lineTo(anchorX + 40, by + bh - 2); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(anchorX + 10, by + bh); ctx.lineTo(anchorX - 14, anchorY - 20); ctx.lineTo(anchorX + 40, by + bh); ctx.stroke();
  ctx.fillStyle = '#1b1410'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(b.text, bx + bw / 2, by + bh / 2 + 2);
  // little "اسماء" tag
  ctx.font = '800 16px Cairo, sans-serif'; ctx.fillStyle = '#ff7a1a';
  ctx.fillText('أسماء', bx + bw - 36, by - 8);
  ctx.restore();
}

function render(dt) {
  const pal = palette();
  ctx.save();
  if (state.shake > 0) ctx.translate(rand(-1, 1) * state.shake * 22, rand(-1, 1) * state.shake * 14);
  drawBackground(pal);

  const base = findSegment(state.position);
  const basePct = (state.position % SEG) / SEG;
  const playerSeg = findSegment(playerWorldZ());
  const playerPct = (playerWorldZ() % SEG) / SEG;
  const playerY = lerp(playerSeg.p1.world.y, playerSeg.p2.world.y, playerPct);
  let maxy = H, x = 0, dx = -(base.curve * basePct);

  const visible = [];
  for (let n = 0; n < DRAW_DIST; n++) {
    const seg = segments[(base.index + n) % segments.length];
    const looped = seg.index < base.index;
    seg.clip = maxy;
    seg.fog = 1 - Math.exp(-Math.pow(n / DRAW_DIST, 2) * 3.2);
    const camZ = state.position - (looped ? trackLength : 0);
    project(seg.p1, state.playerX * ROAD_W - x, playerY + CAM_H, camZ);
    project(seg.p2, state.playerX * ROAD_W - x - dx, playerY + CAM_H, camZ);
    x += dx; dx += seg.curve;
    visible[n] = seg;
    if (seg.p1.camera.z <= CAM_DEPTH || seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxy) continue;
    drawSegment(seg, pal, seg.fog);
    maxy = seg.p1.screen.y;
  }

  // bucket cars by segment
  const bySeg = new Map();
  for (const car of state.cars) {
    if (car.z < 0) continue;
    const si = Math.floor(car.z / SEG) % segments.length;
    if (!bySeg.has(si)) bySeg.set(si, []);
    bySeg.get(si).push(car);
  }

  let playerInfo = null;
  for (let n = DRAW_DIST - 1; n > 0; n--) {
    const seg = visible[n];
    if (seg.p1.camera.z <= 0) continue;
    drawBarrier(seg, seg.fog, pal);
    for (const s of seg.sprites) {
      const sc = seg.p1.screen.scale;
      const sx = seg.p1.screen.x + sc * s.offset * ROAD_W * W / 2;
      drawSprite(s.src.img, s.src.w, sc, sx, seg.p1.screen.y, s.offset < 0 ? -1 : 0, seg.clip, 1 - seg.fog * 0.8);
    }
    const cars = bySeg.get(seg.index);
    if (cars) { cars.sort((a, b) => b.z - a.z); for (const c of cars) drawCar(c, seg, seg.clip, seg.fog); }
    if (seg === playerSeg && state.mode !== 'start') playerInfo = drawPlayer();
  }
  if (!playerInfo && state.mode !== 'start') playerInfo = drawPlayer();

  // sparks
  for (let i = state.sparks.length - 1; i >= 0; i--) {
    const p = state.sparks[i]; p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt;
    if (p.t > p.life) { state.sparks.splice(i, 1); continue; }
    ctx.fillStyle = `rgba(255,${180 + Math.random() * 70 | 0},60,${1 - p.t / p.life})`;
    ctx.fillRect(p.x, p.y, 4, 4);
  }
  ctx.restore();

  if (playerInfo) drawBubble(playerInfo.x, playerInfo.top);

  // floaters
  for (let i = state.floaters.length - 1; i >= 0; i--) {
    const f = state.floaters[i]; f.t += dt;
    if (f.t > 1.1) { state.floaters.splice(i, 1); continue; }
    ctx.save(); ctx.globalAlpha = 1 - f.t / 1.1; ctx.direction = 'rtl';
    ctx.font = '900 30px Cairo, sans-serif'; ctx.textAlign = 'center';
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.fillStyle = f.color;
    const fy = H * 0.42 - f.t * 70;
    ctx.strokeText(f.text, W / 2 - 260, fy); ctx.fillText(f.text, W / 2 - 260, fy);
    ctx.restore();
  }

  // speed lines when flying
  const p = state.speed / MAX_SPEED;
  if (p > 0.8 && state.mode === 'play') {
    ctx.strokeStyle = `rgba(255,255,255,${(p - 0.8) * 1.2})`; ctx.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      const a = rand(0, Math.PI * 2), r0 = rand(260, 400), r1 = r0 + rand(60, 160);
      ctx.beginPath(); ctx.moveTo(W / 2 + Math.cos(a) * r0, H / 2 + Math.sin(a) * r0 * 0.6); ctx.lineTo(W / 2 + Math.cos(a) * r1, H / 2 + Math.sin(a) * r1 * 0.6); ctx.stroke();
    }
  }

  // countdown
  if (state.mode === 'count') {
    const n = Math.ceil(state.countdown);
    const txt = n > 0 ? toArabicDigits(n) : 'يلا!';
    const fr = state.countdown - Math.floor(state.countdown);
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `400 ${150 + fr * 60}px Lalezar, Cairo, sans-serif`;
    ctx.lineWidth = 12; ctx.strokeStyle = '#c4520a'; ctx.fillStyle = '#fff';
    ctx.strokeText(txt, W / 2, H * 0.4); ctx.fillText(txt, W / 2, H * 0.4);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- start screen scene
const clouds = Array.from({ length: 6 }, () => ({ x: rand(0, W), y: rand(30, 220), s: rand(0.6, 1.3), v: rand(6, 16) }));
function drawCloud(x, y, s) {
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  for (const [dx, dy, r] of [[0, 0, 34], [36, -14, 42], [78, 0, 32], [40, 12, 34]]) { ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2); ctx.fill(); }
}
function drawStart(dt, time) {
  const hz = 400;
  const g = ctx.createLinearGradient(0, 0, 0, hz);
  g.addColorStop(0, '#2f78d0'); g.addColorStop(1, '#a9d1f3');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (const c of clouds) { c.x += c.v * dt; if (c.x > W + 100) c.x = -200; drawCloud(c.x, c.y, c.s); }
  // sandstone formations (Wadi El Hitan vibes)
  ctx.fillStyle = '#d6a964';
  ctx.beginPath(); ctx.moveTo(0, hz);
  const peaks = [[0, 330], [60, 300], [110, 312], [150, 270], [230, 262], [260, 290], [330, 300], [380, 276], [470, 270], [520, 300], [600, 310], [640, 288], [720, 282], [780, 300], [880, 296], [940, 270], [1050, 262], [1100, 290], [1200, 300], [1280, 290]];
  for (const [px, py] of peaks) ctx.lineTo(px, py);
  ctx.lineTo(W, hz); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(150,100,50,.35)';
  for (const [px, py] of peaks) if (Math.random() < 0) ctx.fillRect(px, py, 1, 1);
  ctx.fillRect(0, 330, W, 6);
  ctx.fillStyle = '#e8c17c';
  ctx.beginPath(); ctx.moveTo(0, hz); ctx.bezierCurveTo(300, 345, 700, 380, W, 340); ctx.lineTo(W, hz + 20); ctx.lineTo(0, hz + 20); ctx.fill();
  // ground
  const sg = ctx.createLinearGradient(0, hz, 0, H);
  sg.addColorStop(0, '#e7c58c'); sg.addColorStop(1, '#c99d62');
  ctx.fillStyle = sg; ctx.fillRect(0, hz, W, H - hz);
  // footprints
  ctx.fillStyle = 'rgba(140,95,50,.18)';
  for (let i = 0; i < 14; i++) { ctx.beginPath(); ctx.ellipse(200 + i * 22 + (i % 2) * 8, 700 - i * 18, 7, 4, 0.3, 0, Math.PI * 2); ctx.fill(); }

  // the car and Asmaa
  const car = START_CAR, asmaa = IMG.asmaa;
  const groundY = 668;
  if (car) {
    const cw = 610, ch = cw * car.height / car.width;
    const cx = 40, cy = groundY - ch + 6;
    ctx.fillStyle = 'rgba(70,40,15,.35)'; ctx.beginPath(); ctx.ellipse(cx + cw * 0.52, groundY - 8, cw * 0.5, 26, 0, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(car, cx, cy, cw, ch);
  }
  if (asmaa) {
    // standing right beside the driver's door, a step in front of the car
    const ah = 430, aw = ah * asmaa.width / asmaa.height;
    const ax = 450, ay = groundY + 16 - ah + Math.sin(time * 2) * 1.5;
    ctx.fillStyle = 'rgba(70,40,15,.4)'; ctx.beginPath(); ctx.ellipse(ax + aw * 0.62, groundY + 12, aw * 0.62, 14, 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(asmaa, ax, ay, aw, ah);
    // speech bubble, above the car roof and pointing at her
    const t = (time % 6);
    if (t < 3.2) {
      ctx.save(); ctx.direction = 'rtl'; ctx.font = '900 28px Cairo, sans-serif';
      const txt = 'جاهزة؟ يلا بينا!'; const tw = ctx.measureText(txt).width;
      const bw = tw + 44, bx = ax + aw * 0.4 - bw, by = ay - 10;
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1b1410'; ctx.lineWidth = 4;
      roundRect(ctx, bx, by - 64, bw, 60, 26); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx + bw - 60, by - 6); ctx.lineTo(bx + bw + 4, by + 26); ctx.lineTo(bx + bw - 24, by - 6); ctx.fill();
      ctx.fillStyle = '#1b1410'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, bx + bw / 2, by - 33);
      ctx.restore();
    }
  }
  // warm sun glare
  const sun = ctx.createRadialGradient(60, 40, 0, 60, 40, 420);
  sun.addColorStop(0, 'rgba(255,240,200,.55)'); sun.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------- online leaderboard
// Shared top scores when the game runs as a claude.ai artifact (db + user capabilities).
// Each player owns one doc, scores/<their id>; everyone reads the collection.
const board = { db: null, user: null, uid: null, rows: [] };
async function initBoard() {
  if (!window.claude || !window.claude.use) return;
  try {
    const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    if (!db) return;
    board.db = db; board.user = user;
    board.uid = user ? await user.id() : null;
    if (board.uid) {
      const mine = await db.doc('scores/' + board.uid).get();
      const b = mine.exists ? +mine.data().best || 0 : 0;
      if (b > state.best) { state.best = b; store.set('asmaa_best', b); refreshBest(); }
    }
    db.collection('scores').orderBy('best', 'desc').limit(5).onSnapshot(snap => {
      board.rows = snap.docs.map(d => ({ id: d.id, best: Math.floor(+d.data().best || 0) }));
      renderBoard();
    }, () => {});
  } catch (e) { /* offline or not in an artifact: local best only */ }
}
async function renderBoard() {
  const rows = board.rows;
  const profiles = board.user && rows.length ? await board.user.profiles(rows.map(r => r.id)) : {};
  for (const listId of ['boardStart', 'boardOver']) {
    const ol = $(listId); if (!ol) continue;
    ol.replaceChildren();
    rows.forEach((r, i) => {
      const li = document.createElement('li');
      if (r.id === board.uid) li.className = 'me';
      const rank = document.createElement('span'); rank.className = 'rk'; rank.textContent = toArabicDigits(i + 1);
      const name = document.createElement('span'); name.className = 'nm';
      name.textContent = (profiles[r.id] && profiles[r.id].name) || (r.id === board.uid ? 'إنتي' : 'سواق مجهول');
      const sc = document.createElement('span'); sc.className = 'sc'; sc.textContent = r.best.toLocaleString('en');
      li.append(rank, name, sc); ol.append(li);
    });
    ol.closest('.board').hidden = rows.length === 0;
  }
}
async function submitScore(sc) {
  if (!board.db || !board.uid) return;
  try {
    const ref = board.db.doc('scores/' + board.uid);
    const snap = await ref.get();
    if (!snap.exists || sc > (+snap.data().best || 0)) await ref.set({ best: sc, at: new Date().toISOString() });
  } catch (e) { /* this viewer can't write (view-only); the local best still counts */ }
}
function refreshBest() {
  const b = Math.floor(state.best).toLocaleString('en');
  $('bestStart').textContent = b; $('best').textContent = b;
}

// ---------------------------------------------------------------- flow
function showScreen(id) {
  for (const s of ['start', 'hud', 'pause', 'over']) $(s).classList.toggle('on', s === id || (id === 'pause' && s === 'hud'));
}
function updateLives() { $('lives').textContent = '❤'.repeat(Math.max(0, state.lives)) + '♡'.repeat(Math.max(0, 3 - state.lives)); }

function resetGame() {
  Object.assign(state, {
    position: 0, playerX: 0.25, speed: 0, steer: 0, score: 0, distance: 0, nearCount: 0,
    time: 0, level: 1, lives: 3, invuln: 0, shake: 0, combo: 1, comboTimer: 0, bubble: null, bubbleCool: 0,
    floaters: [], cars: [], skyOffset: 0, hornCool: 0, bgIndex: 0, bgFade: 1, sparks: [],
  });
  MAY15.km = 25; $('may15').classList.remove('on');
  $('level').textContent = '1'; $('best').textContent = Math.floor(state.best); updateLives();
}

function startGame() {
  audio.init();
  if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
  resetGame();
  for (let i = 0; i < trafficTarget(); i++) { const c = {}; state.cars.push(c); spawnCar(c, 25, DRAW_DIST * 0.95); }
  state.mode = 'count'; state.countdown = 3.0;
  showScreen('hud');
  audio.beep(520, 0.12);
}

function gameOver() {
  state.mode = 'over';
  $('may15').classList.remove('on');
  audio.setEngine(0, false);
  const sc = Math.floor(state.score);
  const rec = sc > state.best;
  if (rec) { state.best = sc; store.set('asmaa_best', sc); }
  submitScore(sc);
  $('finalScore').textContent = sc.toLocaleString('en');
  $('finalBest').textContent = Math.floor(state.best).toLocaleString('en');
  $('finalDist').textContent = (state.distance / 50000).toFixed(1);
  $('finalNear').textContent = state.nearCount;
  $('newRecord').hidden = !rec;
  $('overTitle').textContent = rec ? 'أقل حاجة عند أسماء!' : 'خلصت يا أسماء!';
  $('bestStart').textContent = Math.floor(state.best).toLocaleString('en');
  setTimeout(() => showScreen('over'), 650);
}

function goHome() {
  state.mode = 'start';
  audio.setEngine(0, false);
  $('bestStart').textContent = Math.floor(state.best).toLocaleString('en');
  showScreen('start');
}

function pause(on) {
  if (on && state.mode === 'play') { state.mode = 'pause'; audio.setEngine(0, false); showScreen('pause'); }
  else if (!on && state.mode === 'pause') { state.mode = 'play'; showScreen('hud'); }
}

// ---------------------------------------------------------------- input
const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down' };
addEventListener('keydown', e => {
  if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (e.code === 'Space' || e.code === 'KeyH') { e.preventDefault(); if (state.mode === 'play') honk(); }
  if (e.code === 'Escape' || e.code === 'KeyP') pause(state.mode === 'play');
  if (e.code === 'Enter') {
    if (state.mode === 'start' || state.mode === 'over') startGame();
    else if (state.mode === 'pause') pause(false);
  }
});
addEventListener('keyup', e => { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
const TEST = new URLSearchParams(location.search).has('test');
if (TEST) window.__asmaa = { state, keys, honk, step(n) { for (let i = 0; i < n; i++) { last -= 1000 / 60; frame(performance.now(), true); } } };
document.addEventListener('visibilitychange', () => { if (document.hidden && !TEST) pause(true); });

function bindHold(el, key) {
  const on = e => { e.preventDefault(); keys[key] = true; };
  const off = e => { e.preventDefault(); keys[key] = false; };
  el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off);
  el.addEventListener('pointerleave', off); el.addEventListener('pointercancel', off);
}
bindHold($('tLeft'), 'left'); bindHold($('tRight'), 'right'); bindHold($('tBrake'), 'down');
$('tHorn').addEventListener('pointerdown', e => { e.preventDefault(); if (state.mode === 'play') honk(); });
if (matchMedia('(pointer: coarse)').matches) $('touch').classList.add('on');

$('go').onclick = startGame;
$('again').onclick = startGame;
$('home').onclick = goHome;
$('resume').onclick = () => pause(false);
$('quit').onclick = goHome;
$('mute').onclick = () => { audio.init(); audio.setMuted(!audio.muted); $('mute').textContent = audio.muted ? '🔇' : '🔊'; };
$('mute').textContent = audio.muted ? '🔇' : '🔊';

// ---------------------------------------------------------------- loop
var last = performance.now(), startTime = 0;
function frame(now, manual) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; startTime += dt;
  if (state.mode === 'start') drawStart(dt, startTime);
  else if (state.mode !== 'loading') {
    if (state.mode === 'count') {
      state.countdown -= dt;
      if (state.countdown <= -0.4) { state.mode = 'play'; setBanner('المستوى ١', LEVEL_TEXT[0], 1800); audio.beep(990, 0.25); }
      else if (Math.ceil(state.countdown) !== Math.ceil(state.countdown + dt) && state.countdown > 0) audio.beep(520, 0.12);
      else if (state.countdown <= 0 && state.countdown + dt > 0) audio.beep(990, 0.25);
    }
    update(dt);
    render(state.mode === 'pause' ? 0 : dt);
    if (state.mode === 'play' || state.mode === 'count') {
      $('score').textContent = Math.floor(state.score).toLocaleString('en');
      $('speed').textContent = Math.round(state.speed / MAX_SPEED * 190);
      $('combo').classList.toggle('on', state.combo > 1);
      $('comboV').textContent = 'x' + state.combo;
    }
  }
  if (!manual) requestAnimationFrame(frame);
}

async function boot() {
  const fontsReady = document.fonts ? Promise.race([
    Promise.all([document.fonts.load('400 40px Lalezar'), document.fonts.load('900 40px Cairo'), document.fonts.load('800 40px Cairo')]),
    new Promise(r => setTimeout(r, 2500)),
  ]) : Promise.resolve();
  await Promise.all([
    ...IMG_LIST.map(n => loadImage(n, `assets/${n}.png?v=7`)),
    loadImage('bg_cairo', 'assets/bg_cairo.jpg?v=7'), loadImage('bg_ring', 'assets/bg_ring.jpg?v=7'),
    fontsReady,
  ]);
  buildCarTypes();
  buildRoadside();
  buildTrack();
  $('loading').remove();
  $('bestStart').textContent = Math.floor(state.best).toLocaleString('en');
  $('best').textContent = Math.floor(state.best).toLocaleString('en');
  goHome();
  requestAnimationFrame(frame);
  initBoard();
}
boot();
})();
