// ============================================================================
// ZERO-DEPENDENCY LOCAL DEV SERVER (Node.js built-in HTTP)
// ============================================================================

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3000;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg"
};

const server = http.createServer((req, res) => {
  // Strip query parameters
  let cleanUrl = req.url.split("?")[0];
  if (cleanUrl === "/" || cleanUrl === "") {
    cleanUrl = "/index.html";
  }

  // Resolve file path safely
  const safePath = path.normalize(decodeURIComponent(cleanUrl)).replace(/^(\.\.[\/\\])+/, "");
  const filePath = path.join(ROOT_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found: " + cleanUrl);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache"
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🔥 DEAD ZONE: URBAN OUTPOST LOCAL SERVER ONLINE`);
  console.log(`👉 Open in your browser: http://localhost:${PORT}`);
  console.log(`🔑 Security Password:    dakustowerGame69`);
  console.log(`==================================================\n`);
});
