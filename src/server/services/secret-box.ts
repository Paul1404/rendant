// Symmetric encryption for secrets that must round-trip through the database
// (currently the SMTP password). AES-256-GCM with a key derived from
// BETTER_AUTH_SECRET via scrypt. The payload format is
// `v1:<iv>:<tag>:<ciphertext>` (all base64). Never log the plaintext or the key.

import {
	createCipheriv,
	createDecipheriv,
	randomBytes,
	scryptSync,
} from "node:crypto";

const PREFIX = "v1";
const SALT = "svufo-secret-box-v1";

function deriveKey(): Buffer {
	const secret = process.env.BETTER_AUTH_SECRET?.trim();
	if (!secret) {
		throw new Error(
			"BETTER_AUTH_SECRET fehlt; Secret kann nicht ver-/entschlüsselt werden",
		);
	}
	return scryptSync(secret, SALT, 32);
}

// Encrypts a plaintext secret. An empty input yields an empty string so callers
// can store "no secret" without a special case.
export function encryptSecret(plain: string): string {
	if (!plain) return "";
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", deriveKey(), iv);
	const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();
	return `${PREFIX}:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

// Decrypts a payload produced by encryptSecret. Returns "" for empty or
// malformed input rather than throwing, so a corrupted/rotated value degrades
// to "no password" instead of crashing a send.
export function decryptSecret(payload: string): string {
	if (!payload) return "";
	const parts = payload.split(":");
	if (parts.length !== 4 || parts[0] !== PREFIX) return "";
	const [, ivB64, tagB64, dataB64] = parts;
	try {
		const decipher = createDecipheriv(
			"aes-256-gcm",
			deriveKey(),
			Buffer.from(ivB64, "base64"),
		);
		decipher.setAuthTag(Buffer.from(tagB64, "base64"));
		const dec = Buffer.concat([
			decipher.update(Buffer.from(dataB64, "base64")),
			decipher.final(),
		]);
		return dec.toString("utf8");
	} catch {
		return "";
	}
}
