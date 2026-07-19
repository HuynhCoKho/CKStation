import { BookOpen, ClipboardList, Coffee, LockKeyhole, Plus, ReceiptText, RefreshCw, Save, Settings, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "./lib/api";
import { formatDateVN, formatMoney, formatMonthVN, parseDateVN, parseMonthVN, todayKey } from "./lib/money";
import type { AppData, Expense, LinkItem, MenuItem, Order, OrderItem, TableState } from "./types";

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
  const menu = (data.menu || []).map((item) => ({
    ...item,
    description: item.description || "",
    link: item.link || "",
  }));
  const categories = Array.from(new Set([...(data.categories || []), ...menu.map((item) => item.category)].filter(Boolean)));
  return {
    ...data,
    menu,
    links: data.links || [],
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

function compareMenuItemName(a: MenuItem, b: MenuItem) {
  return a.name.localeCompare(b.name, "vi", { sensitivity: "base" });
}

function isBorrowService(item: MenuItem) {
  return item.name.trim().toLocaleLowerCase("vi-VN") === "mượn sách";
}

function serviceLink(item: MenuItem) {
  const link = item.link?.trim();
  if (link) return link;
  return isBorrowService(item) ? "https://huynhcokho.github.io/CKlibrary/borrow.html" : "";
}

function DateVNInput({ value, onChange, required = false }: { value: string; onChange: (value: string) => void; required?: boolean }) {
  const [text, setText] = useState(formatDateVN(value));

  useEffect(() => {
    setText(formatDateVN(value));
  }, [value]);

  function commit() {
    const parsed = parseDateVN(text);
    if (parsed) {
      onChange(parsed);
      setText(formatDateVN(parsed));
    } else {
      setText(formatDateVN(value));
    }
  }

  return (
    <input
      inputMode="numeric"
      pattern="\\d{1,2}/\\d{1,2}/\\d{4}"
      placeholder="dd/mm/yyyy"
      required={required}
      value={text}
      onBlur={commit}
      onChange={(event) => setText(event.target.value)}
    />
  );
}

function MonthVNInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [text, setText] = useState(formatMonthVN(value));

  useEffect(() => {
    setText(formatMonthVN(value));
  }, [value]);

  function commit() {
    const parsed = parseMonthVN(text);
    if (parsed) {
      onChange(parsed);
      setText(formatMonthVN(parsed));
    } else {
      setText(formatMonthVN(value));
    }
  }

  return <input inputMode="numeric" pattern="\\d{1,2}/\\d{4}" placeholder="mm/yyyy" value={text} onBlur={commit} onChange={(event) => setText(event.target.value)} />;
}

export function App() {
  const normalizedPath = window.location.pathname.toLowerCase().replace(/\/$/, "");
  const isPublicMenu = normalizedPath.endsWith("/menu") || normalizedPath.endsWith("/menu.html");
  const [view, setView] = useState<View>("customer");
  const [data, setData] = useState<AppData | null>(() => readCachedData());
  const [loading, setLoading] = useState(() => !readCachedData());
  const [error, setError] = useState("");

  async function refresh(showIndicator = !data) {
    if (showIndicator) setLoading(true);
    setError("");
    try {
      const nextData = normalizeData(await api.loadData());
      setData(nextData);
      localStorage.setItem(cacheKey, JSON.stringify(nextData));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được dữ liệu.");
    } finally {
      if (showIndicator) setLoading(false);
    }
  }

  useEffect(() => {
    refresh(!data);
  }, []);

  useEffect(() => {
    if (isPublicMenu || view !== "admin") return;
    refresh(false);
    const interval = window.setInterval(() => refresh(false), 15000);
    return () => window.clearInterval(interval);
  }, [isPublicMenu, view]);

  return (
    <main>
      <header className="topbar">
        <button className="brand" onClick={() => setView("customer")} aria-label="CK Station">
          <Coffee size={26} />
          <span>Menu</span>
        </button>
        <div className="brand-center" aria-label="CK Station">
          <strong className="botanical-title" aria-label="CK Station">
            {"CK STATION".split("").map((letter, index) =>
              letter === " " ? (
                <span className="botanical-space" key={index} aria-hidden="true" />
              ) : (
                <span className="botanical-letter" key={`${letter}-${index}`}>
                  {letter}
                </span>
              ),
            )}
          </strong>
          <span className="brand-author">Author: Huỳnh Cỏ Khô</span>
        </div>
        {!isPublicMenu && (
          <nav className="tabs">
            <button className={view === "customer" ? "active" : ""} onClick={() => setView("customer")}>
              <Coffee size={18} /> Khách hàng
            </button>
            <button className={view === "admin" ? "active" : ""} onClick={() => setView("admin")}>
              <Settings size={18} /> Quản lý
            </button>
            <button onClick={() => refresh(true)} aria-label="Tải lại">
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
  const activeMenu = data.menu.filter((item) => item.active).sort(compareMenuItemName);
  const activeLinks = (data.links || []).filter((link) => link.active && link.url);
  const linkTab = "Liên kết";
  const categories = [
    ...Array.from(new Set([...(data.categories || []), ...activeMenu.map((item) => item.category)].filter((name) => activeMenu.some((item) => item.category === name)))),
    ...(activeLinks.length ? [linkTab] : []),
  ];
  const openOrders = data.orders.filter((order) => order.status === "open");
  const tableOptions = data.tables?.length
    ? data.tables
        .map((table, index) => {
          const hasOpenOrder = openOrders.some((order) => orderMatchesTable(order.tableNumber, table, index));
          return {
            label: tableLabel(table, index),
            status: hasOpenOrder ? "Đang phục vụ" : table.occupied ? "Đã đánh dấu bận" : "Trống",
          };
        })
    : data.tableNames?.length
      ? data.tableNames.map((name, index) => ({ label: tableLabel({ name, occupied: false }, index), status: "Trống" }))
      : Array.from({ length: data.tableCount }, (_, index) => ({ label: `Bàn ${index + 1}`, status: "Trống" }));
  const tableLabels = tableOptions.map((table) => table.label);
  const tableOptionsKey = tableOptions.map((table) => `${table.label}:${table.status}`).join("|");
  const [category, setCategory] = useState(categories[0] || "");
  const [tableNumber, setTableNumber] = useState(tableOptions[0]?.label || "Bàn 1");
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [orderError, setOrderError] = useState("");
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  useEffect(() => {
    if (!tableOptions.length) {
      setTableNumber("");
      return;
    }
    if (!tableLabels.includes(tableNumber)) {
      setTableNumber(tableOptions[0].label);
    }
  }, [tableOptionsKey, tableNumber]);

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
          {category === linkTab ? (
            activeLinks.map((link) => (
              <button className="menu-item service-link-item" key={link.id} onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")}>
                <span>{link.name}</span>
                <strong>{link.description || "Mở liên kết"}</strong>
                <BookOpen size={18} />
              </button>
            ))
          ) : (
            activeMenu
            .filter((item) => !category || item.category === category)
            .sort(compareMenuItemName)
            .map((item) => {
              const link = serviceLink(item);
              return (
                <button
                  className={`menu-item ${link ? "service-link-item" : ""}`}
                  key={item.id}
                  onClick={() => {
                    if (link) {
                      window.location.href = link;
                      return;
                    }
                    addToCart(item);
                  }}
                >
                  <span>{item.name}</span>
                  {link ? <strong>{item.description || "Mở dịch vụ"}</strong> : <strong>{formatMoney(item.price)}</strong>}
                  {link ? <BookOpen size={18} /> : <Plus size={18} />}
                </button>
              );
            })
          )}
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
          <select value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} disabled={!tableOptions.length}>
            {tableOptions.map((table) => (
              <option value={table.label} key={table.label}>
                {table.label} - {table.status}
              </option>
            ))}
          </select>
        </label>
        {!tableOptions.length && <p className="muted">Hiện chưa có bàn trống để đặt món.</p>}
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
        <button className="primary" disabled={!cart.length || !tableNumber || submitting}>
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
  const [linkDraft, setLinkDraft] = useState<Partial<LinkItem>>({ active: true });
  const [expense, setExpense] = useState<Omit<Expense, "id">>({ date: todayKey(), name: "", amount: 0, note: "" });
  const [tableDraft, setTableDraft] = useState("");
  const [editingTableName, setEditingTableName] = useState("");
  const [categoryDraft, setCategoryDraft] = useState("");
  const [editingCategory, setEditingCategory] = useState("");
  const [adminMessage, setAdminMessage] = useState("");
  const [adminError, setAdminError] = useState("");
  const [adminSection, setAdminSection] = useState<"operations" | "income" | "links">("operations");
  const [incomeMode, setIncomeMode] = useState<"day" | "month" | "year">("day");
  const [incomeDay, setIncomeDay] = useState(todayKey());
  const [incomeMonth, setIncomeMonth] = useState(todayKey().slice(0, 7));
  const [incomeYear, setIncomeYear] = useState(todayKey().slice(0, 4));
  const openOrders = data.orders.filter((order) => order.status === "open");
  const categories = Array.from(new Set([...(data.categories || []), ...data.menu.map((item) => item.category)].filter(Boolean)));
  const groupedMenu = [
    ...categories.map((category) => ({
      category,
      items: data.menu.filter((item) => item.category === category).sort(compareMenuItemName),
    })),
    {
      category: "Chưa phân nhóm",
      items: data.menu.filter((item) => !item.category).sort(compareMenuItemName),
    },
  ].filter((group) => group.items.length);
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
  const incomeRange =
    incomeMode === "day"
      ? { label: formatDateVN(incomeDay), start: incomeDay, end: incomeDay }
      : incomeMode === "month"
        ? { label: formatMonthVN(incomeMonth), start: `${incomeMonth}-01`, end: `${incomeMonth}-31` }
        : { label: incomeYear, start: `${incomeYear}-01-01`, end: `${incomeYear}-12-31` };
  const paidOrdersInRange = data.orders.filter((order) => {
    const paidDate = String(order.paidAt || "").slice(0, 10);
    return order.status === "paid" && paidDate >= incomeRange.start && paidDate <= incomeRange.end;
  });
  const expensesInRange = data.expenses.filter((item) => {
    const expenseDate = String(item.date || "").slice(0, 10);
    return expenseDate >= incomeRange.start && expenseDate <= incomeRange.end;
  });
  const incomeSummary = {
    revenue: paidOrdersInRange.reduce((sum, order) => sum + order.total, 0),
    expense: expensesInRange.reduce((sum, item) => sum + item.amount, 0),
  };
  const incomeProfit = incomeSummary.revenue - incomeSummary.expense;

  function saveToken() {
    localStorage.setItem("ck_admin_token", token);
  }

  async function saveMenu(event: FormEvent) {
    event.preventDefault();
    try {
      await api.saveMenuItem({ ...menuDraft, price: Number(menuDraft.price || 0) });
      setMenuDraft({ active: true });
      setAdminError("");
      setAdminMessage("Đã lưu món/dịch vụ.");
      onChanged();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Không lưu được món/dịch vụ.";
      const needsScriptUpdate = Boolean(menuDraft.link) && message.includes("Món cần có tên, nhóm và giá");
      setAdminMessage("");
      setAdminError(
        needsScriptUpdate
          ? "Apps Script hiện tại chưa được cập nhật để lưu dịch vụ có link. Hãy cập nhật Code.gs mới, deploy lại Web App rồi lưu lại dịch vụ."
          : message,
      );
    }
  }

  async function saveLink(event: FormEvent) {
    event.preventDefault();
    try {
      await api.saveLink(linkDraft);
      setLinkDraft({ active: true });
      setAdminError("");
      setAdminMessage("Đã lưu liên kết.");
      onChanged();
    } catch (err) {
      setAdminMessage("");
      setAdminError(err instanceof Error ? err.message : "Không lưu được liên kết. Hãy cập nhật Apps Script mới nếu chưa deploy lại Web App.");
    }
  }

  async function removeLink(link: LinkItem) {
    if (!window.confirm(`Xóa liên kết "${link.name}"?`)) return;
    try {
      await api.removeLink(link.id);
      setAdminError("");
      setAdminMessage("Đã xóa liên kết.");
      onChanged();
    } catch (err) {
      setAdminMessage("");
      setAdminError(err instanceof Error ? err.message : "Không xóa được liên kết.");
    }
  }

  async function toggleLink(link: LinkItem) {
    try {
      await api.saveLink({ ...link, active: !link.active });
      setAdminError("");
      setAdminMessage(link.active ? "Đã ẩn liên kết." : "Đã hiển thị liên kết.");
      onChanged();
    } catch (err) {
      setAdminMessage("");
      setAdminError(err instanceof Error ? err.message : "Không cập nhật được liên kết.");
    }
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

  async function moveCategory(category: string, direction: -1 | 1) {
    const currentIndex = categories.indexOf(category);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= categories.length) return;

    const nextCategories = [...categories];
    [nextCategories[currentIndex], nextCategories[nextIndex]] = [nextCategories[nextIndex], nextCategories[currentIndex]];

    try {
      await api.setCategories(nextCategories);
      setAdminError("");
      setAdminMessage("Đã đổi thứ tự nhóm món.");
      onChanged();
    } catch (err) {
      setAdminMessage("");
      setAdminError(err instanceof Error ? err.message : "Không đổi được thứ tự nhóm món.");
    }
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
          <DateVNInput value={expense.date} onChange={(date) => setExpense({ ...expense, date })} required />
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
        <div className="admin-section-tabs">
          <button className={adminSection === "operations" ? "active" : ""} onClick={() => setAdminSection("operations")}>
            Vận hành
          </button>
          <button className={adminSection === "income" ? "active" : ""} onClick={() => setAdminSection("income")}>
            Thu nhập
          </button>
          <button className={adminSection === "links" ? "active" : ""} onClick={() => setAdminSection("links")}>
            Liên kết
          </button>
        </div>
        {adminMessage && <p className="success admin-feedback">{adminMessage}</p>}
        {adminError && <p className="alert inline-alert admin-feedback">{adminError}</p>}

        {adminSection === "operations" ? (
          <>
            <div className="section-title">
              <h1>Bàn đang phục vụ</h1>
              <p>{openOrders.length} đơn mở</p>
            </div>
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
                {categories.map((category, index) => (
                  <div className="category-admin-row" key={category}>
                    <strong>{category}</strong>
                    <span>{data.menu.filter((item) => item.category === category).length} món</span>
                    <button type="button" onClick={() => moveCategory(category, -1)} disabled={index === 0}>Lên</button>
                    <button type="button" onClick={() => moveCategory(category, 1)} disabled={index === categories.length - 1}>Xuống</button>
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
              placeholder="Giá, bỏ trống nếu là dịch vụ có link"
              required={!menuDraft.link}
            />
            <input
              value={menuDraft.description || ""}
              onChange={(e) => setMenuDraft({ ...menuDraft, description: e.target.value })}
              placeholder="Mô tả dịch vụ, ví dụ: Mở trang đăng ký mượn sách"
            />
            <input
              type="url"
              value={menuDraft.link || ""}
              onChange={(e) => setMenuDraft({ ...menuDraft, link: e.target.value })}
              placeholder="Link dịch vụ, ví dụ: https://huynhcokho.github.io/CKlibrary/borrow.html"
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
            {adminError && <p className="alert inline-alert">{adminError}</p>}
            {adminMessage && <p className="success">{adminMessage}</p>}
            <div className="menu-admin-list">
              {groupedMenu.map((group) => (
                <section className="menu-admin-group" key={group.category}>
                  <div className="menu-admin-group-title">
                    <h3>{group.category}</h3>
                    <span>{group.items.length} món</span>
                  </div>
                  <div className="menu-admin-group-items">
                    {group.items.map((item) => (
                      <div className="menu-admin-row" key={item.id}>
                        <div>
                          <strong>{item.name}</strong>
                          <span>
                            {serviceLink(item) ? `Dịch vụ · ${item.description || item.link}` : formatMoney(item.price)}
                            {" · "}
                            {item.active ? "Đang bán" : "Đã ẩn"}
                          </span>
                        </div>
                        <button type="button" onClick={() => setMenuDraft(item)}>Sửa</button>
                        <button type="button" onClick={() => hideMenuItem(item.id)}>Ẩn</button>
                        <button type="button" onClick={() => removeMenuItem(item)}>Xóa</button>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
              </form>
            </div>
          </>
        ) : adminSection === "income" ? (
          <section className="income-panel">
            <div className="section-title">
              <h1>Thu nhập</h1>
              <p>{incomeRange.label}</p>
            </div>
            <div className="income-filters">
              <div className="chips">
                <button className={incomeMode === "day" ? "selected" : ""} onClick={() => setIncomeMode("day")}>Ngày</button>
                <button className={incomeMode === "month" ? "selected" : ""} onClick={() => setIncomeMode("month")}>Tháng</button>
                <button className={incomeMode === "year" ? "selected" : ""} onClick={() => setIncomeMode("year")}>Năm</button>
              </div>
              {incomeMode === "day" && <DateVNInput value={incomeDay} onChange={setIncomeDay} />}
              {incomeMode === "month" && <MonthVNInput value={incomeMonth} onChange={setIncomeMonth} />}
              {incomeMode === "year" && <input type="number" min={2000} max={2100} value={incomeYear} onChange={(event) => setIncomeYear(event.target.value)} />}
            </div>
            <div className="income-summary">
              <div className="stat-row">
                <span>Thu</span>
                <strong>{formatMoney(incomeSummary.revenue)}</strong>
                <small>{paidOrdersInRange.length} đơn đã tính tiền</small>
              </div>
              <div className="stat-row">
                <span>Chi</span>
                <strong>{formatMoney(incomeSummary.expense)}</strong>
                <small>{expensesInRange.length} khoản chi</small>
              </div>
              <div className={`stat-row ${incomeProfit >= 0 ? "accent" : ""}`}>
                <span>Lợi nhuận</span>
                <strong>{formatMoney(incomeProfit)}</strong>
                <small>Thu trừ chi</small>
              </div>
            </div>
            <div className="income-details">
              <div className="tool-panel">
                <h2>Doanh thu</h2>
                {paidOrdersInRange.length ? (
                  paidOrdersInRange.map((order) => (
                    <div className="income-row" key={order.id}>
                      <div>
                        <strong>{order.tableNumber}</strong>
                        <span>{formatDateVN(order.paidAt)} · {order.items.length} món</span>
                      </div>
                      <strong>{formatMoney(order.total)}</strong>
                    </div>
                  ))
                ) : (
                  <p className="muted">Chưa có đơn đã tính tiền trong khoảng này.</p>
                )}
              </div>
              <div className="tool-panel">
                <h2>Chi phí</h2>
                {expensesInRange.length ? (
                  expensesInRange.map((item) => (
                    <div className="income-row" key={item.id}>
                      <div>
                        <strong>{item.name}</strong>
                        <span>{formatDateVN(item.date)}{item.note ? ` · ${item.note}` : ""}</span>
                      </div>
                      <strong>{formatMoney(item.amount)}</strong>
                    </div>
                  ))
                ) : (
                  <p className="muted">Chưa có chi phí trong khoảng này.</p>
                )}
              </div>
            </div>
          </section>
        ) : (
          <section className="link-admin-panel">
            <div className="section-title">
              <h1>Liên kết</h1>
              <p>{(data.links || []).length} liên kết</p>
            </div>
            <form className="tool-panel" onSubmit={saveLink}>
              <input value={linkDraft.name || ""} onChange={(event) => setLinkDraft({ ...linkDraft, name: event.target.value })} placeholder="Tên liên kết" required />
              <input type="url" value={linkDraft.url || ""} onChange={(event) => setLinkDraft({ ...linkDraft, url: event.target.value })} placeholder="Link" required />
              <input value={linkDraft.description || ""} onChange={(event) => setLinkDraft({ ...linkDraft, description: event.target.value })} placeholder="Mô tả hiển thị cho người dùng" />
              <input value={linkDraft.note || ""} onChange={(event) => setLinkDraft({ ...linkDraft, note: event.target.value })} placeholder="Ghi chú nội bộ, chỉ mình thấy" />
              <label className="check">
                <input type="checkbox" checked={linkDraft.active !== false} onChange={(event) => setLinkDraft({ ...linkDraft, active: event.target.checked })} />
                Đang hiển thị
              </label>
              <button className="primary"><Save size={18} /> Lưu liên kết</button>
              {(linkDraft.id || linkDraft.name || linkDraft.url || linkDraft.description || linkDraft.note) && (
                <button className="soft-button" type="button" onClick={() => setLinkDraft({ active: true })}>
                  Làm mới form
                </button>
              )}
            </form>
            <div className="menu-admin-list">
              {(data.links || []).map((link) => (
                <div className="menu-admin-row link-admin-row" key={link.id}>
                  <div>
                    <strong>{link.name}</strong>
                    <span>{link.description || link.url} · {link.active ? "Đang hiển thị" : "Đã ẩn"}</span>
                    {link.note && <small>Ghi chú: {link.note}</small>}
                  </div>
                  <button type="button" onClick={() => setLinkDraft(link)}>Sửa</button>
                  <button type="button" onClick={() => toggleLink(link)}>{link.active ? "Ẩn" : "Hiện"}</button>
                  <button type="button" onClick={() => removeLink(link)}>Xóa</button>
                </div>
              ))}
              {!(data.links || []).length && <p className="muted">Chưa có liên kết nào.</p>}
            </div>
          </section>
        )}
      </div>
    </section>
  );
}
