import { View } from './world/iso.js';
import { ROOM, ITEMS, WALL_THINGS, drawItem, drawBackground, drawWallOverlay, drawFrontWalls, wallIsBack, wallLine } from './world/office.js';
import { Agent, CAST, drawAgent, resetReservations } from './world/people.js';
import { Director } from './world/director.js';
import { wallQuad } from './world/iso.js';
import { Bus } from './engine/bus.js';
import { Orchestra } from './engine/agents.js';
import { Replay } from './engine/replay.js';
import { renderMarkdown } from './engine/markdown.js';
import { PRICE } from './engine/api.js';
import { t, getLang, setLang, applyStatic } from './i18n.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#view');
const ctx = canvas.getContext('2d');

// ------------------------------------------------------------------ world

const view = new View(ROOM.W, ROOM.D, 0, ROOM.wallH);
const buffer = document.createElement('canvas');
const bg = document.createElement('canvas');
const pick = document.createElement('canvas');
const g = buffer.getContext('2d');
const pg = pick.getContext('2d', { willReadFrequently: true });

const bgc = bg.getContext('2d', { willReadFrequently: true });
function sizeBuffers() {
  for (const c of [buffer, bg, pick]) { c.width = view.width; c.height = view.height; }
  drawBackground(bgc, view);
}
sizeBuffers();

const agents = CAST.map((spec) => new Agent(spec, spec.home));
const dyn = { notes: [], screens: {}, answers: 0, criticPapers: 0 };
const director = new Director(agents, dyn, logFeed);

// ------------------------------------------------------------------ camera

const cam = { zoom: 3, x: 0, y: 0, auto: true, shift: 0, shiftTarget: 0 };
let dpr = 1;
function resize() {
  dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  if (cam.auto) fit();
}
function fit() {
  const wide = innerWidth >= 1000;
  const usableH = innerHeight - (innerWidth < 760 ? 170 : 150);
  const usableW = innerWidth - (wide ? 360 : innerWidth < 760 ? 10 : 80);
  // phones: zoom in past the width so the people are big enough; drag to see the rest
  const widthBoost = innerWidth < 760 ? 1.7 : 1;
  cam.zoom = Math.max(1, Math.min(6, Math.floor(Math.min((usableW * widthBoost) / view.width, usableH / view.height) * dpr * 2) / 2));
  cam.x = wide ? -150 : 0; // leave room for the activity feed on the right
  cam.y = innerWidth < 760 ? -10 : 10;
}
addEventListener('resize', resize);
resize();

/** Where the buffer's top-left lands on the display canvas (device pixels). */
function origin() {
  const z = cam.zoom;
  return [Math.round(canvas.width / 2 - (view.width * z) / 2 + (cam.x + cam.shift) * dpr), Math.round(canvas.height / 2 - (view.height * z) / 2 + cam.y * dpr)];
}
function toBuffer(clientX, clientY) {
  const [ox, oy] = origin();
  return [(clientX * dpr - ox) / cam.zoom, (clientY * dpr - oy) / cam.zoom];
}

function setZoom(z, cx = innerWidth / 2, cy = innerHeight / 2) {
  const nz = Math.max(1, Math.min(8, z));
  if (nz === cam.zoom) return;
  const [bx, by] = toBuffer(cx, cy);
  cam.zoom = nz;
  const [ox, oy] = origin();
  cam.x += (cx * dpr - (ox + bx * nz)) / dpr;
  cam.y += (cy * dpr - (oy + by * nz)) / dpr;
  cam.auto = false;
}
function turn(d) {
  view.setRot(view.rot + d);
  sizeBuffers();
}

let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false };
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('dragging');
});
canvas.addEventListener('pointermove', (e) => {
  mouse = { x: e.clientX, y: e.clientY };
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
  cam.x = drag.cx + dx;
  cam.y = drag.cy + dy;
  cam.auto = false;
});
const endDrag = () => { drag = null; canvas.classList.remove('dragging'); };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('pointerleave', () => { mouse = null; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  setZoom(cam.zoom + (e.deltaY < 0 ? 0.5 : -0.5), e.clientX, e.clientY);
}, { passive: false });
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (e.key === 'q' || e.key === 'Q' || e.key === 'й' || e.key === 'Й') turn(-1);
  if (e.key === 'e' || e.key === 'E' || e.key === 'у' || e.key === 'У') turn(1);
  if (e.key === '+' || e.key === '=') setZoom(cam.zoom + 0.5);
  if (e.key === '-') setZoom(cam.zoom - 0.5);
});
$('#turnL').addEventListener('click', () => turn(-1));
$('#turnR').addEventListener('click', () => turn(1));
$('#zoomIn').addEventListener('click', () => setZoom(cam.zoom + 0.5));
$('#zoomOut').addEventListener('click', () => setZoom(cam.zoom - 0.5));
let paused = false;
$('#pauseBtn').addEventListener('click', () => {
  paused = !paused;
  $('#pauseBtn').textContent = paused ? '▶' : '❚❚';
  $('#pauseBtn').dataset.i18nLabel = paused ? 'play' : 'pause';
  applyStatic();
});

