import React, { useState, useEffect } from 'react';
import { Save, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { Role } from '../App';
import clsx from 'clsx';

export default function Settings({ role, user }: { role: Role, user: any }) {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passStatus, setPassStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [passError, setPassError] = useState('');

  const [shifts, setShifts] = useState<any[]>([]);
  const [editingShift, setEditingShift] = useState<any>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        const sheetUrl = data.find((s: any) => s.key === 'GOOGLE_SHEETS_URL');
        if (sheetUrl) setUrl(sheetUrl.value);
      });
    
    fetch('/api/shifts')
      .then(res => res.json())
      .then(data => setShifts(data));
  }, []);

  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    const method = editingShift.id ? 'PUT' : 'POST';
    const url = editingShift.id ? `/api/shifts/${editingShift.id}` : '/api/shifts';
    
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingShift)
      });
      if (res.ok) {
        const updatedShifts = await fetch('/api/shifts').then(r => r.json());
        setShifts(updatedShifts);
        setEditingShift(null);
      }
    } catch (err) {
      console.error('Error saving shift:', err);
    }
  };

  const handleDeleteShift = async (id: number) => {
    if (!confirm('Bạn có chắc muốn xóa ca này?')) return;
    try {
      const res = await fetch(`/api/shifts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setShifts(shifts.filter(s => s.id !== id));
      }
    } catch (err) {
      console.error('Error deleting shift:', err);
    }
  };

  const handleSave = async () => {
    setStatus('saving');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'GOOGLE_SHEETS_URL', value: url.trim() })
      });
      
      if (res.ok) {
        setStatus('success');
        setTimeout(() => setStatus('idle'), 3000);
      } else {
        setStatus('error');
      }
    } catch (err) {
      setStatus('error');
    }
  };

  const handleSync = async () => {
    setSyncStatus('syncing');
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setSyncStatus('success');
        alert(`Đồng bộ thành công! Đã tải ${data.employees} nhân viên và ${data.schedules} lịch làm việc.`);
        setTimeout(() => setSyncStatus('idle'), 3000);
      } else {
        setSyncStatus('error');
        alert(`Lỗi đồng bộ: ${data.error || 'Không xác định'}`);
      }
    } catch (err) {
      setSyncStatus('error');
      alert('Lỗi kết nối khi đồng bộ dữ liệu.');
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword !== confirmPassword) {
      setPassError('Mật khẩu không khớp hoặc để trống!');
      return;
    }
    setPassError('');
    setPassStatus('saving');
    try {
      const res = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: user.id, new_password: newPassword })
      });
      if (res.ok) {
        setPassStatus('success');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => setPassStatus('idle'), 3000);
      } else {
        setPassStatus('error');
      }
    } catch (err) {
      setPassStatus('error');
    }
  };

  if (role !== 'Admin') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-500">Bạn không có quyền truy cập trang này.</div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Kết nối Google Sheets</h2>
            <p className="text-sm text-slate-500">
              Dán đường link Web App URL từ Google Apps Script vào đây để đồng bộ dữ liệu tự động.
            </p>
          </div>
          <button 
            onClick={handleSync}
            disabled={syncStatus === 'syncing' || !url}
            className="flex items-center gap-2 bg-slate-100 text-slate-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-200 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={clsx("w-4 h-4", syncStatus === 'syncing' && "animate-spin")} />
            {syncStatus === 'syncing' ? 'Đang tải...' : 'Tải dữ liệu từ Sheet'}
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Web App URL</label>
            <input 
              type="text" 
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-mono text-sm"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              {status === 'success' && <span className="text-green-600 flex items-center gap-1 text-sm font-medium"><CheckCircle2 className="w-4 h-4" /> Đã lưu thành công!</span>}
              {status === 'error' && <span className="text-red-600 flex items-center gap-1 text-sm font-medium"><AlertCircle className="w-4 h-4" /> Có lỗi xảy ra khi lưu.</span>}
              {syncStatus === 'success' && <span className="text-green-600 flex items-center gap-1 text-sm font-medium"><CheckCircle2 className="w-4 h-4" /> Đồng bộ dữ liệu thành công!</span>}
              {syncStatus === 'error' && <span className="text-red-600 flex items-center gap-1 text-sm font-medium"><AlertCircle className="w-4 h-4" /> Lỗi khi tải dữ liệu từ Sheet.</span>}
            </div>
            <button 
              onClick={handleSave}
              disabled={status === 'saving'}
              className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {status === 'saving' ? 'Đang lưu...' : 'Lưu cài đặt'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Quản lý Ca làm việc</h2>
            <p className="text-sm text-slate-500">Thiết lập thời gian làm việc cho từng bộ phận.</p>
          </div>
          <button 
            onClick={() => setEditingShift({ name: '', department: 'All', start_time: '08:30', end_time: '17:30', color: '#e0f2fe', text_color: '#0369a1' })}
            className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-sm font-bold hover:bg-indigo-100 transition-colors"
          >
            + Thêm ca mới
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {shifts.map(shift => (
            <div key={shift.id} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-slate-800">{shift.name}</span>
                  <span className="text-[10px] px-2 py-0.5 bg-white border border-slate-200 rounded-full text-slate-500 font-medium">
                    {shift.department === 'All' ? 'Tất cả' : shift.department}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-mono">{shift.start_time} - {shift.end_time}</p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => setEditingShift(shift)}
                  className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => handleDeleteShift(shift.id)}
                  className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                >
                  <AlertCircle className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editingShift && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <form onSubmit={handleSaveShift}>
              <div className="p-6 border-b border-slate-100">
                <h3 className="text-lg font-bold text-slate-800">{editingShift.id ? 'Sửa ca làm việc' : 'Thêm ca làm việc mới'}</h3>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Tên ca</label>
                    <input 
                      type="text" 
                      required
                      value={editingShift.name}
                      onChange={e => setEditingShift({ ...editingShift, name: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="VD: SÁNG"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Bộ phận</label>
                    <select 
                      value={editingShift.department}
                      onChange={e => setEditingShift({ ...editingShift, department: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="All">Tất cả</option>
                      <option value="Bán hàng">Bán hàng</option>
                      <option value="Quản lý">Quản lý</option>
                      <option value="Thu ngân">Thu ngân</option>
                      <option value="Kỹ thuật">Kỹ thuật</option>
                      <option value="Giao vận">Giao vận</option>
                      <option value="Kho">Kho</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Giờ vào</label>
                    <input 
                      type="time" 
                      required
                      value={editingShift.start_time}
                      onChange={e => setEditingShift({ ...editingShift, start_time: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Giờ ra</label>
                    <input 
                      type="time" 
                      required
                      value={editingShift.end_time}
                      onChange={e => setEditingShift({ ...editingShift, end_time: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Màu nền</label>
                    <input 
                      type="color" 
                      value={editingShift.color}
                      onChange={e => setEditingShift({ ...editingShift, color: e.target.value })}
                      className="w-full h-10 p-1 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Màu chữ</label>
                    <input 
                      type="color" 
                      value={editingShift.text_color}
                      onChange={e => setEditingShift({ ...editingShift, text_color: e.target.value })}
                      className="w-full h-10 p-1 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                    />
                  </div>
                </div>
              </div>
              <div className="p-6 bg-slate-50 flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setEditingShift(null)}
                  className="px-4 py-2 text-slate-600 font-medium hover:text-slate-800"
                >
                  Hủy
                </button>
                <button 
                  type="submit"
                  className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-indigo-700 transition-colors"
                >
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold text-slate-800 mb-2">Đổi mật khẩu Admin</h2>
        <p className="text-sm text-slate-500 mb-6">Thay đổi mật khẩu đăng nhập cho tài khoản Admin hiện tại.</p>
        
        <div className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Mật khẩu mới</label>
            <input 
              type="password" 
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Xác nhận mật khẩu</label>
            <input 
              type="password" 
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          
          {passError && <p className="text-red-500 text-sm">{passError}</p>}
          
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              {passStatus === 'success' && <span className="text-green-600 flex items-center gap-1 text-sm font-medium"><CheckCircle2 className="w-4 h-4" /> Đã đổi thành công!</span>}
              {passStatus === 'error' && <span className="text-red-600 flex items-center gap-1 text-sm font-medium"><AlertCircle className="w-4 h-4" /> Lỗi khi đổi mật khẩu.</span>}
            </div>
            <button 
              onClick={handleChangePassword}
              disabled={passStatus === 'saving'}
              className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              Cập nhật mật khẩu
            </button>
          </div>
        </div>
      </div>

      <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
        <h3 className="font-bold text-slate-800 mb-4">Hướng dẫn lấy link Web App URL</h3>
        <ol className="list-decimal list-inside space-y-3 text-sm text-slate-600">
          <li>Mở file Google Sheets của bạn.</li>
          <li>Tạo 6 trang tính: <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200">Nhan_Vien</code>, <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200">DanhMuc_Ca</code>, <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200">Lich_Lam_Viec</code>, <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200">Thang_Chot</code>, <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200">Thong_Bao</code>, <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200">DanhMuc_NhiemVu</code>.</li>
          <li>Vào <strong>Tiện ích mở rộng</strong> &gt; <strong>Apps Script</strong>.</li>
          <li>Copy toàn bộ code từ file <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200">AppsScript.js</code> dán vào và bấm Lưu.</li>
          <li>Bấm <strong>Triển khai (Deploy)</strong> &gt; <strong>Triển khai mới (New deployment)</strong>.</li>
          <li>Chọn loại: <strong>Ứng dụng web (Web App)</strong>.</li>
          <li>Quan trọng: Chọn Thực thi dưới tư cách <strong>Tôi (Me)</strong> và Quyền truy cập <strong>Bất kỳ ai (Anyone)</strong>.</li>
          <li>Bấm Triển khai, cấp quyền và copy đường link dán vào ô bên trên.</li>
        </ol>
      </div>
    </div>
  );
}
