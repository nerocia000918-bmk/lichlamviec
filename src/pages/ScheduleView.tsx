import { toPng } from 'html-to-image';
import { useState, useEffect, useMemo, useRef } from 'react';
import React from 'react';
import { format, addDays, startOfWeek, subWeeks, isBefore, addHours, parseISO, isSameDay } from 'date-fns';
import { vi } from 'date-fns/locale';
import { User, socket } from '../App';
import { ChevronLeft, ChevronRight, Copy, Lock, Search, Filter, Calendar as CalendarIcon, Camera, Info, Wand2, X, Trash2 } from 'lucide-react';
import clsx from 'clsx';

interface Employee {
  id: number;
  code: string;
  name: string;
  department: string;
  role: string;
}

interface Shift {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  color: string;
  text_color: string;
}

interface Task {
  id: number;
  department: string;
  name: string;
  color: string;
  text_color: string;
}

interface Schedule {
  id: number;
  date: string;
  employee_id: number;
  shift_id: number;
  task: string;
  status: string;
  shift_name: string;
  start_time: string;
  end_time: string;
  color: string;
  text_color: string;
  note?: string;
}

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
  viewed_at?: string;
}

export default function ScheduleView({ user }: { user: User | null }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [lockedMonths, setLockedMonths] = useState<string[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [activeAnnouncements, setActiveAnnouncements] = useState<Announcement[]>([]);
  const [currentAnnIndex, setCurrentAnnIndex] = useState(0);
  
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('All');
  const [viewMode, setViewMode] = useState<'all' | 'dept' | 'me'>('me');
  
  const [selectedCell, setSelectedCell] = useState<{ date: string, empId: number } | null>(null);
  const [editData, setEditData] = useState({ shift_id: 0, task: 'Không', note: '' });
  
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [newTask, setNewTask] = useState({ name: '', color: '#4c1d95', text_color: '#ffffff' });

  const scheduleRef = useRef<HTMLDivElement>(null);

  const role = user ? user.role : 'Nhân viên';
  const isGuest = !user;

  useEffect(() => {
    if (user) {
      setViewMode('me');
    } else {
      setViewMode('all');
    }
  }, [user]);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday
  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
  const currentMonthStr = format(weekStart, 'yyyy-MM');
  const isMonthLocked = lockedMonths.includes(currentMonthStr);

  const fetchData = async () => {
    const [empRes, shiftRes, schedRes, lockRes, annRes, taskRes] = await Promise.all([
      fetch('/api/employees'),
      fetch('/api/shifts'),
      fetch(`/api/schedules?start=${format(weekDays[0], 'yyyy-MM-dd')}&end=${format(weekDays[6], 'yyyy-MM-dd')}`),
      fetch('/api/locked-months'),
      fetch(`/api/announcements${user ? `?employee_id=${user.id}&department=${user.department}` : ''}`),
      fetch('/api/tasks')
    ]);
    
    const empData = await empRes.json();
    const shiftData = await shiftRes.json();
    const schedData = await schedRes.json();
    const lockData = await lockRes.json();
    const annData = await annRes.json();
    const taskData = await taskRes.json();

    setEmployees(empData);
    setShifts(shiftData);
    setSchedules(schedData);
    setLockedMonths(lockData);
    setAnnouncements(annData);
    setTasks(taskData);

    if (user) {
      const active = annData.filter((a: Announcement) => !a.viewed_at);
      setActiveAnnouncements(active);
    }
  };

  useEffect(() => {
    fetchData();
    socket.on('schedules:updated', fetchData);
    socket.on('settings:updated', fetchData);
    socket.on('announcements:updated', fetchData);
    socket.on('tasks:updated', fetchData);
    return () => {
      socket.off('schedules:updated', fetchData);
      socket.off('settings:updated', fetchData);
      socket.off('announcements:updated', fetchData);
      socket.off('tasks:updated', fetchData);
    };
  }, [currentDate]);

  const filteredEmployees = useMemo(() => {
    const DEPARTMENTS = ['Quản lý', 'Bán hàng', 'Thu ngân', 'Kỹ thuật', 'Giao vận', 'Kho'];
    const ROLES = ['Admin', 'Tổ trưởng', 'Nhân viên'];

    return employees
      .filter(e => {
        const matchName = e.name.toLowerCase().includes(search.toLowerCase()) || e.code.toLowerCase().includes(search.toLowerCase());
        
        let matchView = true;
        if (viewMode === 'me' && user) {
          matchView = e.id === user.id;
        } else if (viewMode === 'dept' && user) {
          matchView = e.department === user.department;
        } else {
          matchView = deptFilter === 'All' || e.department === deptFilter;
        }
        
        return matchName && matchView;
      })
      .sort((a, b) => {
        const deptA = DEPARTMENTS.indexOf(a.department);
        const deptB = DEPARTMENTS.indexOf(b.department);
        if (deptA !== deptB) return (deptA === -1 ? 99 : deptA) - (deptB === -1 ? 99 : deptB);
        
        const roleA = ROLES.indexOf(a.role);
        const roleB = ROLES.indexOf(b.role);
        if (roleA !== roleB) return (roleA === -1 ? 99 : roleA) - (roleB === -1 ? 99 : roleB);
        
        return a.name.localeCompare(b.name);
      });
  }, [employees, search, deptFilter, viewMode, user]);

  const getSchedule = (empId: number, dateStr: string) => {
    return schedules.find(s => s.employee_id === empId && s.date === dateStr);
  };

  const handlePrevWeek = () => setCurrentDate(subWeeks(currentDate, 1));
  const handleNextWeek = () => setCurrentDate(addDays(currentDate, 7));
  const handleCurrentWeek = () => setCurrentDate(new Date());

  const handleCopyWeek = async () => {
    if (isMonthLocked) return alert('Tháng này đã khóa lịch!');
    if (!confirm('Bạn có chắc muốn copy lịch từ tuần trước sang tuần này?')) return;
    
    const prevWeekStart = format(subWeeks(weekStart, 1), 'yyyy-MM-dd');
    const currWeekStart = format(weekStart, 'yyyy-MM-dd');
    
    await fetch('/api/schedules/copy-week', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromStartDate: prevWeekStart, toStartDate: currWeekStart })
    });
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        department: user.department,
        name: newTask.name,
        color: newTask.color,
        text_color: newTask.text_color
      })
    });
    setShowTaskForm(false);
    setNewTask({ name: '', color: '#4c1d95', text_color: '#ffffff' });
  };

  const handleDeleteTask = async (id: number) => {
    if (!confirm('Xóa nhiệm vụ này?')) return;
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
  };

  const getDeptTasks = (dept: string) => {
    return tasks.filter(t => t.department === dept || t.department === 'All');
  };

  const handleMarkAsSeen = async (annId: number) => {
    if (!user) return;
    await fetch(`/api/announcements/${annId}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: user.id })
    });
    
    const nextIndex = currentAnnIndex + 1;
    if (nextIndex < activeAnnouncements.length) {
      setCurrentAnnIndex(nextIndex);
    } else {
      setActiveAnnouncements([]);
      setCurrentAnnIndex(0);
    }
    fetchData();
  };

  const autoScheduleSales = async () => {
    if (isMonthLocked) return alert('Tháng này đã khóa lịch!');
    
    const salesEmps = employees.filter(e => e.department === 'Bán hàng');
    if (salesEmps.length < 5) {
      alert('Cần ít nhất 5 nhân viên Bán hàng để xếp lịch tự động!');
      return;
    }

    const morningShift = shifts.find(s => s.name === 'SÁNG');
    const afternoonShift = shifts.find(s => s.name === 'CHIỀU');
    const offShift = shifts.find(s => s.name === 'OFF TUẦN');

    if (!morningShift || !afternoonShift || !offShift) {
      alert('Không tìm thấy ca SÁNG, CHIỀU hoặc OFF TUẦN trong hệ thống!');
      return;
    }

    if (!confirm('Hệ thống sẽ tự động xếp lịch cho bộ phận Bán hàng tuần này. Các ca đã xếp (trừ ca OFF) sẽ bị ghi đè. Bạn có chắc chắn?')) return;

    const days = weekDays.map(d => format(d, 'yyyy-MM-dd'));
    
    // Get current schedules for this week for sales
    const currentWeekSchedules = schedules.filter(s => 
      salesEmps.some(e => e.id === s.employee_id) && 
      days.includes(s.date)
    );

    // Determine OFF days
    const empOffDays = new Map<number, string[]>();
    salesEmps.forEach(emp => empOffDays.set(emp.id, []));

    currentWeekSchedules.forEach(s => {
      if (s.shift_name.includes('OFF')) {
        empOffDays.get(s.employee_id)?.push(s.date);
      }
    });

    // Assign missing OFFs to balance staff per day
    for (const emp of salesEmps) {
      if (empOffDays.get(emp.id)?.length === 0) {
        let minOffs = 999;
        let bestDay = days[0];
        for (const day of days) {
          let offCount = 0;
          empOffDays.forEach(offs => {
            if (offs.includes(day)) offCount++;
          });
          if (offCount < minOffs) {
            minOffs = offCount;
            bestDay = day;
          }
        }
        empOffDays.get(emp.id)?.push(bestDay);
      }
    }

    const newSchedules: any[] = [];
    let prevAfternoonEmps: Employee[] = [];
    let prevAfternoonHotline: Employee | null = null;

    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      const workingEmps = salesEmps.filter(emp => !empOffDays.get(emp.id)?.includes(day));
      const offEmps = salesEmps.filter(emp => empOffDays.get(emp.id)?.includes(day));

      // Add OFF schedules
      offEmps.forEach(emp => {
        const existing = currentWeekSchedules.find(s => s.employee_id === emp.id && s.date === day);
        if (!existing) {
          newSchedules.push({
            date: day,
            employee_id: emp.id,
            shift_id: offShift.id,
            task: 'Không',
            status: 'Published'
          });
        }
      });

      let morningPool: Employee[] = [];
      let afternoonPool: Employee[] = [];
      let unassigned = [...workingEmps];

      // Rule: Day before OFF -> Morning
      const nextDay = i < days.length - 1 ? days[i+1] : null;
      if (nextDay) {
        const offNextDay = unassigned.filter(emp => empOffDays.get(emp.id)?.includes(nextDay));
        offNextDay.forEach(emp => {
          if (morningPool.length < 2) {
            morningPool.push(emp);
            unassigned = unassigned.filter(e => e.id !== emp.id);
          }
        });
      }

      // Rule: Day after OFF -> Afternoon
      const prevDay = i > 0 ? days[i-1] : null;
      if (prevDay) {
        const offPrevDay = unassigned.filter(emp => empOffDays.get(emp.id)?.includes(prevDay));
        offPrevDay.forEach(emp => {
          if (afternoonPool.length < 3) {
            afternoonPool.push(emp);
            unassigned = unassigned.filter(e => e.id !== emp.id);
          }
        });
      }

      // Fill remaining Morning
      while (morningPool.length < 2 && unassigned.length > 0) {
        morningPool.push(unassigned.pop()!);
      }

      // Fill remaining Afternoon
      while (afternoonPool.length < 3 && unassigned.length > 0) {
        afternoonPool.push(unassigned.pop()!);
      }

      // If we still have unassigned, put them in Afternoon
      unassigned.forEach(emp => afternoonPool.push(emp));

      // Assign Tasks for Morning (1 Hotline, 1 Trực cửa)
      let morningHotline: Employee | null = null;
      let morningTruc: Employee | null = null;

      if (prevAfternoonHotline && morningPool.some(e => e.id === prevAfternoonHotline!.id)) {
        morningHotline = morningPool.find(e => e.id === prevAfternoonHotline!.id) || null;
      } else if (prevAfternoonEmps.length > 0) {
        const candidate = morningPool.find(e => prevAfternoonEmps.some(pe => pe.id === e.id));
        if (candidate) morningHotline = candidate;
      }

      if (!morningHotline && morningPool.length > 0) {
        morningHotline = morningPool[0];
      }

      morningTruc = morningPool.find(e => e.id !== morningHotline?.id) || morningPool[1];

      morningPool.forEach(emp => {
        let task = 'Không';
        if (emp.id === morningHotline?.id) task = 'Hotline';
        else if (emp.id === morningTruc?.id) task = 'Trực cửa';

        newSchedules.push({
          date: day,
          employee_id: emp.id,
          shift_id: morningShift.id,
          task: task,
          status: 'Published'
        });
      });

      // Assign Tasks for Afternoon (1 Hotline, 1 Trực cửa, 1 Vệ sinh)
      let afternoonHotline = afternoonPool[0];
      let afternoonTruc = afternoonPool[1];
      let afternoonVeSinh = afternoonPool[2];

      afternoonPool.forEach(emp => {
        let task = 'Không';
        if (emp.id === afternoonHotline?.id) task = 'Hotline';
        else if (emp.id === afternoonTruc?.id) task = 'Trực cửa';
        else if (emp.id === afternoonVeSinh?.id) task = 'Vệ sinh';

        newSchedules.push({
          date: day,
          employee_id: emp.id,
          shift_id: afternoonShift.id,
          task: task,
          status: 'Published'
        });
      });

      prevAfternoonEmps = afternoonPool;
      prevAfternoonHotline = afternoonHotline;
    }

    try {
      const res = await fetch('/api/schedules/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedules: newSchedules })
      });
      if (res.ok) {
        alert('Lịch đã được tối ưu hóa!');
        fetchData();
      }
    } catch (e) {
      alert('Lỗi khi xếp lịch tự động');
    }
  };

  const handleClearWeek = async () => {
    if (isMonthLocked) return alert('Tháng này đã khóa lịch!');
    const confirmMsg = role === 'Admin' 
      ? 'Bạn có chắc muốn XÓA TOÀN BỘ lịch của tuần này? Thao tác này không thể hoàn tác.'
      : `Bạn có chắc muốn XÓA TOÀN BỘ lịch của bộ phận ${user?.department} trong tuần này? Thao tác này không thể hoàn tác.`;
      
    if (!confirm(confirmMsg)) return;
    
    const start = format(weekDays[0], 'yyyy-MM-dd');
    const end = format(weekDays[6], 'yyyy-MM-dd');
    const deptParam = role === 'Tổ trưởng' ? `&department=${user?.department}` : '';
    
    await fetch(`/api/schedules/week?start=${start}&end=${end}${deptParam}`, {
      method: 'DELETE'
    });
  };

  const toggleMonthLock = async () => {
    if (role !== 'Admin') return;
    await fetch('/api/locked-months', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: currentMonthStr, locked: !isMonthLocked })
    });
  };

  const captureSchedule = async () => {
    if (!scheduleRef.current) return;
    try {
      const dataUrl = await toPng(scheduleRef.current, {
        cacheBust: true,
        backgroundColor: '#ffffff',
        pixelRatio: 2,
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `Lich_Lam_Viec_${format(weekStart, 'dd_MM_yyyy')}.png`;
      link.click();
    } catch (err) {
      console.error(err);
      alert('Có lỗi xảy ra khi chụp ảnh lịch.');
    }
  };

  const canEdit = (dateStr: string, shiftStartTime?: string, empDept?: string) => {
    if (isGuest) return false;
    if (role === 'Nhân viên') return false;
    if (isMonthLocked) return false;
    
    if (role === 'Tổ trưởng' && user?.department !== empDept) return false;
    
    // 24h lock logic
    if (shiftStartTime) {
      const shiftDateTime = parseISO(`${dateStr}T${shiftStartTime}`);
      const now = new Date();
      const diffHours = (shiftDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
      if (diffHours < 24 && role !== 'Admin') return false; // Admin can override
    }
    
    return true;
  };

  const openEditModal = (empId: number, dateStr: string) => {
    const sched = getSchedule(empId, dateStr);
    const emp = employees.find(e => e.id === empId);
    
    if (!canEdit(dateStr, sched?.start_time, emp?.department)) {
      if (isGuest || role === 'Nhân viên') return;
      if (isMonthLocked) return alert('Tháng này đã khóa lịch, không thể sửa!');
      if (role === 'Tổ trưởng' && user?.department !== emp?.department) return alert('Bạn chỉ được sửa lịch của bộ phận mình!');
      if (role !== 'Admin') return alert('Không thể sửa lịch trước 24h!');
    }

    setSelectedCell({ date: dateStr, empId });
    setEditData({
      shift_id: sched?.shift_id || shifts[0]?.id || 0,
      task: sched?.task || 'Không',
      note: sched?.note || ''
    });
  };

  const saveSchedule = async () => {
    if (!selectedCell) return;
    await fetch('/api/schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: selectedCell.date,
        employee_id: selectedCell.empId,
        shift_id: editData.shift_id,
        task: editData.task,
        status: 'Published',
        note: editData.note
      })
    });
    setSelectedCell(null);
  };

  const deleteSchedule = async () => {
    if (!selectedCell) return;
    const sched = getSchedule(selectedCell.empId, selectedCell.date);
    if (sched) {
      await fetch(`/api/schedules/${sched.id}`, { method: 'DELETE' });
    }
    setSelectedCell(null);
  };

  const deleteAnnouncement = async (id: number) => {
    if (!confirm('Xóa thông báo này?')) return;
    await fetch(`/api/announcements/${id}`, { method: 'DELETE' });
  };

  const addAnnouncement = async () => {
    const message = prompt('Nhập nội dung thông báo:');
    if (!message) return;
    
    let targetType = 'All';
    let targetValue = 'All';

    if (role === 'Tổ trưởng') {
      targetType = 'Department';
      targetValue = user?.department || 'All';
    } else {
      const isAll = confirm('Thông báo cho toàn thể? (Cancel để chọn bộ phận)');
      if (!isAll) {
        const d = prompt('Nhập tên bộ phận (VD: Bán hàng):');
        if (!d) return;
        targetType = 'Department';
        targetValue = d;
      }
    }

    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    await fetch('/api/announcements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: role === 'Admin' ? 'Highlight 1' : 'Highlight 2',
        target_type: targetType,
        target_value: targetValue,
        message,
        start_time: now.toISOString(),
        end_time: nextWeek.toISOString(),
        created_by: user?.id
      })
    });
  };

  const departments = ['All', ...Array.from(new Set(employees.map(e => e.department)))];

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 md:pb-8">
      {/* Announcement Popup */}
      {activeAnnouncements.length > 0 && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[200] p-4">
          <div className={clsx(
            "bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-300 border-4",
            activeAnnouncements[currentAnnIndex].type === 'Highlight 1' ? "border-red-500" : "border-amber-500"
          )}>
            <div className={clsx(
              "p-6 text-white flex justify-between items-center",
              activeAnnouncements[currentAnnIndex].type === 'Highlight 1' ? "bg-red-500" : "bg-amber-500"
            )}>
              <div className="flex items-center gap-3">
                <Info className="w-6 h-6" />
                <div>
                  <h3 className="text-xl font-black uppercase tracking-wider">Thông báo quan trọng</h3>
                  <p className="text-xs opacity-80">Từ: {activeAnnouncements[currentAnnIndex].creator_name}</p>
                </div>
              </div>
              <div className="text-xs font-bold bg-white/20 px-3 py-1 rounded-full">
                {currentAnnIndex + 1} / {activeAnnouncements.length}
              </div>
            </div>
            
            <div className="p-8">
              <div className="text-slate-800 text-lg leading-relaxed whitespace-pre-wrap font-medium">
                {activeAnnouncements[currentAnnIndex].message}
              </div>
              
              <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end">
                <button 
                  onClick={() => handleMarkAsSeen(activeAnnouncements[currentAnnIndex].id)}
                  className={clsx(
                    "px-8 py-3 rounded-2xl text-white font-black uppercase tracking-widest shadow-lg hover:scale-105 active:scale-95 transition-all",
                    activeAnnouncements[currentAnnIndex].type === 'Highlight 1' ? "bg-red-500 shadow-red-200" : "bg-amber-500 shadow-amber-200"
                  )}
                >
                  Tôi đã xem và xác nhận
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header Controls */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-4">
        {/* Row 1: View Selection & Navigation */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex bg-slate-100 p-1 rounded-xl w-full md:w-auto">
            <button 
              onClick={() => setViewMode('me')}
              className={clsx(
                "flex-1 md:flex-none px-4 py-1.5 rounded-lg text-xs font-medium transition-all",
                viewMode === 'me' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Cá nhân
            </button>
            {!isGuest && (
              <button 
                onClick={() => {
                  setViewMode('dept');
                  setDeptFilter(user.department);
                }}
                className={clsx(
                  "flex-1 md:flex-none px-4 py-1.5 rounded-lg text-xs font-medium transition-all",
                  viewMode === 'dept' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                Tổ của tôi
              </button>
            )}
            {(role === 'Admin' || role === 'Tổ trưởng') && (
              <button 
                onClick={() => setViewMode('all')}
                className={clsx(
                  "flex-1 md:flex-none px-4 py-1.5 rounded-lg text-xs font-medium transition-all",
                  viewMode === 'all' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                Tất cả
              </button>
            )}
          </div>

          <div className="flex items-center bg-slate-100 rounded-xl p-1 w-full md:w-auto justify-between">
            <button onClick={handlePrevWeek} className="p-2 hover:bg-white rounded-lg transition-colors text-slate-600"><ChevronLeft className="w-5 h-5" /></button>
            <div className="px-4 font-bold text-slate-800 flex items-center gap-2 text-sm cursor-pointer hover:text-indigo-600 transition-colors" onClick={handleCurrentWeek} title="Về tuần hiện tại">
              <CalendarIcon className="w-4 h-4 text-indigo-500" />
              {format(weekStart, 'dd/MM')} - {format(weekDays[6], 'dd/MM')}
            </div>
            <button onClick={handleNextWeek} className="p-2 hover:bg-white rounded-lg transition-colors text-slate-600"><ChevronRight className="w-5 h-5" /></button>
          </div>

          <div className="flex gap-2 w-full md:w-auto">
            <button 
              onClick={handleCurrentWeek}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white text-indigo-600 border border-indigo-100 px-4 py-2 rounded-xl hover:bg-indigo-50 transition-colors text-xs font-bold shadow-sm"
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              Tuần hiện tại
            </button>
            {role === 'Admin' && (
              <button 
                onClick={toggleMonthLock}
                className={clsx(
                  "flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors border",
                  isMonthLocked ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-50 text-slate-700 border-slate-200"
                )}
              >
                <Lock className="w-3.5 h-3.5" />
                {isMonthLocked ? 'Mở khóa' : 'Khóa lịch'}
              </button>
            )}
            <button 
              onClick={captureSchedule}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors text-xs font-bold shadow-sm"
            >
              <Camera className="w-3.5 h-3.5" />
              Chụp lịch
            </button>
          </div>
        </div>

        {/* Row 2: Filters & Actions */}
        <div className="flex flex-col lg:flex-row justify-between items-center gap-4 pt-2 border-t border-slate-100">
          <div className="flex flex-col sm:flex-row items-center gap-2 w-full lg:w-auto">
            {viewMode === 'all' && (
              <>
                <div className="relative w-full sm:w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Tìm nhân viên..." 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div className="relative w-full sm:w-48">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <select 
                    value={deptFilter}
                    onChange={(e) => setDeptFilter(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none appearance-none"
                  >
                    {departments.map(d => <option key={d} value={d}>{d === 'All' ? 'Tất cả bộ phận' : d}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>

          {(role === 'Admin' || role === 'Tổ trưởng') && (
            <div className="flex flex-wrap justify-center sm:justify-end gap-2 w-full lg:w-auto">
              <button 
                onClick={autoScheduleSales}
                className="flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-100 px-3 py-2 rounded-xl hover:bg-emerald-100 transition-colors text-xs font-bold"
              >
                <Wand2 className="w-3.5 h-3.5" />
                Auto Bán hàng
              </button>
              <button 
                onClick={handleCopyWeek}
                className="flex items-center gap-2 bg-indigo-50 text-indigo-700 border border-indigo-100 px-3 py-2 rounded-xl hover:bg-indigo-100 transition-colors text-xs font-bold"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy tuần trước
              </button>
              <button 
                onClick={addAnnouncement}
                className="flex items-center gap-2 bg-amber-50 text-amber-700 border border-amber-100 px-3 py-2 rounded-xl hover:bg-amber-100 transition-colors text-xs font-bold"
              >
                <Info className="w-3.5 h-3.5" />
                Thông báo
              </button>
              <button 
                onClick={() => setShowTaskForm(true)}
                className="flex items-center gap-2 bg-slate-50 text-slate-700 border border-slate-200 px-3 py-2 rounded-xl hover:bg-slate-100 transition-colors text-xs font-bold"
              >
                <Search className="w-3.5 h-3.5" />
                Nhiệm vụ
              </button>
              <button 
                onClick={handleClearWeek}
                className="flex items-center gap-2 bg-red-50 text-red-700 border border-red-100 px-3 py-2 rounded-xl hover:bg-red-100 transition-colors text-xs font-bold"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Xóa tuần
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Announcements */}
      {announcements.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-sm">
          <h3 className="text-amber-800 font-bold mb-2 flex items-center gap-2">
            <Info className="w-5 h-5" />
            Thông báo tuần này
          </h3>
          <div className="space-y-2">
            {announcements.map(ann => (
              <div key={ann.id} className="bg-white p-3 rounded-xl border border-amber-100 text-sm text-slate-700 flex justify-between items-start">
                <div>
                  <span className="font-bold text-amber-700 mr-2">[{ann.department === 'All' ? 'Toàn thể' : ann.department}]</span>
                  {ann.message}
                </div>
                {(role === 'Admin' || (role === 'Tổ trưởng' && user?.department === ann.department)) && (
                  <button 
                    onClick={() => deleteAnnouncement(ann.id)}
                    className="text-red-500 hover:text-red-700 p-1"
                  >
                    Xóa
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Desktop Table View (Hidden on mobile) */}
      <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden" ref={scheduleRef}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="bg-slate-50 p-4 border-b border-r border-slate-200 text-left w-64 sticky left-0 z-20">
                  <span className="text-sm font-semibold text-slate-600 uppercase tracking-wider">Nhân viên / Staff</span>
                </th>
                {weekDays.map(day => (
                  <th key={day.toISOString()} className={clsx(
                    "bg-slate-50 p-3 border-b border-slate-200 text-center min-w-[120px]",
                    isSameDay(day, new Date()) && "bg-indigo-50/50"
                  )}>
                    <div className="text-xs font-medium text-slate-500 uppercase">{format(day, 'EEEE', { locale: vi })}</div>
                    <div className={clsx(
                      "text-sm font-bold mt-1",
                      isSameDay(day, new Date()) ? "text-indigo-600" : "text-slate-800"
                    )}>{format(day, 'dd/MM')}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from(new Set(filteredEmployees.map(e => e.department))).map(dept => (
                <React.Fragment key={dept}>
                  <tr className="bg-slate-100/80 border-y border-slate-200">
                    <td colSpan={8} className="p-3 font-bold text-slate-700 uppercase tracking-wider text-sm sticky left-0 z-20 bg-slate-100/80">
                      Bộ phận: {dept}
                    </td>
                  </tr>
                  {filteredEmployees.filter(e => e.department === dept).map(emp => (
                    <tr key={emp.id} className="group hover:bg-slate-50/50">
                      <td className="p-4 border-b border-r border-slate-100 bg-white group-hover:bg-slate-50/50 sticky left-0 z-10">
                        <div className="font-medium text-slate-800">{emp.name}</div>
                        <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                          <span className="font-mono">{emp.code}</span>
                          <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                          <span>{emp.role}</span>
                        </div>
                      </td>
                      {weekDays.map(day => {
                        const dateStr = format(day, 'yyyy-MM-dd');
                        const sched = getSchedule(emp.id, dateStr);
                        const taskObj = tasks.find(t => t.name === sched?.task && (t.department === emp.department || t.department === 'All'));
                        const taskColor = taskObj?.color;
                        const taskTextColor = taskObj?.text_color;
                        const editable = canEdit(dateStr, sched?.start_time, emp.department);
                        
                        return (
                          <td 
                            key={dateStr} 
                            className={clsx(
                              "p-2 border-b border-slate-100 relative group/cell transition-all",
                              editable ? "hover:bg-slate-100 cursor-pointer" : "cursor-default"
                            )}
                            onClick={() => editable && openEditModal(emp.id, dateStr)}
                          >
                            {sched ? (
                              <div 
                                className="h-full min-h-[60px] rounded-xl p-2 flex flex-col justify-between border border-black/5 shadow-sm"
                                style={{ backgroundColor: sched.color, color: sched.text_color, opacity: editable ? 1 : 0.8 }}
                              >
                                <div className="text-sm font-black uppercase tracking-wide whitespace-pre-line leading-tight">
                                  {sched.shift_name.toUpperCase() === 'OFF KHÔNG LƯƠNG' ? 'OFF\nKHÔNG LƯƠNG' : sched.shift_name}
                                </div>
                                
                                {sched.task && sched.task !== 'Không' && (
                                  <div 
                                    className="text-[10px] font-medium px-1.5 py-0.5 rounded mt-1 truncate"
                                    style={{ backgroundColor: taskColor, color: taskTextColor }}
                                  >
                                    {sched.task}
                                  </div>
                                )}

                                {/* Tooltip */}
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[200px] bg-slate-800 text-white text-xs rounded-lg py-1.5 px-3 opacity-0 group-hover/cell:opacity-100 pointer-events-none transition-opacity z-30 shadow-xl">
                                  <div className="font-bold mb-1">{emp.name}</div>
                                  <div>Ca: {sched.shift_name} ({sched.start_time} - {sched.end_time})</div>
                                  {sched.task && sched.task !== 'Không' && <div>Nhiệm vụ: {sched.task}</div>}
                                  {sched.note && <div className="mt-1 text-slate-300 italic border-t border-slate-600 pt-1">Ghi chú: {sched.note}</div>}
                                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                                </div>
                              </div>
                            ) : (
                              <div className={clsx(
                                "h-full min-h-[60px] rounded-xl border border-dashed border-slate-200 flex items-center justify-center transition-opacity",
                                editable ? "opacity-0 group-hover/cell:opacity-100" : "opacity-0"
                              )}>
                                <span className="text-xs text-slate-400 font-medium">+ Thêm ca</span>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card View (Hidden on desktop) */}
      <div className="md:hidden space-y-4">
        {weekDays.map(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isToday = isSameDay(day, new Date());
          
          return (
            <div key={dateStr} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className={clsx(
                "p-3 border-b border-slate-100 flex items-center justify-between",
                isToday ? "bg-indigo-50" : "bg-slate-50"
              )}>
                <div className="flex items-center gap-2">
                  <CalendarIcon className={clsx("w-4 h-4", isToday ? "text-indigo-600" : "text-slate-500")} />
                  <span className={clsx("font-bold text-sm", isToday ? "text-indigo-700" : "text-slate-700")}>
                    {format(day, 'EEEE, dd/MM', { locale: vi })}
                  </span>
                </div>
                {isToday && <span className="text-[10px] font-bold bg-indigo-600 text-white px-2 py-0.5 rounded-full">Hôm nay</span>}
              </div>
              
              <div className="divide-y divide-slate-100">
                {Array.from(new Set(filteredEmployees.map(e => e.department))).map(dept => {
                  const deptEmps = filteredEmployees.filter(e => e.department === dept);
                  const hasVisibleEmps = deptEmps.some(emp => {
                    const sched = getSchedule(emp.id, dateStr);
                    return sched || (!isGuest && role !== 'Nhân viên');
                  });
                  if (!hasVisibleEmps) return null;

                  return (
                    <React.Fragment key={dept}>
                      <div className="bg-slate-100/80 px-4 py-2 text-xs font-bold text-slate-600 uppercase tracking-wider">
                        {dept}
                      </div>
                      {deptEmps.map(emp => {
                        const sched = getSchedule(emp.id, dateStr);
                        if (!sched && (isGuest || role === 'Nhân viên')) return null;
                        
                        const taskObj = tasks.find(t => t.name === sched?.task && (t.department === emp.department || t.department === 'All'));
                        const taskColor = taskObj?.color;
                        const taskTextColor = taskObj?.text_color;
                        const editable = canEdit(dateStr, sched?.start_time, emp.department);

                        return (
                          <div 
                            key={emp.id} 
                            onClick={() => editable && openEditModal(emp.id, dateStr)}
                            className={clsx(
                              "p-3 flex items-center justify-between",
                              editable ? "active:bg-slate-50 cursor-pointer" : ""
                            )}
                          >
                            <div>
                              <div className="font-medium text-slate-800 text-sm">{emp.name}</div>
                              <div className="text-xs text-slate-500 mt-0.5">{emp.code}</div>
                            </div>
                            
                            {sched ? (
                              <div className="flex flex-col items-end gap-1">
                                <div 
                                  className="px-3 py-1 rounded-lg text-sm font-black uppercase tracking-wide border border-black/5 shadow-sm whitespace-pre-line text-right leading-tight"
                                  style={{ backgroundColor: sched.color, color: sched.text_color, opacity: editable ? 1 : 0.8 }}
                                >
                                  {sched.shift_name.toUpperCase() === 'OFF KHÔNG LƯƠNG' ? 'OFF\nKHÔNG LƯƠNG' : sched.shift_name}
                                </div>
                                {sched.task && sched.task !== 'Không' && (
                                  <span 
                                    className="text-[10px] font-medium px-2 py-0.5 rounded-md"
                                    style={{ backgroundColor: taskColor, color: taskTextColor }}
                                  >
                                    {sched.task}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="text-xs text-slate-400 font-medium px-3 py-1.5 rounded-lg border border-dashed border-slate-200">
                                + Thêm ca
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
                {filteredEmployees.length === 0 && (
                  <div className="p-4 text-center text-sm text-slate-500">Không có dữ liệu</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Modal */}
      {selectedCell && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-5 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800">
                {employees.find(e => e.id === selectedCell.empId)?.name}
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                Ngày: {format(parseISO(selectedCell.date), 'dd/MM/yyyy')}
              </p>
            </div>
            
            <div className="p-5 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Ca làm việc</label>
                <div className="grid grid-cols-2 gap-2">
                  {shifts.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setEditData({ ...editData, shift_id: s.id })}
                      className={clsx(
                        "p-2 rounded-xl text-sm font-bold uppercase tracking-wide border transition-all",
                        editData.shift_id === s.id ? "ring-2 ring-indigo-500 border-transparent shadow-sm" : "border-slate-200 hover:border-indigo-300"
                      )}
                      style={{ 
                        backgroundColor: editData.shift_id === s.id ? s.color : '#fff',
                        color: editData.shift_id === s.id ? s.text_color : '#334155'
                      }}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-slate-700">Nhiệm vụ đặc biệt</label>
                  {(role === 'Admin' || role === 'Tổ trưởng') && (
                    <button 
                      onClick={() => setShowTaskForm(true)}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700"
                    >
                      + Quản lý tất cả
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 mb-3">
                  <button
                    onClick={() => setEditData({ ...editData, task: 'Không' })}
                    className={clsx(
                      "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                      editData.task === 'Không' ? "ring-2 ring-indigo-500 border-transparent shadow-sm bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    Không
                  </button>
                  {getDeptTasks(employees.find(e => e.id === selectedCell.empId)?.department || '').map(t => (
                    <button
                      key={t.id}
                      onClick={() => setEditData({ ...editData, task: t.name })}
                      className={clsx(
                        "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                        editData.task === t.name ? "ring-2 ring-indigo-500 border-transparent shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      )}
                      style={editData.task === t.name ? { backgroundColor: t.color, color: t.text_color } : {}}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
                {(role === 'Admin' || role === 'Tổ trưởng') && (
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      placeholder="Thêm nhanh nhiệm vụ..."
                      className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const name = (e.target as HTMLInputElement).value.trim();
                          if (!name) return;
                          
                          const dept = employees.find(emp => emp.id === selectedCell.empId)?.department || '';
                          const res = await fetch('/api/tasks', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              department: dept,
                              name: name,
                              color: '#6366f1',
                              text_color: '#ffffff'
                            })
                          });
                          if (res.ok) {
                            (e.target as HTMLInputElement).value = '';
                            fetchData();
                            setEditData({ ...editData, task: name });
                          }
                        }
                      }}
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Ghi chú</label>
                <input 
                  type="text" 
                  value={editData.note}
                  onChange={(e) => setEditData({ ...editData, note: e.target.value })}
                  placeholder="Nhập ghi chú (nếu có)..."
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>
            
            <div className="p-4 border-t border-slate-100 flex justify-between gap-3 bg-slate-50">
              {getSchedule(selectedCell.empId, selectedCell.date) ? (
                <button 
                  onClick={deleteSchedule} 
                  className="px-4 py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-xl text-sm font-medium transition-colors"
                >
                  Xóa ca
                </button>
              ) : <div></div>}
              
              <div className="flex gap-2">
                <button 
                  onClick={() => setSelectedCell(null)} 
                  className="px-4 py-2 text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-sm font-medium transition-colors"
                >
                  Hủy
                </button>
                <button 
                  onClick={saveSchedule} 
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  Lưu lại
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Task Management Modal */}
      {showTaskForm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">Quản lý nhiệm vụ - {user?.department}</h3>
              <button onClick={() => setShowTaskForm(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="p-5 space-y-4">
              <form onSubmit={handleAddTask} className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-sm font-bold text-slate-700">Thêm nhiệm vụ mới</div>
                <input 
                  type="text" 
                  required
                  placeholder="Tên nhiệm vụ (VD: Trực Hotline)"
                  value={newTask.name}
                  onChange={e => setNewTask({...newTask, name: e.target.value})}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Màu nền</label>
                    <input 
                      type="color" 
                      value={newTask.color}
                      onChange={e => setNewTask({...newTask, color: e.target.value})}
                      className="w-full h-8 p-0 border-0 rounded cursor-pointer"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Màu chữ</label>
                    <input 
                      type="color" 
                      value={newTask.text_color}
                      onChange={e => setNewTask({...newTask, text_color: e.target.value})}
                      className="w-full h-8 p-0 border-0 rounded cursor-pointer"
                    />
                  </div>
                </div>
                <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 transition-colors">
                  Thêm nhiệm vụ
                </button>
              </form>

              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                <div className="text-sm font-bold text-slate-700">Danh sách nhiệm vụ hiện tại</div>
                {getDeptTasks(user?.department || '').map(t => (
                  <div key={t.id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: t.color }}></div>
                      <span className="text-sm font-medium text-slate-700">{t.name}</span>
                      {t.department === 'All' && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">Hệ thống</span>}
                    </div>
                    {t.department !== 'All' && (
                      <button onClick={() => handleDeleteTask(t.id)} className="text-red-400 hover:text-red-600 p-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
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
