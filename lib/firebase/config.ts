"use client";

import { initializeApp, getApps } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";

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

// Connect to emulators in development
let emulatorsConnected = false;

export function connectEmulators() {
  if (emulatorsConnected) return;
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV !== "development") return;

  try {
    connectFirestoreEmulator(db, "localhost", 8080);
    connectStorageEmulator(storage, "localhost", 9199);
    emulatorsConnected = true;
    console.log("Connected to Firebase emulators");
  } catch (e) {
    // Emulators already connected
  }
}

// Auto-connect in development
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  connectEmulators();
}

export default app;
