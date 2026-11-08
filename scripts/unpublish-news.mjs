// Gỡ một bản tin theo ngày khỏi trang CK Station.
// Bản Google Doc gốc trên Drive không bị xóa. Nếu gỡ bản mới nhất, latest.json
// trỏ về bản lưu gần nhất còn lại để trang không bị trống.

import { appendFileSync, existsSync, readFileSync, rmSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const newsDir = join(repoRoot, "public", "news");
const archiveDir = join(newsDir, "archive");
const maxArchive = 60;

function parseArgs(argv) {
  const args = { date: "" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--date") args.date = argv[++i] || "";
  }
  return args;
}

function reportOutput(published, date) {
  const file = process.env.GITHUB_OUTPUT;
  if (file) appendFileSync(file, `published=${published}\ndate=${date}\n`, "utf8");
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function main() {
  const { date } = parseArgs(process.argv.slice(2));
  if (!validDate(date)) throw new Error("Cần truyền ngày hợp lệ theo dạng YYYY-MM-DD bằng --date.");

  const archiveFile = join(archiveDir, `${date}.json`);
  const latestFile = join(newsDir, "latest.json");
  if (!existsSync(archiveFile)) throw new Error(`Không tìm thấy bản tin lưu ngày ${date}; không thay đổi dữ liệu.`);

  const latest = existsSync(latestFile) ? JSON.parse(readFileSync(latestFile, "utf8")) : null;
  rmSync(archiveFile);

  const archivedDates = readdirSync(archiveDir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .map((name) => name.slice(0, 10))
    .sort()
    .reverse();

  const index = archivedDates.slice(0, maxArchive).map((day) => {
    const item = JSON.parse(readFileSync(join(archiveDir, `${day}.json`), "utf8"));
    return { date: item.date, title: item.title };
  });
  writeFileSync(join(newsDir, "index.json"), JSON.stringify(index), "utf8");

  if (latest?.date === date) {
    if (archivedDates.length) {
      const restored = readFileSync(join(archiveDir, `${archivedDates[0]}.json`), "utf8");
      writeFileSync(latestFile, restored, "utf8");
      console.log(`Đã gỡ bản tin ${date}; trang chính đã khôi phục bản ${archivedDates[0]}.`);
    } else {
      rmSync(latestFile, { force: true });
      console.log(`Đã gỡ bản tin ${date}; hiện không còn bản lưu nào để hiển thị.`);
    }
  } else {
    console.log(`Đã gỡ bản tin lưu ngày ${date}; bản tin mới nhất trên trang không thay đổi.`);
  }

  reportOutput(true, date);
}

if (!existsSync(join(repoRoot, "package.json"))) throw new Error("Chạy script từ trong repo CKStation.");
try {
  main();
} catch (error) {
  console.error(`Lỗi: ${error.message}`);
  process.exitCode = 1;
}
