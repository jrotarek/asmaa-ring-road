# أسماء على الدائري — Asmaa: Ring Road Rush

A browser driving game: Asmaa weaves her brown Kia Rio ("Galaxy") through Cairo Ring Road traffic.

**Play:** open `index.html` in a browser, or visit the GitHub Pages site for this repo.

## Controls
- ← → steer · ↓ brake · ↑ extra gas · Space honk (the car ahead moves over) · P pause
- On phones: tap the left/right sides to steer, plus brake and horn buttons

## How it plays
- Pass cars very close for near-miss points and combos — Asmaa answers with a speech bubble.
- Every 25 seconds the level goes up: more traffic, more lane-changing microbuses, higher speed.
- Above 100 km/h the ١٥ مايو sign shows how many km are left; the faster you drive, the faster it drops.
- 3 lives; the high score is saved in your browser.

## Files
- `index.html` — page, HUD and menus
- `game.js` — the pseudo-3D road engine and game logic
- `assets/` — car, character and skyline images
- `online/build.py` — builds the claude.ai artifact version (with a shared leaderboard)
