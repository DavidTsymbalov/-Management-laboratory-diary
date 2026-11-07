/** Shared by the browser and the Supabase function. No personal data in auth emails. */
export function normalizeStudentName(name: string) {
  return name
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("ru-RU");
}

async function loginDigest(name: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalizeStudentName(name)),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return hex.slice(0, 48);
}

// Project-local identifiers only; no mailbox or email delivery is involved.
export async function studentEmail(name: string) {
  return `s-${await loginDigest(name)}@students.management-laboratory.invalid`;
}

export async function teacherEmail(username: string) {
  return `t-${await loginDigest(username)}@teachers.management-laboratory.invalid`;
}

export function csaEmail(login: string) {
  const name = normalizeStudentName(login);
  if (!/^[a-z0-9_-]{3,32}$/.test(name))
    throw new Error("Логин CSA: 3–32 латинских буквы, цифры, _ или -.");
  return `${name}@csa.management-laboratory.invalid`;
}
