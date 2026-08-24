import { randomUUID } from "node:crypto";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { COOKIE_NAME, decodeOAuthState, OAUTH_STATE_COOKIE, ONE_YEAR_MS } from "@shared/const";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function requestOrigin(req: Request) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = typeof forwardedProto === "string" ? forwardedProto.split(",")[0] : req.protocol;
  return `${protocol}://${req.get("host")}`;
}

function getOidcConfig() {
  if (!ENV.oidcIssuerUrl || !ENV.oidcClientId || !ENV.oidcClientSecret) {
    throw new Error("OIDC is not configured. Set OIDC_ISSUER_URL, OIDC_CLIENT_ID, and OIDC_CLIENT_SECRET.");
  }
  return { issuerUrl: ENV.oidcIssuerUrl.replace(/\/+$/, ""), clientId: ENV.oidcClientId, clientSecret: ENV.oidcClientSecret };
}

async function getOidcMetadata() {
  const { issuerUrl } = getOidcConfig();
  const discoveryUrl = issuerUrl.endsWith("/.well-known/openid-configuration") ? issuerUrl : `${issuerUrl}/.well-known/openid-configuration`;
  const response = await fetch(discoveryUrl);
  if (!response.ok) throw new Error(`OIDC discovery failed (${response.status})`);
  return (await response.json()) as { authorization_endpoint: string; token_endpoint: string; userinfo_endpoint?: string; issuer: string; jwks_uri: string };
}

async function handleOidcLogin(req: Request, res: Response) {
  const { clientId } = getOidcConfig();
  const metadata = await getOidcMetadata();
  const state = randomUUID();
  const redirectUri = ENV.oidcRedirectUri || `${requestOrigin(req)}/api/oauth/callback`;
  const cookieOptions = getSessionCookieOptions(req);
  res.cookie(OAUTH_STATE_COOKIE, state, { ...cookieOptions, maxAge: 10 * 60 * 1000 });
  const authorizationUrl = new URL(metadata.authorization_endpoint);
  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", ENV.oidcScopes || "openid profile email");
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("nonce", state);
  res.redirect(302, authorizationUrl.toString());
}

async function handleOidcCallback(req: Request, res: Response) {
  const code = getQueryParam(req, "code");
  const state = getQueryParam(req, "state");
  const expectedState = parseCookieHeader(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
  if (!code || !state || !expectedState || state !== expectedState) {
    res.status(403).json({ error: "invalid oidc state" });
    return;
  }
  res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
  const { clientId, clientSecret } = getOidcConfig();
  const metadata = await getOidcMetadata();
  const redirectUri = ENV.oidcRedirectUri || `${requestOrigin(req)}/api/oauth/callback`;
  const tokenResponse = await fetch(metadata.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri }),
  });
  if (!tokenResponse.ok) throw new Error(`OIDC token exchange failed (${tokenResponse.status})`);
  const tokenData = (await tokenResponse.json()) as { access_token?: string; id_token?: string };
  if (!tokenData.id_token) throw new Error("OIDC provider did not return an id_token");
  const verified = await jwtVerify(tokenData.id_token, createRemoteJWKSet(new URL(metadata.jwks_uri)), { issuer: metadata.issuer, audience: clientId });
  const claims = verified.payload as Record<string, unknown>;
  if (claims.nonce !== expectedState) throw new Error("OIDC nonce validation failed");
  const subject = typeof claims.sub === "string" ? claims.sub : "";
  if (!subject) throw new Error("OIDC id_token did not include a subject");
  const openId = `oidc:${subject}`;
  const name = typeof claims.name === "string" ? claims.name : typeof claims.email === "string" ? claims.email : "Orbit member";
  const email = typeof claims.email === "string" ? claims.email : null;
  await db.upsertUser({ openId, name, email, loginMethod: "oidc", lastSignedIn: new Date() });
  const sessionToken = await sdk.createSessionToken(openId, { name, expiresInMs: ONE_YEAR_MS });
  const cookieOptions = getSessionCookieOptions(req);
  res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
  res.redirect(302, "/");
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/login", async (req: Request, res: Response) => {
    if (ENV.authMode !== "oidc") {
      res.status(404).json({ error: "External OIDC login is not enabled" });
      return;
    }
    try {
      await handleOidcLogin(req, res);
    } catch (error) {
      console.error("[OIDC] Login failed", error);
      res.status(503).json({ error: "OIDC login is not configured" });
    }
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    if (ENV.authMode === "oidc") {
      try {
        await handleOidcCallback(req, res);
      } catch (error) {
        console.error("[OIDC] Callback failed", error);
        res.status(500).json({ error: "OIDC callback failed" });
      }
      return;
    }

    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await db.upsertUser({ openId: userInfo.openId, name: userInfo.name || null, email: userInfo.email ?? null, loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null, lastSignedIn: new Date() });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, { name: userInfo.name || "", expiresInMs: ONE_YEAR_MS });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
