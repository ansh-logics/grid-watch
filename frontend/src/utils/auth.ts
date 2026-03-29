/** Matches `backend/tests/integration/helpers.ts` seed IDs and `init.sql` dev seed. */
const DEFAULT_USER_ID =
  import.meta.env.VITE_DEFAULT_USER_ID ?? "22222222-2222-2222-2222-222222222222";
const DEFAULT_ZONE_ID =
  import.meta.env.VITE_DEFAULT_ZONE_ID ?? "11111111-1111-1111-1111-111111111111";

function readLocalStorage(key: string, fallback: string): string {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  // One-time migration from early frontend placeholders
  if (key === "gridwatch.userId" && raw === "00000000-0000-0000-0000-000000000001") {
    return fallback;
  }
  if (key === "gridwatch.zoneId" && raw === "zone-a") {
    return fallback;
  }
  return raw;
}

export function getAuthContext() {
  return {
    userId: readLocalStorage("gridwatch.userId", DEFAULT_USER_ID),
    zoneId: readLocalStorage("gridwatch.zoneId", DEFAULT_ZONE_ID),
    jwt: localStorage.getItem("gridwatch.jwt") ?? "",
  };
}
