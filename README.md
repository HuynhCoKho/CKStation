# CK Station

Ứng dụng quản lý bán hàng cho quán cafe nhỏ, dùng Google Sheets làm nơi lưu dữ liệu.

## Tính năng

- Trang khách hàng: chọn bàn, chọn món, số lượng, ghi chú theo từng món, gửi đơn.
- Trang quản lý: xem đơn theo bàn, cập nhật trạng thái món, tính tiền, đóng bàn.
- Quản lý menu: thêm/sửa/ẩn món, loại món, giá bán.
- Quản lý chi phí: ghi chi phí hằng ngày.
- Thống kê ngày: doanh thu, chi phí, lợi nhuận, số đơn đã thanh toán.
- Bảo vệ thao tác quản lý bằng admin token qua Google Apps Script.

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
   - `SPREADSHEET_ID`: `15C95YKp6JdyQHsKBUp9qN9ZAA6SmFQvRCt7G8dUj4RE`
   - `ADMIN_TOKEN`: mật khẩu quản trị mạnh do bạn tự chọn
6. Deploy dạng Web App:
   - Execute as: `Me`
   - Who has access: `Anyone`
7. Copy Web App URL vào `.env.local`:

```env
VITE_API_URL=https://script.google.com/macros/s/xxx/exec
```

## Bảo mật

- Người khác không thể chỉnh source trong repo nếu không được cấp quyền GitHub.
- Khách hàng chỉ gọi được API đặt món và đọc menu.
- Các API quản lý yêu cầu `ADMIN_TOKEN`; không chia sẻ token này cho khách.
- Không cấp quyền chỉnh sửa trực tiếp Google Sheet cho người không quản trị.
