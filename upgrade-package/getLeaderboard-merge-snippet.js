/**
 * AUTO-QUALIFIERS MERGE — paste into your Cloud Functions codebase.
 *
 * WHY HERE: both leaderboard.html and championship-director.html get their
 * `qualified` flags from the getLeaderboard Cloud Function. Merging the
 * manual auto-qualifiers here means EVERY page (leaderboard badge, top-20
 * berth math in buildChampionshipRanking, championship seating) picks them
 * up automatically — no front-end changes needed at all.
 *
 * HOW TO WIRE IT UP (2 steps):
 *
 * 1. Paste the applyAutoQualifiers function below anywhere in the file that
 *    defines your getLeaderboard callable.
 *
 * 2. Inside getLeaderboard, right after the standings array is built and the
 *    season is resolved — just before you return { status, standings, ... } —
 *    add ONE line:
 *
 *      standings = await applyAutoQualifiers(db, venue, seasonId, standings);
 *
 *    where `db` is your admin Firestore handle (admin.firestore() or
 *    getFirestore()), `venue` is the venue string, and `seasonId` is the
 *    season the function resolved (pass null/undefined if you don't have it
 *    handy — the helper will look up the active season itself).
 */

async function applyAutoQualifiers(db, venue, seasonId, standings) {
  try {
    // Resolve the active season if the caller didn't pass one
    let sid = seasonId;
    if (!sid) {
      const activeSnap = await db.collection('seasons')
        .where('venue', '==', venue)
        .where('active', '==', true)
        .limit(1)
        .get();
      if (!activeSnap.empty) sid = activeSnap.docs[0].id;
    }
    if (!sid) return standings;

    const snap = await db.collection('autoQualifiers')
      .where('venue', '==', venue)
      .where('seasonId', '==', sid)
      .get();
    if (snap.empty) return standings;

    const byName = new Map(
      standings.map(p => [String(p.name || '').toLowerCase(), p])
    );

    snap.forEach(d => {
      const q = d.data();
      const key = String(q.player || '').toLowerCase().trim();
      if (!key) return;

      const existing = byName.get(key);
      if (existing) {
        // Player already in standings (any point total) — just flag them
        existing.qualified = true;
        existing.autoQualifier = true;
      } else {
        // Zero-point player not in standings at all — add a stub row so the
        // leaderboard badge + championship berth logic still count them
        standings.push({
          name: q.player,
          points: 0,
          bounties: 0,
          gamesPlayed: 0,
          qualified: true,
          autoQualifier: true
        });
      }
    });

    return standings;
  } catch (err) {
    // Never let a qualifier problem take down the leaderboard
    console.error('applyAutoQualifiers failed (non-fatal):', err);
    return standings;
  }
}

module.exports = { applyAutoQualifiers }; // remove if pasting inline instead of requiring
