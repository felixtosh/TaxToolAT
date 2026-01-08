import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator, Firestore } from "firebase/firestore";
import { getStorage as getFirebaseStorage, connectStorageEmulator, FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDhxXMbHgaD1z9n0bkuVaSRmmiCrbNL-l4",
  authDomain: "taxstudio-f12fb.firebaseapp.com",
  projectId: "taxstudio-f12fb",
  storageBucket: "taxstudio-f12fb.firebasestorage.app",
  messagingSenderId: "534848611676",
  appId: "1:534848611676:web:8a3d1ede57c65b7e884d99",
};

const APP_NAME = "server";

let _app: FirebaseApp | null = null;
let _db: Firestore | null = null;
let _storage: FirebaseStorage | null = null;
let _emulatorConnected = false;
let _storageEmulatorConnected = false;

/**
 * Get the server-side Firebase app (singleton)
 */
export function getServerApp(): FirebaseApp {
  if (_app) return _app;

  _app = getApps().find((a) => a.name === APP_NAME) || initializeApp(firebaseConfig, APP_NAME);
  return _app;
}

/**
 * Get the server-side Firestore instance (singleton)
 * Connects to emulator in development mode
 */
export function getServerDb(): Firestore {
  if (_db) return _db;

  const app = getServerApp();
  _db = getFirestore(app);

  // Connect to emulator in development
  if (
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_USE_EMULATORS !== "false" &&
    !_emulatorConnected
  ) {
    try {
      connectFirestoreEmulator(_db, "localhost", 8080);
      _emulatorConnected = true;
      console.log("[Server] Connected to Firestore emulator");
    } catch (e) {
      // Already connected
    }
  }

  return _db;
}

/**
 * Get the server-side Storage instance (singleton)
 * Connects to emulator in development mode
 */
export function getServerStorage(): FirebaseStorage {
  if (_storage) return _storage;

  const app = getServerApp();
  _storage = getFirebaseStorage(app);

  // Connect to emulator in development
  if (
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_USE_EMULATORS !== "false" &&
    !_storageEmulatorConnected
  ) {
    try {
      connectStorageEmulator(_storage, "localhost", 9199);
      _storageEmulatorConnected = true;
      console.log("[Server] Connected to Storage emulator");
    } catch (e) {
      // Already connected
    }
  }

  return _storage;
}

export const MOCK_USER_ID = "dev-user-123";
