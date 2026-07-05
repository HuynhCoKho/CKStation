import { ClipboardList, Coffee, LockKeyhole, Plus, ReceiptText, RefreshCw, Save, Settings, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "./lib/api";
import { formatMoney, todayKey } from "./lib/money";
import type { AppData, Expense, MenuItem, Order, OrderItem, TableState } from "./types";

type View = "customer" | "admin";
const cacheKey = "ckstation_cached_data";

function readCachedData() {
  try {
    const raw = localStorage.getItem(cacheKey);
    return raw ? normalizeData(JSON.parse(raw) as AppData) : null;
  } catch {
    return null;
  }
}

function normalizeData(data: AppData) {
  const tableNames = data.tableNames || [];
  const tables = data.tables?.length
    ? data.tables
    : tableNames.map((name) => ({ name, occupied: false }));
  const categories = Array.from(new Set([...(data.categories || []), ...data.menu.map((item) => item.category)].filter(Boolean)));
  return {
    ...data,
    categories,
    tableNames,
    tables,
  };
}

function tableLabel(table: TableState, index: number) {
  const fallback = `Bàn ${index + 1}`;
  return table.name === fallback ? fallback : `${fallback} - ${table.name}`;
}

function orderMatchesTable(orderTable: string, table: TableState, index: number) {
  const number = String(index + 1);
  const fallback = `Bàn ${number}`;
  return orderTable === table.name || orderTable === number || orderTable === fallback || orderTable === tableLabel(table, index);
}

export function App() {
  const normalizedPath = window.location.pathname.toLowerCase().replace(/\/$/, "");
  const isPublicMenu = normalizedPath.endsWith("/menu") || normalizedPath.endsWith("/menu.html");
  const [view, setView] = useState<View>("customer");
  const [data, setData] = useState<AppData | null>(() => readCachedData());
  const [loading, setLoading] = useState(() => !readCachedData());
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const nextData = normalizeData(await api.loadData());
      setData(nextData);
      localStorage.setItem(cacheKey, JSON.stringify(nextData));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được dữ liệu.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (isPublicMenu || view !== "admin") return;
    refresh();
    const interval = window.setInterval(refresh, 15000);
    return () => window.clearInterval(interval);
  }, [isPublicMenu, view]);

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
      {data && (isPublicMenu || view === "customer") && <CustomerPage data={data} onChanged={refresh} />}
      {data && !isPublicMenu && view === "admin" && <AdminPage data={data} onChanged={refresh} />}
    </main>
  );
}

