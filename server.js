const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 3000);
const MAX_BODY_BYTES = 4096;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

const staticFiles = new Map([
  ["/", { file: "index.html", type: "text/html; charset=utf-8" }],
  ["/index.html", { file: "index.html", type: "text/html; charset=utf-8" }],
  ["/styles.css", { file: "styles.css", type: "text/css; charset=utf-8" }],
  ["/app.js", { file: "app.js", type: "text/javascript; charset=utf-8" }],
  ["/assets/game-collage.png", { file: "assets/game-collage.png", type: "image/png" }],
]);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, status, message) {
  sendJson(response, status, { ok: false, error: message });
}

async function readJsonBody(request) {
  if (!request.headers["content-type"]?.includes("application/json")) {
    throw new HttpError(415, "Expected an application/json request.");
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new HttpError(413, "Request body is too large.");
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

function validateSubmission(payload) {
  const id = typeof payload?.id === "string" ? payload.id.trim() : "";
  const username = typeof payload?.username === "string" ? payload.username.trim() : "";

  if (!id || !username) {
    throw new HttpError(400, "Both fields are required.");
  }
  if (id.length > 80 || username.length > 40) {
    throw new HttpError(400, "One or more fields exceed the allowed length.");
  }

  return { id, username };
}

function getWebhookUrl() {
  if (!DISCORD_WEBHOOK_URL) {
    throw new HttpError(503, "Discord is not configured. Set DISCORD_WEBHOOK_URL and restart the server.");
  }

  let webhook;
  try {
    webhook = new URL(DISCORD_WEBHOOK_URL.trim());
  } catch {
    throw new HttpError(503, "DISCORD_WEBHOOK_URL is not a valid URL.");
  }

  if (
    webhook.protocol !== "https:" ||
    webhook.hostname !== "discord.com" ||
    !webhook.pathname.startsWith("/api/webhooks/")
  ) {
    throw new HttpError(503, "DISCORD_WEBHOOK_URL must be a Discord webhook URL.");
  }

  return webhook;
}

async function submitToDiscord({ id, username }) {
  const response = await fetch(getWebhookUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      content: `**ID:** ${id}\n**Username:** ${username}`,
      allowed_mentions: { parse: [] },
    }),
  });

  if (!response.ok) {
    // Log Discord's actual reason in the terminal so we can see what went wrong
    const detail = await response.text().catch(() => "");
    console.error("Discord rejected the message:", response.status, detail);
    throw new HttpError(
      502,
      `Discord did not accept the message (status ${response.status}). Check the webhook and try again.`
    );
  }
}

async function handleRequest(request, response) {
  const pathname = new URL(request.url, `http://${HOST}`).pathname;

  if (request.method === "POST" && pathname === "/api/submit") {
    const submission = validateSubmission(await readJsonBody(request));
    await submitToDiscord(submission);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET, POST");
    sendError(response, 405, "Method not allowed.");
    return;
  }

  const asset = staticFiles.get(pathname);
  if (!asset) {
    sendError(response, 404, "Not found.");
    return;
  }

  const headers = {
    "Content-Type": asset.type,
    "Cache-Control": "no-cache",
    "Content-Security-Policy": "default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
  response.writeHead(200, headers);
  fs.createReadStream(path.join(__dirname, asset.file)).pipe(response);
}

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    if (response.headersSent) {
      response.destroy(error);
      return;
    }

    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) {
      console.error("Request failed:", error);
    }
    sendError(response, status, status === 500 ? "An unexpected server error occurred." : error.message);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`App running at http://${HOST}:${PORT}`);
  if (!DISCORD_WEBHOOK_URL) {
    console.warn("Discord submissions are disabled: DISCORD_WEBHOOK_URL is not set.");
  }
});
