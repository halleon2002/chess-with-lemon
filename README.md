# Lemon Together

Board games built for my little lemon.

There are 4 games (and more may be added later). Thank you for playing!

## Games
- **Kings & Pawns** – 5×5 lattice
- **Checkers** – same board, multi-jump + flying kings
- **Cờ Thú (Jungle Chess)** – classic Vietnamese animal chess on 7×9
- **Chess** – standard rules, castling, en passant, auto-promotion to Queen

Modes: AI, Local 2-player, Online (PeerJS)

## Code structure (after refactor)

| File | Role |
|------|------|
| `js/board-core.js` | Shared 5×5 geometry helpers |
| `js/kap.js` / `checkers.js` / `cothu.js` / `chess.js` | Rules + AI + **Controller API** (`handleClick`, `runAI`, `applyRemote`, …) |
| `js/games.js` | Game registry (`GAMES`) + `G()` / `currentModule()` / `otherSide()` |
| `js/rendering.js` | SVG lattice + Cờ Thú grid + chess 8×8 rendering |
| `js/network.js` | PeerJS rooms + remote move dispatch |
| `js/chat.js` / `i18n.js` | Chat & English/Vietnamese |
| `js/app.js` | Thin orchestrator: shared state, mode screens, wiring |

Each game module owns its own click handling, turn finishing, AI, and remote-move application. Adding a new game means implementing the same Controller API and registering it in `GAMES`.
