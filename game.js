'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#b0bec5', // N - steel silver (nut)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N (nut, hollow center)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const pauseMenu = document.getElementById('pause-menu');
const pauseResumeBtn = document.getElementById('pause-resume');
const pauseRestartBtn = document.getElementById('pause-restart');
const pauseControlsBtn = document.getElementById('pause-controls-btn');
const pauseControlsList = document.getElementById('pause-controls');
const startLevelSel = document.getElementById('start-level');
const startOverlay = document.getElementById('start-overlay');
const startBtn = document.getElementById('start-btn');
const startLb = document.getElementById('start-lb');
const overlayLb = document.getElementById('overlay-lb');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const nameEntry = document.getElementById('name-entry');
const nameInput = document.getElementById('name-input');

// ---- Leaderboard (localStorage `tetris.leaderboard`) ----
const LB_KEY = 'tetris.leaderboard';
const LB_SIZE = 5;
let highlightIdx = -1; // index in scores of the row just saved

function loadLeaderboard() {
  const empty = { scores: [], bestCombo: 0, maxLines: 0 };
  try {
    const d = JSON.parse(localStorage.getItem(LB_KEY));
    if (!d || typeof d !== 'object' || !Array.isArray(d.scores)) return empty;
    const scores = d.scores
      .filter(s => s && Number.isFinite(s.score))
      .map(s => ({ name: String(s.name ?? '').slice(0, 12), score: s.score, lines: s.lines || 0,
                   level: s.level || 1, combo: s.combo || 0, date: s.date || '' }))
      .sort((a, b) => b.score - a.score).slice(0, LB_SIZE);
    return { scores, bestCombo: Number(d.bestCombo) || 0, maxLines: Number(d.maxLines) || 0 };
  } catch (e) { return empty; }
}

function saveLeaderboard(lb) {
  try { localStorage.setItem(LB_KEY, JSON.stringify(lb)); } catch (e) { /* storage unavailable */ }
}

function qualifies(s) {
  if (s <= 0) return false;
  const { scores } = loadLeaderboard();
  return scores.length < LB_SIZE || s > scores[scores.length - 1].score;
}

function renderLeaderboard(container, hl) {
  const lb = loadLeaderboard();
  container.textContent = '';
  const h = document.createElement('h3');
  h.textContent = 'TOP 5';
  const ol = document.createElement('ol');
  for (let i = 0; i < LB_SIZE; i++) {
    const li = document.createElement('li');
    const s = lb.scores[i];
    if (!s) { li.className = 'empty'; li.textContent = '---'; }
    else {
      if (i === hl) li.className = 'highlight';
      for (const t of [i + 1, s.name, s.score.toLocaleString()]) {
        const sp = document.createElement('span');
        sp.textContent = t;
        li.appendChild(sp);
      }
    }
    ol.appendChild(li);
  }
  const stats = document.createElement('div');
  stats.className = 'lb-stats';
  stats.textContent = `Best combo: ${lb.bestCombo}  |  Max lines: ${lb.maxLines}`;
  container.append(h, ol, stats);
}

function recordGameStats() {
  const lb = loadLeaderboard();
  lb.bestCombo = Math.max(lb.bestCombo, maxCombo);
  lb.maxLines = Math.max(lb.maxLines, lines);
  saveLeaderboard(lb);
}

function submitScore(name) {
  const lb = loadLeaderboard();
  const entry = { name: (name || '').trim().slice(0, 12) || 'PLAYER', score, lines, level,
                  combo: maxCombo, date: new Date().toISOString() };
  lb.scores.push(entry);
  lb.scores.sort((a, b) => b.score - a.score);
  const idx = lb.scores.indexOf(entry);
  lb.scores = lb.scores.slice(0, LB_SIZE);
  saveLeaderboard(lb);
  return idx < LB_SIZE ? idx : -1;
}

let theme = 'dark';
let gridColor = '#22222e';

function applyTheme(t) {
  theme = t;
  document.documentElement.dataset.theme = t;
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim() || gridColor;
  themeToggle.textContent = t === 'dark' ? 'LIGHT MODE' : 'DARK MODE';
  // redraw so paused / game-over screens pick up the new colours
  if (current && next) { draw(); drawNext(); }
}

let startLevel = 1;   // level the current game started on
let pendingStartLevel = 1; // menu selection; becomes startLevel on next init()
let resumeGuard = false; // after resume, ignore held/repeating keys until a fresh keydown
let combo = 0, maxCombo = 0;
let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * (PIECES.length - 1)) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    combo++;
    maxCombo = Math.max(maxCombo, combo);
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.max(startLevel, Math.floor(lines / 10) + 1);
    dropInterval = intervalForLevel(level);
    updateHUD();
  } else {
    combo = 0;
  }
}

