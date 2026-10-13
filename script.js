
const COLS = 5;
const BLOCK_W = 76;
const BLOCK_H = 52;
const GAP = 10;
const GROUND_H = 70;
const GAME_DURATION = 300; // 5 minutes = mirror of 100-fact paper drill
let FACT_PACE_MS = 5786;  // set by speed selection; default = Apprentice (slowest)
const DRILL_TARGET = 100;   // drill ends when this many correct answers are given
const SPRITE_BASE_Y_OFFSET = 14; // pixels above ground line
const POWER_CHANCE_PER_LEVEL = 0.05; // each upgrade level adds 5% power-block rows
const POWER_TYPES = ['freeze', 'double', 'mega']; // freeze=timer, double=2 hammers, mega=nuke all 5
const ROW_H = BLOCK_H + GAP;

// ── Firebase ──
const firebaseConfig = {
  apiKey: "AIzaSyBriR5bxRmn2wpmHQ5L2IAFrwZSlBe-HD8",
  authDomain: "matharcadium.firebaseapp.com",
  databaseURL: "https://matharcadium-default-rtdb.firebaseio.com",
  projectId: "matharcadium",
  storageBucket: "matharcadium.firebasestorage.app",
  messagingSenderId: "1081654451512",
  appId: "1:1081654451512:web:f8151d66a36aeb9450f5cd",
  measurementId: "G-TM27JZGCYT"
};
let db = null;
try {
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
} catch(e) {
  console.warn('Firebase unavailable (scores won\'t be saved):', e.message);
}

let playerName = '';
let playerStudentId = '';
let playerPeriod = 1;
let playerGrade = 6;
let speedLabel = 'Apprentice';

const UPGRADE_OPTIONS = [
  { key: 'extraLives', title: 'Reinforced Gear', description: '+1 starting life per level', costs: [6000, 15000] },
  { key: 'scoreBoost', title: 'Golden Hammer', description: '+10% score per level', costs: [8000, 18000, 32000] },
  { key: 'powerBlocks', title: 'Power Magnet', description: '+5% chance of a power block per level', costs: [5000, 10000, 16000, 23000, 31000] },
];
const SAVE_KEY = 'blockCrusherProgressV2';
let savedProgress = { points: 0, zeroUnlocked: false, upgrades: { extraLives: 0, scoreBoost: 0 } };
try {
  const stored = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
  savedProgress.points = Math.max(0, Number(stored.points) || 0);
  savedProgress.zeroUnlocked = stored.zeroUnlocked === true;
  UPGRADE_OPTIONS.forEach(option => {
    savedProgress.upgrades[option.key] = Math.max(0, Math.min(option.costs.length, Number(stored.upgrades?.[option.key]) || 0));
  });
} catch (e) {
  console.warn('Could not load saved upgrades:', e);
}

function saveProgress() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(savedProgress)); }
  catch (e) { console.warn('Could not save upgrades:', e); }
}

function renderUpgradeMenu() {
  const bank = document.getElementById('bank-points');
  const balance = document.getElementById('upgrade-balance');
  const list = document.getElementById('upgrade-list');
  if (!bank || !balance || !list) return;
  bank.textContent = savedProgress.points;
  balance.textContent = `${savedProgress.points} PTS`;
  list.innerHTML = '';
  UPGRADE_OPTIONS.forEach(option => {
    const level = savedProgress.upgrades[option.key];
    const cost = option.costs[level];
    const card = document.createElement('div');
    card.style.cssText = 'background:#111;border:1px solid #333;border-radius:8px;padding:10px;text-align:left';
    const details = document.createElement('div');
    details.style.cssText = 'font-size:12px;font-weight:900;color:#eee;margin-bottom:3px';
    details.textContent = `${option.title} · LEVEL ${level}/${option.costs.length}`;
    const description = document.createElement('div');
    description.style.cssText = 'font-size:10px;color:#888;margin-bottom:8px';
    description.textContent = option.description;
    const button = document.createElement('button');
    button.className = 'opt-btn';
    button.style.width = '100%';
    button.textContent = cost === undefined ? 'MAX LEVEL' : `BUY · ${cost} PTS`;
    button.disabled = cost === undefined || savedProgress.points < cost;
    button.addEventListener('click', () => {
      if (cost === undefined || savedProgress.points < cost) return;
      savedProgress.points -= cost;
      savedProgress.upgrades[option.key]++;
      saveProgress();
      renderUpgradeMenu();
    });
    card.append(details, description, button);
    list.appendChild(card);
  });
}

let selMultiples = new Set([6]); // default: just ×6, player can add more
let selLives = 5;
let selBombs = false;
let selSpeedMult = 1; // default matches Apprentice (the default selected speed)
let G = {};
let animId = null;

// Build fact-family chips: each number toggles its entire fact family.
function addMultipleChip(n, grid) {
  const chip = document.createElement('button');
  chip.className = 'mult-chip' + (selMultiples.has(n) ? ' on' : '');
  chip.dataset.mult = n;
  chip.textContent = n;
  chip.addEventListener('click', () => {
    if (n === 0) {
      selMultiples = new Set([0]);
    } else {
      if (selMultiples.has(0)) selMultiples = new Set([n]);
      else if (selMultiples.has(n)) {
        if (selMultiples.size > 1) selMultiples.delete(n);
      } else {
        selMultiples.add(n);
      }
    }
    grid.querySelectorAll('.mult-chip').forEach(c => {
      c.classList.toggle('on', selMultiples.has(+c.dataset.mult));
    });
  });
  grid.appendChild(chip);
}

(function buildMultGrid() {
  const grid = document.getElementById('mult-grid');

  // Shortcut row
  const shortcutWrapper = document.createElement('div');
  shortcutWrapper.style.cssText = 'grid-column:1/-1';
  const shortcuts = document.createElement('div');
  shortcuts.className = 'mult-shortcuts';
  const presets = [
    { label: 'ALL 1–12', vals: [1,2,3,4,5,6,7,8,9,10,11,12] },
    { label: '1–5',       vals: [1,2,3,4,5] },
    { label: '1–10',      vals: [1,2,3,4,5,6,7,8,9,10] },
    { label: 'CLEAR',     vals: [] },
  ];
  presets.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'shortcut-btn';
    btn.textContent = p.label;
    btn.addEventListener('click', () => {
      selMultiples = new Set(p.vals.length ? p.vals : []);
      if (!selMultiples.size) selMultiples.add(1); // always keep at least 1
      grid.querySelectorAll('.mult-chip').forEach(c => {
        c.classList.toggle('on', selMultiples.has(+c.dataset.mult));
      });
    });
    shortcuts.appendChild(btn);
  });
  shortcutWrapper.appendChild(shortcuts);
  grid.appendChild(shortcutWrapper);

  if (savedProgress.zeroUnlocked) addMultipleChip(0, grid);
  for (let n = 1; n <= 12; n++) addMultipleChip(n, grid);
})();

document.querySelectorAll('[data-lives]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('[data-lives]').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); selLives = +b.dataset.lives;
}));

// Grade selection
document.querySelectorAll('[data-grade]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('[data-grade]').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  playerGrade = +b.dataset.grade;
}));

// Period selection
document.querySelectorAll('[data-period]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('[data-period]').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  playerPeriod = +b.dataset.period;
}));

// Card 0 → Card 1
document.getElementById('next-btn-0').addEventListener('click', () => {
  const nameVal = document.getElementById('player-name').value.trim();
  const idVal = document.getElementById('student-id').value.trim();
  if (!nameVal || !idVal) {
    document.getElementById('name-error').style.display = 'block';
    return;
  }
  document.getElementById('name-error').style.display = 'none';
  playerName = nameVal;
  playerStudentId = idVal;
  document.getElementById('setup-card-0').hidden = true;
  document.getElementById('setup-card-1').hidden = false;
});

// Speed selection
document.querySelectorAll('.speed-btn').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.speed-btn').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  FACT_PACE_MS = +b.dataset.pace;
  const labels = { '5786': 'Apprentice', '2624': 'Solid Worker', '2282': 'Professional', '1588': 'Gaudí' };
  speedLabel = labels[b.dataset.pace] || 'Gaudí';
  const mults = { '5786': 1, '2624': 1.5, '2282': 2, '1588': 3 };
  selSpeedMult = mults[b.dataset.pace] || 1;
}));

// Card navigation
document.getElementById('next-btn').addEventListener('click', () => {
  document.getElementById('setup-card-1').hidden = true;
  document.getElementById('setup-card-2').hidden = false;
});
document.getElementById('back-btn').addEventListener('click', () => {
  document.getElementById('setup-card-2').hidden = true;
  document.getElementById('setup-card-1').hidden = false;
});

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  const wrap = canvas.parentElement;
  canvas.width = wrap.clientWidth;
  canvas.height = wrap.clientHeight;
}
window.addEventListener('resize', resizeCanvas);

