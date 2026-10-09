import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const db = new Database('schedule.db');

const PERSISTENCE_FILE = './employee_dates_store.json';
const SETTINGS_FILE = './server_settings.json';

function saveEmployeeDatesToFile(store: Record<string, { name?: string; start_date?: string | null; end_date?: string | null }>) {
  try {
    fs.writeFileSync(PERSISTENCE_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (e) {
    console.error('Could not write employee_dates_store.json:', e);
  }
}

function loadEmployeeDatesFromFile(): Record<string, { name?: string; start_date?: string | null; end_date?: string | null }> {
  try {
    if (fs.existsSync(PERSISTENCE_FILE)) {
      const data = fs.readFileSync(PERSISTENCE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Could not read employee_dates_store.json:', e);
  }
  return {};
}

function saveSettingsToFile(key: string, value: string) {
  try {
    let settings: Record<string, string> = {};
    if (fs.existsSync(SETTINGS_FILE)) {
      try {
        settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      } catch (err) {}
    }
    settings[key] = value;
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (e) {
    console.error('Could not write server_settings.json:', e);
  }
}

function loadSettingsFromFile(): Record<string, string> {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    }
  } catch (e) {}
  return {};
}

const GOOGLE_SHEETS_URL = process.env.GOOGLE_SHEETS_URL;

function getGoogleSheetsUrl() {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('GOOGLE_SHEETS_URL') as { value: string } | undefined;
    const envUrl = process.env.GOOGLE_SHEETS_URL;
    
    // If found in DB, use it
    if (row && row.value) return row.value;
    
    // If not in DB but in ENV, save to DB and file, and return it
    if (envUrl) {
      try {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('GOOGLE_SHEETS_URL', envUrl);
        saveSettingsToFile('GOOGLE_SHEETS_URL', envUrl);
      } catch (e) {
        console.error('Failed to save ENV GOOGLE_SHEETS_URL to DB:', e);
      }
      return envUrl;
    }

    // Fallback: Check local settings file backup
    const fileSettings = loadSettingsFromFile();
    if (fileSettings['GOOGLE_SHEETS_URL']) {
      try {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('GOOGLE_SHEETS_URL', fileSettings['GOOGLE_SHEETS_URL']);
      } catch (e) {}
      return fileSettings['GOOGLE_SHEETS_URL'];
    }
    
    return undefined;
  } catch (e) {
    return process.env.GOOGLE_SHEETS_URL;
  }
}

let syncTimeout: NodeJS.Timeout | null = null;
let io: Server | null = null;

async function pushToGoogleSheets() {
  const url = getGoogleSheetsUrl();
  if (!url) return { success: false, error: 'Chưa cấu hình URL Google Sheets' };
  
  try {
    const rawEmployees = db.prepare('SELECT * FROM employees').all() as any[];
    const employees = rawEmployees.map(e => {
      let joined = e.joined_date || e.start_date;
      let resigned = e.resigned_date || e.end_date;
      
      // Fallback to persistence table if dates are empty
      if (!joined || !resigned) {
        let p: any = null;
        if (e.code) {
          p = db.prepare('SELECT joined_date, resigned_date, start_date, end_date FROM employee_date_persistence WHERE code = ?').get(e.code);
        }
        if (!p && e.name) {
          p = db.prepare('SELECT joined_date, resigned_date, start_date, end_date FROM employee_date_persistence WHERE name = ?').get(e.name);
        }
        if (p) {
          if (!joined) joined = p.joined_date || p.start_date;
          if (!resigned) resigned = p.resigned_date || p.end_date;
        }
      }
      
      const joinedNorm = joined ? normalizeDate(joined) : '';
      const resignedNorm = resigned ? normalizeDate(resigned) : '';

      return {
        ...e,
        joined_date: joinedNorm,
        resigned_date: resignedNorm,
        start_date: joinedNorm,
        end_date: resignedNorm,
        'Ngày vào làm': joinedNorm,
        'Ngày bắt đầu': joinedNorm,
        'Ngày nghỉ việc': resignedNorm,
        'Ngày nghỉ': resignedNorm
      };
    });

    const shifts = db.prepare('SELECT * FROM shifts').all();
    const schedules = db.prepare('SELECT * FROM schedules').all();
    const lockedMonths = db.prepare('SELECT * FROM locked_months').all();
    const announcements = db.prepare('SELECT * FROM announcements').all();
    const announcementViews = db.prepare('SELECT * FROM announcement_views').all();
    const leaveRequests = db.prepare('SELECT * FROM leave_requests').all();
    const tasks = db.prepare('SELECT * FROM tasks').all();
    const assignedTasks = db.prepare('SELECT * FROM assigned_tasks').all();
    const taskAssignments = db.prepare('SELECT * FROM task_assignments').all();

    console.log(`[pushToGoogleSheets] Pushing data to Sheets (${employees.length} employees, ${schedules.length} schedules)...`);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'sync_all',
        data: { employees, shifts, schedules, lockedMonths, announcements, announcementViews, leaveRequests, tasks, assignedTasks, taskAssignments }
      }),
      redirect: 'follow'
    });
    
    const text = await res.text();
    try {
      const result = JSON.parse(text);
      if (result.success) {
        console.log('Synced to Google Sheets successfully');
      } else {
        console.error('Google Sheets sync error:', result.error);
      }
      return result;
    } catch (e) {
      console.error('\n=============================================================');
      console.error('❌ LỖI ĐỒNG BỘ GOOGLE SHEETS: Phản hồi không phải là JSON hợp lệ.');
      console.error('Nội dung phản hồi (trích đoạn):', text.substring(0, 200) + '...');
      console.error('👉 CÁCH KHẮC PHỤC:');
      console.error('1. Mở lại Google Apps Script.');
      console.error('2. Bấm "Triển khai" (Deploy) -> "Quản lý công tác triển khai" (Manage deployments).');
      console.error('3. Bấm biểu tượng cây bút (Chỉnh sửa) ở góc phải.');
      console.error('4. Đảm bảo 2 cài đặt sau CHÍNH XÁC:');
      console.error('   - Thực thi dưới tư cách (Execute as): CHỌN "Tôi" (Me)');
      console.error('   - Quyền truy cập (Who has access): CHỌN "Bất kỳ ai" (Anyone)');
      console.error('5. Bấm "Triển khai" (Deploy) lại và copy link mới (phải có đuôi /exec).');
      console.error('6. Dán link mới vào mục Cài đặt trong ứng dụng.');
      console.error('=============================================================\n');
      return { success: false, error: 'Phản hồi không phải JSON hợp lệ. Hãy kiểm tra bước Triển khai Web App.', details: text.substring(0, 200) };
    }
  } catch (err: any) {
    console.error('Failed to sync to Google Sheets:', err);
    return { success: false, error: err.message };
  }
}

function triggerSync(immediate = false) {
  const url = getGoogleSheetsUrl();
  if (!url) return;
  if (syncTimeout) clearTimeout(syncTimeout);
  if (immediate) {
    pushToGoogleSheets();
  } else {
    syncTimeout = setTimeout(pushToGoogleSheets, 1000);
  }
}

function normalizeDate(dateStr: any): string {
  if (!dateStr) return '';
  
  // Handle numbers (Excel/Google Sheets date serials)
  if (typeof dateStr === 'number') {
    // 25569 is the offset between Unix epoch and Excel epoch (1970 - 1900)
    // 30000 to 60000 covers roughly years 1982 to 2064
    if (dateStr > 30000 && dateStr < 60000) {
      const utc_days = Math.floor(dateStr - 25569);
      const utc_value = utc_days * 86400;
      const date_info = new Date(utc_value * 1000);
      return date_info.toISOString().split('T')[0];
    }
    return String(dateStr);
  }

  if (typeof dateStr !== 'string') return String(dateStr);
  
  let normalized = dateStr;
  if (dateStr.includes('T')) {
    const d = new Date(dateStr);
    // Handle Google Sheets timezone offset (often 17:00 of previous day)
    if (dateStr.includes('T17:00:00')) {
      d.setHours(d.getHours() + 7);
    }
    normalized = d.toISOString().split('T')[0];
  } else {
    const match = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) {
      normalized = match[1];
    } else {
      // Handle DD/MM/YYYY
      const ddmmyyyy = dateStr.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
      if (ddmmyyyy) {
        const day = ddmmyyyy[1].padStart(2, '0');
        const month = ddmmyyyy[2].padStart(2, '0');
        const year = ddmmyyyy[3];
        normalized = `${year}-${month}-${day}`;
      }
    }
  }
  return normalized;
}