// ------------------------------------------------------------------ drawing

function depthOfItem(it) {
  const r = view.rect(...it.rect);
  return r.x + r.w / 2 + r.y + r.d / 2;
}
function depthOfAgent(a) {
  const [x, y] = view.rot2(a.x, a.y);
  return x + y + 0.08;
}

const boxes = new Map(); // agent id → bbox in buffer pixels

function drawScene(time) {
  g.clearRect(0, 0, buffer.width, buffer.height);
  g.drawImage(bg, 0, 0);
  drawWallOverlay(g, view, dyn, time);
  const list = [
    ...ITEMS.map((it) => ({ d: depthOfItem(it), draw: (c) => drawItem(c, view, it, dyn, time), id: `item:${it.id}` })),
    ...agents.map((a) => ({ d: depthOfAgent(a), draw: (c) => { const b = drawAgent(c, view, a, time); if (c === g) boxes.set(a.id, b); }, id: `agent:${a.id}` })),
  ].sort((p, q) => p.d - q.d);
  for (const it of list) it.draw(g);
  drawFrontWalls(g, view);
  return list;
}

let drawables = [];
let last = performance.now();
let mouse = null;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const time = now / 1000;
  if (!paused) for (const a of agents) a.update(dt, time);
  // slide the office aside while the answer panel is open
  cam.shift += (cam.shiftTarget - cam.shift) * Math.min(1, dt * 6);
  dyn.coffeeBusy = agents.some((a) => a.spot?.startsWith('coffee') && !a.moving);
  for (const s of Object.values(dyn.screens || {})) s.tick = (s.tick + dt * 0.8) % 1;

  drawables = drawScene(time);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  const [ox, oy] = origin();
  ctx.drawImage(buffer, ox, oy, buffer.width * cam.zoom, buffer.height * cam.zoom);

  placeBubbles(ox, oy, time);
  if (mouse && !drag) hover(mouse);
  else $('#tip').hidden = true;
  if (state.running) updateStatus();
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------ bubbles

const bubbleEls = new Map();
function placeBubbles(ox, oy, time) {
  const layer = $('#bubbles');
  for (const a of agents) {
    let el = bubbleEls.get(a.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'bubble';
      el.style.setProperty('--role', `var(--c-${a.role})`);
      layer.appendChild(el);
      bubbleEls.set(a.id, el);
    }
    const b = boxes.get(a.id);
    const live = a.bubble && a.bubble.until > time;
    if (!b || !live) { el.classList.add('fade'); if (!live) setTimeout(() => { if (!a.bubble || a.bubble.until <= performance.now() / 1000) el.hidden = true; }, 220); continue; }
    el.hidden = false;
    el.classList.remove('fade');
    el.className = `bubble ${a.bubble.kind || ''}`;
    if (el.textContent !== a.bubble.text) el.textContent = a.bubble.text;
    el.style.left = `${(ox + b.headX * cam.zoom) / dpr}px`;
    el.style.top = `${(oy + (b.headY - 3) * cam.zoom) / dpr - 6}px`;
  }
}

// ------------------------------------------------------------------ hover names

let lastPick = 0;
let tipText = '';
function hover({ x, y }) {
  const now = performance.now();
  if (now - lastPick > 60) {
    lastPick = now;
    tipText = pickAt(x, y);
  }
  const tip = $('#tip');
  if (!tipText) { tip.hidden = true; return; }
  tip.hidden = false;
  tip.innerHTML = tipText;
  tip.style.left = `${Math.min(x + 14, innerWidth - tip.offsetWidth - 8)}px`;
  tip.style.top = `${y + 16}px`;
}

function idColor(i) {
  return `rgb(${(i >> 16) & 255},${(i >> 8) & 255},${i & 255})`;
}

