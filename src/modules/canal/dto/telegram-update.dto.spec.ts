import { describe, expect, test } from "bun:test";
import { parseTelegramUpdate } from "./telegram-update.dto";

describe("parseTelegramUpdate", () => {
  test("mensaje de texto → webhook con body y from tg:<chatId>", () => {
    const parsed = parseTelegramUpdate({
      update_id: 1,
      message: { message_id: 10, chat: { id: 123456 }, text: "hola" },
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.from).toBe("tg:123456");
    expect(parsed?.body).toBe("hola");
  });

  test("contacto compartido (sin texto ni audio) NO se descarta y expone el celular", () => {
    const parsed = parseTelegramUpdate({
      update_id: 2,
      message: {
        message_id: 11,
        chat: { id: 123456 },
        from: { id: 123456 },
        contact: { phone_number: "+51987654321", user_id: 123456 },
      },
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.from).toBe("tg:123456");
    expect(parsed?.contactoTelefono).toBe("+51987654321");
    expect(parsed?.body).toBe("");
  });

  test("sticker/sin contenido → null (se descarta y no bloquea el polling)", () => {
    const parsed = parseTelegramUpdate({
      update_id: 3,
      message: { message_id: 12, chat: { id: 123456 } },
    });
    expect(parsed).toBeNull();
  });

  test("callback / sin message → null", () => {
    const parsed = parseTelegramUpdate({ update_id: 4 });
    expect(parsed).toBeNull();
  });
});
