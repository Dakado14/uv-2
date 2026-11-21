import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { timingSafeEqual } from "node:crypto";
import express from "express";
import ipaddr from "ipaddr.js";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { createBareServer } from "@tomphttp/bare-server-node";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const port = Number.parseInt(process.env.PORT || "3000", 10);
const require = createRequire(import.meta.url);

function packageDirectory(packageName) {
  return path.dirname(require.resolve(packageName));
}

const app = express();
app.disable("x-powered-by");

// Cross-origin isolation is needed by some proxied sites that use
// SharedArrayBuffer. Scramjet removes conflicting upstream isolation headers.
app.use((_req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  next();
});

app.get("/_health", (_req, res) => {
  res.json({
    ok: true,
    app: "Project Rebellion",
    proxy: "Scramjet",
    transport: "Bare v3 (same Node service; no Wisp server)"
  });
});

// Serve Scramjet's browser runtime and the Bare client as static files.
app.use("/scram/", express.static(scramjetPath, { fallthrough: false, maxAge: "1h" }));
app.use("/utils/", express.static(packageDirectory("@mercuryworkshop/scramjet-utils"), { fallthrough: false, maxAge: "1h" }));
app.use("/controller/", express.static(packageDirectory("@mercuryworkshop/scramjet-controller"), { fallthrough: false, maxAge: "1h" }));
app.use("/baremod/", express.static(packageDirectory("@mercuryworkshop/bare-transport"), { fallthrough: false, maxAge: "1h" }));

// A service worker must be revalidated so a new deploy can replace it.
app.use("/sw.js", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

app.use(express.static(publicDir, {
  index: "index.html",
  extensions: ["html"],
  etag: true,
  maxAge: "1h",
  setHeaders(res, filePath) {
    if (path.resolve(filePath) === path.resolve(publicDir, "sw.js")) {
      res.setHeader("Cache-Control", "no-store");
    }
  }
}));

app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// Bare transport speaks the Bare v3 HTTP protocol. Its endpoint lives inside
// this same Node process; it is not a second Wisp service.
const bareServer = createBareServer("/bare/", {
  legacySupport: false,
  connectionLimiter: {
    maxConnectionsPerIP: 2000,
    windowDuration: 60,
    blockDuration: 10
  },
  // Keep the Bare server's default DNS lookup guard. This extra check rejects
  // private/local literal-IP destinations, including IPv6 literals.
  filterRemote(url) {
    const hostname = String(url.hostname || "").replace(/^\[|\]$/g, "");
    if (ipaddr.isValid(hostname) && ipaddr.parse(hostname).range() !== "unicast") {
      throw new RangeError("Requests to private or non-public IP addresses are blocked.");
    }
  }
});

// Optional access gate. Set ACCESS_PASSWORD on your host before publishing
// the service so it is not an unauthenticated public proxy.
const accessPassword = process.env.ACCESS_PASSWORD || "";
function isAuthorized(req) {
  const requestPath = new URL(req.url || "/", "http://localhost").pathname;
  if (requestPath === "/_health") return true;
  if (!accessPassword) return true;
  const header = req.headers.authorization || "";
  if (!header.startsWith("Basic ")) return false;

  let suppliedPassword = "";
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) return false;
    suppliedPassword = decoded.slice(separator + 1);
  } catch {
    return false;
  }

  const expected = Buffer.from(accessPassword);
  const supplied = Buffer.from(suppliedPassword);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

function rejectUnauthorized(res) {
  res.writeHead(401, {
    "WWW-Authenticate": 'Basic realm="Project Rebellion", charset="UTF-8"',
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end("Project Rebellion requires its access password.");
}

const server = http.createServer((req, res) => {
  if (!isAuthorized(req)) {
    rejectUnauthorized(res);
    return;
  }

  try {
    if (bareServer.shouldRoute(req)) {
      bareServer.routeRequest(req, res);
      return;
    }
    app(req, res);
  } catch (error) {
    console.error("Request handler error:", error);
    if (!res.headersSent) res.statusCode = 502;
    if (!res.writableEnded) res.end("Request failed. Check the server logs.");
  }
});

// Bare's own WebSocket upgrade route is used for proxied sites that open
// WebSockets. This is not Wisp; it is handled by the same Bare server above.
server.on("upgrade", (req, socket, head) => {
  if (!isAuthorized(req)) {
    socket.end(
      "HTTP/1.1 401 Unauthorized\r\n" +
      'WWW-Authenticate: Basic realm="Project Rebellion", charset="UTF-8"\r\n' +
      "Connection: close\r\n\r\n"
    );
    return;
  }

  try {
    if (bareServer.shouldRoute(req)) {
      bareServer.routeUpgrade(req, socket, head);
      return;
    }
  } catch (error) {
    console.error("Bare WebSocket upgrade error:", error);
  }
  socket.destroy();
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Project: Rebellion listening on port ${port}`);
  console.log("Scramjet + Bare v3 transport is enabled (no Wisp service).");
  console.log(accessPassword ? "Access password protection is enabled." : "WARNING: ACCESS_PASSWORD is unset; set it before public deployment.");
});

function shutdown(signal) {
  console.log(`${signal} received; shutting down.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
