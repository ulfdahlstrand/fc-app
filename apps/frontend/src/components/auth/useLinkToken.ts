/** The token from the email link that opened this page, read once. */
import { useEffect, useState } from "react";
import {
  clearTokenFromAddressBar,
  readTokenFromHash,
} from "../../lib/password-auth";

export function useLinkToken(): string | null {
  const [token] = useState(() => readTokenFromHash(globalThis.location.hash));
  useEffect(clearTokenFromAddressBar, []);
  return token;
}
