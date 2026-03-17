import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Calendar as CalendarIcon, 
  User as UserIcon, 
  Users, 
  CheckCircle2, 
  Circle, 
  Clock, 
  Trash2, 
  Edit2, 
  X, 
  Check,
  ChevronRight,
  Filter,
  AlertCircle
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { socket } from '../socket';
import clsx from 'clsx';

interface User {
  id: number;
  code: string;
  name: string;
  department: string;
  role: string;
}

interface Employee {
  id: number;
  name: string;
  department: string;
  role: string;
}

interface AssignedTask {
  id: number;
  title: string;
  description: string;
  target_type: 'All' | 'Department' | 'Individual';
  target_value: string;
  created_by: number;
  created_at: string;
  creator_name: string;
  my_status?: 'Pending' | 'Completed';
  my_viewed_at?: string;
  completion_count?: number;
  total_count?: number;
}

interface TaskMember {
  employee_id: number;
  employee_name: string;
  department: string;
  viewed_at: string | null;
  status: 'Pending' | 'Completed';
  completed_at: string | null;
}

export default function Tasks({ user }: { user: User | null }) {
  const [tasks, setTasks] = useState<AssignedTask[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showMembers, setShowMembers] = useState<number | null>(null);
  const [taskMembers, setTaskMembers] = useState<TaskMember[]>([]);
  const [taskFilter, setTaskFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const [formData, setFormData] = useState({
    id: null as number | null,
    title: '',
    description: '',
    target_type: 'All' as 'All' | 'Department' | 'Individual',
    target_value: ''
  });

  const role = user?.role || 'Guest';
  const departments = Array.isArray(employees) ? Array.from(new Set(employees.map(e => e.department))).filter(Boolean) : [];

  const safeFormat = (dateStr: string | null | undefined, formatStr: string) => {
    if (!dateStr) return 'N/A';
    try {
      const date = parseISO(dateStr);
      if (isNaN(date.getTime())) return 'N/A';
      return format(date, formatStr);
    } catch (e) {
      return 'N/A';
    }
  };

  const fetchData = async () => {
    try {
      const [taskRes, empRes] = await Promise.all([
        fetch('/api/assigned-tasks'),
        fetch('/api/employees')
      ]);
      
      if (!taskRes.ok || !empRes.ok) return;

      const taskData = await taskRes.json();
      const empData = await empRes.json();
      
      if (Array.isArray(empData)) setEmployees(empData);

      if (user && Array.isArray(taskData)) {
        const tasksWithStatus = await Promise.all(taskData.map(async (t: AssignedTask) => {
          try {
            const membersRes = await fetch(`/api/assigned-tasks/${t.id}/members`);
            if (!membersRes.ok) return { ...t, my_status: 'Pending' as const };
            const members = await membersRes.json();
            if (!Array.isArray(members)) return { ...t, my_status: 'Pending' as const };
            
            const myMember = members.find((m: any) => m.employee_id === user.id);
            const completedCount = members.filter((m: any) => m.status === 'Completed').length;
            return {
              ...t,
              my_status: myMember?.status,
              my_viewed_at: myMember?.viewed_at,
              completion_count: completedCount,
              total_count: members.length
            };
          } catch (err) {
            return { ...t, my_status: 'Pending' as const };
          }
        }));
        setTasks(tasksWithStatus);
      } else if (Array.isArray(taskData)) {
        setTasks(taskData);
      }
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
    }
  };

  useEffect(() => {
    fetchData();
    socket.on('tasks:updated', fetchData);
    return () => {
      socket.off('tasks:updated', fetchData);
    };
  }, [user?.id]);

  const fetchTaskMembers = async (id: number) => {
    const res = await fetch(`/api/assigned-tasks/${id}/members`);
    setTaskMembers(await res.json());
    setShowMembers(id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const method = formData.id ? 'PUT' : 'POST';
    const url = formData.id ? `/api/assigned-tasks/${formData.id}` : '/api/assigned-tasks';

    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...formData,
        created_by: user.id
      })
    });

    setShowForm(false);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      id: null,
      title: '',
      description: '',
      target_type: 'All',
      target_value: ''
    });
  };

  const deleteTask = async (id: number) => {
    if (!confirm('Xóa nhiệm vụ này?')) return;
    await fetch(`/api/assigned-tasks/${id}`, { method: 'DELETE' });
  };

  const markAsViewed = async (taskId: number) => {
    if (!user) return;
    await fetch(`/api/tasks/${taskId}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: user.id })
    });
  };

  const toggleTaskCompletion = async (taskId: number, currentStatus: boolean) => {
    if (!user) return;
    await fetch(`/api/tasks/${taskId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        employee_id: user.id,
        completed: !currentStatus
      })
    });
  };

  const visibleTasks = tasks.filter(task => {
    // Search filter
    if (searchQuery && !task.title.toLowerCase().includes(searchQuery.toLowerCase()) && !task.description.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }

    if (role === 'Admin') {
      if (taskFilter !== 'All') {
        const targetValues = (task.target_value || '').split(',').filter(v => v);
        if (task.target_type === 'Department' && !targetValues.includes(taskFilter)) return false;
        if (task.target_type === 'Individual') {
          const targetEmps = targetValues.map(Number);
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
    const targetValues = (task.target_value || '').split(',').filter(v => v);
    if (task.target_type === 'Department' && targetValues.includes(user?.department || '')) return true;
    if (task.target_type === 'Individual' && targetValues.includes(user?.id?.toString() || '')) return true;
    
    return false;
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Nhiệm Vụ Được Giao</h2>
          <p className="text-slate-500 text-sm">Giao việc cụ thể và theo dõi tiến độ (Khác với công việc trực ca hàng ngày)</p>
        </div>
        
        {(role === 'Admin' || role === 'Tổ trưởng') && (
          <button 
            onClick={() => { resetForm(); setShowForm(true); }}
            className="bg-emerald-600 text-white px-6 py-3 rounded-2xl flex items-center gap-2 font-bold hover:bg-emerald-700 transition-all shadow-lg active:scale-95"
          >
            <Plus className="w-5 h-5" />
            Giao nhiệm vụ mới
          </button>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input 
            type="text"
            placeholder="Tìm kiếm nhiệm vụ..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>

        {role === 'Admin' && (
          <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 w-full md:w-auto">
            <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <button 
              onClick={() => setTaskFilter('All')}
              className={clsx(
                "px-4 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all",
                taskFilter === 'All' ? "bg-indigo-600 text-white shadow-md" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              )}
            >
              Tất cả
            </button>
            {departments.map(d => (
              <button 
                key={d}
                onClick={() => setTaskFilter(d)}
                className={clsx(
                  "px-4 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all",
                  taskFilter === d ? "bg-indigo-600 text-white shadow-md" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                )}
              >
                {d}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6">
        {visibleTasks.map(task => {
          const canManage = role === 'Admin' || task.created_by === user?.id;
          const targetValues = (task.target_value || '').split(',').filter(v => v);
          const isTarget = task.target_type === 'All' || 
                          (task.target_type === 'Department' && targetValues.includes(user?.department || '')) ||
                          (task.target_type === 'Individual' && targetValues.includes(user?.id?.toString() || ''));
          
          return (
            <div 
              key={task.id} 
              className={clsx(
                "bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden transition-all hover:shadow-md",
                isTarget && !task.my_viewed_at && "border-l-4 border-l-emerald-500"
              )}
              onClick={() => isTarget && !task.my_viewed_at && markAsViewed(task.id)}
            >
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-bold text-slate-800">{task.title}</h3>
                      {isTarget && !task.my_viewed_at && (
                        <span className="bg-emerald-100 text-emerald-600 text-[10px] px-2 py-0.5 rounded-full font-bold animate-pulse">
                          MỚI
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
                      <div className="flex items-center gap-1">
                        <User className="w-4 h-4" />
                        <span>Người giao: {task.creator_name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span>{safeFormat(task.created_at, 'HH:mm dd/MM/yyyy')}</span>
                      </div>
                      <div className="flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-lg text-xs font-bold">
                        <Users className="w-3 h-3" />
                        <span>Đối tượng: {task.target_type === 'All' ? 'Tất cả' : task.target_type === 'Department' ? `Tổ ${task.target_value}` : 'Cá nhân'}</span>
                      </div>
                    </div>
                  </div>
                  
                  {canManage && (
                    <div className="flex gap-2">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setFormData({
                            id: task.id,
                            title: task.title,
                            description: task.description,
                            target_type: task.target_type,
                            target_value: task.target_value
                          });
                          setShowForm(true);
                        }}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteTask(task.id);
                        }}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="bg-slate-50 p-4 rounded-xl mb-6 text-slate-700 whitespace-pre-wrap leading-relaxed border border-slate-100">
                  {task.description}
                </div>

                {canManage && (
                  <div className="mb-6 space-y-2">
                    <div className="flex justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
                      <span>Tiến độ hoàn thành</span>
                      <span>{task.total_count ? Math.round(((task.completion_count || 0) / task.total_count) * 100) : 0}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${task.total_count ? ((task.completion_count || 0) / task.total_count) * 100 : 0}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {isTarget && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleTaskCompletion(task.id, task.my_status === 'Completed');
                        }}
                        className={clsx(
                          "px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-sm",
                          task.my_status === 'Completed' 
                            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" 
                            : "bg-indigo-600 text-white hover:bg-indigo-700"
                        )}
                      >
                        {task.my_status === 'Completed' ? (
                          <>
                            <CheckCircle2 className="w-4 h-4" />
                            Đã hoàn thành
                          </>
                        ) : (
                          <>
                            <Circle className="w-4 h-4" />
                            Xác nhận hoàn thành
                          </>
                        )}
                      </button>
                    )}

                    {canManage && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          fetchTaskMembers(task.id);
                        }}
                        className="px-6 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-200 transition-all flex items-center gap-2"
                      >
                        <Users className="w-4 h-4" />
                        Xem tiến độ
                      </button>
                    )}
                  </div>

                  {isTarget && task.my_status === 'Completed' && (
                    <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
                      <Check className="w-4 h-4" />
                      <span className="text-xs font-bold">Bạn đã hoàn thành nhiệm vụ này</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {visibleTasks.length === 0 && (
          <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200">
            <div className="bg-slate-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-10 h-10 text-slate-300" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Không tìm thấy nhiệm vụ</h3>
            <p className="text-slate-500">Hãy thử thay đổi bộ lọc hoặc tìm kiếm khác</p>
          </div>
        )}
      </div>

      {/* Task Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-xl font-bold text-slate-800">
                {formData.id ? 'Chỉnh sửa nhiệm vụ' : 'Giao nhiệm vụ mới'}
              </h3>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-6 h-6 text-slate-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Tiêu đề</label>
                <input 
                  required 
                  type="text" 
                  value={formData.title} 
                  onChange={e => setFormData({...formData, title: e.target.value})} 
                  className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                  placeholder="Nhập tiêu đề nhiệm vụ..."
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Mô tả chi tiết</label>
                <textarea 
                  required 
                  rows={4}
                  value={formData.description} 
                  onChange={e => setFormData({...formData, description: e.target.value})} 
                  className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                  placeholder="Nhập nội dung công việc cần thực hiện..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Đối tượng</label>
                  <select 
                    value={formData.target_type} 
                    onChange={e => setFormData({...formData, target_type: e.target.value as any, target_value: ''})} 
                    className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  >
                    <option value="All">Tất cả</option>
                    <option value="Department">Theo tổ</option>
                    <option value="Individual">Cá nhân</option>
                  </select>
                </div>
                {formData.target_type !== 'All' && (
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">
                      {formData.target_type === 'Department' ? 'Chọn tổ' : 'Chọn nhân viên'}
                    </label>
                    {formData.target_type === 'Department' ? (
                      <select 
                        required
                        value={formData.target_value}
                        onChange={e => setFormData({...formData, target_value: e.target.value})}
                        className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        <option value="">-- Chọn tổ --</option>
                        {departments.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    ) : (
                      <select 
                        required
                        value={formData.target_value}
                        onChange={e => setFormData({...formData, target_value: e.target.value})}
                        className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        <option value="">-- Chọn nhân viên --</option>
                        {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name} ({emp.department})</option>)}
                      </select>
                    )}
                  </div>
                )}
              </div>
              <div className="pt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl transition-all font-bold">
                  Hủy
                </button>
                <button type="submit" className="px-8 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-lg font-bold active:scale-95">
                  {formData.id ? 'Cập nhật' : 'Giao việc'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task Progress Modal */}
      {showMembers && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Tiến độ nhiệm vụ</h3>
                <p className="text-xs text-slate-500">Theo dõi chi tiết từng nhân sự</p>
              </div>
              <button onClick={() => setShowMembers(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-6 h-6 text-slate-500" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <div className="space-y-3">
                {taskMembers.map(member => (
                  <div key={member.employee_id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-white hover:shadow-sm transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 font-bold shadow-sm">
                        {member.employee_name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-slate-800">{member.employee_name}</p>
                        <p className="text-xs text-slate-500">{member.department}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className={clsx(
                          "text-xs font-bold px-2 py-1 rounded-lg inline-block",
                          member.viewed_at ? "bg-emerald-50 text-emerald-600" : "bg-slate-200 text-slate-500"
                        )}>
                          {member.viewed_at ? 'Đã xem' : 'Chưa xem'}
                        </p>
                        {member.viewed_at && (
                          <p className="text-[10px] text-slate-400 mt-1">
                            {safeFormat(member.viewed_at, 'HH:mm dd/MM')}
                          </p>
                        )}
                      </div>
                      <div className="text-right min-w-[100px]">
                        <p className={clsx(
                          "text-xs font-bold px-2 py-1 rounded-lg inline-block",
                          member.status === 'Completed' ? "bg-emerald-500 text-white shadow-sm" : "bg-amber-50 text-amber-600"
                        )}>
                          {member.status === 'Completed' ? 'Hoàn thành' : 'Đang làm'}
                        </p>
                        {member.completed_at && (
                          <p className="text-[10px] text-slate-400 mt-1">
                            {safeFormat(member.completed_at, 'HH:mm dd/MM')}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {taskMembers.length === 0 && (
                  <div className="text-center py-10 text-slate-400 italic">
                    Chưa có nhân sự nào được gán nhiệm vụ này.
                  </div>
                )}
              </div>
            </div>
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
              <div className="flex gap-4">
                <div className="text-center">
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Đã xem</p>
                  <p className="text-lg font-bold text-slate-800">
                    {taskMembers.filter(m => m.viewed_at).length}/{taskMembers.length}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Hoàn thành</p>
                  <p className="text-lg font-bold text-emerald-600">
                    {taskMembers.filter(m => m.status === 'Completed').length}/{taskMembers.length}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowMembers(null)}
                className="px-6 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-100 transition-all"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
