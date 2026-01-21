import { auth } from "@/lib/firebase/config";

/**
 * Make an authenticated fetch request with Firebase Auth token
 * Automatically includes the Authorization header with the current user's ID token
 */
export async function fetchWithAuth(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const user = auth.currentUser;

  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");

  if (user) {
    const token = await user.getIdToken();
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(input, {
    ...init,
    headers,
  });
}

/**
 * Get authorization headers for API requests
 * Use this when you need headers separately (e.g., for custom fetch configurations)
 */
export async function getAuthHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;

  if (!user) {
    return { "Content-Type": "application/json" };
  }

  const token = await user.getIdToken();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}