function rand(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

function makeProblem() {
  const mults = [...selMultiples];
  // One factor must be from the selected set; the other is 1–12
  const a = mults[rand(0, mults.length - 1)];
  const b = rand(1, 12);
  // 50/50 flip so both orders appear
  return Math.random() < 0.5 ? { a, b, ans: a * b } : { a: b, b: a, ans: a * b };
}
function fmt(p) { return `${p.a} × ${p.b}`; }

function colX(col, W) {
  const totalW = COLS * BLOCK_W + (COLS - 1) * GAP;
  const startX = (W - totalW) / 2;
  return startX + col * (BLOCK_W + GAP) + BLOCK_W / 2;
}

// ── Sprite ──
function spriteGroundY(H) { return H - GROUND_H; }

function initSprite(W, H) {
  G.sprite = {
    x: W / 2,
    targetX: W / 2,
    state: 'idle', // idle | running | throwing
    dir: 1,
    runFrame: 0,
    throwPending: false,   // launch hammer once we arrive
    pendingTarget: null,
  };
}

// ── Blocks ──
// Wall mode: all blocks share the same wall Y offset, descending together
function makeBlock(col, rowOffset, power) {
  const prob = makeProblem();
  return {
    col, prob, power: power || null,
    rowOffset: rowOffset || 0,  // pixel offset within the wall (row * (BLOCK_H+GAP))
    state: 'falling',
    deathFrame: 0,
    deathParticles: [],
    opacity: 1,
    spawnTime: Date.now(), // for avg response time tracking
  };
}

// Power block cadence:
//   Freeze  — every 3 rows (rows 3, 6, 9, 12 …)
//   Double/Mega — alternate every 2 rows (rows 2, 4, 8, 10 … i.e. even rows that aren't multiples of 3)
// Each power block lands in a random column.
function spawnWallRow(rowOffset) {
  G.rowCount = (G.rowCount || 0) + 1;
  const r = G.rowCount;
  let powerType = null;

  if (r % 3 === 0) {
    powerType = 'freeze';
  } else if (r % 2 === 0) {
    // Alternate double/mega based on how many even-non-3 rows have appeared
    G.actionPowerCount = (G.actionPowerCount || 0) + 1;
    powerType = G.actionPowerCount % 2 === 1 ? 'double' : 'mega';
  } else if (Math.random() < (savedProgress.upgrades.powerBlocks || 0) * POWER_CHANCE_PER_LEVEL) {
    // Purchased levels add a chance for power blocks on otherwise regular rows.
    powerType = POWER_TYPES[Math.floor(Math.random() * POWER_TYPES.length)];
  }

  const powerCol = powerType !== null ? Math.floor(Math.random() * COLS) : -1;
  for (let c = 0; c < COLS; c++) {
    const power = (c === powerCol) ? powerType : null;
    G.blocks.push(makeBlock(c, rowOffset, power));
  }
}

// Compute a block's current Y from the wall scroll position + its row offset
function blockY(block) {
  return G.wallY + block.rowOffset;
}

// Return the single "front" block per column — lowest on screen (largest Y), no block below it.
// Only these are eligible to be targeted by the player.
function frontBlocks() {
  const front = {};
  for (const b of G.blocks) {
    if (b.state !== 'falling') continue;
    const by = blockY(b);
    if (front[b.col] === undefined || by > blockY(front[b.col])) {
      front[b.col] = b;
    }
  }
  return Object.values(front);
}

function buildLives() {
  const row = document.getElementById('lives-row');
  row.innerHTML = '';
  for (let i = 0; i < G.maxLives; i++) {
    const pip = document.createElement('div');
    pip.className = 'life-pip';
    pip.id = `life-${i}`;
    row.appendChild(pip);
  }
}

function loseLife() {
  G.lives--;
  const pip = document.getElementById(`life-${G.lives}`);
  if (pip) pip.classList.add('lost');
  G.streak = 0;
  updateHUD();
  if (G.lives <= 0) {
    setTimeout(() => endGame('lives'), 500);
  } else {
    // Reset wall: clear all blocks and scroll back to top
    G.blocks = [];
    G.wallY = 0;
    G.rowCount = 0;
    G.actionPowerCount = 0;
    const W = canvas.width, H = canvas.height;
    const NUM_START_ROWS = 4;
    for (let row = 0; row < NUM_START_ROWS; row++) {
      spawnWallRow(-(NUM_START_ROWS - row) * ROW_H);
    }
    G.pops.push({ txt: '💥 WALL RESET!', x: W / 2, y: H / 2, life: 2.2, big: true });
  }
}

function updateHUD() {
  document.getElementById('score-val').textContent = G.score;
  document.getElementById('smash-val').textContent = `${G.smashed}/${DRILL_TARGET}`;
  document.getElementById('streak-val').textContent = `×${Math.min(G.streak + 1, 8)}`;
}

// ── Projectile hammers ──
// type: 'hit' (aimed at target block) | 'miss' (flies off sideways)
function launchHammer(type, targetBlock, W, H) {
  const sx = G.sprite ? G.sprite.x : W / 2;
  const sy = spriteGroundY(H) - SPRITE_BASE_Y_OFFSET - 20; // throw from hand height

  let vx, vy, targetCol = -1, targetBlockRef = null;

  if (type === 'hit' && targetBlock) {
    // Aim at the block's center (use blockY since wall-mode blocks have no .y)
    const tx = colX(targetBlock.col, W);
    const ty = blockY(targetBlock) + BLOCK_H / 2;
    const dist = Math.sqrt((tx - sx) ** 2 + (ty - sy) ** 2);
    const speed = 14;
    vx = ((tx - sx) / dist) * speed;
    vy = ((ty - sy) / dist) * speed;
    targetCol = targetBlock.col;
    targetBlockRef = targetBlock;
  } else {
    // Miss: shoot off to left or right at a shallow upward angle
    const dir = Math.random() < 0.5 ? -1 : 1;
    vx = dir * (8 + Math.random() * 5);
    vy = -(3 + Math.random() * 4);
  }

  G.hammers.push({
    x: sx, y: sy,
    vx, vy,
    rot: 0,
    rotSpeed: type === 'hit' ? (Math.random() - 0.5) * 0.5 : (Math.random() < 0.5 ? 1 : -1) * (0.18 + Math.random() * 0.14),
    type,
    targetCol,
    targetBlock: targetBlockRef,
    hit: false,
    life: 1,
    gravity: type === 'hit' ? 0 : 0.25,
  });
}

// ── Drawing ──
function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

function drawBackground(W, H) {
  const sky = ctx.createLinearGradient(0, 0, 0, H - GROUND_H);
  sky.addColorStop(0, '#040208');
  sky.addColorStop(1, '#080414');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H - GROUND_H);

  // Column guide lines
  ctx.strokeStyle = '#ffffff07';
  ctx.lineWidth = 1;
  const totalW = COLS * BLOCK_W + (COLS - 1) * GAP;
  const startX = (W - totalW) / 2;
  for (let c = 0; c <= COLS; c++) {
    const x = startX + c * (BLOCK_W + GAP) - GAP / 2;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H - GROUND_H); ctx.stroke();
  }

  // Ground platform
  const grd = ctx.createLinearGradient(0, H - GROUND_H, 0, H);
  grd.addColorStop(0, '#1e1408');
  grd.addColorStop(0.3, '#140e04');
  grd.addColorStop(1, '#0a0804');
  ctx.fillStyle = grd;
  ctx.fillRect(0, H - GROUND_H, W, GROUND_H);

  // Ground line
  ctx.strokeStyle = '#6b4820';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, H - GROUND_H); ctx.lineTo(W, H - GROUND_H); ctx.stroke();

  // Brick texture on ground
  ctx.strokeStyle = '#2a1a08';
  ctx.lineWidth = 1;
  const brickH = 14;
  for (let row = 0; row < 4; row++) {
    const y = H - GROUND_H + 8 + row * brickH;
    const offset = (row % 2) * 22;
    for (let bx = -offset; bx < W; bx += 44) {
      ctx.strokeRect(bx + 2, y, 40, brickH - 2);
    }
  }

  // Danger glow near ground
  const dangerH = 55;
  const dangerGrd = ctx.createLinearGradient(0, H - GROUND_H - dangerH, 0, H - GROUND_H);
  dangerGrd.addColorStop(0, 'rgba(192,57,43,0)');
  dangerGrd.addColorStop(1, 'rgba(192,57,43,0.1)');
  ctx.fillStyle = dangerGrd;
  ctx.fillRect(0, H - GROUND_H - dangerH, W, dangerH);
}

// Draw frost/ice overlay on a freeze power block
function drawFrostOverlay(c, bx, by, opacity) {
  const t = Date.now() / 1000;
  const bx0 = bx - BLOCK_W / 2, bx1 = bx + BLOCK_W / 2;
  const by1 = by + BLOCK_H;

  c.save();
  c.globalAlpha = (opacity || 1) * 0.85;

  // Icy gloss sheen across top half
  const gloss = c.createLinearGradient(bx0, by, bx1, by + BLOCK_H * 0.5);
  gloss.addColorStop(0, 'rgba(255,255,255,0.38)');
  gloss.addColorStop(0.5, 'rgba(200,240,255,0.18)');
  gloss.addColorStop(1, 'rgba(255,255,255,0)');
  c.beginPath();
  c.rect(bx0, by, BLOCK_W, BLOCK_H);
  c.fillStyle = gloss;
  c.fill();

  // Frost crystal arms radiating from corners and center
  const crystalPoints = [
    [bx0 + 6,  by + 6],
    [bx1 - 6,  by + 6],
    [bx0 + 6,  by1 - 6],
    [bx1 - 6,  by1 - 6],
    [bx,       by + BLOCK_H * 0.38],
  ];
  c.strokeStyle = 'rgba(200,240,255,0.7)';
  c.lineWidth = 1;
  c.lineCap = 'round';
  crystalPoints.forEach(([cx, cy], i) => {
    const arms = 6;
    const len = i === 4 ? 9 : 7;
    for (let a = 0; a < arms; a++) {
      const ang = (a / arms) * Math.PI * 2 + (i * 0.4);
      const ex = cx + Math.cos(ang) * len;
      const ey = cy + Math.sin(ang) * len;
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(ex, ey); c.stroke();
      // Small barbs
      const blen = len * 0.38;
      const bang1 = ang + Math.PI / 4;
      const bang2 = ang - Math.PI / 4;
      const mx = cx + Math.cos(ang) * len * 0.55;
      const my = cy + Math.sin(ang) * len * 0.55;
      c.beginPath(); c.moveTo(mx, my); c.lineTo(mx + Math.cos(bang1) * blen, my + Math.sin(bang1) * blen); c.stroke();
      c.beginPath(); c.moveTo(mx, my); c.lineTo(mx + Math.cos(bang2) * blen, my + Math.sin(bang2) * blen); c.stroke();
    }
  });

  // Ice crack lines
  c.strokeStyle = 'rgba(180,230,255,0.45)';
  c.lineWidth = 0.8;
  const cracks = [
    [[bx0+14, by+10], [bx0+28, by+22], [bx0+22, by+34]],
    [[bx1-10, by+8],  [bx1-24, by+20]],
    [[bx0+8,  by1-10],[bx0+20, by1-20],[bx+5, by1-28]],
  ];
  cracks.forEach(pts => {
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.stroke();
  });

  // Drifting snowflake dots (3 per block, animated)
  c.fillStyle = 'rgba(220,245,255,0.9)';
  for (let i = 0; i < 3; i++) {
    const phase = t * 0.6 + i * 2.1;
    const sx = bx0 + 8 + ((Math.sin(phase * 1.3 + i) * 0.5 + 0.5) * (BLOCK_W - 16));
    const sy = by + 6 + (((phase * 0.4) % 1) * (BLOCK_H - 12));
    c.beginPath(); c.arc(sx, sy, 1.5, 0, Math.PI * 2); c.fill();
  }

  c.restore();
}

const POWER_CFG = {
  freeze: { bg0: '#a8e8ff', bg1: '#4ab8e8', border: '#c8f4ff', icon: '⏱', label: 'FREEZE' },
  double: { bg0: '#f80',  bg1: '#a40',  border: '#fda',  icon: '🔨🔨', label: 'DOUBLE' },
  mega:   { bg0: '#c0f',  bg1: '#608',  border: '#f8f',  icon: '⚡', label: 'MEGA' },
};

