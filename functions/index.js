/**
 * All-In Poker - Cloud Functions
 *
 * These functions trigger on Firestore writes and sync data
 * to the existing GAS backend (which writes to Heritage sheets).
 *
 * This is the "at leisure" background sync - user doesn't wait for this.
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

admin.initializeApp();

// Your existing GAS API endpoint
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbyX-7IJV4t3SLrwxzSAV04Geczz-ZTb21k2HNbmM_y2uvBBeqtbibFt8xxPmOG2Isfy/exec";

/**
 * Triggered when a new check-in is created in Firestore.
 * Syncs the check-in to GAS (which writes to Heritage sheets).
 */
exports.syncCheckinToGAS = functions.firestore
  .document('checkins/{checkinId}')
  .onCreate(async (snap, context) => {
    const checkinId = context.params.checkinId;
    const data = snap.data();

    // Skip if already synced or if it's a speed test
    if (data.syncedToSheets || data.type === 'speed_test') {
      console.log(`Skipping ${checkinId} - already synced or test`);
      return null;
    }

    console.log(`Syncing check-in ${checkinId} to GAS:`, data);

    try {
      const startTime = Date.now();

      // Call the existing GAS API
      const response = await fetch(GAS_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'checkin',
          player: data.player,
          date: data.date,
          gameNumber: data.gameNum,
          location: data.venue
        })
      });

      const result = await response.json();
      const syncTime = Date.now() - startTime;

      console.log(`GAS sync completed in ${syncTime}ms:`, result);

      // Update the document to mark it as synced
      await snap.ref.update({
        syncedToSheets: true,
        syncedAt: admin.firestore.FieldValue.serverTimestamp(),
        syncTimeMs: syncTime,
        gasResponse: result
      });

      return { success: true, syncTime };

    } catch (error) {
      console.error(`Error syncing ${checkinId}:`, error);

      // Mark as failed (can be retried)
      await snap.ref.update({
        syncedToSheets: false,
        syncError: error.message,
        lastSyncAttempt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Throw to trigger retry (Firebase will retry failed functions)
      throw error;
    }
  });

/**
 * Triggered when a new RSVP is created in Firestore.
 * Syncs the RSVP to GAS.
 */
exports.syncRsvpToGAS = functions.firestore
  .document('rsvps/{rsvpId}')
  .onCreate(async (snap, context) => {
    const rsvpId = context.params.rsvpId;
    const data = snap.data();

    if (data.syncedToSheets) {
      return null;
    }

    console.log(`Syncing RSVP ${rsvpId} to GAS:`, data);

    try {
      const response = await fetch(GAS_API_URL, {
        method: 'POST',
        body: JSON.stringify({
          action: 'rsvp',
          player: data.player,
          date: data.date,
          location: data.venue,
          gameNumber: data.gameNum
        })
      });

      const result = await response.json();

      await snap.ref.update({
        syncedToSheets: true,
        syncedAt: admin.firestore.FieldValue.serverTimestamp(),
        gasResponse: result
      });

      return { success: true };

    } catch (error) {
      console.error(`Error syncing RSVP ${rsvpId}:`, error);
      await snap.ref.update({
        syncError: error.message
      });
      throw error;
    }
  });

/**
 * Triggered when a bounty is recorded in Firestore.
 * Syncs to GAS.
 */
exports.syncBountyToGAS = functions.firestore
  .document('bounties/{bountyId}')
  .onCreate(async (snap, context) => {
    const bountyId = context.params.bountyId;
    const data = snap.data();

    if (data.syncedToSheets) {
      return null;
    }

    console.log(`Syncing bounty ${bountyId} to GAS:`, data);

    try {
      const response = await fetch(GAS_API_URL, {
        method: 'POST',
        body: JSON.stringify({
          action: 'addBounty',
          player: data.player,
          date: data.date,
          location: data.venue,
          gameNum: data.gameNum,
          count: data.count || 1
        })
      });

      const result = await response.json();

      await snap.ref.update({
        syncedToSheets: true,
        syncedAt: admin.firestore.FieldValue.serverTimestamp(),
        gasResponse: result
      });

      return { success: true };

    } catch (error) {
      console.error(`Error syncing bounty ${bountyId}:`, error);
      await snap.ref.update({
        syncError: error.message
      });
      throw error;
    }
  });