function pickAt(clientX, clientY) {
  const [bx, by] = toBuffer(clientX, clientY).map(Math.floor);
  if (bx < 0 || by < 0 || bx >= pick.width || by >= pick.height) return '';
  pg.clearRect(0, 0, pick.width, pick.height);
  // A context whose colour can't be changed by the drawing code: everything paints in one id colour.
  const flat = {
    set fillStyle(_) {},
    get fillStyle() { return pg.fillStyle; },
    fillRect: (...a) => pg.fillRect(...a),
    clearRect: (...a) => pg.clearRect(...a),
  };
  const ids = [];
  // walls first (furthest back)
  WALL_THINGS.forEach((w) => {
    if (!wallIsBack(view, w.side)) return;
    ids.push(`wall:${w.name || w.kind}`);
    pg.fillStyle = idColor(ids.length);
    const [a, b] = wallLine(w.side, w.from, w.to);
    wallQuad(flat, view, a, b, w.z0, w.z1, null);
  });
  for (const d of drawables) {
    ids.push(d.id);
    pg.fillStyle = idColor(ids.length);
    d.draw(flat);
  }
  const px = pg.getImageData(bx, by, 1, 1).data;
  const n = (px[0] << 16) | (px[1] << 8) | px[2];
  const L = t('items');
  if (px[3] && n > 0 && n <= ids.length) {
    const [kind, id] = ids[n - 1].split(':');
    if (kind === 'agent') {
      const a = agents.find((x) => x.id === id);
      return `<b style="color:var(--c-${a.role})">${a.name[getLang()]}</b>, ${t('roles')[a.role]}<br>${t('acts')[a.activity] || ''}`;
    }
    if (kind === 'item') {
      const it = ITEMS.find((x) => x.id === id);
      return esc(L[it.name] || it.name);
    }
    if (kind === 'wall') return esc(L[id] || L.window);
  }
  // floor or wall from the background
  const bgPx = bgc.getImageData(bx, by, 1, 1).data;
  if (!bgPx[3]) return '';
  const [gx, gy] = view.unproject(bx, by);
  return gx > 0.05 && gy > 0.05 && gx < view.W && gy < view.D ? L.floor : L.wall;
}

// ------------------------------------------------------------------ feed, status, answer

const feed = [];
function logFeed(agentId, text) {
  const a = agents.find((x) => x.id === agentId);
  feed.push({ a, text, t: bus.now() });
  const list = $('#feedList');
  const li = document.createElement('li');
  li.innerHTML = a
    ? `<span class="who" style="color:var(--c-${a.role})">${esc(a.name[getLang()])}</span><span>${esc(text)}</span><span class="when">${bus.now().toFixed(0)}s</span>`
    : `<span>${esc(text)}</span>`;
  list.appendChild(li);
  while (list.children.length > 40) list.firstChild.remove();
  list.scrollTop = list.scrollHeight;
  $('#feed').classList.remove('empty');
}

const bus = new Bus();
const state = { running: false, usage: new Map(), final: null, task: '', live: false };

bus.on((e) => {
  director.handle(e);
  switch (e.type) {
    case 'run_start':
      state.running = true;
      state.usage.clear();
      state.final = null;
      state.task = e.task;
      state.live = !e.replay;
      $('#feedList').replaceChildren();
      closeAnswer();
      $('#exportBtn').hidden = true;
      break;
    case 'usage': state.usage.set(e.id, e); break;
    case 'notice': logFeed(null, t(e.key)); break;
    case 'final':
      state.final = e;
      setTimeout(() => showAnswer(), 5200);
      break;
    case 'run_end':
      state.running = false;
      updateStatus(e);
      setRunning(false);
      if (state.live && e.status === 'done') $('#exportBtn').hidden = false;
      break;
  }
});

function cost() {
  let c = 0;
  for (const u of state.usage.values()) c += u.input * PRICE.input + u.output * PRICE.output + (u.searches || 0) * PRICE.search;
  return c;
}

function updateStatus(end) {
  const el = $('#status');
  if (!state.running && !end) { el.textContent = t('idleStatus'); return; }
  const secs = end ? (end.elapsed ?? 0) : bus.now();
  const head = end ? (end.status === 'error' ? t(end.key || 'errRequest') : end.status === 'stopped' ? t('stopped') : t('statusDone')) : t('workingStatus');
  el.textContent = `${head}. ${secs.toFixed(0)} s, $${cost().toFixed(3)}`;
}

