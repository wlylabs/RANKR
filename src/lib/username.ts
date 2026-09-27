// Username rules, shared by the browser (instant feedback) and the server. SQL enforces the same.

export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
export const RESERVED_USERNAMES = ["admin", "rankr", "support", "root", "system", "null", "undefined", "anon", "me"];

/** "locked": official accounts keep their name; only the project owner changes it (rankr_set_official). */
export type UsernameProblem = "invalid" | "reserved" | "taken" | "locked";

export function checkUsername(name: string): UsernameProblem | null {
  if (!USERNAME_RE.test(name)) return "invalid";
  const lower = name.toLowerCase();
  // Look-alikes of the project too, so only the official account (with its badge) can be @rankr-ish.
  if (RESERVED_USERNAMES.includes(lower) || lower.startsWith("rankr") || lower.includes("official")) return "reserved";
  return null;
}

export const USERNAME_HELP = "3-20 characters: letters, numbers, underscore.";

export function usernameMessage(problem: UsernameProblem): string {
  return problem === "taken"
    ? "That username is taken."
    : problem === "reserved"
      ? "That username is reserved."
      : problem === "locked"
        ? "Official accounts can't change their name."
        : `Use ${USERNAME_HELP.toLowerCase()}`;
}
