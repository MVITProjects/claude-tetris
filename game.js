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
const pauseMenu = document.getElementById('pause-menu');
const pauseMain = document.getElementById('pause-main');
const pauseControls = document.getElementById('pause-controls');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const controlsBackBtn = document.getElementById('controls-back-btn');
const startLevelSel = document.getElementById('start-level');
const themeToggle = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');
const overlayRank = document.getElementById('overlay-rank');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const leaderboardList = document.getElementById('leaderboard-list');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const resetRecordsBtn = document.getElementById('reset-records');

// ---- Leaderboard (localStorage) ----
const STORAGE_KEY = 'tetris.records';
const TOP_N = 5;

function loadRecords() {
  const empty = { scores: [], bestCombo: 0, maxLines: 0 };
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!d || !Array.isArray(d.scores)) return empty;
    return {
      scores: d.scores
        .filter(e => e && Number.isFinite(e.score))
        .map(e => ({ name: String(e.name || '---').slice(0, 12), score: e.score }))
        .slice(0, TOP_N),
      bestCombo: Number(d.bestCombo) || 0,
      maxLines: Number(d.maxLines) || 0,
    };
  } catch (e) { return empty; }
}

function saveRecords(rec) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rec)); } catch (e) { /* storage unavailable */ }
}

// 0-based rank this score would take, or -1 if it misses the top 5 (ties rank below existing)
function rankFor(sc, rec) {
  if (sc <= 0) return -1;
  let i = rec.scores.findIndex(e => sc > e.score);
  if (i === -1) i = rec.scores.length;
  return i < TOP_N ? i : -1;
}

function renderLeaderboard(rec, highlightIdx, pending) {
  const rows = rec.scores.map(e => ({ ...e }));
  if (pending) rows.splice(highlightIdx, 0, { name: 'YOU', score: pending.score });
  leaderboardList.innerHTML = '';
  for (let i = 0; i < TOP_N; i++) {
    const li = document.createElement('li');
    const n = document.createElement('span');
    const sc = document.createElement('span');
    if (rows[i]) {
      n.textContent = `${i + 1}. ${rows[i].name}`;
      sc.textContent = rows[i].score.toLocaleString();
      if (i === highlightIdx) li.classList.add('highlight');
    } else {
      n.textContent = `${i + 1}. ---`;
      sc.textContent = '';
      li.classList.add('empty');
    }
    li.append(n, sc);
    leaderboardList.appendChild(li);
  }
  bestComboEl.textContent = rec.bestCombo;
  maxLinesEl.textContent = rec.maxLines;
}

let theme = 'dark';
let gridColor = '#22222e';

function updateGridColor() {
  const sk = SKINS[skin];
  gridColor = (sk && sk.grid) || getComputedStyle(document.documentElement).getPropertyValue('--grid').trim() || gridColor;
}

function applyTheme(t) {
  theme = t;
  document.documentElement.dataset.theme = t;
  updateGridColor();
  themeToggle.textContent = t === 'dark' ? 'LIGHT MODE' : 'DARK MODE';
  // redraw so paused / game-over screens pick up the new colours
  if (current && next) { draw(); drawNext(); }
}

const MAX_START_LEVEL = 10;
let startLevel = 1;

function intervalFor(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

let started = false, combo = 0, bestComboRun = 0, pendingRank = -1;
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
    bestComboRun = Math.max(bestComboRun, combo);
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = startLevel + Math.floor(lines / 10);
    dropInterval = intervalFor(level);
    updateHUD();
  } else {
    combo = 0;
  }
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

// ---- Skins ----
// Each skin supplies a colour table (same indices as COLORS) and a draw function
// that paints one block at pixel position (px, py) with side length s.
function roundRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

