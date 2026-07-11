const SHEETS = {
  menu: "Menu",
  orders: "Orders",
  orderItems: "OrderItems",
  expenses: "Expenses",
  settings: "Settings",
};

const HEADERS = {
  Menu: ["id", "name", "category", "price", "active", "description", "link"],
  Orders: ["id", "tableNumber", "customerName", "status", "createdAt", "paidAt", "total"],
  OrderItems: ["id", "orderId", "menuItemId", "name", "price", "quantity", "note", "status"],
  Expenses: ["id", "date", "name", "amount", "note"],
  Settings: ["key", "value"],
};

function setup() {
  const ss = getSpreadsheet_();
  Object.keys(HEADERS).forEach((name) => ensureSheet_(ss, name, HEADERS[name]));
  setSettingIfEmpty_("tableCount", "12");
  seedMenuIfEmpty_();
}

function doGet(e) {
  try {
    setup();
    const action = e.parameter.action;
    if (!action) {
      return output_(e, { ok: true, data: { service: "CK Station API", time: new Date().toISOString() } });
    }

    const payload = e.parameter.payload ? JSON.parse(e.parameter.payload) : {};
    const adminActions = ["saveMenuItem", "deleteMenuItem", "removeMenuItem", "updateOrder", "addExpense", "setTableCount", "setTableNames", "setTables", "setCategories"];

    if (adminActions.indexOf(action) >= 0) {
      verifyAdmin_(e.parameter.token);
    }

    const data = route_(action, payload);
    return output_(e, { ok: true, data });
  } catch (error) {
    return output_(e, { ok: false, error: error.message || String(error) });
  }
}

function doPost(e) {
  try {
    setup();
    const body = JSON.parse(e.postData.contents || "{}");
    const action = body.action;
    const payload = body.payload || {};
    const adminActions = ["saveMenuItem", "deleteMenuItem", "removeMenuItem", "updateOrder", "addExpense", "setTableCount", "setTableNames", "setTables", "setCategories"];

    if (adminActions.indexOf(action) >= 0) {
      verifyAdmin_(body.token);
    }

    const data = route_(action, payload);
    return json_({ ok: true, data });
  } catch (error) {
    return json_({ ok: false, error: error.message || String(error) });
  }
}

function route_(action, payload) {
  if (action === "loadData") return loadData_();
  if (action === "createOrder") return createOrder_(payload.order);
  if (action === "saveMenuItem") return saveMenuItem_(payload.item);
  if (action === "deleteMenuItem") return deleteMenuItem_(payload.id);
  if (action === "removeMenuItem") return removeMenuItem_(payload.id);
  if (action === "updateOrder") return updateOrder_(payload.order);
  if (action === "addExpense") return addExpense_(payload.expense);
  if (action === "setTableCount") return setTableCount_(payload.tableCount);
  if (action === "setTableNames") return setTableNames_(payload.tableNames);
  if (action === "setTables") return setTables_(payload.tables);
  if (action === "setCategories") return setCategories_(payload.categories);
  throw new Error("Action không hợp lệ.");
}

function loadData_() {
  const menu = readObjects_(SHEETS.menu).map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    price: Number(item.price || 0),
    active: String(item.active).toLowerCase() !== "false",
    description: item.description || "",
    link: item.link || "",
  }));

  const orderRows = readObjects_(SHEETS.orders);
  const itemRows = readObjects_(SHEETS.orderItems);
  const orders = orderRows.map((order) => {
    const items = itemRows
      .filter((item) => item.orderId === order.id)
      .map((item) => ({
        id: item.id,
        menuItemId: item.menuItemId,
        name: item.name,
        price: Number(item.price || 0),
        quantity: Number(item.quantity || 0),
        note: item.note || "",
        status: item.status || "new",
      }));
    return {
      id: order.id,
      tableNumber: String(order.tableNumber || ""),
      customerName: order.customerName || "",
      status: order.status || "open",
      createdAt: order.createdAt || "",
      paidAt: order.paidAt || "",
      items,
      total: Number(order.total || 0),
    };
  });

  const expenses = readObjects_(SHEETS.expenses).map((expense) => ({
    id: expense.id,
    date: expense.date,
    name: expense.name,
    amount: Number(expense.amount || 0),
    note: expense.note || "",
  }));

  return {
    menu,
    categories: getCategories_(menu),
    orders,
    expenses,
    stats: getDailyStats_(orders, expenses),
    tableCount: Number(getSetting_("tableCount") || 12),
    tableNames: getTableNames_(),
    tables: getTables_(),
  };
}

function setCategories_(categories) {
  const saved = (categories || [])
    .map(function (category) { return String(category || "").trim(); })
    .filter(Boolean);
  setSetting_("categories", JSON.stringify(saved));
  return saved;
}

