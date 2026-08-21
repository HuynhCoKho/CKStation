// Xuất bản bản tin hằng ngày thẳng vào trang web.
//
// Bản tin do Claude tổng hợp mỗi sáng được lưu dạng Markdown trong thư mục
// news/, script này đổi sang HTML và ghi vào public/news/ để Vite chép nguyên
// vào dist khi build. Trang chủ đọc thẳng public/news/latest.json cùng origin,
// không qua Google Drive, không qua Apps Script, không cần cấp quyền gì.
//
//   node scripts/publish-news.mjs news/2026-08-21.md
//   node scripts/publish-news.mjs news/2026-08-21.md --title "Bản tin sáng"
//   node scripts/publish-news.mjs --doc "https://docs.google.com/document/d/<id>/edit"
//   node scripts/publish-news.mjs --date 2026-08-21 < ban-tin.md
//
// Dạng --doc dành cho lúc bản tin được soạn ở nơi khác (Claude web) và nằm
// trong một Google Doc đã chia sẻ theo đường liên kết: script tải bản xuất
// Markdown về, lưu vào news/ rồi xuất bản như bình thường.
//
// Ngày lấy theo thứ tự: --date, tên file (yyyy-mm-dd), rồi tới hôm nay giờ VN.

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(repoRoot, "public", "news");
const archiveDir = join(outDir, "archive");
const maxArchive = 60;

const defaultTitle = "Bản tin tài chính - ngân hàng";

function parseArgs(argv) {
  const args = { file: "", date: "", title: "", doc: "", folder: "", onlyIfNew: false };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--date") args.date = argv[++i] || "";
    else if (item === "--title") args.title = argv[++i] || "";
    else if (item === "--doc") args.doc = argv[++i] || "";
    else if (item === "--folder") args.folder = argv[++i] || "";
    else if (item === "--only-if-new") args.onlyIfNew = true;
    else if (!item.startsWith("--") && !args.file) args.file = item;
  }
  return args;
}

// Thư mục Drive đang chia sẻ theo đường liên kết nên đọc được danh sách file mà
// không cần đăng nhập. Bản tin mới nhất là file có ngày trong tên lớn nhất, các
// file đặt tên khác (tài liệu nháp, không tiêu đề) bị bỏ qua.
async function findLatestDocInFolder(folderId) {
  const response = await fetch(`https://drive.google.com/embeddedfolderview?id=${folderId}#list`);
  if (!response.ok) {
    throw new Error(
      `Không đọc được thư mục Drive (mã lỗi ${response.status}). Kiểm tra thư mục đã chia sẻ ở chế độ 'Bất kỳ ai có đường liên kết' chưa.`,
    );
  }

  const html = await response.text();
  const entries = [];
  const pattern = /id="entry-([a-zA-Z0-9_-]+)"[\s\S]*?flip-entry-title[^>]*>([^<]*)</g;
  let match;
  while ((match = pattern.exec(html))) {
    const title = match[2].trim();
    const date = (title.match(/\d{4}-\d{2}-\d{2}/) || [""])[0];
    if (date) entries.push({ id: match[1], title, date });
  }

  if (!entries.length) {
    throw new Error("Thư mục Drive chưa có bản tin nào đặt tên bắt đầu bằng ngày dạng yyyy-mm-dd.");
  }

  entries.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
  return entries[0];
}

function currentPublishedDate() {
  const file = join(outDir, "latest.json");
  if (!existsSync(file)) return "";
  try {
    return JSON.parse(readFileSync(file, "utf8")).date || "";
  } catch {
    return "";
  }
}

// GitHub Actions đọc kết quả qua $GITHUB_OUTPUT để biết có cần commit và build
// lại hay không; chạy ngoài Actions thì bỏ qua.
function reportOutput(published, date) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  appendFileSync(file, `published=${published}\ndate=${date}\n`, "utf8");
}

function todayInVN() {
  // en-CA cho ra đúng dạng yyyy-mm-dd, khỏi tự ghép chuỗi.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

// Khi bản tin được soạn ở nơi khác (Claude web) và nằm trong một Google Doc,
// tải thẳng bản xuất Markdown về rồi lưu lại vào news/ như mọi bản tin khác.
// Doc phải đang ở chế độ "ai có đường liên kết cũng xem được".
async function readDoc(docRef) {
  const match = docRef.match(/\/document\/d\/([a-zA-Z0-9_-]+)/) || docRef.match(/^([a-zA-Z0-9_-]{20,})$/);
  if (!match) throw new Error(`Không đọc được ID tài liệu từ: ${docRef}`);

  const response = await fetch(`https://docs.google.com/document/d/${match[1]}/export?format=md`);
  if (!response.ok) {
    throw new Error(
      response.status === 401 || response.status === 403 || response.status === 404
        ? "Không mở được Google Doc. Kiểm tra tài liệu đã chia sẻ ở chế độ 'Bất kỳ ai có đường liên kết' chưa."
        : `Không tải được Google Doc (mã lỗi ${response.status}).`,
    );
  }
  return response.text();
}

async function readInput(args) {
  if (args.doc) return readDoc(args.doc);
  if (args.file) return readFileSync(resolve(repoRoot, args.file), "utf8");
  const stdin = readFileSync(0, "utf8");
  if (!stdin.trim()) throw new Error("Không có nội dung bản tin. Truyền đường dẫn file, --doc <link>, hoặc đưa nội dung qua stdin.");
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

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let docRef = args.doc;
  let dateHint = args.date;

  if (args.folder) {
    const latest = await findLatestDocInFolder(args.folder);
    console.log(`Bản tin mới nhất trong thư mục Drive: ${latest.title}`);
    docRef = latest.id;
    dateHint = dateHint || latest.date;
  }

  // Cho phép chạy định kỳ mà không xuất bản lại đúng bản tin trang đang có.
  if (args.onlyIfNew && dateHint && currentPublishedDate() === dateHint) {
    console.log(`Trang đã có bản tin ngày ${dateHint}, không cần xuất bản lại.`);
    reportOutput(false, dateHint);
    return;
  }

  const source = await readInput({ ...args, doc: docRef });
  const isHtml = /\.html?$/i.test(args.file);

  const fromName = args.file ? basename(args.file).match(/\d{4}-\d{2}-\d{2}/) : null;
  const date = dateHint || (fromName ? fromName[0] : todayInVN());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Ngày không hợp lệ: ${date}. Cần dạng yyyy-mm-dd.`);

  // Bản tin lấy từ Google Doc chưa có bản gốc trong repo, lưu lại để lần sau
  // dựng lại được HTML mà không cần mở Drive.
  if (docRef) {
    mkdirSync(join(repoRoot, "news"), { recursive: true });
    writeFileSync(join(repoRoot, "news", `${date}.md`), source, "utf8");
  }

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
  reportOutput(true, date);
}

if (!existsSync(join(repoRoot, "package.json"))) {
  throw new Error("Chạy script từ trong repo CKStation.");
}

main().catch((error) => {
  console.error(`Lỗi: ${error.message}`);
  process.exitCode = 1;
});
