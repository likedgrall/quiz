const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

function rmDirSafe(target) {
    if (fs.existsSync(target)) {
        fs.rmSync(target, { recursive: true, force: true });
    }
}

function copyRecursive(src, dest) {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        const entries = fs.readdirSync(src);
        for (const entry of entries) {
            copyRecursive(path.join(src, entry), path.join(dest, entry));
        }
        return;
    }

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
}

rmDirSafe(distDir);
fs.mkdirSync(distDir, { recursive: true });

const requiredPaths = ["index.html", "css", "js"];
for (const relativePath of requiredPaths) {
    const src = path.join(rootDir, relativePath);
    const dest = path.join(distDir, relativePath);
    if (!fs.existsSync(src)) {
        throw new Error(`Missing build input: ${relativePath}`);
    }
    copyRecursive(src, dest);
}

console.log("Built dist for GitHub Pages");
