/**
 * Post-processes the compiled tool set for Node.
 *
 * The source imports `./flow-standards` without an extension because that is what the Next
 * bundler resolves. Node ESM will not resolve an extensionless relative import, so the
 * compiled copy — which only Node loads — gets the extension added here. Doing it in the
 * build rather than the source is what lets one file serve both.
 */
import { readFileSync, writeFileSync, rmSync } from "node:fs";

rmSync(new URL("./types.js", import.meta.url), { force: true });

const target = new URL("./mcp-tools.js", import.meta.url);
const src = readFileSync(target, "utf8");
const fixed = src.replace(/from ["']\.\/flow-standards["']/g, 'from "./flow-standards.js"');
if (fixed !== src) writeFileSync(target, fixed);
console.log(fixed === src ? "mcp: imports already resolved" : "mcp: import extension added");
