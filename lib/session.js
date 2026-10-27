const crypto = require("node:crypto");

const COOKIE_NAME = "friday_session";
const SESSION_SECONDS = 60 * 60 * 12;

function getSecret() {
  const secret = process.env.FRIDAY_APP_PASSWORD;
  if (!secret) {
    throw new Error("FRIDAY_APP_PASSWORD is not configured.");
  }
  return secret;
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function sign(payload, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
}

function createSessionToken(secret, now = Date.now()) {
  const payload = String(Math.floor(now / 1000) + SESSION_SECONDS);
  return `${payload}.${sign(payload, secret)}`;
}

function isValidSessionToken(token, secret, now = Date.now()) {
  if (typeof token !== "string") {
    return false;
  }
  const [expiresAt, signature, extra] = token.split(".");
  if (
    !expiresAt ||
    !signature ||
    extra !== undefined ||
    !/^\d+$/.test(expiresAt) ||
    Number(expiresAt) <= Math.floor(now / 1000)
  ) {
    return false;
  }
  return safeEqual(signature, sign(expiresAt, secret));
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        if (separator === -1) {
          return [part, ""];
        }
        try {
          return [
            part.slice(0, separator),
            decodeURIComponent(part.slice(separator + 1)),
          ];
        } catch {
          return [part.slice(0, separator), ""];
        }
      }),
  );
}

function sessionCookie(token, maxAge = SESSION_SECONDS) {
  const secure = process.env.VERCEL ? "; Secure" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function hasSession(request, now = Date.now()) {
  const secret = getSecret();
  const cookies = parseCookies(request.headers.cookie || "");
  return isValidSessionToken(cookies[COOKIE_NAME], secret, now);
}

module.exports = {
  COOKIE_NAME,
  SESSION_SECONDS,
  createSessionToken,
  hasSession,
  isValidSessionToken,
  safeEqual,
  sessionCookie,
};
