import { Collaborator } from "./types";

const USER_KEY = "revibe_flow_user";

/** Distinct, readable avatar colors assigned to collaborators. */
export const AVATAR_COLORS = [
  "#059669", // emerald
  "#2563eb", // blue
  "#d97706", // amber
  "#dc2626", // red
  "#7c3aed", // violet
  "#db2777", // pink
  "#0891b2", // cyan
  "#ca8a04", // yellow
  "#4f46e5", // indigo
  "#ea580c", // orange
];

function randomId(): string {
  return `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

/** Returns the stored collaborator, or null if the user hasn't set a name yet. */
export function getUser(): Collaborator | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.userId && parsed?.name) return parsed as Collaborator;
    }
  } catch {}
  return null;
}

/** Persists (or updates) the collaborator identity. A stable userId is kept across name changes. */
export function setUserName(name: string): Collaborator {
  const existing = getUser();
  const userId = existing?.userId || randomId();
  const user: Collaborator = {
    userId,
    name: name.trim() || "Guest",
    color: existing?.color || colorFor(userId),
  };
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {}
  }
  return user;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
