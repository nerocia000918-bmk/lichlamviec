function getSheetByNameCaseInsensitive(ss, name) {
  if (!ss) {
    throw new Error("Không tìm thấy Spreadsheet. Hãy đảm bảo bạn đã mở Apps Script từ menu 'Tiện ích mở rộng' -> 'Apps Script' ngay trong file Google Sheet của bạn. Nếu bạn đang dùng script độc lập, hãy dùng SpreadsheetApp.openById('ID_FILE_SHEET').");
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
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) ss = SpreadsheetApp.getActive();
  return ss;
}

function doPost(e) {
  try {
    var ss = getSpreadsheet();
    if (!ss) throw new Error("Không thể kết nối với Google Sheet. Hãy mở script từ menu 'Tiện ích mở rộng' trong file Sheet.");
    
    var params = JSON.parse(e.postData.contents);
    if (params.action === 'sync_all') {
      var data = params.data;
      
      updateSheet(ss, 'Nhan_Vien', data.employees, ['id', 'code', 'name', 'department', 'role', 'phone', 'password']);
      updateSheet(ss, 'DanhMuc_Ca', data.shifts, ['id', 'name', 'department', 'start_time', 'end_time', 'color', 'text_color']);
      updateSheet(ss, 'Lich_Lam_Viec', data.schedules, ['id', 'date', 'employee_id', 'shift_id', 'task', 'status', 'note']);
      updateSheet(ss, 'Thang_Chot', data.lockedMonths, ['month']);
      updateSheet(ss, 'Thong_Bao', data.announcements, ['id', 'type', 'target_type', 'target_value', 'message', 'start_time', 'end_time', 'created_by', 'created_at']);
      updateSheet(ss, 'Xac_Nhan_Thong_Bao', data.announcementViews, ['announcement_id', 'employee_id', 'viewed_at']);
      updateSheet(ss, 'Don_Xin_Nghi', data.leaveRequests, ['id', 'employee_id', 'date', 'shift_id', 'reason', 'status', 'created_at']);
      updateSheet(ss, 'DanhMuc_NhiemVu', data.tasks, ['id', 'department', 'name', 'color', 'text_color']);
      
      return ContentService.createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function updateSheet(ss, sheetName, items, columns) {
  var sheet = getSheetByNameCaseInsensitive(ss, sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  
  sheet.clear();
  
  if (columns.length > 0) {
    sheet.appendRow(columns);
  }
  
  if (items && items.length > 0) {
    var rows = items.map(function(item) {
      return columns.map(function(col) {
        var val = item[col];
        if (val === undefined || val === null) return '';
        
        // Format time strings to avoid 1899 date issue
        if ((col === 'start_time' || col === 'end_time') && typeof val === 'string' && val.includes(':')) {
           return val; // Keep as string HH:mm
        }
        
        return val.toString();
      });
    });
    sheet.getRange(2, 1, rows.length, columns.length).setValues(rows);
    
    // Format time columns as Plain Text to avoid Google Sheets auto-formatting to 1899
    var startTimeIdx = columns.indexOf('start_time');
    var endTimeIdx = columns.indexOf('end_time');
    if (startTimeIdx !== -1) sheet.getRange(2, startTimeIdx + 1, rows.length, 1).setNumberFormat('@');
    if (endTimeIdx !== -1) sheet.getRange(2, endTimeIdx + 1, rows.length, 1).setNumberFormat('@');
  }
}

function doGet(e) {
  try {
    var ss = getSpreadsheet();
    if (!ss) throw new Error("Không thể kết nối với Google Sheet. Hãy mở script từ menu 'Tiện ích mở rộng' trong file Sheet.");
    
    var data = {
      employees: getSheetData(ss, 'Nhan_Vien', ['id', 'code', 'name', 'department', 'role', 'phone', 'password']),
      shifts: getSheetData(ss, 'DanhMuc_Ca', ['id', 'name', 'department', 'start_time', 'end_time', 'color', 'text_color']),
      schedules: getSheetData(ss, 'Lich_Lam_Viec', ['id', 'date', 'employee_id', 'shift_id', 'task', 'status', 'note']),
      lockedMonths: getSheetData(ss, 'Thang_Chot', ['month']),
      announcements: getSheetData(ss, 'Thong_Bao', ['id', 'type', 'target_type', 'target_value', 'message', 'start_time', 'end_time', 'created_by', 'created_at']),
      announcementViews: getSheetData(ss, 'Xac_Nhan_Thong_Bao', ['announcement_id', 'employee_id', 'viewed_at']),
      leaveRequests: getSheetData(ss, 'Don_Xin_Nghi', ['id', 'employee_id', 'date', 'shift_id', 'reason', 'status', 'created_at']),
      tasks: getSheetData(ss, 'DanhMuc_NhiemVu', ['id', 'department', 'name', 'color', 'text_color'])
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
  
  var headers = data[0].map(function(h) { return h.toString().toLowerCase().trim(); });
  var result = [];
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var obj = {};
    var hasData = false;
    for (var j = 0; j < columns.length; j++) {
      var colName = columns[j].toLowerCase();
      var colIndex = headers.indexOf(colName);
      if (colIndex !== -1) {
        var val = row[colIndex];
        if (val !== '') hasData = true;
        
        // Handle Date/Time objects from Google Sheets
        if (val instanceof Date) {
          if (columns[j] === 'start_time' || columns[j] === 'end_time') {
            // Extract HH:mm
            var hours = val.getHours().toString().padStart(2, '0');
            var minutes = val.getMinutes().toString().padStart(2, '0');
            val = hours + ':' + minutes;
          } else if (columns[j] === 'date') {
            // Keep as ISO but handle timezone
            val = val.toISOString();
          }
        }

        // Chuyển đổi ID về dạng số để khớp với database
        var numericCols = ['id', 'employee_id', 'shift_id', 'created_by', 'announcement_id'];
        if (numericCols.indexOf(columns[j]) !== -1) {
          obj[columns[j]] = (val !== '' && !isNaN(val)) ? Number(val) : val;
        } else {
          obj[columns[j]] = val.toString();
        }
      }
    }
    if (hasData) result.push(obj);
  }
  return result;
}
