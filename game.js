'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

// Active palette; reassigned by applySkin() (see SKINS below).
let COLORS = [];

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

let theme = 'dark';
let themeGridColor = '#22222e'; // --grid from the current light/dark theme

function applyTheme(t) {
  theme = t;
  document.documentElement.dataset.theme = t;
  themeGridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim() || themeGridColor;
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
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
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

// ---- Skins ----------------------------------------------------------------
// Each skin: colors (index 0 null, 1-8), boardBg / gridColor (null = follow the
// light/dark theme), and drawBlock(context, px, py, size, color, colorIndex, alpha)
// where px/py are pixel coordinates of the cell's top-left corner.
const METAL_STOPS = [[0, '#eceff1'], [0.5, '#90a4ae'], [0.7, '#cfd8dc'], [1, '#607d8b']];

function metalGradient(context, x, y, s) {
  const grad = context.createLinearGradient(x, y, x + s, y + s);
  for (const [o, c] of METAL_STOPS) grad.addColorStop(o, c);
  return grad;
}

function roundedRectPath(context, x, y, w, h, r) {
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
    label: 'Retro',
    colors: [null, '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#90caf9', '#ffb74d', '#b0bec5'],
    boardBg: null,
    gridColor: null,
    drawBlock(context, px, py, size, color, colorIndex, alpha) {
      context.globalAlpha = alpha;
      // piece 8 is metallic: diagonal brushed-steel gradient
      context.fillStyle = colorIndex === 8 ? metalGradient(context, px + 1, py + 1, size - 2) : color;
      context.fillRect(px + 1, py + 1, size - 2, size - 2);
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(px + 1, py + 1, size - 2, 4);
    },
  },
  neon: {
    label: 'Neon',
    colors: [null, '#00fff0', '#fff700', '#d500f9', '#39ff14', '#ff1744', '#2979ff', '#ff9100', '#e0f7ff'],
    boardBg: '#000000',
    gridColor: '#15152a',
    drawBlock(context, px, py, size, color, colorIndex, alpha) {
      context.globalAlpha = alpha;
      context.shadowColor = color;
      context.shadowBlur = 12;
      context.fillStyle = color;
      context.fillRect(px + 3, py + 3, size - 6, size - 6);
      // bright core
      context.shadowBlur = 0;
      context.fillStyle = 'rgba(255,255,255,0.35)';
      context.fillRect(px + 6, py + 6, size - 12, size - 12);
      context.shadowColor = 'transparent';
    },
  },
  pastel: {
    label: 'Pastel',
    colors: [null, '#a8e6ef', '#fff1b0', '#d9b8f0', '#b9eac0', '#f7b9b9', '#b8d4f5', '#ffd8a8', '#d5dde2'],
    boardBg: null,
    gridColor: null,
    drawBlock(context, px, py, size, color, colorIndex, alpha) {
      context.globalAlpha = alpha;
      roundedRectPath(context, px + 1.5, py + 1.5, size - 3, size - 3, size * 0.28);
      context.fillStyle = colorIndex === 8 ? metalGradient(context, px + 1, py + 1, size - 2) : color;
      context.fill();
      // soft inner highlight
      roundedRectPath(context, px + 5, py + 4, size - 10, size * 0.22, 3);
      context.fillStyle = 'rgba(255,255,255,0.45)';
      context.fill();
    },
  },
  pixel: {
    label: 'Pixel art',
    colors: [null, '#29b6c5', '#e6b800', '#9c27b0', '#43a047', '#d32f2f', '#1e88e5', '#ef6c00', '#78909c'],
    boardBg: '#101018',
    gridColor: '#1c1c28',
    drawBlock(context, px, py, size, color, colorIndex, alpha) {
      context.globalAlpha = alpha;
      const x = px + 1, y = py + 1, s = size - 2, t = 3; // t = texture cell size
      context.fillStyle = colorIndex === 8 ? metalGradient(context, x, y, s) : color;
      context.fillRect(x, y, s, s);
      // checker/dither texture of lighter and darker squares
      for (let i = 0; i * t < s; i++) {
        for (let j = 0; j * t < s; j++) {
          if ((i + j) % 2) continue;
          context.fillStyle = (i % 2) ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)';
          context.fillRect(x + i * t, y + j * t, Math.min(t, s - i * t), Math.min(t, s - j * t));
        }
      }
      // bevel: light top/left, dark bottom/right
      context.fillStyle = 'rgba(255,255,255,0.6)';
      context.fillRect(x, y, s, 2);
      context.fillRect(x, y, 2, s);
      context.fillStyle = 'rgba(0,0,0,0.5)';
      context.fillRect(x, y + s - 2, s, 2);
      context.fillRect(x + s - 2, y, 2, s);
    },
  },
};

const SKIN_KEY = 'tetris.skin';
let activeSkin = SKINS.retro;
COLORS = activeSkin.colors;

function applySkin(name, save = true) {
  if (!Object.prototype.hasOwnProperty.call(SKINS, name)) name = 'retro';
  activeSkin = SKINS[name];
  COLORS = activeSkin.colors;
  skinSelect.value = name;
  if (save) {
    try { localStorage.setItem(SKIN_KEY, name); } catch (e) { /* storage unavailable */ }
  }
  // redraw immediately so paused / game-over screens update too
  if (current && next) { draw(); drawNext(); }
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.save();
  activeSkin.drawBlock(context, x * size, y * size, size, COLORS[colorIndex], colorIndex, alpha ?? 1);
  context.restore();
}

function clearCanvas(context, cv) {
  context.clearRect(0, 0, cv.width, cv.height);
  if (activeSkin.boardBg) {
    context.fillStyle = activeSkin.boardBg;
    context.fillRect(0, 0, cv.width, cv.height);
  }
}

function drawGrid() {
  ctx.strokeStyle = activeSkin.gridColor || themeGridColor;
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
  clearCanvas(ctx, canvas);
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
  clearCanvas(nextCtx, nextCanvas);
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
  if (e.target === skinSelect) return; // let the dropdown use arrows/space
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

restartBtn.addEventListener('click', init);

themeToggle.addEventListener('click', () => {
  applyTheme(theme === 'dark' ? 'light' : 'dark');
  themeToggle.blur(); // keep Space / arrows going to the game
});

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  skinSelect.blur(); // keep Space / arrows going to the game
});

applyTheme('dark');

let savedSkin = null;
try { savedSkin = localStorage.getItem(SKIN_KEY); } catch (e) { /* storage unavailable */ }
applySkin(Object.prototype.hasOwnProperty.call(SKINS, savedSkin) ? savedSkin : 'retro', false);

init();
