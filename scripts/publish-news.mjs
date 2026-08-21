// Xuất bản bản tin hằng ngày thẳng vào trang web.
//
// Bản tin do Claude tổng hợp mỗi sáng được lưu dạng Markdown trong thư mục
// news/, script này đổi sang HTML và ghi vào public/news/ để Vite chép nguyên
// vào dist khi build. Trang chủ đọc thẳng public/news/latest.json cùng origin,
// không qua Google Drive, không qua Apps Script, không cần cấp quyền gì.
//
//   node scripts/publish-news.mjs news/2026-08-21.md
//   node scripts/publish-news.mjs news/2026-08-21.md --title "Bản tin sáng"
//   node scripts/publish-news.mjs --date 2026-08-21 < ban-tin.md
//
// Ngày lấy theo thứ tự: --date, tên file (yyyy-mm-dd), rồi tới hôm nay giờ VN.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(repoRoot, "public", "news");
const archiveDir = join(outDir, "archive");
const maxArchive = 60;

const defaultTitle = "Bản tin tài chính - ngân hàng";

function parseArgs(argv) {
  const args = { file: "", date: "", title: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--date") args.date = argv[++i] || "";
    else if (item === "--title") args.title = argv[++i] || "";
    else if (!item.startsWith("--") && !args.file) args.file = item;
  }
  return args;
}

function todayInVN() {
  // en-CA cho ra đúng dạng yyyy-mm-dd, khỏi tự ghép chuỗi.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

function readInput(file) {
  if (file) return readFileSync(resolve(repoRoot, file), "utf8");
  const stdin = readFileSync(0, "utf8");
  if (!stdin.trim()) throw new Error("Không có nội dung bản tin. Truyền đường dẫn file hoặc đưa nội dung qua stdin.");
  return stdin;
}

// ---------- Markdown -> HTML ----------

const escapeSlot = String.fromCharCode(1); // moc tam, ky tu dieu khien khong co trong ban tin

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isSafeUrl(url) {
  const value = url.trim().toLowerCase();
  if (value.startsWith("javascript:") || value.startsWith("data:") || value.startsWith("vbscript:")) return false;
  return true;
}

function inline(text) {
  let out = escapeHtml(text);

  // Giữ chỗ cho ký tự bị thoát bằng dấu chéo ngược để chúng không bị hiểu là
  // cú pháp Markdown (bản tin dùng nhiều \[, \+, \-, \~ trong bảng số liệu).
  out = out.replace(/\\([\\`*_{}[\]()#+\-.!|~>])/g, (_match, char) => `${escapeSlot}${char.charCodeAt(0)}${escapeSlot}`);

  out = out.replace(/`([^`]+)`/g, (_match, code) => `<code>${code}</code>`);

  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (match, label, url) =>
    isSafeUrl(url) ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>` : match,
  );

  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");

  return out.replace(new RegExp(`${escapeSlot}(\\d+)${escapeSlot}`, "g"), (_match, code) => String.fromCharCode(Number(code)));
}

function splitTableRow(line) {
  const cells = [];
  let current = "";
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  for (let i = 0; i < trimmed.length; i += 1) {
    const char = trimmed[i];
    if (char === "\\" && trimmed[i + 1] === "|") {
      current += "\\|";
      i += 1;
    } else if (char === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

const tableDivider = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function alignmentOf(cell) {
  const value = cell.trim();
  if (value.startsWith(":") && value.endsWith(":")) return "center";
  if (value.endsWith(":")) return "right";
  return "";
}

function renderCell(tag, text, align) {
  const style = align ? ` style="text-align:${align}"` : "";
  return `<${tag}${style}>${inline(text)}</${tag}>`;
}

function isListStart(line) {
  return /^\s*([-*+]|\d+[.)])\s+/.test(line);
}

function isBlockStart(line) {
  return (
    !line.trim() ||
    /^\s{0,3}#{1,6}\s+/.test(line) ||
    /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line) ||
    /^\s*>\s?/.test(line) ||
    isListStart(line) ||
    /^\s*\|.*\|\s*$/.test(line)
  );
}

function renderParagraph(lines) {
  const parts = lines.map((line) => ({ text: line.trim(), hardBreak: /\s{2,}$/.test(line) }));
  const html = parts
    .map((part, index) => {
      if (index === parts.length - 1) return inline(part.text);
      return inline(part.text) + (part.hardBreak ? "<br />" : " ");
    })
    .join("");
  return `<p>${html}</p>`;
}

function mdToHtml(markdown) {
  const lines = markdown.replace(/\r\n?/g, "\n").replace(/^﻿/, "").split("\n");
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push("<hr />");
      i += 1;
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2].replace(/\s+#+\s*$/, "").trim())}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line) && tableDivider.test(lines[i + 1] || "")) {
      const headers = splitTableRow(line);
      const aligns = splitTableRow(lines[i + 1]).map(alignmentOf);
      i += 2;
      const body = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        body.push(splitTableRow(lines[i]));
        i += 1;
      }
      const head = headers.map((cell, index) => renderCell("th", cell, aligns[index] || "")).join("");
      const rows = body
        .map((cells) => `<tr>${cells.map((cell, index) => renderCell("td", cell, aligns[index] || "")).join("")}</tr>`)
        .join("");
      out.push(`<div class="news-table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`);
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quoted = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoted.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      out.push(`<blockquote>${mdToHtml(quoted.join("\n"))}</blockquote>`);
      continue;
    }

    if (isListStart(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items = [];
      while (i < lines.length && isListStart(lines[i])) {
        let text = lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, "");
        i += 1;
        // Dòng nối tiếp của một mục (không rỗng, không mở block mới) được gộp
        // vào chính mục đó thay vì tách thành đoạn riêng.
        while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
          text += ` ${lines[i].trim()}`;
          i += 1;
        }
        items.push(`<li>${inline(text.trim())}</li>`);
      }
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }

    const paragraph = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      paragraph.push(lines[i]);
      i += 1;
    }
    if (paragraph.length) out.push(renderParagraph(paragraph));
    else i += 1;
  }

  return out.join("\n");
}

// Bản tin viết sẵn bằng HTML vẫn dùng được, nhưng phải bỏ script và thuộc tính
// on* trước khi đưa vào trang.
function sanitizeHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .trim();
}

