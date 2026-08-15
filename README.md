# LSTool

LSTool là ứng dụng web Node.js/Express cho học sinh lớp 2 chọn lớp, chọn tên, chọn tuần học và nộp bài lên Google Drive thông qua Google Apps Script Web App.

Ứng dụng hiện có:

- Giao diện EJS một trang, tối ưu cho thao tác đơn giản.
- Danh sách lớp cố định trong `app.js`: `2A01` đến `2A07`.
- Danh sách học sinh lấy từ một Apps Script/Google Sheet qua `STUDENT_API_URL`.
- Danh sách tuần học, nội dung và link bài tập lấy từ một Apps Script khác.
- Nộp 1 file mỗi lần bằng ảnh dán từ clipboard hoặc file upload.
- Xem trước ảnh trước khi nộp.
- Upload file lên Google Drive qua `upload.gs`.
- Xem gallery sản phẩm theo lớp và tuần.

## Công nghệ

- Node.js
- Express 4
- EJS
- Vanilla JavaScript
- CSS
- Axios
- Google Apps Script
- Google Drive

## Cấu trúc dự án

```text
.
├── app.js                  # Express server, API routes, tích hợp Apps Script
├── package.json            # Scripts và dependencies
├── package-lock.json
├── upload.gs               # Google Apps Script Web App để upload/xem gallery
├── appsscript.json         # Cấu hình Apps Script
├── APPS_SCRIPT_DEPLOY.md   # Ghi chú deploy Apps Script
├── views/
│   └── index.ejs           # Giao diện chính và JavaScript phía trình duyệt
└── public/
    └── css/
        └── style.css       # Style giao diện
```

## Cài đặt

Yêu cầu Node.js 18+.

```bash
npm install
```

Tạo file `.env` ở thư mục gốc:

```env
PORT=3000
STUDENT_API_URL=https://script.google.com/macros/s/YOUR_STUDENT_WEB_APP_ID/exec
APP_SCRIPT_UPLOAD_URL=https://script.google.com/macros/s/YOUR_UPLOAD_WEB_APP_ID/exec
```

`APP_SCRIPT_UPLOAD_URL` cũng có thể được đọc từ `APP_SCRIPT_URL`, nhưng nên dùng `APP_SCRIPT_UPLOAD_URL` cho rõ nghĩa.

## Chạy dự án

Chạy production/local bình thường:

```bash
npm start
```

Chạy development với nodemon:

```bash
npm run dev
```

Mở trình duyệt tại:

```text
http://localhost:3000
```

Nếu cổng đang bận, server sẽ tự thử cổng kế tiếp.

## Biến môi trường

| Biến | Bắt buộc | Ý nghĩa |
|---|---:|---|
| `PORT` | Không | Cổng chạy Express, mặc định `3000` |
| `STUDENT_API_URL` | Không | URL Apps Script trả về danh sách học sinh. Nếu không đặt, app dùng URL mặc định trong `app.js` |
| `APP_SCRIPT_UPLOAD_URL` | Có để upload/gallery | URL Apps Script triển khai từ `upload.gs` |
| `APP_SCRIPT_URL` | Không | Fallback nếu chưa đặt `APP_SCRIPT_UPLOAD_URL` |

Không commit `.env` nếu có URL hoặc thông tin riêng của trường/lớp.

## Dữ liệu học sinh

Endpoint `STUDENT_API_URL` cần trả về JSON array. `app.js` đang đọc các cột:

| Cột từ nguồn | Trường trong app |
|---|---|
| `Class` | `classId` |
| `Stu number` | `studentId` |
| `Full name` | `studentName` |
| `Stt` hoặc `stt` | `studentIndex` |
| `date of birth` | `dob` |

Ví dụ:

```json
[
  {
    "Class": "2A01",
    "Stu number": "2A01-001",
    "Full name": "Nguyen Van An",
    "Stt": 1,
    "date of birth": "01/01/2018"
  }
]
```

## Dữ liệu tuần học

Danh sách tuần hiện được lấy từ URL cố định trong `app.js` qua biến `WEEKS_API_URL`.

Nguồn này cần trả về JSON array với các cột:

| Cột từ nguồn | Ý nghĩa |
|---|---|
| `Tuần` | Số/nhãn tuần |
| `Nội dung` | Nội dung bài học |
| `Link 1` đến `Link 6` | Link bài tập hiển thị trên giao diện |

App tự sắp xếp tuần mới nhất lên trước và tự chọn tuần mới nhất nếu có dữ liệu.

## Luồng sử dụng

1. Học sinh mở app.
2. Chọn lớp.
3. Chọn tên.
4. Xác nhận thông tin.
5. Chọn tuần học.
6. Mở link bài tập nếu có.
7. Dán ảnh bằng nút `DÁN` hoặc chọn file bằng `TẢI LÊN`.
8. Kiểm tra file/preview.
9. Nhấn `NỘP BÀI`.
10. App gửi file lên Apps Script, Apps Script lưu vào Google Drive.

