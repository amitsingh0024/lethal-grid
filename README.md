# ⚡ Lethal Grid: Overclock

A one-turn tactical chain-reaction puzzle game built with **React + Vite**. Each turn you spend a limited number of volleys to set off chain reactions across a grid of enemies and clear the board.

Ads are optional. Players can play ad-free, and watching a rewarded ad gives an extra reward.

---

## 🎮 Gameplay

### The board
- The courtyard starts at **3×3** and expands to **8×8** through five upgrades (Expand Castle Courtyard).
- Each cell holds an enemy, an empty stone, or a boss. Empty cells are about 14% of the board.
- Enemy HP scales with the sector. Every 5th sector is a **boss sector** with a central Ironclad Siege Ogre at 2.8× base HP.

### Enemies
| Enemy | Code | What happens when slain |
| --- | --- | --- |
| Goblin Footpad | `STANDARD` | Drops gold crowns. |
| Powder-Keg Sapper | `BOMB` | Explodes in a 3×3 blast. |
| Storm-Rune Shaman | `CONDUIT` | Fires lightning across its whole row or column. |
| War-Banner Herald | `AMPLIFIER` | Boosts all damage this turn by +50%. |
| Ironclad Siege Ogre | `BOSS` | Drops 5× gold and causes a 5×5 shockwave. |

Chains trigger other enemies, so one hit can clear the whole board.

### Weapons
| Weapon | Unlocks | Behavior |
| --- | --- | --- |
| Ballista | Start | Volley along the row and column. Tier III adds 3×3 shrapnel. |
| Alchemist Wildfire Flask | Sector 3 (180 shards) | 3×3 blast. Tier III is a 5×5 cauldron. |
| Dwarven Thunder-Hammer | Sector 7 (850 shards) | Ricochets to the highest-HP enemies. Bounces scale with level. |
| Executioner's Greatsword | Sector 12 (3,600 shards) | Diagonal cleave that sunders armor, doubling or 2.5× damage taken. |

### Upgrades
- **Extra Siege Volley:** more attacks per wave, from 2 up to 8.
- **Fortune's Spark:** higher chance of an instant detonation on high-HP kegs and shamans, and of 3× critical hits.
- **Goblin Barrel Contagion:** slain goblins can explode, and 5-kills can refund a volley.
- **Refined Black Powder:** more chain damage, and chain blasts melt a share of max HP.
- **Royal Tax & Plunder Charter:** multiplies gold crowns looted.
- **Saboteur Ambush Traps:** more kegs, shamans and banners on every wave.
- **Battlement Archer Garrison:** archers auto-shoot enemies every 2.2 seconds.

### Daily challenge
Every day at `00:00 UTC` everyone gets the same board. The seed is the date (`YYYY-MM-DD`) fed into a deterministic Mulberry32 generator, so no server is needed. Results can be shared as an emoji grid.

### Saves
Progress is stored in the browser's `localStorage` under one key. Changes to the save format need a version field and a migration, or existing progress is lost.

---

## 💰 Ads and analytics

- **Google Analytics 4** and **Google AdSense** load only when their IDs are set at build time. Without them the game runs in sandbox mode and logs ad events locally.
- **Rewarded ads** are optional. Watching one grants a reward, and the game stays fully playable without them.
- Copy `.env.example` to `.env` for local use:
  ```bash
  cp .env.example .env
  ```
- Set the real IDs in `.env` (or in the Cloudflare Pages Production variables):
  - `VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX`
  - `VITE_ADSENSE_CLIENT_ID=ca-pub-XXXXXXXXXXXXXXXX`
  - `VITE_ADSENSE_SIDEBAR_SLOT` and the other ad slot IDs
- Replace the placeholder publisher ID in `public/ads.txt` with your real `pub-XXXXXXXXXXXXXXXX` ID so Google can verify the site.

---

## 🛠 Local development

```bash
npm install
npm run dev      # local dev server
npm run build    # production build into dist/
npm run preview  # serve the built dist/ locally
```

---

## 🚀 Deployment (Cloudflare Pages)

The game is a static site, so it is hosted on **Cloudflare Pages**, deployed from GitHub.

| Setting | Value |
| --- | --- |
| Framework preset | Vite (or None) |
| Build command | `npm run build` |
| Output directory | `dist` |
| Environment variable | `NODE_VERSION=20` |

- **Production** deploys from `main`.
- **Preview** deploys build every branch and pull request. Leave the ad and analytics variables unset for Preview so previews stay in sandbox mode.
- **Rollback:** open the Pages project, go to Deployments, and roll back to an earlier build.
- **Caching:** `public/_headers` sets a one-week cache for `/assets/*` and adds security headers.
- **Crawlers:** `public/robots.txt` allows all crawlers.

### Release workflow
1. Create a branch for each change.
2. Open a pull request. Cloudflare builds a preview URL for it.
3. Play-test the preview, then merge to `main`.
4. Tag releases (`v1.1.0`) and note the changes in a changelog.

---

## 📁 Project layout

```
src/
  App.jsx                 main UI and game flow
  game/engine.js          board generation, enemies, weapons, upgrades
  components/             battle effects, sprites, upgrade tree, ad units
  services/analytics.js   GA4, AdSense and local telemetry
public/                   static files: ads.txt, _headers, robots.txt, assets
```
