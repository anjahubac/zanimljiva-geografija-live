import { describe, expect, it } from "vitest";
import {
  accountErrorSchema,
  accountSchema,
  emailSchema,
  loginSchema,
  registerSchema,
} from "@contracts/account.schemas";

describe("account contracts identify a player by email", () => {
  it("accepts an address and normalizes it to one canonical form", () => {
    expect(emailSchema.parse("  Ana@Primer.RS  ")).toBe("ana@primer.rs");
  });

  it("rejects what is not an address", () => {
    for (const bad of ["", "ana", "ana@", "@primer.rs", "ana primer.rs", "ana@@primer.rs"]) {
      expect(emailSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it("rejects an address longer than RFC 5321 permits", () => {
    expect(emailSchema.safeParse(`${"a".repeat(250)}@primer.rs`).success).toBe(false);
  });

  it("requires a password long enough to be worth hashing", () => {
    const short = { email: "ana@primer.rs", password: "kratkasifra" };
    expect(loginSchema.safeParse(short).success).toBe(false);
    expect(loginSchema.safeParse({ ...short, password: "dovoljno duga sifra" }).success).toBe(true);
  });

  it("refuses an extra key rather than ignoring it", () => {
    const valid = { email: "ana@primer.rs", password: "dovoljno duga sifra" };
    expect(loginSchema.safeParse({ ...valid, admin: true }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, displayName: "Ana", id: "x" }).success).toBe(false);
    expect(
      accountSchema.safeParse({
        id: "11111111-1111-4111-8111-111111111111",
        email: "ana@primer.rs",
        displayName: "Ana",
        hash: "leaked",
      }).success,
    ).toBe(false);
  });

  it("registers the display name that login does not carry", () => {
    const credentials = { email: "ana@primer.rs", password: "dovoljno duga sifra" };
    expect(registerSchema.safeParse(credentials).success).toBe(false);
    expect(registerSchema.safeParse({ ...credentials, displayName: "Ana" }).success).toBe(true);
  });

  it("names the email collision without naming a username", () => {
    expect(accountErrorSchema.safeParse({ error: "EMAIL_UNAVAILABLE" }).success).toBe(true);
    expect(accountErrorSchema.safeParse({ error: "USERNAME_UNAVAILABLE" }).success).toBe(false);
  });
});
