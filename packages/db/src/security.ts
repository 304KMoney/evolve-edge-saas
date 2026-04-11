import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

export function hashOpaqueToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createOpaqueToken() {
  return randomBytes(32).toString("base64url");
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P
  }).toString("hex");

  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derivedKey}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [algorithm, nValue, rValue, pValue, salt, expectedKey] =
    storedHash.split("$");

  if (
    algorithm !== "scrypt" ||
    !nValue ||
    !rValue ||
    !pValue ||
    !salt ||
    !expectedKey
  ) {
    return false;
  }

  const derivedKey = scryptSync(password, salt, expectedKey.length / 2, {
    N: Number(nValue),
    r: Number(rValue),
    p: Number(pValue)
  });
  const expectedBuffer = Buffer.from(expectedKey, "hex");

  if (derivedKey.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(derivedKey, expectedBuffer);
}
