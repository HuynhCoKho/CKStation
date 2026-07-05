import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const source = join("dist", "index.html");
const target = join("dist", "Menu", "index.html");
const html = readFileSync(source, "utf8").replaceAll("./assets/", "/CKStation/assets/");

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, html);
