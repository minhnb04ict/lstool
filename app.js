const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const port = Number(process.env.PORT) || 3000;
const STUDENT_API_URL = process.env.STUDENT_API_URL || 'https://script.google.com/macros/s/AKfycby-zAwnoLFKwBHZkOUOmV-UZG9gp9L6QUmgTGvdrYpGiG9dLY6F9lLBIugvNzQH_GxB/exec';
const UPLOAD_API_URL = process.env.APP_SCRIPT_UPLOAD_URL || process.env.APP_SCRIPT_URL || '';
const WEEKS_API_URL = 'https://script.google.com/macros/s/AKfycbz9RBIRBDQD66WCLElWIO0acGC2NF2uNg_q0Kk35p9BUxU49om6Ug8WspfrGE6M3YE/exec';
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 1;
const GOOGLE_API_TIMEOUT_MS = 15_000;
const GOOGLE_API_RETRIES = 3;

const classes = ['2A01', '2A02', '2A03', '2A04', '2A05', '2A06', '2A07'];

async function getGoogleJsonWithRetry(url) {
  let lastError;

  for (let attempt = 1; attempt <= GOOGLE_API_RETRIES; attempt += 1) {
    try {
      return await axios.get(url, {
        responseType: 'json',
        timeout: GOOGLE_API_TIMEOUT_MS
      });
    } catch (error) {
      lastError = error;
      if (attempt < GOOGLE_API_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
      }
    }
  }

  throw lastError;
}

async function fetchStudentsFromApi() {
  try {
    const response = await getGoogleJsonWithRetry(STUDENT_API_URL);
    const data = response.data || [];
    return (data || []).map((item) => ({
      classId: item.Class || '',
      studentId: item['Stu number'] || '',
      studentName: item['Full name'] || '',
      studentIndex: item.Stt || item.stt || '',
      dob: item['date of birth'] || ''
    }));
  } catch (error) {
    console.error('Không tải được dữ liệu học sinh:', error.message);
    return [];
  }
}