/**
 * Triggered when an elimination is recorded in Firestore.
 * Syncs to GAS.
 */
exports.syncEliminationToGAS = functions.firestore
  .document('eliminations/{eliminationId}')
  .onCreate(async (snap, context) => {
    const eliminationId = context.params.eliminationId;
    const data = snap.data();

    if (data.syncedToSheets) {
      return null;
    }

    console.log(`Syncing elimination ${eliminationId} to GAS:`, data);

    try {
      const response = await fetch(GAS_API_URL, {
        method: 'POST',
        body: JSON.stringify({
          action: 'recordElimination',
          player: data.player,
          date: data.date,
          location: data.venue,
          gameNum: data.gameNum,
          rank: data.rank
        })
      });

      const result = await response.json();

      await snap.ref.update({
        syncedToSheets: true,
        syncedAt: admin.firestore.FieldValue.serverTimestamp(),
        gasResponse: result,
        gasEntryId: result.entryId || null
      });

      return { success: true };

    } catch (error) {
      console.error(`Error syncing elimination ${eliminationId}:`, error);
      await snap.ref.update({
        syncError: error.message
      });
      throw error;
    }
  });

/**
 * Triggered when an elimination is deleted in Firestore (undo).
 * Syncs the undo to GAS.
 */
exports.syncEliminationDeleteToGAS = functions.firestore
  .document('eliminations/{eliminationId}')
  .onDelete(async (snap, context) => {
    const eliminationId = context.params.eliminationId;
    const data = snap.data();

    // Only undo if we have the GAS entry ID
    if (!data.gasEntryId) {
      console.log(`No GAS entry ID for ${eliminationId}, skipping undo sync`);
      return null;
    }

    console.log(`Syncing elimination undo ${eliminationId} to GAS:`, data);

    try {
      const response = await fetch(GAS_API_URL, {
        method: 'POST',
        body: JSON.stringify({
          action: 'undoScoring',
          entryId: data.gasEntryId
        })
      });

      const result = await response.json();
      console.log(`GAS undo completed:`, result);

      return { success: true };

    } catch (error) {
      console.error(`Error syncing elimination undo ${eliminationId}:`, error);
      // Log but don't throw - we can't update a deleted document
      return { success: false, error: error.message };
    }
  });

/**
 * Manual retry function - call this to retry failed syncs
 * Can be triggered via HTTP or scheduled
 */
exports.retryFailedSyncs = functions.https.onRequest(async (req, res) => {
  const db = admin.firestore();

  // Find all checkins that failed to sync
  const failedCheckins = await db.collection('checkins')
    .where('syncedToSheets', '==', false)
    .where('syncError', '!=', null)
    .limit(50)
    .get();

  console.log(`Found ${failedCheckins.size} failed check-ins to retry`);

  const results = [];

  for (const doc of failedCheckins.docs) {
    const data = doc.data();
    try {
      const response = await fetch(GAS_API_URL, {
        method: 'POST',
        body: JSON.stringify({
          action: 'checkin',
          player: data.player,
          date: data.date,
          gameNumber: data.gameNum,
          location: data.venue
        })
      });

      const result = await response.json();

      await doc.ref.update({
        syncedToSheets: true,
        syncedAt: admin.firestore.FieldValue.serverTimestamp(),
        syncError: admin.firestore.FieldValue.delete(),
        gasResponse: result
      });

      results.push({ id: doc.id, status: 'success' });

    } catch (error) {
      results.push({ id: doc.id, status: 'failed', error: error.message });
    }
  }

  res.json({ retried: results.length, results });
});

/**
 * Health check endpoint
 */
exports.health = functions.https.onRequest((req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    gasEndpoint: GAS_API_URL
  });
});
