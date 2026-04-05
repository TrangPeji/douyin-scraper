# Douyin Bulk Scraper 🚀

**Douyin Bulk Scraper** là một công cụ web mini sử dụng **Puppeteer** và **Node.js** để tự động bypass cơ chế anti-bot của Douyin (TikTok Trung Quốc) và trích xuất dữ liệu từ hàng loạt video cùng một lúc. Đặc biệt hữu ích cho nhà nghiên cứu nội dung (Content Researchers), người làm Marketing, hoặc quản trị viên kênh.

## 🌟 Tính năng
- **Bypass Anti-Bot hiệu quả:** Sử dụng tính năng Network Response Interception kết hợp với headless Chrome thay vì cào HTML thông thường (tránh bị Douyin chặn).
- **Phân tích hàng loạt (Bulk Analysis):** Hỗ trợ nhập 9-10 link Douyin một lần và trích xuất dữ liệu song song.
- **Dịch tự động:** Tự động dịch Caption gốc (Tiếng Trung) sang tiếng Anh nhờ tích hợp Google Translate API.
- **Trích xuất thông minh:**
  - Nhận diện có Voice hay không (âm thanh gốc / TTS).
  - Lấy Caption gốc.
  - Lấy Lượt Thích, Lượt Bình Luận, Lượt Chia Sẻ, Lượt Xem (chế độ chi tiết).
- **Giao diện Modern Glassmorphism:** Đẹp mắt, tương tác trực quan ngay trên trình duyệt. Có tính năng Copy full bảng dữ liệu chỉ với 1 click.

## 🛠 Cài đặt & Sử dụng

### Yêu cầu hệ thống:
- NodeJS (>= 16)
- Trình duyệt Google Chrome đã cài đặt mặc định trên macOS tại `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`

### Cài đặt:
1. Clone dự án về máy:
   ```bash
   git clone <URL_CUA_BAN>
   cd douyin-scraper
   ```
2. Cài đặt các gói phụ thuộc (Dependencies):
   ```bash
   npm install
   ```

### Chạy ứng dụng:
```bash
npm start
```
Ứng dụng sẽ tự động mở cổng `3456`.
Truy cập vào trình duyệt: [http://localhost:3456](http://localhost:3456)

## 🎨 Trải nghiệm UI
1. Copy và dán toàn bộ danh sách link Douyin của bạn vào (hỗ trợ cả link ngắn `v.douyin.com` và link dài `douyin.com/video/...`).
2. Bấm "Bắt đầu Phân tích".
3. Nhấp "Copy Bảng" để copy dữ liệu dưới dạng TSV (phù hợp dán thẳng vào Excel / Google Sheets).

## 🚀 Công nghệ sử dụng
- **Backend:** Node.js, Express, Puppeteer Core.
- **Frontend:** Vanilla HTML/CSS/JS (Không framework), Design theo phong cách Glassmorphism.
- **Translate Engine:** Google Translate API.

---
*Created with ❤️ & AI*
