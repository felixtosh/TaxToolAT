import { initializeApp, getApps } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { OperationsContext } from "./types.js";

const firebaseConfig = {
  apiKey: "AIzaSyDhxXMbHgaD1z9n0bkuVaSRmmiCrbNL-l4",
  authDomain: "taxstudio-f12fb.firebaseapp.com",
  projectId: "taxstudio-f12fb",
  storageBucket: "taxstudio-f12fb.firebasestorage.app",
  messagingSenderId: "534848611676",
  appId: "1:534848611676:web:8a3d1ede57c65b7e884d99",
};

// Initialize Firebase (singleton pattern)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const db = getFirestore(app);
export const storage = getStorage(app);

// Connect to emulators if USE_EMULATORS env is set
let emulatorsConnected = false;

export function connectEmulators() {
  if (emulatorsConnected) return;
  if (process.env.USE_EMULATORS !== "true") return;

  try {
    connectFirestoreEmulator(db, "localhost", 8080);
    connectStorageEmulator(storage, "localhost", 9199);
    emulatorsConnected = true;
    console.error("Connected to Firebase emulators");
  } catch {
    // Emulators already connected
  }
}

// Default user ID for development (when no auth is configured)
const DEV_USER_ID = "dev-user-123";

/**
 * Create the operations context for MCP tools
 * @param userId - Optional user ID. If not provided, uses dev user in development mode.
 */
export function createContext(userId?: string): OperationsContext {
  // Connect to emulators if configured
  connectEmulators();

  return {
    db,
    userId: userId || DEV_USER_ID,
  };
}
