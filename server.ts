import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';

dotenv.config();

const db = new Database('schedule.db');

const GOOGLE_SHEETS_URL = process.env.GOOGLE_SHEETS_URL;

function getGoogleSheetsUrl() {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('GOOGLE_SHEETS_URL') as { value: string } | undefined;
    const envUrl = process.env.GOOGLE_SHEETS_URL;
    
    // If found in DB, use it
    if (row && row.value) return row.value;
    
    // If not in DB but in ENV, save to DB so UI shows it, and return it
    if (envUrl) {
      try {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('GOOGLE_SHEETS_URL', envUrl);
      } catch (e) {
        console.error('Failed to save ENV GOOGLE_SHEETS_URL to DB:', e);
      }
      return envUrl;
    }
    
    return undefined;
  } catch (e) {
    return process.env.GOOGLE_SHEETS_URL;
  }
}

let syncTimeout: NodeJS.Timeout | null = null;
let io: Server | null = null;

function triggerSync() {
  const url = getGoogleSheetsUrl();
  if (!url) return;
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(async () => {
    try {
      const employees = db.prepare('SELECT * FROM employees').all();
      const shifts = db.prepare('SELECT * FROM shifts').all();
      const schedules = db.prepare('SELECT * FROM schedules').all();
      const lockedMonths = db.prepare('SELECT * FROM locked_months').all();
      const announcements = db.prepare('SELECT * FROM announcements').all();
      const announcementViews = db.prepare('SELECT * FROM announcement_views').all();
      const leaveRequests = db.prepare('SELECT * FROM leave_requests').all();
      const tasks = db.prepare('SELECT * FROM tasks').all();
      const assignedTasks = db.prepare('SELECT * FROM assigned_tasks').all();
      const taskAssignments = db.prepare('SELECT * FROM task_assignments').all();

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
      }
    } catch (err) {
      console.error('Failed to sync to Google Sheets:', err);
    }
  }, 2000);
}

