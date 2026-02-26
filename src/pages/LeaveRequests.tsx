import React, { useState, useEffect } from 'react';
import { format, parseISO, startOfWeek, endOfWeek, addWeeks, isWithinInterval } from 'date-fns';
import { vi } from 'date-fns/locale';
import { User, socket } from '../App';
import { Check, X, Clock, CalendarMinus, Info, Trash2 } from 'lucide-react';
import clsx from 'clsx';

interface LeaveRequest {
  id: number;
  employee_id: number;
  employee_name: string;
  department: string;
  date: string;
  shift_id: number;
  shift_name: string;
  reason: string;
  status: string;
  created_at: string;
}

interface Shift {
  id: number;
  name: string;
}

export default function LeaveRequests({ user }: { user: User | null }) {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ date: '', shift_id: 0, reason: '' });

  const role = user ? user.role : 'Nhân viên';
  const isGuest = !user;

  const fetchData = async () => {
    const [reqRes, shiftRes] = await Promise.all([
      fetch('/api/leave-requests'),
      fetch('/api/shifts')
    ]);
    setRequests(await reqRes.json());
    
    const allShifts: Shift[] = await shiftRes.json();
    const offShifts = allShifts.filter(s => s.name.includes('OFF'));
    setShifts(offShifts);
    if (offShifts.length > 0 && formData.shift_id === 0) {
      setFormData(prev => ({ ...prev, shift_id: offShifts[0].id }));
    }
  };

  useEffect(() => {
    fetchData();
    socket.on('leave_requests:updated', fetchData);
    return () => {
      socket.off('leave_requests:updated', fetchData);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const selectedDate = parseISO(formData.date);
    const now = new Date();
    const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });
    const nextWeekEnd = endOfWeek(addWeeks(now, 1), { weekStartsOn: 1 });

    if (!isWithinInterval(selectedDate, { start: currentWeekStart, end: nextWeekEnd })) {
      alert('Chỉ được phép tạo đơn nghỉ cho tuần này và tuần kế tiếp.');
      return;
    }

    await fetch('/api/leave-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_id: user.id,
        date: formData.date,
        shift_id: formData.shift_id,
        reason: formData.reason
      })
    });
    
    setShowForm(false);
    setFormData({ date: '', shift_id: shifts[0]?.id || 0, reason: '' });
  };

  const handleStatusChange = async (id: number, status: string) => {
    if (!confirm(`Bạn có chắc muốn chuyển trạng thái thành "${status}"?`)) return;
    try {
      const res = await fetch(`/api/leave-requests/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        fetchData(); // Refresh data immediately
      } else {
        const err = await res.json();
        alert(err.error || 'Lỗi khi cập nhật trạng thái');
      }
    } catch (err) {
      alert('Lỗi kết nối máy chủ');
    }
  };

  const deleteLeaveRequest = async (id: number) => {
    if (!confirm('Bạn có chắc muốn xóa đơn này?')) return;
    try {
      const res = await fetch(`/api/leave-requests/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchData();
      } else {
        const err = await res.json();
        alert(err.error || 'Lỗi khi xóa đơn');
      }
    } catch (err) {
      alert('Lỗi kết nối máy chủ');
    }
  };

  const [filterMode, setFilterMode] = useState<'all' | 'me'>('all');

  const filteredRequests = requests.filter(req => {
    if (filterMode === 'me') return req.employee_id === user?.id;
    if (role === 'Admin') return true;
    return req.department === user?.department;
  });

  const overlappingRequests = formData.date ? requests.filter(req => 
    req.date === formData.date && 
    req.department === user?.department &&
    req.employee_id !== user?.id &&
    (req.status === 'Chờ duyệt' || req.status === 'Đã duyệt')
  ) : [];

  if (isGuest) {
    return <div className="p-8 text-center text-slate-500">Vui lòng đăng nhập để xem đơn xin nghỉ.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Đơn xin nghỉ (OFF)</h2>
          <p className="text-slate-500">Quản lý và đăng ký ngày nghỉ</p>
        </div>
        
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => setFilterMode('all')}
              className={clsx(
                "px-4 py-1.5 rounded-lg text-xs font-medium transition-all",
                filterMode === 'all' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              {role === 'Admin' ? 'Tất cả' : 'Bộ phận'}
            </button>
            <button 
              onClick={() => setFilterMode('me')}
              className={clsx(
                "px-4 py-1.5 rounded-lg text-xs font-medium transition-all",
                filterMode === 'me' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Đơn của tôi
            </button>
          </div>
          
          <button 
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm font-medium"
          >
            <CalendarMinus className="w-4 h-4" />
            <span>Tạo đơn xin nghỉ</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider">
                <th className="p-4 font-medium border-b border-slate-200">Ngày tạo</th>
                <th className="p-4 font-medium border-b border-slate-200">Nhân viên</th>
                <th className="p-4 font-medium border-b border-slate-200">Ngày xin nghỉ</th>
                <th className="p-4 font-medium border-b border-slate-200">Loại nghỉ</th>
                <th className="p-4 font-medium border-b border-slate-200">Lý do</th>
                <th className="p-4 font-medium border-b border-slate-200">Trạng thái</th>
                <th className="p-4 font-medium border-b border-slate-200 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRequests.map(req => {
                const isOwner = user?.id === req.employee_id;
                const canApprove = role === 'Admin' || (role === 'Tổ trưởng' && user?.department === req.department);
                const canDelete = isOwner || role === 'Admin';

                return (
                  <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 text-sm text-slate-500">
                      {format(parseISO(req.created_at), 'dd/MM/yyyy HH:mm')}
                    </td>
                    <td className="p-4">
                      <div className="font-medium text-slate-800">{req.employee_name}</div>
                      <div className="text-xs text-slate-500">{req.department}</div>
                    </td>
                    <td className="p-4 font-medium text-slate-800">
                      {format(parseISO(req.date), 'dd/MM/yyyy')}
                    </td>
                    <td className="p-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-800">
                        {req.shift_name}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-slate-600 max-w-xs truncate" title={req.reason}>
                      {req.reason}
                    </td>
                    <td className="p-4">
                      <div className={clsx(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                        req.status === 'Chờ duyệt' && "bg-blue-50 text-blue-700",
                        req.status === 'Đã duyệt' && "bg-green-50 text-green-700",
                        req.status === 'Từ chối' && "bg-red-50 text-red-700"
                      )}>
                        {req.status === 'Chờ duyệt' && <Clock className="w-3 h-3" />}
                        {req.status === 'Đã duyệt' && <Check className="w-3 h-3" />}
                        {req.status === 'Từ chối' && <X className="w-3 h-3" />}
                        {req.status}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        {canApprove && req.status === 'Chờ duyệt' && (
                          <>
                            <button 
                              onClick={() => handleStatusChange(req.id, 'Đã duyệt')}
                              className="p-1.5 bg-green-100 text-green-700 hover:bg-green-200 rounded-lg transition-colors"
                              title="Đồng ý"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleStatusChange(req.id, 'Từ chối')}
                              className="p-1.5 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg transition-colors"
                              title="Từ chối"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {canDelete && (
                          <button 
                            onClick={() => deleteLeaveRequest(req.id)}
                            className="p-1.5 bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
                            title="Xóa đơn"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredRequests.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    Chưa có đơn xin nghỉ nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Request Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-800">Tạo đơn xin nghỉ</h3>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Ngày xin nghỉ</label>
                <input 
                  required 
                  type="date" 
                  min={format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')}
                  max={format(endOfWeek(addWeeks(new Date(), 1), { weekStartsOn: 1 }), 'yyyy-MM-dd')}
                  value={formData.date} 
                  onChange={e => setFormData({...formData, date: e.target.value})} 
                  className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Loại nghỉ</label>
                <select 
                  value={formData.shift_id} 
                  onChange={e => setFormData({...formData, shift_id: Number(e.target.value)})} 
                  className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Lý do</label>
                <textarea 
                  required={shifts.find(s => s.id === formData.shift_id)?.name !== 'OFF TUẦN'}
                  rows={3}
                  value={formData.reason} 
                  onChange={e => setFormData({...formData, reason: e.target.value})} 
                  className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" 
                  placeholder={shifts.find(s => s.id === formData.shift_id)?.name === 'OFF TUẦN' ? "Nhập lý do (không bắt buộc)..." : "Nhập lý do xin nghỉ..."}
                />
              </div>

              {overlappingRequests.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-amber-800 text-xs font-bold">
                    <Info className="w-4 h-4" />
                    <span>Cảnh báo trùng lịch nghỉ trong tổ:</span>
                  </div>
                  <div className="space-y-1">
                    {overlappingRequests.map(req => (
                      <div key={req.id} className="text-[11px] text-amber-700">
                        • <strong>{req.employee_name}</strong> đã xin nghỉ {req.shift_name} ({req.status})
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium">
                  Hủy
                </button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm font-medium">
                  Gửi đơn
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
