export abstract class CanalSalidaPort {
  /**
   * @param to destino del canal ("tg:<chatId>", "whatsapp:+51...", ...)
   * @param body texto del mensaje
   * @param parseMode opcional: "HTML" destaca etiquetas <code>/<b> (Telegram);
   *   los mensajes del LLM y reenvíos de humanos SIEMPRE van en texto plano.
   * @param botones opcional: teclado de una fila (Telegram); al tocarlos envían
   *   el texto como mensaje normal (compatible con el clasificador de intención).
   */
  abstract enviarMensaje(
    to: string,
    body: string,
    parseMode?: "HTML",
    botones?: string[],
  ): Promise<{ sid: string }>;

  /**
   * Pide el número de celular al usuario (teclado "Compartir número", Telegram).
   * Usado en el flujo de vinculación: el paciente comparte su contacto y el
   * sistema lo cruza contra la ficha (numeroHash) para guardar el chatId.
   */
  abstract pedirContacto(to: string, body: string): Promise<{ sid: string }>;
}
