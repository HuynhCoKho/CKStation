export type MenuItem = {
  id: string;
  name: string;
  category: string;
  price: number;
  active: boolean;
};

export type OrderItem = {
  id: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  note: string;
  status: "new" | "preparing" | "served" | "cancelled";
};

export type Order = {
  id: string;
  tableNumber: number;
  customerName: string;
  status: "open" | "paid" | "cancelled";
  createdAt: string;
  paidAt: string;
  items: OrderItem[];
  total: number;
};

export type Expense = {
  id: string;
  date: string;
  name: string;
  amount: number;
  note: string;
};

export type DailyStats = {
  date: string;
  revenue: number;
  expense: number;
  profit: number;
  paidOrders: number;
};

export type AppData = {
  menu: MenuItem[];
  orders: Order[];
  expenses: Expense[];
  stats: DailyStats;
  tableCount: number;
};