async function fetchWeeksFromApi() {
  try {
    const response = await getGoogleJsonWithRetry(WEEKS_API_URL);
    const data = response.data || [];
    const ignoredWeekColumns = new Set(['Tuần', 'Nội dung']);
    return (data || []).map((item) => ({
      value: String(item.Tuần || '').trim(),
      label: `Tuần ${item.Tuần || ''}`,
      content: item['Nội dung'] || '',
      links: Object.entries(item)
        .filter(([key, value]) => !ignoredWeekColumns.has(key) && /^https?:\/\//i.test(String(value || '').trim()))
        .map(([key, value]) => ({
          label: key,
          url: String(value || '').trim()
        }))
    }));
  } catch (error) {
    console.error('Không tải được danh sách tuần:', error.message);
    return [];
  }
}

function parseJsonSafely(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch (error) {
    return null;
  }
}

function sanitizeDriveName(name) {
  return String(name || '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function getExtension(name) {
  const dot = String(name || '').lastIndexOf('.');
  return dot >= 0 ? String(name).slice(dot).toLowerCase() : '';
}

function getUploadPrefix(classId, studentName, weekLabel) {
  return `${sanitizeDriveName(classId)}_${sanitizeDriveName(studentName)}_${sanitizeDriveName(weekLabel)}_`;
}

async function fetchGalleryItemsFromUploadApi({ weekValue, weekLabel, classId }) {
  const response = await axios.get(UPLOAD_API_URL, {
    params: { action: 'gallery', weekValue, weekLabel, classId },
    validateStatus: () => true,
    responseType: 'text'
  });

  if (response.status >= 400) {
    return [];
  }

  const result = parseJsonSafely(response.data || '');
  if (!result || !result.success || !Array.isArray(result.items)) {
    return [];
  }

  return result.items;
}

async function verifyUploadCreated({ classId, studentName, weekValue, weekLabel, fileName }) {
  const prefix = getUploadPrefix(classId, studentName, weekLabel);
  const extension = getExtension(fileName);

  for (let attempt = 1; attempt <= GOOGLE_API_RETRIES; attempt += 1) {
    const items = await fetchGalleryItemsFromUploadApi({ weekValue, weekLabel, classId });
    const uploadedItem = items.find((item) => {
      const uploadedName = String(item.name || '');
      return uploadedName.startsWith(prefix) && (!extension || uploadedName.toLowerCase().endsWith(extension));
    });

    if (uploadedItem) {
      const versionMatch = String(uploadedItem.name || '').match(/(\d+)(?:\.[^.]+)?$/);
      return {
        success: true,
        fileName: uploadedItem.name,
        url: uploadedItem.url,
        folderName: weekLabel,
        classFolderName: classId,
        version: versionMatch ? Number(versionMatch[1]) : 1,
        verifiedByGallery: true
      };
    }

    if (attempt < GOOGLE_API_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }

  return null;
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
// Base64 increases a 8 MB file to about 6.7 MB. The browser can send up to five
// files in one request, so reserve enough room for their Base64 representations.
app.use(express.json({ limit: '36mb' }));

app.get('/', async (req, res) => {
  const students = await fetchStudentsFromApi();
  const weeks = await fetchWeeksFromApi();
  res.render('index', {
    title: 'Quản lý học tập',
    classes,
    students,
    weeks,
    savedStudent: null,
    message: ''
  });
});

app.get('/api/students', async (req, res) => {
  const students = await fetchStudentsFromApi();
  res.json({ success: true, students });
});

app.get('/api/weeks', async (req, res) => {
  const weeks = await fetchWeeksFromApi();
  res.json({ success: true, weeks });
});

app.get('/api/gallery', async (req, res) => {
  const weekValue = String(req.query.weekValue || '').trim();
  const weekLabel = String(req.query.weekLabel || '').trim();
  const classId = String(req.query.classId || '').trim();

  if ((!weekValue && !weekLabel) || !classId) {
    return res.status(400).json({ success: false, message: 'Chưa chọn lớp hoặc tuần để xem sản phẩm.' });
  }

  if (!UPLOAD_API_URL) {
    return res.status(500).json({ success: false, message: 'Chưa cấu hình URL Apps Script.' });
  }

  try {
    const response = await axios.get(UPLOAD_API_URL, {
      params: { action: 'gallery', weekValue, weekLabel, classId },
      responseType: 'text'
    });
    const result = JSON.parse(response.data || '{}');

    if (!result.success) {
      return res.status(502).json({ success: false, message: result.message || 'Chưa tải được sản phẩm.' });
    }

    return res.json({ success: true, items: result.items || [] });
  } catch (error) {
    console.error('Không tải được góc trưng bày:', error.message);
    return res.status(502).json({ success: false, message: 'Chưa tải được sản phẩm. Con thử lại nhé!' });
  }
});

app.post('/api/submit', async (req, res) => {
  const { studentId, studentName, classId, weekValue, weekLabel, files = [] } = req.body || {};

  if (!studentId || !studentName || !classId) {
    return res.status(400).json({ success: false, message: 'Con chưa chọn tên đúng. Con chọn lại nhé!' });
  }

  if (!weekValue) {
    return res.status(400).json({ success: false, message: 'Con chọn tuần bài học trước nhé!' });
  }

  const allStudents = await fetchStudentsFromApi();
  const student = allStudents.find((item) => item.studentId === studentId && item.studentName === studentName && item.classId === classId);
  if (!student) {
    return res.status(400).json({ success: false, message: 'Thông tin học sinh chưa đúng. Con chọn lại nhé!' });
  }

  if (!Array.isArray(files) || !files.length) {
    return res.status(400).json({ success: false, message: 'Con hãy thêm bài làm trước nhé!' });
  }

  if (files.length > MAX_FILES) {
    return res.status(400).json({ success: false, message: 'Mỗi lần con chỉ có thể nộp 1 file nhé!' });
  }

  const oversizedFile = files.find((file) => Buffer.from(file.base64 || '', 'base64').length > MAX_FILE_SIZE_BYTES);
  if (oversizedFile) {
    return res.status(400).json({ success: false, message: 'Mỗi file chỉ được tối đa 5 MB. Con chọn file nhỏ hơn nhé!' });
  }

  if (!UPLOAD_API_URL) {
    return res.status(500).json({ success: false, message: 'Chưa cấu hình URL upload Apps Script. Hãy set APP_SCRIPT_UPLOAD_URL trong file .env.' });
  }

  try {
    const uploadResults = [];
    let submissionVersion;
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const resolvedWeekLabel = weekLabel || `Tuần ${weekValue}`;
      // Apps Script Web Apps do not expose multipart files as e.parameter.file.
      // Send Base64 in JSON and let doPost create the Drive Blob instead.
      const response = await axios.post(UPLOAD_API_URL, {
        className: classId,
        studentName,
        weekValue,
        weekLabel: resolvedWeekLabel,
        // Apps Script assigns the next version for the first file. Reuse it so
        // all files selected in this single submission receive the same version.
        submissionVersion,
        fileName: file.name || `file-${index + 1}`,
        fileType: file.type || 'application/octet-stream',
        fileBase64: file.base64 || ''
      }, {
        validateStatus: () => true,
        responseType: 'text',
        headers: { 'Content-Type': 'application/json' },
        maxBodyLength: 8 * 1024 * 1024
      });

      let result = {};
      const rawText = response.data || '';

      if (response.status >= 400) {
        result = await verifyUploadCreated({
          classId,
          studentName,
          weekValue,
          weekLabel: resolvedWeekLabel,
          fileName: file.name || `file-${index + 1}`
        }) || {
          success: false,
          message: `Apps Script trả về mã trạng thái ${response.status}.`,
          details: rawText.slice(0, 500)
        };
      } else if (!rawText) {
        result = {
          success: false,
          message: 'Apps Script không trả về nội dung nào.',
          details: 'Hãy kiểm tra lại Web App đã deploy và quyền truy cập.'
        };
      } else {
        result = parseJsonSafely(rawText);
        if (!result) {
          result = await verifyUploadCreated({
            classId,
            studentName,
            weekValue,
            weekLabel: resolvedWeekLabel,
            fileName: file.name || `file-${index + 1}`
          }) || {
            success: false,
            message: 'Apps Script trả về dữ liệu không phải JSON.',
            details: rawText.slice(0, 500)
          };
        }
      }

      if (!result.success) {
        throw new Error(result.message + (result.details ? `\n${result.details}` : ''));
      }

      if (!submissionVersion) {
        submissionVersion = Number(result.version);
        if (!Number.isInteger(submissionVersion) || submissionVersion < 1) {
          if (files.length > 1) {
            throw new Error('Apps Script chưa trả về số lần nộp hợp lệ.');
          }
          submissionVersion = 1;
        }
      }
      uploadResults.push(result);
    }

    const submittedAt = new Date().toLocaleString('vi-VN', { hour12: false });
    const submissionId = `SUB-${Date.now()}`;

    return res.json({
      success: true,
      message: 'Con đã nộp bài thành công!',
      submissionId,
      submittedAt,
      classId,
      studentName,
      weekValue,
      weekLabel: weekLabel || `Tuần ${weekValue}`,
      fileCount: files.length,
      uploads: uploadResults
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Chưa gửi được bài. Con thử lại nhé!'
    });
  }
});

// Keep API errors JSON so the browser never receives Express's default HTML error page.
app.use((error, req, res, next) => {
  if (error && error.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      message: 'Bài của con hơi lớn. Mỗi file chỉ được tối đa 5 MB nhé!'
    });
  }

  console.error(error);
  return res.status(error.status || 500).json({
    success: false,
    message: 'Chưa gửi được bài. Con thử lại nhé!'
  });
});

app.use((req, res) => {
  res.status(404).render('index', {
    title: '404',
    message: 'Trang không tồn tại.',
    classes,
    students: [],
    weeks: [],
    savedStudent: null
  });
});

const startServer = (portToUse) => {
  const server = app.listen(portToUse, () => {
    console.log(`Server đang chạy tại http://localhost:${portToUse}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      const nextPort = portToUse + 1;
      console.warn(`Cổng ${portToUse} đang bận, đang thử ${nextPort}...`);
      server.close(() => startServer(nextPort));
    } else {
      throw error;
    }
  });
};

startServer(port);
