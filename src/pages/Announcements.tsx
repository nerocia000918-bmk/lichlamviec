import React, { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { User, socket } from '../App';
import { Plus, Trash2, Edit2, CheckCircle2, Info, Users, User as UserIcon, Clock, X, CheckSquare, Square, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
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
  target_type: string;
  target_value: string;
  created_at: string;
  // Local status for current user
  my_status?: 'Pending' | 'Completed';
  my_viewed_at?: string | null;
}

interface TaskMember {
  task_id: number;
  employee_id: number;
  name: string;
  code: string;
  department: string;
  viewed_at: string | null;
  completed_at: string | null;
  status: 'Pending' | 'Completed';
}

interface ViewStatus {
  id: number;
  name: string;
  code: string;
  department: string;
  viewed_at: string | null;
}

export default function Announcements({ user }: { user: User | null }) {
  const [activeTab, setActiveTab] = useState<'announcements' | 'tasks'>('announcements');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [tasks, setTasks] = useState<AssignedTask[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showViews, setShowViews] = useState<number | null>(null);
  const [showTaskMembers, setShowTaskMembers] = useState<number | null>(null);
  const [viewStatus, setViewStatus] = useState<ViewStatus[]>([]);
  const [taskMembers, setTaskMembers] = useState<TaskMember[]>([]);
  const [taskFilter, setTaskFilter] = useState('All');
  
  const [formData, setFormData] = useState({
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
    target_type: 'All',
    target_value: 'All'
  });

  const toggleTargetValue = (val: string, isTask = false) => {
    const target = isTask ? taskFormData : formData;
    const currentValues = target.target_value === 'All' ? [] : target.target_value.split(',').filter(v => v);
    let newValues;
    if (currentValues.includes(val)) {
      newValues = currentValues.filter(v => v !== val);
    } else {
      newValues = [...currentValues, val];
    }
    
    if (isTask) {
      setTaskFormData({ ...taskFormData, target_value: newValues.join(',') });
    } else {
      setFormData({ ...formData, target_value: newValues.join(',') });
    }
  };

  const role = user?.role || 'Guest';
  const isGuest = !user;

  const fetchData = async () => {
    const [annRes, taskRes, empRes] = await Promise.all([
      fetch('/api/announcements'),
      fetch('/api/assigned-tasks'),
      fetch('/api/employees')
    ]);
    
    const annData = await annRes.json();
    const taskData = await taskRes.json();
    const empData = await empRes.json();
    
    setAnnouncements(annData);
    setEmployees(empData);

    // For tasks, we need to fetch my status if not admin
    if (user) {
      const tasksWithStatus = await Promise.all(taskData.map(async (t: AssignedTask) => {
        const membersRes = await fetch(`/api/assigned-tasks/${t.id}/members`);
        const members = await membersRes.json();
        const myMember = members.find((m: any) => m.employee_id === user.id);
        return {
          ...t,
          my_status: myMember?.status,
          my_viewed_at: myMember?.viewed_at
        };
      }));
      setTasks(tasksWithStatus);
    } else {
      setTasks(taskData);
    }
  };

  useEffect(() => {
    fetchData();
    socket.on('announcements:updated', fetchData);
    socket.on('tasks:updated', fetchData);
    return () => {
      socket.off('announcements:updated', fetchData);
      socket.off('tasks:updated', fetchData);
    };
  }, [user?.id]);

  const fetchViews = async (id: number) => {
    const res = await fetch(`/api/announcements/${id}/views`);
    setViewStatus(await res.json());
    setShowViews(id);
  };

  const fetchTaskMembers = async (id: number) => {
    const res = await fetch(`/api/assigned-tasks/${id}/members`);
    setTaskMembers(await res.json());
    setShowTaskMembers(id);
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

  const resetTaskForm = () => {
    setTaskFormData({
      id: null,
      title: '',
      description: '',
      target_type: 'All',
      target_value: 'All'
    });
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Xóa thông báo này?')) return;
    await fetch(`/api/announcements/${id}`, { method: 'DELETE' });
  };

  const handleTaskDelete = async (id: number) => {
    if (!confirm('Xóa nhiệm vụ này?')) return;
    await fetch(`/api/assigned-tasks/${id}`, { method: 'DELETE' });
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

  const handleTaskEdit = (task: AssignedTask) => {
    setTaskFormData({
      id: task.id,
      title: task.title,
      description: task.description,
      target_type: task.target_type,
      target_value: task.target_value
    });
    setShowTaskForm(true);
  };

  const markTaskViewed = async (taskId: number) => {
    if (!user) return;
    await fetch(`/api/tasks/${taskId}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: user.id })
    });
  };

  const toggleTaskComplete = async (taskId: number, currentStatus: string) => {
    if (!user) return;
    const completed = currentStatus !== 'Completed';
    await fetch(`/api/tasks/${taskId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: user.id, completed })
    });
  };

  const departments: string[] = Array.from(new Set(employees.map(e => e.department as string)));

  // Filter tasks based on role and department
  const visibleTasks = tasks.filter(task => {
    if (role === 'Admin') {
      if (taskFilter !== 'All') {
        if (task.target_type === 'Department' && !task.target_value.split(',').includes(taskFilter)) return false;
        if (task.target_type === 'Individual') {
          const targetEmps = task.target_value.split(',').map(Number);
          const hasEmpInDept = targetEmps.some(id => employees.find(e => e.id === id)?.department === taskFilter);
          if (!hasEmpInDept) return false;
        }
      }
      return true;
    }
    
    // If I created it, I can see it
    if (task.created_by === user?.id) return true;
    
    // If I am a target, I can see it
    if (task.target_type === 'All') return true;
    if (task.target_type === 'Department' && task.target_value.split(',').includes(user?.department || '')) return true;
    if (task.target_type === 'Individual' && task.target_value.split(',').includes(user?.id.toString() || '')) return true;
    
    return false;
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Thông Báo và Nhiệm Vụ</h2>
          <p className="text-slate-500">Quản lý thông báo và giao việc cho nhân sự</p>
        </div>
        
        <div className="flex bg-slate-100 p-1 rounded-2xl w-full md:w-auto">
          <button 
            onClick={() => setActiveTab('announcements')}
            className={clsx(
              "flex-1 md:flex-none px-6 py-2 rounded-xl text-sm font-bold transition-all",
              activeTab === 'announcements' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Thông báo
          </button>
          <button 
            onClick={() => setActiveTab('tasks')}
            className={clsx(
              "flex-1 md:flex-none px-6 py-2 rounded-xl text-sm font-bold transition-all",
              activeTab === 'tasks' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Nhiệm vụ
          </button>
        </div>
      </div>

      <div className="flex justify-between items-center">
        {activeTab === 'tasks' && role === 'Admin' && (
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => setTaskFilter('All')}
              className={clsx(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                taskFilter === 'All' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Tất cả
            </button>
            {departments.map(d => (
              <button 
                key={d}
                onClick={() => setTaskFilter(d)}
                className={clsx(
                  "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                  taskFilter === d ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                {d}
              </button>
            ))}
          </div>
        )}
        <div className="flex-1"></div>
        {activeTab === 'announcements' ? (
          (role === 'Admin' || role === 'Tổ trưởng') && (
            <button 
              onClick={() => { resetForm(); setShowForm(true); }}
              className="bg-indigo-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-bold hover:bg-indigo-700 transition-all shadow-lg"
            >
              <Plus className="w-5 h-5" />
              Tạo thông báo mới
            </button>
          )
        ) : (
          (role === 'Admin' || role === 'Tổ trưởng') && (
            <button 
              onClick={() => { resetTaskForm(); setShowTaskForm(true); }}
              className="bg-emerald-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-bold hover:bg-emerald-700 transition-all shadow-lg"
            >
              <Plus className="w-5 h-5" />
              Giao nhiệm vụ mới
            </button>
          )
        )}
      </div>

      {activeTab === 'announcements' ? (
        <div className="grid grid-cols-1 gap-4">
          {announcements.map(ann => {
            const canManage = (role as string) === 'Admin' || ann.created_by === user?.id;
            const isTarget = ann.target_type === 'All' || 
                             (ann.target_type === 'Department' && ann.target_value.split(',').includes(user?.department || '')) ||
                             (ann.target_type === 'Individual' && ann.target_value.split(',').includes(user?.id.toString() || ''));

            if (!canManage && !isTarget) return null;

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
                    {(role === 'Admin' || ann.created_by === user?.id) && (
                      <button 
                        onClick={() => fetchViews(ann.id)}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-100 text-slate-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 transition-all"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Xem ai đã xem
                      </button>
                    )}
                    {(role === 'Admin' || ann.created_by === user?.id) && (
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
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {visibleTasks.map(task => {
            const canManage = (role as string) === 'Admin' || task.created_by === user?.id;
            const isAssignedToMe = task.target_type === 'All' || 
                                   (task.target_type === 'Department' && task.target_value.split(',').includes(user?.department || '')) ||
                                   (task.target_type === 'Individual' && task.target_value.split(',').includes(user?.id.toString() || ''));

            return (
              <div 
                key={task.id} 
                className={clsx(
                  "bg-white rounded-2xl shadow-sm border overflow-hidden transition-all",
                  task.my_status === 'Pending' ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200"
                )}
                onMouseEnter={() => isAssignedToMe && !task.my_viewed_at && markTaskViewed(task.id)}
              >
                <div className="p-5 flex flex-col md:flex-row justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700">
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
                    <div className="text-slate-600 text-sm whitespace-pre-wrap">
                      {task.description}
                    </div>

                    <div className="flex flex-wrap gap-4 text-xs text-slate-500 pt-2">
                      <div className="flex items-center gap-1.5">
                        <Users className="w-4 h-4" />
                        Đối tượng: <span className="font-bold text-slate-700">
                          {task.target_type === 'All' ? 'Tất cả' : 
                           task.target_type === 'Department' ? `Tổ: ${task.target_value}` : 
                           `Cá nhân: ${task.target_value.split(',').map(id => employees.find(e => e.id === Number(id))?.name || id).join(', ')}`}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex md:flex-col justify-end gap-2">
                    {isAssignedToMe && (
                      <button 
                        onClick={() => toggleTaskComplete(task.id, task.my_status || 'Pending')}
                        className={clsx(
                          "flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm",
                          task.my_status === 'Completed' 
                            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" 
                            : "bg-white border border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                        )}
                      >
                        {task.my_status === 'Completed' ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                        {task.my_status === 'Completed' ? 'Đã hoàn thành' : 'Xác nhận hoàn thành'}
                      </button>
                    )}
                    
                    {canManage && (
                      <button 
                        onClick={() => fetchTaskMembers(task.id)}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-100 text-slate-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 transition-all"
                      >
                        <Users className="w-4 h-4" />
                        Tiến độ thực hiện
                      </button>
                    )}

                    {canManage && (
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleTaskEdit(task)}
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
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Announcement Form Modal */}
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
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all">Hủy bỏ</button>
                <button type="submit" className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">
                  {formData.id ? 'Cập nhật' : 'Đăng thông báo'}
                </button>
              </div>
            </form>
          </div>
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
                <label className="block text-xs font-black text-slate-500 uppercase mb-2">Đối tượng nhận nhiệm vụ</label>
                <div className="flex gap-2 mb-3">
                  {['All', 'Department', 'Individual'].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTaskFormData({...taskFormData, target_type: t, target_value: t === 'All' ? 'All' : ''})}
                      className={clsx(
                        "flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all border",
                        taskFormData.target_type === t 
                          ? "bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-100" 
                          : "bg-white border-slate-200 text-slate-600 hover:border-emerald-300"
                      )}
                    >
                      {t === 'All' ? 'Tất cả' : t === 'Department' ? 'Theo Tổ' : 'Cá nhân'}
                    </button>
                  ))}
                </div>

                {taskFormData.target_type !== 'All' && (
                  <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 max-h-48 overflow-y-auto space-y-2">
                    {taskFormData.target_type === 'Department' ? (
                      departments.map(d => (
                        <label key={d} className="flex items-center gap-3 p-2 hover:bg-white rounded-lg cursor-pointer transition-colors group">
                          <input 
                            type="checkbox"
                            checked={taskFormData.target_value.split(',').includes(d)}
                            onChange={() => toggleTargetValue(d, true)}
                            className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="text-sm font-medium text-slate-700 group-hover:text-emerald-600">{d}</span>
                        </label>
                      ))
                    ) : (
                      employees.filter(e => role === 'Admin' || e.department === user?.department).map(e => (
                        <label key={e.id} className="flex items-center gap-3 p-2 hover:bg-white rounded-lg cursor-pointer transition-colors group">
                          <input 
                            type="checkbox"
                            checked={taskFormData.target_value.split(',').includes(e.id.toString())}
                            onChange={() => toggleTargetValue(e.id.toString(), true)}
                            className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                          />
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-slate-700 group-hover:text-emerald-600">{e.name}</span>
                            <span className="text-[10px] text-slate-400 uppercase font-bold">{e.code} - {e.department}</span>
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-2">Tiêu đề nhiệm vụ</label>
                <input 
                  required
                  type="text"
                  value={taskFormData.title}
                  onChange={e => setTaskFormData({...taskFormData, title: e.target.value})}
                  placeholder="Ví dụ: Kiểm kê hàng hóa cuối tháng"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-2">Mô tả chi tiết</label>
                <textarea 
                  required
                  rows={4}
                  value={taskFormData.description}
                  onChange={e => setTaskFormData({...taskFormData, description: e.target.value})}
                  placeholder="Nhập mô tả các bước cần thực hiện..."
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowTaskForm(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all">Hủy bỏ</button>
                <button type="submit" className="flex-1 py-3 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200">
                  {taskFormData.id ? 'Cập nhật' : 'Giao nhiệm vụ'}
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

      {/* Task Members Modal */}
      {showTaskMembers && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[150] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden animate-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Tiến độ thực hiện nhiệm vụ</h3>
              <button onClick={() => setShowTaskMembers(null)} className="text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button>
            </div>
            
            <div className="p-6 max-h-[500px] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {taskMembers.map(m => (
                  <div key={m.employee_id} className={clsx(
                    "p-4 rounded-2xl border flex flex-col gap-3",
                    m.status === 'Completed' ? "bg-emerald-50 border-emerald-100" : "bg-slate-50 border-slate-100"
                  )}>
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-slate-800 text-sm">{m.name}</div>
                        <div className="text-[10px] text-slate-500 uppercase font-black tracking-wider">{m.code} - {m.department}</div>
                      </div>
                      <div className={clsx(
                        "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider",
                        m.status === 'Completed' ? "bg-emerald-200 text-emerald-800" : "bg-amber-100 text-amber-800"
                      )}>
                        {m.status === 'Completed' ? 'Hoàn thành' : 'Chưa xong'}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/50">
                      <div className="text-[9px]">
                        <div className="text-slate-400 font-bold uppercase">Đã xem lúc:</div>
                        <div className="text-slate-600 font-medium">{m.viewed_at ? format(parseISO(m.viewed_at), 'dd/MM HH:mm') : '---'}</div>
                      </div>
                      <div className="text-[9px]">
                        <div className="text-slate-400 font-bold uppercase">Hoàn thành lúc:</div>
                        <div className="text-slate-600 font-medium">{m.completed_at ? format(parseISO(m.completed_at), 'dd/MM HH:mm') : '---'}</div>
                      </div>
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
