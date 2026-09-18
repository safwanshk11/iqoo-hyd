import { Capacitor } from "@capacitor/core";
export const apiRoot =
  (import.meta as any).env.VITE_API_URL ||
  (Capacitor.isNativePlatform() ? "http://localhost:3001/api" : "/api");
export async function api(path: string, body?: unknown, method?: string) {
  const response = await fetch(apiRoot + path, {
    method: method || (body ? "POST" : "GET"),
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new Error("The server returned an invalid response. Try again.");
  }
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth/") && path !== "/me")
      window.dispatchEvent(new Event("parkly-session-expired"));
    throw new Error(data.error || "Unable to complete the request.");
  }
  return data;
}