const SKINS = {
  retro: {
    colors: COLORS,
    bg: null,
    draw(context, px, py, s, color, idx) {
      if (idx === 8) {
        // metallic: diagonal brushed-steel gradient
        const grad = context.createLinearGradient(px + 1, py + 1, px + s - 1, py + s - 1);
        grad.addColorStop(0, '#eceff1');
        grad.addColorStop(0.5, '#90a4ae');
        grad.addColorStop(0.7, '#cfd8dc');
        grad.addColorStop(1, '#607d8b');
        context.fillStyle = grad;
      } else {
        context.fillStyle = color;
      }
      context.fillRect(px + 1, py + 1, s - 2, s - 2);
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(px + 1, py + 1, s - 2, 4);
    },
  },
  neon: {
    colors: [null, '#00f0ff', '#fff200', '#d500f9', '#39ff14', '#ff1744', '#2979ff', '#ff9100', '#e0e0e0'],
    bg: '#000',
    grid: '#16161f',
    draw(context, px, py, s, color) {
      context.shadowColor = color;
      context.shadowBlur = 12;
      context.fillStyle = color + '40';
      context.fillRect(px + 3, py + 3, s - 6, s - 6);
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.strokeRect(px + 3, py + 3, s - 6, s - 6);
      context.shadowBlur = 0;
      context.shadowColor = 'transparent';
    },
  },
  pastel: {
    colors: [null, '#a8e6ef', '#fff3b0', '#d9b8f0', '#b8e6c1', '#f5b5b5', '#b5d3f5', '#fbd1a2', '#d5dde2'],
    bg: null,
    draw(context, px, py, s, color) {
      roundRectPath(context, px + 1.5, py + 1.5, s - 3, s - 3, s * 0.3);
      context.fillStyle = color;
      context.fill();
      roundRectPath(context, px + s * 0.2, py + s * 0.15, s * 0.45, s * 0.2, s * 0.1);
      context.fillStyle = 'rgba(255,255,255,0.45)';
      context.fill();
    },
  },
  pixel: {
    colors: COLORS,
    bg: null,
    draw(context, px, py, s, color, idx) {
      const u = Math.floor((s - 2) / 5); // 5x5 grid of "pixels"
      const ox = px + 1 + Math.floor((s - 2 - u * 5) / 2);
      const oy = py + 1 + Math.floor((s - 2 - u * 5) / 2);
      context.fillStyle = color;
      context.fillRect(ox, oy, u * 5, u * 5);
      for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 5; j++) {
          if (i === 0 || j === 0) context.fillStyle = 'rgba(255,255,255,0.35)';
          else if (i === 4 || j === 4) context.fillStyle = 'rgba(0,0,0,0.35)';
          else if ((i + j) % 2 === 0) context.fillStyle = 'rgba(0,0,0,0.12)';
          else continue;
          context.fillRect(ox + j * u, oy + i * u, u, u);
        }
      }
    },
  },
};

const SKIN_KEY = 'tetris-skin';
let skin = 'retro';

function applySkin(name) {
  if (!SKINS[name]) name = 'retro';
  skin = name;
  skinSelect.value = name;
  try { localStorage.setItem(SKIN_KEY, name); } catch (e) {}
  const bg = SKINS[name].bg || '';
  canvas.style.background = bg;
  nextCanvas.style.background = bg;
  updateGridColor();
  if (current && next) { draw(); drawNext(); }
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const sk = SKINS[skin];
  context.globalAlpha = alpha ?? 1;
  sk.draw(context, x * size, y * size, size, sk.colors[colorIndex], colorIndex);
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
  const rec = loadRecords();
  rec.bestCombo = Math.max(rec.bestCombo, bestComboRun);
  rec.maxLines = Math.max(rec.maxLines, lines);
  saveRecords(rec);

  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Score: ${score.toLocaleString()} · Lines: ${lines} · Combo: ${bestComboRun}`;
  pauseMenu.classList.add('hidden');
  pendingRank = rankFor(score, rec);
  if (pendingRank >= 0) {
    overlayRank.textContent = `NEW HIGH SCORE! Rank #${pendingRank + 1}`;
    overlayRank.classList.remove('hidden');
    nameForm.classList.remove('hidden');
    restartBtn.classList.add('hidden');
    nameInput.value = '';
    renderLeaderboard(rec, pendingRank, { score });
    overlay.classList.remove('hidden');
    nameInput.focus();
  } else {
    overlayRank.classList.add('hidden');
    nameForm.classList.add('hidden');
    restartBtn.classList.remove('hidden');
    renderLeaderboard(rec, -1);
    overlay.classList.remove('hidden');
  }
}