function drawBlock(block, W, H) {
  const bx = colX(block.col, W);
  const by = blockY(block);
  const ground = H - GROUND_H;
  const danger = Math.max(0, Math.min(1, (by + BLOCK_H - (ground - 70)) / 70));
  const pw = block.power ? POWER_CFG[block.power] : null;

  ctx.save();
  ctx.globalAlpha = block.opacity;

  // Pulsing glow for power blocks
  if (pw) {
    const pulse = 0.55 + 0.45 * Math.sin(Date.now() / 220);
    ctx.shadowColor = pw.border;
    ctx.shadowBlur = 18 * pulse;
  } else {
    ctx.shadowColor = danger > 0.4 ? `rgba(192,57,43,${0.5 * danger})` : 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 12;
  }

  roundRect(ctx, bx - BLOCK_W / 2, by, BLOCK_W, BLOCK_H, 6);

  if (pw) {
    const bg = ctx.createLinearGradient(bx - BLOCK_W / 2, by, bx + BLOCK_W / 2, by + BLOCK_H);
    bg.addColorStop(0, pw.bg0);
    bg.addColorStop(1, pw.bg1);
    ctx.fillStyle = bg;
  } else {
    const bg = ctx.createLinearGradient(bx - BLOCK_W / 2, by, bx + BLOCK_W / 2, by + BLOCK_H);
    if (danger > 0.3) {
      const r = Math.round(245 - danger * 55);
      const g = Math.round(240 - danger * 125);
      const bv = Math.round(224 - danger * 145);
      bg.addColorStop(0, `rgb(${r},${g},${bv})`);
      bg.addColorStop(1, `rgb(${r - 15},${g - 15},${bv - 20})`);
    } else {
      bg.addColorStop(0, '#f5f0e0');
      bg.addColorStop(1, '#ede5c8');
    }
    ctx.fillStyle = bg;
  }
  ctx.fill();

  ctx.strokeStyle = pw ? pw.border : (danger > 0.5 ? `rgba(192,57,43,${0.4 + danger * 0.6})` : '#c8b87a');
  ctx.lineWidth = pw ? 2.5 : 2;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Frost overlay for freeze blocks
  if (block.power === 'freeze') {
    drawFrostOverlay(ctx, bx, by, block.opacity);
  }

  if (pw) {
    // Power block: big icon + small label + problem
    ctx.font = `900 13px 'Nunito', sans-serif`;
    ctx.fillStyle = block.power === 'freeze' ? '#003a5c' : '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(pw.icon + ' ' + pw.label, bx, by + 4);

    ctx.font = `900 13px 'Nunito', sans-serif`;
    ctx.fillStyle = block.power === 'freeze' ? 'rgba(0,40,80,0.85)' : 'rgba(255,255,255,0.9)';
    ctx.textBaseline = 'bottom';
    ctx.fillText(fmt(block.prob), bx, by + BLOCK_H - 4);
  } else {
    ctx.font = `900 16px 'Nunito', sans-serif`;
    ctx.fillStyle = '#1a1208';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fmt(block.prob), bx, by + BLOCK_H / 2);

    ctx.font = `700 8px 'Nunito', sans-serif`;
    ctx.fillStyle = 'rgba(26,18,8,0.35)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(fmt(block.prob), bx - BLOCK_W / 2 + 4, by + 3);
  }
  ctx.restore();
}

function drawDeathParticles(block) {
  block.deathParticles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.col;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.sz * Math.max(0, p.life), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function spawnDeathParticles(bx, by, rainbow) {
  const cols = rainbow
    ? RAINBOW
    : ['#e8c44a', '#fff', '#f0e080', '#ffa040', '#c8b87a', '#ffe080'];
  const count = rainbow ? 42 : 26;
  const particles = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const spd = (rainbow ? 3.5 : 2.5) + Math.random() * 5;
    particles.push({
      x: bx, y: by,
      vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - 1.5,
      life: 1, dec: 0.028 + Math.random() * 0.025,
      sz: (rainbow ? 4 : 2.5) + Math.random() * 4.5,
      col: cols[Math.floor(Math.random() * cols.length)]
    });
  }
  return particles;
}

// Launch a super sledgehammer that flies straight up and nukes 4 blocks in the same column
function launchSuperHammer(W, H) {
  const sx = G.sprite ? G.sprite.x : W / 2;
  const sy = spriteGroundY(H) - SPRITE_BASE_Y_OFFSET - 20;
  G.hammers.push({
    x: sx, y: sy,
    vx: 0, vy: -18,
    rot: 0, rotSpeed: 0.22,
    type: 'super', super: true,
    hit: false, life: 1, gravity: 0,
    throwTime: Date.now(),
    blocksLeft: 4, // how many more blocks it can destroy
  });
}

// ── Mega super: fire at all 5 front blocks simultaneously ──
function launchMegaSuper(W, H) {
  const front = frontBlocks();
  const sx = G.sprite ? G.sprite.x : W / 2;
  const sy = spriteGroundY(H) - SPRITE_BASE_Y_OFFSET - 20;
  front.forEach(tb => {
    const tx = colX(tb.col, W);
    const ty = blockY(tb) + BLOCK_H / 2;
    const dx = tx - sx, dy = ty - sy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = 22; // fast enough to reach any block on screen in ~20 frames
    G.hammers.push({
      x: sx, y: sy,
      vx: (dx / dist) * speed,
      vy: (dy / dist) * speed,
      rot: 0, rotSpeed: 0.3,
      type: 'super', super: true,
      hit: false, life: 1, gravity: 0,
      throwTime: Date.now(),
      blocksLeft: 1,
      megaTarget: tb,
      // Store the exact target position so collision is checked against where it's aimed
      targetX: tx, targetY: ty,
    });
  });
}

// ── Sprite: runs to column, then throws ──
function drawSprite(W, H) {
  const sp = G.sprite;
  const x = sp.x;
  const baseY = spriteGroundY(H) - 2;
  const isRunning = sp.state === 'running';
  const throwing = sp.state === 'throwing' || G.hammers.some(h => !h.hit && h.type === 'hit');
  const missing  = G.hammers.some(h => h.type === 'miss' && h.life > 0.5);

  ctx.save();

  // Flip for direction
  if (sp.dir < 0) { ctx.translate(x * 2, 0); ctx.scale(-1, 1); }

  // Shadow on ground
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(x, baseY, isRunning ? 14 : 18, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Animated legs when running
  if (isRunning) {
    const legAngle = Math.sin(sp.runFrame * 0.45) * 0.55;
    const legLen = 18;
    ctx.strokeStyle = '#1e3560';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    // back leg
    ctx.beginPath();
    ctx.moveTo(x, baseY - 10);
    ctx.lineTo(x + Math.sin(-legAngle) * legLen, baseY - 10 + Math.cos(-legAngle) * legLen * 0.7);
    ctx.stroke();
    // front leg
    ctx.beginPath();
    ctx.moveTo(x, baseY - 10);
    ctx.lineTo(x + Math.sin(legAngle) * legLen, baseY - 10 + Math.cos(legAngle) * legLen * 0.7);
    ctx.stroke();
    // Boots
    ctx.fillStyle = '#3a2010';
    ctx.beginPath(); ctx.ellipse(x + Math.sin(-legAngle) * legLen, baseY - 10 + Math.cos(-legAngle) * legLen * 0.7, 7, 4, legAngle * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + Math.sin(legAngle) * legLen, baseY - 10 + Math.cos(legAngle) * legLen * 0.7, 7, 4, -legAngle * 0.3, 0, Math.PI * 2); ctx.fill();
  } else {
    // Boots (static)
    ctx.fillStyle = '#3a2010';
    ctx.beginPath(); ctx.ellipse(x - 8, baseY - 3, 8, 5, -0.15, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 8, baseY - 3, 8, 5, 0.15, 0, Math.PI * 2); ctx.fill();
  }

  // Body bob when running
  const bob = isRunning ? Math.abs(Math.sin(sp.runFrame * 0.45)) * 3 : 0;

  // Pants (only drawn when not running — legs already drawn above)
  if (!isRunning) {
    ctx.fillStyle = '#1e3560';
    ctx.beginPath(); ctx.roundRect(x - 11, baseY - 24, 22, 16, 3); ctx.fill();
    ctx.strokeStyle = '#162848';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, baseY - 8); ctx.lineTo(x, baseY - 24); ctx.stroke();
  }

  // Body / shirt
  ctx.fillStyle = '#c8a84b';
  ctx.beginPath(); ctx.roundRect(x - 13, baseY - 42 - bob, 26, 20, 5); ctx.fill();

  const B = bob; // shorthand for vertical offset

  // Overall bib
  ctx.fillStyle = '#a07828';
  ctx.beginPath(); ctx.roundRect(x - 7, baseY - 40 - B, 14, 14, 3); ctx.fill();

  // Suspenders
  ctx.strokeStyle = '#7a5c18';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - 7, baseY - 26 - B); ctx.lineTo(x - 10, baseY - 42 - B); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 7, baseY - 26 - B); ctx.lineTo(x + 10, baseY - 42 - B); ctx.stroke();

  // Neck
  ctx.fillStyle = '#e0a060';
  ctx.beginPath(); ctx.roundRect(x - 4, baseY - 50 - B, 8, 10, 2); ctx.fill();

  // Head (slight lean forward when running)
  const headLean = isRunning ? sp.dir * 0.18 : 0;
  ctx.fillStyle = '#f4c27a';
  ctx.save();
  ctx.translate(x, baseY - 58 - B);
  ctx.rotate(headLean);
  ctx.beginPath(); ctx.ellipse(0, 0, 13, 13, 0, 0, Math.PI * 2); ctx.fill();

  // Hard hat brim
  ctx.fillStyle = '#d4a830';
  ctx.beginPath(); ctx.roundRect(-16, -9, 32, 5, 2); ctx.fill();
  // Hard hat dome
  ctx.fillStyle = '#e8c44a';
  ctx.beginPath(); ctx.arc(0, -10, 13, Math.PI, 0); ctx.fill();
  ctx.restore();

  // Eyes (drawn relative to head center which already has bob applied)
  const squint = sp.state === 'throwing';
  ctx.fillStyle = '#2a1208';
  ctx.beginPath(); ctx.ellipse(x - 4.5, baseY - 60 - B, 2.5, squint ? 1 : 2.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + 4.5, baseY - 60 - B, 2.5, squint ? 1 : 2.5, 0, 0, Math.PI * 2); ctx.fill();

  // Mouth
  ctx.strokeStyle = '#2a1208';
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (throwing) {
    ctx.moveTo(x - 5, baseY - 54 - B); ctx.lineTo(x + 5, baseY - 54 - B);
  } else if (missing) {
    ctx.arc(x, baseY - 52 - B, 5, 0.2, Math.PI - 0.2);
  } else if (isRunning) {
    ctx.arc(x, baseY - 56 - B, 4, Math.PI, 0); // open mouth, running hard
  } else {
    ctx.arc(x, baseY - 56 - B, 4, 0, Math.PI);
  }
  ctx.stroke();

  // ── Arms ──
  const shoulderL = { x: x - 12, y: baseY - 38 - B };
  const shoulderR = { x: x + 12, y: baseY - 38 - B };

  if (isRunning) {
    // Pumping arms
    const armSwing = Math.sin(sp.runFrame * 0.45) * 0.7;
    ctx.strokeStyle = '#e0a060';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    // Left arm swings forward when right leg is back
    ctx.beginPath();
    ctx.moveTo(shoulderL.x, shoulderL.y);
    ctx.lineTo(shoulderL.x + Math.sin(-armSwing) * 18, shoulderL.y + Math.cos(-armSwing) * 14);
    ctx.stroke();
    // Right arm (holding hammer) swings opposite
    ctx.beginPath();
    ctx.moveTo(shoulderR.x, shoulderR.y);
    ctx.lineTo(shoulderR.x + Math.sin(armSwing) * 18, shoulderR.y + Math.cos(armSwing) * 14);
    ctx.stroke();
    // Hammer tucked under running arm
    const hx = shoulderR.x + Math.sin(armSwing) * 18;
    const hy = shoulderR.y + Math.cos(armSwing) * 14;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(armSwing + 0.5);
    ctx.strokeStyle = '#6b3d10'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -14); ctx.stroke();
    ctx.fillStyle = '#999'; ctx.strokeStyle = '#666'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.roundRect(-5, -20, 10, 12, 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  } else if (throwing) {
    ctx.strokeStyle = '#e0a060'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    // Left arm — hip
    ctx.beginPath();
    ctx.moveTo(shoulderL.x, shoulderL.y);
    ctx.quadraticCurveTo(x - 20, baseY - 28 - B, x - 14, baseY - 26 - B);
    ctx.stroke();
    // Right arm — follow-through reaching up
    ctx.beginPath();
    ctx.moveTo(shoulderR.x, shoulderR.y);
    ctx.quadraticCurveTo(x + 22, baseY - 52 - B, x + 16, baseY - 65 - B);
    ctx.stroke();
    ctx.fillStyle = '#e0a060';
    ctx.beginPath(); ctx.ellipse(x + 16, baseY - 65 - B, 5, 5, 0, 0, Math.PI * 2); ctx.fill();
  } else if (missing) {
    ctx.strokeStyle = '#e0a060'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(shoulderL.x, shoulderL.y);
    ctx.quadraticCurveTo(x - 26, baseY - 42 - B, x - 28, baseY - 35 - B); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(shoulderR.x, shoulderR.y);
    ctx.quadraticCurveTo(x + 26, baseY - 42 - B, x + 28, baseY - 35 - B); ctx.stroke();
    ctx.fillStyle = '#e0a060';
    ctx.beginPath(); ctx.ellipse(x - 28, baseY - 35 - B, 5, 4, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 28, baseY - 35 - B, 5, 4, 0.4, 0, Math.PI * 2); ctx.fill();
  } else {
    // Idle: hammer held ready
    ctx.strokeStyle = '#e0a060'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(shoulderL.x, shoulderL.y);
    ctx.quadraticCurveTo(x - 18, baseY - 26 - B, x - 14, baseY - 22 - B); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(shoulderR.x, shoulderR.y);
    ctx.quadraticCurveTo(x + 20, baseY - 30 - B, x + 18, baseY - 22 - B); ctx.stroke();
    ctx.save();
    ctx.translate(x + 18, baseY - 22 - B); ctx.rotate(0.3);
    ctx.strokeStyle = '#6b3d10'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -20); ctx.stroke();
    ctx.fillStyle = '#999'; ctx.strokeStyle = '#666'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(-7, -28, 14, 16, 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#bbb'; ctx.fillRect(-5, -26, 4, 6);
    ctx.restore();
  }

  ctx.restore();
}

