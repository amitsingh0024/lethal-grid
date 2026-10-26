# Lethal Grid

A medieval chain-reaction puzzle game built with **React + Vite**. Each stage you get a limited number of volleys to set off chain reactions across a courtyard of goblin raiders and clear the board.

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

### Stages, winning and losing
Waves are shown as chapter stages: waves 1 to 5 are stages 1-1 to 1-5 (a boss on 1-5), wave 6 is 2-1, and so on. A stage is won when every raider is down, and lost when the volleys run out first. Only a win on the frontier stage unlocks the next one. Archers help only while you still have volleys left. Leaving for the Royal Forge mid-stage resumes the same board.

### Economy
The core loop is replay and upgrade: play a stage, bank the gold, buy upgrades, then push the next stage or farm a cleared one from the Siege Map.

- **Every run pays in full**, win or lose, for every raider slain.
- **Harder stages pay more.** Gold per kill is about a sixth of the stage's base raider HP (`getGoldPerKill` in `src/game/engine.js`), so the best farm is the newest stage you can clear.
- **First clears pay triple.** Breaking a new stage multiplies that run's gold by `FIRST_CLEAR_GOLD_MULT` (3).
- **Stars and chests.** A clear earns up to 3 stars: one for the clear, one for a volley to spare, one for clearing in a single volley. A chapter's stars open chests at 8 and 15 stars (`CHAPTER_CHEST_STARS`), paying gold scaled to the chapter boss. Stars and chests survive a prestige reset.
- **Auto.** A cleared 3-star stage can be set to auto. It fires the shot that fells the most raiders, replays the stage after a short pause, and stops when the player leaves the board or taps Stop.
- **Offline garrison.** When the game opens again, the garrison pays for time away: one clear of the best cleared stage every 10 minutes, for up to 2 hours (longer with Archer Garrison levels and the Night Watch crest). The player collects it, or can choose to watch an ad to double it.
- **Royal Crests.** From wave 10 (the 2-5 boss) the player can Ascend: the run resets for `floor(sqrt(gold this run / 400))` crests (at least 1). Crests buy permanent upgrades in the Crest tree (`CREST_TREE`), and each unspent crest adds +10% gold.
- **Prices carry the pacing.** Every Forge price is multiplied by `UPGRADE_PRICE_SCALE` (4). Raise it to lengthen the game, lower it to shorten it.

Pacing was tuned with a bot that plays the real engine with greedy upgrade buying. Median runs to reach each wave, 30 trials:

| Wave (stage) | Random aim | Best aim |
| --- | --- | --- |
| 3 (1-3) | 3 | 2 |
| 5 (1-5 boss) | 17 | 20 |
| 10 (2-5 boss) | 80 | 64 |
| 20 (4-5 boss) | 120 | 110 |

### Daily challenge
Every day at `00:00 UTC` everyone gets the same board. The seed is the date (`YYYY-MM-DD`) fed into a deterministic Mulberry32 generator, so no server is needed. Crits and lucky procs use a seed from the same date. Gold is paid only for the first win each day, and replays are practice. Results can be shared as an emoji grid.

### Saves
Progress is stored in the browser's `localStorage` under one key. Each field is checked and clamped on load, and a save that fails to parse is copied to `<key>_corrupt_backup` before a fresh save replaces it. Changes to the save format need a version field and a migration, or existing progress is lost.

---

## 💰 Ads and analytics

- **Google Analytics 4** and **Google AdSense** load only when their IDs are set at build time. Without them the game runs in sandbox mode and logs ad events locally.
- **Rewarded ads** are optional. Watching one grants a reward, and the game stays fully playable without them.
- Copy `.env.example` to `.env` for local use:
  ```bash
  cp .env.example .env
  ```
- Set the real IDs in `.env` (or in the Cloudflare Workers Builds variables for production):
  - `VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX`
  - `VITE_ADSENSE_CLIENT_ID=ca-pub-XXXXXXXXXXXXXXXX`
  - `VITE_ADSENSE_SIDEBAR_SLOT` and the other ad slot IDs
- Replace the placeholder publisher ID in `public/ads.txt` with your real `pub-XXXXXXXXXXXXXXXX` ID so Google can verify the site.
- **AdSense site verification:** the AdSense script is added by JavaScript (and only when the ID is set), so Google's crawler may not see the "AdSense code snippet" in the page HTML. In AdSense, add the site with the **ads.txt snippet** method, or the **meta tag** method (add Google's `<meta name="google-adsense-account">` tag to `index.html`), instead of the code snippet.
- **Rewarded ads** use Google H5 Games Ads, which must be approved on the AdSense account first. Until then production shows no "Watch ad" buttons; use `?debug` to try the simulated ad.

---

## 🛠 Local development

```bash
npm install
npm run dev      # local dev server
npm run build    # production build into dist/
npm run preview  # serve the built dist/ locally
npm run zip:portal  # portal build into dist-portal/, packed as lethal-grid-portal.zip
```

---

## 🕹 Game portals (CrazyGames, itch.io, Poki, GameDistribution)

`npm run zip:portal` builds with `vite build --mode portal` and packs `dist-portal/` into `lethal-grid-portal.zip`, with `index.html` at the root of the zip. Upload that zip to the portal. The Cloudflare build (`npm run build`) is unchanged.

The portal build differs from the website build in these ways:
- **Relative paths** (`base: './'`), so it runs from whatever subfolder the portal hosts it under.
- **No GA4 or AdSense**, even if `.env` holds real IDs. Portals forbid outside ad and tracking scripts, and rewarded-ad buttons stay hidden. `IS_PORTAL_BUILD` in `src/services/analytics.js` is the switch.
- **Privacy text inline** in the Privacy dialog, with no link out of the iframe.
- **No website-only files:** canonical link, social cards, structured data and manifest (the `<!-- web-only -->` blocks in `index.html`), plus `_headers`, `ads.txt`, `privacy.html`, `manifest.webmanifest`, `og-image.jpg`, `robots.txt` and `sitemap.xml`.
- **Space, arrow and Page keys** don't scroll the portal's page behind the game.

Both builds go silent while the tab is hidden, which portal QA checks by switching tabs.

---

## 🚀 Deployment (Cloudflare Workers)

The game is a static site served as **Cloudflare Workers static assets** (`wrangler.jsonc`), built and deployed from GitHub by Workers Builds. There is no Worker script, so every request is a static asset request.

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Assets directory | `dist` |
| Unknown paths | served `index.html` (`not_found_handling: single-page-application`) |

- **Production** deploys from `main`.
- **Preview** builds run for every other branch and pull request. They are marked `noindex` and their `robots.txt` disallows crawling, so only production shows up in search. Leave the ad and analytics variables unset for previews so they stay in sandbox mode.
- **Rollback:** open the Worker in the Cloudflare dashboard, go to Deployments, and roll back to an earlier version.
- **Caching:** `public/_headers` caches `/assets/*` for a year as immutable and adds security headers. Everything in `/assets/` has a content hash in its name, so put images in `src/assets/` and reference them from code or CSS, never from `public/assets/`.
- **SEO:** `vite.config.js` writes the site address into the canonical link, social cards and structured data in `index.html`, and builds `robots.txt` and `sitemap.xml`. The address defaults to the `workers.dev` URL; set `VITE_SITE_URL` (for example `https://lethalgrid.com`) when the game moves to its own domain. The social preview image is `public/og-image.jpg` (1200×630).
- **Privacy:** the full policy is the static page `public/privacy.html`, served at `/privacy`.

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
  assets/                 images (WebP), hashed by Vite at build time
public/                   static files: ads.txt, _headers, privacy page, icons, social image
```
