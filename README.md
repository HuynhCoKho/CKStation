# CK Station

Ứng dụng quản lý bán hàng cho quán cafe nhỏ, dùng Google Sheets làm nơi lưu dữ liệu.

## Tính năng

- Trang khách hàng: chọn bàn, chọn món, số lượng, ghi chú theo từng món, gửi đơn.
- Trang quản lý: xem đơn theo bàn, cập nhật trạng thái món, tính tiền, đóng bàn.
- Quản lý menu: thêm/sửa/ẩn món, loại món, giá bán.
- Quản lý chi phí: ghi chi phí hằng ngày.
- Thống kê ngày: doanh thu, chi phí, lợi nhuận, số đơn đã thanh toán.
- Bảo vệ thao tác quản lý bằng admin token qua Google Apps Script.
- Trang chủ: bản tin tài chính - ngân hàng hằng ngày, biểu đồ giá vàng SJC và tỷ giá trung tâm.

## Bản tin hằng ngày

Bản tin nằm thẳng trong repo và được GitHub Pages phục vụ cùng origin với trang,
không qua Google Drive cũng không qua Apps Script:

```
news/yyyy-mm-dd.md  →  npm run publish-news  →  public/news/latest.json  →  git push  →  Pages tự deploy
```

Mỗi sáng, sau khi Claude tổng hợp xong bản tin:

```bash
npm run publish-news news/2026-08-21.md
```

Script đổi Markdown sang HTML (giữ tiêu đề, bảng số liệu, danh sách, liên kết),
ghi `public/news/latest.json` cho trang chủ và lưu một bản trong
`public/news/archive/` để tra lại. Commit và push là bản tin lên trang.

Nút **Tải lại** ở khối tin tức nạp lại `latest.json` kèm tham số chống cache, dùng
khi vừa đẩy bản tin mới mà không muốn tải lại cả trang.

## Chạy local

```bash
npm install
npm run dev
```

Tạo file `.env.local` từ `.env.example`, rồi điền URL Web App của Google Apps Script.

## Kết nối Google Sheets

1. Mở Google Sheet đích.
2. Vào `Extensions > Apps Script`.
3. Dán nội dung `apps-script/Code.gs`.
4. Chạy hàm `setup()` một lần để tạo các tab dữ liệu.
5. Trong Apps Script, vào `Project Settings > Script properties` và đặt:
   - `SPREADSHEET_ID`: ID Google Sheet của bạn
   - `ADMIN_TOKEN`: mật khẩu quản trị mạnh do bạn tự chọn
6. Deploy dạng Web App:
   - Execute as: `Me`
   - Who has access: `Anyone`
7. Copy Web App URL vào `.env.local`:

```env
VITE_API_URL=https://script.google.com/macros/s/xxx/exec
```

## Xử lý sự cố

### Đăng nhập quản lý được nhưng không tải được dữ liệu

Triệu chứng: mở khóa trang quản lý thành công, nhưng vẫn hiện lỗi không kết nối
được Apps Script và các số liệu đều bằng 0.

Nguyên nhân thường gặp là `loadData` chạy lâu hơn thời gian chờ của trình duyệt,
trong khi `verifyAdmin` thì không: `verifyAdmin` gần như không đọc bảng tính, còn
`loadData` phải đọc toàn bộ Menu, Orders, OrderItems, Expenses, Links và Settings.
Khi Orders/OrderItems lớn dần trong ngày, chỉ `loadData` vượt ngưỡng và hỏng, còn
đăng nhập vẫn chạy bình thường.

Cách kiểm tra, theo thứ tự:

1. Mở thẳng Web App URL trên trình duyệt (không kèm tham số). Nếu trả về JSON
   `{"ok":true,...}` thì deployment còn sống và còn quyền truy cập.
2. Mở `WEB_APP_URL?action=loadData&callback=cb` và bấm giờ. Nếu mất hơn 30 giây,
   hoặc trả về trang HTML đăng nhập của Google thay vì JavaScript, thì lỗi nằm ở
   Apps Script chứ không phải ở web.
3. Trang HTML đăng nhập nghĩa là deployment đã bị đổi `Who has access`. Đặt lại
   thành `Anyone` và deploy phiên bản mới.
4. Trang HTML báo quá hạn mức nghĩa là script đã chạm quota ngày của tài khoản
   Google; quota tự đặt lại theo ngày.
5. Trong Apps Script, xem `Executions` để biết mỗi lần gọi mất bao lâu và có lỗi gì.

Lưu ý: trang web bắt lỗi bằng thời gian chờ, nên mọi phản hồi không phải JavaScript
đều hiện ra cùng một thông báo. Bước 1 và 2 là cách phân biệt chắc chắn nhất.

### Bảo trì bảng tính

`setup()` chỉ chạy lại tối đa 6 tiếng một lần nhờ cache. Nếu bạn vừa xóa hoặc đổi
tên tab trong Google Sheet, hãy mở Apps Script và chạy tay hàm `setup()` để tạo lại
ngay thay vì chờ cache hết hạn.

## Bảo mật

- Người khác không thể chỉnh source trong repo nếu không được cấp quyền GitHub.
- Khách hàng chỉ gọi được API đặt món và đọc menu.
- Các API quản lý yêu cầu `ADMIN_TOKEN`; không chia sẻ token này cho khách.
- Không cấp quyền chỉnh sửa trực tiếp Google Sheet cho người không quản trị.

Repo này ai cũng tải về được, nên phải giữ nguyên các ranh giới sau:

- `ADMIN_TOKEN` và `SPREADSHEET_ID` chỉ nằm trong Script properties của Apps Script,
  không bao giờ đưa vào source.
- Web App URL chỉ nằm trong GitHub Actions secret `VITE_API_URL`, không đưa vào repo.
  URL này vẫn xuất hiện trong file JavaScript đã build trên GitHub Pages, đó là điều
  không tránh được với web tĩnh, nên toàn bộ an toàn của phần quản lý phụ thuộc vào
  `ADMIN_TOKEN`.
- Endpoint Apps Script mở công khai và không giới hạn số lần thử, vì vậy `ADMIN_TOKEN`
  cần dài và ngẫu nhiên, không dùng mật khẩu dễ đoán.
- Token được gửi kèm trên query string nên có thể lưu lại trong lịch sử trình duyệt
  và log của Google. Chỉ nhập token trên thiết bị quản lý tin cậy, và đổi token nếu
  thiết bị đó bị mất.
- Đặt quyền chia sẻ Google Sheet ở mức `Restricted`. Biết `SPREADSHEET_ID` không đủ
  để đọc dữ liệu, nhưng nếu bảng được chia sẻ ở mức `Anyone with the link` thì ID lộ
  ra sẽ thành quyền đọc thật.
