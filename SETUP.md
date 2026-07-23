# All-In Poker - Firebase Prototype Setup

This is a **Phase 2 prototype** that demonstrates fast writes to Firestore with background sync to your Heritage Google Sheets.

## Architecture

```
User Action (Check-In)
        │
        ▼
    Firestore (~100ms) ──► User sees "Success!"
        │
        │ (background trigger)
        ▼
  Cloud Function
        │
        ▼
  GAS API (2-5s) ──► Heritage Sheets updated
```

**User wait time: ~100ms** (vs 2-5s currently)

---

## Setup Steps

### 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project"
3. Name it something like `all-in-poker`
4. Disable Google Analytics (not needed)
5. Click "Create project"

### 2. Enable Firestore

1. In Firebase Console, click "Firestore Database" in left sidebar
2. Click "Create database"
3. Select "Start in test mode" (for prototype)
4. Choose a location (us-central1 is fine)
5. Click "Enable"

### 3. Get Your Firebase Config

1. In Firebase Console, click the gear icon → "Project settings"
2. Scroll down to "Your apps" section
3. Click the web icon (`</>`) to add a web app
4. Name it "All-In Poker Web"
5. Copy the `firebaseConfig` object - you'll need this!

### 4. Update the HTML Files

Open `public/checkin.html` and `public/comparison.html`

Find this section and replace with your config:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",           // ← Replace
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",     // ← Replace
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"              // ← Replace
};
```

### 5. Install Firebase CLI

```bash
npm install -g firebase-tools
```

### 6. Login to Firebase

```bash
firebase login
```

### 7. Initialize Project

```bash
cd firebase-prototype
firebase use YOUR_PROJECT_ID
```

Or update `.firebaserc`:
```json
{
  "projects": {
    "default": "your-actual-project-id"
  }
}
```

### 8. Install Function Dependencies

```bash
cd functions
npm install
cd ..
```

### 9. Test Locally

```bash
firebase emulators:start
```

This starts:
- Hosting at http://localhost:5000
- Functions emulator
- Firestore emulator

### 10. Deploy

When ready to deploy to production:

```bash
# Deploy everything
firebase deploy

# Or deploy specific parts
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore:rules
```

---

## Testing the Prototype

### Without Firebase (Demo Mode)

You can test the UI without configuring Firebase:

1. Open `public/checkin.html` directly in a browser
2. It will run in "demo mode" with simulated ~80ms writes
3. Good for testing the UI flow

### With Firebase

1. Complete setup steps above
2. Run `firebase emulators:start`
3. Open http://localhost:5000
4. Check-ins will write to Firestore
5. Cloud Functions will sync to your GAS/Sheets

---

## Files Overview

```
firebase-prototype/
├── firebase.json          # Firebase config
├── .firebaserc            # Project ID
├── firestore.rules        # Database security rules
├── firestore.indexes.json # Database indexes
├── package.json           # Root package.json
├── SETUP.md               # This file
│
├── public/                # Static files (hosted)
│   ├── index.html         # Landing page
│   ├── checkin.html       # Check-in prototype
│   └── comparison.html    # Speed comparison tool
│
└── functions/             # Cloud Functions
    ├── package.json       # Function dependencies
    └── index.js           # Function code (sync to GAS)
```

---

## How Background Sync Works

1. **User checks in** → Firestore document created instantly
2. **Firestore trigger fires** → `syncCheckinToGAS` function runs
3. **Function calls GAS API** → Same endpoint you use now
4. **GAS writes to Heritage Sheet** → Same code, same result
5. **Function updates Firestore** → Marks `syncedToSheets: true`

The user sees success in ~100ms. The Heritage sheet updates 3-8 seconds later.

---

## Firestore Collections

### `checkins`
```javascript
{
  player: "Jake",
  venue: "Tight End",
  gameNum: 1,
  date: "1/5/2026",
  timestamp: Timestamp,
  syncedToSheets: false,  // true after GAS sync
  syncedAt: Timestamp,    // when GAS sync completed
  syncTimeMs: 3500,       // how long GAS took
  gasResponse: {...}      // response from GAS
}
```

### `rsvps`
```javascript
{
  player: "Jake",
  venue: "Tight End",
  gameNum: 1,
  date: "1/5/2026",
  timestamp: Timestamp,
  syncedToSheets: false
}
```

### `bounties`
```javascript
{
  player: "Jake",
  venue: "Tight End",
  gameNum: 1,
  date: "1/5/2026",
  count: 1,
  timestamp: Timestamp,
  syncedToSheets: false
}
```

### `qualifiers`
Automatic qualifiers, set from the Director tool. A qualified player shows the
"Qualified" badge on the leaderboard even with **zero points** (e.g. the
previous season's console winner). Tied to a venue/console.
```javascript
{
  player: "Jake",
  venue: "Tight End",
  note: "2025 season winner",  // optional
  qualified: true,
  timestamp: Timestamp,
  syncedToSheets: false        // true after GAS sync
}
```

The Cloud Functions `syncQualifierToGAS` / `syncQualifierDeleteToGAS` push
qualifier add/remove to GAS via `action: 'setQualified'` /
`action: 'removeQualified'`. **These GAS actions need to be implemented on the
Heritage/Apps Script side** for the sheet to reflect qualifiers; until then the
qualifier still lives in Firestore and the leaderboard merges it in client-side,
so the badge appears regardless.

---

## Monitoring

### View Function Logs

```bash
firebase functions:log
```

### View in Console

1. Firebase Console → Functions → Logs
2. Firebase Console → Firestore → Data (see documents)

### Retry Failed Syncs

If GAS was temporarily down:

```bash
curl https://YOUR_PROJECT.cloudfunctions.net/retryFailedSyncs
```

---

## Cost (Free Tier)

| Service | Free Limit | Your Usage |
|---------|------------|------------|
| Firestore Writes | 20K/day | ~50-100/night |
| Firestore Reads | 50K/day | ~200-500/night |
| Cloud Functions | 2M/month | ~500/month |
| Hosting | 10GB storage | <1MB |
| Hosting Bandwidth | 360MB/day | ~10MB/night |

**Estimated cost: $0/month** for a poker league

---

## Next Steps

After validating Phase 2 works:

1. **Phase 3**: Read from Firestore (faster leaderboards)
2. **Phase 4**: Add authentication (who checked in who)
3. **Phase 5**: Admin UI with Rowy
4. **Phase 6**: Eventually sunset Heritage sheets

---

## Troubleshooting

### "Firebase not configured"
- You need to add your Firebase config to the HTML files

### Functions not triggering
- Check Firebase Console → Functions → Logs
- Make sure functions are deployed: `firebase deploy --only functions`

### GAS sync failing
- Check the GAS endpoint is correct in `functions/index.js`
- Check Firebase Console → Firestore → find document with `syncError`

### CORS errors
- GAS should handle CORS, but if issues, check GAS doPost returns proper headers
