export abstract class CifradoReversiblePort {
  /** HMAC-SHA256 del número → lookup sin descifrar (RNF-01) */
  abstract hashNumero(numero: string): string;
  /** AES-256-GCM cifrado → reversión solo con AES_KEY */
  abstract cifrarNumero(numero: string): string;
  /** Descifra el número previamente cifrado */
  abstract descifrarNumero(cifrado: string): string;
}
