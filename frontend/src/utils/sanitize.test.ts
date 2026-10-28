import { describe, expect, it } from "vitest";
import { sanitizeText } from "./sanitize";

describe("sanitizeText", () => {
  it("strips HTML tags", () => {
    expect(sanitizeText('Deal <script>alert("x")</script> notes')).toBe('Deal alert("x") notes');
  });

  it("removes null bytes", () => {
    expect(sanitizeText("Bauer\u0000 GmbH")).toBe("Bauer GmbH");
  });

  it("removes bidi override characters that could spoof the rendered text", () => {
    expect(sanitizeText("invoice‮txt.exe")).toBe("invoicetxt.exe");
    expect(sanitizeText("a⁦b⁩c‏d؜e")).toBe("abcde");
  });

  it("removes C0 and C1 control characters but keeps tab, newline and carriage return", () => {
    expect(sanitizeText("a\u0001b\u001Bc\u007Fd\u009Fe")).toBe("abcde");
    expect(sanitizeText("line 1\r\n\tline 2")).toBe("line 1\r\n\tline 2");
  });

  it("leaves ordinary text, including accents and emoji, unchanged", () => {
    const text = "Müller & Söhne — 10% off 🚀";
    expect(sanitizeText(text)).toBe(text);
  });
});
