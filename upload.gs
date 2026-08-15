function doGet(e) {
  const params = (e && e.parameter) || {};
  const action = params.action || '';
  if (action === 'gallery') {
    return getGallery(params);
  }

  return HtmlService.createHtmlOutput('<h1>LSTool Upload</h1><p>Use POST to upload files.</p>')
    .setTitle('LSTool Upload')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    const payload = JSON.parse((e.postData && e.postData.contents) || '{}');
    const folderId = '1U8sDWPq8yB9G8VkzI8t70NA1y4yc5dnv';
    const rootFolder = DriveApp.getFolderById(folderId);

    const className = (payload.className || '').toString().trim();
    const studentName = (payload.studentName || '').toString().trim();
    const weekValue = (payload.weekValue || payload.week || '').toString().trim();
    const weekLabel = (payload.weekLabel || '').toString().trim();
    const requestedVersion = Number(payload.submissionVersion);
    const originalName = (payload.fileName || 'bai-lam').toString();
    const mimeType = (payload.fileType || 'application/octet-stream').toString();
    const fileBase64 = (payload.fileBase64 || '').toString().replace(/^data:[^;]+;base64,/, '');

    if (!className || !studentName || !fileBase64) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Thiếu thông tin hoặc file.'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const bytes = Utilities.base64Decode(fileBase64);
    if (bytes.length > 5 * 1024 * 1024) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Mỗi file chỉ được tối đa 5 MB.'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const safeClass = sanitizeFileName(className);
    const safeStudent = sanitizeFileName(studentName);
    const safeWeek = sanitizeFileName(weekLabel || (weekValue ? 'Tuần ' + weekValue : 'Tuần'));
    const classFolder = getOrCreateFolder(rootFolder, safeClass);
    const weekFolder = getOrCreateFolder(classFolder, safeWeek);
    const submissionVersion = Number.isInteger(requestedVersion) && requestedVersion > 0
      ? requestedVersion
      : getNextSubmissionVersion(weekFolder, safeClass, safeStudent, safeWeek);

    const ext = getExtension(originalName);
    const fileName = `${safeClass}_${safeStudent}_${safeWeek}_nộp lần ${submissionVersion}${ext}`;

    const blob = Utilities.newBlob(bytes, mimeType, fileName);
    const createdFile = weekFolder.createFile(blob);

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      fileName: createdFile.getName(),
      fileId: createdFile.getId(),
      url: createdFile.getUrl(),
      folderName: weekFolder.getName(),
      classFolderName: classFolder.getName(),
      version: submissionVersion
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: 'Không upload được. Con thử lại nhé!'
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function getOrCreateFolder(parent, name) {
  const folderName = sanitizeFileName(name) || 'Tuần';
  const folders = parent.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return parent.createFolder(folderName);
}

function getGallery(params) {
  try {
    const folderId = '1U8sDWPq8yB9G8VkzI8t70NA1y4yc5dnv';
    const rootFolder = DriveApp.getFolderById(folderId);
    const weekValue = String(params.weekValue || '').trim();
    const weekLabel = String(params.weekLabel || '').trim();
    const classId = sanitizeFileName(params.classId || '');
    const weekName = sanitizeFileName(weekLabel || (weekValue ? 'Tuần ' + weekValue : ''));

    if (!weekName || !classId) {
      return jsonResponse({ success: false, message: 'Chưa chọn lớp hoặc tuần.' });
    }

    const classFolders = rootFolder.getFoldersByName(classId);
    if (!classFolders.hasNext()) {
      return jsonResponse({ success: true, items: [] });
    }

    const classFolder = classFolders.next();
    const weekFolders = classFolder.getFoldersByName(weekName);
    if (!weekFolders.hasNext()) {
      return jsonResponse({ success: true, items: [] });
    }

    const weekFolder = weekFolders.next();
    const items = [];
    addGalleryFiles(weekFolder.getFiles(), items, classFolder.getName());

    items.sort(function(first, second) {
      return second.createdAtMs - first.createdAtMs;
    });
    return jsonResponse({ success: true, items: items });
  } catch (err) {
    console.error(err);
    return jsonResponse({ success: false, message: 'Chưa tải được sản phẩm.' });
  }
}

function addGalleryFiles(files, items, className) {
  while (files.hasNext()) {
    const file = files.next();
    const mimeType = file.getMimeType();
    let thumbnail = '';

    // Thumbnails let students view images without being granted direct Drive access.
    if (mimeType.startsWith('image/') && typeof file.getThumbnail === 'function') {
      const thumbnailBlob = file.getThumbnail();
      if (thumbnailBlob) {
        thumbnail = 'data:' + thumbnailBlob.getContentType() + ';base64,' +
          Utilities.base64Encode(thumbnailBlob.getBytes());
      }
    }

    items.push({
      name: file.getName(),
      className: className,
      studentName: getStudentNameFromFileName(file.getName()),
      mimeType: mimeType,
      url: file.getUrl(),
      thumbnail: thumbnail,
      createdAtMs: file.getDateCreated().getTime(),
      createdAt: Utilities.formatDate(file.getDateCreated(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')
    });
  }
}

function getStudentNameFromFileName(fileName) {
  const parts = String(fileName || '').split('_');
  if (parts.length < 4) {
    return '';
  }

  return parts.slice(1, -2).join('_');
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getNextSubmissionVersion(folder, safeClass, safeStudent, safeWeek) {
  const prefix = `${safeClass}_${safeStudent}_${safeWeek}_nộp lần `;
  const files = folder.getFiles();
  let latestVersion = 0;

  while (files.hasNext()) {
    const fileName = files.next().getName();
    if (!fileName.startsWith(prefix)) continue;

    const match = fileName.match(/_nộp lần\s+(\d+)(?:\.[^.]+)?$/i);
    if (match) latestVersion = Math.max(latestVersion, Number(match[1]));
  }

  return latestVersion + 1;
}

function sanitizeFileName(name) {
  return String(name || '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function getExtension(name) {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot) : '';
}
