function getSheetByNameCaseInsensitive(ss, name) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().toLowerCase() === name.toLowerCase()) {
      return sheets[i];
    }
  }
  return null;
}

function doPost(e) {
  try {
    var params = JSON.parse(e.postData.contents);
    if (params.action === 'sync_all') {
      var data = params.data;
      
      updateSheet('Nhan_Vien', data.employees, ['id', 'code', 'name', 'department', 'role', 'phone', 'password']);
      updateSheet('DanhMuc_Ca', data.shifts, ['id', 'name', 'start_time', 'end_time', 'color', 'text_color']);
      updateSheet('Lich_Lam_Viec', data.schedules, ['id', 'date', 'employee_id', 'shift_id', 'task', 'status', 'note']);
      updateSheet('Thang_Chot', data.lockedMonths, ['month']);
      updateSheet('Thong_Bao', data.announcements, ['id', 'type', 'target_type', 'target_value', 'message', 'start_time', 'end_time', 'created_by', 'created_at']);
      updateSheet('Xac_Nhan_Thong_Bao', data.announcementViews, ['announcement_id', 'employee_id', 'viewed_at']);
      updateSheet('Don_Xin_Nghi', data.leaveRequests, ['id', 'employee_id', 'date', 'shift_id', 'reason', 'status', 'created_at']);
      updateSheet('DanhMuc_NhiemVu', data.tasks, ['id', 'department', 'name', 'color', 'text_color']);
      
      return ContentService.createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function updateSheet(sheetName, items, columns) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
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
        return item[col] !== undefined && item[col] !== null ? item[col].toString() : '';
      });
    });
    sheet.getRange(2, 1, rows.length, columns.length).setValues(rows);
  }
}

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var data = {
    employees: getSheetData(ss, 'Nhan_Vien', ['id', 'code', 'name', 'department', 'role', 'phone', 'password']),
    shifts: getSheetData(ss, 'DanhMuc_Ca', ['id', 'name', 'start_time', 'end_time', 'color', 'text_color']),
    schedules: getSheetData(ss, 'Lich_Lam_Viec', ['id', 'date', 'employee_id', 'shift_id', 'task', 'status', 'note']),
    lockedMonths: getSheetData(ss, 'Thang_Chot', ['month']),
    announcements: getSheetData(ss, 'Thong_Bao', ['id', 'type', 'target_type', 'target_value', 'message', 'start_time', 'end_time', 'created_by', 'created_at']),
    announcementViews: getSheetData(ss, 'Xac_Nhan_Thong_Bao', ['announcement_id', 'employee_id', 'viewed_at']),
    leaveRequests: getSheetData(ss, 'Don_Xin_Nghi', ['id', 'employee_id', 'date', 'shift_id', 'reason', 'status', 'created_at']),
    tasks: getSheetData(ss, 'DanhMuc_NhiemVu', ['id', 'department', 'name', 'color', 'text_color'])
  };
  
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
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
        // Convert numeric strings back to numbers for IDs
        if (columns[j] === 'id' || columns[j] === 'employee_id' || columns[j] === 'shift_id' || columns[j] === 'created_by' || columns[j] === 'announcement_id') {
          obj[columns[j]] = (val !== '' && !isNaN(val)) ? Number(val) : val;
        } else {
          obj[columns[j]] = val;
        }
      }
    }
    if (hasData) result.push(obj);
  }
  return result;
}
