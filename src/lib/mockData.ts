import type { AppData } from "../types";
import { todayKey } from "./money";

export const mockData: AppData = {
  tableCount: 12,
  tableNames: ["Bàn 1", "Bàn 2", "Hoa Mai", "Hoa Đào", "Sân vườn"],
  menu: [
    { id: "cf-den", name: "Cafe đen", category: "Cafe", price: 22000, active: true },
    { id: "cf-sua", name: "Cafe sữa", category: "Cafe", price: 25000, active: true },
    { id: "bac-xiu", name: "Bạc xỉu", category: "Cafe", price: 28000, active: true },
    { id: "tra-dao", name: "Trà đào", category: "Trà", price: 32000, active: true },
    { id: "matcha", name: "Matcha đá xay", category: "Đá xay", price: 42000, active: true },
    { id: "banh-mi", name: "Bánh mì trứng", category: "Đồ ăn", price: 25000, active: true },
  ],
  orders: [
    {
      id: "demo-1",
      tableNumber: "Hoa Mai",
      customerName: "Hoa Mai",
      status: "open",
      createdAt: new Date().toISOString(),
      paidAt: "",
      total: 79000,
      items: [
        {
          id: "demo-i1",
          menuItemId: "cf-sua",
          name: "Cafe sữa",
          price: 25000,
          quantity: 2,
          note: "ít đá",
          status: "served",
        },
        {
          id: "demo-i2",
          menuItemId: "banh-mi",
          name: "Bánh mì trứng",
          price: 25000,
          quantity: 1,
          note: "không cay",
          status: "preparing",
        },
      ],
    },
  ],
  expenses: [{ id: "demo-e1", date: todayKey(), name: "Sữa tươi", amount: 180000, note: "nhập sáng" }],
  stats: { date: todayKey(), revenue: 0, expense: 180000, profit: -180000, paidOrders: 0 },
};
