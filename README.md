# Project: Rebellion — Scramjet + Bare (no Wisp service)

This package keeps the Project: Rebellion interface and uses MercuryWorkshop Scramjet 2.x with the Bare v3 transport. The Bare endpoint runs inside the same Node.js server. There is **no separate Wisp server or Wisp URL** to configure.

## What is included

- Project: Rebellion's monochrome moon landing page, moon animation, stars, and occasional meteors.
- The side tab bar appears after a tab navigates; it stays hidden on the home screen.
- Independent Scramjet frames, tab switching, tab closing, and Ctrl/Cmd+T, Ctrl/Cmd+W, Ctrl/Cmd+L shortcuts.
- Scramjet 2.x browser runtime, controller, service worker, and utilities.
- Bare v3 client and an embedded `@tomphttp/bare-server-node` endpoint at `/bare/`.
- Optional HTTP Basic access password using the `ACCESS_PASSWORD` environment variable.
- `/_health` health endpoint.

## Requirements

- Node.js 20 or newer
- npm
- A Node.js host that serves the app over HTTPS (the server also includes Bare upgrade routing where the host supports it)

## Run locally on macOS

1. Extract the ZIP file.
2. Open Terminal.
3. Change into the extracted project folder. For example, if it is in Downloads:

   ```bash
   cd ~/Downloads/project-rebellion-scramjet
   ```

4. Install dependencies:

   ```bash
   npm install
   ```

5. Start the app:

   ```bash
   npm start
   ```

6. Open `http://localhost:3000`.
7. Check `http://localhost:3000/_health`. The response should contain `"ok": true` and `"transport": "Bare v3 ..."`.

To set a local access password before starting:

```bash
ACCESS_PASSWORD='choose-a-long-password' npm start
```

If set, the browser asks for HTTP Basic credentials. Use any username and the password you chose.

## Deploy to Render

1. Create a GitHub repository for this project.
2. Upload the **contents** of the extracted folder so `package.json`, `server.js`, `README.md`, `Dockerfile`, and `public/` are at the repository root. Do not upload the outer folder as an extra nested directory.
3. In Render, choose **New + → Web Service** and connect the GitHub repository.
4. Set Runtime to **Node**.
5. Set Build Command to `npm install`.
6. Set Start Command to `npm start`.
7. Leave Root Directory blank if `package.json` is at the repository root.
8. In the Render service's **Environment** settings, add:
   - Key: `ACCESS_PASSWORD`
   - Value: a unique, long password that you do not use elsewhere
9. Create the service and wait until Render reports **Live**.
10. Visit the service URL and complete the browser's Basic Authentication prompt. Then check `https://YOUR-SERVICE.onrender.com/_health`.

Render provides the `PORT` environment variable automatically. The server listens on `0.0.0.0`.

## Important differences from Wisp

- The browser creates a `BareClient` for `new URL('/bare/', location.href)`.
- The Node server creates the Bare v3 endpoint at `/bare/` in the same process and routes its HTTP requests and WebSocket upgrades.
- No `@mercuryworkshop/wisp-js`, `proxy-bootstrap`, libcurl transport, or separate Wisp service is used.
- Bare is a request/response-oriented transport, not a replacement for every capability of the libcurl/Wisp stack. Some real-time, UDP-dependent, media, login, and other network features may behave differently or fail. CAPTCHA acceptance depends on the target site and hosting IP; this code does not bypass CAPTCHA.
- Bare terminates the destination site's TLS at the proxy host. The server operator can technically inspect proxied URLs, headers, cookies, form submissions, and response content. Only use a host you trust.
- The app is a proxy service. Keep it private and set `ACCESS_PASSWORD` before deploying it to a public URL. Do not share the password or host an unauthenticated public proxy.

## Deployment notes

- This is a Node.js project, **not** a Cloudflare Worker script. Do not paste `server.js` into the Cloudflare Worker editor.
- `public/sw.js` must be served from the site root so its service-worker scope can cover `/~/sj/`.
- The browser loads Scramjet assets in this order: core, controller, then utils.
- Package versions are pinned to a compatible Scramjet 2.x set. Do not replace them with unpinned `latest` versions without checking the Scramjet version matrix.
- First navigation registers the service worker and initializes the Bare transport. If the browser reports that the service worker did not take control, reload once and retry.
