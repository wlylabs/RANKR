// Username rules, shared by the browser (instant feedback) and the server. SQL enforces the same.

export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
export const RESERVED_USERNAMES = ["admin", "rankr", "support", "root", "system", "null", "undefined", "anon", "me"];

export type UsernameProblem = "invalid" | "reserved" | "taken";

export function checkUsername(name: string): UsernameProblem | null {
  if (!USERNAME_RE.test(name)) return "invalid";
  if (RESERVED_USERNAMES.includes(name.toLowerCase())) return "reserved";
  return null;
}

export const USERNAME_HELP = "3-20 characters: letters, numbers, underscore.";

export function usernameMessage(problem: UsernameProblem): string {
  return problem === "taken"
    ? "That username is taken."
    : problem === "reserved"
      ? "That username is reserved."
      : `Use ${USERNAME_HELP.toLowerCase()}`;
}
