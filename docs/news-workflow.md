# Xuất bản và gỡ bản tin CK Station

Workflow [Bản tin](../.github/workflows/news.yml) có hai cách chạy thủ công:

- `publish`: đọc Google Doc mới nhất trong thư mục bản tin Drive và đăng lại,
  kể cả khi ngày đó đã có trên trang. Dùng sau khi sửa một bản tin cùng ngày.
- `unpublish`: nhập ngày `YYYY-MM-DD`, gỡ ngày đó khỏi trang và danh sách lưu.
  Nếu đó là bản mới nhất, trang chuyển về bản archive gần nhất còn lại.

Việc gỡ bài không xóa Google Doc trong Drive và cũng không xóa lịch sử commit.
Workflow tự build và triển khai GitHub Pages sau khi nội dung thay đổi.

Các thao tác thủ công được gọi trong GitHub Actions → workflow **Bản tin** →
**Run workflow**. Lệnh tự động theo lịch vẫn chỉ đăng khi có ngày mới, tránh
ghi đè bản tin hằng ngày ngoài ý muốn.
