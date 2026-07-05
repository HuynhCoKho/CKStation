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
