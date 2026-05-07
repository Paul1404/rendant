import bcrypt from "bcryptjs";

let cachedHash: string | null = null;

function getHash(): string {
  if (cachedHash) return cachedHash;
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || pw.length < 1) {
    throw new Error("ADMIN_PASSWORD ist nicht gesetzt");
  }
  cachedHash = bcrypt.hashSync(pw, 12);
  return cachedHash;
}

export async function verifyAdminPassword(input: string): Promise<boolean> {
  if (typeof input !== "string" || input.length === 0) return false;
  return bcrypt.compare(input, getHash());
}
