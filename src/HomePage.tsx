import { BookOpen, Newspaper, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { formatDateVN, todayKey } from "./lib/money";

// Bản tin hằng ngày nằm thẳng trong repo (public/news/latest.json) và được
// GitHub Pages phục vụ cùng origin với trang, nên chỉ cần một lần fetch: không
// qua Google Drive, không qua Apps Script, người xem không phải đăng nhập.
const newsUrl = `${import.meta.env.BASE_URL}news/latest.json`;

type DailyNews = {
  date: string;
  title: string;
  publishedAt: string;
  html: string;
};

async function fetchDailyNews(): Promise<DailyNews> {
  // Kèm tham số thời gian để trình duyệt và CDN của GitHub Pages không trả lại
  // bản tin cũ còn trong cache ngay sau khi bản mới vừa được đẩy lên.
  const response = await fetch(`${newsUrl}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? "Chưa có bản tin nào được đăng lên trang."
        : `Không tải được bản tin (mã lỗi ${response.status}).`,
    );
  }
  const data = (await response.json()) as DailyNews;
  if (!data || !data.html) throw new Error("Bản tin tải về không có nội dung.");
  return data;
}

// Thư mục Drive dùng làm hộp thư giữa claude.ai và trang: Claude lưu bản tin
// thành Google Doc đặt tên theo ngày, GitHub Actions nhặt bản mới nhất về rồi
// tự đăng lên trang.
const NEWS_FOLDER_ID = "1xI1dSHl27BPUC1bE9gD4fEJtM9AgxZLS";

// Nút soạn bản tin chỉ dành cho chủ trang, khách vào quán không cần thấy. Mở
// trang kèm ?admin=1 (nên lưu thành bookmark ở máy cơ quan) hoặc đã đăng nhập
// quản lý là nút hiện ra.
function canComposeNews() {
  if (typeof window === "undefined") return false;
  if (new URLSearchParams(window.location.search).get("admin") === "1") return true;
  return Boolean(sessionStorage.getItem("ck_admin_token") || localStorage.getItem("ck_admin_token"));
}

// Giờ Việt Nam bất kể máy người xem đặt múi giờ nào.
function formatTimeVN(iso: string) {
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(time);
}

function composeNewsPrompt() {
  const date = todayKey();
  const now = formatTimeVN(new Date().toISOString());
  return [
    `Dùng skill ban-tin-tai-chinh-ngan-hang để tổng hợp bản tin tài chính - ngân hàng cho ngày ${formatDateVN(date)}.`,
    "",
    `Bây giờ là ${now} giờ Việt Nam. Dòng "Thời điểm cập nhật" phải ghi đúng giờ thực tế lúc tổng hợp, đừng tự đặt một giờ khác.`,
    "",
    "Soạn xong thì lưu thành một Google Doc MỚI trong thư mục Drive này:",
    `https://drive.google.com/drive/folders/${NEWS_FOLDER_ID}`,
    "",
    `Đặt tên tài liệu đúng dạng (không dấu): ${date} - Ban tin tai chinh - ngan hang`,
    "",
    "Trang CKStation tự nhặt bản tin mới nhất trong thư mục này theo ngày ghi trong tên file, nên tên file phải đúng dạng trên thì bản tin mới lên được trang.",
  ].join("\n");
}

function DailyNewsPanel() {
  const [news, setNews] = useState<DailyNews | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    fetchDailyNews()
      .then((data) => {
        setNews(data);
        setError("");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được bản tin."))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const isToday = news ? news.date === todayKey() : false;
  const [canCompose] = useState(canComposeNews);
  const [prompt, setPrompt] = useState("");
  const [hint, setHint] = useState("");

  function openClaude() {
    const text = composeNewsPrompt();
    setPrompt(text);
    // Mở tab trước rồi mới chép, vì chờ clipboard xong mới gọi window.open thì
    // trình duyệt coi đó là popup tự động và chặn.
    window.open(`https://claude.ai/new?q=${encodeURIComponent(text)}`, "_blank", "noopener");
    navigator.clipboard?.writeText(text).then(
      () => setHint("Đã mở claude.ai và chép sẵn câu lệnh. Nếu ô chat trống, dán bằng Ctrl+V rồi Enter."),
      () => setHint("Đã mở claude.ai. Chưa chép được câu lệnh, hãy chép tay ở khung bên dưới."),
    );
  }

  return (
    <div className="order-pane news-panel">
      <div className="section-title">
        <h2>
          <Newspaper size={20} /> Tin tức tổng hợp hôm nay
        </h2>
        <div className="news-meta">
          {news && (
            <p>
              {isToday ? "Cập nhật hôm nay" : `Bản tin gần nhất · ${formatDateVN(news.date)}`}
              {formatTimeVN(news.publishedAt) && ` · ${formatTimeVN(news.publishedAt)}`}
            </p>
          )}
          {canCompose && (
            <button type="button" className="news-refresh news-compose" onClick={openClaude}>
              <Sparkles size={15} /> Tạo bản tin hôm nay
            </button>
          )}
          <button type="button" className="news-refresh" onClick={load} disabled={loading}>
            <RefreshCw size={15} /> {loading ? "Đang tải" : "Tải lại"}
          </button>
        </div>
      </div>
      {hint && (
        <div className="news-hint">
          <p>{hint}</p>
          <p className="muted">
            Claude soạn xong và lưu Google Doc là trang tự cập nhật trong khoảng 15 phút. Muốn xem ngay thì bấm Tải lại
            sau đó.
          </p>
          <details>
            <summary>Xem câu lệnh</summary>
            <pre>{prompt}</pre>
          </details>
        </div>
      )}
      {/* Bản tin trên trang không phải của hôm nay thì nói rõ đang chờ máy chủ
          nhặt về, để khỏi tưởng nút Tải lại hỏng. */}
      {news && !isToday && !hint && (
        <p className="news-pending muted">
          Bản tin hôm nay chưa lên trang. Nếu vừa lưu Google Doc xong, máy chủ sẽ tự nhặt về trong khoảng 15 phút - bấm
          Tải lại sau đó.
        </p>
      )}
      {loading && !news && <p className="loading">Đang tải bản tin...</p>}
      {error && <p className="alert inline-alert">{error}</p>}
      {/* HTML do scripts/publish-news.mjs sinh ra từ Markdown trong repo, mọi ký
          tự của nội dung gốc đã được escape nên không có đường chèn mã lạ. */}
      {news && <div className="news-body" dangerouslySetInnerHTML={{ __html: news.html }} />}
    </div>
  );
}
export function HomePage() {
  return (
    <section className="home-layout">
      <DailyNewsPanel />
      <section className="faq-embed-panel" aria-labelledby="faq-embed-title">
        <div className="faq-embed-heading">
          <h2 id="faq-embed-title"><BookOpen size={20} /> Tra cứu Câu hỏi thường gặp NHNN</h2>
          <a href="https://huynhcokho.github.io/SBVFAQ/" target="_blank" rel="noopener noreferrer">
            Mở trang riêng
          </a>
        </div>
        <iframe
          className="faq-embed-frame"
          src="https://huynhcokho.github.io/SBVFAQ/"
          title="Trang Câu hỏi thường gặp của Ngân hàng Nhà nước"
          loading="lazy"
        />
      </section>
      <p className="home-disclaimer">
        * Nội dung FAQ được phục vụ trực tiếp từ trang SBV FAQ; CKStation chỉ nhúng giao diện và không sao chép hoặc sửa nội dung nguồn.
      </p>
    </section>
  );
}
