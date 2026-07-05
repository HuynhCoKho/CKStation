import type { AppData, Expense, MenuItem, Order } from "../types";
import { mockData } from "./mockData";

const apiUrl = ((import.meta.env.VITE_API_URL as string | undefined) || "").replace(/^\uFEFF/, "").trim();

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };

function adminToken() {
  return localStorage.getItem("ck_admin_token") || "";
}

async function request<T>(action: string, payload: Record<string, unknown> = {}, admin = false): Promise<T> {
  if (!apiUrl || apiUrl.includes("YOUR_DEPLOYMENT_ID")) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    return mockRequest(action, payload) as T;
  }

  const result = await jsonp<ApiResponse<T>>(apiUrl, {
    action,
    token: admin ? adminToken() : "",
    payload: JSON.stringify(payload),
  });
  if (!result.ok) throw new Error(result.error || "Không xử lý được yêu cầu.");
  return result.data;
}

export const api = {
  loadData: () => request<AppData>("loadData"),
  createOrder: (order: Pick<Order, "tableNumber" | "customerName" | "items">) =>
    request<Order>("createOrder", { order }),
  saveMenuItem: (item: Partial<MenuItem>) => request<MenuItem>("saveMenuItem", { item }, true),
  deleteMenuItem: (id: string) => request<MenuItem>("deleteMenuItem", { id }, true),
  updateOrder: (order: Order) => request<Order>("updateOrder", { order }, true),
  addExpense: (expense: Omit<Expense, "id">) => request<Expense>("addExpense", { expense }, true),
  setTableCount: (tableCount: number) => request<number>("setTableCount", { tableCount }, true),
};

function mockRequest(action: string, payload: Record<string, unknown>) {
  const data = JSON.parse(JSON.stringify(mockData)) as AppData;
  if (action === "loadData") return data;
  if (action === "createOrder") return { id: crypto.randomUUID(), ...(payload.order as object) };
  if (action === "saveMenuItem") return { id: crypto.randomUUID(), active: true, ...(payload.item as object) };
  if (action === "deleteMenuItem") return data.menu[0];
  if (action === "updateOrder") return payload.order;
  if (action === "addExpense") return { id: crypto.randomUUID(), ...(payload.expense as object) };
  if (action === "setTableCount") return payload.tableCount;
  return data;
}

function jsonp<T>(url: string, params: Record<string, string>): Promise<T> {
  return new Promise((resolve, reject) => {
    const callback = `ckstation_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Không kết nối được Apps Script."));
    }, 15000);

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
      reject(new Error("Không tải được Apps Script."));
    };
    script.src = target.toString();
    document.head.appendChild(script);
  });
}
