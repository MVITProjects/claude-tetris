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
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const leaderboardEl = document.getElementById('leaderboard');
const recordsEl = document.getElementById('records');
const resetBtn = document.getElementById('reset-btn');

// ---- Leaderboard (localStorage) ----
const STORAGE_KEY = 'tetris-records';
const MAX_ENTRIES = 5;
const MAX_NAME = 12;

let records = loadRecords();
let pendingScore = null;   // score awaiting a name on game over
let highlightIdx = -1;     // leaderboard row to highlight

function loadRecords() {
  const empty = { scores: [], bestCombo: 0, maxLines: 0 };
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!data || typeof data !== 'object') return empty;
    const scores = Array.isArray(data.scores) ? data.scores : [];
    return {
      scores: scores
        .filter(e => e && Number.isFinite(e.score))
        .map(e => ({ name: sanitizeName(e.name), score: e.score }))
        .slice(0, MAX_ENTRIES),
      bestCombo: Number.isFinite(data.bestCombo) ? data.bestCombo : 0,
      maxLines: Number.isFinite(data.maxLines) ? data.maxLines : 0,
    };
  } catch (e) {
    return empty;
  }
}

function saveRecords() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (e) { /* storage unavailable: records last for this session only */ }
}

function sanitizeName(name) {
  const clean = String(name ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME);
  return clean || 'Anonymous';
}

function qualifies(s) {
  return s > 0 && (records.scores.length < MAX_ENTRIES || s > records.scores[records.scores.length - 1].score);
}

function renderLeaderboard() {
  leaderboardEl.textContent = '';
  for (let i = 0; i < MAX_ENTRIES; i++) {
    const li = document.createElement('li');
    const e = records.scores[i];
    const nameSpan = document.createElement('span');
    const scoreSpan = document.createElement('span');
    if (e) {
      nameSpan.textContent = `${i + 1}. ${e.name}`;
      scoreSpan.textContent = e.score.toLocaleString();
      if (i === highlightIdx) li.classList.add('highlight');
    } else {
      nameSpan.textContent = `${i + 1}. ---`;
      scoreSpan.textContent = '0';
      li.classList.add('empty');
    }
    li.append(nameSpan, scoreSpan);
    leaderboardEl.appendChild(li);
  }
  recordsEl.textContent = `BEST COMBO: ${records.bestCombo}  |  MAX LINES: ${records.maxLines}`;
}

function submitScore(name) {
  if (pendingScore === null) return;
  const entry = { name: sanitizeName(name), score: pendingScore };
  let idx = records.scores.findIndex(e => e.score < entry.score);
  if (idx === -1) idx = records.scores.length;
  records.scores.splice(idx, 0, entry);
  records.scores.length = Math.min(records.scores.length, MAX_ENTRIES);
  highlightIdx = idx;
  pendingScore = null;
  saveRecords();
  nameForm.classList.add('hidden');
  renderLeaderboard();
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

let board, current, next, score, lines, level, combo, bestCombo, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

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
    bestCombo = Math.max(bestCombo, combo);
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
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
  overlayTitle.style.color = '';
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Score: ${score.toLocaleString()}`;
  records.bestCombo = Math.max(records.bestCombo, bestCombo);
  records.maxLines = Math.max(records.maxLines, lines);
  highlightIdx = -1;
  if (qualifies(score)) {
    pendingScore = score;
    nameForm.classList.remove('hidden');
    nameInput.value = '';
    nameInput.focus();
  } else {
    pendingScore = null;
    nameForm.classList.add('hidden');
  }
  saveRecords();
  renderLeaderboard();
  restartBtn.textContent = 'Restart';
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSED';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
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
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  combo = 0;
  bestCombo = 0;
  pendingScore = null;
  highlightIdx = -1;
  nameForm.classList.add('hidden');
  overlayTitle.style.color = '';
  restartBtn.textContent = 'Restart';
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
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
  // an unsaved qualifying score is saved under a default name if the player skips the form
  if (pendingScore !== null) submitScore(nameInput.value);
  showStartScreen();
});

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  submitScore(nameInput.value);
});

resetBtn.addEventListener('click', () => {
  if (!confirm('Reset all records?')) return;
  records = { scores: [], bestCombo: 0, maxLines: 0 };
  highlightIdx = -1;
  if (pendingScore !== null) {
    // nothing left to compare against; the current score now qualifies again
    pendingScore = qualifies(score) ? score : null;
    if (pendingScore === null) nameForm.classList.add('hidden');
  }
  saveRecords();
  renderLeaderboard();
});

// Start screen: board stays idle until Start is pressed
function showStartScreen() {
  board = createBoard();
  gameOver = true;
  paused = false;
  overlayTitle.textContent = 'TETRIS';
  overlayTitle.style.color = 'var(--accent)';
  overlayScore.textContent = '';
  restartBtn.textContent = 'Start';
  renderLeaderboard();
}

themeToggle.addEventListener('click', () => {
  applyTheme(theme === 'dark' ? 'light' : 'dark');
  themeToggle.blur(); // keep Space / arrows going to the game
});

applyTheme('dark');

init();
