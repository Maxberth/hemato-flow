import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { env } from "../../config/env";
import { CifradoReversiblePort } from "./cifrado.port";

/**
 * Hash irreversible (HMAC-SHA256 con sal estática) + cifrado reversible AES-256-GCM.
 * El hash identifica al remitente sin descifrar nada; el cifrado solo se revierte
 * con AES_KEY.
 */
export class AesGcmCifradoAdapter extends CifradoReversiblePort {
  private key: Buffer;

  constructor(keyBase64 = env.AES_KEY, salt = env.AES_SALT) {
    super();
    this.key = Buffer.from(keyBase64, "base64");
    if (this.key.length !== 32) {
      throw new Error(`AES_KEY inválida: se esperaban 32 bytes, recibidos ${this.key.length}`);
    }
    if (!salt) {
      throw new Error("AES_SALT no configurada");
    }
    this.salt = salt;
  }

  private salt: string;

  /** Normaliza el número: quita prefijo "whatsapp:" y espacios (consistencia hash) */
  private normalizar(numero: string): string {
    return numero.replace(/^whatsapp:/i, "").replace(/\s/g, "");
  }

  hashNumero(numero: string): string {
    return createHmac("sha256", this.salt).update(this.normalizar(numero)).digest("hex");
  }

  cifrarNumero(numero: string): string {
    const normalizado = this.normalizar(numero);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const cifrado = Buffer.concat([cipher.update(normalizado, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    // formato: iv:tag:cifrado (todo base64)
    return `${iv.toString("base64")}:${tag.toString("base64")}:${cifrado.toString("base64")}`;
  }

  descifrarNumero(cifrado: string): string {
    const [ivB64, tagB64, dataB64] = cifrado.split(":");
    if (!ivB64 || !tagB64 || !dataB64) {
      throw new Error("Cifrado inválido");
    }
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const claro = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]);
    return claro.toString("utf8");
  }
}
