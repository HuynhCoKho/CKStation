# Bảo mật vận hành

## Quyền chỉnh source

- Không thêm người lạ vào quyền `Write`, `Maintain`, hoặc `Admin` của repo GitHub.
- Bật bảo vệ nhánh `main` trong GitHub repository settings nếu repo có nhiều người tham gia.
- Không commit file `.env`, `.env.local`, token, hoặc mật khẩu quản trị.

## Quyền chỉnh dữ liệu

- Google Sheet chỉ nên chia sẻ quyền xem hoặc không chia sẻ cho khách.
- Web App Apps Script chạy bằng tài khoản chủ quán, nhưng thao tác quản lý phải có `ADMIN_TOKEN`.
- Chỉ nhập `ADMIN_TOKEN` trên thiết bị quản lý đáng tin cậy.
- Nếu nghi ngờ lộ mã, đổi `ADMIN_TOKEN` trong Script properties và deploy lại Apps Script.

## Lưu ý

Nếu website được publish công khai, người xem vẫn có thể đọc mã frontend đã build. Vì vậy không đặt mật khẩu, khóa API riêng tư, hoặc quyền ghi trực tiếp Google Sheets trong frontend.