function showStartScreen() {
  overlayTitle.textContent = 'TETRIS';
  overlayScore.textContent = '';
  pauseMenu.classList.add('hidden');
  overlayRank.classList.add('hidden');
  nameForm.classList.add('hidden');
  restartBtn.classList.remove('hidden');
  restartBtn.textContent = 'Start';
  renderLeaderboard(loadRecords(), -1);
  overlay.classList.remove('hidden');
}

function showPauseLeaderboard() {
  overlayRank.classList.add('hidden');
  nameForm.classList.add('hidden');
  restartBtn.classList.add('hidden');
  renderLeaderboard(loadRecords(), -1);
}

function showPauseView(view) {
  pauseMain.classList.toggle('hidden', view !== 'main');
  pauseControls.classList.toggle('hidden', view !== 'controls');
}

function togglePause() {
  if (gameOver || !started) return;
  paused = !paused;
  if (!paused) {
    overlay.classList.add('hidden');
    if (document.activeElement) document.activeElement.blur(); // keep keys going to the game
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSED';
    overlayScore.textContent = '';
    restartBtn.classList.add('hidden');
    pauseMenu.classList.remove('hidden');
    showPauseView('main');
    showPauseLeaderboard();
    overlay.classList.remove('hidden');
    resumeBtn.focus();
  }
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
  started = true;
  combo = 0;
  bestComboRun = 0;
  pendingRank = -1;
  restartBtn.textContent = 'Restart';
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = intervalFor(level);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  if (document.activeElement) document.activeElement.blur();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  // paused: the menu owns the keyboard, game inputs are blocked
  if (!started || paused || gameOver) return;
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

restartBtn.addEventListener('click', init);
pauseRestartBtn.addEventListener('click', init);
resumeBtn.addEventListener('click', togglePause);
controlsBtn.addEventListener('click', () => { showPauseView('controls'); controlsBackBtn.focus(); });
controlsBackBtn.addEventListener('click', () => { showPauseView('main'); controlsBtn.focus(); });

for (let l = 1; l <= MAX_START_LEVEL; l++) {
  const opt = document.createElement('option');
  opt.value = l;
  opt.textContent = l;
  startLevelSel.appendChild(opt);
}
startLevelSel.addEventListener('change', () => { startLevel = Number(startLevelSel.value); });

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  if (pendingRank < 0) return;
  const rec = loadRecords();
  const name = nameInput.value.trim().slice(0, 12) || 'ANON';
  const idx = rankFor(score, rec);
  if (idx >= 0) {
    rec.scores.splice(idx, 0, { name, score });
    rec.scores = rec.scores.slice(0, TOP_N);
    saveRecords(rec);
  }
  pendingRank = -1;
  nameForm.classList.add('hidden');
  overlayRank.textContent = 'Score saved!';
  restartBtn.classList.remove('hidden');
  renderLeaderboard(rec, idx);
  restartBtn.focus();
});

resetRecordsBtn.addEventListener('click', () => {
  if (!confirm('Reset all records?')) return;
  saveRecords({ scores: [], bestCombo: 0, maxLines: 0 });
  // an unsaved new score no longer needs a name prompt only if nothing to rank; keep it rankable
  const rec = loadRecords();
  if (gameOver && pendingRank >= 0) {
    pendingRank = rankFor(score, rec);
    renderLeaderboard(rec, pendingRank, { score });
  } else {
    renderLeaderboard(rec, -1);
  }
  resetRecordsBtn.blur();
});

themeToggle.addEventListener('click', () => {
  applyTheme(theme === 'dark' ? 'light' : 'dark');
  themeToggle.blur(); // keep Space / arrows going to the game
});

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  skinSelect.blur(); // keep Space / arrows going to the game
});

applyTheme('dark');
let savedSkin = 'retro';
try { savedSkin = localStorage.getItem(SKIN_KEY) || 'retro'; } catch (e) {}
applySkin(savedSkin);

showStartScreen();
