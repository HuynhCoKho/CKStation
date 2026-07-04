import type { AppData, Expense, MenuItem, Order } from "../types";
import { mockData } from "./mockData";

const apiUrl = import.meta.env.VITE_API_URL as string | undefined;

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };

function adminToken() {
  return localStorage.getItem("ck_admin_token") || "";
}

async function request<T>(action: string, payload: Record<string, unknown> = {}, admin = false): Promise<T> {
  if (!apiUrl || apiUrl.includes("YOUR_DEPLOYMENT_ID")) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    return mockRequest(action, payload) as T;
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action,
      token: admin ? adminToken() : "",
      payload,
    }),
  });

  const result = (await response.json()) as ApiResponse<T>;
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
