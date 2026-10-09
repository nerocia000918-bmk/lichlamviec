// File chứa toàn bộ mã nguồn Google Apps Script chuẩn hóa
// Tự động nhận diện tên sheet có dấu tiếng Việt, bảo vệ cột, tự tạo cột ngày, tab LuuTru_Ngay vĩnh viễn

export const APPS_SCRIPT_CODE = `// ==========================================
// CẤU HÌNH QUAN TRỌNG (CHỈ NẾU GẶP LỖI)
// Nếu bạn gặp lỗi "Không tìm thấy Spreadsheet", hãy dán ID của file Sheet vào đây.
// ID là chuỗi ký tự nằm giữa /d/ và /edit trong đường dẫn trình duyệt của file Sheet.
var SPREADSHEET_ID = ''; 
// ==========================================

/**
 * Hàm chuẩn hóa chuỗi và loại bỏ dấu tiếng Việt để đối chiếu tên sheet và tiêu đề cột chính xác 100%
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

// Danh sách bí danh tên bảng tính (Sheet Name Aliases) hỗ trợ mọi cách đặt tên tiếng Việt và tiếng Anh
var SHEET_NAME_ALIASES = {
  'Nhan_Vien': [
    'nhan_vien', 'nhanvien', 'nhân viên', 'nhan vien', 'danh sach nhan vien', 'danh sách nhân viên',
    'dsnv', 'nhan_su', 'nhansu', 'nhân sự', 'employees', 'employee', 'staff'
  ],
  'LuuTru_Ngay': [
    'luutru_ngay', 'luutrungay', 'lưu trữ ngày', 'luu tru ngay', 'employee_dates', 'dates_archive',
    'ngay_nhan_vien', 'ngaynhanvien', 'luu_tru_ngay'
  ],
  'DanhMuc_Ca': [
    'danhmuc_ca', 'danhmukka', 'danh mục ca', 'danh muc ca', 'ca lam viec', 'ca làm việc',
    'ca', 'shifts', 'shift', 'shifts_list', 'danh muc ca lam viec'
  ],
  'Lich_Lam_Viec': [
    'lich_lam_viec', 'lichlamviec', 'lịch làm việc', 'lich lam viec', 'lịch', 'lich',
    'schedules', 'schedule', 'roster', 'bang phan cong', 'bảng phân công'
  ],
  'Thang_Chot': [
    'thang_chot', 'thangchot', 'tháng chốt', 'thang chot', 'khoa lich', 'khóa lịch',
    'locked_months', 'chot_thang'
  ],
  'Thong_Bao': [
    'thong_bao', 'thongbao', 'thông báo', 'thong bao', 'announcements', 'announcement', 'tin tuc', 'tin tức'
  ],
  'Xac_Nhan_Thong_Bao': [
    'xac_nhan_thong_bao', 'xacnhanthongbao', 'xác nhận thông báo', 'announcement_views', 'views'
  ],
  'Don_Xin_Nghi': [
    'don_xin_nghi', 'donxinnghi', 'đơn xin nghỉ', 'don xin nghi', 'nghi phep', 'nghỉ phép',
    'leave_requests', 'leaves', 'nghi_phep'
  ],
  'DanhMuc_NhiemVu': [
    'danhmuc_nhiemvu', 'danhmucnhiemvu', 'danh mục nhiệm vụ', 'nhiem vu', 'nhiệm vụ', 'tasks', 'task'
  ],
  'NhiemVu_DuocGiao': [
    'nhiemvu_duocgiao', 'nhiemvuduocgiao', 'nhiệm vụ được giao', 'assigned_tasks'
  ],
  'PhanCong_NhiemVu': [
    'phancong_nhiemvu', 'phancongnhiemvu', 'phân công nhiệm vụ', 'task_assignments'
  ]
};

// Danh sách bí danh cột (aliases) nhận diện linh hoạt mọi biến thể tiếng Anh và tiếng Việt
var COLUMN_ALIASES = {
  'start_date': ['start_date', 'startdate', 'joined_date', 'joineddate', 'ngay_vao_lam', 'ngayvaolam', 'ngày vào làm', 'ngày bắt đầu', 'ngay_bat_dau', 'joined_at', 'batdau', 'start', 'start date', 'ngayvao', 'ngày vào'],
  'end_date': ['end_date', 'enddate', 'resigned_date', 'resigneddate', 'ngay_nghi_viec', 'ngaynghiviec', 'ngày nghỉ việc', 'ngày nghỉ', 'ngay_nghi', 'resigned', 'end', 'end date', 'ngaynghi'],
  'joined_date': ['joined_date', 'joineddate', 'start_date', 'startdate', 'ngay_vao_lam', 'ngayvaolam', 'ngày vào làm', 'ngày bắt đầu', 'ngay_bat_dau', 'joined_at', 'batdau', 'start', 'start date', 'joined date', 'ngayvao', 'ngày vào'],
  'resigned_date': ['resigned_date', 'resigneddate', 'end_date', 'enddate', 'ngay_nghi_viec', 'ngaynghiviec', 'ngày nghỉ việc', 'ngày nghỉ', 'ngay_nghi', 'resigned', 'end', 'end date', 'resigned date', 'ngaynghi'],
  'code': ['code', 'mã nv', 'manv', 'mã nhân viên', 'ma_nv', 'idnv', 'emp_code', 'ma', 'ma nhan vien'],
  'name': ['name', 'họ tên', 'tên', 'hoten', 'ten', 'full_name', 'employee_name', 'tên nhân viên', 'họ và tên', 'ho va ten', 'ho_va_ten'],
  'department': ['department', 'bộ phận', 'bophan', 'phòng ban', 'phongban', 'dept', 'khối', 'to', 'tổ'],
  'role': ['role', 'chức vụ', 'chucvu', 'vai trò', 'vaitro', 'chức danh', 'vị trí', 'vitri'],
  'phone': ['phone', 'số điện thoại', 'sđt', 'sdt', 'dienthoai', 'so_dien_thoai', 'tel'],
  'password': ['password', 'mật khẩu', 'matkhau', 'pass'],
  'id': ['id', 'stt'],
  'start_time': ['start_time', 'gio_vao', 'giờ vào', 'bat_dau', 'bắt đầu', 'gio bat dau'],
  'end_time': ['end_time', 'gio_ra', 'giờ ra', 'ket_thuc', 'kết thúc', 'gio ket thuc'],
  'shift_id': ['shift_id', 'mã ca', 'maca', 'id_ca', 'ca', 'ca làm việc', 'calamviec', 'tên ca', 'tenca', 'shift'],
  'employee_id': ['employee_id', 'mã nhân viên', 'id_nhan_vien', 'idnv', 'manv', 'mã nv', 'nhân viên', 'nhanvien', 'tên nhân viên', 'hoten', 'họ tên'],
  'date': ['date', 'ngày', 'ngay', 'ngay_lam', 'ngày làm', 'thời gian', 'ngaylam'],
  'task': ['task', 'nhiệm vụ', 'nhiemvu', 'công việc', 'congviec', 'vị trí'],
  'status': ['status', 'trạng thái', 'trangthai'],
  'note': ['note', 'ghi chú', 'ghichu', 'lưu ý', 'luuy']
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
  var targetNorm = removeVietnameseTones(name);
  var aliases = (SHEET_NAME_ALIASES[name] || [name]).map(removeVietnameseTones);

  // 1. So khớp chính xác tên gốc (không phân biệt hoa/thường)
  for (var i = 0; i < sheets.length; i++) {
    var sName = sheets[i].getName();
    if (sName.toLowerCase() === name.toLowerCase()) {
      return sheets[i];
    }
  }

  // 2. So khớp chuẩn hóa loại bỏ dấu tiếng Việt và ký tự đặc biệt (ví dụ "Nhân Viên" khớp "Nhan_Vien")
  for (var i = 0; i < sheets.length; i++) {
    var sNorm = removeVietnameseTones(sheets[i].getName());
    if (sNorm === targetNorm || aliases.indexOf(sNorm) !== -1) {
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
 * ĐẢM BẢO VÀ ĐỒNG BỘ BẢNG 'LuuTru_Ngay' LƯU TRỮ VĨNH VIỄN THEO MÃ NHÂN VIÊN
 * Bảng này độc lập, khóa cứng theo Mã NV (code), không bao giờ bị xóa trắng!
 */
function ensureAndSyncDatePersistenceSheet(ss, employees) {
  if (!ss) return;
  var sheet = getSheetByNameCaseInsensitive(ss, 'LuuTru_Ngay');
  if (!sheet) {
    sheet = ss.insertSheet('LuuTru_Ngay');
    sheet.appendRow(['code', 'name', 'start_date', 'end_date', 'last_updated']);
    SpreadsheetApp.flush();
  }

  var lastRow = sheet.getLastRow();
  var existingData = [];
  if (lastRow > 1) {
    existingData = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  }

  var map = {};
  for (var r = 0; r < existingData.length; r++) {
    var c = existingData[r][0] ? existingData[r][0].toString().trim().toUpperCase() : '';
    if (c) {
      map[c] = {
        name: existingData[r][1],
        start_date: existingData[r][2],
        end_date: existingData[r][3],
        rowIdx: r + 2
      };
    }
  }

  var nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm:ss');
  var updated = false;

  if (employees && employees.length > 0) {
    for (var i = 0; i < employees.length; i++) {
      var emp = employees[i];
      if (!emp.code) continue;
      var cUpper = emp.code.toString().trim().toUpperCase();
      var sDate = emp.start_date || emp.joined_date || '';
      var eDate = emp.end_date || emp.resigned_date || '';

      if (sDate instanceof Date) {
        sDate = Utilities.formatDate(sDate, Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
      }
      if (eDate instanceof Date) {
        eDate = Utilities.formatDate(eDate, Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
      }

      if (map[cUpper]) {
        var existing = map[cUpper];
        // Chỉ ghi đè nếu dữ liệu mới có giá trị ngày, nếu dữ liệu mới rỗng thì GIỮ NGUYÊN ngày cũ đã lưu!
        var finalS = (sDate !== '' && sDate !== null && sDate !== undefined) ? sDate : existing.start_date;
        var finalE = (eDate !== '' && eDate !== null && eDate !== undefined) ? eDate : existing.end_date;

        if (finalS !== existing.start_date || finalE !== existing.end_date) {
          sheet.getRange(existing.rowIdx, 1, 1, 5).setValues([[cUpper, emp.name || existing.name, finalS || '', finalE || '', nowStr]]);
          updated = true;
        }
      } else if (sDate || eDate || emp.name) {
        sheet.appendRow([cUpper, emp.name || '', sDate || '', eDate || '', nowStr]);
        updated = true;
      }
    }
  }

  if (updated) {
    sheet.getRange(2, 1, Math.max(1, sheet.getLastRow() - 1), 5).setNumberFormat('@');
    SpreadsheetApp.flush();
  }
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
  try {
    SpreadsheetApp.getUi().alert("✅ Đã tạo / kiểm tra thành công các cột ngày trong bảng Nhan_Vien:\\n" + JSON.stringify(headers));
  } catch (e) {}
}

/**
 * HÀM TIỆN ÍCH: Sao lưu ngày nhân viên sang tab LuuTru_Ngay vĩnh viễn theo Mã NV
 */
function saoLuuNgayNhanVien() {
  var ss = getSpreadsheet();
  if (!ss) throw new Error("Không thể kết nối với Spreadsheet.");
  var emps = getSheetData(ss, 'Nhan_Vien', ['id', 'code', 'name', 'start_date', 'end_date', 'joined_date', 'resigned_date']);
  ensureAndSyncDatePersistenceSheet(ss, emps);
  try {
    SpreadsheetApp.getUi().alert("✅ Đã sao lưu toàn bộ ngày nhân viên sang tab 'LuuTru_Ngay' theo Mã NV thành công!");
  } catch (e) {}
}

/**
 * HÀM TIỆN ÍCH: Kiểm tra số lượng nhân viên và lịch làm việc đang đọc được
 */
function kiemTraDuLieu() {
  var ss = getSpreadsheet();
  if (!ss) throw new Error("Không thể kết nối với Spreadsheet. Hãy điền SPREADSHEET_ID ở dòng 5 nếu đang chạy độc lập.");
  
  var emps = getSheetData(ss, 'Nhan_Vien', ['id', 'code', 'name', 'department', 'role', 'phone', 'password', 'start_date', 'end_date']);
  var scheds = getSheetData(ss, 'Lich_Lam_Viec', ['id', 'date', 'employee_id', 'shift_id', 'task', 'status', 'note']);
  var shifts = getSheetData(ss, 'DanhMuc_Ca', ['id', 'name', 'department', 'start_time', 'end_time']);
  
  Logger.log("=== KẾT QUẢ KIỂM TRA DỮ LIỆU GOOGLE SHEETS ===");
  Logger.log("Số lượng nhân viên đọc được: " + emps.length);
  Logger.log("Số lượng lịch làm việc đọc được: " + scheds.length);
  Logger.log("Số lượng ca làm việc đọc được: " + shifts.length);
  
  try {
    var ui = SpreadsheetApp.getUi();
    ui.alert("Kết quả kiểm tra dữ liệu kết nối:\\n- Nhân viên: " + emps.length + " người\\n- Lịch làm việc: " + scheds.length + " dòng\\n- Ca làm việc: " + shifts.length + " ca\\n\\nNếu số lượng > 0 nghĩa là hệ thống đồng bộ sẽ đọc dữ liệu chính xác 100%!");
  } catch (e) {}
}

function onOpen() {
  try {
    var ss = getSpreadsheet();
    if (ss) {
      var sheet = getSheetByNameCaseInsensitive(ss, 'Nhan_Vien');
      if (sheet) ensureEmployeeDateColumns(sheet);
      
      var ui = SpreadsheetApp.getUi();
      ui.createMenu('Lịch Làm Việc')
        .addItem('1. Tự động tạo cột start_date & end_date', 'taoVaCapNhatCotNgay')
        .addItem('2. Kiểm tra dữ liệu nhân viên & lịch', 'kiemTraDuLieu')
        .addItem('3. Sao lưu ngày nhân viên sang tab LuuTru_Ngay', 'saoLuuNgayNhanVien')
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
      
      // Đồng bộ bảo vệ vĩnh viễn ngày nhân viên theo Mã NV vào bảng LuuTru_Ngay
      ensureAndSyncDatePersistenceSheet(ss, data.employees);

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
    sheet = ss.insertSheet('Nhan_Vien');
  }

  // Tự động kiểm tra và thêm 2 cột start_date, end_date nếu thiếu
  var headers = ensureEmployeeDateColumns(sheet);
  
  var lastRow = sheet.getLastRow();
  var existingData = [];
  if (lastRow > 1) {
    existingData = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  }

  // Lập bản đồ tra cứu dữ liệu cũ theo code, name, id
  var codeColIdx = findColumnIndex(headers, 'code');
  var nameColIdx = findColumnIndex(headers, 'name');
  var idColIdx = findColumnIndex(headers, 'id');
  
  var existingMap = {};
  for (var r = 0; r < existingData.length; r++) {
    var rowVals = existingData[r];
    var rCode = (codeColIdx !== -1 && rowVals[codeColIdx]) ? rowVals[codeColIdx].toString().trim().toUpperCase() : '';
    var rName = (nameColIdx !== -1 && rowVals[nameColIdx]) ? rowVals[nameColIdx].toString().trim().toLowerCase() : '';
    var rId = (idColIdx !== -1 && rowVals[idColIdx]) ? rowVals[idColIdx].toString().trim() : '';
    
    if (rCode) existingMap['c_' + rCode] = rowVals;
    if (rName) existingMap['n_' + rName] = rowVals;
    if (rId) existingMap['i_' + rId] = rowVals;
  }

  if (employees && employees.length > 0) {
    var newRows = [];
    
    for (var i = 0; i < employees.length; i++) {
      var emp = employees[i];
      var oldRow = null;
      var cUpper = emp.code ? emp.code.toString().trim().toUpperCase() : '';
      if (cUpper && existingMap['c_' + cUpper]) {
        oldRow = existingMap['c_' + cUpper];
      } else if (emp.name && existingMap['n_' + emp.name.toString().trim().toLowerCase()]) {
        oldRow = existingMap['n_' + emp.name.toString().trim().toLowerCase()];
      } else if (emp.id && existingMap['i_' + emp.id.toString().trim()]) {
        oldRow = existingMap['i_' + emp.id.toString().trim()];
      }
      
      var row = [];
      for (var j = 0; j < headers.length; j++) {
        var header = headers[j];
        var hNorm = removeVietnameseTones(header);
        var newVal = '';
        
        // So khớp cột ngày bắt đầu
        if (hNorm === 'startdate' || hNorm === 'joineddate' || hNorm === 'ngayvaolam' || hNorm === 'ngaybatdau' || hNorm === 'ngayvao') {
          newVal = emp.start_date || emp.joined_date || emp.startdate || emp.joineddate;
          if ((newVal === undefined || newVal === null || newVal === '') && oldRow && oldRow[j]) {
            newVal = oldRow[j];
          }
        }
        // So khớp cột ngày nghỉ việc
        else if (hNorm === 'enddate' || hNorm === 'resigneddate' || hNorm === 'ngaynghiviec' || hNorm === 'ngaynghi') {
          newVal = emp.end_date || emp.resigned_date || emp.enddate || emp.resigneddate;
          if ((newVal === undefined || newVal === null || newVal === '') && oldRow && oldRow[j]) {
            newVal = oldRow[j];
          }
        }
        // Các cột thông tin nhân viên khác
        else if (hNorm === 'id' || hNorm === 'stt') {
          newVal = emp.id !== undefined && emp.id !== null ? emp.id : (oldRow ? oldRow[j] : '');
        } else if (hNorm === 'code' || hNorm === 'manv' || hNorm === 'manhanvien') {
          newVal = emp.code || (oldRow ? oldRow[j] : '');
        } else if (hNorm === 'name' || hNorm === 'hoten' || hNorm === 'ten' || hNorm === 'tennhanvien') {
          newVal = emp.name || (oldRow ? oldRow[j] : '');
        } else if (hNorm === 'department' || hNorm === 'bophan' || hNorm === 'phongban') {
          newVal = emp.department || (oldRow ? oldRow[j] : '');
        } else if (hNorm === 'role' || hNorm === 'chucvu' || hNorm === 'vaitro') {
          newVal = emp.role || (oldRow ? oldRow[j] : '');
        } else if (hNorm === 'phone' || hNorm === 'sdt' || hNorm === 'sodienthoai') {
          newVal = emp.phone !== undefined ? emp.phone : (oldRow ? oldRow[j] : '');
        } else if (hNorm === 'password' || hNorm === 'matkhau') {
          newVal = emp.password !== undefined ? emp.password : (oldRow ? oldRow[j] : '');
        } else {
          // Cột tùy chỉnh khác của người dùng
          var key = header.toString();
          if (emp[key] !== undefined && emp[key] !== null) {
            newVal = emp[key];
          } else if (oldRow && oldRow[j] !== undefined) {
            newVal = oldRow[j];
          }
        }
        
        // Chuẩn hóa định dạng ngày sang YYYY-MM-DD
        if (newVal instanceof Date) {
          var y = newVal.getFullYear();
          var m = (newVal.getMonth() + 1).toString().padStart(2, '0');
          var d = newVal.getDate().toString().padStart(2, '0');
          newVal = y + '-' + m + '-' + d;
        } else if (newVal === undefined || newVal === null) {
          newVal = '';
        } else {
          newVal = newVal.toString().trim();
        }
        
        row.push(newVal);
      }
      newRows.push(row);
    }
    
    // An toàn: Không bao giờ xóa trắng các dòng cũ nếu danh sách mới ít hơn bất thường (ví dụ chỉ có 1 admin)
    if (lastRow > 1 && lastRow - 1 > newRows.length && newRows.length > 1) {
      sheet.getRange(2 + newRows.length, 1, lastRow - 1 - newRows.length, headers.length).clearContent();
    }
    
    // Ghi toàn bộ dữ liệu dòng 2 trở đi
    sheet.getRange(2, 1, newRows.length, headers.length).setValues(newRows);
    
    // Định dạng Text (@) cho các cột phone, code, start_date, end_date để tránh lỗi hiển thị số
    for (var colIdx = 0; colIdx < headers.length; colIdx++) {
      var hN = removeVietnameseTones(headers[colIdx]);
      if (hN === 'phone' || hN === 'sdt' || hN === 'startdate' || hN === 'enddate' || hN === 'joineddate' || hN === 'resigneddate') {
        sheet.getRange(2, colIdx + 1, newRows.length, 1).setNumberFormat('@');
      }
    }
  }

  SpreadsheetApp.flush();
}

/**
 * Cập nhật các bảng khác một cách an toàn (KHÔNG BAO GIỜ xóa dòng tiêu đề 1).
 */
function updateSheetSafe(ss, sheetName, items, columns) {
  var sheet = getSheetByNameCaseInsensitive(ss, sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var headers = [];

  if (lastCol > 0) {
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
    
    // ĐỌC THÊM TỪ TAB 'LuuTru_Ngay' ĐỂ KHÔI PHỤC VĨNH VIỄN CÁC NGÀY THEO MÃ NV
    try {
      var dateArchiveSheet = getSheetByNameCaseInsensitive(ss, 'LuuTru_Ngay');
      if (dateArchiveSheet && dateArchiveSheet.getLastRow() > 1) {
        var archVals = dateArchiveSheet.getRange(2, 1, dateArchiveSheet.getLastRow() - 1, 4).getValues();
        var dateArchiveMap = {};
        for (var a = 0; a < archVals.length; a++) {
          var aCode = archVals[a][0] ? archVals[a][0].toString().trim().toUpperCase() : '';
          if (aCode) {
            var rawS = archVals[a][2];
            var rawE = archVals[a][3];
            var strS = rawS instanceof Date ? Utilities.formatDate(rawS, Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd') : (rawS ? rawS.toString().trim() : '');
            var strE = rawE instanceof Date ? Utilities.formatDate(rawE, Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd') : (rawE ? rawE.toString().trim() : '');
            dateArchiveMap[aCode] = { start_date: strS, end_date: strE };
          }
        }
        
        if (data.employees && data.employees.length > 0) {
          for (var eIdx = 0; eIdx < data.employees.length; eIdx++) {
            var empObj = data.employees[eIdx];
            if (empObj.code) {
              var codeKey = empObj.code.toString().trim().toUpperCase();
              if (dateArchiveMap[codeKey]) {
                if (!empObj.start_date || empObj.start_date === '') {
                  empObj.start_date = dateArchiveMap[codeKey].start_date;
                  empObj.joined_date = dateArchiveMap[codeKey].start_date;
                }
                if (!empObj.end_date || empObj.end_date === '') {
                  empObj.end_date = dateArchiveMap[codeKey].end_date;
                  empObj.resigned_date = dateArchiveMap[codeKey].end_date;
                }
              }
            }
          }
        }
      }
    } catch (errArch) {}

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
  
  // Quét 6 dòng đầu để tìm dòng tiêu đề chuẩn nhất (tránh dòng tiêu đề biểu mẫu / title banner)
  var headerRowIdx = -1;
  var maxMatchCount = 0;
  var bestHeaders = [];
  
  var maxScanRows = Math.min(data.length, 6);
  for (var r = 0; r < maxScanRows; r++) {
    var rowHeaders = data[r].map(function(h) { return h ? h.toString().trim() : ''; });
    var matchCount = 0;
    for (var c = 0; c < columns.length; c++) {
      if (findColumnIndex(rowHeaders, columns[c]) !== -1) {
        matchCount++;
      }
    }
    if (matchCount > maxMatchCount) {
      maxMatchCount = matchCount;
      headerRowIdx = r;
      bestHeaders = rowHeaders;
    }
  }
  
  if (headerRowIdx === -1 || maxMatchCount === 0) {
    headerRowIdx = 0;
    bestHeaders = data[0].map(function(h) { return h ? h.toString().trim() : ''; });
  }
  
  var headers = bestHeaders;
  var result = [];
  
  for (var i = headerRowIdx + 1; i < data.length; i++) {
    var row = data[i];
    var obj = {};
    var hasData = false;
    
    for (var j = 0; j < columns.length; j++) {
      var colKey = columns[j];
      var colIndex = findColumnIndex(headers, colKey);
      
      if (colIndex !== -1) {
        var val = row[colIndex];
        if (val !== '' && val !== null && val !== undefined) {
          hasData = true;
        }
        
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
          obj[colKey] = (val !== '' && val !== null && val !== undefined && !isNaN(val)) ? Number(val) : (val !== undefined && val !== null ? val.toString().trim() : '');
        } else {
          obj[colKey] = (val !== undefined && val !== null) ? val.toString().trim() : '';
        }
      } else {
        obj[colKey] = '';
      }
    }
    
    // Đồng bộ 2 chiều các khóa ngày
    if (obj.start_date && !obj.joined_date) obj.joined_date = obj.start_date;
    if (obj.joined_date && !obj.start_date) obj.start_date = obj.joined_date;
    
    if (obj.end_date && !obj.resigned_date) obj.resigned_date = obj.end_date;
    if (obj.resigned_date && !obj.end_date) obj.end_date = obj.resigned_date;
    
    if (hasData) {
      // Đối với nhân viên, loại bỏ dòng nếu không có mã và không có tên
      if (sheetName === 'Nhan_Vien' && !obj.name && !obj.code) {
        continue;
      }
      // Đối với lịch, loại bỏ dòng nếu không có ngày và nhân viên
      if (sheetName === 'Lich_Lam_Viec' && !obj.date && !obj.employee_id) {
        continue;
      }
      result.push(obj);
    }
  }
  return result;
}
`;
