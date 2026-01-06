// =====================================================
// FIREBASE CONFIGURATION
// =====================================================
// All-In Poker Firebase Project: all-in-poker-e2914
// Configured on: January 5, 2026

export const firebaseConfig = {
  apiKey: "AIzaSyD7TmFaebGzIj8ws7ZGFIUIKFJqM7RK-yQ",
  authDomain: "all-in-poker-e2914.firebaseapp.com",
  projectId: "all-in-poker-e2914",
  storageBucket: "all-in-poker-e2914.firebasestorage.app",
  messagingSenderId: "248877069916",
  appId: "1:248877069916:web:b36cf30d4e1f042bda9899"
};

// Your existing GAS API (still used for reads and background sync)
export const GAS_API_URL = "https://script.google.com/macros/s/AKfycbyX-7IJV4t3SLrwxzSAV04Geczz-ZTb21k2HNbmM_y2uvBBeqtbibFt8xxPmOG2Isfy/exec";

// Check if Firebase is configured
export function isFirebaseConfigured() {
  return firebaseConfig.apiKey !== "YOUR_API_KEY";
}