function removeVietnameseTones(str: any): string {
  if (!str) return '';
  let s = str.toString().toLowerCase().trim();
  s = s.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
  s = s.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
  s = s.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
  s = s.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
  s = s.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
  s = s.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
  s = s.replace(/đ/g, 'd');
  return s.replace(/[\s_\-]+/g, '');
}

function reconcileLeaveRequestsWithSchedules() {
  console.log('[Reconciliation] Starting leave request and schedule reconciliation...');
  try {
    const approvedRequests = db.prepare("SELECT * FROM leave_requests WHERE status = 'Đã duyệt'").all() as any[];
    let fixedCount = 0;

    for (const req of approvedRequests) {
      const normalizedDate = normalizeDate(req.date);
      const existing = db.prepare('SELECT id FROM schedules WHERE date = ? AND employee_id = ?').get(normalizedDate, req.employee_id) as any;
      
      if (!existing || existing.note !== 'Nghỉ phép đã duyệt') {
        console.log(`[Reconciliation] Fixing missing/incorrect schedule for employee ${req.employee_id} on ${normalizedDate}`);
        
        // Find shift
        let finalShiftId = req.shift_id;
        const shiftExists = db.prepare('SELECT id FROM shifts WHERE id = ?').get(finalShiftId);
        if (!shiftExists) {
          const fallback = db.prepare("SELECT id FROM shifts WHERE name LIKE 'OFF%' LIMIT 1").get() as any;
          if (fallback) finalShiftId = fallback.id;
        }

        if (existing) {
          db.prepare('UPDATE schedules SET shift_id = ?, task = ?, status = ?, note = ? WHERE id = ?')
            .run(finalShiftId, 'Không', 'Published', 'Nghỉ phép đã duyệt', existing.id);
        } else {
          db.prepare('INSERT INTO schedules (date, employee_id, shift_id, task, status, note) VALUES (?, ?, ?, ?, ?, ?)')
            .run(normalizedDate, req.employee_id, finalShiftId, 'Không', 'Published', 'Nghỉ phép đã duyệt');
        }
        fixedCount++;
      }
    }
    
    if (fixedCount > 0) {
      console.log(`[Reconciliation] Fixed ${fixedCount} schedule entries.`);
      if (io) io.emit('schedules:updated');
    } else {
      console.log('[Reconciliation] All approved leave requests are correctly reflected in schedules.');
    }
  } catch (error) {
    console.error('[Reconciliation] Error during reconciliation:', error);
  }
}