function getCategories_(menu) {
  const raw = getSetting_("categories");
  const saved = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach(function (category) {
          const name = String(category || "").trim();
          if (name && saved.indexOf(name) < 0) saved.push(name);
        });
      }
    } catch (error) {
      String(raw).split(/[\n,]+/).forEach(function (category) {
        const name = category.trim();
        if (name && saved.indexOf(name) < 0) saved.push(name);
      });
    }
  }
  (menu || []).forEach(function (item) {
    const name = String(item.category || "").trim();
    if (name && saved.indexOf(name) < 0) saved.push(name);
  });
  return saved;
}

function createOrder_(order) {
  if (!order || !order.tableNumber || !order.items || !order.items.length) {
    throw new Error("Đơn hàng thiếu thông tin.");
  }
  const menuById = {};
  readObjects_(SHEETS.menu).forEach((item) => {
    menuById[item.id] = item;
  });

  const orderId = Utilities.getUuid();
  const createdAt = new Date().toISOString();
  const items = order.items.map((item) => {
    const menuItem = menuById[item.menuItemId];
    if (!menuItem || String(menuItem.active).toLowerCase() === "false") {
      throw new Error("Một món trong đơn hiện không bán.");
    }
    const price = Number(menuItem.price || 0);
    const quantity = Math.max(1, Number(item.quantity || 1));
    return {
      id: Utilities.getUuid(),
      orderId,
      menuItemId: menuItem.id,
      name: menuItem.name,
      price,
      quantity,
      note: String(item.note || ""),
      status: "new",
    };
  });
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  appendObject_(SHEETS.orders, {
    id: orderId,
    tableNumber: String(order.tableNumber),
    customerName: order.customerName || "Khách",
    status: "open",
    createdAt,
    paidAt: "",
    total,
  });
  items.forEach((item) => appendObject_(SHEETS.orderItems, item));
  return loadData_().orders.find((saved) => saved.id === orderId);
}

function saveMenuItem_(item) {
  if (!item || !item.name || !item.category) throw new Error("Món cần có tên và nhóm.");
  const saved = {
    id: item.id || Utilities.getUuid(),
    name: String(item.name),
    category: String(item.category),
    price: Number(item.price || 0),
    active: item.active !== false,
    description: String(item.description || ""),
    link: String(item.link || ""),
  };
  upsertObject_(SHEETS.menu, "id", saved);
  return saved;
}

function deleteMenuItem_(id) {
  const rows = readObjects_(SHEETS.menu);
  const item = rows.find((row) => row.id === id);
  if (!item) throw new Error("Không tìm thấy món.");
  item.active = false;
  upsertObject_(SHEETS.menu, "id", item);
  return item;
}

function removeMenuItem_(id) {
  const sheet = getSpreadsheet_().getSheetByName(SHEETS.menu);
  const rows = readObjects_(SHEETS.menu);
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) throw new Error("Không tìm thấy món.");
  const item = rows[index];
  sheet.deleteRow(index + 2);
  return item;
}

function updateOrder_(order) {
  if (!order || !order.id) throw new Error("Đơn hàng không hợp lệ.");
  const total = Number(order.total || 0);
  upsertObject_(SHEETS.orders, "id", {
    id: order.id,
    tableNumber: String(order.tableNumber),
    customerName: order.customerName || "",
    status: order.status || "open",
    createdAt: order.createdAt || "",
    paidAt: order.paidAt || "",
    total,
  });
  if (order.items && order.items.length) {
    order.items.forEach((item) => {
      upsertObject_(SHEETS.orderItems, "id", {
        id: item.id,
        orderId: order.id,
        menuItemId: item.menuItemId,
        name: item.name,
        price: Number(item.price || 0),
        quantity: Number(item.quantity || 0),
        note: item.note || "",
        status: item.status || "new",
      });
    });
  }
  return loadData_().orders.find((saved) => saved.id === order.id);
}

function addExpense_(expense) {
  if (!expense || !expense.name || !expense.amount) throw new Error("Chi phí cần có tên và số tiền.");
  const saved = {
    id: Utilities.getUuid(),
    date: expense.date || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd"),
    name: String(expense.name),
    amount: Number(expense.amount),
    note: expense.note || "",
  };
  appendObject_(SHEETS.expenses, saved);
  return saved;
}

function setTableCount_(tableCount) {
  const value = Math.max(1, Number(tableCount || 1));
  setSetting_("tableCount", String(value));
  return value;
}

function setTableNames_(tableNames) {
  const names = (tableNames || [])
    .map((name) => String(name || "").trim())
    .filter(Boolean);
  setSetting_("tableNames", JSON.stringify(names));
  setSetting_("tables", JSON.stringify(names.map(function (name) {
    return { name: name, occupied: false };
  })));
  return names;
}

