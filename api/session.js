const {
  createSessionToken,
  hasSession,
  safeEqual,
  sessionCookie,
  SESSION_SECONDS,
} = require("../lib/session");

function sendJson(response, status, body) {
  response.status(status).setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

module.exports = function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  if (request.method === "GET") {
    try {
      return sendJson(response, 200, { authenticated: hasSession(request) });
    } catch {
      return sendJson(response, 500, { error: "App authentication is not configured." });
    }
  }

  if (request.method === "DELETE") {
    response.setHeader("Set-Cookie", sessionCookie("", 0));
    return sendJson(response, 200, { authenticated: false });
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "GET, POST, DELETE");
    return sendJson(response, 405, { error: "Method not allowed." });
  }

  const password = request.body && request.body.password;
  const expectedPassword = process.env.FRIDAY_APP_PASSWORD;
  if (!expectedPassword) {
    return sendJson(response, 500, { error: "App authentication is not configured." });
  }
  if (typeof password !== "string" || !safeEqual(password, expectedPassword)) {
    return sendJson(response, 401, { error: "Incorrect password." });
  }

  const token = createSessionToken(expectedPassword);
  response.setHeader("Set-Cookie", sessionCookie(token, SESSION_SECONDS));
  return sendJson(response, 200, { authenticated: true });
};
