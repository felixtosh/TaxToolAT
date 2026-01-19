"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "@/lib/firebase/config";

interface AuthContextValue {
  user: User | null;
  userId: string | null;
  isAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshAdminStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const googleProvider = new GoogleAuthProvider();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshAdminStatus = useCallback(async () => {
    if (!user) {
      setIsAdmin(false);
      return;
    }
    const token = await user.getIdTokenResult(true);
    setIsAdmin(!!token.claims.admin);
  }, [user]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        // Get fresh token to check admin claim
        const token = await firebaseUser.getIdTokenResult();
        setIsAdmin(!!token.claims.admin);
      } else {
        setIsAdmin(false);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    // Validate registration against allowedEmails
    const validateFn = httpsCallable<
      { email: string },
      { allowed: boolean; reason?: string }
    >(functions, "validateRegistration");

    const result = await validateFn({ email: email.toLowerCase() });

    if (!result.data.allowed) {
      throw new Error(
        result.data.reason ||
          "Registration not allowed. Please request an invite from an admin."
      );
    }

    await createUserWithEmailAndPassword(auth, email, password);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const result = await signInWithPopup(auth, googleProvider);
    const email = result.user.email;

    // For new users signing up with Google, validate against allowedEmails
    // Check if this is a new user by checking metadata
    const isNewUser =
      result.user.metadata.creationTime === result.user.metadata.lastSignInTime;

    if (isNewUser && email) {
      const validateFn = httpsCallable<
        { email: string },
        { allowed: boolean; reason?: string }
      >(functions, "validateRegistration");

      const validation = await validateFn({ email: email.toLowerCase() });

      if (!validation.data.allowed) {
        // Delete the newly created account and throw error
        await result.user.delete();
        throw new Error(
          "Registration not allowed. Please request an invite from an admin."
        );
      }
    }
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  }, []);

  const value: AuthContextValue = {
    user,
    userId: user?.uid ?? null,
    isAdmin,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    resetPassword,
    refreshAdminStatus,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
