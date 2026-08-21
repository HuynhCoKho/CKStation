import type { AppData, Expense, LinkItem, MenuItem, Order, TableState } from "../types";
import { mockData } from "./mockData";

// Bien moi truong dan tu file co BOM se mang ky tu vo hinh o dau, lam hong URL.
const byteOrderMark = 0xfeff;
const rawApiUrl = ((import.meta.env.VITE_API_URL as string | undefined) || "").trim();
const defaultApiUrl = "https://script.google.com/macros/s/AKfycbwmFrMNlZoi9m9haEapcgQ5wlOMA1BVboQVqygJf57WdOy2KKlq_kGguWIxHVvoXYe_/exec";
const apiUrl = (rawApiUrl.charCodeAt(0) === byteOrderMark ? rawApiUrl.slice(1) : rawApiUrl).trim() || defaultApiUrl;

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };

export type DailyNews = {
  title: string;
  updatedAt: string;
  isToday: boolean;
  html: string;
  docUrl: string;
};

function adminToken() {
  return sessionStorage.getItem("ck_admin_token") || localStorage.getItem("ck_admin_token") || "";
}

async function request<T>(action: string, payload: Record<string, unknown> = {}, admin = false, tokenOverride = ""): Promise<T> {
  if (!apiUrl || apiUrl.includes("YOUR_DEPLOYMENT_ID")) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    return mockRequest(action, payload) as T;
  }

  const result = await jsonp<ApiResponse<T>>(apiUrl, {
    action,
    token: admin ? tokenOverride || adminToken() : "",
    payload: JSON.stringify(payload),
  });
  if (!result.ok) throw new Error(result.error || "Không xử lý được yêu cầu.");
  return result.data;
}

export const api = {
  loadData: (admin = false) => request<AppData>("loadData", {}, admin),
  getDailyNews: () => request<DailyNews>("getDailyNews", {}),
  verifyAdmin: (token: string) => request<boolean>("verifyAdmin", {}, true, token),
  createOrder: (order: Pick<Order, "tableNumber" | "customerName" | "items">) =>
    request<Order>("createOrder", { order }),
  saveMenuItem: (item: Partial<MenuItem>) => request<MenuItem>("saveMenuItem", { item }, true),
  deleteMenuItem: (id: string) => request<MenuItem>("deleteMenuItem", { id }, true),
  removeMenuItem: (id: string) => request<MenuItem>("removeMenuItem", { id }, true),
  saveLink: (link: Partial<LinkItem>) => request<LinkItem>("saveLink", { link }, true),
  removeLink: (id: string) => request<LinkItem>("removeLink", { id }, true),
  updateOrder: (order: Order) => request<Order>("updateOrder", { order }, true),
  addExpense: (expense: Omit<Expense, "id">) => request<Expense>("addExpense", { expense }, true),
  saveExpense: (expense: Partial<Expense>) => request<Expense>("saveExpense", { expense }, true),
  removeExpense: (id: string) => request<Expense>("removeExpense", { id }, true),
  setTableCount: (tableCount: number) => request<number>("setTableCount", { tableCount }, true),
  setTableNames: (tableNames: string[]) => request<string[]>("setTableNames", { tableNames }, true),
  setTables: (tables: TableState[]) => request<TableState[]>("setTables", { tables }, true),
  setCategories: (categories: string[]) => request<string[]>("setCategories", { categories }, true),
};

function mockRequest(action: string, payload: Record<string, unknown>) {
  const data = JSON.parse(JSON.stringify(mockData)) as AppData;
  if (action === "loadData") return data;
  if (action === "getDailyNews")
    return {
      title: "Bản tin mẫu (chế độ xem thử)",
      updatedAt: new Date().toISOString(),
      isToday: true,
      html: "<p>Đây là nội dung bản tin mẫu hiển thị khi chưa kết nối Apps Script thật.</p>",
      docUrl: "",
    } as DailyNews;
  if (action === "verifyAdmin") return Boolean(adminToken());
  if (action === "createOrder") return { id: crypto.randomUUID(), ...(payload.order as object) };
  if (action === "saveMenuItem") return { id: crypto.randomUUID(), active: true, ...(payload.item as object) };
  if (action === "deleteMenuItem") return data.menu[0];
  if (action === "removeMenuItem") return data.menu[0];
  if (action === "saveLink") return { id: crypto.randomUUID(), active: true, ...(payload.link as object) };
  if (action === "removeLink") return data.links[0];
  if (action === "updateOrder") return payload.order;
  if (action === "addExpense") return { id: crypto.randomUUID(), ...(payload.expense as object) };
  if (action === "saveExpense") return { id: crypto.randomUUID(), ...(payload.expense as object) };
  if (action === "removeExpense") return data.expenses[0];
  if (action === "setTableCount") return payload.tableCount;
  if (action === "setTableNames") return payload.tableNames;
  if (action === "setTables") return payload.tables;
  if (action === "setCategories") return payload.categories;
  return data;
}

// Apps Script phải mở bảng tính trước khi trả lời nên request đầu ngày có thể
// chậm hơn nhiều so với lúc bảng còn ít dòng. Thời gian chờ cần rộng hơn chu kỳ
// tự tải lại, nếu không mọi lần tải sẽ hết giờ ngay khi dữ liệu lớn dần.
const requestTimeoutMs = 45000;

function jsonp<T>(url: string, params: Record<string, string>): Promise<T> {
  return new Promise((resolve, reject) => {
    const callback = `ckstation_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Apps Script không trả lời sau 45 giây. Mở link Apps Script trực tiếp để kiểm tra deployment còn sống và còn quyền truy cập."));
    }, requestTimeoutMs);

    function cleanup() {
      window.clearTimeout(timeout);
      delete (window as unknown as Record<string, unknown>)[callback];
      script.remove();
    }

    (window as unknown as Record<string, (value: T) => void>)[callback] = (value) => {
      cleanup();
      resolve(value);
    };

    const target = new URL(url);
    target.searchParams.set("callback", callback);
    Object.entries(params).forEach(([key, value]) => target.searchParams.set(key, value));
    script.onerror = () => {
      cleanup();
      reject(new Error("Không tải được Apps Script. Kiểm tra đường mạng và địa chỉ deployment."));
    };
    script.src = target.toString();
    document.head.appendChild(script);
  });
}
