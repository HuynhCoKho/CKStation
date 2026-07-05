import { ClipboardList, Coffee, LockKeyhole, Plus, ReceiptText, RefreshCw, Save, Settings, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "./lib/api";
import { formatMoney, todayKey } from "./lib/money";
import type { AppData, Expense, MenuItem, Order, OrderItem } from "./types";

type View = "customer" | "admin";

export function App() {
  const isPublicMenu = window.location.pathname.toLowerCase().endsWith("/menu");
  const [view, setView] = useState<View>("customer");
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setData(await api.loadData());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được dữ liệu.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <main>
      <header className="topbar">
        <button className="brand" onClick={() => setView("customer")} aria-label="CK Station">
          <Coffee size={26} />
          <span>CK Station</span>
        </button>
        {!isPublicMenu && (
          <nav className="tabs">
            <button className={view === "customer" ? "active" : ""} onClick={() => setView("customer")}>
              <Coffee size={18} /> Khách hàng
            </button>
            <button className={view === "admin" ? "active" : ""} onClick={() => setView("admin")}>
              <Settings size={18} /> Quản lý
            </button>
            <button onClick={refresh} aria-label="Tải lại">
              <RefreshCw size={18} />
            </button>
          </nav>
        )}
      </header>

      {error && <p className="alert">{error}</p>}
      {loading && <p className="loading">Đang tải dữ liệu...</p>}
      {!loading && data && (isPublicMenu || view === "customer") && <CustomerPage data={data} onChanged={refresh} />}
      {!loading && data && !isPublicMenu && view === "admin" && <AdminPage data={data} onChanged={refresh} />}
    </main>
  );
}

function CustomerPage({ data, onChanged }: { data: AppData; onChanged: () => void }) {
  const activeMenu = data.menu.filter((item) => item.active);
  const categories = Array.from(new Set(activeMenu.map((item) => item.category)));
  const [category, setCategory] = useState(categories[0] || "");
  const [tableNumber, setTableNumber] = useState(1);
  const [customerName, setCustomerName] = useState("");
  const [cart, setCart] = useState<OrderItem[]>([]);
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  function addToCart(item: MenuItem) {
    setCart((items) => {
      const found = items.find((cartItem) => cartItem.menuItemId === item.id);
      if (found) {
        return items.map((cartItem) =>
          cartItem.menuItemId === item.id ? { ...cartItem, quantity: cartItem.quantity + 1 } : cartItem,
        );
      }
      return [
        ...items,
        {
          id: crypto.randomUUID(),
          menuItemId: item.id,
          name: item.name,
          price: item.price,
          quantity: 1,
          note: "",
          status: "new",
        },
      ];
    });
  }

  async function submitOrder(event: FormEvent) {
    event.preventDefault();
    if (!cart.length) return;
    await api.createOrder({ tableNumber, customerName: customerName || `Bàn ${tableNumber}`, items: cart });
    setCart([]);
    setCustomerName("");
    onChanged();
  }

  return (
    <section className="layout">
      <div className="menu-pane">
        <div className="section-title">
          <h1>Menu hôm nay</h1>
          <p>{activeMenu.length} món đang bán</p>
        </div>
        <div className="chips">
          {categories.map((name) => (
            <button key={name} className={category === name ? "selected" : ""} onClick={() => setCategory(name)}>
              {name}
            </button>
          ))}
        </div>
        <div className="menu-grid">
          {activeMenu
            .filter((item) => !category || item.category === category)
            .map((item) => (
              <button className="menu-item" key={item.id} onClick={() => addToCart(item)}>
                <span>{item.name}</span>
                <strong>{formatMoney(item.price)}</strong>
                <Plus size={18} />
              </button>
            ))}
        </div>
      </div>

      <form className="order-pane" onSubmit={submitOrder}>
        <div className="section-title">
          <h2>Món đã chọn</h2>
          <p>{formatMoney(total)}</p>
        </div>
        <label>
          Bàn
          <input type="number" min={1} max={data.tableCount} value={tableNumber} onChange={(e) => setTableNumber(Number(e.target.value))} />
        </label>
        <label>
          Tên khách
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Không bắt buộc" />
        </label>
        <div className="cart-list">
          {cart.map((item) => (
            <article className="cart-row" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <span>{formatMoney(item.price)}</span>
              </div>
              <input
                aria-label="Số lượng"
                type="number"
                min={1}
                value={item.quantity}
                onChange={(e) =>
                  setCart((items) => items.map((cartItem) => (cartItem.id === item.id ? { ...cartItem, quantity: Number(e.target.value) } : cartItem)))
                }
              />
              <input
                value={item.note}
                onChange={(e) => setCart((items) => items.map((cartItem) => (cartItem.id === item.id ? { ...cartItem, note: e.target.value } : cartItem)))}
                placeholder="Ít đá, ít ngọt..."
              />
              <button type="button" onClick={() => setCart((items) => items.filter((cartItem) => cartItem.id !== item.id))} aria-label="Xóa món">
                <Trash2 size={16} />
              </button>
            </article>
          ))}
        </div>
        <button className="primary" disabled={!cart.length}>
          <ReceiptText size={18} /> Gửi đơn
        </button>
      </form>
    </section>
  );
}

