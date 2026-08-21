import { Coins, Landmark, Newspaper } from "lucide-react";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./lib/api";
import { formatDateVN } from "./lib/money";

// Google Sheet công khai chứa lịch sử giá vàng SJC (sheet "SJC") và tỷ giá
// trung tâm (sheet "Tygiatrungtam"). Lấy dữ liệu trực tiếp từ trình duyệt
// người xem qua endpoint gviz công khai của Google, không cần đăng nhập.
const RATES_SHEET_ID = "1eCH0SYZT3Thu6uDycuR9MH98qX2Xvh3cya9QaXto9AU";
const RATES_SHEET_URL = `https://docs.google.com/spreadsheets/d/${RATES_SHEET_ID}/edit`;
const MAX_CHART_POINTS = 30;

type SheetSeries = {
  labels: string[];
  seriesNames: string[];
  seriesValues: (number | null)[][];
};

function gvizJsonp(sheetName: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const callback = `ck_gviz_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Không tải được dữ liệu sau 15 giây."));
    }, 15000);

    function cleanup() {
      window.clearTimeout(timeout);
      delete (window as unknown as Record<string, unknown>)[callback];
      script.remove();
    }

    (window as unknown as Record<string, (value: unknown) => void>)[callback] = (value) => {
      cleanup();
      resolve(value);
    };

    const url = new URL(`https://docs.google.com/spreadsheets/d/${RATES_SHEET_ID}/gviz/tq`);
    url.searchParams.set("sheet", sheetName);
    url.searchParams.set("tqx", `out:json;responseHandler:${callback}`);
    script.onerror = () => {
      cleanup();
      reject(new Error("Không tải được dữ liệu bảng tính. Kiểm tra sheet đã chia sẻ công khai chưa."));
    };
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

function parseCellDate(raw: string): { time: number; display: string } {
  const ctor = raw.match(/^Date\((\d+),(\d+),(\d+)/);
  if (ctor) {
    const [, y, m, d] = ctor;
    const date = new Date(Number(y), Number(m), Number(d));
    return {
      time: date.getTime(),
      display: `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`,
    };
  }
  const match = raw.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (match) {
    const [, d, m, yRaw] = match;
    const year = yRaw.length <= 2 ? Number(yRaw) + 2000 : Number(yRaw);
    return {
      time: new Date(year, Number(m) - 1, Number(d)).getTime(),
      display: `${d.padStart(2, "0")}/${m.padStart(2, "0")}`,
    };
  }
  return { time: 0, display: raw.slice(0, 5) };
}

async function fetchSheetSeries(sheetName: string): Promise<SheetSeries> {
  const response = await gvizJsonp(sheetName);
  if (!response || response.status === "error") {
    const message = response?.errors?.[0]?.detailed_message || response?.errors?.[0]?.message;
    throw new Error(message || "Không đọc được dữ liệu bảng tính.");
  }
  const cols: Array<{ label?: string }> = response.table?.cols || [];
  const rows: Array<{ c: Array<{ v: unknown; f?: string } | null> }> = response.table?.rows || [];
  const seriesNames = cols.slice(1).map((col, index) => col.label || `Cột ${index + 2}`);

  const parsed = rows
    .map((row) => {
      const cells = row.c || [];
      const rawLabel = cells[0] ? String(cells[0].f ?? cells[0].v ?? "") : "";
      const { time, display } = parseCellDate(rawLabel);
      const values = cells.slice(1).map((cell) => {
        const raw = cell ? cell.v : null;
        const num = typeof raw === "number" ? raw : Number(raw);
        return cell && Number.isFinite(num) ? num : null;
      });
      return { display, time, values };
    })
    .filter((row) => row.display);

  parsed.sort((a, b) => a.time - b.time);
  const trimmed = parsed.slice(Math.max(0, parsed.length - MAX_CHART_POINTS));

  return {
    labels: trimmed.map((row) => row.display),
    seriesNames,
    seriesValues: seriesNames.map((_, seriesIndex) => trimmed.map((row) => row.values[seriesIndex] ?? null)),
  };
}

type SeriesColors = string[] | ((name: string, index: number) => string);

function resolveSeriesColor(colors: SeriesColors, name: string, index: number): string {
  return typeof colors === "function" ? colors(name, index) : colors[index % colors.length];
}

function LineChart({
  labels,
  series,
  colors,
  formatValue,
}: {
  labels: string[];
  series: { name: string; values: (number | null)[] }[];
  colors: SeriesColors;
  formatValue: (value: number) => string;
}) {
  const width = 560;
  const height = 240;
  const padding = { top: 14, right: 14, bottom: 30, left: 58 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const allValues = series.flatMap((item) => item.values.filter((value): value is number => value != null));
  const min = allValues.length ? Math.min(...allValues) : 0;
  const max = allValues.length ? Math.max(...allValues) : 1;
  const pad = (max - min) * 0.1 || Math.abs(max) * 0.1 || 1;
  const yMin = min - pad;
  const yMax = max + pad;
  const count = labels.length;

  const x = (index: number) => padding.left + (count <= 1 ? innerW / 2 : (index / (count - 1)) * innerW);
  const y = (value: number) => padding.top + innerH - ((value - yMin) / (yMax - yMin || 1)) * innerH;
  const gridLines = 4;
  const xLabelStep = Math.max(1, Math.ceil(count / 6));

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg" role="img" aria-label="Biểu đồ dữ liệu">
        {Array.from({ length: gridLines + 1 }, (_, i) => {
          const value = yMin + ((yMax - yMin) * i) / gridLines;
          const yPos = y(value);
          return (
            <g key={i}>
              <line x1={padding.left} x2={width - padding.right} y1={yPos} y2={yPos} className="chart-grid" />
              <text x={padding.left - 8} y={yPos + 4} textAnchor="end" className="chart-axis-label">
                {formatValue(value)}
              </text>
            </g>
          );
        })}
        {labels.map((label, i) =>
          i % xLabelStep === 0 || i === count - 1 ? (
            <text key={`${label}-${i}`} x={x(i)} y={height - 8} textAnchor="middle" className="chart-axis-label">
              {label}
            </text>
          ) : null,
        )}
        {series.map((item, seriesIndex) => {
          const color = resolveSeriesColor(colors, item.name, seriesIndex);
          const points = item.values
            .map((value, i) => (value == null ? null : `${x(i)},${y(value)}`))
            .filter((point): point is string => Boolean(point))
            .join(" ");
          return (
            <g key={item.name}>
              <polyline points={points} fill="none" stroke={color} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
              {item.values.map((value, i) =>
                value == null ? null : (
                  <circle key={i} cx={x(i)} cy={y(value)} r={2.6} fill={color}>
                    <title>{`${labels[i]}: ${formatValue(value)}`}</title>
                  </circle>
                ),
              )}
            </g>
          );
        })}
      </svg>
      <div className="chart-legend">
        {series.map((item, seriesIndex) => (
          <span className="chart-legend-item" key={item.name}>
            <i style={{ background: resolveSeriesColor(colors, item.name, seriesIndex) }} />
            {item.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function ChartPanel({
  title,
  icon,
  sheetName,
  colors,
  unitLabel,
  formatValue,
}: {
  title: string;
  icon: ReactNode;
  sheetName: string;
  colors: SeriesColors;
  unitLabel: string;
  formatValue: (value: number) => string;
}) {
  const [data, setData] = useState<SheetSeries | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchSheetSeries(sheetName)
      .then((result) => {
        if (!active) return;
        setData(result);
        setError("");
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Không tải được biểu đồ.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sheetName]);

  return (
    <div className="tool-panel chart-panel">
      <h2>
        {icon} {title}
      </h2>
      <p className="chart-unit">{unitLabel}</p>
      {loading && <p className="loading">Đang tải biểu đồ...</p>}
      {error && <p className="alert inline-alert">{error}</p>}
      {data && data.labels.length > 0 && (
        <LineChart
          labels={data.labels}
          series={data.seriesNames.map((name, i) => ({ name, values: data.seriesValues[i] }))}
          colors={colors}
          formatValue={formatValue}
        />
      )}
      {data && !data.labels.length && <p className="muted">Chưa có dữ liệu.</p>}
      <a className="chart-source-link" href={RATES_SHEET_URL} target="_blank" rel="noopener noreferrer">
        Mở bảng dữ liệu gốc
      </a>
    </div>
  );
}

function NewsDocFrame({ html }: { html: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(320);

  const document_ = useMemo(
    () => `<!doctype html><html><head><meta charset="utf-8" /><base target="_blank" />
      <style>
        body{margin:0;padding:2px 4px 10px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#072b21;line-height:1.65;word-break:break-word;}
        img{max-width:100%;height:auto;}
        table{border-collapse:collapse;max-width:100%;}
        td,th{border:1px solid #bfe6d5;padding:6px 10px;vertical-align:top;}
        a{color:#0a7f5c;}
        h1,h2,h3{color:#076046;}
      </style>
      </head><body>${html}</body></html>`,
    [html],
  );

  function handleLoad() {
    const win = frameRef.current?.contentWindow;
    if (!win) return;
    const measure = () => setHeight((win.document.body?.scrollHeight || 320) + 24);
    measure();
    window.setTimeout(measure, 300);
  }

  return (
    <iframe
      ref={frameRef}
      title="Nội dung bản tin"
      srcDoc={document_}
      onLoad={handleLoad}
      sandbox="allow-same-origin allow-popups"
      style={{ width: "100%", height, border: "none", display: "block" }}
    />
  );
}

function DailyNewsPanel() {
  const [news, setNews] = useState<Awaited<ReturnType<typeof api.getDailyNews>> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api
      .getDailyNews()
      .then((data) => {
        if (!active) return;
        setNews(data);
        setError("");
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Không tải được bản tin.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="order-pane news-panel">
      <div className="section-title">
        <h2>
          <Newspaper size={20} /> Tin tức tổng hợp hôm nay
        </h2>
        {news && <p>{news.isToday ? "Cập nhật hôm nay" : `Bản tin gần nhất · ${formatDateVN(news.updatedAt)}`}</p>}
      </div>
      {loading && <p className="loading">Đang tải bản tin...</p>}
      {error && <p className="alert inline-alert">{error}</p>}
      {news && (
        <>
          <NewsDocFrame html={news.html} />
          {news.docUrl && (
            <a className="news-source-link" href={news.docUrl} target="_blank" rel="noopener noreferrer">
              Mở bản gốc trên Google Docs
            </a>
          )}
        </>
      )}
    </div>
  );
}

const goldFormatter = (value: number) => `${value.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr`;
const rateFormatter = (value: number) => value.toLocaleString("vi-VN", { maximumFractionDigits: 0 });

// Bỏ dấu tiếng Việt để nhận diện cột "tỷ giá tự do" dù cột được đặt tên
// khác chút ít (có/không dấu, viết hoa/thường...).
function stripDiacritics(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
}

const RATE_FALLBACK_COLORS = ["#0ea376", "#8fc9b2", "#d1471f", "#f08a5f", "#076046"];

// Cột "tỷ giá tự do" (thị trường tự do) dễ bị nhầm với các cột màu xanh lá
// khác, nên tô riêng bằng 2 sắc xanh dương để tách biệt hẳn.
function rateSeriesColor(name: string, fallbackIndex: number): string {
  const normalized = stripDiacritics(name);
  if (normalized.includes("tu do")) {
    return normalized.includes("ban") ? "#0ea5e9" : "#2563eb";
  }
  return RATE_FALLBACK_COLORS[fallbackIndex % RATE_FALLBACK_COLORS.length];
}

export function HomePage() {
  return (
    <section className="home-layout">
      <DailyNewsPanel />
      <div className="home-charts">
        <ChartPanel
          title="Giá vàng SJC"
          icon={<Coins size={20} />}
          sheetName="SJC"
          colors={["#0ea376", "#d1471f"]}
          unitLabel="Triệu đồng / lượng · Mua vào - Bán ra"
          formatValue={goldFormatter}
        />
        <ChartPanel
          title="Tỷ giá trung tâm USD/VND"
          icon={<Landmark size={20} />}
          sheetName="Tygiatrungtam"
          colors={rateSeriesColor}
          unitLabel="Đồng / USD"
          formatValue={rateFormatter}
        />
      </div>
      <p className="home-disclaimer">
        * Thông tin được tác giả sử dụng AI tổng hợp từ nhiều nguồn, chỉ mang tính tham khảo, người dùng cần kiểm tra lại trước khi áp dụng.
      </p>
    </section>
  );
}
