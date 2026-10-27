const { hasSession } = require("../lib/session");

const NOTION_VERSION = "2022-06-28";
const MAX_TITLE_LENGTH = 120;
const MAX_NOTE_LENGTH = 5000;

function sendJson(response, status, body) {
  response.status(status).setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

function validateSession(request, response) {
  try {
    if (!hasSession(request)) {
      sendJson(response, 401, { error: "Please sign in again." });
      return false;
    }
    return true;
  } catch {
    sendJson(response, 500, { error: "App authentication is not configured." });
    return false;
  }
}

async function getGoogleAccessToken() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google Calendar is not configured in Vercel.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    throw new Error("Google authorization failed. Check Calendar credentials.");
  }
  const data = await response.json();
  if (!data.access_token) {
    throw new Error("Google did not return an access token.");
  }
  return data.access_token;
}

async function handleCalendar(request, response) {
  const action = request.body && request.body.action;
  const calendarId = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID || "primary");
  const accessToken = await getGoogleAccessToken();
  const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;

  if (action === "list") {
    const now = new Date();
    const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const url = new URL(baseUrl);
    url.searchParams.set("timeMin", now.toISOString());
    url.searchParams.set("timeMax", weekLater.toISOString());
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "20");
    const result = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!result.ok) throw new Error("Could not read Google Calendar events.");
    const data = await result.json();
    const events = (data.items || []).map((event) => ({
      id: event.id,
      summary: event.summary || "(No title)",
      start: event.start && (event.start.dateTime || event.start.date),
      end: event.end && (event.end.dateTime || event.end.date),
      htmlLink: event.htmlLink,
    }));
    return sendJson(response, 200, { events });
  }

  if (action === "create") {
    const { summary, description, start, end, timeZone } = request.body || {};
    if (
      typeof summary !== "string" ||
      !summary.trim() ||
      summary.length > MAX_TITLE_LENGTH ||
      typeof start !== "string" ||
      typeof end !== "string" ||
      !Number.isFinite(Date.parse(start)) ||
      !Number.isFinite(Date.parse(end)) ||
      Date.parse(end) <= Date.parse(start) ||
      (description !== undefined &&
        (typeof description !== "string" || description.length > MAX_NOTE_LENGTH))
    ) {
      return sendJson(response, 400, { error: "Invalid event details." });
    }

    const result = await fetch(baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: summary.trim(),
        description: description || "",
        start: { dateTime: new Date(start).toISOString(), timeZone },
        end: { dateTime: new Date(end).toISOString(), timeZone },
      }),
    });
    if (!result.ok) throw new Error("Google Calendar could not create the event.");
    const event = await result.json();
    return sendJson(response, 201, {
      event: { id: event.id, summary: event.summary, start: event.start?.dateTime },
    });
  }

  return sendJson(response, 400, { error: "Unknown calendar action." });
}

async function handleNotion(request, response) {
  const apiKey = process.env.NOTION_API_KEY;
  const parentPageId = process.env.NOTION_PARENT_PAGE_ID;
  if (!apiKey || !parentPageId) {
    throw new Error("Notion is not configured in Vercel.");
  }

  const { title, content } = request.body || {};
  const contentLines = typeof content === "string" ? content.trim().split(/\r?\n/) : [];
  if (
    typeof title !== "string" ||
    !title.trim() ||
    title.length > MAX_TITLE_LENGTH ||
    typeof content !== "string" ||
    !content.trim() ||
    content.length > MAX_NOTE_LENGTH ||
    contentLines.length > 100 ||
    contentLines.some((line) => line.length > 2000)
  ) {
    return sendJson(response, 400, {
      error: "Enter a note title and text (up to 100 lines, 2,000 characters per line).",
    });
  }

  const blocks = content
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => ({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [{ type: "text", text: { content: line.slice(0, 2000) } }],
      },
    }));

  const result = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parent: { type: "page_id", page_id: parentPageId },
      properties: {
        title: {
          type: "title",
          title: [{ type: "text", text: { content: title.trim() } }],
        },
      },
      children: blocks,
    }),
  });
  if (!result.ok) {
    console.error("Notion request failed with status", result.status);
    throw new Error("Notion could not create the note. Check its integration access.");
  }
  const page = await result.json();
  return sendJson(response, 201, {
    note: { id: page.id, url: page.url, title: title.trim() },
  });
}

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (!["GET", "POST"].includes(request.method)) {
    response.setHeader("Allow", "GET, POST");
    return sendJson(response, 405, { error: "Method not allowed." });
  }
  if (!validateSession(request, response)) return;

  if (request.method === "GET") {
    return sendJson(response, 200, {
      notion: Boolean(process.env.NOTION_API_KEY && process.env.NOTION_PARENT_PAGE_ID),
      calendar: Boolean(
        process.env.GOOGLE_CLIENT_ID &&
          process.env.GOOGLE_CLIENT_SECRET &&
          process.env.GOOGLE_REFRESH_TOKEN,
      ),
    });
  }

  try {
    const service = request.body && request.body.service;
    if (service === "calendar") return await handleCalendar(request, response);
    if (service === "notion") return await handleNotion(request, response);
    return sendJson(response, 400, { error: "Unknown integration." });
  } catch (error) {
    return sendJson(response, 502, { error: error.message });
  }
};
