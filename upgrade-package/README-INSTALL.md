# Auto-Qualifiers Feature — Install Guide

Adds a permanent **Auto-Qualifiers** admin page to the Staff Portal so you can
manually auto-qualify players for the championship **each season** (e.g. the
previous season's console winners) — **even if they have zero points**. Both
the public leaderboard's "Qualified" badge and Championship Mode's top-20
berth math pick them up automatically.

Built against the code **deployed live at all-in-poker-e2914.web.app** (July 2026).
Apply these on your private computer to your real source, then deploy from there.

---

## What's in this package

| File | What it is | Where it goes |
|---|---|---|
| `qualifiers-admin.html` | The new admin page (staff-gated, venue + season aware) | copy into `public/` (or wherever your HTML pages live) |
| `getLeaderboard-merge-snippet.js` | Backend merge — makes `qualified` include manual adds | paste into your Cloud Functions code |
| `firestore-rules-snippet.txt` | Rules for the new `autoQualifiers` collection | add into `firestore.rules` |
| `gameday-menu-snippet.html` | Menu button for the Staff Portal | paste into `gameday.html` after Championship Mode |

New Firestore collection created automatically on first use: **`autoQualifiers`**
`{ player, venue, seasonId, note, qualified: true, createdAt, addedBy }`

---

## Install steps (on your private computer)

1. **Copy `qualifiers-admin.html`** next to your other pages (same folder as
   `gameday.html`). It imports `./firebase-api.js?v=9` and `./staff-auth.js`
   exactly like championship-director.html does — if your local filenames or
   `?v=` cache-buster differ, match them.

2. **Add the menu button**: open `gameday.html`, find the Championship Mode
   `<a>` block in "Scoring & Operations", paste the block from
   `gameday-menu-snippet.html` right after it.

3. **Backend merge**: open the file in `functions/` that defines your
   `getLeaderboard` callable. Paste in `applyAutoQualifiers` from the snippet
   and add ONE line right before getLeaderboard returns its standings:

   ```js
   standings = await applyAutoQualifiers(db, venue, seasonId, standings);
   ```

   (Full wiring notes are in the snippet's header comment. If you build
   locally with an AI assistant, handing it that file + this snippet is a
   30-second job.)

4. **Rules**: add the `autoQualifiers` match block from
   `firestore-rules-snippet.txt` into `firestore.rules`.

5. **Deploy from your machine**:
   ```bash
   firebase deploy --only hosting,functions,firestore:rules
   ```

---

## Then: add Drew Cook and Clay for Season 33

1. Staff Portal → **Auto-Qualifiers** (new button)
2. Pick the venue; season defaults to the **current active season** (33)
3. Type **Drew Cook** — the autocomplete searches your real player list
   (so you can find Clay's full name by just typing "Clay")
4. Optional note like "Season 32 console winner" → **Add Auto-Qualifier**

They'll immediately show **Qualified** on the leaderboard and hold a top-20
championship berth, points or no points. Next season, open the same page,
pick the new season, add that season's names — that's the whole workflow.

---

## Caveats (honest ones)

- Built from your **deployed** front-end. If your private source has moved
  ahead of what's live, double-check the two integration points
  (menu paste + getLeaderboard return) against your local files.
- I could not see your Cloud Functions source, so the snippet is written
  defensively (resolves the active season itself if `seasonId` isn't handy,
  and never throws — worst case the leaderboard renders without manual adds).
- Nothing is live until **you** deploy. This package changes no data and no
  running system by itself.