function setTables_(tables) {
  const saved = (tables || [])
    .map(function (table) {
      return {
        name: String(table.name || "").trim(),
        occupied: table.occupied === true,
      };
    })
    .filter(function (table) { return table.name; });
  setSetting_("tables", JSON.stringify(saved));
  setSetting_("tableNames", JSON.stringify(saved.map(function (table) { return table.name; })));
  return saved;
}

function getTableNames_() {
  const raw = getSetting_("tableNames");
  if (!raw) {
    const count = Number(getSetting_("tableCount") || 12);
    return Array.from({ length: count }, function (_, index) {
      return "Bàn " + (index + 1);
    });
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch (error) {
    return String(raw)
      .split(/[\n,]+/)
      .map(function (name) { return name.trim(); })
      .filter(Boolean);
  }
}

function getTables_() {
  const raw = getSetting_("tables");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map(function (table) {
            return {
              name: String(table.name || "").trim(),
              occupied: table.occupied === true,
            };
          })
          .filter(function (table) { return table.name; });
      }
    } catch (error) {}
  }
  return getTableNames_().map(function (name) {
    return { name: name, occupied: false };
  });
}

function getDailyStats_(orders, expenses) {
  const date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const paidToday = orders.filter((order) => order.status === "paid" && String(order.paidAt).slice(0, 10) === date);
  const expenseToday = expenses.filter((expense) => String(expense.date).slice(0, 10) === date);
  const revenue = paidToday.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const expense = expenseToday.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return { date, revenue, expense, profit: revenue - expense, paidOrders: paidToday.length };
}

function verifyAdmin_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty("ADMIN_TOKEN");
  if (!expected) throw new Error("Chưa cấu hình ADMIN_TOKEN trong Apps Script.");
  if (String(token || "") !== expected) throw new Error("Mã quản trị không đúng.");
}

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID") || "15C95YKp6JdyQHsKBUp9qN9ZAA6SmFQvRCt7G8dUj4RE";
  return SpreadsheetApp.openById(id);
}

function ensureSheet_(ss, name, headers) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  } else {
    const lastColumn = Math.max(sheet.getLastColumn(), 1);
    const currentHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String);
    headers.forEach(function (header) {
      if (currentHeaders.indexOf(header) < 0) {
        sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
        currentHeaders.push(header);
      }
    });
  }
  return sheet;
}

function readObjects_(name) {
  const sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  const headers = values.shift();
  return values
    .filter((row) => row.some((cell) => cell !== ""))
    .map((row) => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index];
      });
      return obj;
    });
}

function appendObject_(name, object) {
  const sheet = getSpreadsheet_().getSheetByName(name);
  const headers = getSheetHeaders_(sheet, name);
  sheet.appendRow(headers.map((header) => object[header]));
}

function upsertObject_(name, key, object) {
  const sheet = getSpreadsheet_().getSheetByName(name);
  const headers = getSheetHeaders_(sheet, name);
  const keyCol = headers.indexOf(key) + 1;
  const values = sheet.getLastRow() > 1 ? sheet.getRange(2, keyCol, sheet.getLastRow() - 1, 1).getValues() : [];
  const rowIndex = values.findIndex((row) => row[0] === object[key]);
  const row = headers.map((header) => object[header]);
  if (rowIndex >= 0) {
    sheet.getRange(rowIndex + 2, 1, 1, headers.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
}

function getSheetHeaders_(sheet, name) {
  if (!sheet || sheet.getLastRow() === 0) return HEADERS[name];
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
}

function getSetting_(key) {
  const setting = readObjects_(SHEETS.settings).find((row) => row.key === key);
  return setting ? setting.value : "";
}

function setSetting_(key, value) {
  upsertObject_(SHEETS.settings, "key", { key, value });
}

function setSettingIfEmpty_(key, value) {
  if (!getSetting_(key)) setSetting_(key, value);
}

function seedMenuIfEmpty_() {
  if (readObjects_(SHEETS.menu).length) return;
  [
    ["Cafe đen", "Cafe", 22000],
    ["Cafe sữa", "Cafe", 25000],
    ["Bạc xỉu", "Cafe", 28000],
    ["Trà đào", "Trà", 32000],
    ["Matcha đá xay", "Đá xay", 42000],
    ["Bánh mì trứng", "Đồ ăn", 25000],
  ].forEach((row) =>
    appendObject_(SHEETS.menu, {
      id: Utilities.getUuid(),
      name: row[0],
      category: row[1],
      price: row[2],
      active: true,
    }),
  );
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function output_(e, payload) {
  const callback = e && e.parameter && e.parameter.callback;
  if (!callback) return json_(payload);
  if (!/^[A-Za-z0-9_.$]+$/.test(callback)) {
    return json_({ ok: false, error: "Callback không hợp lệ." });
  }
  return ContentService
    .createTextOutput(callback + "(" + JSON.stringify(payload) + ");")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
