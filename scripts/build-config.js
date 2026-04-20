const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const envPath = path.join(rootDir, ".env");
const outputPath = path.join(rootDir, "js", "config.js");

function readDotEnv(filePath) {
    const map = {};
    if (!fs.existsSync(filePath)) {
        return map;
    }

    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
            continue;
        }

        const index = trimmed.indexOf("=");
        if (index === -1) {
            continue;
        }

        const key = trimmed.slice(0, index).trim();
        const value = trimmed.slice(index + 1).trim();
        map[key] = value;
    }

    return map;
}

function pick(env, ...keys) {
    for (const key of keys) {
        const value = env[key];
        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
    }
    return "";
}

function toJsString(value) {
    return JSON.stringify(String(value || ""));
}

const fileEnv = readDotEnv(envPath);
const env = { ...fileEnv, ...process.env };

const config = {
    API_BASE_URL: pick(env, "API_BASE_URL"),
    HF_API_KEY: pick(env, "FRONTEND_HF_API_KEY", "HF_API_KEY", "AI_API_KEY"),
    AI_MODEL: pick(env, "AI_MODEL") || "meta-llama/Llama-3.1-8B-Instruct"
};

const content = `window.APP_CONFIG = {
    API_BASE_URL: ${toJsString(config.API_BASE_URL)},
    HF_API_KEY: ${toJsString(config.HF_API_KEY)},
    AI_MODEL: ${toJsString(config.AI_MODEL)}
};
`;

fs.writeFileSync(outputPath, content, "utf8");
console.log(`Generated ${path.relative(rootDir, outputPath)}`);