async function loadFromGoogleSheets() {
  const url = getGoogleSheetsUrl();
  if (!url) return { success: false, error: 'Chưa cấu hình URL Google Sheets' };
  try {
    console.log('Fetching data from Google Sheets...');
    const res = await fetch(url, { redirect: 'follow' });
    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      let errorMsg = 'URL trả về không phải dữ liệu JSON hợp lệ. Hãy kiểm tra lại bước Triển khai (Deploy) trong Apps Script.';
      
      if (text.includes('accounts.google.com') || text.includes('Sign in') || text.includes('Đăng nhập')) {
        errorMsg = 'Lỗi phân quyền: URL yêu cầu đăng nhập tài khoản Google. Trong Apps Script, hãy vào Triển khai > Quản lý công tác triển khai > Cây bút > Chọn "Quyền truy cập: Bất kỳ ai" (Anyone) thay vì "Chỉ mình tôi".';
      } else if (url.includes('/edit') || text.includes('/edit')) {
        errorMsg = 'Link bạn dán là link chỉnh sửa (/edit). URL Web App phải kết thúc bằng /exec.';
      } else if (text.includes('Authorization is required') || text.includes('Script requires authorization')) {
        errorMsg = 'Script chưa được cấp quyền truy cập Sheet. Trong Apps Script, hãy chạy thử 1 hàm (như taoVaCapNhatCotNgay) rồi bấm "Xem lại quyền" > "Nâng cao" > "Cho phép".';
      } else if (text.includes('Moved Temporarily')) {
        errorMsg = 'Lỗi chuyển hướng Google Apps Script. Vui lòng kiểm tra lại link Web App.';
      }

      console.error('\n=============================================================');
      console.error('❌ LỖI KẾT NỐI GOOGLE SHEETS:', errorMsg);
      console.error('Nội dung phản hồi (trích đoạn):', text.substring(0, 200) + '...');
      console.error('=============================================================\n');
      return { success: false, error: errorMsg, details: text.substring(0, 150) };
    }

    if (data) {
      const incomingEmps: any[] = Array.isArray(data.employees) ? data.employees : [];
      const incomingSchedules: any[] = Array.isArray(data.schedules) ? data.schedules : [];
      const incomingShifts: any[] = Array.isArray(data.shifts) ? data.shifts : [];

      const sheetEmpCount = incomingEmps.length;
      const sheetSchedCount = incomingSchedules.length;
      console.log(`Sheet data received: ${sheetEmpCount} employees, ${sheetSchedCount} schedules, ${incomingShifts.length} shifts.`);

      const localEmpCount = (db.prepare('SELECT COUNT(*) as count FROM employees').get() as { count: number }).count;
      const localSchedCount = (db.prepare('SELECT COUNT(*) as count FROM schedules').get() as { count: number }).count;

      // LÁ CHẮN BẢO VỆ: Nếu Google Sheets trả về 0 nhân viên trong khi local đang có dữ liệu thật (>1), KHÔNG ĐƯỢC XÓA TRẮNG DỮ LIỆU CỤC BỘ!
      if (sheetEmpCount === 0 && localEmpCount > 1) {
        const warnMsg = 'Google Sheets không trả về nhân viên nào (0 người). Hệ thống đã chặn đồng bộ để bảo vệ toàn bộ dữ liệu hiện tại của bạn không bị xóa trắng. Vui lòng kiểm tra tên tab trên Google Sheet (phải có tab Nhân Viên / Nhan_Vien) và copy mã Apps Script mới nhất.';
        console.warn('⚠️ CẢNH BÁO BẢO VỆ DỮ LIỆU:', warnMsg);
        return { success: false, error: warnMsg, employees: 0, schedules: 0 };
      }

      try {
        db.pragma('foreign_keys = OFF');
      } catch (e) {
        console.warn('Could not disable foreign keys:', e);
      }

      db.transaction(() => {
        // 1. CẬP NHẬT NHÂN VIÊN AN TOÀN (chỉ thay thế nếu sheet có nhân viên hợp lệ)
        if (sheetEmpCount > 0) {
          // Lưu dự phòng các ngày vào/nghỉ hiện có vào bảng persistence
          const currentEmps = db.prepare('SELECT * FROM employees').all() as any[];
          currentEmps.forEach(ce => {
            const jDate = ce.joined_date || ce.start_date;
            const rDate = ce.resigned_date || ce.end_date;
            if (ce.code && (jDate || rDate)) {
              db.prepare('INSERT OR REPLACE INTO employee_date_persistence (code, name, joined_date, resigned_date, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)')
                .run(ce.code, ce.name, jDate, rDate, jDate, rDate);
            }
          });

          db.prepare('DELETE FROM employees').run();

          const insertEmpWithId = db.prepare('INSERT OR REPLACE INTO employees (id, code, name, department, role, phone, password, resigned_date, joined_date, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
          const insertEmpNoId = db.prepare('INSERT INTO employees (code, name, department, role, phone, password, resigned_date, joined_date, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

          let hasAdmin = false;
          incomingEmps.forEach((e: any) => {
            let role = e.role || 'Nhân viên';
            const roleLower = role.toLowerCase();
            if (roleLower === 'admin') {
              role = 'Admin';
              hasAdmin = true;
            } else if (roleLower === 'tổ trưởng') {
              role = 'Tổ trưởng';
            } else {
              role = 'Nhân viên';
            }
            
            let password = e.password !== undefined && e.password !== null ? String(e.password) : '';
            if (role === 'Admin' && !password) password = '1234';
            
            // Xử lý linh hoạt các tên cột ngày
            const rawResigned = e.resigned_date || e.resignedDate || e.end_date || e.endDate || e['end_date'] || e['End Date'] || e.ngay_nghi_viec || e['Ngày nghỉ việc'] || e['Resigned Date'] || e['resignedDate'] || e['Ngày nghỉ'] || e['ngay_nghi'];
            const rawJoined = e.joined_date || e.joinedDate || e.start_date || e.startDate || e['start_date'] || e['Start Date'] || e.ngay_vao_lam || e.joined_at || e['Ngày vào làm'] || e['Ngày bắt đầu'] || e['Joined Date'] || e['joinedDate'] || e['Ngày vào'] || e['ngay_vao'];
            
            let resignedDate = rawResigned ? normalizeDate(rawResigned) : null;
            let joinedDate = rawJoined ? normalizeDate(rawJoined) : null;
            
            // Khôi phục từ persistence nếu ngày trên sheet bị rỗng
            let persistence = db.prepare('SELECT joined_date, resigned_date, start_date, end_date FROM employee_date_persistence WHERE code = ?').get(e.code) as any;
            if (!persistence && e.name) {
              persistence = db.prepare('SELECT joined_date, resigned_date, start_date, end_date FROM employee_date_persistence WHERE name = ?').get(e.name) as any;
            }
            if (!joinedDate && persistence) joinedDate = persistence.joined_date || persistence.start_date;
            if (!resignedDate && persistence) resignedDate = persistence.resigned_date || persistence.end_date;
            
            // Cập nhật lại persistence
            if (joinedDate || resignedDate) {
              db.prepare('INSERT OR REPLACE INTO employee_date_persistence (code, name, joined_date, resigned_date, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)')
                .run(e.code, e.name, joinedDate, resignedDate, joinedDate, resignedDate);
            }
            
            // Khử lỗi ép kiểu id để tránh SQLite mismatch datatype
            const validId = (e.id !== undefined && e.id !== null && e.id !== '' && !isNaN(Number(e.id)) && Number(e.id) > 0) ? Number(e.id) : null;
            if (validId) {
              insertEmpWithId.run(validId, e.code, e.name, e.department, role, e.phone, password, resignedDate, joinedDate, joinedDate, resignedDate);
            } else {
              insertEmpNoId.run(e.code, e.name, e.department, role, e.phone, password, resignedDate, joinedDate, joinedDate, resignedDate);
            }
          });
          
          if (!hasAdmin) {
            console.log('Chưa có Admin trong Sheet, tự động bổ sung Admin mặc định.');
            insertEmpNoId.run('ADMIN', 'Quản trị viên', 'Quản lý', 'Admin', '0999999999', '1234', null, null, null, null);
          }

          // Cập nhật bản lưu trữ file JSON
          try {
            const fileStore = loadEmployeeDatesFromFile();
            incomingEmps.forEach((e: any) => {
              if (e.code) {
                let j = (e.joined_date || e.start_date) ? normalizeDate(e.joined_date || e.start_date) : null;
                let r = (e.resigned_date || e.end_date) ? normalizeDate(e.resigned_date || e.end_date) : null;
                if (!j && fileStore[e.code]?.start_date) j = fileStore[e.code].start_date;
                if (!r && fileStore[e.code]?.end_date) r = fileStore[e.code].end_date;
                if (j || r) {
                  fileStore[e.code] = { name: e.name || fileStore[e.code]?.name || '', start_date: j, end_date: r };
                }
              }
            });
            saveEmployeeDatesToFile(fileStore);
          } catch (err) {}
        }

        // 2. CẬP NHẬT CA LÀM VIỆC (chỉ khi sheet có danh mục ca)
        if (incomingShifts && incomingShifts.length > 0) {
          db.prepare('DELETE FROM shifts').run();
          const insertShiftWithId = db.prepare('INSERT OR REPLACE INTO shifts (id, name, department, start_time, end_time, color, text_color) VALUES (?, ?, ?, ?, ?, ?, ?)');
          const insertShiftNoId = db.prepare('INSERT INTO shifts (name, department, start_time, end_time, color, text_color) VALUES (?, ?, ?, ?, ?, ?)');
          incomingShifts.forEach((s: any) => {
            let start = s.start_time;
            let end = s.end_time;
            if (start && start.includes('T')) start = start.split('T')[1].substring(0, 5);
            if (end && end.includes('T')) end = end.split('T')[1].substring(0, 5);
            const validId = (s.id !== undefined && s.id !== null && s.id !== '' && !isNaN(Number(s.id)) && Number(s.id) > 0) ? Number(s.id) : null;
            if (validId) {
              insertShiftWithId.run(validId, s.name, s.department || 'All', start, end, s.color, s.text_color);
            } else {
              insertShiftNoId.run(s.name, s.department || 'All', start, end, s.color, s.text_color);
            }
          });
        }

        // 3. CẬP NHẬT LỊCH LÀM VIỆC (tuyệt đối không xóa lịch nếu sheet không có lịch)
        if (sheetSchedCount > 0) {
          db.prepare('DELETE FROM schedules').run();

          const insertSchedWithId = db.prepare('INSERT OR REPLACE INTO schedules (id, date, employee_id, shift_id, task, status, note) VALUES (?, ?, ?, ?, ?, ?, ?)');
          const insertSchedNoId = db.prepare('INSERT INTO schedules (date, employee_id, shift_id, task, status, note) VALUES (?, ?, ?, ?, ?, ?)');
          
          // Tạo bản đồ tra cứu nhân viên đa năng (Mã, Tên, ID)
          const empMap: Record<string, number> = {};
          const allEmps = db.prepare('SELECT id, code, name FROM employees').all() as any[];
          allEmps.forEach(e => {
            if (e.code) empMap[e.code.toString().trim().toUpperCase()] = e.id;
            if (e.name) {
              empMap[e.name.toString().trim().toLowerCase()] = e.id;
              empMap[removeVietnameseTones(e.name)] = e.id;
            }
            if (e.id) empMap[e.id.toString()] = e.id;
          });

          // Tạo bản đồ tra cứu ca làm việc đa năng (ID, Tên ca, Tên không dấu)
          const shiftMap: Record<string, number> = {};
          const allShifts = db.prepare('SELECT id, name FROM shifts').all() as any[];
          allShifts.forEach(sh => {
            shiftMap[sh.id.toString()] = sh.id;
            if (sh.name) {
              shiftMap[sh.name.toString().trim().toLowerCase()] = sh.id;
              shiftMap[removeVietnameseTones(sh.name)] = sh.id;
            }
          });
          const defaultShiftId = allShifts.length > 0 ? allShifts[0].id : 1;

          incomingSchedules.forEach((s: any) => {
            const normalizedDate = normalizeDate(s.date);
            if (!normalizedDate) return;

            let empId: any = s.employee_id;
            if (empId !== undefined && empId !== null && empId !== '') {
              const strEmpId = empId.toString().trim();
              if (empMap[strEmpId.toUpperCase()] !== undefined) {
                empId = empMap[strEmpId.toUpperCase()];
              } else if (empMap[strEmpId.toLowerCase()] !== undefined) {
                empId = empMap[strEmpId.toLowerCase()];
              } else if (empMap[removeVietnameseTones(strEmpId)] !== undefined) {
                empId = empMap[removeVietnameseTones(strEmpId)];
              } else if (!isNaN(Number(strEmpId)) && empMap[strEmpId] !== undefined) {
                empId = empMap[strEmpId];
              } else if (!isNaN(Number(strEmpId))) {
                empId = Number(strEmpId);
              }
            }

            // Nhận diện mã ca / tên ca linh hoạt
            let shiftId: any = s.shift_id;
            if (shiftId !== undefined && shiftId !== null && shiftId !== '') {
              const strShift = shiftId.toString().trim();
              if (shiftMap[strShift] !== undefined) {
                shiftId = shiftMap[strShift];
              } else if (shiftMap[strShift.toLowerCase()] !== undefined) {
                shiftId = shiftMap[strShift.toLowerCase()];
              } else if (shiftMap[removeVietnameseTones(strShift)] !== undefined) {
                shiftId = shiftMap[removeVietnameseTones(strShift)];
              } else if (!isNaN(Number(strShift))) {
                shiftId = Number(strShift);
              } else {
                shiftId = defaultShiftId;
              }
            } else {
              shiftId = defaultShiftId;
            }

            const validSchedId = (s.id !== undefined && s.id !== null && s.id !== '' && !isNaN(Number(s.id)) && Number(s.id) > 0) ? Number(s.id) : null;
            if (validSchedId) {
              insertSchedWithId.run(validSchedId, normalizedDate, empId, shiftId, s.task || 'Không', s.status || 'Published', s.note || '');
            } else {
              insertSchedNoId.run(normalizedDate, empId, shiftId, s.task || 'Không', s.status || 'Published', s.note || '');
            }
          });
        }

        // 4. Các bảng cấu hình khác (chỉ cập nhật nếu có dữ liệu từ sheet)
        if (data.lockedMonths && data.lockedMonths.length > 0) {
          db.prepare('DELETE FROM locked_months').run();
          const insertLock = db.prepare('INSERT OR IGNORE INTO locked_months (month) VALUES (?)');
          data.lockedMonths.forEach((l: any) => {
            if (l && l.month) insertLock.run(l.month);
          });
        }

        if (data.announcements && data.announcements.length > 0) {
          db.prepare('DELETE FROM announcements').run();
          const insertAnn = db.prepare('INSERT INTO announcements (id, type, target_type, target_value, message, start_time, end_time, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
          data.announcements.forEach((a: any) => insertAnn.run(a.id, a.type, a.target_type, a.target_value, a.message, a.start_time, a.end_time, a.created_by, a.created_at));
        }

        if (data.announcementViews && data.announcementViews.length > 0) {
          db.prepare('DELETE FROM announcement_views').run();
          const insertView = db.prepare('INSERT INTO announcement_views (announcement_id, employee_id, viewed_at) VALUES (?, ?, ?)');
          data.announcementViews.forEach((v: any) => insertView.run(v.announcement_id, v.employee_id, v.viewed_at));
        }

        if (data.leaveRequests && data.leaveRequests.length > 0) {
          db.prepare('DELETE FROM leave_requests').run();
          const insertLeave = db.prepare('INSERT INTO leave_requests (id, employee_id, date, shift_id, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
          data.leaveRequests.forEach((l: any) => {
            const normalizedDate = normalizeDate(l.date);
            insertLeave.run(l.id, l.employee_id, normalizedDate, l.shift_id, l.reason, l.status, l.created_at);
          });
        }

        if (data.tasks && data.tasks.length > 0) {
          db.prepare('DELETE FROM tasks').run();
          const insertTask = db.prepare('INSERT INTO tasks (id, department, name, color, text_color) VALUES (?, ?, ?, ?, ?)');
          data.tasks.forEach((t: any) => insertTask.run(t.id, t.department, t.name, t.color, t.text_color));
        }

        if (data.assignedTasks && data.assignedTasks.length > 0) {
          db.prepare('DELETE FROM assigned_tasks').run();
          const insertAssigned = db.prepare('INSERT INTO assigned_tasks (id, title, description, created_by, created_at, target_type, target_value) VALUES (?, ?, ?, ?, ?, ?, ?)');
          data.assignedTasks.forEach((t: any) => insertAssigned.run(t.id, t.title, t.description, t.created_by, t.created_at, t.target_type, t.target_value));
        }

        if (data.taskAssignments && data.taskAssignments.length > 0) {
          db.prepare('DELETE FROM task_assignments').run();
          const insertAssign = db.prepare('INSERT INTO task_assignments (task_id, employee_id, status, viewed_at, completed_at) VALUES (?, ?, ?, ?, ?)');
          data.taskAssignments.forEach((a: any) => insertAssign.run(a.task_id, a.employee_id, a.status, a.viewed_at, a.completed_at));
        }
      })();

      try {
        db.pragma('foreign_keys = ON');
      } catch (e) {
        console.warn('Could not re-enable foreign keys:', e);
      }
      
      // Khớp lại đơn xin nghỉ phép với lịch làm việc
      reconcileLeaveRequestsWithSchedules();
      seedTasks();

      return { 
        success: true, 
        employees: sheetEmpCount, 
        schedules: sheetSchedCount,
        shifts: incomingShifts.length 
      };
    }
    return { success: false, error: 'Dữ liệu từ Google Sheets không hợp lệ' };
  } catch (err: any) {
    console.error('Failed to load from Google Sheets:', err);
    return { success: false, error: 'Lỗi kết nối máy chủ Google: ' + err.message };
  }
}

function seedTasks() {
  const salesTasks = [
    { name: 'Trực hotline', color: '#22c55e', text_color: '#ffffff' },
    { name: 'Trực cửa', color: '#a855f7', text_color: '#ffffff' },
    { name: 'Vệ sinh', color: '#06b6d4', text_color: '#ffffff' }
  ];

  salesTasks.forEach(task => {
    const existing = db.prepare('SELECT id FROM tasks WHERE LOWER(TRIM(department)) = LOWER(?) AND LOWER(TRIM(name)) = LOWER(?)')
      .get('Bán hàng', task.name);
      
    if (!existing) {
      db.prepare('INSERT INTO tasks (department, name, color, text_color) VALUES (?, ?, ?, ?)')
        .run('Bán hàng', task.name, task.color, task.text_color);
    }
  });
}

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE,
    name TEXT,
    department TEXT,
    role TEXT,
    phone TEXT,
    password TEXT,
    resigned_date TEXT,
    joined_date TEXT,
    start_date TEXT,
    end_date TEXT
  );

  CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    department TEXT DEFAULT 'All',
    start_time TEXT,
    end_time TEXT,
    color TEXT,
    text_color TEXT
  );

  CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    employee_id INTEGER,
    shift_id INTEGER,
    task TEXT,
    status TEXT,
    FOREIGN KEY(employee_id) REFERENCES employees(id),
    FOREIGN KEY(shift_id) REFERENCES shifts(id)
  );

  CREATE TABLE IF NOT EXISTS locked_months (
    month TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT, -- 'Highlight 1' (Admin), 'Highlight 2' (Tổ trưởng)
    target_type TEXT, -- 'All', 'Department', 'Individual'
    target_value TEXT, -- Department name or Employee ID
    message TEXT,
    start_time TEXT,
    end_time TEXT,
    created_by INTEGER,
    created_at TEXT,
    FOREIGN KEY(created_by) REFERENCES employees(id)
  );

  CREATE TABLE IF NOT EXISTS announcement_views (
    announcement_id INTEGER,
    employee_id INTEGER,
    viewed_at TEXT,
    PRIMARY KEY(announcement_id, employee_id),
    FOREIGN KEY(announcement_id) REFERENCES announcements(id),
    FOREIGN KEY(employee_id) REFERENCES employees(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS employee_date_persistence (
    code TEXT PRIMARY KEY,
    name TEXT,
    joined_date TEXT,
    resigned_date TEXT,
    start_date TEXT,
    end_date TEXT
  );

  CREATE TABLE IF NOT EXISTS leave_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    date TEXT,
    shift_id INTEGER,
    reason TEXT,
    status TEXT,
    created_at TEXT,
    FOREIGN KEY(employee_id) REFERENCES employees(id),
    FOREIGN KEY(shift_id) REFERENCES shifts(id)
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    department TEXT,
    name TEXT,
    color TEXT,
    text_color TEXT
  );

  CREATE TABLE IF NOT EXISTS assigned_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    description TEXT,
    created_by INTEGER,
    created_at TEXT,
    due_date TEXT,
    target_type TEXT, -- 'All', 'Department', 'Individual'
    target_value TEXT, -- Department name or Employee ID(s)
    FOREIGN KEY(created_by) REFERENCES employees(id)
  );

  CREATE TABLE IF NOT EXISTS task_assignments (
    task_id INTEGER,
    employee_id INTEGER,
    status TEXT DEFAULT 'Pending', -- 'Pending', 'Completed'
    viewed_at TEXT,
    received_at TEXT,
    completed_at TEXT,
    PRIMARY KEY(task_id, employee_id),
    FOREIGN KEY(task_id) REFERENCES assigned_tasks(id),
    FOREIGN KEY(employee_id) REFERENCES employees(id)
  );
