/** The password forms validate against the contract's rules. */
import { describe, expect, it } from "vitest";
import {
  loginFormSchema,
  readTokenFromHash,
  registerFormSchema,
  resetFormSchema,
} from "./password-auth";

describe("registerFormSchema", () => {
  const valid = {
    name: " Anna ",
    email: " Anna@Example.COM ",
    password: "a long enough passphrase",
    confirmPassword: "a long enough passphrase",
  };

  it("trims the name and lowercases the address", () => {
    expect(registerFormSchema.parse(valid)).toMatchObject({
      name: "Anna",
      email: "anna@example.com",
    });
  });

  it("wants at least ten characters", () => {
    const result = registerFormSchema.safeParse({
      ...valid,
      password: "short",
      confirmPassword: "short",
    });
    expect(result.error?.issues[0]).toMatchObject({
      path: ["password"],
      code: "too_small",
    });
  });

  it("wants the two passwords to match", () => {
    const result = registerFormSchema.safeParse({
      ...valid,
      confirmPassword: "a different passphrase",
    });
    expect(result.error?.issues[0]).toMatchObject({
      path: ["confirmPassword"],
      code: "custom",
    });
  });

  it("refuses a malformed address", () => {
    expect(
      registerFormSchema.safeParse({ ...valid, email: "not-an-address" })
        .success
    ).toBe(false);
  });
});

describe("loginFormSchema", () => {
  it("does not apply the length rule to an existing password", () => {
    expect(
      loginFormSchema.safeParse({ email: "a@b.se", password: "old" }).success
    ).toBe(true);
  });
});

describe("resetFormSchema", () => {
  it("wants the two passwords to match", () => {
    expect(
      resetFormSchema.safeParse({
        password: "a long enough passphrase",
        confirmPassword: "a long enough passphrasE",
      }).success
    ).toBe(false);
  });
});

describe("readTokenFromHash", () => {
  const token = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_abcde";

  it("reads the token from a link's fragment", () => {
    expect(readTokenFromHash(`#token=${token}`)).toBe(token);
  });

  it("is null when there is none, or it is not token-shaped", () => {
    expect(readTokenFromHash("")).toBeNull();
    expect(readTokenFromHash("#token=short")).toBeNull();
  });
});
