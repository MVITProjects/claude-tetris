# Tetris

Implementation of the classic **Tetris** in vanilla JavaScript, using HTML5 Canvas and CSS. No external dependencies, no frameworks, no build process: just open and play.

![Tech](https://img.shields.io/badge/HTML5-Canvas-orange)
![Tech](https://img.shields.io/badge/CSS3-blueviolet)
![Tech](https://img.shields.io/badge/JavaScript-Vanilla-yellow)

---

## Table of Contents

- [Tetris](#tetris)
  - [Table of Contents](#table-of-contents)
  - [What the project does](#what-the-project-does)
  - [How to run the game](#how-to-run-the-game)
    - [Option 1: open the file directly](#option-1-open-the-file-directly)
    - [Option 2: local server (recommended)](#option-2-local-server-recommended)
  - [Controls](#controls)
  - [How it works](#how-it-works)
    - [1. `index.html`](#1-indexhtml)
    - [2. `style.css`](#2-stylecss)
    - [3. `game.js`](#3-gamejs)
    - [Game flow](#game-flow)
  - [Technologies](#technologies)
  - [Project structure](#project-structure)
  - [Customization](#customization)
  - [License](#license)

---

## What the project does

It is a playable version of classic Tetris with all the mechanics you would expect:

- **10 × 20** cell board.
- The **7 standard pieces** (I, O, T, S, Z, J, L) with distinct colors.
- **Rotation** with basic _wall kicks_ (small shifts so the piece can rotate against a wall).
- **Soft drop** (accelerated downward movement) and **hard drop** (instant drop).
- **Ghost piece**: shows where the current piece will land.
- **Next piece preview**.
- Classic Tetris **scoring system** (100 / 300 / 500 / 800 multiplied by level).
- **Levels** that increase every 10 lines and speed up the fall rate.
- **Pause** and **Game Over** with a restart option.

---

## How to run the game

Nothing to install or compile. You have two options:

### Option 1: open the file directly

```bash
open index.html        # macOS
xdg-open index.html    # Linux
start index.html       # Windows
```

### Option 2: local server (recommended)

Any static server works. Some examples:

```bash
# With Python 3
python3 -m http.server 8000

# With Node.js (npx)
npx serve .

# With PHP
php -S localhost:8000
```

Then open `http://localhost:8000` in your browser.

---

## Controls

| Key       | Action                    |
| --------- | ------------------------- |
| `←` / `→` | Move piece horizontally   |
| `↑` or `X`| Rotate piece clockwise    |
| `↓`       | Soft drop (move down faster) |
| `Space`   | Hard drop (instant drop)  |
| `P`       | Pause / resume            |

---

## How it works

The game consists of three cooperating files:

### 1. `index.html`

Defines the visual structure:

- A **300 × 600** pixel `<canvas id="board">` where the board is rendered.
- A side panel with `SCORE`, `LINES`, `LEVEL`, next-piece preview, and the controls list.
- An overlay for the **PAUSED** and **GAME OVER** states.

### 2. `style.css`

Provides the visual appearance with a _dark / retro arcade_ aesthetic: dark background, monospace typography for the counters, and _backdrop blur_ on the overlays.

### 3. `game.js`

Contains all the game logic. Broadly speaking:

- **Board model**: a `ROWS × COLS` matrix where each cell stores `0` (empty) or a color index (1–7) identifying the piece.
- **Pieces**: defined as square matrices. To rotate, it computes the transpose + row reversal (`rotateCW`).
- **Collision detection** (`collide`): checks that no cell of the piece goes outside the board or overlaps already locked blocks.
- **Wall kicks** (`tryRotate`): if rotation collides, tries shifting the piece ±1 and ±2 columns before discarding the rotation.
- **Game loop** (`loop`): based on `requestAnimationFrame`, accumulates elapsed time and drops the piece one row when `dropInterval` is exceeded.
- **Line clearing** (`clearLines`): scans the board from bottom to top; each complete row is removed and an empty one is inserted at the top.
- **Scoring**: uses the classic table `[0, 100, 300, 500, 800]` multiplied by the current level; hard drop adds 2 points per cell traveled and soft drop adds 1 point per row.
- **Level and speed**: the level increases every 10 lines; drop speed is calculated as `max(100, 1000 − (level − 1) × 90)` milliseconds.
- **Ghost piece** (`ghostY`): projects the final landing position of the current piece downward and draws it with `globalAlpha = 0.2`.

### Game flow

```
init()
  ├─ createBoard()                  → empty matrix
  ├─ next = randomPiece()
  ├─ spawn()                        → moves next to current and generates a new next
  └─ requestAnimationFrame(loop)
        ↓
   loop(timestamp)
     ├─ accumulates dt
     ├─ if dt ≥ dropInterval → drops piece or calls lockPiece()
     ├─ draw()  (grid + board + ghost + current piece)
     └─ requestAnimationFrame(loop)

   keydown → move / rotate / soft-drop / hard-drop / pause
```

When a newly spawned piece already collides on entry (`spawn`), `endGame()` is triggered and the **Game Over** overlay is shown.

---

## Technologies

- **HTML5** — markup and two `<canvas>` elements (board and preview).
- **CSS3** — _flexbox_, color styling, `backdrop-filter`, and `box-shadow`.
- **Vanilla JavaScript (ES6+)** — `const`/`let`, _arrow functions_, _spread operator_, `Array.from`, _template literals_…
- **Canvas 2D API** — for all game rendering.
- **`requestAnimationFrame`** — for the browser-synchronized game loop.

**Zero dependencies.** No `package.json`, no bundler, no transpiler.

---

## Project structure

```
03-tetris/
├── index.html      # DOM structure and canvas
├── style.css       # Game styles (dark theme)
├── game.js         # All Tetris logic (~300 lines)
└── README.md
```

---

## Customization

Some easy-to-tune parameters in `game.js`:

| Constant       | Meaning                               | Default               |
| -------------- | ------------------------------------- | --------------------- |
| `COLS`         | Board columns                         | `10`                  |
| `ROWS`         | Board rows                            | `20`                  |
| `BLOCK`        | Pixel size of each cell               | `30`                  |
| `COLORS`       | Color palette per piece type          | 7 colors              |
| `LINE_SCORES`  | Points for 1, 2, 3, or 4 cleared lines| `[0,100,300,500,800]` |
| `dropInterval` | Initial drop speed in ms              | `1000`                |

> If you change `COLS`, `ROWS`, or `BLOCK`, remember to also adjust `width` and `height` on `<canvas id="board">` in `index.html` so they match (`COLS × BLOCK` × `ROWS × BLOCK`).

---

## License

Free to use for educational and practice purposes.
