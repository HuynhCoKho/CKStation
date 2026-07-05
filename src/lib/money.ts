export function formatMoney(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateVN(value: string) {
  const date = String(value || "").slice(0, 10);
  const parts = date.split("-");
  if (parts.length !== 3) return value || "";
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function formatMonthVN(value: string) {
  const parts = String(value || "").split("-");
  if (parts.length !== 2) return value || "";
  return `${parts[1]}/${parts[0]}`;
}

export function parseDateVN(value: string) {
  const raw = String(value || "").trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const vn = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const year = iso ? Number(iso[1]) : vn ? Number(vn[3]) : 0;
  const month = iso ? Number(iso[2]) : vn ? Number(vn[2]) : 0;
  const day = iso ? Number(iso[3]) : vn ? Number(vn[1]) : 0;
  const date = new Date(year, month - 1, day);
  if (!year || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseMonthVN(value: string) {
  const raw = String(value || "").trim();
  const iso = raw.match(/^(\d{4})-(\d{2})$/);
  const vn = raw.match(/^(\d{1,2})\/(\d{4})$/);
  const year = iso ? Number(iso[1]) : vn ? Number(vn[2]) : 0;
  const month = iso ? Number(iso[2]) : vn ? Number(vn[1]) : 0;
  if (!year || month < 1 || month > 12) return "";
  return `${year}-${String(month).padStart(2, "0")}`;
}
