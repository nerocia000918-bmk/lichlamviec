import React, { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { User, socket } from '../App';
import { Plus, Trash2, Edit2, CheckCircle2, Info, Users, User as UserIcon, Clock, X } from 'lucide-react';
import clsx from 'clsx';

interface Announcement {
  id: number;
  type: string;
  target_type: string;
  target_value: string;
  message: string;
  start_time: string;
  end_time: string;
  created_by: number;
  creator_name: string;
  created_at: string;
}

interface ViewStatus {
  id: number;
  name: string;
  code: string;
  department: string;
  viewed_at: string | null;
}

export default function Announcements({ user }: { user: User | null }) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showViews, setShowViews] = useState<number | null>(null);
  const [viewStatus, setViewStatus] = useState<ViewStatus[]>([]);
  
  const [formData, setFormData] = useState({
    id: null as number | null,
    type: 'Highlight 1',
    target_type: 'All',
    target_value: 'All',
    message: '',
    start_time: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    end_time: format(addDays(new Date(), 7), "yyyy-MM-dd'T'HH:mm")
  });

  const toggleTargetValue = (val: string) => {
    const currentValues = formData.target_value === 'All' ? [] : formData.target_value.split(',').filter(v => v);
    let newValues;
    if (currentValues.includes(val)) {
      newValues = currentValues.filter(v => v !== val);
    } else {
      newValues = [...currentValues, val];
    }
    setFormData({ ...formData, target_value: newValues.join(',') });
  };

  const role = user?.role || 'Guest';
  const isGuest = !user;

  const fetchData = async () => {
    const [annRes, empRes] = await Promise.all([
      fetch('/api/announcements'),
      fetch('/api/employees')
    ]);
    setAnnouncements(await annRes.json());
    setEmployees(await empRes.json());
  };

  useEffect(() => {
    fetchData();
    socket.on('announcements:updated', fetchData);
    return () => {
      socket.off('announcements:updated', fetchData);
    };
  }, []);

  const fetchViews = async (id: number) => {
    const res = await fetch(`/api/announcements/${id}/views`);
    setViewStatus(await res.json());
    setShowViews(id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const method = formData.id ? 'PUT' : 'POST';
    const url = formData.id ? `/api/announcements/${formData.id}` : '/api/announcements';

    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...formData,
        type: (role as string) === 'Admin' ? 'Highlight 1' : 'Highlight 2',
        created_by: user.id
      })
    });

    setShowForm(false);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      id: null,
      type: (role as string) === 'Admin' ? 'Highlight 1' : 'Highlight 2',
      target_type: 'All',
      target_value: 'All',
      message: '',
      start_time: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      end_time: format(addDays(new Date(), 7), "yyyy-MM-dd'T'HH:mm")
    });
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Xóa thông báo này?')) return;
    await fetch(`/api/announcements/${id}`, { method: 'DELETE' });
  };

  const handleEdit = (ann: Announcement) => {
    setFormData({
      id: ann.id,
      type: ann.type,
      target_type: ann.target_type,
      target_value: ann.target_value,
      message: ann.message,
      start_time: format(parseISO(ann.start_time), "yyyy-MM-dd'T'HH:mm"),
      end_time: format(parseISO(ann.end_time), "yyyy-MM-dd'T'HH:mm")
    });
    setShowForm(true);
  };

  if (isGuest || role === 'Nhân viên') {
    return <div className="p-8 text-center text-slate-500">Bạn không có quyền truy cập trang này.</div>;
  }

  const departments: string[] = Array.from(new Set(employees.map(e => e.department as string)));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Quản lý thông báo</h2>
          <p className="text-slate-500">Tạo và theo dõi thông báo nổi bật</p>
        </div>
        <button 
          onClick={() => { resetForm(); setShowForm(true); }}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-bold hover:bg-indigo-700 transition-all shadow-lg"
        >
          <Plus className="w-5 h-5" />
          Tạo thông báo mới
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {announcements.map(ann => {
          const canManage = (role as string) === 'Admin' || ann.created_by === user?.id;
          if (!canManage && (role as string) !== 'Admin') return null;

          return (
            <div key={ann.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-5 flex flex-col md:flex-row justify-between gap-4">
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className={clsx(
                      "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                      ann.type === 'Highlight 1' ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                    )}>
                      {ann.type}
                    </span>
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {format(parseISO(ann.created_at), 'dd/MM/yyyy HH:mm')}
                    </span>
                    <span className="text-xs font-bold text-indigo-600">
                      Bởi: {ann.creator_name}
                    </span>
                  </div>
                  
                  <div className="text-slate-800 font-medium whitespace-pre-wrap">
                    {ann.message}
                  </div>

                  <div className="flex flex-wrap gap-4 text-xs text-slate-500 pt-2">
                    <div className="flex items-center gap-1.5">
                      <Users className="w-4 h-4" />
                      Đối tượng: <span className="font-bold text-slate-700">
                        {ann.target_type === 'All' ? 'Tất cả' : 
                         ann.target_type === 'Department' ? `Tổ: ${ann.target_value}` : 
                         `Cá nhân: ${ann.target_value.split(',').map(id => employees.find(e => e.id === Number(id))?.name || id).join(', ')}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4" />
                      Hiển thị: <span className="font-bold text-slate-700">
                        {format(parseISO(ann.start_time), 'dd/MM HH:mm')} - {format(parseISO(ann.end_time), 'dd/MM HH:mm')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex md:flex-col justify-end gap-2">
                  <button 
                    onClick={() => fetchViews(ann.id)}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-100 text-slate-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 transition-all"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Xem ai đã xem
                  </button>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleEdit(ann)}
                      className="p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-all"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDelete(ann.id)}
                      className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[150] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">
                {formData.id ? 'Sửa thông báo' : 'Tạo thông báo mới'}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-2">Đối tượng nhận thông báo</label>
                <div className="flex gap-2 mb-3">
                  {['All', 'Department', 'Individual'].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFormData({...formData, target_type: t, target_value: t === 'All' ? 'All' : ''})}
                      className={clsx(
                        "flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all border",
                        formData.target_type === t 
                          ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100" 
                          : "bg-white border-slate-200 text-slate-600 hover:border-indigo-300"
                      )}
                    >
                      {t === 'All' ? 'Tất cả' : t === 'Department' ? 'Theo Tổ' : 'Cá nhân'}
                    </button>
                  ))}
                </div>

                {formData.target_type !== 'All' && (
                  <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 max-h-48 overflow-y-auto space-y-2">
                    {formData.target_type === 'Department' ? (
                      departments.map(d => (
                        <label key={d} className="flex items-center gap-3 p-2 hover:bg-white rounded-lg cursor-pointer transition-colors group">
                          <input 
                            type="checkbox"
                            checked={formData.target_value.split(',').includes(d)}
                            onChange={() => toggleTargetValue(d)}
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-600">{d}</span>
                        </label>
                      ))
                    ) : (
                      employees.filter(e => role === 'Admin' || e.department === user?.department).map(e => (
                        <label key={e.id} className="flex items-center gap-3 p-2 hover:bg-white rounded-lg cursor-pointer transition-colors group">
                          <input 
                            type="checkbox"
                            checked={formData.target_value.split(',').includes(e.id.toString())}
                            onChange={() => toggleTargetValue(e.id.toString())}
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-600">{e.name}</span>
                            <span className="text-[10px] text-slate-400 uppercase font-bold">{e.code} - {e.department}</span>
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                )}
                {formData.target_type !== 'All' && !formData.target_value && (
                  <p className="text-[10px] text-red-500 mt-1 font-bold italic">* Vui lòng chọn ít nhất một đối tượng</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-2">Nội dung thông báo</label>
                <textarea 
                  required
                  rows={4}
                  value={formData.message}
                  onChange={e => setFormData({...formData, message: e.target.value})}
                  placeholder="Nhập nội dung thông báo tại đây..."
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-2">Thời gian bắt đầu</label>
                  <input 
                    type="datetime-local"
                    required
                    value={formData.start_time}
                    onChange={e => setFormData({...formData, start_time: e.target.value})}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-2">Thời gian kết thúc</label>
                  <input 
                    type="datetime-local"
                    required
                    value={formData.end_time}
                    onChange={e => setFormData({...formData, end_time: e.target.value})}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold"
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                >
                  Hủy bỏ
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                >
                  {formData.id ? 'Cập nhật' : 'Đăng thông báo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Status Modal */}
      {showViews && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[150] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Trạng thái xác nhận</h3>
              <button onClick={() => setShowViews(null)} className="text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button>
            </div>
            
            <div className="p-6 max-h-[500px] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {viewStatus.map(v => (
                  <div key={v.id} className={clsx(
                    "p-4 rounded-2xl border flex justify-between items-center",
                    v.viewed_at ? "bg-green-50 border-green-100" : "bg-slate-50 border-slate-100 opacity-60"
                  )}>
                    <div>
                      <div className="font-bold text-slate-800 text-sm">{v.name}</div>
                      <div className="text-[10px] text-slate-500 uppercase font-black tracking-wider">{v.department}</div>
                    </div>
                    {v.viewed_at ? (
                      <div className="text-right">
                        <div className="text-green-600 font-black text-[10px] uppercase tracking-wider">Đã xem</div>
                        <div className="text-[9px] text-green-500">{format(parseISO(v.viewed_at), 'dd/MM HH:mm')}</div>
                      </div>
                    ) : (
                      <div className="text-slate-400 font-black text-[10px] uppercase tracking-wider">Chưa xem</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