function CustomerPage({ data, onChanged }: { data: AppData; onChanged: () => void }) {
  const activeMenu = data.menu.filter((item) => item.active);
  const categories = Array.from(new Set([...(data.categories || []), ...activeMenu.map((item) => item.category)].filter((name) => activeMenu.some((item) => item.category === name))));
  const tableOptions = data.tables?.length
    ? data.tables.map((table) => table.name)
    : data.tableNames?.length
      ? data.tableNames
      : Array.from({ length: data.tableCount }, (_, index) => `Bàn ${index + 1}`);
  const [category, setCategory] = useState(categories[0] || "");
  const [tableNumber, setTableNumber] = useState(tableOptions[0] || "Bàn 1");
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [orderError, setOrderError] = useState("");
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
    setSuccessMessage("");
    setOrderError("");
    setConfirming(true);
  }

  async function confirmOrder() {
    setSubmitting(true);
    setOrderError("");
    try {
      await api.createOrder({ tableNumber, customerName: tableNumber, items: cart });
      setCart([]);
      setConfirming(false);
      setSuccessMessage("Đặt món thành công. Quán đã nhận đơn của bạn.");
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : "Không gửi được đơn.");
    } finally {
      setSubmitting(false);
    }
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
        {successMessage && <p className="success">{successMessage}</p>}
        {orderError && <p className="alert inline-alert">{orderError}</p>}
        <label>
          Bàn
          <input list="table-options" value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} placeholder="Chọn hoặc nhập tên bàn" />
          <datalist id="table-options">
            {tableOptions.map((name) => (
              <option value={name} key={name} />
            ))}
          </datalist>
        </label>
        <div className="cart-list">
          {cart.map((item) => (
            <article className="cart-row" key={item.id}>
              <div className="cart-item-title">
                <strong>{item.name}</strong>
                <span>{formatMoney(item.price)}</span>
              </div>
              <input
                className="qty-input"
                aria-label="Số lượng"
                type="number"
                min={1}
                value={item.quantity}
                onChange={(e) =>
                  setCart((items) => items.map((cartItem) => (cartItem.id === item.id ? { ...cartItem, quantity: Number(e.target.value) } : cartItem)))
                }
              />
              <label className="note-field">
                Ghi chú cho món này
                <input
                  value={item.note}
                  onChange={(e) => setCart((items) => items.map((cartItem) => (cartItem.id === item.id ? { ...cartItem, note: e.target.value } : cartItem)))}
                  placeholder="Ví dụ: ít đá, ít ngọt, không cay"
                />
              </label>
              <button type="button" onClick={() => setCart((items) => items.filter((cartItem) => cartItem.id !== item.id))} aria-label="Xóa món">
                <Trash2 size={16} />
              </button>
            </article>
          ))}
        </div>
        <button className="primary" disabled={!cart.length || submitting}>
          <ReceiptText size={18} /> Gửi đơn
        </button>
      </form>

      {confirming && (
        <div className="modal-backdrop" role="presentation">
          <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <div className="section-title">
              <h2 id="confirm-title">Xác nhận đặt món</h2>
              <p>{formatMoney(total)}</p>
            </div>
            <div className="confirm-summary">
              <p><strong>Bàn:</strong> {tableNumber}</p>
              {cart.map((item) => (
                <div className="confirm-item" key={item.id}>
                  <span>{item.quantity} x {item.name}</span>
                  <strong>{formatMoney(item.price * item.quantity)}</strong>
                  {item.note && <small>Ghi chú: {item.note}</small>}
                </div>
              ))}
            </div>
            {orderError && <p className="alert inline-alert">{orderError}</p>}
            <div className="modal-actions">
              <button type="button" onClick={() => setConfirming(false)} disabled={submitting}>
                Quay lại
              </button>
              <button className="primary" type="button" onClick={confirmOrder} disabled={submitting}>
                <ReceiptText size={18} /> {submitting ? "Đang gửi..." : "Xác nhận"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function AdminPage({ data, onChanged }: { data: AppData; onChanged: () => void }) {
  const [token, setToken] = useState(localStorage.getItem("ck_admin_token") || "");
  const [menuDraft, setMenuDraft] = useState<Partial<MenuItem>>({ active: true });
  const [expense, setExpense] = useState<Omit<Expense, "id">>({ date: todayKey(), name: "", amount: 0, note: "" });
  const [tableDraft, setTableDraft] = useState("");
  const [editingTableName, setEditingTableName] = useState("");
  const [categoryDraft, setCategoryDraft] = useState("");
  const [editingCategory, setEditingCategory] = useState("");
  const [adminMessage, setAdminMessage] = useState("");
  const [adminError, setAdminError] = useState("");
  const openOrders = data.orders.filter((order) => order.status === "open");
  const categories = Array.from(new Set([...(data.categories || []), ...data.menu.map((item) => item.category)].filter(Boolean)));
  const tableMap = useMemo(() => {
    const configuredTables = data.tables?.length
      ? data.tables
      : data.tableNames?.length
        ? data.tableNames.map((name) => ({ name, occupied: false }))
        : Array.from({ length: data.tableCount }, (_, index) => ({ name: `Bàn ${index + 1}`, occupied: false }));
    const extraTables = openOrders
      .map((order) => order.tableNumber)
      .filter((tableName) => tableName && !configuredTables.some((table, index) => orderMatchesTable(tableName, table, index)))
      .map((name) => ({ name, occupied: false }));
    return [...configuredTables, ...extraTables].map((table, index) => ({
      table,
      label: tableLabel(table, index),
      orders: openOrders.filter((order) => orderMatchesTable(order.tableNumber, table, index)),
    }));
  }, [data.tableCount, data.tableNames, data.tables, openOrders]);

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

  async function saveTable(event: FormEvent) {
    event.preventDefault();
    const name = tableDraft.trim();
    if (!name) return;
    const currentTables = data.tables?.length ? data.tables : data.tableNames.map((tableName) => ({ name: tableName, occupied: false }));
    const withoutEdited = currentTables.filter((table) => table.name !== editingTableName && table.name !== name);
    const existing = currentTables.find((table) => table.name === editingTableName);
    try {
      await api.setTables([...withoutEdited, { name, occupied: existing?.occupied || false }]);
      setTableDraft("");
      setEditingTableName("");
      setAdminError("");
      setAdminMessage("Đã lưu bàn.");
      onChanged();
    } catch (err) {
      setAdminMessage("");
      setAdminError(err instanceof Error ? err.message : "Không lưu được bàn.");
    }
  }

  async function updateTables(nextTables: TableState[]) {
    try {
      await api.setTables(nextTables);
      setAdminError("");
      setAdminMessage("Đã cập nhật bàn.");
      onChanged();
    } catch (err) {
      setAdminMessage("");
      setAdminError(err instanceof Error ? err.message : "Không cập nhật được bàn.");
    }
  }

  function editTable(table: TableState) {
    setTableDraft(table.name);
    setEditingTableName(table.name);
  }

  async function saveCategory(event?: FormEvent) {
    event?.preventDefault();
    const name = categoryDraft.trim();
    if (!name) return;
    const nextCategories = categories
      .filter((category) => category !== editingCategory && category !== name)
      .concat(name);

    try {
      if (editingCategory) {
        const changedItems = data.menu.filter((item) => item.category === editingCategory);
        await Promise.all(changedItems.map((item) => api.saveMenuItem({ ...item, category: name })));
      }
      await api.setCategories(nextCategories);
      setCategoryDraft("");
      setEditingCategory("");
      setAdminError("");
      setAdminMessage("Đã lưu nhóm món.");
      onChanged();
    } catch (err) {
      setAdminMessage("");
      setAdminError(err instanceof Error ? err.message : "Không lưu được nhóm món.");
    }
  }

  async function deleteCategory(category: string) {
    if (data.menu.some((item) => item.category === category && item.active)) {
      setAdminMessage("");
      setAdminError("Nhóm này còn món đang bán. Hãy sửa, ẩn hoặc xóa các món trong nhóm trước khi xóa nhóm.");
      return;
    }
    try {
      await api.setCategories(categories.filter((item) => item !== category));
      setAdminError("");
      setAdminMessage("Đã xóa nhóm món.");
      onChanged();
    } catch (err) {
      setAdminMessage("");
      setAdminError(err instanceof Error ? err.message : "Không xóa được nhóm món.");
    }
  }

  function editCategory(category: string) {
    setCategoryDraft(category);
    setEditingCategory(category);
  }

  async function hideMenuItem(id: string) {
    try {
      await api.deleteMenuItem(id);
      setAdminError("");
      setAdminMessage("Đã ẩn món.");
      onChanged();
    } catch (err) {
      setAdminMessage("");
      setAdminError(err instanceof Error ? err.message : "Không ẩn được món.");
    }
  }

  async function removeMenuItem(item: MenuItem) {
    if (!window.confirm(`Xóa hẳn món "${item.name}" khỏi menu?`)) return;
    try {
      await api.removeMenuItem(item.id);
      setAdminError("");
      setAdminMessage("Đã xóa món.");
      onChanged();
    } catch (err) {
      setAdminMessage("");
      setAdminError(err instanceof Error ? err.message : "Không xóa được món.");
    }
  }

  async function updateOrder(order: Order, status: Order["status"]) {
    try {
      await api.updateOrder({ ...order, status, paidAt: status === "paid" ? new Date().toISOString() : order.paidAt });
      setAdminError("");
      setAdminMessage(status === "paid" ? "Đã tính tiền đơn." : "Đã hủy đơn.");
      onChanged();
    } catch (err) {
      setAdminMessage("");
      setAdminError(err instanceof Error ? err.message : "Không cập nhật được đơn.");
    }
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
        <form className="expense-compact" onSubmit={saveExpense}>
          <h2><ReceiptText size={20} /> Ghi chi phí</h2>
          <input type="date" value={expense.date} onChange={(e) => setExpense({ ...expense, date: e.target.value })} />
          <input value={expense.name} onChange={(e) => setExpense({ ...expense, name: e.target.value })} placeholder="Tên chi phí" required />
          <input type="number" value={expense.amount || ""} onChange={(e) => setExpense({ ...expense, amount: Number(e.target.value) })} placeholder="Số tiền" required />
          <input value={expense.note} onChange={(e) => setExpense({ ...expense, note: e.target.value })} placeholder="Ghi chú" />
          <button className="primary"><Save size={18} /> Lưu chi phí</button>
        </form>
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
        <form className="table-name-form" onSubmit={saveTable}>
          <label>
            Quản lý bàn
            <input value={tableDraft} onChange={(e) => setTableDraft(e.target.value)} placeholder="Hoa Mai, Hoa Đào..." />
          </label>
          <button className="primary"><Save size={18} /> {editingTableName ? "Lưu tên bàn" : "Thêm bàn"}</button>
          {editingTableName && (
            <button type="button" onClick={() => { setEditingTableName(""); setTableDraft(""); }}>
              Hủy sửa
            </button>
          )}
          <div className="table-admin-list">
            {(data.tables?.length ? data.tables : data.tableNames.map((name) => ({ name, occupied: false }))).map((table, index) => (
              <div className="table-admin-row" key={table.name}>
                <strong>{tableLabel(table, index)}</strong>
                <span>{table.occupied ? "Đang có khách" : "Trống"}</span>
                <button type="button" onClick={() => editTable(table)}>Sửa</button>
                <button
                  type="button"
                  onClick={() =>
                    updateTables((data.tables?.length ? data.tables : data.tableNames.map((name) => ({ name, occupied: false }))).map((item) =>
                      item.name === table.name ? { ...item, occupied: !item.occupied } : item,
                    ))
                  }
                >
                  {table.occupied ? "Đánh dấu trống" : "Đánh dấu bận"}
                </button>
                <button
                  type="button"
                  onClick={() => updateTables((data.tables?.length ? data.tables : data.tableNames.map((name) => ({ name, occupied: false }))).filter((item) => item.name !== table.name))}
                >
                  Xóa
                </button>
              </div>
            ))}
          </div>
        </form>
      </aside>

      <div className="admin-main">
        <div className="section-title">
          <h1>Bàn đang phục vụ</h1>
          <p>{openOrders.length} đơn mở</p>
        </div>
        {adminMessage && <p className="success admin-feedback">{adminMessage}</p>}
        {adminError && <p className="alert inline-alert admin-feedback">{adminError}</p>}
        <div className="table-grid">
          {tableMap.map(({ table, label, orders }) => (
            <article className={`table-card ${orders.length || table.occupied ? "busy" : ""}`} key={table.name}>
              <h3>{label}</h3>
              {!orders.length && <p>{table.occupied ? "Đang có khách" : "Trống"}</p>}
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
            <div className="category-manager">
              <h3>Nhóm món</h3>
              <div className="category-form">
                <input value={categoryDraft} onChange={(e) => setCategoryDraft(e.target.value)} placeholder="Cafe, Trà, Đồ ăn..." />
                <button type="button" onClick={() => saveCategory()}>
                  {editingCategory ? "Lưu nhóm" : "Thêm nhóm"}
                </button>
              </div>
              {editingCategory && (
                <button className="soft-button" type="button" onClick={() => { setEditingCategory(""); setCategoryDraft(""); }}>
                  Hủy sửa nhóm
                </button>
              )}
              <div className="category-admin-list">
                {categories.map((category) => (
                  <div className="category-admin-row" key={category}>
                    <strong>{category}</strong>
                    <span>{data.menu.filter((item) => item.category === category).length} món</span>
                    <button type="button" onClick={() => editCategory(category)}>Sửa</button>
                    <button type="button" onClick={() => deleteCategory(category)}>Xóa</button>
                  </div>
                ))}
              </div>
            </div>
            <input value={menuDraft.name || ""} onChange={(e) => setMenuDraft({ ...menuDraft, name: e.target.value })} placeholder="Tên món" required />
            <input list="category-options-admin" value={menuDraft.category || ""} onChange={(e) => setMenuDraft({ ...menuDraft, category: e.target.value })} placeholder="Nhóm món" required />
            <datalist id="category-options-admin">
              {categories.map((category) => (
                <option value={category} key={category} />
              ))}
            </datalist>
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
                  <button type="button" onClick={() => hideMenuItem(item.id)}>Ẩn</button>
                  <button type="button" onClick={() => removeMenuItem(item)}>Xóa</button>
                </div>
              ))}
            </div>
          </form>

        </div>
      </div>
    </section>
  );
}