// ── Draw a flying hammer ──
const RAINBOW = ['#ff4444','#ff9900','#ffee00','#44ff44','#44aaff','#aa44ff','#ff44cc'];
function drawHammer(h) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, h.life);
  ctx.translate(h.x, h.y);
  ctx.rotate(h.rot);

  if (h.super) {
    // Rainbow super-hammer: glowing prismatic head
    const t = Date.now() / 80;
    // Trail rainbow glow
    ctx.globalAlpha = 0.35 * h.life;
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = RAINBOW[(Math.floor(t) + i) % 7];
      ctx.beginPath(); ctx.ellipse(0, i * 5 - 14, 14 - i, 6, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = Math.max(0, h.life);
    // Handle — thick wood
    ctx.strokeStyle = '#8b5c20';
    ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(0, 22); ctx.stroke();
    // Head cycling rainbow
    const hue = (t * 30) % 360;
    ctx.fillStyle = `hsl(${hue},100%,65%)`;
    ctx.strokeStyle = `hsl(${(hue+40)%360},100%,80%)`;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(-13, -32, 26, 22, 4); ctx.fill(); ctx.stroke();
    // Shine
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(-10, -30, 7, 8);
    // Sparkle stars
    ctx.globalAlpha = 0.9 * h.life;
    for (let i = 0; i < 4; i++) {
      const ang = (t * 0.7 + i * Math.PI / 2);
      const sx = Math.cos(ang) * 18, sy = Math.sin(ang) * 18 - 10;
      ctx.fillStyle = RAINBOW[(Math.floor(t * 2) + i * 2) % 7];
      ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, Math.PI * 2); ctx.fill();
    }
  } else {
    // Handle
    ctx.strokeStyle = '#6b3d10';
    ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(0, 14); ctx.stroke();
    // Head
    ctx.fillStyle = h.type === 'miss' ? '#666' : '#aaa';
    ctx.strokeStyle = '#444'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(-8, -22, 16, 18, 3); ctx.fill(); ctx.stroke();
    // Highlight
    ctx.fillStyle = h.type === 'miss' ? '#888' : '#ccc';
    ctx.fillRect(-6, -20, 5, 6);
    // Trail glow for hit hammers
    if (h.type === 'hit') {
      ctx.globalAlpha = 0.25 * h.life;
      ctx.fillStyle = '#e8c44a';
      ctx.beginPath(); ctx.ellipse(0, 0, 10, 22, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  ctx.restore();
}

function drawTimerBar(W) {
  const frac = G.timeLeft / GAME_DURATION;
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, W, 4);
  ctx.fillStyle = frac < 0.1 ? '#e74c3c' : frac < 0.25 ? '#e67e22' : '#c8a84b';
  ctx.fillRect(0, 0, W * frac, 4);

  // MM:SS label in corner
  const m = Math.floor(G.timeLeft / 60);
  const s = String(G.timeLeft % 60).padStart(2, '0');
  ctx.save();
  ctx.font = `700 11px 'Orbitron', monospace`;
  ctx.fillStyle = frac < 0.1 ? '#e74c3c' : '#555';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(`${m}:${s}`, W - 6, 6);
  ctx.restore();
}

function drawScorePops() {
  G.pops.forEach(p => {
    ctx.save();
    ctx.globalAlpha = Math.min(1, p.life);
    if (p.big) {
      ctx.font = `900 22px 'Orbitron', monospace`;
      const t = Date.now() / 60;
      ctx.fillStyle = RAINBOW[Math.floor(t) % 7];
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 18;
    } else if (p.rainbow) {
      ctx.font = `900 16px 'Orbitron', monospace`;
      const t = Date.now() / 50;
      ctx.fillStyle = RAINBOW[Math.floor(t) % 7];
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10;
    } else {
      ctx.font = `900 18px 'Orbitron', monospace`;
      ctx.fillStyle = '#e8c44a';
      ctx.shadowColor = '#e8c44a'; ctx.shadowBlur = 6;
    }
    ctx.textAlign = 'center';
    ctx.fillText(p.txt, p.x, p.y);
    ctx.restore();
  });
}

// ── Active power status pills ──
function drawPowerStatus(W) {
  const now = Date.now();
  const pills = [];
  if (now < G.freezeUntil) {
    const secs = Math.ceil((G.freezeUntil - now) / 1000);
    pills.push({ label: `⏱ FREEZE ${secs}s`, color: '#c8f4ff', glow: '#4ab8e8' });
  }
  if (now < G.doubleUntil) {
    const secs = Math.ceil((G.doubleUntil - now) / 1000);
    pills.push({ label: `🔨🔨 DOUBLE ${secs}s`, color: '#fda', glow: '#f80' });
  }
  if (!pills.length) return;

  ctx.save();
  ctx.font = `700 11px 'Orbitron', monospace`;
  ctx.textBaseline = 'middle';
  let px = 8;
  const py = 14;
  for (const p of pills) {
    const tw = ctx.measureText(p.label).width;
    const pw = tw + 16, ph = 18;
    const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 180);
    ctx.shadowColor = p.glow;
    ctx.shadowBlur = 10 * pulse;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.beginPath(); ctx.roundRect(px, py - ph / 2, pw, ph, 5); ctx.fill();
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = p.color;
    ctx.textAlign = 'left';
    ctx.fillText(p.label, px + 8, py);
    px += pw + 8;
  }
  ctx.restore();
}