function normalizeDate(dateStr: any): string {
  if (!dateStr || typeof dateStr !== 'string') return dateStr;
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
    }
  }
  return normalized;
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
    const res = await fetch(url);
    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      const errorMsg = 'URL trả về không phải dữ liệu JSON hợp lệ. Hãy kiểm tra lại bước Triển khai (Deploy) trong Apps Script.';
      console.error('\n=============================================================');
      console.error('❌ LỖI KẾT NỐI GOOGLE SHEETS:', errorMsg);
      console.error('Nội dung phản hồi (trích đoạn):', text.substring(0, 200) + '...');
      console.error('=============================================================\n');
      return { success: false, error: errorMsg, details: text.substring(0, 100) };
    }

    if (data && data.employees) {
      const sheetEmpCount = data.employees.length;
      const sheetSchedCount = data.schedules ? data.schedules.length : 0;
      console.log(`Sheet data received: ${sheetEmpCount} employees, ${sheetSchedCount} schedules.`);

      const localEmpCount = db.prepare('SELECT COUNT(*) as count FROM employees').get() as { count: number };
      
      if (sheetEmpCount === 0 && localEmpCount.count > 0) {
        const warnMsg = 'Dữ liệu nhân viên từ Google Sheets trống. Hệ thống đã chặn việc xóa dữ liệu cục bộ để bảo vệ an toàn.';
        console.warn('⚠️ CẢNH BÁO:', warnMsg);
        return { success: false, error: warnMsg };
      }

      db.transaction(() => {
        console.log('Wiping local data and replacing with Sheet data...');
        db.prepare('DELETE FROM employees').run();
        db.prepare('DELETE FROM shifts').run();
        db.prepare('DELETE FROM schedules').run();
        db.prepare('DELETE FROM locked_months').run();
        db.prepare('DELETE FROM announcements').run();
        db.prepare('DELETE FROM leave_requests').run();
        
        if (data.tasks && data.tasks.length > 0) {
          db.prepare('DELETE FROM tasks').run();
        }
        
        if (data.assignedTasks && data.assignedTasks.length > 0) {
          db.prepare('DELETE FROM assigned_tasks').run();
        }
        
        if (data.taskAssignments && data.taskAssignments.length > 0) {
          db.prepare('DELETE FROM task_assignments').run();
        }

        if (sheetEmpCount > 0) {
          const insertEmp = db.prepare('INSERT OR REPLACE INTO employees (id, code, name, department, role, phone, password, resigned_date, joined_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
          let hasAdmin = false;
          data.employees.forEach((e: any) => {
            let role = e.role || 'Nhân viên';
            const roleLower = role.toLowerCase();
            if (roleLower === 'admin') {
              role = 'Admin';
              hasAdmin = true;
            }
            else if (roleLower === 'tổ trưởng') role = 'Tổ trưởng';
            else role = 'Nhân viên';
            
            let password = e.password !== undefined && e.password !== null ? String(e.password) : '';
            if (role === 'Admin' && !password) password = '1234';
            
            const resignedDate = e.resigned_date ? normalizeDate(e.resigned_date) : null;
            const joinedDate = e.joined_date ? normalizeDate(e.joined_date) : null;
            
            insertEmp.run(e.id, e.code, e.name, e.department, role, e.phone, password, resignedDate, joinedDate);
          });
          
          if (!hasAdmin) {
            console.log('No Admin found in Sheet, adding default Admin.');
            const insertDefaultAdmin = db.prepare('INSERT INTO employees (code, name, department, role, phone, password) VALUES (?, ?, ?, ?, ?, ?)');
            insertDefaultAdmin.run('ADMIN', 'Quản trị viên', 'Quản lý', 'Admin', '0999999999', '1234');
          }
        } else {
          console.log('Sheet has no employees, keeping/adding default Admin.');
          const insertDefaultAdmin = db.prepare('INSERT INTO employees (code, name, department, role, phone, password) VALUES (?, ?, ?, ?, ?, ?)');
          insertDefaultAdmin.run('ADMIN', 'Quản trị viên', 'Quản lý', 'Admin', '0999999999', '1234');
        }

        if (data.shifts && data.shifts.length > 0) {
          const insertShift = db.prepare('INSERT OR REPLACE INTO shifts (id, name, department, start_time, end_time, color, text_color) VALUES (?, ?, ?, ?, ?, ?, ?)');
          data.shifts.forEach((s: any) => {
            let start = s.start_time;
            let end = s.end_time;
            if (start && start.includes('T')) start = start.split('T')[1].substring(0, 5);
            if (end && end.includes('T')) end = end.split('T')[1].substring(0, 5);
            insertShift.run(s.id, s.name, s.department || 'All', start, end, s.color, s.text_color);
          });
        }

        if (data.schedules && data.schedules.length > 0) {
          const insertSchedWithId = db.prepare('INSERT OR REPLACE INTO schedules (id, date, employee_id, shift_id, task, status, note) VALUES (?, ?, ?, ?, ?, ?, ?)');
          const insertSchedNoId = db.prepare('INSERT INTO schedules (date, employee_id, shift_id, task, status, note) VALUES (?, ?, ?, ?, ?, ?)');
          
          data.schedules.forEach((s: any) => {
            const normalizedDate = normalizeDate(s.date);
            if (s.id) insertSchedWithId.run(s.id, normalizedDate, s.employee_id, s.shift_id, s.task, s.status, s.note);
            else insertSchedNoId.run(normalizedDate, s.employee_id, s.shift_id, s.task, s.status, s.note);
          });
        }

        if (data.lockedMonths && data.lockedMonths.length > 0) {
          const insertLock = db.prepare('INSERT OR IGNORE INTO locked_months (month) VALUES (?)');
          data.lockedMonths.forEach((l: any) => {
            if (l && l.month) insertLock.run(l.month);
          });
        }

        if (data.announcements && data.announcements.length > 0) {
          const insertAnn = db.prepare('INSERT INTO announcements (id, type, target_type, target_value, message, start_time, end_time, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
          data.announcements.forEach((a: any) => insertAnn.run(a.id, a.type, a.target_type, a.target_value, a.message, a.start_time, a.end_time, a.created_by, a.created_at));
        }

        db.prepare('DELETE FROM announcement_views').run();
        if (data.announcementViews && data.announcementViews.length > 0) {
          const insertView = db.prepare('INSERT INTO announcement_views (announcement_id, employee_id, viewed_at) VALUES (?, ?, ?)');
          data.announcementViews.forEach((v: any) => insertView.run(v.announcement_id, v.employee_id, v.viewed_at));
        }

        if (data.leaveRequests && data.leaveRequests.length > 0) {
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
          const insertAssigned = db.prepare('INSERT INTO assigned_tasks (id, title, description, created_by, created_at, target_type, target_value) VALUES (?, ?, ?, ?, ?, ?, ?)');
          data.assignedTasks.forEach((t: any) => insertAssigned.run(t.id, t.title, t.description, t.created_by, t.created_at, t.target_type, t.target_value));
        }

        if (data.taskAssignments && data.taskAssignments.length > 0) {
          const insertAssign = db.prepare('INSERT INTO task_assignments (task_id, employee_id, status, viewed_at, completed_at) VALUES (?, ?, ?, ?, ?)');
          data.taskAssignments.forEach((a: any) => insertAssign.run(a.task_id, a.employee_id, a.status, a.viewed_at, a.completed_at));
        }
      })();
      
      // Reconcile leave requests after loading from sheet
      reconcileLeaveRequestsWithSchedules();
      
      seedTasks();
      return { success: true, employees: sheetEmpCount, schedules: sheetSchedCount };
    }
    return { success: false, error: 'Dữ liệu từ Google Sheets không hợp lệ hoặc thiếu bảng Nhan_Vien' };
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
    resigned_date TEXT,
    joined_date TEXT
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
    const employees = db.prepare('SELECT * FROM employees').all();
    res.json(employees);
  });

  app.post('/api/employees', (req, res) => {
    const { code, name, department, role, phone, resigned_date, joined_date } = req.body;
    try {
      const result = db.prepare('INSERT INTO employees (code, name, department, role, phone, resigned_date, joined_date) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(code, name, department, role, phone, resigned_date || null, joined_date || null);
      const newEmployee = db.prepare('SELECT * FROM employees WHERE id = ?').get(result.lastInsertRowid);
      io.emit('employees:updated');
      triggerSync();
      res.json(newEmployee);
    } catch (error) {
      res.status(400).json({ error: 'Mã nhân viên đã tồn tại hoặc lỗi dữ liệu' });
    }
  });

  app.put('/api/employees/:id', (req, res) => {
    const { code, name, department, role, phone, resigned_date, joined_date } = req.body;
    try {
      db.prepare('UPDATE employees SET code = ?, name = ?, department = ?, role = ?, phone = ?, resigned_date = ?, joined_date = ? WHERE id = ?')
        .run(code, name, department, role, phone, resigned_date || null, joined_date || null, req.params.id);
      io.emit('employees:updated');
      io.emit('schedules:updated');
      triggerSync();
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: 'Mã nhân viên đã tồn tại hoặc lỗi dữ liệu' });
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
      SELECT s.*, e.name as employee_name, e.department, sh.name as shift_name, sh.start_time, sh.end_time, sh.color, sh.text_color
      FROM schedules s
      LEFT JOIN employees e ON s.employee_id = e.id
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

  app.post('/api/schedules/copy-week', (req, res) => {
    const { fromStartDate, toStartDate } = req.body;
    const fromDateObj = new Date(fromStartDate);
    const toDateObj = new Date(toStartDate);
    
    const diffTime = toDateObj.getTime() - fromDateObj.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    const schedulesToCopy = db.prepare(`
      SELECT * FROM schedules 
      WHERE date >= ? AND date <= date(?, '+6 days')
    `).all(fromStartDate, fromStartDate) as any[];

    const insertStmt = db.prepare('INSERT INTO schedules (date, employee_id, shift_id, task, status, note) VALUES (?, ?, ?, ?, ?, ?)');
    const checkStmt = db.prepare('SELECT id FROM schedules WHERE date = ? AND employee_id = ?');
    const updateStmt = db.prepare('UPDATE schedules SET shift_id = ?, task = ?, status = ?, note = ? WHERE id = ?');

    const transaction = db.transaction((schedules) => {
      for (const s of schedules) {
        const oldDate = new Date(s.date);
        const newDate = new Date(oldDate.getTime() + diffDays * 24 * 60 * 60 * 1000);
        const newDateStr = newDate.toISOString().split('T')[0];
        
        // Check if employee is still active at newDateStr
        const emp = db.prepare('SELECT joined_date, resigned_date FROM employees WHERE id = ?').get(s.employee_id) as any;
        if (emp) {
          if (emp.joined_date && newDateStr < emp.joined_date) continue;
          if (emp.resigned_date && newDateStr > emp.resigned_date) continue;
        }

        const existing = checkStmt.get(newDateStr, s.employee_id) as any;
        if (existing) {
          updateStmt.run(s.shift_id, s.task, s.status, s.note || '', existing.id);
        } else {
          insertStmt.run(newDateStr, s.employee_id, s.shift_id, s.task, s.status, s.note || '');
        }
      }
    });

    transaction(schedulesToCopy);
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

  app.post('/api/schedules/bulk', (req, res) => {
    const { schedules } = req.body;
    const insertStmt = db.prepare('INSERT INTO schedules (date, employee_id, shift_id, task, status, note) VALUES (?, ?, ?, ?, ?, ?)');
    const updateStmt = db.prepare('UPDATE schedules SET shift_id = ?, task = ?, status = ?, note = ? WHERE id = ?');
    const checkStmt = db.prepare('SELECT id FROM schedules WHERE date = ? AND employee_id = ?');

    const transaction = db.transaction((scheds) => {
      for (const s of scheds) {
        const existing = checkStmt.get(s.date, s.employee_id) as any;
        if (existing) {
          updateStmt.run(s.shift_id, s.task, s.status, s.note || '', existing.id);
        } else {
          insertStmt.run(s.date, s.employee_id, s.shift_id, s.task, s.status, s.note || '');
        }
      }
    });

    transaction(schedules);
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
