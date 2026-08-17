import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

const KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LEN).toString("hex");
  return `${salt}:${hash}`;
}

export function verificarPassword(password: string, almacenado: string): boolean {
  const [salt, hash] = almacenado.split(":");
  if (!salt || !hash) return false;
  const hashCalculado = scryptSync(password, salt, KEY_LEN);
  const hashAlmacenado = Buffer.from(hash, "hex");
  if (hashCalculado.length !== hashAlmacenado.length) return false;
  return timingSafeEqual(hashCalculado, hashAlmacenado);
}
