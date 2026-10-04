// File chứa toàn bộ mã nguồn Google Apps Script chuẩn hóa
// Tự động tạo và điền cột start_date & end_date, bảo vệ cột, chống xóa trắng

export const APPS_SCRIPT_CODE = `// ==========================================
// CẤU HÌNH QUAN TRỌNG (CHỈ NẾU GẶP LỖI)
// Nếu bạn gặp lỗi "Không tìm thấy Spreadsheet", hãy dán ID của file Sheet vào đây.
// ID là chuỗi ký tự nằm giữa /d/ và /edit trong đường dẫn trình duyệt của file Sheet.
var SPREADSHEET_ID = ''; 
// ==========================================

/**
 * Hàm chuẩn hóa chuỗi và loại bỏ dấu tiếng Việt để đối chiếu tiêu đề cột chính xác 100%
 */
function removeVietnameseTones(str) {
  if (!str) return '';
  str = str.toString().toLowerCase().trim();
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
  str = str.replace(/đ/g, "d");
  return str.replace(/[\\s_\\-]+/g, '');
}

// Danh sách bí danh cột (aliases) nhận diện linh hoạt mọi biến thể tiếng Anh và tiếng Việt
var COLUMN_ALIASES = {
  'start_date': ['start_date', 'startdate', 'joined_date', 'joineddate', 'ngay_vao_lam', 'ngayvaolam', 'ngày vào làm', 'ngày bắt đầu', 'ngay_bat_dau', 'joined_at', 'batdau', 'start', 'start date', 'ngayvao', 'ngày vào'],
  'end_date': ['end_date', 'enddate', 'resigned_date', 'resigneddate', 'ngay_nghi_viec', 'ngaynghiviec', 'ngày nghỉ việc', 'ngày nghỉ', 'ngay_nghi', 'resigned', 'end', 'end date', 'ngaynghi'],
  'joined_date': ['joined_date', 'joineddate', 'start_date', 'startdate', 'ngay_vao_lam', 'ngayvaolam', 'ngày vào làm', 'ngày bắt đầu', 'ngay_bat_dau', 'joined_at', 'batdau', 'start', 'start date', 'joined date', 'ngayvao', 'ngày vào'],
  'resigned_date': ['resigned_date', 'resigneddate', 'end_date', 'enddate', 'ngay_nghi_viec', 'ngaynghiviec', 'ngày nghỉ việc', 'ngày nghỉ', 'ngay_nghi', 'resigned', 'end', 'end date', 'resigned date', 'ngaynghi'],
  'code': ['code', 'mã nv', 'manv', 'mã nhân viên', 'ma_nv', 'idnv', 'emp_code', 'ma'],
  'name': ['name', 'họ tên', 'tên', 'hoten', 'ten', 'full_name', 'employee_name', 'tên nhân viên'],
  'department': ['department', 'bộ phận', 'bophan', 'phòng ban', 'phongban', 'dept'],
  'role': ['role', 'chức vụ', 'chucvu', 'vai trò', 'vaitro', 'chức danh'],
  'phone': ['phone', 'số điện thoại', 'sđt', 'sdt', 'dienthoai', 'so_dien_thoai'],
  'password': ['password', 'mật khẩu', 'matkhau', 'pass'],
  'id': ['id', 'stt'],
  'start_time': ['start_time', 'gio_vao', 'giờ vào', 'bat_dau', 'bắt đầu'],
  'end_time': ['end_time', 'gio_ra', 'giờ ra', 'ket_thuc', 'kết thúc'],
  'shift_id': ['shift_id', 'mã ca', 'maca', 'id_ca'],
  'employee_id': ['employee_id', 'mã nhân viên', 'id_nhan_vien', 'idnv'],
  'date': ['date', 'ngày', 'ngay', 'ngay_lam']
};

function normalizeHeader(h) {
  return removeVietnameseTones(h);
}

function findColumnIndex(headers, standardCol) {
  var stdNorm = removeVietnameseTones(standardCol);
  var aliases = COLUMN_ALIASES[standardCol] || [standardCol];
  var normalizedAliases = aliases.map(removeVietnameseTones);
  
  for (var i = 0; i < headers.length; i++) {
    var h = removeVietnameseTones(headers[i]);
    if (h === stdNorm || normalizedAliases.indexOf(h) !== -1) {
      return i;
    }
  }
  return -1;
}

function getSheetByNameCaseInsensitive(ss, name) {
  if (!ss) {
    throw new Error("Không tìm thấy Spreadsheet. Hãy điền SPREADSHEET_ID ở đầu mã nguồn nếu chạy độc lập.");
  }
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().toLowerCase() === name.toLowerCase()) {
      return sheets[i];
    }
  }
  return null;
}

function getSpreadsheet() {
  var ss = null;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {}
  
  if (!ss) {
    try {
      ss = SpreadsheetApp.getActive();
    } catch (e) {}
  }
  
  if (!ss && SPREADSHEET_ID) {
    try {
      ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    } catch (e) {}
  }
  return ss;
}

/**
 * ĐẢM BẢO CHẮC CHẮN CÓ 2 CỘT start_date VÀ end_date TRÊN DÒNG 1.
 * Tuyệt đối không ghi đè lẫn nhau, không làm mất dữ liệu.
 */
function ensureEmployeeDateColumns(sheet) {
  if (!sheet) return [];
  var lastCol = sheet.getLastColumn();
  var headers = [];
  
  if (lastCol > 0) {
    headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  }
  
  // Lọc bỏ các ô rỗng ở cuối nếu có
  while (headers.length > 0 && (!headers[headers.length - 1] || headers[headers.length - 1].toString().trim() === '')) {
    headers.pop();
  }
  
  // Nếu sheet hoàn toàn chưa có cột nào
  if (headers.length === 0) {
    headers = ['id', 'code', 'name', 'department', 'role', 'phone', 'password', 'start_date', 'end_date'];
    sheet.appendRow(headers);
    SpreadsheetApp.flush();
    return headers;
  }
  
  var hasStartDate = false;
  var hasEndDate = false;
  
  for (var i = 0; i < headers.length; i++) {
    var hNorm = removeVietnameseTones(headers[i]);
    if (hNorm === 'startdate' || hNorm === 'joineddate' || hNorm === 'ngayvaolam' || hNorm === 'ngaybatdau' || hNorm === 'ngayvao') {
      hasStartDate = true;
    }
    if (hNorm === 'enddate' || hNorm === 'resigneddate' || hNorm === 'ngaynghiviec' || hNorm === 'ngaynghi') {
      hasEndDate = true;
    }
  }
  
  // Nếu chưa có cột ngày bắt đầu -> thêm cột start_date
  if (!hasStartDate) {
    var col1 = headers.length + 1;
    sheet.getRange(1, col1).setValue('start_date');
    headers.push('start_date');
  }
  
  // Nếu chưa có cột ngày nghỉ việc -> thêm cột end_date
  if (!hasEndDate) {
    var col2 = headers.length + 1;
    sheet.getRange(1, col2).setValue('end_date');
    headers.push('end_date');
  }
  
  SpreadsheetApp.flush();
  return headers;
}

/**
 * HÀM TIỆN ÍCH: Bấm nút "Chạy" (Run) hàm này trong trình soạn thảo Apps Script
 * để kiểm tra và tự động tạo 2 cột start_date & end_date ngay trong Google Sheet!
 */
function taoVaCapNhatCotNgay() {
  var ss = getSpreadsheet();
  if (!ss) throw new Error("Không thể kết nối với Spreadsheet. Hãy điền SPREADSHEET_ID ở dòng 5 nếu đang chạy độc lập.");
  var sheet = getSheetByNameCaseInsensitive(ss, 'Nhan_Vien');
  if (!sheet) sheet = ss.insertSheet('Nhan_Vien');
  
  var headers = ensureEmployeeDateColumns(sheet);
  Logger.log("✅ Đã kiểm tra và hoàn thiện các cột trong Nhan_Vien: " + JSON.stringify(headers));
}

function onOpen() {
  try {
    var ss = getSpreadsheet();
    if (ss) {
      var sheet = getSheetByNameCaseInsensitive(ss, 'Nhan_Vien');
      if (sheet) ensureEmployeeDateColumns(sheet);
      
      var ui = SpreadsheetApp.getUi();
      ui.createMenu('Lịch Làm Việc')
        .addItem('Tự động tạo cột start_date & end_date', 'taoVaCapNhatCotNgay')
        .addToUi();
    }
  } catch (e) {}
}

function doPost(e) {
  try {
    var ss = getSpreadsheet();
    if (!ss) throw new Error("Không thể kết nối với Google Sheet. Hãy mở script từ menu 'Tiện ích mở rộng' trong file Sheet.");
    
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Không nhận được dữ liệu tải lên' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var params = JSON.parse(e.postData.contents);
    if (params.action === 'sync_all') {
      var data = params.data;
      
      // Đồng bộ bảo vệ cột và tự động sinh cột ngày cho Nhan_Vien
      updateEmployeeSheet(ss, 'Nhan_Vien', data.employees);
      
      // Đồng bộ an toàn các bảng khác (KHÔNG BAO GIỜ xóa cột hay xóa header dòng 1)
      updateSheetSafe(ss, 'DanhMuc_Ca', data.shifts, ['id', 'name', 'department', 'start_time', 'end_time', 'color', 'text_color']);
      updateSheetSafe(ss, 'Lich_Lam_Viec', data.schedules, ['id', 'date', 'employee_id', 'shift_id', 'task', 'status', 'note']);
      updateSheetSafe(ss, 'Thang_Chot', data.lockedMonths, ['month']);
      updateSheetSafe(ss, 'Thong_Bao', data.announcements, ['id', 'type', 'target_type', 'target_value', 'message', 'start_time', 'end_time', 'created_by', 'created_at']);
      updateSheetSafe(ss, 'Xac_Nhan_Thong_Bao', data.announcementViews, ['announcement_id', 'employee_id', 'viewed_at']);
      updateSheetSafe(ss, 'Don_Xin_Nghi', data.leaveRequests, ['id', 'employee_id', 'date', 'shift_id', 'reason', 'status', 'created_at']);
      updateSheetSafe(ss, 'DanhMuc_NhiemVu', data.tasks, ['id', 'department', 'name', 'color', 'text_color']);
      if (data.assignedTasks) {
        updateSheetSafe(ss, 'NhiemVu_DuocGiao', data.assignedTasks, ['id', 'title', 'description', 'created_by', 'created_at', 'due_date', 'target_type', 'target_value']);
      }
      if (data.taskAssignments) {
        updateSheetSafe(ss, 'PhanCong_NhiemVu', data.taskAssignments, ['task_id', 'employee_id', 'status', 'viewed_at', 'received_at', 'completed_at']);
      }
      
      return ContentService.createTextOutput(JSON.stringify({ success: true, updated_employees: (data.employees ? data.employees.length : 0) }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Hành động không xác định' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Cập nhật bảng Nhân Viên có cơ chế TỰ ĐỘNG TẠO CỘT, BẢO VỆ CỘT và CHỐNG XÓA TRẮNG.
 */
function updateEmployeeSheet(ss, sheetName, employees) {
  var sheet = getSheetByNameCaseInsensitive(ss, sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  
  // Tự động đảm bảo 2 cột start_date và end_date luôn tồn tại trên dòng 1
  var headers = ensureEmployeeDateColumns(sheet);
  var lastRow = sheet.getLastRow();
  
  // Đọc dữ liệu hiện tại trong sheet để bảo toàn các giá trị đã có
  var existingRows = [];
  if (lastRow > 1) {
    existingRows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  }
  
  // Tạo bản đồ tra cứu dòng hiện tại theo code, name, id
  var existingMap = {};
  var codeIdx = findColumnIndex(headers, 'code');
  var nameIdx = findColumnIndex(headers, 'name');
  var idIdx = findColumnIndex(headers, 'id');
  
  for (var r = 0; r < existingRows.length; r++) {
    var row = existingRows[r];
    var cVal = codeIdx !== -1 ? String(row[codeIdx]).trim() : '';
    var nVal = nameIdx !== -1 ? String(row[nameIdx]).trim().toLowerCase() : '';
    var iVal = idIdx !== -1 ? String(row[idIdx]).trim() : '';
    
    if (cVal) existingMap['code:' + cVal] = row;
    if (nVal) existingMap['name:' + nVal] = row;
    if (iVal) existingMap['id:' + iVal] = row;
  }
  
  // Xác định vị trí các cột ngày trong headers
  var startColIndices = [];
  var endColIndices = [];
  for (var h = 0; h < headers.length; h++) {
    var hNorm = removeVietnameseTones(headers[h]);
    if (hNorm === 'startdate' || hNorm === 'joineddate' || hNorm === 'ngayvaolam' || hNorm === 'ngaybatdau' || hNorm === 'ngayvao') {
      startColIndices.push(h);
    }
    if (hNorm === 'enddate' || hNorm === 'resigneddate' || hNorm === 'ngaynghiviec' || hNorm === 'ngaynghi') {
      endColIndices.push(h);
    }
  }
  
  // Xây dựng danh sách dòng mới
  var newRows = [];
  if (employees && employees.length > 0) {
    for (var i = 0; i < employees.length; i++) {
      var emp = employees[i];
      var empCode = emp.code ? String(emp.code).trim() : '';
      var empName = emp.name ? String(emp.name).trim().toLowerCase() : '';
      var empId = emp.id !== undefined && emp.id !== null ? String(emp.id).trim() : '';
      
      // Tìm dòng cũ tương ứng trong sheet nếu có
      var oldRow = null;
      if (empCode && existingMap['code:' + empCode]) {
        oldRow = existingMap['code:' + empCode];
      } else if (empId && existingMap['id:' + empId]) {
        oldRow = existingMap['id:' + empId];
      } else if (empName && existingMap['name:' + empName]) {
        oldRow = existingMap['name:' + empName];
      }
      
      var row = new Array(headers.length);
      for (var c = 0; c < headers.length; c++) {
        var hName = headers[c].toString().toLowerCase().trim();
        var hNorm = removeVietnameseTones(headers[c]);
        var oldVal = oldRow ? oldRow[c] : '';
        
        var isStartDate = (startColIndices.indexOf(c) !== -1);
        var isEndDate = (endColIndices.indexOf(c) !== -1);
        
        var newVal = '';
        if (isStartDate) {
          newVal = emp.start_date || emp.joined_date || emp['Ngày vào làm'] || emp['Ngày bắt đầu'] || emp['ngay_bat_dau'] || '';
          // Nếu giá trị gửi lên rỗng nhưng ô cũ trong sheet đã có ngày -> giữ lại ô cũ
          if ((!newVal || newVal === '') && oldVal !== '' && oldVal !== null && oldVal !== undefined) {
            newVal = oldVal;
          }
        } else if (isEndDate) {
          newVal = emp.end_date || emp.resigned_date || emp['Ngày nghỉ việc'] || emp['Ngày nghỉ'] || emp['ngay_nghi_viec'] || '';
          if ((!newVal || newVal === '') && oldVal !== '' && oldVal !== null && oldVal !== undefined) {
            newVal = oldVal;
          }
        } else {
          for (var stdKey in COLUMN_ALIASES) {
            var aliases = COLUMN_ALIASES[stdKey].map(removeVietnameseTones);
            if (hNorm === removeVietnameseTones(stdKey) || aliases.indexOf(hNorm) !== -1) {
              if (emp[stdKey] !== undefined && emp[stdKey] !== null) {
                newVal = emp[stdKey];
              }
              break;
            }
          }
          if (newVal === '' && emp[hName] !== undefined && emp[hName] !== null) {
            newVal = emp[hName];
          }
          if ((newVal === '' || newVal === undefined || newVal === null) && oldVal !== '' && oldVal !== null && oldVal !== undefined) {
            newVal = oldVal;
          }
        }
        
        if (newVal instanceof Date) {
          var y = newVal.getFullYear();
          var m = (newVal.getMonth() + 1).toString().padStart(2, '0');
          var d = newVal.getDate().toString().padStart(2, '0');
          newVal = y + '-' + m + '-' + d;
        } else if (newVal !== undefined && newVal !== null) {
          newVal = newVal.toString().trim();
        } else {
          newVal = '';
        }
        
        row[c] = newVal;
      }
      newRows.push(row);
    }
  }
  
  // Ghi đè phần dữ liệu từ dòng 2 (TUYỆT ĐỐI KHÔNG XÓA DÒNG 1 VÀ KHÔNG XÓA CỘT)
  if (newRows.length > 0) {
    if (lastRow > 1 && lastRow - 1 > newRows.length) {
      sheet.getRange(2 + newRows.length, 1, lastRow - 1 - newRows.length, headers.length).clearContent();
    }
    sheet.getRange(2, 1, newRows.length, headers.length).setValues(newRows);
  } else if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
  }
  
  SpreadsheetApp.flush();
}

/**
 * Cập nhật dữ liệu an toàn cho các bảng khác.
 */
function updateSheetSafe(ss, sheetName, items, columns) {
  var sheet = getSheetByNameCaseInsensitive(ss, sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  
  var lastCol = sheet.getLastColumn();
  var lastRow = sheet.getLastRow();
  var headers = [];
  
  if (lastCol > 0 && lastRow > 0) {
    headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  }
  
  while (headers.length > 0 && (!headers[headers.length - 1] || headers[headers.length - 1].toString().trim() === '')) {
    headers.pop();
  }
  
  if (headers.length === 0) {
    headers = columns;
    sheet.appendRow(headers);
    lastCol = headers.length;
    lastRow = 1;
    SpreadsheetApp.flush();
  }
  
  if (items && items.length > 0) {
    var rows = items.map(function(item) {
      return headers.map(function(colHeader) {
        var hNorm = removeVietnameseTones(colHeader);
        var val = '';
        
        for (var k = 0; k < columns.length; k++) {
          var std = columns[k];
          var aliases = (COLUMN_ALIASES[std] || [std]).map(removeVietnameseTones);
          if (hNorm === removeVietnameseTones(std) || aliases.indexOf(hNorm) !== -1) {
            val = item[std];
            break;
          }
        }
        
        if (val === undefined || val === null || val === '') {
          var rawKey = colHeader.toString();
          if (item[rawKey] !== undefined && item[rawKey] !== null) {
            val = item[rawKey];
          }
        }
        
        if (val === undefined || val === null) return '';
        
        if (val instanceof Date) {
          var y = val.getFullYear();
          var m = (val.getMonth() + 1).toString().padStart(2, '0');
          var d = val.getDate().toString().padStart(2, '0');
          return y + '-' + m + '-' + d;
        }
        
        if (typeof val === 'string' && val.includes(':') && val.length <= 8) {
          return val;
        }
        
        return val.toString();
      });
    });
    
    if (lastRow > 1 && lastRow - 1 > rows.length) {
      sheet.getRange(2 + rows.length, 1, lastRow - 1 - rows.length, headers.length).clearContent();
    }
    
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    
    var startTimeIdx = findColumnIndex(headers, 'start_time');
    var endTimeIdx = findColumnIndex(headers, 'end_time');
    if (startTimeIdx !== -1) sheet.getRange(2, startTimeIdx + 1, rows.length, 1).setNumberFormat('@');
    if (endTimeIdx !== -1) sheet.getRange(2, endTimeIdx + 1, rows.length, 1).setNumberFormat('@');
  } else if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
  }

  SpreadsheetApp.flush();
}

function doGet(e) {
  try {
    var ss = getSpreadsheet();
    if (!ss) throw new Error("Không thể kết nối với Google Sheet. Hãy mở script từ menu 'Tiện ích mở rộng' trong file Sheet.");
    
    try {
      var empSheet = getSheetByNameCaseInsensitive(ss, 'Nhan_Vien');
      if (empSheet) ensureEmployeeDateColumns(empSheet);
    } catch (errHeader) {}
    
    var data = {
      employees: getSheetData(ss, 'Nhan_Vien', ['id', 'code', 'name', 'department', 'role', 'phone', 'password', 'start_date', 'end_date', 'resigned_date', 'joined_date']),
      shifts: getSheetData(ss, 'DanhMuc_Ca', ['id', 'name', 'department', 'start_time', 'end_time', 'color', 'text_color']),
      schedules: getSheetData(ss, 'Lich_Lam_Viec', ['id', 'date', 'employee_id', 'shift_id', 'task', 'status', 'note']),
      lockedMonths: getSheetData(ss, 'Thang_Chot', ['month']),
      announcements: getSheetData(ss, 'Thong_Bao', ['id', 'type', 'target_type', 'target_value', 'message', 'start_time', 'end_time', 'created_by', 'created_at']),
      announcementViews: getSheetData(ss, 'Xac_Nhan_Thong_Bao', ['announcement_id', 'employee_id', 'viewed_at']),
      leaveRequests: getSheetData(ss, 'Don_Xin_Nghi', ['id', 'employee_id', 'date', 'shift_id', 'reason', 'status', 'created_at']),
      tasks: getSheetData(ss, 'DanhMuc_NhiemVu', ['id', 'department', 'name', 'color', 'text_color']),
      assignedTasks: getSheetData(ss, 'NhiemVu_DuocGiao', ['id', 'title', 'description', 'created_by', 'created_at', 'due_date', 'target_type', 'target_value']),
      taskAssignments: getSheetData(ss, 'PhanCong_NhiemVu', ['task_id', 'employee_id', 'status', 'viewed_at', 'received_at', 'completed_at'])
    };
    
    return ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getSheetData(ss, sheetName, columns) {
  var sheet = getSheetByNameCaseInsensitive(ss, sheetName);
  if (!sheet) return [];
  
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  
  var headers = data[0].map(function(h) { return h ? h.toString().toLowerCase().trim() : ''; });
  var result = [];
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var obj = {};
    var hasData = false;
    
    for (var j = 0; j < columns.length; j++) {
      var colKey = columns[j];
      var colIndex = findColumnIndex(headers, colKey);
      
      if (colIndex !== -1) {
        var val = row[colIndex];
        if (val !== '' && val !== null && val !== undefined) hasData = true;
        
        if (val instanceof Date) {
          if (colKey === 'start_time' || colKey === 'end_time') {
            var hours = val.getHours().toString().padStart(2, '0');
            var minutes = val.getMinutes().toString().padStart(2, '0');
            val = hours + ':' + minutes;
          } else {
            var y = val.getFullYear();
            var m = (val.getMonth() + 1).toString().padStart(2, '0');
            var d = val.getDate().toString().padStart(2, '0');
            val = y + '-' + m + '-' + d;
          }
        }

        var numericCols = ['id', 'employee_id', 'shift_id', 'created_by', 'announcement_id', 'task_id'];
        if (numericCols.indexOf(colKey) !== -1) {
          obj[colKey] = (val !== '' && !isNaN(val)) ? Number(val) : val;
        } else {
          obj[colKey] = (val !== undefined && val !== null) ? val.toString().trim() : '';
        }
      } else {
        obj[colKey] = '';
      }
    }
    
    if (obj.start_date && !obj.joined_date) obj.joined_date = obj.start_date;
    if (obj.joined_date && !obj.start_date) obj.start_date = obj.joined_date;
    
    if (obj.end_date && !obj.resigned_date) obj.resigned_date = obj.end_date;
    if (obj.resigned_date && !obj.end_date) obj.end_date = obj.resigned_date;
    
    if (hasData) result.push(obj);
  }
  return result;
}
`;
