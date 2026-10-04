import React, { useState, useEffect } from 'react';
import { Save, AlertCircle, CheckCircle2, RefreshCw, Bell, BellOff, Lock, UploadCloud, Copy, Check, FileCode, ChevronDown, ChevronUp } from 'lucide-react';
import { Role } from '../types';
import { APPS_SCRIPT_CODE } from '../appsScriptCode';
import clsx from 'clsx';

export default function Settings({ 
  role, 
  user, 
  notificationsEnabled, 
  setNotificationsEnabled 
}: { 
  role: Role, 
  user: any,
  notificationsEnabled: boolean,
  setNotificationsEnabled: (val: boolean) => void
}) {
  const [url, setUrl] = useState('');
  const [tlLockHours, setTlLockHours] = useState('24');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [syncUpStatus, setSyncUpStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [copiedCode, setCopiedCode] = useState(false);
  const [showCodePreview, setShowCodePreview] = useState(false);
  
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passStatus, setPassStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [passError, setPassError] = useState('');

  const [shifts, setShifts] = useState<any[]>([]);
  const [editingShift, setEditingShift] = useState<any>(null);

  useEffect(() => {
    if (role === 'Admin') {
      fetch('/api/settings')
        .then(res => res.json())
        .then(data => {
          const sheetUrl = data.find((s: any) => s.key === 'GOOGLE_SHEETS_URL');
          if (sheetUrl) setUrl(sheetUrl.value);
          const tlLock = data.find((s: any) => s.key === 'TL_EDIT_LOCK_HOURS');
          if (tlLock) setTlLockHours(tlLock.value);
        });
      
      fetch('/api/shifts')
        .then(res => res.json())
        .then(data => setShifts(data));
    }
  }, [role]);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT_CODE);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 3000);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  };

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
      await Promise.all([
        fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'GOOGLE_SHEETS_URL', value: url.trim() })
        }),
        fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'TL_EDIT_LOCK_HOURS', value: tlLockHours.toString() })
        })
      ]);
      
      setStatus('success');
      setTimeout(() => setStatus('idle'), 3000);
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
        alert(`Lỗi đồng bộ: ${data.error || 'Không xác định'}${data.details ? '\n\nChi tiết phản hồi: ' + data.details : ''}`);
      }
    } catch (err: any) {
      setSyncStatus('error');
      alert('Lỗi kết nối khi đồng bộ dữ liệu: ' + err.message);
    }
  };

  const handleSyncToSheets = async () => {
    setSyncUpStatus('syncing');
    try {
      const res = await fetch('/api/sync-to-sheets', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setSyncUpStatus('success');
        alert('Đồng bộ lên Google Sheets thành công! Toàn bộ danh sách nhân viên và cột ngày bắt đầu (start_date), ngày nghỉ việc (end_date) đã được cập nhật vào Sheet.');
        setTimeout(() => setSyncUpStatus('idle'), 3000);
      } else {
        setSyncUpStatus('error');
        alert(`Lỗi khi đẩy dữ liệu lên Sheet: ${data.error || 'Vui lòng kiểm tra lại Web App URL hoặc quyền truy cập'}${data.details ? '\n\nChi tiết: ' + data.details : ''}`);
      }
    } catch (err: any) {
      setSyncUpStatus('error');
      alert('Lỗi kết nối khi đồng bộ lên Sheet: ' + err.message);
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

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Personal Settings - Visible to Everyone */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center">
            <Bell className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Cài đặt thông báo</h2>
            <p className="text-sm text-slate-500">Tùy chỉnh cách bạn nhận thông báo về nhiệm vụ và tin nhắn.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <div className="flex items-center gap-3">
              <div className={clsx(
                "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                notificationsEnabled ? "bg-green-100 text-green-600" : "bg-slate-200 text-slate-500"
              )}>
                {notificationsEnabled ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
              </div>
              <div>
                <div className="font-bold text-slate-800">Thông báo trình duyệt</div>
                <div className="text-xs text-slate-500">Nhận thông báo đẩy khi có nhiệm vụ mới.</div>
              </div>
            </div>
            <button 
              onClick={() => setNotificationsEnabled(!notificationsEnabled)}
              className={clsx(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                notificationsEnabled ? "bg-indigo-600" : "bg-slate-300"
              )}
            >
              <span
                className={clsx(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                  notificationsEnabled ? "translate-x-6" : "translate-x-1"
                )}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Password Change - Visible to Everyone */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Đổi mật khẩu</h2>
            <p className="text-sm text-slate-500">Cập nhật mật khẩu để bảo vệ tài khoản của bạn.</p>
          </div>
        </div>
        
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

      {/* Admin Only Settings */}
      {role === 'Admin' && (
        <>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-800 mb-1">Kết nối Google Sheets</h2>
                <p className="text-sm text-slate-500">
                  Tự động đồng bộ 2 chiều dữ liệu nhân viên, lịch làm việc và bảo vệ các cột start_date, end_date.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <button 
                  onClick={handleSync}
                  disabled={syncStatus === 'syncing' || !url}
                  className="flex items-center justify-center gap-2 bg-slate-100 text-slate-700 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-200 transition-colors disabled:opacity-50 flex-1 sm:flex-initial"
                  title="Tải toàn bộ dữ liệu từ Google Sheet về ứng dụng"
                >
                  <RefreshCw className={clsx("w-4 h-4", syncStatus === 'syncing' && "animate-spin")} />
                  {syncStatus === 'syncing' ? 'Đang tải...' : 'Tải từ Sheet'}
                </button>
                <button 
                  onClick={handleSyncToSheets}
                  disabled={syncUpStatus === 'syncing' || !url}
                  className="flex items-center justify-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 shadow-sm flex-1 sm:flex-initial"
                  title="Đẩy dữ liệu và ngày làm việc mới nhất từ ứng dụng lên Google Sheet"
                >
                  <UploadCloud className={clsx("w-4 h-4", syncUpStatus === 'syncing' && "animate-pulse")} />
                  {syncUpStatus === 'syncing' ? 'Đang đồng bộ...' : 'Đồng bộ lên Sheet'}
                </button>
              </div>
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

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {status === 'success' && <span className="text-green-600 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Đã lưu thành công!</span>}
                  {status === 'error' && <span className="text-red-600 flex items-center gap-1"><AlertCircle className="w-4 h-4" /> Có lỗi xảy ra khi lưu.</span>}
                  {syncStatus === 'success' && <span className="text-green-600 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Đã tải dữ liệu từ Sheet!</span>}
                  {syncStatus === 'error' && <span className="text-red-600 flex items-center gap-1"><AlertCircle className="w-4 h-4" /> Lỗi khi tải từ Sheet.</span>}
                  {syncUpStatus === 'success' && <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Đã đồng bộ lên Sheet thành công!</span>}
                  {syncUpStatus === 'error' && <span className="text-red-600 flex items-center gap-1"><AlertCircle className="w-4 h-4" /> Lỗi khi đẩy lên Sheet.</span>}
                </div>
                <button 
                  onClick={handleSave}
                  disabled={status === 'saving'}
                  className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50 ml-auto"
                >
                  <Save className="w-4 h-4" />
                  {status === 'saving' ? 'Đang lưu...' : 'Lưu cài đặt'}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800">Quyền hạn Tổ trưởng</h2>
                <p className="text-sm text-slate-500">Tùy chỉnh thời gian khóa sửa lịch đối với cấp Tổ trưởng.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Thời gian khóa sửa lịch (giờ)</label>
                <div className="flex items-center gap-4">
                  <input 
                    type="number" 
                    value={tlLockHours}
                    onChange={(e) => setTlLockHours(e.target.value)}
                    min="0"
                    max="168"
                    className="w-32 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                  <p className="text-sm text-slate-500 italic">
                    {tlLockHours === '0' 
                      ? "Tổ trưởng có thể sửa lịch bất cứ lúc nào (trừ tháng đã khóa)." 
                      : `Tổ trưởng không thể sửa lịch cho các ca bắt đầu trong vòng ${tlLockHours} giờ tới.`}
                  </p>
                </div>
                <p className="mt-2 text-xs text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-100">
                  Lưu ý: Admin luôn có quyền sửa lịch bất kể thời gian, trừ khi tháng đó đã bị khóa hoàn toàn.
                </p>
              </div>

              <div className="flex items-center justify-end pt-2">
                <button 
                  onClick={handleSave}
                  disabled={status === 'saving'}
                  className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {status === 'saving' ? 'Đang lưu...' : 'Lưu quyền hạn'}
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

          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-800 text-lg">Mã Google Apps Script (Bản bảo vệ start_date & end_date)</h3>
                  <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-bold">Chống mất cột & Chống xóa trắng</span>
                </div>
                <p className="text-sm text-slate-600 mt-1">
                  Đã khắc phục hoàn toàn lỗi mất cột khi sang ngày mới: Hệ thống tuyệt đối <b>không xóa cột</b> và <b>không xóa trắng</b> dữ liệu ngày đã có trong Sheet.
                </p>
              </div>
              <button 
                onClick={handleCopyCode}
                className={clsx(
                  "flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm shrink-0",
                  copiedCode ? "bg-green-600 text-white" : "bg-indigo-600 hover:bg-indigo-700 text-white"
                )}
              >
                {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copiedCode ? 'Đã sao chép mã!' : 'Sao chép mã Apps Script'}
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-amber-900 text-sm space-y-2">
              <div className="font-bold flex items-center gap-2 text-amber-800">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                Lưu ý cực kỳ quan trọng để cập nhật thành công:
              </div>
              <p>
                Để các thay đổi ngày <b>start_date</b> và <b>end_date</b> bạn chỉnh sửa trên app được cập nhật vào Sheet mà không bị xóa mất cột:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-xs text-amber-950 ml-1">
                <li>Bấm nút <b>"Sao chép mã Apps Script"</b> ở trên.</li>
                <li>Mở file Google Sheet của bạn &gt; Vào menu <b>Tiện ích mở rộng</b> &gt; <b>Apps Script</b>.</li>
                <li>Xóa toàn bộ mã cũ và <b>Dán (Paste)</b> mã vừa sao chép vào. Bấm <b>Lưu (Ctrl + S)</b>.</li>
                <li>Bấm <b>Triển khai (Deploy)</b> &gt; <b>Quản lý công tác triển khai (Manage deployments)</b> &gt; Bấm biểu tượng <b>Cây bút (Chỉnh sửa)</b>.</li>
                <li>Tại mục Phiên bản chọn <b>"Phiên bản mới" (New version)</b> &gt; Bấm <b>Triển khai</b>.</li>
                <li>Quay lại ứng dụng này, bấm nút <b>"Đồng bộ lên Sheet"</b> màu xanh lá ở trên để cập nhật dữ liệu ngay lập tức.</li>
              </ol>
            </div>

            <div>
              <button 
                onClick={() => setShowCodePreview(!showCodePreview)}
                className="flex items-center gap-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
              >
                <FileCode className="w-4 h-4" />
                {showCodePreview ? 'Ẩn xem trước mã nguồn Apps Script' : 'Xem trước mã nguồn Apps Script'}
                {showCodePreview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showCodePreview && (
                <div className="mt-3 relative">
                  <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-xs font-mono max-h-72 overflow-y-auto leading-relaxed border border-slate-800">
                    {APPS_SCRIPT_CODE}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </>
      )}

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
    </div>
  );
}