function AdminPage({ data, onChanged }: { data: AppData; onChanged: () => void }) {
  const [token, setToken] = useState(localStorage.getItem("ck_admin_token") || "");
  const [menuDraft, setMenuDraft] = useState<Partial<MenuItem>>({ active: true });
  const [expense, setExpense] = useState<Omit<Expense, "id">>({ date: todayKey(), name: "", amount: 0, note: "" });
  const openOrders = data.orders.filter((order) => order.status === "open");
  const tableMap = useMemo(() => {
    return Array.from({ length: data.tableCount }, (_, index) => {
      const tableNumber = index + 1;
      return { tableNumber, orders: openOrders.filter((order) => order.tableNumber === tableNumber) };
    });
  }, [data.tableCount, openOrders]);

  function saveToken() {
    localStorage.setItem("ck_admin_token", token);
  }

  async function saveMenu(event: FormEvent) {
    event.preventDefault();
    await api.saveMenuItem(menuDraft);
    setMenuDraft({ active: true });
    onChanged();
  }

  async function saveExpense(event: FormEvent) {
    event.preventDefault();
    await api.addExpense(expense);
    setExpense({ date: todayKey(), name: "", amount: 0, note: "" });
    onChanged();
  }

  async function updateOrder(order: Order, status: Order["status"]) {
    await api.updateOrder({ ...order, status, paidAt: status === "paid" ? new Date().toISOString() : order.paidAt });
    onChanged();
  }

  return (
    <section className="admin-layout">
      <aside className="admin-side">
        <div className="stat-row">
          <span>Doanh thu</span>
          <strong>{formatMoney(data.stats.revenue)}</strong>
        </div>
        <div className="stat-row">
          <span>Chi phí</span>
          <strong>{formatMoney(data.stats.expense)}</strong>
        </div>
        <div className="stat-row accent">
          <span>Lợi nhuận</span>
          <strong>{formatMoney(data.stats.profit)}</strong>
        </div>
        <label>
          Mã quản trị
          <input value={token} onChange={(e) => setToken(e.target.value)} type="password" placeholder="ADMIN_TOKEN" />
        </label>
        <button onClick={saveToken}>
          <LockKeyhole size={18} /> Lưu mã
        </button>
        <label>
          Số bàn phục vụ
          <input
            type="number"
            min={1}
            value={data.tableCount}
            onChange={(e) => api.setTableCount(Number(e.target.value)).then(onChanged)}
          />
        </label>
      </aside>

      <div className="admin-main">
        <div className="section-title">
          <h1>Bàn đang phục vụ</h1>
          <p>{openOrders.length} đơn mở</p>
        </div>
        <div className="table-grid">
          {tableMap.map(({ tableNumber, orders }) => (
            <article className={`table-card ${orders.length ? "busy" : ""}`} key={tableNumber}>
              <h3>Bàn {tableNumber}</h3>
              {!orders.length && <p>Trống</p>}
              {orders.map((order) => (
                <div className="bill" key={order.id}>
                  {order.items.map((item) => (
                    <div className="bill-line" key={item.id}>
                      <span>{item.quantity} x {item.name}</span>
                      <small>{item.note || item.status}</small>
                    </div>
                  ))}
                  <strong>{formatMoney(order.total)}</strong>
                  <div className="actions">
                    <button onClick={() => updateOrder(order, "paid")}>Tính tiền</button>
                    <button onClick={() => updateOrder(order, "cancelled")}>Hủy</button>
                  </div>
                </div>
              ))}
            </article>
          ))}
        </div>

        <div className="tools-grid">
          <form className="tool-panel" onSubmit={saveMenu}>
            <h2><ClipboardList size={20} /> Menu</h2>
            <input value={menuDraft.name || ""} onChange={(e) => setMenuDraft({ ...menuDraft, name: e.target.value })} placeholder="Tên món" required />
            <input value={menuDraft.category || ""} onChange={(e) => setMenuDraft({ ...menuDraft, category: e.target.value })} placeholder="Nhóm món" required />
            <input
              type="number"
              value={menuDraft.price || ""}
              onChange={(e) => setMenuDraft({ ...menuDraft, price: Number(e.target.value) })}
              placeholder="Giá"
              required
            />
            <label className="check">
              <input
                type="checkbox"
                checked={menuDraft.active !== false}
                onChange={(e) => setMenuDraft({ ...menuDraft, active: e.target.checked })}
              />
              Đang bán
            </label>
            <button className="primary"><Save size={18} /> Lưu món</button>
            <div className="menu-admin-list">
              {data.menu.map((item) => (
                <div className="menu-admin-row" key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.category} · {formatMoney(item.price)} · {item.active ? "Đang bán" : "Đã ẩn"}</span>
                  </div>
                  <button type="button" onClick={() => setMenuDraft(item)}>Sửa</button>
                  <button type="button" onClick={() => api.deleteMenuItem(item.id).then(onChanged)}>Ẩn</button>
                </div>
              ))}
            </div>
          </form>

          <form className="tool-panel" onSubmit={saveExpense}>
            <h2><ReceiptText size={20} /> Chi phí</h2>
            <input type="date" value={expense.date} onChange={(e) => setExpense({ ...expense, date: e.target.value })} />
            <input value={expense.name} onChange={(e) => setExpense({ ...expense, name: e.target.value })} placeholder="Tên chi phí" required />
            <input type="number" value={expense.amount || ""} onChange={(e) => setExpense({ ...expense, amount: Number(e.target.value) })} placeholder="Số tiền" required />
            <input value={expense.note} onChange={(e) => setExpense({ ...expense, note: e.target.value })} placeholder="Ghi chú" />
            <button className="primary"><Save size={18} /> Ghi chi phí</button>
          </form>
        </div>
      </div>
    </section>
  );
}