function extractTitle(markdown) {
  const match = markdown.match(/^\s{0,3}#\s+(.+)$/m);
  if (!match) return "";
  return match[1].replace(/\s+#+\s*$/, "").replace(/\*\*/g, "").trim();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = readInput(args.file);
  const isHtml = /\.html?$/i.test(args.file);

  const fromName = args.file ? basename(args.file).match(/\d{4}-\d{2}-\d{2}/) : null;
  const date = args.date || (fromName ? fromName[0] : todayInVN());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Ngày không hợp lệ: ${date}. Cần dạng yyyy-mm-dd.`);

  const html = isHtml ? sanitizeHtml(source) : mdToHtml(source);
  if (!html.trim()) throw new Error("Nội dung bản tin rỗng sau khi chuyển đổi.");

  const title = args.title || (isHtml ? defaultTitle : extractTitle(source)) || defaultTitle;
  const bulletin = { date, title, publishedAt: new Date().toISOString(), html };

  mkdirSync(archiveDir, { recursive: true });
  writeFileSync(join(archiveDir, `${date}.json`), JSON.stringify(bulletin), "utf8");
  writeFileSync(join(outDir, "latest.json"), JSON.stringify(bulletin), "utf8");

  const archived = readdirSync(archiveDir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .map((name) => name.slice(0, 10))
    .sort()
    .reverse();

  const index = archived.slice(0, maxArchive).map((day) => {
    const item = JSON.parse(readFileSync(join(archiveDir, `${day}.json`), "utf8"));
    return { date: item.date, title: item.title };
  });
  writeFileSync(join(outDir, "index.json"), JSON.stringify(index), "utf8");

  const sizeKb = (Buffer.byteLength(JSON.stringify(bulletin), "utf8") / 1024).toFixed(1);
  console.log(`Đã xuất bản bản tin ${date} - "${title}" (${sizeKb} KB).`);
  console.log(`  ${join("public", "news", "latest.json")}`);
  console.log(`  ${join("public", "news", "archive", `${date}.json`)}`);
}

if (!existsSync(join(repoRoot, "package.json"))) {
  throw new Error("Chạy script từ trong repo CKStation.");
}

main();
