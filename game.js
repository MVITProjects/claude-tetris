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
const skinSelect = document.getElementById('skin-select');
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const controlsBtn = document.getElementById('controls-btn');
const controlsList = document.getElementById('controls-list');
const startLevelSelect = document.getElementById('start-level');

const MAX_START_LEVEL = 10;
let startLevel = 1;
for (let l = 1; l <= MAX_START_LEVEL; l++) startLevelSelect.add(new Option(l, l));

function dropIntervalFor(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
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
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.max(startLevel, Math.floor(lines / 10) + 1);
    dropInterval = dropIntervalFor(level);
    updateHUD();
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

// ---- Skins: each defines a colour set and a block-draw function ----
// draw(context, px, py, size, color, colorIndex) draws one block with its top-left at px,py (pixels)

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
    draw(context, px, py, size, color, colorIndex) {
      const gx = px + 1, gy = py + 1, gs = size - 2;
      if (colorIndex === 8) {
        // metallic: diagonal brushed-steel gradient
        const grad = context.createLinearGradient(gx, gy, gx + gs, gy + gs);
        grad.addColorStop(0, '#eceff1');
        grad.addColorStop(0.5, '#90a4ae');
        grad.addColorStop(0.7, '#cfd8dc');
        grad.addColorStop(1, '#607d8b');
        context.fillStyle = grad;
      } else {
        context.fillStyle = color;
      }
      context.fillRect(gx, gy, gs, gs);
      // highlight
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(gx, gy, gs, 4);
    },
  },
  neon: {
    colors: [null, '#00f0ff', '#ffee00', '#d500f9', '#39ff14', '#ff1744', '#2979ff', '#ff9100', '#e0e0ff'],
    draw(context, px, py, size, color) {
      const m = 3, s = size - m * 2;
      context.save();
      context.shadowColor = color;
      context.shadowBlur = size * 0.5;
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.fillStyle = 'rgba(0,0,0,0.85)';
      context.fillRect(px + m, py + m, s, s);
      context.strokeRect(px + m, py + m, s, s);
      context.shadowBlur = 0;
      context.globalAlpha *= 0.45;
      context.fillStyle = color;
      context.fillRect(px + m + 3, py + m + 3, s - 6, s - 6);
      context.restore();
    },
  },
  pastel: {
    colors: [null, '#a8e6ef', '#fff1a8', '#d9b8f0', '#b9eac0', '#f7b6b6', '#b8d4f5', '#fcd3a4', '#d5dde2'],
    draw(context, px, py, size, color) {
      const x = px + 1.5, y = py + 1.5, s = size - 3;
      roundRectPath(context, x, y, s, s, size * 0.28);
      context.fillStyle = color;
      context.fill();
      // soft highlight
      roundRectPath(context, x + 3, y + 3, s - 6, s * 0.3, size * 0.12);
      context.fillStyle = 'rgba(255,255,255,0.35)';
      context.fill();
    },
  },
  pixel: {
    colors: [null, '#29b6c5', '#e6b422', '#9c4dcc', '#4caf50', '#d84343', '#4a8fd8', '#e68a1f', '#8a9ba5'],
    draw(context, px, py, size, color) {
      const gx = px + 1, gy = py + 1, gs = size - 2;
      const u = gs / 6; // 6x6 texture grid
      context.fillStyle = color;
      context.fillRect(gx, gy, gs, gs);
      // checker texture: alternate light / dark pixels
      for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 6; c++) {
          if ((r + c) % 2) continue;
          context.fillStyle = (r < 3) ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.2)';
          context.fillRect(gx + c * u, gy + r * u, u, u);
        }
      }
      // hard pixel border
      context.fillStyle = 'rgba(0,0,0,0.55)';
      context.fillRect(gx, gy, gs, u / 2);
      context.fillRect(gx, gy + gs - u / 2, gs, u / 2);
      context.fillRect(gx, gy, u / 2, gs);
      context.fillRect(gx + gs - u / 2, gy, u / 2, gs);
    },
  },
};

const SKIN_KEY = 'tetris-skin';
let skin = 'retro';

function loadSkin() {
  try {
    const saved = localStorage.getItem(SKIN_KEY);
    if (saved && SKINS[saved]) return saved;
  } catch (e) { /* storage unavailable */ }
  return 'retro';
}

function applySkin(name) {
  if (!SKINS[name]) name = 'retro';
  skin = name;
  document.documentElement.dataset.skin = name;
  skinSelect.value = name;
  try { localStorage.setItem(SKIN_KEY, name); } catch (e) { /* ignore */ }
  // re-read CSS variables (neon overrides --grid) and redraw
  applyTheme(theme);
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const s = SKINS[skin];
  context.globalAlpha = alpha ?? 1;
  s.draw(context, x * size, y * size, size, s.colors[colorIndex], colorIndex);
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
  overlayTitle.classList.remove('paused');
  pauseMenu.classList.add('hidden');
  restartBtn.classList.remove('hidden');
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    overlay.classList.add('hidden');
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSED';
    overlayTitle.classList.add('paused');
    overlayScore.textContent = '';
    startLevelSelect.value = startLevel;
    controlsList.classList.add('hidden');
    controlsBtn.setAttribute('aria-expanded', 'false');
    pauseMenu.classList.remove('hidden');
    restartBtn.classList.remove('hidden');
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
  board = createBoard();
  score = 0;
  lines = 0;
  startLevel = Number(startLevelSelect.value) || 1;
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = dropIntervalFor(level);
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
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  // block game inputs while the pause menu (or game over) is showing
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

restartBtn.addEventListener('click', () => { init(); restartBtn.blur(); });
resumeBtn.addEventListener('click', () => { togglePause(); resumeBtn.blur(); });
controlsBtn.addEventListener('click', () => {
  const open = controlsList.classList.toggle('hidden') === false;
  controlsBtn.setAttribute('aria-expanded', String(open));
});
startLevelSelect.addEventListener('change', () => startLevelSelect.blur());

themeToggle.addEventListener('click', () => {
  applyTheme(theme === 'dark' ? 'light' : 'dark');
  themeToggle.blur(); // keep Space / arrows going to the game
});

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  skinSelect.blur(); // keep Space / arrows going to the game
});

applyTheme('dark');
applySkin(loadSkin());

init();