function intervalForLevel(lv) {
  return Math.max(100, 1000 - (lv - 1) * 90);
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  if (colorIndex === 8) {
    // metallic: diagonal brushed-steel gradient
    const gx = x * size + 1, gy = y * size + 1, gs = size - 2;
    const grad = context.createLinearGradient(gx, gy, gx + gs, gy + gs);
    grad.addColorStop(0, '#eceff1');
    grad.addColorStop(0.5, '#90a4ae');
    grad.addColorStop(0.7, '#cfd8dc');
    grad.addColorStop(1, '#607d8b');
    context.fillStyle = grad;
  } else {
    context.fillStyle = color;
  }
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Score: ${score.toLocaleString()}`;
  recordGameStats();
  if (qualifies(score)) {
    nameInput.value = 'PLAYER';
    nameEntry.classList.remove('hidden');
  } else {
    nameEntry.classList.add('hidden');
  }
  renderLeaderboard(overlayLb, -1);
  overlayLb.classList.remove('hidden');
  restartBtn.classList.remove('hidden');
  overlay.classList.remove('hidden');
  if (!nameEntry.classList.contains('hidden')) { nameInput.focus(); nameInput.select(); }
}

function togglePause() {
  if (gameOver) return;
  if (paused) resumeGame(); else openPauseMenu();
}

function openPauseMenu() {
  paused = true;
  cancelAnimationFrame(animId);
  pauseControlsList.classList.add('hidden');
  pauseControlsBtn.setAttribute('aria-expanded', 'false');
  startLevelSel.value = String(pendingStartLevel);
  pauseMenu.classList.remove('hidden');
  pauseResumeBtn.focus();
}

function resumeGame() {
  if (!paused) return;
  paused = false;
  resumeGuard = true;
  pauseMenu.classList.add('hidden');
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  dropAccum = 0;
  lastTime = performance.now();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  // endGame() may have run during this frame (lockPiece → spawn); don't reschedule
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  startLevel = pendingStartLevel;
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = intervalForLevel(level);
  combo = 0;
  maxCombo = 0;
  resumeGuard = true;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (!gameStarted) return;
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (e.repeat) return;
    // Escape inside the level dropdown closes the list, not the menu
    if (paused && e.code === 'Escape' && document.activeElement === startLevelSel) { return; }
    togglePause();
    return;
  }
  if (paused) { trapMenuKeys(e); return; }
  if (gameOver) return;
  if (resumeGuard) {
    if (e.repeat) return; // key held across resume/restart
    resumeGuard = false;
  }
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', () => {
  // don't lose a qualifying score the player never submitted
  if (gameOver && !nameEntry.classList.contains('hidden')) submitScore(nameInput.value);
  restartBtn.blur();
  init();
});

let gameStarted = false;

startBtn.addEventListener('click', () => {
  gameStarted = true;
  startOverlay.classList.add('hidden');
  startBtn.blur();
  init();
});

nameEntry.addEventListener('submit', e => {
  e.preventDefault();
  highlightIdx = submitScore(nameInput.value);
  nameEntry.classList.add('hidden');
  renderLeaderboard(overlayLb, highlightIdx);
  restartBtn.focus();
});

// Pause menu: block game inputs (keydown returns early while paused) and keep Tab inside the menu
function trapMenuKeys(e) {
  if (e.code === 'Tab') {
    const f = [...pauseMenu.querySelectorAll('button, select')].filter(el => el.offsetParent !== null);
    const i = f.indexOf(document.activeElement);
    e.preventDefault();
    const n = i === -1 ? (e.shiftKey ? f.length - 1 : 0) : (i + (e.shiftKey ? -1 : 1) + f.length) % f.length;
    f[n].focus();
  }
}

pauseResumeBtn.addEventListener('click', resumeGame);
pauseRestartBtn.addEventListener('click', () => {
  init();
  if (document.activeElement) document.activeElement.blur();
});
pauseControlsBtn.addEventListener('click', () => {
  const show = pauseControlsList.classList.toggle('hidden') === false;
  pauseControlsBtn.setAttribute('aria-expanded', String(show));
});
startLevelSel.addEventListener('change', () => {
  pendingStartLevel = parseInt(startLevelSel.value, 10) || 1;
});

resetRecordsBtn.addEventListener('click', () => {
  if (!confirm('Reset all saved records?')) return;
  try { localStorage.removeItem(LB_KEY); } catch (e) { /* ignore */ }
  renderLeaderboard(startLb, -1);
});

themeToggle.addEventListener('click', () => {
  applyTheme(theme === 'dark' ? 'light' : 'dark');
  themeToggle.blur(); // keep Space / arrows going to the game
});

applyTheme('dark');

renderLeaderboard(startLb, -1);
// game starts when the Start button is pressed