// ── Freeze countdown overlay (hourglass + big timer) ──
function drawFreezeCountdown(W, H) {
  const now = Date.now();
  if (now >= G.freezeUntil) return;
  const secsLeft = (G.freezeUntil - now) / 1000;
  const secs = Math.ceil(secsLeft);

  ctx.save();

  // Rotating hourglass drawn with canvas paths (no emoji font-size issues)
  const cx = W / 2, cy = H / 2 - 30;
  const spin = ((now / 1000) * Math.PI * 2) % (Math.PI * 2); // full rotation every 1s

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(spin);

  // Hourglass silhouette
  const hw = 22, hh = 28;
  ctx.beginPath();
  ctx.moveTo(-hw, -hh);
  ctx.lineTo( hw, -hh);
  ctx.lineTo(  0,   0);
  ctx.lineTo( hw,  hh);
  ctx.lineTo(-hw,  hh);
  ctx.lineTo(  0,   0);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, -hh, 0, hh);
  grad.addColorStop(0, '#a8e8ff');
  grad.addColorStop(0.5, '#4ab8e8');
  grad.addColorStop(1, '#c8f4ff');
  ctx.fillStyle = grad;
  ctx.shadowColor = '#4ab8e8';
  ctx.shadowBlur = 18;
  ctx.fill();

  // Sand fill in lower half (fraction that's "drained")
  const fraction = Math.min(1, secsLeft / 10);
  const sandH = hh * (1 - fraction);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, sandH);
  ctx.lineTo(hw * (1 - sandH / hh), hh);
  ctx.lineTo(-hw * (1 - sandH / hh), hh);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,220,80,0.7)';
  ctx.shadowBlur = 0;
  ctx.fill();
  ctx.restore();

  // Outline
  ctx.beginPath();
  ctx.moveTo(-hw, -hh); ctx.lineTo(hw, -hh); ctx.lineTo(0, 0);
  ctx.lineTo(hw, hh); ctx.lineTo(-hw, hh); ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.strokeStyle = '#c8f4ff';
  ctx.lineWidth = 2.5;
  ctx.shadowBlur = 0;
  ctx.stroke();

  ctx.restore(); // un-rotate

  // Big countdown number
  const pulse = 0.92 + 0.08 * Math.sin(now / 120);
  ctx.font = `900 ${Math.round(52 * pulse)}px 'Orbitron', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#4ab8e8';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#c8f4ff';
  ctx.fillText(secs, cx, cy + 62);

  // "FROZEN" label
  ctx.font = `700 11px 'Orbitron', monospace`;
  ctx.fillStyle = '#4ab8e8';
  ctx.shadowBlur = 8;
  ctx.fillText('WALL FROZEN', cx, cy + 90);

  ctx.restore();
}

// ── Bomb system ──
const BOMB_SPEED = 5.5;       // px per frame falling speed
const BOMB_WARN_MS = 1400;    // warning flash duration before bomb spawns
const BOMB_INTERVAL_MS = 25000; // ~25s between bombs (decreases slightly over time)

function spawnBomb(W, H) {
  // Lock onto the worker's exact X position at the moment of spawn
  const sp = G.sprite;
  const targetX = sp.x;
  G.bombs.push({
    targetX,           // fixed X the bomb falls toward — doesn't chase
    x: targetX,
    y: -30,
    r: 14,
    fuseAngle: 0,
    state: 'falling', // 'falling' | 'exploding'
    explodeFrame: 0,
    particles: [],
  });
}

function drawBombs(W, H) {
  const groundY = H - GROUND_H;
  G.bombs.forEach(bomb => {
    if (bomb.state === 'exploding') {
      // Draw explosion particles
      bomb.particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
      return;
    }

    const { x, y, r } = bomb;

    // Targeting line — dashed red line from bomb straight down to ground
    const dangerAlpha = 0.5 + 0.4 * Math.sin(Date.now() / 80);
    ctx.save();
    ctx.strokeStyle = `rgba(255,40,0,${dangerAlpha})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(x, y + r);
    ctx.lineTo(x, groundY);
    ctx.stroke();
    ctx.setLineDash([]);
    // Target X on ground
    ctx.fillStyle = `rgba(255,40,0,${dangerAlpha * 0.6})`;
    ctx.beginPath();
    ctx.ellipse(x, groundY - 4, 18, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Shadow on ground
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, groundY - 4, r * 0.9, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Bomb body
    ctx.save();
    const grad = ctx.createRadialGradient(x - 4, y - 4, 2, x, y, r);
    grad.addColorStop(0, '#ff6644');
    grad.addColorStop(0.5, '#cc1100');
    grad.addColorStop(1, '#440000');
    ctx.shadowColor = '#ff3300';
    ctx.shadowBlur = 16;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Skull icon
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `bold ${Math.round(r * 1.3)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 0;
    ctx.fillText('💣', x, y);

    // Fuse spark
    bomb.fuseAngle += 0.18;
    const fx = x + Math.cos(bomb.fuseAngle) * 3;
    const fy = y - r - 4 + Math.sin(bomb.fuseAngle) * 2;
    ctx.shadowColor = '#ffdd00';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffee44';
    ctx.beginPath();
    ctx.arc(fx, fy, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  });
}

function updateBombs(W, H, dt) {
  if (!G.running) return;
  const now = Date.now();
  const groundY = H - GROUND_H;

  // Spawn next bomb?
  if (now >= G.nextBombAt && now >= G.freezeUntil) {
    spawnBomb(W, H);
    // Next bomb: interval shrinks slightly as game progresses (min 15s)
    const elapsed = GAME_DURATION - G.timeLeft;
    const interval = Math.max(15000, BOMB_INTERVAL_MS - elapsed * 40);
    G.nextBombAt = now + interval;
  }

  G.bombs.forEach(bomb => {
    if (bomb.state === 'exploding') {
      bomb.explodeFrame++;
      bomb.particles.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life -= 0.04; p.r *= 0.97;
      });
      bomb.particles = bomb.particles.filter(p => p.life > 0);
      return;
    }

    // Fall straight down toward locked targetX
    bomb.y += BOMB_SPEED;
    bomb.x = bomb.targetX;

    // Hit ground?
    if (bomb.y + bomb.r >= groundY) {
      const sp = G.sprite;
      const dist = Math.abs(sp.x - bomb.targetX);
      if (dist < 30) {
        // Direct hit — player explodes
        bomb.state = 'exploding';
        triggerBombExplosion(bomb, W, H);
        triggerPlayerExplosion(sp, W, H);
        G.sprite.hidden = true;
        loseLife();
        // Reveal player again after brief delay (unless game over)
        setTimeout(() => { if (G.sprite) G.sprite.hidden = false; }, 900);
        G.pops.push({ txt: '💥 BOOM!', x: W / 2, y: H - GROUND_H - 80, life: 1.5, big: true });
      } else {
        // Worker dodged — harmless explosion + bonus
        bomb.state = 'exploding';
        triggerBombExplosion(bomb, W, H);
        const dodgePts = Math.round(500 * selSpeedMult * (1 + savedProgress.upgrades.scoreBoost * 0.1));
        G.score += dodgePts;
        document.getElementById('score-val').textContent = G.score;
        G.pops.push({ txt: `💨 DODGED! +${dodgePts}`, x: W / 2, y: H - GROUND_H - 80, life: 1.5, big: true });
      }
    }
  });

  // Clean up finished explosions
  G.bombs = G.bombs.filter(b => b.state !== 'exploding' || b.particles.length > 0 || b.explodeFrame < 5);
}

function triggerBombExplosion(bomb, W, H) {
  const colors = ['#ff4400','#ff8800','#ffdd00','#ff2200','#ffaa33'];
  for (let i = 0; i < 28; i++) {
    const angle = (Math.PI * 2 * i) / 28 + Math.random() * 0.3;
    const spd = 2 + Math.random() * 5;
    bomb.particles.push({
      x: bomb.x, y: bomb.y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd - 3,
      r: 5 + Math.random() * 8,
      life: 1,
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }
}

function triggerPlayerExplosion(sp, W, H) {
  // Spray hard-hat yellow, shirt orange, pants blue, boot brown pieces
  const colors = ['#f0c040','#f0c040','#e07020','#e07020','#1e3560','#1e3560','#3a2010','#ff4400','#ff8800'];
  if (!G.playerParticles) G.playerParticles = [];
  const px = sp.x, py = spriteGroundY(H) - 30;
  for (let i = 0; i < 30; i++) {
    const angle = (Math.PI * 2 * i) / 30 + Math.random() * 0.4;
    const spd = 3 + Math.random() * 6;
    G.playerParticles.push({
      x: px, y: py,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd - 4,
      r: 4 + Math.random() * 5,
      life: 1,
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }
}

// ── Main loop ──
let lastTime = 0;
let spawnTimer = 0;

function loop(ts) {
  if (!G.running) return;
  const dt = Math.min(ts - lastTime, 50);
  lastTime = ts;
  const W = canvas.width, H = canvas.height;

  // ── Scroll the wall at the drill pace ──
  // Target: one ROW_H of travel every FACT_PACE_MS milliseconds
  // (= 100 facts in 5 min, matching the paper drill)
  const frozen = Date.now() < G.freezeUntil;
  if (!frozen) {
    const wallSpeed = (ROW_H / FACT_PACE_MS) * dt;
    G.wallY += wallSpeed;
  }

  // Add a new row of blocks at the top when the wall scrolls enough.
  // Scan directly to avoid allocating filtered and mapped arrays every frame.
  let topRowOffset = -ROW_H;
  let hasLiveBlocks = false;
  for (const block of G.blocks) {
    if (block.state === 'dead') continue;
    if (!hasLiveBlocks || block.rowOffset < topRowOffset) {
      topRowOffset = block.rowOffset;
      hasLiveBlocks = true;
    }
  }
  if (G.wallY + topRowOffset > -ROW_H * 0.5) {
    const newOffset = topRowOffset - ROW_H;
    spawnWallRow(newOffset);
  }

  // ── Update blocks ──
  const groundY = H - GROUND_H;
  let lifeLostThisFrame = false;
  G.blocks.forEach(block => {
    if (block.state === 'falling') {
      const by = blockY(block);
      if (by + BLOCK_H >= groundY && !block.groundHit) {
        block.groundHit = true;
        block.state = 'dead';
        if (G.running && G.lives > 0 && !lifeLostThisFrame) {
          lifeLostThisFrame = true;
          loseLife();
        }
      }
    } else if (block.state === 'dying') {
      block.deathFrame++;
      block.opacity -= 0.055;
      block.deathParticles.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.life -= p.dec;
      });
      if (block.deathFrame > 28) block.state = 'dead';
    }
  });
  G.blocks = G.blocks.filter(b => b.state !== 'dead' || b.deathParticles.some(p => p.life > 0));

  // ── Update sprite movement ──
  const sp = G.sprite;
  if (sp.state === 'running') {
    const dx = sp.targetX - sp.x;
    sp.dir = dx > 0 ? 1 : -1;
    const speed = 6 + Math.abs(dx) * 0.12;
    sp.runFrame++;
    if (Math.abs(dx) <= speed) {
      sp.x = sp.targetX;
      sp.state = 'throwing';
      if (sp.pendingSuper) {
        launchSuperHammer(W, H);
        sp.pendingSuper = false;
      } else if (sp.pendingTarget) {
        launchHammer('hit', sp.pendingTarget, W, H);
        G.hammers[G.hammers.length - 1].throwTime = sp.throwTime;
      }
      sp.pendingTarget = null;
      // Return to center after a short pause — but not while a bomb is falling
      setTimeout(() => {
        if (G.sprite && G.sprite.state !== 'running') {
          const bombActive = G.bombs && G.bombs.some(b => b.state === 'falling');
          if (!bombActive) {
            G.sprite.targetX = W / 2;
            G.sprite.state = 'running';
          }
        }
      }, 420);
    } else {
      sp.x += Math.sign(dx) * speed;
    }
  } else if (sp.state === 'throwing') {
    // Wait for hammer to clear, handled by timeout above
  } else {
    sp.state = 'idle';
    sp.runFrame = 0;
  }

  // ── Update hammers ──
  G.hammers.forEach(h => {
    if (h.hit) { h.life -= 0.07; return; }

    h.x += h.vx;
    h.y += h.vy;
    h.vy += h.gravity;
    h.rot += h.rotSpeed;

    if (h.type === 'miss') {
      h.life -= 0.022;
      return;
    }

    if (h.super) {
      if (h.megaTarget) {
        // Mega hammer: flies at its assigned front block
        // Check proximity to the live block position (it scrolls) OR the stored target
        const tb = h.megaTarget;
        if (tb.state === 'falling') {
          const bx = colX(tb.col, W);
          const by = blockY(tb);
          // Generous hitbox — 30px radius around block center
          const cx = bx, cy = by + BLOCK_H / 2;
          const d = Math.sqrt((h.x - cx) ** 2 + (h.y - cy) ** 2);
          if (d < 38) {
            tb.deathParticles = spawnDeathParticles(bx, cy, true);
            tb.state = 'dying'; tb.deathFrame = 0;
            // Activate power even when hit by mega hammer
            if (tb.power === 'freeze') {
              G.freezeUntil = Date.now() + 10000;
              G.pops.push({ txt: '⏱ FREEZE! +10s', x: W / 2, y: H - GROUND_H - 80, life: 2, big: true });
            } else if (tb.power === 'double') {
              G.doubleUntil = Date.now() + 10000;
              G.pops.push({ txt: '🔨🔨 DOUBLE HAMMERS!', x: W / 2, y: H - GROUND_H - 80, life: 2, big: true });
            } else if (tb.power === 'mega') {
              launchMegaSuper(W, H);
              G.pops.push({ txt: '⚡ MEGA STRIKE!', x: W / 2, y: H - GROUND_H - 80, life: 2, big: true });
            }
            const pts = Math.round(tb.prob.ans * Math.min(G.streak + 1, 8) * selSpeedMult * (1 + savedProgress.upgrades.scoreBoost * 0.1));
            G.score += pts;
            G.smashed++;
            G.streak++; G.maxStreak = Math.max(G.maxStreak, G.streak);
            updateHUD();
            if (G.smashed >= DRILL_TARGET) setTimeout(endGame, 400);
            G.pops.push({ txt: `+${pts} ⚡`, x: bx, y: by, life: 1.2, rainbow: true });
            h.hit = true; h.life = 0.8;
          }
        } else {
          h.hit = true; h.life = 0;
        }
        if (h.y < -80 || h.x < -80 || h.x > W + 80) h.life = 0;
        return;
      }
      // Normal super-hammer: pierce upward, destroy up to 4 blocks it touches
      const falling = G.blocks.filter(b => b.state === 'falling');
      for (const tb of falling) {
        const bx = colX(tb.col, W);
        const by = blockY(tb);
        if (h.x >= bx - BLOCK_W / 2 - 12 && h.x <= bx + BLOCK_W / 2 + 12 &&
            h.y >= by - 12 && h.y <= by + BLOCK_H + 12) {
          const bxC = bx, byC = by + BLOCK_H / 2;
          tb.deathParticles = spawnDeathParticles(bxC, byC, true);
          tb.state = 'dying'; tb.deathFrame = 0;
          // Activate power even when hit by super hammer
          if (tb.power === 'freeze') {
            G.freezeUntil = Date.now() + 10000;
            G.pops.push({ txt: '⏱ FREEZE! +10s', x: W / 2, y: H - GROUND_H - 80, life: 2, big: true });
          } else if (tb.power === 'double') {
            G.doubleUntil = Date.now() + 10000;
            G.pops.push({ txt: '🔨🔨 DOUBLE HAMMERS!', x: W / 2, y: H - GROUND_H - 80, life: 2, big: true });
          } else if (tb.power === 'mega') {
            launchMegaSuper(W, H);
            G.pops.push({ txt: '⚡ MEGA STRIKE!', x: W / 2, y: H - GROUND_H - 80, life: 2, big: true });
          }
          const pts = Math.round(tb.prob.ans * Math.min(G.streak + 1, 8) * selSpeedMult * (1 + savedProgress.upgrades.scoreBoost * 0.1));
          G.score += pts;
          G.smashed++;
          G.streak++;
          G.maxStreak = Math.max(G.maxStreak, G.streak);
          updateHUD();
          if (G.smashed >= DRILL_TARGET) setTimeout(endGame, 400);
          G.pops.push({ txt: `+${pts} 🌈`, x: bxC, y: by, life: 1.2, rainbow: true });
          h.blocksLeft--;
          if (h.blocksLeft <= 0) { h.hit = true; h.life = 0.8; break; }
        }
      }
      if (h.y < -80) h.life = 0;
      return;
    }

    // Normal hit hammer: check collision with target block
    if (h.targetBlock && h.targetBlock.state === 'falling') {
      const tb = h.targetBlock;
      const bx = colX(tb.col, W);
      const by = blockY(tb);
      if (h.x >= bx - BLOCK_W / 2 - 10 && h.x <= bx + BLOCK_W / 2 + 10 &&
          h.y >= by - 10 && h.y <= by + BLOCK_H + 10) {
        h.hit = true; h.life = 1;
        const bxCenter = bx, byCenter = by + BLOCK_H / 2;
        const isRainbow = tb.power !== null;
        tb.deathParticles = spawnDeathParticles(bxCenter, byCenter, isRainbow);
        tb.state = 'dying'; tb.deathFrame = 0;

        // Activate power if it's a power block
        if (tb.power === 'freeze') {
          G.freezeUntil = Date.now() + 15000;
          G.pops.push({ txt: '⏱ FREEZE! +15s', x: W / 2, y: H - GROUND_H - 80, life: 2, big: true });
        } else if (tb.power === 'double') {
          G.doubleUntil = Date.now() + 10000;
          G.pops.push({ txt: '🔨🔨 DOUBLE HAMMERS!', x: W / 2, y: H - GROUND_H - 80, life: 2, big: true });
        } else if (tb.power === 'mega') {
          launchMegaSuper(W, H);
          G.pops.push({ txt: '⚡ MEGA STRIKE!', x: W / 2, y: H - GROUND_H - 80, life: 2, big: true });
        }

        const elapsed = (Date.now() - h.throwTime) / 1000;
        const spd = elapsed < 1.5 ? 3 : elapsed < 4 ? 2 : 1;
        G.streak++;
        G.maxStreak = Math.max(G.maxStreak, G.streak);
        const mult = Math.min(G.streak, 8);
        const pts = Math.round(tb.prob.ans * spd * mult * selSpeedMult * (1 + savedProgress.upgrades.scoreBoost * 0.1));
        G.score += pts; G.smashed++;
        updateHUD();
        G.pops.push({ txt: `+${pts}`, x: bxCenter, y: by, life: 1 });

        // Drill complete: 100 correct answers reached
        if (G.smashed >= DRILL_TARGET) {
          setTimeout(endGame, 400);
        }

        // Every 4th smash triggers super hammer (power blocks count toward this too)
        if (G.smashed % 4 === 0 && !tb.power) {
          G.superReady = true;
          G.pops.push({ txt: '⚡ SUPER HAMMER!', x: W / 2, y: H - GROUND_H - 110, life: 1.8, big: true });
        }
      }
    } else if (!h.targetBlock || h.targetBlock.state !== 'falling') {
      h.type = 'miss'; h.gravity = 0.2;
    }

    if (h.y < -60 || h.x < -80 || h.x > W + 80) h.life = 0;
  });
  G.hammers = G.hammers.filter(h => h.life > 0);

  // ── Score pops ──
  G.pops.forEach(p => { p.y -= 1.4; p.life -= 0.028; });
  G.pops = G.pops.filter(p => p.life > 0);

  // ── Draw ──
  ctx.clearRect(0, 0, W, H);
  drawBackground(W, H);
  drawTimerBar(W);
  drawPowerStatus(W);

  G.blocks.forEach(b => { if (b.state !== 'dead') drawBlock(b, W, H); });
  G.blocks.forEach(b => { if (b.deathParticles.length) drawDeathParticles(b); });

  updateBombs(W, H, dt);

  // Update & draw player explosion particles
  if (G.playerParticles && G.playerParticles.length) {
    G.playerParticles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.2; p.life -= 0.035; p.r *= 0.98;
    });
    G.playerParticles = G.playerParticles.filter(p => p.life > 0);
    G.playerParticles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  G.hammers.forEach(h => drawHammer(h));
  drawBombs(W, H);
  if (!G.sprite.hidden) drawSprite(W, H);
  drawScorePops();
  drawFreezeCountdown(W, H);

  animId = requestAnimationFrame(loop);
}

// ── Submit ──
function submit() {
  if (!G.running) return;
  const inp = document.getElementById('answer-input');
  const val = parseInt(inp.value.trim(), 10);
  inp.value = '';
  inp.focus();

  if (isNaN(val)) { flashInput('bad'); return; }
  G.totalAttempts = (G.totalAttempts || 0) + 1;

  const W = canvas.width, H = canvas.height;
  // Only front blocks (one per column, closest to ground) are eligible
  const eligible = frontBlocks();
  const matches = eligible.filter(b => b.prob.ans === val);

  if (matches.length === 0) {
    flashInput('bad');
    G.streak = 0;
    updateHUD();
    // Wrong answer: streak reset only, no life penalty
    launchHammer('miss', null, W, H);
    return;
  }

  // Target the lowest (most urgent) front block
  const target = matches.reduce((a, b) => blockY(a) > blockY(b) ? a : b);
  G.correctAnswers++;
  flashInput('ok');

  // Record response time (spawn → correct answer typed)
  if (target.spawnTime) {
    G.totalResponseMs += Date.now() - target.spawnTime;
    G.responseCount++;
  }

  // If super-hammer is charged, fire it and consume the charge
  if (G.superReady) {
    G.superReady = false;
    const sp = G.sprite;
    sp.targetX = colX(target.col, W);
    sp.state = 'running';
    sp.pendingSuper = true;
    sp.pendingTarget = null;
    sp.throwTime = Date.now();
    return;
  }

  // Send sprite running to that column; it throws when it arrives
  const sp = G.sprite;
  sp.targetX = colX(target.col, W);
  sp.state = 'running';
  sp.pendingTarget = target;
  sp.pendingSuper = false;
  sp.throwTime = Date.now();

  // Double hammer: also immediately fire at a second matching front block (different col)
  if (Date.now() < G.doubleUntil) {
    const second = eligible.filter(b => b.prob.ans === val && b.col !== target.col);
    if (second.length > 0) {
      const t2 = second.reduce((a, b) => blockY(a) > blockY(b) ? a : b);
      // Launch second hammer from current sprite position right away
      launchHammer('hit', t2, W, H);
      G.hammers[G.hammers.length - 1].throwTime = sp.throwTime;
    }
  }
}

function submitScore(data) {
  if (!playerName || !db) return; // don't submit anonymous scores or if Firebase unavailable
  db.collection('blockCrusherScores').add(data).catch(err => console.warn('Score save failed:', err));
}

function flashInput(type) {
  const inp = document.getElementById('answer-input');
  const cls = type === 'ok' ? 'flash-ok' : 'flash-bad';
  inp.classList.add(cls);
  setTimeout(() => inp.classList.remove(cls), 280);
}

function startTimer() {
  G.timeLeft = GAME_DURATION;
  G.timerInterval = setInterval(() => {
    // Don't tick the game clock while wall is frozen
    if (Date.now() < G.freezeUntil) return;
    G.timeLeft--;
    if (G.timeLeft <= 0) endGame();
  }, 1000);
}

function startGame() {
  cancelAnimationFrame(animId);
  clearInterval(G.timerInterval || 0);
  resizeCanvas();

  const W = canvas.width, H = canvas.height;
  const NUM_START_ROWS = 4;

  G = {
    running: true,
    score: 0, smashed: 0, streak: 0, maxStreak: 0,
    lives: selLives + savedProgress.upgrades.extraLives,
    maxLives: selLives + savedProgress.upgrades.extraLives,
    level: 1,
    blocks: [], hammers: [], pops: [], bombs: [], playerParticles: [],
    timerInterval: null, timeLeft: GAME_DURATION,
    wallY: 0,        // current scroll Y of the wall (grows each frame)
    superReady: false,
    freezeUntil: 0,     // timestamp: wall frozen until this time
    doubleUntil: 0,     // timestamp: double-hammer active until this time
    rowCount: 0,        // counts spawned rows for power-block cadence
    totalAttempts: 0,   // total answer submissions (for accuracy calc)
    correctAnswers: 0,  // correct submissions, separate from bonus blocks smashed
    totalResponseMs: 0, // sum of ms from block spawn to correct answer typed
    responseCount: 0,   // number of correct answers contributing to avgResponseMs
    actionPowerCount: 0, // counts double/mega appearances to alternate them
    nextBombAt: selBombs ? Date.now() + 20000 : Infinity, // first bomb after 20s (or never)
  };

  buildLives();
  initSprite(W, H);

  // Seed initial wall rows above the screen
  for (let row = 0; row < NUM_START_ROWS; row++) {
    spawnWallRow(-(NUM_START_ROWS - row) * ROW_H);
  }

  document.getElementById('start-screen').hidden = true;
  document.getElementById('end-screen').hidden = true;
  updateHUD();
  startTimer();

  lastTime = performance.now();
  spawnTimer = 0;
  animId = requestAnimationFrame(loop);
  document.getElementById('answer-input').focus();
}

function endGame(reason) {
  if (!G.running) return;
  G.running = false;
  clearInterval(G.timerInterval);
  cancelAnimationFrame(animId);

  const unlocksZeroMode = !savedProgress.zeroUnlocked &&
    selMultiples.size === 1 && selMultiples.has(12) &&
    G.smashed >= DRILL_TARGET &&
    G.totalAttempts > 0 && G.correctAnswers === G.totalAttempts;
  if (unlocksZeroMode) {
    savedProgress.zeroUnlocked = true;
    addMultipleChip(0, document.getElementById('mult-grid'));
  }

  G.maxStreak = Math.max(G.maxStreak, G.streak);
  savedProgress.points += G.score;
  saveProgress();
  renderUpgradeMenu();
  document.getElementById('end-score').textContent = G.score;
  const elapsed = GAME_DURATION - G.timeLeft;
  const fpm = elapsed > 0 ? (G.smashed / elapsed * 60).toFixed(1) : '0.0';
  document.getElementById('end-stats').textContent =
    `${G.smashed}/${DRILL_TARGET} CORRECT · ${fpm}/min · BEST STREAK ×${G.maxStreak}`;

  // Three end conditions: drill complete, time up, lives gone
  const drillDone = G.smashed >= DRILL_TARGET;
  const livesGone = G.lives <= 0;

  let title, msg;
  if (drillDone) {
    title = 'DRILL COMPLETE!';
    const timeLeft = G.timeLeft;
    msg = timeLeft > 60
      ? `You finished with ${Math.floor(timeLeft/60)}:${String(timeLeft%60).padStart(2,'0')} to spare! ⚡`
      : `You finished with ${G.timeLeft}s to spare! 💪`;
  } else if (livesGone) {
    title = 'GAME OVER';
    msg = `Blocks reached the ground — ${G.smashed} of ${DRILL_TARGET} completed.`;
  } else {
    // Time ran out
    title = G.smashed >= 75 ? 'SO CLOSE!' : G.smashed >= 50 ? 'WELL DONE' : 'TIME\'S UP';
    msg = G.smashed >= 75
      ? `${G.smashed}/${DRILL_TARGET} — almost there! Try again! 🔥`
      : `${G.smashed}/${DRILL_TARGET} correct. Keep practicing!`;
  }

  if (unlocksZeroMode) msg += ' Secret unlocked: 0× mode!';
  document.getElementById('end-title').textContent = title;
  document.getElementById('end-msg').textContent = msg;
  // Compute avg response time (ms per correct answer)
  const avgResponseMs = G.responseCount > 0
    ? Math.round(G.totalResponseMs / G.responseCount)
    : null;

  const multStr = [...selMultiples].sort((a,b)=>a-b).join(',');

  // Submit score to Firebase
  submitScore({
    name: playerName || 'Anonymous',
    studentId: playerStudentId || null,
    grade: playerGrade,
    period: playerPeriod,
    score: G.score,
    smashed: G.smashed,
    accuracy: (G.totalAttempts || 0) > 0
      ? Math.round(G.correctAnswers / G.totalAttempts * 100)
      : 0,
    speed: speedLabel,
    multiples: multStr,
    avgResponseMs,
    date: new Date().toISOString(),
  });

  // Save speed progress to blockCrusherProgress (keyed by studentId + multiple)
  if (playerStudentId && avgResponseMs !== null && db) {
    const progressKey = `${playerStudentId}_${multStr}`;
    const progressRef = db.collection('blockCrusherProgress').doc(progressKey);
    progressRef.get().then(snap => {
      const now = new Date().toISOString();
      if (!snap.exists) {
        // First attempt ever for this student + multiple combo
        progressRef.set({
          studentId: playerStudentId,
          name: playerName || 'Anonymous',
          grade: playerGrade,
          period: playerPeriod,
          multiples: multStr,
          firstAttemptMs: avgResponseMs,
          firstAttemptDate: now,
          bestAvgResponseMs: avgResponseMs,
          bestDate: now,
          attemptCount: 1,
        }).catch(err => console.warn('Progress save failed:', err));
      } else {
        const prev = snap.data();
        const isBetter = avgResponseMs < (prev.bestAvgResponseMs || Infinity);
        progressRef.update({
          name: playerName || 'Anonymous',
          grade: playerGrade,
          period: playerPeriod,
          bestAvgResponseMs: isBetter ? avgResponseMs : prev.bestAvgResponseMs,
          bestDate: isBetter ? now : prev.bestDate,
          attemptCount: (prev.attemptCount || 1) + 1,
        }).catch(err => console.warn('Progress update failed:', err));
      }
    }).catch(err => console.warn('Progress read failed:', err));
  }
  document.getElementById('end-screen').hidden = false;
}

function updateBombToggleUI() {
  const on = document.getElementById('bombs-on');
  const off = document.getElementById('bombs-off');
  if (selBombs) {
    on.style.background = '#7a1a1a'; on.style.color = '#ff9944';
    off.style.background = '#1a1a1a'; off.style.color = '#666';
  } else {
    off.style.background = '#2a6a2a'; off.style.color = '#7fff7f';
    on.style.background = '#1a1a1a'; on.style.color = '#666';
  }
}
updateBombToggleUI();
renderUpgradeMenu();
document.getElementById('upgrade-open').addEventListener('click', () => {
  renderUpgradeMenu();
  document.getElementById('upgrade-screen').hidden = false;
});
document.getElementById('upgrade-close').addEventListener('click', () => {
  document.getElementById('upgrade-screen').hidden = true;
});
document.getElementById('bombs-on').addEventListener('click', () => {
  selBombs = true; updateBombToggleUI();
});
document.getElementById('bombs-off').addEventListener('click', () => {
  selBombs = false; updateBombToggleUI();
});

document.getElementById('menu-btn').addEventListener('click', () => {
  if (!confirm('Return to Main Menu? Your current game will be lost.')) return;
  cancelAnimationFrame(animId);
  clearInterval(G.timerInterval || 0);
  G.running = false;
  // Reset to Card 0 if no name yet, Card 1 if name already entered
  const goToCard = playerName ? 1 : 0;
  document.getElementById('setup-card-0').hidden = (goToCard !== 0);
  document.getElementById('setup-card-1').hidden = (goToCard !== 1);
  document.getElementById('setup-card-2').hidden = true;
  document.getElementById('end-screen').hidden = true;
  document.getElementById('start-screen').hidden = false;
});

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', () => {
  // If player already entered their name, skip Card 0 and go straight to multiples
  const goToCard = playerName ? 1 : 0;
  document.getElementById('setup-card-0').hidden = (goToCard !== 0);
  document.getElementById('setup-card-1').hidden = (goToCard !== 1);
  document.getElementById('setup-card-2').hidden = true;
  document.getElementById('end-screen').hidden = true;
  document.getElementById('start-screen').hidden = false;
  // Re-populate name field so it shows current name if going to Card 0
  if (playerName) document.getElementById('player-name').value = playerName;
  // Restart title animation
  requestAnimationFrame(() => {
    if (window._titleLoop) window._titleLoop();
  });
});
document.getElementById('blast-btn').addEventListener('click', submit);
document.getElementById('answer-input').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });

// ── Title screen character animation ──
(function animateTitleChar() {
  const tc = document.getElementById('title-canvas');
  if (!tc) return;
  const c = tc.getContext('2d');
  const W = tc.width, H = tc.height;
  let frame = 0;
  let hammerX = 0, hammerY = 0, hammerVX = 0, hammerVY = 0;
  let hammerActive = false, hammerRot = 0;
  let throwPhase = 0; // 0=idle, 1=windup, 2=throw, 3=recovery
  let phaseTimer = 0;
  // Block state for title animation
  let titleBlockY = -10;
  let blockDestroyed = false;
  let blockDeathFrame = 0;
  let blockParticles = [];
  const TITLE_RAINBOW = ['#ff4444','#ff9900','#ffee00','#44ff44','#44aaff','#aa44ff','#ff44cc'];

  function drawTitleSprite(x, baseY, phase, bob) {
    const B = bob;
    c.save();

    // Shadow
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath(); c.ellipse(x, baseY, 18, 5, 0, 0, Math.PI*2); c.fill();

    // Boots
    c.fillStyle = '#3a2010';
    c.beginPath(); c.ellipse(x-8, baseY-3, 8, 5, -0.15, 0, Math.PI*2); c.fill();
    c.beginPath(); c.ellipse(x+8, baseY-3, 8, 5, 0.15, 0, Math.PI*2); c.fill();

    // Pants
    c.fillStyle = '#1e3560';
    c.beginPath(); c.roundRect(x-11, baseY-24, 22, 16, 3); c.fill();
    c.strokeStyle = '#162848'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(x, baseY-8); c.lineTo(x, baseY-24); c.stroke();

    // Body
    c.fillStyle = '#c8a84b';
    c.beginPath(); c.roundRect(x-13, baseY-44-B, 26, 22, 5); c.fill();

    // Bib
    c.fillStyle = '#a07828';
    c.beginPath(); c.roundRect(x-7, baseY-42-B, 14, 14, 3); c.fill();

    // Suspenders
    c.strokeStyle = '#7a5c18'; c.lineWidth = 2.5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x-7, baseY-28-B); c.lineTo(x-10, baseY-44-B); c.stroke();
    c.beginPath(); c.moveTo(x+7, baseY-28-B); c.lineTo(x+10, baseY-44-B); c.stroke();

    // Neck
    c.fillStyle = '#e0a060';
    c.beginPath(); c.roundRect(x-4, baseY-52-B, 8, 10, 2); c.fill();

    // Head
    c.fillStyle = '#f4c27a';
    c.beginPath(); c.ellipse(x, baseY-60-B, 13, 13, 0, 0, Math.PI*2); c.fill();

    // Hard hat brim
    c.fillStyle = '#d4a830';
    c.beginPath(); c.roundRect(x-16, baseY-70-B, 32, 5, 2); c.fill();
    // Hard hat dome
    c.fillStyle = '#e8c44a';
    c.beginPath(); c.arc(x, baseY-70-B, 13, Math.PI, 0); c.fill();

    // Eyes
    const squint = phase === 2;
    c.fillStyle = '#2a1208';
    c.beginPath(); c.ellipse(x-4.5, baseY-62-B, 2.5, squint?1:2.5, 0, 0, Math.PI*2); c.fill();
    c.beginPath(); c.ellipse(x+4.5, baseY-62-B, 2.5, squint?1:2.5, 0, 0, Math.PI*2); c.fill();

    // Mouth
    c.strokeStyle = '#2a1208'; c.lineWidth = 1.8; c.lineCap = 'round';
    c.beginPath();
    if (phase === 2) {
      c.moveTo(x-5, baseY-56-B); c.lineTo(x+5, baseY-56-B);
    } else {
      c.arc(x, baseY-57-B, 4, 0, Math.PI);
    }
    c.stroke();

    // Arms
    const sL = { x: x-12, y: baseY-40-B };
    const sR = { x: x+12, y: baseY-40-B };

    c.strokeStyle = '#e0a060'; c.lineWidth = 7; c.lineCap = 'round';
    if (phase === 1) {
      // Windup: right arm cocked back high
      c.beginPath(); c.moveTo(sL.x, sL.y);
      c.quadraticCurveTo(x-18, baseY-28-B, x-14, baseY-24-B); c.stroke();
      c.beginPath(); c.moveTo(sR.x, sR.y);
      c.quadraticCurveTo(x+28, baseY-52-B, x+20, baseY-72-B); c.stroke();
      c.fillStyle = '#e0a060';
      c.beginPath(); c.ellipse(x+20, baseY-72-B, 5, 5, 0, 0, Math.PI*2); c.fill();
    } else if (phase === 2) {
      // Follow-through: arm swung forward and up
      c.beginPath(); c.moveTo(sL.x, sL.y);
      c.quadraticCurveTo(x-20, baseY-28-B, x-14, baseY-26-B); c.stroke();
      c.beginPath(); c.moveTo(sR.x, sR.y);
      c.quadraticCurveTo(x+22, baseY-54-B, x+16, baseY-67-B); c.stroke();
      c.fillStyle = '#e0a060';
      c.beginPath(); c.ellipse(x+16, baseY-67-B, 5, 5, 0, 0, Math.PI*2); c.fill();
    } else {
      // Idle: hammer held ready
      c.beginPath(); c.moveTo(sL.x, sL.y);
      c.quadraticCurveTo(x-18, baseY-26-B, x-14, baseY-22-B); c.stroke();
      c.beginPath(); c.moveTo(sR.x, sR.y);
      c.quadraticCurveTo(x+20, baseY-30-B, x+18, baseY-22-B); c.stroke();
      c.save();
      c.translate(x+18, baseY-22-B); c.rotate(0.3);
      c.strokeStyle = '#6b3d10'; c.lineWidth = 4;
      c.beginPath(); c.moveTo(0,0); c.lineTo(0,-20); c.stroke();
      c.fillStyle = '#999'; c.strokeStyle = '#666'; c.lineWidth = 1.5;
      c.beginPath(); c.roundRect(-7,-28,14,16,2); c.fill(); c.stroke();
      c.restore();
    }

    c.restore();
  }

  function drawTitleHammer(hx, hy, rot) {
    c.save();
    c.translate(hx, hy);
    c.rotate(rot);
    const t = frame / 4;
    const RAINBOW_H = ['#ff4444','#ff9900','#ffee00','#44ff44','#44aaff','#aa44ff','#ff44cc'];
    // Trail
    c.globalAlpha = 0.35;
    for (let i = 0; i < 5; i++) {
      c.fillStyle = RAINBOW_H[(Math.floor(t)+i)%7];
      c.beginPath(); c.ellipse(0, i*4-10, 10-i, 5, 0, 0, Math.PI*2); c.fill();
    }
    c.globalAlpha = 1;
    // Handle
    c.strokeStyle = '#8b5c20'; c.lineWidth = 5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(0,-14); c.lineTo(0,18); c.stroke();
    // Head
    const hue = (t*30)%360;
    c.fillStyle = `hsl(${hue},100%,65%)`;
    c.strokeStyle = `hsl(${(hue+40)%360},100%,80%)`; c.lineWidth = 2;
    c.beginPath(); c.roundRect(-11,-26,22,18,3); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(-8,-24,6,7);
    c.restore();
  }

  const RAINBOW_H = ['#ff4444','#ff9900','#ffee00','#44ff44','#44aaff','#aa44ff','#ff44cc'];

  function titleLoop() {
    if (document.getElementById('start-screen').hidden) return;
    c.clearRect(0, 0, W, H);

    // Subtle background
    c.fillStyle = '#08040f';
    c.fillRect(0, 0, W, H);

    // Ground line
    const groundY = H - 18;
    c.strokeStyle = '#6b4820'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, groundY); c.lineTo(W, groundY); c.stroke();

    const charX = W * 0.42;
    const baseY = groundY;

    phaseTimer++;

    // Phase cycle: 0=idle(60f) → 1=windup(20f) → 2=throw(15f) → 3=recovery(30f) → repeat
    const IDLE=60, WINDUP=20, THROW=15, RECOVER=30;
    const cycle = IDLE+WINDUP+THROW+RECOVER;
    const t = phaseTimer % cycle;

    if (t < IDLE) {
      throwPhase = 0;
    } else if (t < IDLE+WINDUP) {
      throwPhase = 1;
    } else if (t === IDLE+WINDUP) {
      throwPhase = 2;
      // Launch hammer!
      hammerActive = true;
      hammerX = charX + 16;
      hammerY = baseY - 67;
      hammerVX = 3.5;
      hammerVY = -6;
      hammerRot = 0;
    } else if (t < IDLE+WINDUP+THROW) {
      throwPhase = 2;
    } else {
      throwPhase = 3;
    }

    // Advance block Y (falls independently of hammer)
    const bx = W * 0.78;
    if (!blockDestroyed) {
      titleBlockY += 0.5;
      if (titleBlockY > groundY - 36) titleBlockY = -10; // reset when it hits ground
    }

    // Update flying hammer
    if (hammerActive) {
      hammerX += hammerVX;
      hammerY += hammerVY;
      hammerVY += 0.35;
      hammerRot += 0.28;
      // Check collision with the block
      if (!blockDestroyed) {
        const bCx = bx, bCy = titleBlockY + 18;
        const dist = Math.sqrt((hammerX - bCx)**2 + (hammerY - bCy)**2);
        if (dist < 32) {
          blockDestroyed = true;
          blockDeathFrame = 0;
          hammerActive = false;
          // Spawn death particles
          blockParticles = [];
          for (let i = 0; i < 28; i++) {
            const ang = (i / 28) * Math.PI * 2;
            const spd = 2.5 + Math.random() * 4;
            blockParticles.push({
              x: bCx, y: bCy,
              vx: Math.cos(ang)*spd, vy: Math.sin(ang)*spd - 2,
              life: 1, dec: 0.032 + Math.random()*0.02,
              sz: 3 + Math.random()*4,
              col: TITLE_RAINBOW[Math.floor(Math.random()*7)]
            });
          }
        }
      }
      // Draw arc trail sparkles
      if (Math.random() < 0.6) {
        c.fillStyle = RAINBOW_H[Math.floor(frame/3)%7];
        c.globalAlpha = 0.7;
        c.beginPath(); c.arc(hammerX, hammerY, 3+Math.random()*3, 0, Math.PI*2); c.fill();
        c.globalAlpha = 1;
      }
      drawTitleHammer(hammerX, hammerY, hammerRot);
      if (hammerY > H + 20 || hammerX > W + 20) hammerActive = false;
    }

    // Draw or explode the block
    if (blockDestroyed) {
      blockDeathFrame++;
      blockParticles.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life -= p.dec;
        if (p.life > 0) {
          c.save(); c.globalAlpha = Math.max(0, p.life);
          c.fillStyle = p.col;
          c.beginPath(); c.arc(p.x, p.y, p.sz * Math.max(0,p.life), 0, Math.PI*2); c.fill();
          c.restore();
        }
      });
      blockParticles = blockParticles.filter(p => p.life > 0);
      if (blockParticles.length === 0) {
        // Reset for next cycle
        blockDestroyed = false;
        titleBlockY = -10;
      }
    } else {
      const by = titleBlockY;
      if (by < groundY - 2) {
        c.save();
        const bg = c.createLinearGradient(bx-28, by, bx+28, by+36);
        bg.addColorStop(0,'#f5f0e0'); bg.addColorStop(1,'#ede5c8');
        c.fillStyle = bg;
        c.strokeStyle = '#c8b87a'; c.lineWidth = 2;
        c.beginPath(); c.roundRect(bx-28, by, 56, 36, 5); c.fill(); c.stroke();
        c.font = `900 13px 'Nunito',sans-serif`; c.fillStyle = '#1a1208';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('6 × 7', bx, by+18);
        c.restore();
      }
    }

    drawTitleSprite(charX, baseY, throwPhase === 3 ? 2 : throwPhase, 0);

    frame++;
    if (!document.getElementById('start-screen').hidden) {
      requestAnimationFrame(titleLoop);
    }
  }

  window._titleLoop = titleLoop;
  requestAnimationFrame(titleLoop);
})();
