# Hướng dẫn deploy Apps Script cho LSTool

## 1. Mở Apps Script
- Mở file Code.gs trong Apps Script editor.
- Đảm bảo đã có các hàm: doGet, doPost, getDriveFolderId, getOrCreateFolder, getWeekFolderName.

## 2. Cấu hình folder Drive
- Folder upload hiện đang dùng ID:
  - 1U8sDWPq8yB9G8VkzI8t70NA1y4yc5dnv
- Nếu muốn đổi sang folder khác, sửa dòng trong Code.gs:
  - DRIVE_FOLDER_ID: '1U8sDWPq8yB9G8VkzI8t70NA1y4yc5dnv'

## 3. Deploy Web App
- Nhấn Deploy → New deployment
- Chọn loại: Web app
- Cài đặt:
  - Execute as: Me
  - Who has access: Anyone
- Nhấn Deploy
- Copy URL Web App mới

## 4. Cập nhật project
Mở file .env và thay giá trị:

```env
APP_SCRIPT_UPLOAD_URL=YOUR_NEW_WEB_APP_URL
```

## 5. Khởi động lại dự án
Chạy:

```bash
cd e:\Projects\LSTool
node app.js
```

## 6. Kiểm tra
- Mở: http://localhost:3000
- Chọn lớp, học sinh, tuần
- Upload file
- File sẽ được lưu vào folder Drive đã cấu hình
- Cấu trúc thư mục upload là: lớp → tuần học
  - Ví dụ: 2A01/Tuần 1/
- Tên file sẽ theo mẫu:
  - 2A01_Nguyễn Văn An_Tuần 1_nộp lần 1
