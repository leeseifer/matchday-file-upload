import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../prototypes/penalty-file-upload/dist",
);
const port = Number(process.env.MATCHDAY_PREVIEW_PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(
    "MATCHDAY_PREVIEW_PORT must be a port number from 1 to 65535.",
  );
}
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".map": "application/json",
};
try {
  await stat(resolve(root, "index.html"));
} catch {
  console.error("Run npm run build:preview first.");
  process.exit(1);
}
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url, "http://127.0.0.1").pathname,
    );
    const file = resolve(
      root,
      `.${pathname === "/" ? "/index.html" : pathname}`,
    );
    if (!file.startsWith(root + sep)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const body = await readFile(file);
    response.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(body);
  } catch {
    response.writeHead(404).end("Not found");
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`Matchday preview: http://127.0.0.1:${port} (Ctrl+C to stop)`),
);
