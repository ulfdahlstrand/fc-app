import { z } from "zod";

// ---------------------------------------------------------------------------
// Google OAuth / OpenID Connect provider (ADR-004)
//
// Standard authorization-code flow. The id_token is fetched directly from
// Google's token endpoint over TLS, so its payload can be trusted without a
// separate JWKS signature verification step.
//
// The exported OAuthProfile is provider-neutral — Apple (and others) plug in
// later by producing the same shape.
// ---------------------------------------------------------------------------

const AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export interface OAuthProfile {
  provider: "google";
  subject: string;
  email: string;
  name: string;
  imageUrl: string | null;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[auth] Required environment variable ${name} is not set`);
  }
  return value;
}

export function getGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: requireEnv("AUTH_CALLBACK_URL"),
    response_type: "code",
    scope: "openid email profile",
    state,
  });
  return `${AUTHORIZATION_ENDPOINT}?${params.toString()}`;
}

const idTokenClaimsSchema = z.object({
  sub: z.string(),
  email: z.string(),
  name: z.string().optional(),
  picture: z.string().optional(),
});

function decodeJwtPayload(jwt: string): unknown {
  const payload = jwt.split(".")[1];
  if (!payload) {
    throw new Error("[auth] Malformed id_token");
  }
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

export async function exchangeGoogleCode(code: string): Promise<OAuthProfile> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: requireEnv("AUTH_CALLBACK_URL"),
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `[auth] Google token exchange failed (${response.status}): ${body}`
    );
  }

  const data = (await response.json()) as { id_token?: string };
  if (!data.id_token) {
    throw new Error("[auth] Google token response contained no id_token");
  }

  const claims = idTokenClaimsSchema.parse(decodeJwtPayload(data.id_token));

  return {
    provider: "google",
    subject: claims.sub,
    email: claims.email,
    name: claims.name ?? claims.email,
    imageUrl: claims.picture ?? null,
  };
}
