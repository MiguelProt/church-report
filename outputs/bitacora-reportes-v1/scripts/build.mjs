import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "dist");

async function loadEnvFile() {
  try {
    const content = await readFile(resolve(root, ".env"), "utf8");
    return Object.fromEntries(content.split(/\r?\n/).flatMap((line) => {
      const clean = line.trim();
      if (!clean || clean.startsWith("#") || !clean.includes("=")) return [];
      const separator = clean.indexOf("=");
      return [[clean.slice(0, separator).trim(), clean.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "")]];
    }));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

const fileEnv = await loadEnvFile();
const apiUrl = process.env.APPS_SCRIPT_WEB_APP_URL || fileEnv.APPS_SCRIPT_WEB_APP_URL;

if (!apiUrl || !/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(apiUrl)) {
  throw new Error("Define APPS_SCRIPT_WEB_APP_URL con una URL válida terminada en /exec.");
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(["index.html", "styles.css", "app.js"].map((file) => cp(resolve(root, file), resolve(output, file))));
await writeFile(resolve(output, "config.js"), `window.REPORT_APP_CONFIG = ${JSON.stringify({ apiUrl })};\n`, "utf8");

console.log("Sitio generado en dist/");