## API Express

### `GET /`

Render giao diện chính.

### `GET /api/students`

Lấy danh sách học sinh từ `STUDENT_API_URL`.

Response:

```json
{
  "success": true,
  "students": []
}
```

### `GET /api/weeks`

Lấy danh sách tuần học.

Response:

```json
{
  "success": true,
  "weeks": []
}
```

### `GET /api/gallery`

Lấy danh sách sản phẩm đã nộp theo lớp và tuần.

Query:

- `weekValue`
- `weekLabel`
- `classId`

### `POST /api/submit`

Nộp bài.

Request body là JSON, trong đó file được gửi dạng Base64:

```json
{
  "studentId": "2A01-001",
  "studentName": "Nguyen Van An",
  "classId": "2A01",
  "weekValue": "1",
  "weekLabel": "Tuần 1",
  "files": [
    {
      "name": "bai-lam.png",
      "type": "image/png",
      "base64": "..."
    }
  ]
}
```

Response thành công:

```json
{
  "success": true,
  "message": "Con đã nộp bài thành công!",
  "submissionId": "SUB-1234567890",
  "submittedAt": "15/08/2026 12:00:00",
  "fileCount": 1,
  "uploads": []
}
```

## Giới hạn upload

- Mỗi lần nộp tối đa 1 file.
- Giao diện giới hạn file tối đa 5 MB.
- Apps Script cũng kiểm tra file tối đa 5 MB.
- Server Express có hằng `MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024`, nhưng giới hạn hiệu lực thực tế vẫn nên xem là 5 MB vì frontend và Apps Script đang dùng 5 MB.
- Loại file được chọn từ máy: `.jpg`, `.jpeg`, `.png`, `.pdf`, `.doc`, `.docx`, `.ppt`, `.pptx`.
- Dán từ clipboard hiện hỗ trợ ảnh.

## Google Apps Script

File `upload.gs` cung cấp:

- `doPost(e)`: nhận JSON Base64, tạo file trong Google Drive.
- `doGet(e)`: nếu `action=gallery` thì trả về danh sách file đã nộp; nếu không thì trả HTML kiểm tra đơn giản.
- Tự tạo thư mục theo cấu trúc: lớp → tuần.
- Tự đặt tên file theo mẫu:

```text
{Lớp}_{Tên học sinh}_{Tuần}_nộp lần {version}.{ext}
```

Ví dụ:

```text
2A01_Nguyen Van An_Tuần 1_nộp lần 1.png
```

File ví dụ trên sẽ nằm trong:

```text
2A01/Tuần 1/
```

### Cấu hình thư mục Drive

Trong `upload.gs`, folder Drive đang được hard-code bằng:

```javascript
const folderId = '1U8sDWPq8yB9G8VkzI8t70NA1y4yc5dnv';
```

Nếu đổi thư mục nhận bài, sửa cả hai vị trí đang dùng `folderId` trong `doPost` và `getGallery`.

### Deploy Apps Script

1. Mở Apps Script.
2. Tạo project mới hoặc mở project hiện có.
3. Dán nội dung `upload.gs`.
4. Thêm/cập nhật `appsscript.json` nếu cần.
5. Chọn `Deploy` → `New deployment`.
6. Chọn loại `Web app`.
7. Đặt:
   - `Execute as`: `Me`
   - `Who has access`: `Anyone`
8. Deploy và cấp quyền Drive.
9. Copy Web App URL vào `.env`:

```env
APP_SCRIPT_UPLOAD_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

10. Khởi động lại server Node.js.

## Ghi chú bảo trì

- Danh sách lớp đang hard-code trong `app.js`. Nếu thêm lớp, sửa mảng `classes`.
- URL tuần học đang hard-code trong `app.js`. Nếu cần cấu hình linh hoạt, nên chuyển sang biến môi trường.
- App hiện gửi file qua Base64 JSON để tương thích Apps Script Web App, không dùng `multipart/form-data`.
- `upload.gs` không ghi log submission vào Google Sheet; lịch sử hiện nằm ở file trong Drive và version được suy ra từ tên file.
- Một số chuỗi tiếng Việt trong source hiện có dấu hiệu lỗi encoding khi xem qua terminal. Nếu chỉnh giao diện, nên lưu file bằng UTF-8.

## Kiểm tra nhanh

1. Chạy `npm install`.
2. Cấu hình `.env`.
3. Chạy `npm start`.
4. Mở `http://localhost:3000`.
5. Chọn lớp và học sinh.
6. Chọn tuần.
7. Dán ảnh hoặc chọn file nhỏ hơn 5 MB.
8. Nộp bài.
9. Kiểm tra file trong Google Drive.
10. Nhấn `XEM` để kiểm tra gallery theo tuần/lớp.
