import React, { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { User, socket } from '../App';
import { Plus, Trash2, Edit2, CheckCircle2, Info, Users, User as UserIcon, Clock, X, CheckSquare, ListTodo, AlertCircle } from 'lucide-react';
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

interface AssignedTask {
  id: number;
  title: string;
  description: string;
  created_by: number;
  creator_name: string;
  created_at: string;
  due_date: string | null;
  target_type: string;
  target_value: string;
  status?: string;
  viewed_at?: string;
  completed_at?: string;
}

interface ViewStatus {
  id: number;
  name: string;
  code: string;
  department: string;
  viewed_at: string | null;
  status?: string;
  completed_at?: string | null;
}

export default function AnnouncementsAndTasks({ user }: { user: User | null }) {
  const [activeTab, setActiveTab] = useState<'announcements' | 'tasks'>('tasks');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [tasks, setTasks] = useState<AssignedTask[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  
  const [showAnnForm, setShowAnnForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showViews, setShowViews] = useState<{ id: number, type: 'ann' | 'task' } | null>(null);
  const [viewStatus, setViewStatus] = useState<ViewStatus[]>([]);
  
  const [annFormData, setAnnFormData] = useState({
    id: null as number | null,
    type: 'Highlight 1',
    target_type: 'All',
    target_value: 'All',
    message: '',
    start_time: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    end_time: format(addDays(new Date(), 7), "yyyy-MM-dd'T'HH:mm")
  });

  const [taskFormData, setTaskFormData] = useState({
    id: null as number | null,
    title: '',
    description: '',
    due_date: format(new Date(), "yyyy-MM-dd"),
    target_type: 'Individual',
    target_value: '',
    employee_ids: [] as number[]
  });

  const role = user?.role || 'Guest';
  const isGuest = !user;

  const fetchData = async () => {
    const [annRes, taskRes, empRes] = await Promise.all([
      fetch(`/api/announcements${user ? `?employee_id=${user.id}&department=${user.department}` : ''}`),
      fetch(`/api/assigned-tasks?employee_id=${user?.id}&department=${user?.department}&role=${role}`),
      fetch('/api/employees')
    ]);
    setAnnouncements(await annRes.json());
    setTasks(await taskRes.json());
    setEmployees(await empRes.json());
  };

  useEffect(() => {
    fetchData();
    socket.on('announcements:updated', fetchData);
    socket.on('assigned_tasks:updated', fetchData);
    return () => {
      socket.off('announcements:updated', fetchData);
      socket.off('assigned_tasks:updated', fetchData);
    };
  }, []);

  // Mark task as seen if it's new
  useEffect(() => {
    if (activeTab === 'tasks' && user) {
      tasks.forEach(task => {
        if (task.viewed_at === null) {
          fetch(`/api/assigned-tasks/${task.id}/view`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employee_id: user.id })
          });
        }
      });
    }
  }, [activeTab, tasks, user]);

  const fetchViews = async (id: number, type: 'ann' | 'task') => {
    const url = type === 'ann' ? `/api/announcements/${id}/views` : `/api/assigned-tasks/${id}/status`;
    const res = await fetch(url);
    setViewStatus(await res.json());
    setShowViews({ id, type });
  };

  const handleAnnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const method = annFormData.id ? 'PUT' : 'POST';
    const url = annFormData.id ? `/api/announcements/${annFormData.id}` : '/api/announcements';

    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...annFormData,
        type: (role as string) === 'Admin' ? 'Highlight 1' : 'Highlight 2',
        created_by: user.id
      })
    });

    setShowAnnForm(false);
    resetAnnForm();
  };

  const handleTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const method = taskFormData.id ? 'PUT' : 'POST';
    const url = taskFormData.id ? `/api/assigned-tasks/${taskFormData.id}` : '/api/assigned-tasks';

    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...taskFormData,
        created_by: user.id
      })
    });

    setShowTaskForm(false);
    resetTaskForm();
  };

  const resetAnnForm = () => {
    setAnnFormData({
      id: null,
      type: (role as string) === 'Admin' ? 'Highlight 1' : 'Highlight 2',
      target_type: 'All',
      target_value: 'All',
      message: '',
      start_time: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      end_time: format(addDays(new Date(), 7), "yyyy-MM-dd'T'HH:mm")
    });
  };

  const resetTaskForm = () => {
    setTaskFormData({
      id: null,
      title: '',
      description: '',
      due_date: format(new Date(), "yyyy-MM-dd"),
      target_type: 'Individual',
      target_value: '',
      employee_ids: []
    });
  };

  const handleAnnDelete = async (id: number) => {
    if (!confirm('Xóa thông báo này?')) return;
    await fetch(`/api/announcements/${id}`, { method: 'DELETE' });
  };

  const handleTaskDelete = async (id: number) => {
    if (!confirm('Xóa nhiệm vụ này?')) return;
    await fetch(`/api/assigned-tasks/${id}`, { method: 'DELETE' });
  };

  const handleTaskComplete = async (taskId: number, completed: boolean) => {
    if (!user) return;
    await fetch(`/api/assigned-tasks/${taskId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: user.id, completed })
    });
  };

  const toggleTargetValue = (val: string) => {
    const currentValues = annFormData.target_value === 'All' ? [] : annFormData.target_value.split(',').filter(v => v);
    let newValues;
    if (currentValues.includes(val)) {
      newValues = currentValues.filter(v => v !== val);
    } else {
      newValues = [...currentValues, val];
    }
    setAnnFormData({ ...annFormData, target_value: newValues.join(',') });
  };

  const toggleTaskEmployee = (empId: number) => {
    const current = taskFormData.employee_ids;
    if (current.includes(empId)) {
      setTaskFormData({ ...taskFormData, employee_ids: current.filter(id => id !== empId) });
    } else {
      setTaskFormData({ ...taskFormData, employee_ids: [...current, empId] });
    }
  };

  const departments: string[] = Array.from(new Set(employees.map(e => e.department as string)));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Tabs */}
      <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-slate-200">
        <button 
          onClick={() => setActiveTab('tasks')}
          className={clsx(
            "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all",
            activeTab === 'tasks' ? "bg-indigo-600 text-white shadow-lg" : "text-slate-500 hover:bg-slate-50"
          )}
        >
          <ListTodo className="w-5 h-5" />
          Nhiệm Vụ
        </button>
        {(role === 'Admin' || role === 'Tổ trưởng') && (
          <button 
            onClick={() => setActiveTab('announcements')}
            className={clsx(
              "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all",
              activeTab === 'announcements' ? "bg-indigo-600 text-white shadow-lg" : "text-slate-500 hover:bg-slate-50"
            )}
          >
            <Info className="w-5 h-5" />
            Thông Báo
          </button>
        )}
      </div>

      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">
            {activeTab === 'tasks' ? 'Quản lý nhiệm vụ' : 'Quản lý thông báo'}
          </h2>
          <p className="text-slate-500">
            {activeTab === 'tasks' ? 'Giao và theo dõi tiến độ nhiệm vụ' : 'Tạo và theo dõi thông báo nổi bật'}
          </p>
        </div>
        {(role === 'Admin' || role === 'Tổ trưởng') && (
          <button 
            onClick={() => activeTab === 'tasks' ? setShowTaskForm(true) : setShowAnnForm(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-bold hover:bg-indigo-700 transition-all shadow-lg"
          >
            <Plus className="w-5 h-5" />
            {activeTab === 'tasks' ? 'Giao nhiệm vụ mới' : 'Tạo thông báo mới'}
          </button>
        )}
      </div>

      {activeTab === 'tasks' ? (
        <div className="grid grid-cols-1 gap-4">
          {tasks.map(task => {
            const isCreator = task.created_by === user?.id;
            const isAssigned = role === 'Nhân viên';
            
            return (
              <div key={task.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-5 flex flex-col md:flex-row justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                        Nhiệm vụ
                      </span>
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {format(parseISO(task.created_at), 'dd/MM/yyyy HH:mm')}
                      </span>
                      <span className="text-xs font-bold text-indigo-600">
                        Giao bởi: {task.creator_name}
                      </span>
                    </div>
                    
                    <h4 className="text-lg font-bold text-slate-800">{task.title}</h4>
                    <div className="text-slate-600 text-sm whitespace-pre-wrap">{task.description}</div>

                    <div className="flex flex-wrap gap-4 text-xs text-slate-500 pt-2">
                      {task.due_date && (
                        <div className="flex items-center gap-1.5 text-red-600 font-bold">
                          <Clock className="w-4 h-4" />
                          Hạn chót: {format(parseISO(task.due_date), 'dd/MM/yyyy')}
                        </div>
                      )}
                      {isCreator && (
                        <div className="flex items-center gap-1.5">
                          <Users className="w-4 h-4" />
                          Đối tượng: <span className="font-bold text-slate-700">
                            {task.target_type === 'All' ? 'Tất cả' : 
                             task.target_type === 'Department' ? `Tổ: ${task.target_value}` : 
                             'Cá nhân cụ thể'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex md:flex-col justify-end gap-2">
                    {isAssigned ? (
                      <button 
                        onClick={() => handleTaskComplete(task.id, task.status !== 'Completed')}
                        className={clsx(
                          "flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-black uppercase tracking-widest transition-all shadow-lg",
                          task.status === 'Completed' 
                            ? "bg-green-100 text-green-700 hover:bg-green-200" 
                            : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100"
                        )}
                      >
                        {task.status === 'Completed' ? (
                          <>
                            <CheckCircle2 className="w-5 h-5" />
                            Đã hoàn thành
                          </>
                        ) : (
                          <>
                            <CheckSquare className="w-5 h-5" />
                            Xác nhận hoàn thành
                          </>
                        )}
                      </button>
                    ) : (
                      <>
                        <button 
                          onClick={() => fetchViews(task.id, 'task')}
                          className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-100 text-slate-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 transition-all"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Tiến độ thực hiện
                        </button>
                        {isCreator && (
                          <div className="flex gap-2">
                            <button 
                              onClick={() => {
                                setTaskFormData({
                                  id: task.id,
                                  title: task.title,
                                  description: task.description,
                                  due_date: task.due_date || format(new Date(), "yyyy-MM-dd"),
                                  target_type: task.target_type as any,
                                  target_value: task.target_value,
                                  employee_ids: [] // We'll need to fetch these if we want to edit
                                });
                                setShowTaskForm(true);
                              }}
                              className="p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-all"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleTaskDelete(task.id)}
                              className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {announcements.map(ann => {
            const canManage = (role as string) === 'Admin' || ann.created_by === user?.id;
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
                      onClick={() => fetchViews(ann.id, 'ann')}
                      className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-100 text-slate-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 transition-all"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Xem ai đã xem
                    </button>
                    {canManage && (
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            setAnnFormData({
                              id: ann.id,
                              type: ann.type,
                              target_type: ann.target_type,
                              target_value: ann.target_value,
                              message: ann.message,
                              start_time: format(parseISO(ann.start_time), "yyyy-MM-dd'T'HH:mm"),
                              end_time: format(parseISO(ann.end_time), "yyyy-MM-dd'T'HH:mm")
                            });
                            setShowAnnForm(true);
                          }}
                          className="p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-all"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleAnnDelete(ann.id)}
                          className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Task Form Modal */}
      {showTaskForm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[150] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">
                {taskFormData.id ? 'Sửa nhiệm vụ' : 'Giao nhiệm vụ mới'}
              </h3>
              <button onClick={() => setShowTaskForm(false)} className="text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button>
            </div>
            
            <form onSubmit={handleTaskSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-2">Tiêu đề nhiệm vụ</label>
                <input 
                  required
                  type="text"
                  value={taskFormData.title}
                  onChange={e => setTaskFormData({...taskFormData, title: e.target.value})}
                  placeholder="VD: Kiểm kê kho cuối tháng..."
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-2">Nội dung chi tiết</label>
                <textarea 
                  required
                  rows={4}
                  value={taskFormData.description}
                  onChange={e => setTaskFormData({...taskFormData, description: e.target.value})}
                  placeholder="Mô tả chi tiết công việc cần thực hiện..."
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-2">Hạn chót (Ngày hiển thị trên lịch)</label>
                <input 
                  required
                  type="date"
                  value={taskFormData.due_date}
                  onChange={e => setTaskFormData({...taskFormData, due_date: e.target.value})}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-2">Đối tượng nhận nhiệm vụ</label>
                <div className="flex gap-2 mb-3">
                  {['All', 'Department', 'Individual'].map(t => {
                    if (role === 'Tổ trưởng' && t === 'All') return null;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTaskFormData({...taskFormData, target_type: t as any, target_value: t === 'All' ? 'All' : ''})}
                        className={clsx(
                          "flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all border",
                          taskFormData.target_type === t 
                            ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100" 
                            : "bg-white border-slate-200 text-slate-600 hover:border-indigo-300"
                        )}
                      >
                        {t === 'All' ? 'Tất cả' : t === 'Department' ? 'Theo Tổ' : 'Cá nhân'}
                      </button>
                    );
                  })}
                </div>

                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 max-h-48 overflow-y-auto space-y-2">
                  {taskFormData.target_type === 'Department' ? (
                    departments.filter(d => role === 'Admin' || d === user?.department).map(d => (
                      <label key={d} className="flex items-center gap-3 p-2 hover:bg-white rounded-lg cursor-pointer transition-colors group">
                        <input 
                          type="radio"
                          name="task_dept"
                          checked={taskFormData.target_value === d}
                          onChange={() => {
                            const deptEmps = employees.filter(e => e.department === d).map(e => e.id);
                            setTaskFormData({ ...taskFormData, target_value: d, employee_ids: deptEmps });
                          }}
                          className="w-4 h-4 rounded-full text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-600">{d}</span>
                      </label>
                    ))
                  ) : taskFormData.target_type === 'Individual' ? (
                    employees.filter(e => role === 'Admin' || e.department === user?.department).map(e => (
                      <label key={e.id} className="flex items-center gap-3 p-2 hover:bg-white rounded-lg cursor-pointer transition-colors group">
                        <input 
                          type="checkbox"
                          checked={taskFormData.employee_ids.includes(e.id)}
                          onChange={() => toggleTaskEmployee(e.id)}
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-600">{e.name}</span>
                          <span className="text-[10px] text-slate-400 uppercase font-bold">{e.code} - {e.department}</span>
                        </div>
                      </label>
                    ))
                  ) : (
                    <div className="text-xs text-slate-500 italic p-2">Toàn bộ nhân viên sẽ nhận nhiệm vụ này.</div>
                  )}
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setShowTaskForm(false)}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                >
                  Hủy bỏ
                </button>
                <button 
                  type="submit"
                  disabled={taskFormData.target_type !== 'All' && taskFormData.employee_ids.length === 0}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
                >
                  {taskFormData.id ? 'Cập nhật' : 'Giao nhiệm vụ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Announcement Form Modal */}
      {showAnnForm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[150] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">
                {annFormData.id ? 'Sửa thông báo' : 'Tạo thông báo mới'}
              </h3>
              <button onClick={() => setShowAnnForm(false)} className="text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button>
            </div>
            
            <form onSubmit={handleAnnSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-2">Đối tượng nhận thông báo</label>
                <div className="flex gap-2 mb-3">
                  {['All', 'Department', 'Individual'].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setAnnFormData({...annFormData, target_type: t, target_value: t === 'All' ? 'All' : ''})}
                      className={clsx(
                        "flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all border",
                        annFormData.target_type === t 
                          ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100" 
                          : "bg-white border-slate-200 text-slate-600 hover:border-indigo-300"
                      )}
                    >
                      {t === 'All' ? 'Tất cả' : t === 'Department' ? 'Theo Tổ' : 'Cá nhân'}
                    </button>
                  ))}
                </div>

                {annFormData.target_type !== 'All' && (
                  <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 max-h-48 overflow-y-auto space-y-2">
                    {annFormData.target_type === 'Department' ? (
                      departments.map(d => (
                        <label key={d} className="flex items-center gap-3 p-2 hover:bg-white rounded-lg cursor-pointer transition-colors group">
                          <input 
                            type="checkbox"
                            checked={annFormData.target_value.split(',').includes(d)}
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
                            checked={annFormData.target_value.split(',').includes(e.id.toString())}
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
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-2">Nội dung thông báo</label>
                <textarea 
                  required
                  rows={4}
                  value={annFormData.message}
                  onChange={e => setAnnFormData({...annFormData, message: e.target.value})}
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
                    value={annFormData.start_time}
                    onChange={e => setAnnFormData({...annFormData, start_time: e.target.value})}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-2">Thời gian kết thúc</label>
                  <input 
                    type="datetime-local"
                    required
                    value={annFormData.end_time}
                    onChange={e => setAnnFormData({...annFormData, end_time: e.target.value})}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold"
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setShowAnnForm(false)}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                >
                  Hủy bỏ
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                >
                  {annFormData.id ? 'Cập nhật' : 'Đăng thông báo'}
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
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">
                {showViews.type === 'ann' ? 'Trạng thái xác nhận thông báo' : 'Tiến độ thực hiện nhiệm vụ'}
              </h3>
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
                    <div className="text-right">
                      {showViews.type === 'task' ? (
                        <>
                          <div className={clsx(
                            "font-black text-[10px] uppercase tracking-wider",
                            v.status === 'Completed' ? "text-green-600" : "text-amber-600"
                          )}>
                            {v.status === 'Completed' ? 'Đã xong' : 'Đang làm'}
                          </div>
                          {v.completed_at && (
                            <div className="text-[9px] text-slate-400">{format(parseISO(v.completed_at), 'dd/MM HH:mm')}</div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className={clsx(
                            "font-black text-[10px] uppercase tracking-wider",
                            v.viewed_at ? "text-green-600" : "text-slate-400"
                          )}>
                            {v.viewed_at ? 'Đã xem' : 'Chưa xem'}
                          </div>
                          {v.viewed_at && (
                            <div className="text-[9px] text-slate-400">{format(parseISO(v.viewed_at), 'dd/MM HH:mm')}</div>
                          )}
                        </>
                      )}
                    </div>
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
