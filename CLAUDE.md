# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Vanilla JavaScript Tetris using HTML5 Canvas. No dependencies, no build step, no package manager, no tests, no linter. Files: `index.html`, `style.css`, `game.js`.

## Running

Open `index.html` directly in a browser, or serve the directory (e.g. `python3 -m http.server 8000`) and visit `http://localhost:8000`. Reload to see changes.

## CI

`.github/workflows/claude-issue-triage.yml` runs on issue open/edit: Claude labels the issue (type, `area:*`, `priority:*`) and posts/updates a diagnosis comment. Area labels map to parts of `game.js`. Claude workflows authenticate with the `CLAUDE_CODE_OAUTH_TOKEN` repo secret.

## Architecture

All game logic lives in a single script, `game.js` (`'use strict'`, global scope, no modules). It binds to DOM element IDs defined in `index.html` (`board`, `next-canvas`, `score`, `lines`, `level`, `overlay`, `overlay-title`, `overlay-score`, `restart-btn`, `theme-toggle`, `skin-select`), so renaming an ID in the HTML requires updating the lookups at the top of `game.js`.

- **State** is a set of module-level `let` variables (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, etc.) reset by `init()`.
- **Board** is a `ROWS×COLS` (20×10) 2D array; `0` is empty, `1–7` is a piece type index.
- `PIECES` and `COLORS` are indexed by the same piece type (1–7); index 0 is `null`. A shape's cell values equal its type index, so the cell value is also the color lookup.
- **Loop**: `requestAnimationFrame` via `loop(ts)` accumulates elapsed time (`dropAccum`) and drops the piece when it exceeds `dropInterval`.
- **Rotation** (`tryRotate`) is clockwise matrix rotation with simple horizontal wall kicks `[0, -1, 1, -2, 2]` (not SRS).
- **Scoring/levels** (`clearLines`): `LINE_SCORES` × level; level = `floor(lines/10)+1`; `dropInterval = max(100, 1000 - (level-1)*90)` ms.
- `collide(shape, ox, oy)` is the single collision check used by movement, rotation, ghost piece (`ghostY`), and spawn/game-over detection.

- **Theme**: colours in `style.css` are CSS variables on `:root` (dark default), overridden by `[data-theme="light"]`. `applyTheme()` in `game.js` sets `data-theme`, caches the `--grid` colour for `drawGrid`, and redraws. Not persisted; always starts dark.
- **Skins**: `SKINS` in `game.js` (`retro`, `neon`, `pastel`, `pixel`) each define `colors` (index 0 null, 1–8), `boardBg`/`gridColor` (`null` = follow light/dark theme) and `drawBlock(context, px, py, size, color, colorIndex, alpha)`. `applySkin(name)` swaps `activeSkin`/`COLORS`, saves `tetris.skin` to localStorage (try/catch) and redraws immediately. The global `drawBlock(context, x, y, colorIndex, size, alpha)` keeps its signature and delegates to the active skin; `clearCanvas` paints `boardBg`. Skin is orthogonal to the light/dark theme. The `#skin-select` dropdown sits beside `#theme-toggle`.
