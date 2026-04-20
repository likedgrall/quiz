const http = require("http");
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
    const envLines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of envLines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
            continue;
        }

        const separatorIndex = trimmed.indexOf("=");
        if (separatorIndex === -1) {
            continue;
        }

        const key = trimmed.slice(0, separatorIndex).trim();
        const value = trimmed.slice(separatorIndex + 1).trim();
        if (!process.env[key]) {
            process.env[key] = value;
        }
    }
}

const PORT = Number(process.env.PORT || process.env.API_PROXY_PORT || 8787);
const AI_API_URL = (process.env.AI_API_URL || "https://router.huggingface.co/v1").replace(/\/$/, "");
const AI_API_KEY = process.env.AI_API_KEY;
const AI_MODEL = process.env.AI_MODEL || "meta-llama/Llama-3.1-8B-Instruct";
const ROOT_DIR = __dirname;

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".ico": "image/x-icon",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml"
};

function sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    });
    res.end(JSON.stringify(payload));
}

function serveFile(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    fs.readFile(filePath, (error, data) => {
        if (error) {
            res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("Not found");
            return;
        }

        res.writeHead(200, { "Content-Type": contentType });
        res.end(data);
    });
}

function parseRequestBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];

        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => {
            if (!chunks.length) {
                resolve({});
                return;
            }

            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
            } catch (error) {
                reject(error);
            }
        });
        req.on("error", reject);
    });
}

const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
        });
        res.end();
        return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/health") {
        sendJson(res, 200, {
            ok: true,
            hasApiKey: Boolean(AI_API_KEY),
            model: AI_MODEL
        });
        return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/analyze") {
        if (!AI_API_KEY) {
            sendJson(res, 500, { ok: false, error: "AI_API_KEY is missing in .env" });
            return;
        }

        try {
            const body = await parseRequestBody(req);
            const messages = Array.isArray(body.messages)
                ? body.messages
                : Array.isArray(body?.payload?.messages)
                    ? body.payload.messages
                    : [];

            if (!messages.length) {
                sendJson(res, 400, { ok: false, error: "messages array is required" });
                return;
            }

            const response = await fetch(`${AI_API_URL}/chat/completions`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${AI_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: body.model || AI_MODEL,
                    messages,
                    max_tokens: 500,
                    temperature: 0.6
                })
            });

            const data = await response.json();

            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    sendJson(res, response.status, {
                        ok: false,
                        error: "Hugging Face не принял токен. Проверь AI_API_KEY в .env.",
                        raw: data
                    });
                    return;
                }
                sendJson(res, response.status, {
                    ok: false,
                    error: data?.error?.message || data?.error || "AI request failed",
                    raw: data
                });
                return;
            }

            sendJson(res, 200, {
                ok: true,
                content: data?.choices?.[0]?.message?.content || "",
                raw: data
            });
        } catch (error) {
            sendJson(res, 500, {
                ok: false,
                error: error.message || "Unexpected server error"
            });
        }

        return;
    }

    const safePath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
    const filePath = path.resolve(ROOT_DIR, `.${safePath}`);
    const rootWithSep = ROOT_DIR.endsWith(path.sep) ? ROOT_DIR : `${ROOT_DIR}${path.sep}`;

    if (!filePath.startsWith(rootWithSep)) {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Forbidden");
        return;
    }

    serveFile(res, filePath);
});

server.listen(PORT, () => {
    console.log(`Quiz site is running at http://localhost:${PORT}`);
});