`);
try { db.prepare("ALTER TABLE employees ADD COLUMN password TEXT").run(); } catch (e) {}
try { db.prepare("ALTER TABLE employees ADD COLUMN resigned_date TEXT").run(); } catch (e) {}
try { db.prepare("ALTER TABLE employees ADD COLUMN joined_date TEXT").run(); } catch (e) {}

// Add received_at column if not exists
try {
  db.exec('ALTER TABLE task_assignments ADD COLUMN received_at TEXT');
} catch (e) {}

// Add password column to employees if not exists
try {
  db.exec('ALTER TABLE employees ADD COLUMN password TEXT');
} catch (e) {}

// Add resigned_date column to employees if not exists
try {
  db.exec('ALTER TABLE employees ADD COLUMN resigned_date TEXT');
} catch (e) {}

// Add joined_date column to employees if not exists
try {
  db.exec('ALTER TABLE employees ADD COLUMN joined_date TEXT');
} catch (e) {}
try {
  db.exec('ALTER TABLE employees ADD COLUMN start_date TEXT');
} catch (e) {}
try {
  db.exec('ALTER TABLE employees ADD COLUMN end_date TEXT');
} catch (e) {}
try {
  db.exec('ALTER TABLE employee_date_persistence ADD COLUMN start_date TEXT');
} catch (e) {}
try {
  db.exec('ALTER TABLE employee_date_persistence ADD COLUMN end_date TEXT');
} catch (e) {}

// Add start_time and end_time to announcements if not exists
try {
  db.exec('ALTER TABLE announcements ADD COLUMN start_time TEXT');
} catch (e) {}
try {
  db.exec('ALTER TABLE announcements ADD COLUMN end_time TEXT');
} catch (e) {}
try {
  db.exec('ALTER TABLE announcements ADD COLUMN type TEXT');
} catch (e) {}
try {
  db.exec('ALTER TABLE announcements ADD COLUMN target_type TEXT');
} catch (e) {}
try {
  db.exec('ALTER TABLE announcements ADD COLUMN target_value TEXT');
} catch (e) {}
try {
  db.exec('ALTER TABLE announcements ADD COLUMN created_by INTEGER');
} catch (e) {}
try {
  db.exec('ALTER TABLE announcements ADD COLUMN created_at TEXT');
} catch (e) {}

// Set default password for existing admins
db.prepare("UPDATE employees SET password = ? WHERE role = 'Admin' AND (password IS NULL OR password = '')").run('1234');

seedTasks();

// Initialize settings
const tlLock = db.prepare('SELECT value FROM settings WHERE key = ?').get('TL_EDIT_LOCK_HOURS');
if (!tlLock) {
  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run('TL_EDIT_LOCK_HOURS', '24');
}

try {
  db.exec('ALTER TABLE schedules ADD COLUMN note TEXT');
} catch (e) {
  // Ignore if column already exists
}

// Migrate OFF shift to 3 types of OFF
try {
  const offShift = db.prepare('SELECT id FROM shifts WHERE name = ?').get('OFF');
  if (offShift) {
    db.prepare('UPDATE shifts SET name = ? WHERE name = ?').run('OFF tuần', 'OFF');
    db.prepare('INSERT INTO shifts (name, start_time, end_time, color, text_color) VALUES (?, ?, ?, ?, ?)').run('OFF phép', '00:00', '23:59', '#fef08a', '#854d0e');
    db.prepare('INSERT INTO shifts (name, start_time, end_time, color, text_color) VALUES (?, ?, ?, ?, ?)').run('OFF không lương', '00:00', '23:59', '#fef08a', '#854d0e');
  }
} catch (e) {
  // Ignore
}

// Seed initial data if empty
const employeeCount = db.prepare('SELECT COUNT(*) as count FROM employees').get() as { count: number };
if (employeeCount.count === 0) {
  const insertEmployee = db.prepare('INSERT INTO employees (code, name, department, role, phone, password) VALUES (?, ?, ?, ?, ?, ?)');
  insertEmployee.run('ADMIN', 'Quản trị viên', 'Quản lý', 'Admin', '0999999999', '1234');

  const insertShift = db.prepare('INSERT INTO shifts (name, department, start_time, end_time, color, text_color) VALUES (?, ?, ?, ?, ?, ?)');
  
  // Thu ngân, Kỹ thuật, Giao vận
  ['Thu ngân', 'Kỹ thuật', 'Giao vận'].forEach(dept => {
    insertShift.run('SÁNG', dept, '08:30', '17:00', '#e0f2fe', '#0369a1');
    insertShift.run('CHIỀU', dept, '12:00', '21:00', '#ffedd5', '#c2410c');
  });

  // Kho
  insertShift.run('SÁNG', 'Kho', '08:30', '18:00', '#e0f2fe', '#0369a1');
  insertShift.run('CHIỀU', 'Kho', '12:00', '21:00', '#ffedd5', '#c2410c');

  // Bán hàng, Quản lý
  ['Bán hàng', 'Quản lý'].forEach(dept => {
    insertShift.run('SÁNG', dept, '08:30', '17:00', '#e0f2fe', '#0369a1');
    insertShift.run('CHIỀU', dept, '13:00', '21:00', '#ffedd5', '#c2410c');
  });

  // Ca lỡ (All)
  insertShift.run('LỠ', 'All', '10:00', '19:00', '#d6c4b5', '#4a3b32'); 
  
  // Other shifts
  insertShift.run('OFF TUẦN', 'All', '00:00', '23:59', '#fef08a', '#854d0e'); 
  insertShift.run('OFF PHÉP', 'All', '00:00', '23:59', '#fef08a', '#854d0e'); 
  insertShift.run('OFF KHÔNG LƯƠNG', 'All', '00:00', '23:59', '#fef08a', '#854d0e'); 
  insertShift.run('TĂNG CA', 'All', '08:30', '21:00', '#ef4444', '#ffffff'); 
}

async function startServer() {
  // Tự động khôi phục cài đặt và ngày nhân viên từ bản lưu trữ vĩnh viễn trên file
  try {
    const fileSettings = loadSettingsFromFile();
    if (fileSettings['GOOGLE_SHEETS_URL']) {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('GOOGLE_SHEETS_URL', fileSettings['GOOGLE_SHEETS_URL']);
    }
    if (fileSettings['TL_EDIT_LOCK_HOURS']) {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('TL_EDIT_LOCK_HOURS', fileSettings['TL_EDIT_LOCK_HOURS']);
    }

    const fileDates = loadEmployeeDatesFromFile();
    const upsertPersistence = db.prepare(`
      INSERT OR REPLACE INTO employee_date_persistence (code, name, joined_date, resigned_date, start_date, end_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const updateEmpDates = db.prepare(`
      UPDATE employees 
      SET start_date = COALESCE(?, start_date), 
          joined_date = COALESCE(?, joined_date), 
          end_date = COALESCE(?, end_date), 
          resigned_date = COALESCE(?, resigned_date)
      WHERE UPPER(TRIM(code)) = UPPER(TRIM(?))
    `);

    Object.entries(fileDates).forEach(([code, val]: any) => {
      if (code && (val.start_date || val.end_date)) {
        upsertPersistence.run(code, val.name || '', val.start_date, val.end_date, val.start_date, val.end_date);
        updateEmpDates.run(val.start_date, val.start_date, val.end_date, val.end_date, code);
      }
    });
    console.log(`[Startup] Đã nạp ${Object.keys(fileDates).length} bản ghi ngày nhân viên từ file lưu trữ.`);
  } catch (err) {
    console.warn('Lỗi khi nạp bản lưu trữ ngày lúc khởi động:', err);
  }

  await loadFromGoogleSheets();

  const app = express();
  const PORT = 3000;
  const httpServer = createServer(app);
  io = new Server(httpServer, {
    cors: { origin: '*' }
  });

  app.use(express.json());

  // API Routes
  app.get('/api/ping', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/api/employees', (req, res) => {
    try {
      const rawEmployees = db.prepare('SELECT * FROM employees').all() as any[];
      const employees = rawEmployees.map(e => {
        let joined = e.joined_date || e.start_date;
        let resigned = e.resigned_date || e.end_date;
        
        // Fallback to persistence table if dates are empty
        if (!joined || !resigned) {
          let p: any = null;
          if (e.code) {
            p = db.prepare('SELECT joined_date, resigned_date, start_date, end_date FROM employee_date_persistence WHERE code = ?').get(e.code);
          }
          if (!p && e.name) {
            p = db.prepare('SELECT joined_date, resigned_date, start_date, end_date FROM employee_date_persistence WHERE name = ?').get(e.name);
          }
          if (p) {
            if (!joined) joined = p.joined_date || p.start_date;
            if (!resigned) resigned = p.resigned_date || p.end_date;
          }
        }
        
        const joinedNorm = joined ? normalizeDate(joined) : null;
        const resignedNorm = resigned ? normalizeDate(resigned) : null;

        return {
          ...e,
          name: e.name || '',
          code: e.code || '',
          department: e.department || 'Bán hàng',
          role: e.role || 'Nhân viên',
          joined_date: joinedNorm,
          resigned_date: resignedNorm,
          start_date: joinedNorm,
          end_date: resignedNorm
        };
      });
      res.json(employees);
    } catch (err: any) {
      console.error('Error fetching employees:', err);
      res.status(500).json({ error: 'Lỗi tải danh sách nhân viên: ' + err.message });
    }
  });

  app.post('/api/employees', (req, res) => {
    const { code, name, department, role, phone, resigned_date, joined_date, start_date, end_date } = req.body;
    const finalJoined = (joined_date || start_date) ? normalizeDate(joined_date || start_date) : null;
    const finalResigned = (resigned_date || end_date) ? normalizeDate(resigned_date || end_date) : null;
    
    try {
      const result = db.prepare('INSERT INTO employees (code, name, department, role, phone, resigned_date, joined_date, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(code, name, department, role, phone, finalResigned, finalJoined, finalJoined, finalResigned);
      
      // Save to persistence table and file store
      if (finalJoined || finalResigned) {
        db.prepare('INSERT OR REPLACE INTO employee_date_persistence (code, name, joined_date, resigned_date, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)')
          .run(code, name, finalJoined, finalResigned, finalJoined, finalResigned);
        
        const fileStore = loadEmployeeDatesFromFile();
        fileStore[code] = { name, start_date: finalJoined, end_date: finalResigned };
        saveEmployeeDatesToFile(fileStore);
      }

      const newEmployee = db.prepare('SELECT * FROM employees WHERE id = ?').get(result.lastInsertRowid) as any;
      const responseEmp = {
        ...newEmployee,
        joined_date: finalJoined,
        resigned_date: finalResigned,
        start_date: finalJoined,
        end_date: finalResigned
      };

      io.emit('employees:updated');
      triggerSync(true); // immediate sync to Google Sheets
      res.json(responseEmp);
    } catch (error) {
      res.status(400).json({ error: 'Mã nhân viên đã tồn tại hoặc lỗi dữ liệu' });
    }
  });

  app.put('/api/employees/:id', (req, res) => {
    const { code, name, department, role, phone, resigned_date, joined_date, start_date, end_date } = req.body;
    
    // Check current employee to avoid wiping if field was omitted
    const currentEmp = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id) as any;
    let rawJoined = (joined_date !== undefined) ? joined_date : (start_date !== undefined ? start_date : (currentEmp?.joined_date || currentEmp?.start_date));
    let rawResigned = (resigned_date !== undefined) ? resigned_date : (end_date !== undefined ? end_date : (currentEmp?.resigned_date || currentEmp?.end_date));

    const finalJoined = rawJoined ? normalizeDate(rawJoined) : null;
    const finalResigned = rawResigned ? normalizeDate(rawResigned) : null;

    try {
      db.prepare('UPDATE employees SET code = ?, name = ?, department = ?, role = ?, phone = ?, resigned_date = ?, joined_date = ?, start_date = ?, end_date = ? WHERE id = ?')
        .run(code, name, department, role, phone, finalResigned, finalJoined, finalJoined, finalResigned, req.params.id);
      
      // Save to persistence table and file store
      if (finalJoined || finalResigned) {
        db.prepare('INSERT OR REPLACE INTO employee_date_persistence (code, name, joined_date, resigned_date, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)')
          .run(code, name, finalJoined, finalResigned, finalJoined, finalResigned);
        
        const fileStore = loadEmployeeDatesFromFile();
        fileStore[code] = { name, start_date: finalJoined, end_date: finalResigned };
        saveEmployeeDatesToFile(fileStore);
      }

      io.emit('employees:updated');
      io.emit('schedules:updated');
      triggerSync(true); // immediate sync to Google Sheets
      res.json({ success: true, start_date: finalJoined, end_date: finalResigned });
    } catch (error) {
      res.status(400).json({ error: 'Mã nhân viên đã tồn tại hoặc lỗi dữ liệu' });
    }
  });

  // Dedicated endpoints for managing preserved employee dates by Code
  app.get('/api/employee-dates', (req, res) => {
    try {
      const dates = db.prepare('SELECT * FROM employee_date_persistence').all();
      const fileStore = loadEmployeeDatesFromFile();
      res.json({ db: dates, file: fileStore });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/employee-dates/restore', (req, res) => {
    try {
      const { dates } = req.body;
      if (!dates) return res.status(400).json({ error: 'Thiếu dữ liệu' });

      const items = Array.isArray(dates) ? dates : Object.entries(dates).map(([code, val]: any) => ({ code, ...val }));
      const upsertPersistence = db.prepare(`
        INSERT OR REPLACE INTO employee_date_persistence (code, name, joined_date, resigned_date, start_date, end_date)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const updateEmployee = db.prepare(`
        UPDATE employees 
        SET start_date = COALESCE(?, start_date), 
            joined_date = COALESCE(?, joined_date), 
            end_date = COALESCE(?, end_date), 
            resigned_date = COALESCE(?, resigned_date)
        WHERE UPPER(TRIM(code)) = UPPER(TRIM(?))
      `);

      const fileStore = loadEmployeeDatesFromFile();
      let count = 0;

      items.forEach((item: any) => {
        if (!item.code) return;
        const code = item.code.toString().trim();
        const sDate = item.start_date || item.joined_date ? normalizeDate(item.start_date || item.joined_date) : null;
        const eDate = item.end_date || item.resigned_date ? normalizeDate(item.end_date || item.resigned_date) : null;

        if (sDate || eDate) {
          upsertPersistence.run(code, item.name || '', sDate, eDate, sDate, eDate);
          updateEmployee.run(sDate, sDate, eDate, eDate, code);
          fileStore[code] = { name: item.name || '', start_date: sDate, end_date: eDate };
          count++;
        }
      });

      saveEmployeeDatesToFile(fileStore);
      io.emit('employees:updated');
      triggerSync(true);

      res.json({ success: true, restored: count });
    } catch (err: any) {
      res.status(500).json({ error: 'Lỗi khôi phục ngày: ' + err.message });
    }
  });

  app.delete('/api/employees/:id', (req, res) => {
    try {
      const deleteEmp = db.transaction(() => {
        db.prepare('DELETE FROM schedules WHERE employee_id = ?').run(req.params.id);
        db.prepare('DELETE FROM employees WHERE id = ?').run(req.params.id);
      });
      deleteEmp();
      io.emit('employees:updated');
      io.emit('schedules:updated');
      triggerSync();
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting employee:', error);
      res.status(500).json({ error: 'Lỗi khi xóa nhân viên' });
    }
  });

  app.get('/api/shifts', (req, res) => {
    const shifts = db.prepare('SELECT * FROM shifts').all();
    res.json(shifts);
  });

  app.post('/api/shifts', (req, res) => {
    const { name, department, start_time, end_time, color, text_color } = req.body;
    const result = db.prepare('INSERT INTO shifts (name, department, start_time, end_time, color, text_color) VALUES (?, ?, ?, ?, ?, ?)')
      .run(name, department || 'All', start_time, end_time, color, text_color);
    io.emit('shifts:updated');
    triggerSync();
    res.json({ id: result.lastInsertRowid });
  });

  app.put('/api/shifts/:id', (req, res) => {
    const { name, department, start_time, end_time, color, text_color } = req.body;
    db.prepare('UPDATE shifts SET name = ?, department = ?, start_time = ?, end_time = ?, color = ?, text_color = ? WHERE id = ?')
      .run(name, department || 'All', start_time, end_time, color, text_color, req.params.id);
    io.emit('shifts:updated');
    triggerSync();
    res.json({ success: true });
  });

  app.delete('/api/shifts/:id', (req, res) => {
    db.prepare('DELETE FROM shifts WHERE id = ?').run(req.params.id);
    io.emit('shifts:updated');
    triggerSync();
    res.json({ success: true });
  });

  app.get('/api/schedules', (req, res) => {
    const { start, end } = req.query;
    const schedules = db.prepare(`
      SELECT s.*, 
        COALESCE(e.name, 'Chưa rõ') as employee_name, 
        COALESCE(e.department, 'All') as department, 
        COALESCE(sh.name, 'Chưa gán ca') as shift_name, 
        COALESCE(sh.start_time, '08:00') as start_time, 
        COALESCE(sh.end_time, '17:00') as end_time, 
        COALESCE(sh.color, '#94a3b8') as color, 
        COALESCE(sh.text_color, '#ffffff') as text_color
      FROM schedules s
      LEFT JOIN employees e ON (s.employee_id = e.id OR s.employee_id = e.code)
      LEFT JOIN shifts sh ON s.shift_id = sh.id
      WHERE s.date >= ? AND s.date <= ?
    `).all(start, end);
    res.json(schedules);
  });

  app.post('/api/schedules', (req, res) => {
    const { date, employee_id, shift_id, task, status, note } = req.body;
    const normalizedDate = normalizeDate(date);
    
    // Check locked month
    const month = normalizedDate.substring(0, 7);
    const isLocked = db.prepare('SELECT * FROM locked_months WHERE month = ?').get(month);
    if (isLocked) {
      return res.status(403).json({ error: 'Tháng này đã khóa lịch, không thể sửa' });
    }

    const existing = db.prepare('SELECT id FROM schedules WHERE date = ? AND employee_id = ?').get(normalizedDate, employee_id) as { id: number };
    
    if (existing) {
      db.prepare('UPDATE schedules SET shift_id = ?, task = ?, status = ?, note = ? WHERE id = ?')
        .run(shift_id, task, status, note || '', existing.id);
    } else {
      db.prepare('INSERT INTO schedules (date, employee_id, shift_id, task, status, note) VALUES (?, ?, ?, ?, ?, ?)')
        .run(normalizedDate, employee_id, shift_id, task, status, note || '');
    }
    
    io.emit('schedules:updated');
    triggerSync();
    res.json({ success: true });
  });

  app.delete('/api/schedules/:id', (req, res) => {
    db.prepare('DELETE FROM schedules WHERE id = ?').run(req.params.id);
    
    io.emit('schedules:updated');
    triggerSync();
    res.json({ success: true });
  });

  app.get('/api/announcements', (req, res) => {
    const { employee_id, department } = req.query;
    const now = new Date().toISOString();
    
    let announcements;
    if (employee_id) {
      // Get active announcements for a specific employee
      announcements = db.prepare(`
        SELECT a.*, e.name as creator_name, v.viewed_at
        FROM announcements a
        JOIN employees e ON a.created_by = e.id
        LEFT JOIN announcement_views v ON a.id = v.announcement_id AND v.employee_id = ?
        WHERE (a.start_time <= ? AND a.end_time >= ?)
        AND (
          a.target_type = 'All' 
          OR (a.target_type = 'Department' AND (',' || a.target_value || ',') LIKE ('%,' || ? || ',%'))
          OR (a.target_type = 'Individual' AND (',' || a.target_value || ',') LIKE ('%,' || ? || ',%'))
        )
      `).all(employee_id, now, now, department, employee_id);
    } else {
      // Admin/TL view all relevant announcements
      announcements = db.prepare(`
        SELECT a.*, e.name as creator_name
        FROM announcements a
        JOIN employees e ON a.created_by = e.id
        ORDER BY a.created_at DESC
      `).all();
    }
    res.json(announcements);
  });

  app.post('/api/announcements', (req, res) => {
    const { type, target_type, target_value, message, start_time, end_time, created_by } = req.body;
    const created_at = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO announcements (type, target_type, target_value, message, start_time, end_time, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(type, target_type, target_value, message, start_time, end_time, created_by, created_at);
    
    io.emit('announcements:updated');
    triggerSync();
    res.json({ success: true });
  });

  app.put('/api/announcements/:id', (req, res) => {
    const { type, target_type, target_value, message, start_time, end_time } = req.body;
    db.prepare(`
      UPDATE announcements 
      SET type = ?, target_type = ?, target_value = ?, message = ?, start_time = ?, end_time = ?
      WHERE id = ?
    `).run(type, target_type, target_value, message, start_time, end_time, req.params.id);
    
    io.emit('announcements:updated');
    triggerSync();
    res.json({ success: true });
  });

  app.post('/api/announcements/:id/view', (req, res) => {
    const { employee_id } = req.body;
    const viewed_at = new Date().toISOString();
    db.prepare('INSERT OR IGNORE INTO announcement_views (announcement_id, employee_id, viewed_at) VALUES (?, ?, ?)')
      .run(req.params.id, employee_id, viewed_at);
    res.json({ success: true });
  });

  app.get('/api/announcements/:id/views', (req, res) => {
    const views = db.prepare(`
      SELECT e.id, e.name, e.code, e.department, v.viewed_at
      FROM employees e
      LEFT JOIN announcement_views v ON e.id = v.employee_id AND v.announcement_id = ?
      WHERE e.role != 'Guest'
    `).all(req.params.id);
    res.json(views);
  });

  app.delete('/api/announcements/:id', (req, res) => {
    db.prepare('DELETE FROM announcements WHERE id = ?').run(req.params.id);
    io.emit('announcements:updated');
    triggerSync();
    res.json({ success: true });
  });

  app.get('/api/leave-requests', (req, res) => {
    const requests = db.prepare(`
      SELECT lr.*, e.name as employee_name, e.department, s.name as shift_name 
      FROM leave_requests lr
      JOIN employees e ON lr.employee_id = e.id
      JOIN shifts s ON lr.shift_id = s.id
      ORDER BY lr.created_at DESC
    `).all();
    res.json(requests);
  });

  app.post('/api/leave-requests', (req, res) => {
    const { employee_id, date, shift_id, reason } = req.body;
    const normalizedDate = normalizeDate(date);
    const created_at = new Date().toISOString();
    db.prepare('INSERT INTO leave_requests (employee_id, date, shift_id, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(employee_id, normalizedDate, shift_id, reason, 'Chờ duyệt', created_at);
    io.emit('leave_requests:updated');
    triggerSync();
    res.json({ success: true });
  });

  app.put('/api/leave-requests/:id/status', (req, res) => {
    const { status } = req.body;
    const id = Number(req.params.id);
    
    console.log(`[LeaveRequest] Updating ID ${id} to status: ${status}`);
    
    db.prepare('UPDATE leave_requests SET status = ? WHERE id = ?').run(status, id);
    
    if (status === 'Đã duyệt') {
      reconcileLeaveRequestsWithSchedules();
    } else if (status === 'Từ chối') {
      const reqData = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(id) as any;
      if (reqData) {
        const normalizedDate = normalizeDate(reqData.date);
        console.log(`[LeaveRequest] Removing schedule for denied request on ${normalizedDate}`);
        db.prepare("DELETE FROM schedules WHERE date = ? AND employee_id = ? AND note = 'Nghỉ phép đã duyệt'")
          .run(normalizedDate, reqData.employee_id);
        io.emit('schedules:updated');
      }
    }
    
    io.emit('leave_requests:updated');
    triggerSync();
    res.json({ success: true });
  });

  app.delete('/api/leave-requests/:id', (req, res) => {
    const id = Number(req.params.id);
    const reqData = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(id) as any;
    
    if (reqData) {
      db.prepare('DELETE FROM leave_requests WHERE id = ?').run(id);
      io.emit('leave_requests:updated');
      triggerSync();
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Không tìm thấy đơn' });
    }
  });

  app.delete('/api/schedules/week', (req, res) => {
    const { start, end, department } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'Thiếu ngày bắt đầu hoặc kết thúc' });

    // Check locked month
    const month = (start as string).substring(0, 7);
    const isLocked = db.prepare('SELECT * FROM locked_months WHERE month = ?').get(month);
    if (isLocked) {
      return res.status(403).json({ error: 'Tháng này đã khóa lịch, không thể xóa' });
    }

    if (department) {
      db.prepare(`
        DELETE FROM schedules 
        WHERE date >= ? AND date <= ? 
        AND employee_id IN (SELECT id FROM employees WHERE department = ?)
      `).run(start, end, department);
    } else {
      db.prepare('DELETE FROM schedules WHERE date >= ? AND date <= ?').run(start, end);
    }
    
    io.emit('schedules:updated');
    triggerSync();
    res.json({ success: true });
  });

  app.post('/api/sync', async (req, res) => {
    try {
      const result = await loadFromGoogleSheets();
      if (result.success) {
        io.emit('employees:updated');
        io.emit('shifts:updated');
        io.emit('schedules:updated');
        io.emit('settings:updated');
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      res.status(500).json({ success: false, error: 'Lỗi hệ thống: ' + error.message });
    }
  });

  app.post('/api/sync-to-sheets', async (req, res) => {
    try {
      const result = await pushToGoogleSheets();
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      res.status(500).json({ success: false, error: 'Lỗi đồng bộ lên Google Sheets: ' + error.message });
    }
  });

  app.get('/api/locked-months', (req, res) => {
    const months = db.prepare('SELECT month FROM locked_months').all().map((m: any) => m.month);
    res.json(months);
  });

  app.post('/api/locked-months', (req, res) => {
    const { month, locked } = req.body;
    if (locked) {
      db.prepare('INSERT OR IGNORE INTO locked_months (month) VALUES (?)').run(month);
    } else {
      db.prepare('DELETE FROM locked_months WHERE month = ?').run(month);
    }
    io.emit('settings:updated');
    triggerSync();
    res.json({ success: true });
  });

  app.get('/api/settings', (req, res) => {
    const settings = db.prepare('SELECT * FROM settings').all();
    res.json(settings);
  });

  app.post('/api/settings', (req, res) => {
    const { key, value } = req.body;
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
    saveSettingsToFile(key, value);
    if (key === 'GOOGLE_SHEETS_URL' && value) {
      loadFromGoogleSheets();
    }
    res.json({ success: true });
  });

  app.get('/api/tasks', (req, res) => {
    const { department } = req.query;
    let tasks;
    if (department && department !== 'All') {
      tasks = db.prepare('SELECT * FROM tasks WHERE department = ? OR department = "All"').all(department);
    } else {
      tasks = db.prepare('SELECT * FROM tasks').all();
    }
    res.json(tasks);
  });

  app.post('/api/tasks', (req, res) => {
    const { department, name, color, text_color } = req.body;
    db.prepare('INSERT INTO tasks (department, name, color, text_color) VALUES (?, ?, ?, ?)')
      .run(department, name, color, text_color);
    io.emit('tasks:updated');
    triggerSync();
    res.json({ success: true });
  });

  app.delete('/api/tasks/:id', (req, res) => {
    db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
    io.emit('tasks:updated');
    triggerSync();
    res.json({ success: true });
  });

  // Assigned Tasks API
  app.get('/api/assigned-tasks', (req, res) => {
    const { employee_id, department, role } = req.query;
    
    let tasks;
    if (role === 'Admin') {
      tasks = db.prepare(`
        SELECT t.*, e.name as creator_name, ta.employee_id, ta.status, ta.completed_at, ta.viewed_at, ta.received_at
        FROM assigned_tasks t
        JOIN employees e ON t.created_by = e.id
        LEFT JOIN task_assignments ta ON t.id = ta.task_id
        ORDER BY t.created_at DESC
      `).all();
    } else if (role === 'Tổ trưởng') {
      tasks = db.prepare(`
        SELECT DISTINCT t.*, e.name as creator_name, ta.employee_id, ta.status, ta.completed_at, ta.viewed_at, ta.received_at
        FROM assigned_tasks t
        JOIN employees e ON t.created_by = e.id
        LEFT JOIN task_assignments ta ON t.id = ta.task_id
        WHERE t.created_by = ? 
        OR (t.target_type = 'Department' AND t.target_value = ?)
        OR (t.target_type = 'Individual' AND ta.employee_id = ?)
        ORDER BY t.created_at DESC
      `).all(employee_id, department, employee_id);
    } else {
      tasks = db.prepare(`
        SELECT t.*, e.name as creator_name, ta.employee_id, ta.status, ta.viewed_at, ta.completed_at, ta.received_at
        FROM assigned_tasks t
        JOIN employees e ON t.created_by = e.id
        JOIN task_assignments ta ON t.id = ta.task_id
        ORDER BY t.created_at DESC
      `).all();
    }
    res.json(tasks);
  });

  app.post('/api/assigned-tasks', (req, res) => {
    const { title, description, target_type, target_value, created_by, employee_ids, due_date } = req.body;
    const created_at = new Date().toISOString();
    
    const result = db.prepare(`
      INSERT INTO assigned_tasks (title, description, target_type, target_value, created_by, created_at, due_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(title, description, target_type, target_value, created_by, created_at, due_date || null);
    
    const taskId = result.lastInsertRowid;
    
    let targetEmployeeIds: number[] = [];
    if (target_type === 'All') {
      const allEmps = db.prepare('SELECT id FROM employees').all() as { id: number }[];
      targetEmployeeIds = allEmps.map(e => e.id);
    } else if (target_type === 'Department') {
      const deptEmps = db.prepare('SELECT id FROM employees WHERE department = ?').all(target_value) as { id: number }[];
      targetEmployeeIds = deptEmps.map(e => e.id);
    } else if (employee_ids && Array.isArray(employee_ids)) {
      targetEmployeeIds = employee_ids;
    }
    
    if (targetEmployeeIds.length > 0) {
      const insertAssign = db.prepare('INSERT INTO task_assignments (task_id, employee_id) VALUES (?, ?)');
      targetEmployeeIds.forEach((empId: number) => {
        insertAssign.run(taskId, empId);
      });
    }
    
    io.emit('assigned_tasks:updated');
    triggerSync();
    res.json({ success: true, id: taskId });
  });

  app.put('/api/assigned-tasks/:id', (req, res) => {
    const { title, description, target_type, target_value, employee_ids, due_date } = req.body;
    const taskId = req.params.id;
    
    db.prepare(`
      UPDATE assigned_tasks 
      SET title = ?, description = ?, target_type = ?, target_value = ?, due_date = ?
      WHERE id = ?
    `).run(title, description, target_type, target_value, due_date || null, taskId);
    
    if (employee_ids && Array.isArray(employee_ids)) {
      // Update assignments: remove old ones not in new list, add new ones
      const currentAssignments = db.prepare('SELECT employee_id FROM task_assignments WHERE task_id = ?').all(taskId) as { employee_id: number }[];
      const currentIds = currentAssignments.map(a => a.employee_id);
      
      const toRemove = currentIds.filter(id => !employee_ids.includes(id));
      const toAdd = employee_ids.filter(id => !currentIds.includes(id));
      
      if (toRemove.length > 0) {
        const removeStmt = db.prepare('DELETE FROM task_assignments WHERE task_id = ? AND employee_id = ?');
        toRemove.forEach(id => removeStmt.run(taskId, id));
      }
      
      if (toAdd.length > 0) {
        const addStmt = db.prepare('INSERT INTO task_assignments (task_id, employee_id) VALUES (?, ?)');
        toAdd.forEach(id => addStmt.run(taskId, id));
      }
    }
    
    io.emit('assigned_tasks:updated');
    triggerSync();
    res.json({ success: true });
  });

  app.delete('/api/assigned-tasks/:id', (req, res) => {
    const taskId = req.params.id;
    db.transaction(() => {
      db.prepare('DELETE FROM task_assignments WHERE task_id = ?').run(taskId);
      db.prepare('DELETE FROM assigned_tasks WHERE id = ?').run(taskId);
    })();
    
    io.emit('assigned_tasks:updated');
    triggerSync();
    res.json({ success: true });
  });

  app.post('/api/assigned-tasks/:id/view', (req, res) => {
    const { employee_id } = req.body;
    const viewed_at = new Date().toISOString();
    db.prepare('UPDATE task_assignments SET viewed_at = ? WHERE task_id = ? AND employee_id = ? AND viewed_at IS NULL')
      .run(viewed_at, req.params.id, employee_id);
    io.emit('assigned_tasks:updated');
    triggerSync();
    res.json({ success: true });
  });

  app.post('/api/assigned-tasks/:id/receive', (req, res) => {
    const { employee_id } = req.body;
    db.prepare("UPDATE task_assignments SET received_at = ?, status = 'Received' WHERE task_id = ? AND employee_id = ?")
      .run(new Date().toISOString(), req.params.id, employee_id);
    io.emit('assigned_tasks:updated');
    triggerSync();
    res.json({ success: true });
  });

  app.post('/api/assigned-tasks/:id/complete', (req, res) => {
    const { employee_id, completed } = req.body;
    const completed_at = completed ? new Date().toISOString() : null;
    const status = completed ? 'Completed' : 'Pending';
    
    db.prepare('UPDATE task_assignments SET status = ?, completed_at = ? WHERE task_id = ? AND employee_id = ?')
      .run(status, completed_at, req.params.id, employee_id);
    
    io.emit('assigned_tasks:updated');
    triggerSync();
    res.json({ success: true });
  });

  app.get('/api/assigned-tasks/:id/status', (req, res) => {
    const status = db.prepare(`
      SELECT e.id, e.name, e.code, e.department, ta.status, ta.viewed_at, ta.completed_at
      FROM task_assignments ta
      JOIN employees e ON ta.employee_id = e.id
      WHERE ta.task_id = ?
    `).all(req.params.id);
    res.json(status);
  });

  app.get('/api/assigned-tasks/pending-count', (req, res) => {
    const { employee_id } = req.query;
    const result = db.prepare(`
      SELECT COUNT(*) as count, GROUP_CONCAT(t.title, '|') as titles
      FROM task_assignments ta
      JOIN assigned_tasks t ON ta.task_id = t.id
      WHERE ta.employee_id = ? AND ta.status IN ('Pending', 'Received')
    `).get(employee_id) as { count: number, titles: string | null };
    
    res.json({
      count: result.count,
      titles: result.titles ? result.titles.split('|') : []
    });
  });

  app.post('/api/change-password', (req, res) => {
    const { employee_id, new_password } = req.body;
    db.prepare('UPDATE employees SET password = ? WHERE id = ?').run(new_password, employee_id);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  httpServer.listen(PORT, '0.0.0.0', async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Auto-sync from Google Sheets on startup if URL exists
    // This helps restore data on Render free tier which has ephemeral storage
    const url = getGoogleSheetsUrl();
    if (url) {
      console.log('Auto-syncing from Google Sheets on startup...');
      try {
        await loadFromGoogleSheets();
        console.log('Auto-sync completed.');
      } catch (e) {
        console.error('Auto-sync failed:', e);
      }
    }
  });
}

startServer();