function showAnswer() {
  if (!state.final) return;
  const { markdown, sources = [] } = state.final;
  $('#answerTask').textContent = state.task;
  $('#answer').innerHTML = renderMarkdown(markdown, sources);
  $('#sourcesWrap').hidden = !sources.length;
  $('#sources').innerHTML = sources.map((s) => {
    let host = '';
    try { host = new URL(s.url).hostname.replace(/^www\./, ''); } catch {}
    return `<li id="src-${s.n}" value="${s.n}"><a href="${escUrl(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a> <span class="host">${esc(host)}</span></li>`;
  }).join('');
  const p = $('#answerPanel');
  p.classList.add('open');
  p.setAttribute('aria-hidden', 'false');
  cam.shiftTarget = innerWidth >= 1000 ? -Math.min(230, innerWidth * 0.16) : 0;
}
function closeAnswer() {
  const p = $('#answerPanel');
  p.classList.remove('open');
  p.setAttribute('aria-hidden', 'true');
  cam.shiftTarget = 0;
}
$('#answerClose').addEventListener('click', closeAnswer);
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAnswer(); });

// ------------------------------------------------------------------ running

let current = null;
function setRunning(on) {
  $('#runBtn').textContent = on && current instanceof Orchestra ? t('stop') : t('run');
  $('#demoBtn').textContent = on && current instanceof Replay ? t('stop') : t('demo');
  $('#runBtn').disabled = on && current instanceof Replay;
  $('#demoBtn').disabled = on && current instanceof Orchestra;
  if (!on) current = null;
}

$('#taskForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (current) { current.stop(); return; }
  const task = $('#task').value.trim();
  if (!task) { $('#task').focus(); return; }
  if (!settings.apiKey) { openKeyDialog(); return; }
  bus.start(true);
  current = new Orchestra(bus, { apiKey: settings.apiKey, workspaceId: settings.workspaceId, useSearch: settings.useSearch });
  setRunning(true);
  current.run(task);
});

$('#demoBtn').addEventListener('click', async () => {
  if (current) { current.stop(); return; }
  let trace;
  try { trace = await (await fetch('demo/trace.json')).json(); } catch { logFeed(null, t('errNetwork')); return; }
  $('#task').value = trace.events.find((e) => e.type === 'run_start')?.task || '';
  current = new Replay(bus, trace, 0.5); // slowed down so the walking keeps up
  setRunning(true);
  const run = current.run();
  logFeed(null, trace.simulated ? t('demoNote') : t('demoReal'));
  await run;
  if (current) setRunning(false);
});

$('#exportBtn').addEventListener('click', () => {
  const data = bus.exportTrace({ simulated: false, model: 'claude-haiku-5-5' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })), download: 'trace.json' });
  document.body.appendChild(a); a.click(); a.remove();
});

// ------------------------------------------------------------------ API key (kept in this browser only)

const store = {
  get(k) { try { return localStorage.getItem(k) ?? sessionStorage.getItem(k) ?? ''; } catch { return ''; } },
  set(k, v, persist) {
    try {
      localStorage.removeItem(k); sessionStorage.removeItem(k);
      if (v) (persist ? localStorage : sessionStorage).setItem(k, v);
    } catch {}
  },
};
const settings = {
  get apiKey() { return store.get('office-key'); },
  get workspaceId() { return store.get('office-ws'); },
  get remember() { try { return !!localStorage.getItem('office-key'); } catch { return false; } },
  get useSearch() { return store.get('office-search') !== 'off'; },
};
const dialog = $('#keyDialog');
function openKeyDialog() {
  $('#keyInput').value = settings.apiKey;
  $('#wsInput').value = settings.workspaceId;
  $('#rememberInput').checked = settings.remember;
  $('#searchInput').checked = settings.useSearch;
  dialog.showModal();
}
$('#keyBtn').addEventListener('click', openKeyDialog);
$('#keyForm').addEventListener('submit', () => {
  const persist = $('#rememberInput').checked;
  store.set('office-key', $('#keyInput').value.trim(), persist);
  store.set('office-ws', $('#wsInput').value.trim(), persist);
  store.set('office-search', $('#searchInput').checked ? '' : 'off', true);
  syncKey();
});
$('#forgetBtn').addEventListener('click', () => {
  store.set('office-key', '', false); store.set('office-ws', '', false);
  $('#keyInput').value = ''; $('#wsInput').value = '';
  syncKey();
});
function syncKey() { $('#keyDot').classList.toggle('on', !!settings.apiKey); }

// ------------------------------------------------------------------ language

function renderChrome() {
  applyStatic();
  $('#langBtn').textContent = getLang() === 'ru' ? 'EN' : 'RU';
  setRunning(!!current);
  updateStatus();
}
$('#langBtn').addEventListener('click', () => { setLang(getLang() === 'ru' ? 'en' : 'ru'); renderChrome(); });
renderChrome();
syncKey();
$('#feed').classList.add('empty');

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escUrl(u) { return /^https?:\/\//i.test(u || '') ? esc(u) : '#'; }

window.office = { view, agents, dyn, bus, state, cam, resetReservations };
