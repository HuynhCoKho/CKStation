import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const source = join("dist", "index.html");
const menuIndex = join("dist", "Menu", "index.html");
const menuHtml = join("dist", "Menu.html");
const html = readFileSync(source, "utf8");

mkdirSync(dirname(menuIndex), { recursive: true });
writeFileSync(menuIndex, html);
writeFileSync(menuHtml, html);
