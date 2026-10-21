# ⚡ Lethal Grid: Overclock

An **Incremental 1-Turn Tactical Chain-Reaction Puzzle Game** built with **React + Vite**, pre-wired with **Google Analytics 4 (GA4)** event tracking and **Google AdSense / Rewarded Video Ad** placements.

---

## 🎮 Core Gameplay Loop

1. **One-Turn Tactical "Find Lethal" Grid:**
   - Every Sector spawns a board of cybernetic nodes: **Drone Cores (`DRN`)**, **Volatile Mines (`BMB` — 3×3 AoE blast on death)**, **Arc Pylons (`ARC` — Row/Col lightning beam on death)**, **Prism Catalysts (`AMP` — +50% turn damage on death)**, and **Overlord Bosses (`BOSS`)**.
   - Use your limited 1-Turn Charges and 4 Tactical Abilities (**Rail-Cross Laser**, **Nova Detonator**, **Tesla Ricochet**, **Singularity X-Wave**) to trigger a recursive chain reaction and clear 100% of the board!
2. **Incremental Scaling (Grid & Abilities Expand):**
   - Spend **Overclock Shards** to expand the tactical battlefield from **`3×3` → `4×4` → `5×5` → `6×6` → `7×7` → `8×8`**, increase your Action Point Charges per turn, evolve your abilities, and unlock an **Autonomous Pulse Drone** for idle shard generation.
3. **Daily Shared Seed Challenge (`00:00 UTC`):**
   - Uses a deterministic Mulberry32 date-seed PRNG (`YYYY-MM-DD`) so every player worldwide gets the exact same daily puzzle without needing any backend database or server! Includes 1-click Wordle-style emoji grid sharing.

---

## 💰 Google Analytics 4 (GA4) & Ad Revenue Setup

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Add your real IDs when ready:
   - `VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX` (from [Google Analytics](https://analytics.google.com))
   - `VITE_ADSENSE_CLIENT_ID=ca-pub-XXXXXXXXXXXXXXXX` (from [Google AdSense](https://adsense.google.com))
3. Update `public/ads.txt` with your Google AdSense `pub-XXXXXXXXXXXXXXXX` ID so Google verifies your domain ownership.

---

## 🚀 Free Hosting Deployment (Cloudflare Pages / Vercel / GitHub Pages)

- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Local Development:**
  ```bash
  npm install
  npm run dev
  ```
