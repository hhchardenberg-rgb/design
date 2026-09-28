/** Leesbare tekens zonder 0/O/1/l/I, om verwarring bij overtypen te voorkomen. */
const PASSWORD_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*";

/** Genereert een sterk, willekeurig wachtwoord. */
export function generatePassword(length = 12): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PASSWORD_CHARS[b % PASSWORD_CHARS.length]).join("");
}
