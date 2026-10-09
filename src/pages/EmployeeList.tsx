import React, { useState, useEffect } from 'react';
import { socket } from '../socket';
import { Role } from '../types';
import { Search, UserPlus, Edit2, Trash2, Calendar, Download, RefreshCw, CheckCircle2 } from 'lucide-react';

interface Employee {
  id: number;
  code: string;
  name: string;
  department: string;
  role: string;
  phone: string;
  resigned_date?: string | null;
  joined_date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

const DEPARTMENTS = ['Quản lý', 'Bán hàng', 'Thu ngân', 'Kỹ thuật', 'Giao vận', 'Kho'];
const ROLES = ['Admin', 'Tổ trưởng', 'Nhân viên'];

const formatDateDisplay = (dateStr?: string | null) => {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('vi-VN');
};

export default function EmployeeList({ role }: { role: Role }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ 
    code: '', 
    name: '', 
    department: 'Bán hàng', 
    role: 'Nhân viên', 
    phone: '', 
    resigned_date: '', 
    joined_date: '',
    start_date: '',
    end_date: ''
  });
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number, name: string } | null>(null);
  const [showDatesModal, setShowDatesModal] = useState(false);
  const [savedDatesStore, setSavedDatesStore] = useState<any[]>([]);
  const [datesLoading, setDatesLoading] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);

  const fetchSavedDates = async () => {
    setDatesLoading(true);
    try {
      const res = await fetch('/api/employee-dates');
      if (res.ok) {
        const data = await res.json();
        // Merge db records and fileStore
        const merged: Record<string, any> = {};
        if (Array.isArray(data.db)) {
          data.db.forEach((item: any) => {
            if (item.code) merged[item.code.toUpperCase()] = { ...item };
          });
        }
        if (data.file && typeof data.file === 'object') {
          Object.entries(data.file).forEach(([code, val]: any) => {
            const cUpper = code.toUpperCase();
            merged[cUpper] = {
              code: cUpper,
              name: val.name || merged[cUpper]?.name || '',
              start_date: val.start_date || merged[cUpper]?.start_date || '',
              end_date: val.end_date || merged[cUpper]?.end_date || ''
            };
          });
        }
        setSavedDatesStore(Object.values(merged));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDatesLoading(false);
    }
  };

  const handleRestoreAllDates = async () => {
    setDatesLoading(true);
    setRestoreStatus('Đang khôi phục...');
    try {
      // 1. Lấy từ localStorage nếu có
      const localRaw = localStorage.getItem('EMPLOYEE_DATES_CACHE');
      const localDates = localRaw ? JSON.parse(localRaw) : {};
      
      // 2. Gửi yêu cầu server khôi phục
      const res = await fetch('/api/employee-dates/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dates: localDates })
      });
      const data = await res.json();
      if (res.ok) {
        setRestoreStatus(`Đã khôi phục thành công ${data.restored || 0} nhân viên!`);
        fetchEmployees();
        fetchSavedDates();
        setTimeout(() => setRestoreStatus(null), 4000);
      } else {
        setRestoreStatus(`Lỗi: ${data.error}`);
      }
    } catch (err: any) {
      setRestoreStatus(`Lỗi kết nối: ${err.message}`);
    } finally {
      setDatesLoading(false);
    }
  };

  const handleBackupDatesJson = () => {
    const dataToExport: Record<string, any> = {};
    employees.forEach(e => {
      if (e.code) {
        dataToExport[e.code.toUpperCase()] = {
          name: e.name,
          department: e.department,
          start_date: e.start_date || e.joined_date || null,
          end_date: e.end_date || e.resigned_date || null
        };
      }
    });
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `ngay_nhan_vien_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const fetchEmployees = async () => {
    try {
      const res = await fetch('/api/employees');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setEmployees(data);
          try {
            const rawCache = localStorage.getItem('EMPLOYEE_DATES_CACHE');
            const cache = rawCache ? JSON.parse(rawCache) : {};
            let updated = false;
            data.forEach(e => {
              if (e.code) {
                const s = e.start_date || e.joined_date;
                const end = e.end_date || e.resigned_date;
                if (s || end) {
                  cache[e.code] = { name: e.name, start_date: s || null, end_date: end || null };
                  updated = true;
                }
              }
            });
            if (updated) {
              localStorage.setItem('EMPLOYEE_DATES_CACHE', JSON.stringify(cache));
            }
          } catch (err) {}
        }
      }
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  };

  useEffect(() => {
    fetchEmployees();
    socket.on('employees:updated', fetchEmployees);
    return () => {
      socket.off('employees:updated', fetchEmployees);
    };
  }, []);

  const openAddForm = () => {
    setEditingId(null);
    setFormData({ 
      code: '', 
      name: '', 
      department: 'Bán hàng', 
      role: 'Nhân viên', 
      phone: '', 
      resigned_date: '', 
      joined_date: '',
      start_date: '',
      end_date: ''
    });
    setShowForm(true);
  };

  const openEditForm = (emp: Employee) => {
    setEditingId(emp.id);
    const startVal = emp.start_date || emp.joined_date || '';
    const endVal = emp.end_date || emp.resigned_date || '';
    setFormData({ 
      code: emp.code, 
      name: emp.name, 
      department: emp.department, 
      role: emp.role, 
      phone: emp.phone || '',
      resigned_date: endVal,
      joined_date: startVal,
      start_date: startVal,
      end_date: endVal
    });
    setShowForm(true);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const res = await fetch(`/api/employees/${deleteConfirm.id}`, { method: 'DELETE' });
      if (!res.ok) {
        alert('Lỗi khi xóa nhân viên');
      }
    } catch (err) {
      alert('Lỗi kết nối');
    }
    setDeleteConfirm(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = editingId ? `/api/employees/${editingId}` : '/api/employees';
    const method = editingId ? 'PUT' : 'POST';
    
    const startDateVal = formData.start_date || formData.joined_date || '';
    const endDateVal = formData.end_date || formData.resigned_date || '';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...formData,
        start_date: startDateVal,
        end_date: endDateVal,
        joined_date: startDateVal,
        resigned_date: endDateVal
      })
    });
    
    if (res.ok) {
      setShowForm(false);
      fetchEmployees();
      fetch('/api/sync-to-sheets', { method: 'POST' })
        .then(r => r.json())
        .then(data => {
          if (data && data.success) {
            console.log('Đã tự động đồng bộ lên Google Sheets thành công');
          }
        })
        .catch(() => {});
    } else {
      const err = await res.json();
      alert(err.error);
    }
  };

  const filtered = employees
    .filter(e => 
      (e.name || '').toLowerCase().includes(search.toLowerCase()) || 
      (e.code || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.department || '').toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const deptA = DEPARTMENTS.indexOf(a.department || '');
      const deptB = DEPARTMENTS.indexOf(b.department || '');
      if (deptA !== deptB) return (deptA === -1 ? 99 : deptA) - (deptB === -1 ? 99 : deptB);
      
      const roleA = ROLES.indexOf(a.role || '');
      const roleB = ROLES.indexOf(b.role || '');
      if (roleA !== roleB) return (roleA === -1 ? 99 : roleA) - (roleB === -1 ? 99 : roleB);
      
      return (a.name || '').localeCompare(b.name || '');
    });

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Nhân sự / Staff</h2>
          <p className="text-slate-500">Quản lý danh sách nhân viên</p>
        </div>
        
        {role === 'Admin' && (
          <div className="flex flex-wrap items-center gap-2">
            <button 
              onClick={() => {
                setShowDatesModal(true);
                fetchSavedDates();
              }}
              className="flex items-center gap-2 bg-slate-100 text-slate-700 hover:bg-slate-200 px-3.5 py-2 rounded-xl transition-colors font-medium text-sm border border-slate-200"
              title="Quản lý và khôi phục ngày vào làm / ngày nghỉ việc đã lưu vĩnh viễn theo Mã NV"
            >
              <Calendar className="w-4 h-4 text-indigo-600" />
              <span>Kho lưu trữ ngày ({savedDatesStore.length || '...'})</span>
            </button>
            <button 
              onClick={openAddForm}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm font-medium text-sm"
            >
              <UserPlus className="w-4 h-4" />
              <span>Thêm nhân viên</span>
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
        <div className="p-4 border-b border-slate-100">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input 
              type="text" 
              placeholder="Tìm kiếm theo tên, mã NV, bộ phận..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
            />
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider">
                <th className="p-4 font-medium border-b border-slate-200">Mã NV</th>
                <th className="p-4 font-medium border-b border-slate-200">Họ tên</th>
                <th className="p-4 font-medium border-b border-slate-200">Bộ phận</th>
                <th className="p-4 font-medium border-b border-slate-200">Chức vụ</th>
                <th className="p-4 font-medium border-b border-slate-200">SĐT</th>
                <th className="p-4 font-medium border-b border-slate-200">Ngày bắt đầu</th>
                <th className="p-4 font-medium border-b border-slate-200">Ngày nghỉ việc</th>
                {role === 'Admin' && <th className="p-4 font-medium border-b border-slate-200 text-right">Thao tác</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(emp => (
                <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-mono text-sm text-slate-600">{emp.code}</td>
                  <td className="p-4 font-medium text-slate-800">{emp.name}</td>
                  <td className="p-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                      {emp.department}
                    </span>
                  </td>
                  <td className="p-4 text-slate-600">{emp.role}</td>
                  <td className="p-4 text-slate-600">{emp.phone}</td>
                  <td className="p-4 text-slate-600">
                    {formatDateDisplay(emp.start_date || emp.joined_date) ? (
                      <span className="text-indigo-600 font-medium">
                        {formatDateDisplay(emp.start_date || emp.joined_date)}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">Chưa cập nhật</span>
                    )}
                  </td>
                  <td className="p-4 text-slate-600">
                    {formatDateDisplay(emp.end_date || emp.resigned_date) ? (
                      <span className="text-red-600 font-medium">
                        {formatDateDisplay(emp.end_date || emp.resigned_date)}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">Đang làm việc</span>
                    )}
                  </td>
                  {role === 'Admin' && (
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openEditForm(emp)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDeleteConfirm({ id: emp.id, name: emp.name })} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={role === 'Admin' ? 6 : 5} className="p-8 text-center text-slate-500">
                    Không tìm thấy nhân viên nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {filtered.map(emp => (
          <div key={emp.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="font-bold text-slate-800 text-lg">{emp.name}</div>
                <div className="text-sm text-slate-500 font-mono mt-0.5">{emp.code}</div>
              </div>
              {role === 'Admin' && (
                <div className="flex gap-1">
                  <button onClick={() => openEditForm(emp)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => setDeleteConfirm({ id: emp.id, name: emp.name })} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg font-medium">{emp.department}</span>
                <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg">{emp.role}</span>
                {emp.phone && <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg">{emp.phone}</span>}
                {(emp.start_date || emp.joined_date) && (
                  <span className="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg font-medium">
                    Bắt đầu: {formatDateDisplay(emp.start_date || emp.joined_date)}
                  </span>
                )}
                {(emp.end_date || emp.resigned_date) && (
                  <span className="bg-red-50 text-red-700 px-2.5 py-1 rounded-lg font-medium">
                    Nghỉ việc: {formatDateDisplay(emp.end_date || emp.resigned_date)}
                  </span>
                )}
              </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center p-8 text-slate-500 bg-white rounded-2xl border border-slate-200">
            Không tìm thấy nhân viên nào.
          </div>
        )}
      </div>

      {/* Add/Edit Employee Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-800">
                {editingId ? 'Sửa thông tin nhân viên' : 'Thêm nhân viên mới'}
              </h3>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Mã NV</label>
                <input required type="text" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="VD: NV005" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Họ tên</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Nguyễn Văn A" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Bộ phận</label>
                <select value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})} className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Chức vụ</label>
                <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Số điện thoại</label>
                <input type="text" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Ngày bắt đầu làm việc (start_date)</label>
                <input 
                  type="date" 
                  value={formData.joined_date || formData.start_date || ''} 
                  onChange={e => setFormData({...formData, joined_date: e.target.value, start_date: e.target.value})} 
                  className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" 
                />
                <p className="text-xs text-slate-500 mt-1 italic">Tự động đồng bộ vào cột start_date / joined_date trên Google Sheets.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Ngày nghỉ việc (end_date)</label>
                <input 
                  type="date" 
                  value={formData.resigned_date || formData.end_date || ''} 
                  onChange={e => setFormData({...formData, resigned_date: e.target.value, end_date: e.target.value})} 
                  className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" 
                />
                <p className="text-xs text-slate-500 mt-1 italic">Tự động đồng bộ vào cột end_date / resigned_date trên Google Sheets.</p>
              </div>
              
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                  Hủy
                </button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
                  {editingId ? 'Cập nhật' : 'Lưu nhân viên'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preserved Dates Storage Modal */}
      {showDatesModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Kho lưu trữ ngày vĩnh viễn theo Mã NV</h3>
                  <p className="text-xs text-slate-500">
                    Lưu trữ độc lập start_date & end_date theo Mã nhân viên (Code) — Không sợ bị ghi đè hay mất ngày!
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowDatesModal(false)}
                className="text-slate-400 hover:text-slate-600 p-2 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-indigo-50/60 p-4 rounded-xl border border-indigo-100 text-sm">
                <div>
                  <div className="font-semibold text-indigo-900">Khôi phục nhanh tất cả nhân viên</div>
                  <div className="text-xs text-indigo-700">
                    Nạp lại toàn bộ ngày bắt đầu và ngày nghỉ việc từ bộ nhớ vĩnh viễn (Database + File JSON + Trình duyệt).
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRestoreAllDates}
                    disabled={datesLoading}
                    className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={clsx("w-3.5 h-3.5", datesLoading && "animate-spin")} />
                    <span>Áp dụng khôi phục ngay</span>
                  </button>
                  <button
                    onClick={handleBackupDatesJson}
                    className="flex items-center gap-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 px-3 py-2 rounded-xl text-xs font-medium transition-all"
                    title="Tải file sao lưu JSON về máy tính"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Tải file dự phòng (.json)</span>
                  </button>
                </div>
              </div>

              {restoreStatus && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{restoreStatus}</span>
                </div>
              )}

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-600 font-semibold uppercase">
                    <tr>
                      <th className="p-3">Mã NV</th>
                      <th className="p-3">Tên nhân viên</th>
                      <th className="p-3">Ngày bắt đầu (start_date)</th>
                      <th className="p-3">Ngày nghỉ việc (end_date)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {savedDatesStore.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-slate-400">
                          Chưa có bản ghi lưu trữ ngày nào. Khi bạn chỉnh sửa ngày của nhân viên, hệ thống sẽ tự động khóa lưu trữ theo Mã NV ở đây!
                        </td>
                      </tr>
                    ) : (
                      savedDatesStore.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-3 font-mono font-bold text-slate-700">{item.code}</td>
                          <td className="p-3 font-medium text-slate-800">{item.name || '—'}</td>
                          <td className="p-3 text-indigo-600 font-medium">
                            {formatDateDisplay(item.start_date || item.joined_date) || <span className="text-slate-400 font-normal">Chưa có</span>}
                          </td>
                          <td className="p-3 text-red-600 font-medium">
                            {formatDateDisplay(item.end_date || item.resigned_date) || <span className="text-slate-400 font-normal">Chưa có</span>}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setShowDatesModal(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-medium text-sm transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Xác nhận xóa</h3>
              <p className="text-slate-500 text-sm">
                Bạn có chắc muốn xóa nhân viên <strong className="text-slate-800">{deleteConfirm.name}</strong>? Toàn bộ lịch làm việc của nhân viên này cũng sẽ bị xóa vĩnh viễn.
              </p>
            </div>
            <div className="p-4 bg-slate-50 flex justify-end gap-3">
              <button 
                onClick={() => setDeleteConfirm(null)} 
                className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors font-medium"
              >
                Hủy
              </button>
              <button 
                onClick={handleDelete} 
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm font-medium"
              >
                Xóa nhân viên
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
