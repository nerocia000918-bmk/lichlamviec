/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import { Calendar, Users, BookOpen, LogOut, User as UserIcon, Settings as SettingsIcon, CalendarMinus, Bell, AlertCircle, CheckCircle2, ClipboardList } from 'lucide-react';
import ScheduleView from './pages/ScheduleView';
import EmployeeList from './pages/EmployeeList';
import Guide from './pages/Guide';
import Settings from './pages/Settings';
import LeaveRequests from './pages/LeaveRequests';
import Announcements from './pages/Announcements';
import Tasks from './pages/Tasks';
import { socket } from './socket';
import { User, Role } from './types';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [showLogin, setShowLogin] = useState(true);
  const [loginCode, setLoginCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [employees, setEmployees] = useState<any[]>([]);
  const [pendingTasks, setPendingTasks] = useState<any[]>([]);
  const [showTaskNotification, setShowTaskNotification] = useState(false);

  const fetchPendingTasks = async (userId: number) => {
    try {
      const res = await fetch(`/api/employees/${userId}/pending-tasks`);
      if (res.ok) {
        const data = await res.json();
        const tasks = Array.isArray(data) ? data : [];
        setPendingTasks(tasks);
        if (tasks.length > 0) {
          setShowTaskNotification(true);
        }
      }
    } catch (err) {
      console.error('Error fetching pending tasks:', err);
    }
  };

  useEffect(() => {
    fetch('/api/employees')
      .then(res => res.json())
      .then(data => setEmployees(data))
      .catch(() => {});

    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      const parsedUser = JSON.parse(savedUser);
      setUser(parsedUser);
      setShowLogin(false);
      fetchPendingTasks(parsedUser.id);
    } else {
      const guest = localStorage.getItem('isGuest');
      if (guest) {
        setIsGuest(true);
        setShowLogin(false);
      }
    }

    socket.on('tasks:updated', () => {
      if (user) fetchPendingTasks(user.id);
    });

    return () => {
      socket.off('tasks:updated');
    };
  }, [user?.id]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const trimmedCode = loginCode.trim();
    if (!trimmedCode) {
      setIsGuest(true);
      setShowLogin(false);
      localStorage.setItem('isGuest', 'true');
      return;
    }

    try {
      const res = await fetch('/api/employees');
      const data = await res.json();
      const allEmployees = Array.isArray(data) ? data : [];
      setEmployees(allEmployees); // Update local state as well
      
      const foundUser = allEmployees.find(emp => emp.code.trim().toLowerCase() === trimmedCode.toLowerCase());
      
      if (foundUser) {
        const isAdmin = foundUser.role.toLowerCase() === 'admin';
        if (isAdmin) {
          if (!password) {
            setError('Tài khoản Admin yêu cầu mật khẩu!');
            return;
          }
          // Use String() to handle cases where password might be stored as a number
          if (String(foundUser.password) !== String(password)) {
            setError('Mật khẩu không chính xác!');
            return;
          }
        }

        // Ensure role matches the expected Title Case for the UI
        let normalizedRole: Role = 'Nhân viên';
        const roleLower = foundUser.role.toLowerCase();
        if (roleLower === 'admin') normalizedRole = 'Admin';
        else if (roleLower === 'tổ trưởng') normalizedRole = 'Tổ trưởng';
        
        const userWithNormalizedRole = { ...foundUser, role: normalizedRole };
        setUser(userWithNormalizedRole);
        setShowLogin(false);
        localStorage.setItem('user', JSON.stringify(userWithNormalizedRole));
        fetchPendingTasks(userWithNormalizedRole.id);
      } else {
        setError(`Mã nhân viên "${trimmedCode}" không tồn tại! Vui lòng kiểm tra lại cột "code" trong Google Sheet.`);
      }
    } catch (err) {
      setError('Lỗi kết nối máy chủ.');
    }
  };

  const handleLogout = () => {
    setUser(null);
    setIsGuest(false);
    setShowLogin(true);
    setLoginCode('');
    setPassword('');
    setError('');
    localStorage.removeItem('user');
    localStorage.removeItem('isGuest');
  };

  const currentRole: Role = user ? user.role : 'Nhân viên';

  const isLoggingInAsAdmin = loginCode.trim().toLowerCase() === 'admin' || 
    employees?.find(e => e.code.trim().toLowerCase() === loginCode.trim().toLowerCase())?.role.toLowerCase() === 'admin';

  if (showLogin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-100">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">Lịch Làm Việc</h1>
            <p className="text-slate-500 mt-2">Đăng nhập để xem và quản lý lịch</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mã nhân viên</label>
              <input 
                type="text" 
                value={loginCode}
                onChange={(e) => {
                  setLoginCode(e.target.value);
                  setError(''); // Clear error when typing
                }}
                placeholder="VD: NV001 (Bỏ trống để xem với tư cách Khách)"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              />
            </div>

            {isLoggingInAsAdmin && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                <label className="block text-sm font-medium text-slate-700 mb-1">Mật khẩu (Dành cho Admin)</label>
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  placeholder="Nhập mật khẩu..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                />
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl">
                <p className="text-red-600 text-xs font-medium">{error}</p>
              </div>
            )}
            
            <button 
              type="submit"
              className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm active:scale-[0.98]"
            >
              {loginCode.trim() ? 'Đăng nhập' : 'Vào xem (Khách)'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
        {/* Sidebar / Bottom Nav */}
        <nav className="bg-white border-r border-slate-200 w-full md:w-64 flex-shrink-0 flex md:flex-col justify-between md:justify-start fixed bottom-0 md:relative z-50">
          <div className="p-4 hidden md:block border-b border-slate-100">
            <h1 className="text-xl font-bold text-slate-800">Lịch Làm Việc</h1>
            <p className="text-sm text-slate-500">Real-time Schedule</p>
          </div>
          
          <div className="flex md:flex-col w-full p-2 md:p-4 gap-1 md:gap-2">
            <Link to="/" className="flex-1 md:flex-none flex flex-col md:flex-row items-center gap-1 md:gap-3 p-2 md:p-3 rounded-xl hover:bg-slate-50 text-slate-700 hover:text-indigo-600 transition-colors">
              <Calendar className="w-5 h-5" />
              <span className="text-[10px] md:text-sm font-medium">Lịch / Schedule</span>
            </Link>
            {!isGuest && (
              <>
                <Link to="/leave" className="flex-1 md:flex-none flex flex-col md:flex-row items-center gap-1 md:gap-3 p-2 md:p-3 rounded-xl hover:bg-slate-50 text-slate-700 hover:text-indigo-600 transition-colors">
                  <CalendarMinus className="w-5 h-5" />
                  <span className="text-[10px] md:text-sm font-medium">Xin nghỉ / OFF</span>
                </Link>
                <Link to="/thong-bao" className="flex-1 md:flex-none flex flex-col md:flex-row items-center gap-1 md:gap-3 p-2 md:p-3 rounded-xl hover:bg-slate-50 text-slate-700 hover:text-indigo-600 transition-colors">
                  <Bell className="w-5 h-5" />
                  <span className="text-[10px] md:text-sm font-medium">Thông báo</span>
                </Link>
                <Link to="/nhiem-vu" className="flex-1 md:flex-none flex flex-col md:flex-row items-center gap-1 md:gap-3 p-2 md:p-3 rounded-xl hover:bg-slate-50 text-slate-700 hover:text-indigo-600 transition-colors">
                  <ClipboardList className="w-5 h-5" />
                  <span className="text-[10px] md:text-sm font-medium">Nhiệm vụ được giao</span>
                </Link>
                {currentRole === 'Admin' && (
                  <>
                    <Link to="/employees" className="flex-1 md:flex-none flex flex-col md:flex-row items-center gap-1 md:gap-3 p-2 md:p-3 rounded-xl hover:bg-slate-50 text-slate-700 hover:text-indigo-600 transition-colors">
                      <Users className="w-5 h-5" />
                      <span className="text-[10px] md:text-sm font-medium">Nhân sự / Staff</span>
                    </Link>
                    <Link to="/settings" className="flex-1 md:flex-none flex flex-col md:flex-row items-center gap-1 md:gap-3 p-2 md:p-3 rounded-xl hover:bg-slate-50 text-slate-700 hover:text-indigo-600 transition-colors">
                      <SettingsIcon className="w-5 h-5" />
                      <span className="text-[10px] md:text-sm font-medium">Cài đặt / Settings</span>
                    </Link>
                  </>
                )}
                <Link to="/guide" className="flex-1 md:flex-none flex flex-col md:flex-row items-center gap-1 md:gap-3 p-2 md:p-3 rounded-xl hover:bg-slate-50 text-slate-700 hover:text-indigo-600 transition-colors">
                  <BookOpen className="w-5 h-5" />
                  <span className="text-[10px] md:text-sm font-medium">HDSD / Guide</span>
                </Link>
              </>
            )}
          </div>

          <div className="hidden md:block mt-auto p-4 border-t border-slate-100">
            <div className="bg-slate-50 p-3 rounded-xl mb-3">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center">
                  <UserIcon className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-800">{user ? user.name : 'Khách'}</div>
                  <div className="text-xs text-slate-500">{user ? `${user.role} - ${user.department}` : 'Chỉ xem'}</div>
                </div>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 text-slate-600 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors text-sm font-medium"
            >
              <LogOut className="w-4 h-4" />
              Đăng xuất
            </button>
          </div>
        </nav>

        {/* Mobile Header (Top) */}
        <div className="md:hidden bg-white border-b border-slate-200 p-3 flex justify-between items-center sticky top-0 z-40">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center">
              <UserIcon className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-800 leading-tight">{user ? user.name : 'Khách'}</div>
              <div className="text-[10px] text-slate-500">{user ? user.role : 'Chỉ xem'}</div>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="p-2 text-slate-500 hover:text-red-600 bg-slate-50 rounded-lg"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* Main Content */}
        <main className="flex-1 overflow-auto p-4 md:p-8 pb-24 md:pb-8">
          {showTaskNotification && pendingTasks.length > 0 && (
            <div className="mb-6 animate-in slide-in-from-top duration-300">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-4 shadow-sm">
                <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h4 className="text-amber-800 font-bold">Bạn có {pendingTasks.length} nhiệm vụ chưa hoàn thành</h4>
                  <ul className="mt-2 space-y-1">
                    {pendingTasks.slice(0, 3).map(task => (
                      <li key={task.id} className="text-amber-700 text-sm flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-amber-400 rounded-full"></span>
                        {task.title}
                      </li>
                    ))}
                    {pendingTasks.length > 3 && (
                      <li className="text-amber-600 text-xs italic">...và {pendingTasks.length - 3} nhiệm vụ khác</li>
                    )}
                  </ul>
                  <div className="mt-3 flex gap-3">
                    <Link 
                      to="/nhiem-vu" 
                      onClick={() => setShowTaskNotification(false)}
                      className="text-xs font-bold text-amber-700 hover:underline"
                    >
                      Xem chi tiết
                    </Link>
                    <button 
                      onClick={() => setShowTaskNotification(false)}
                      className="text-xs font-bold text-amber-500 hover:text-amber-600"
                    >
                      Đóng
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          <Routes>
            <Route path="/" element={<ScheduleView user={user} />} />
            {!isGuest && (
              <>
                <Route path="/leave" element={<LeaveRequests user={user} />} />
                <Route path="/announcements" element={<Navigate to="/thong-bao" replace />} />
                <Route path="/thong-bao" element={<Announcements user={user} />} />
                <Route path="/tasks" element={<Navigate to="/nhiem-vu" replace />} />
                <Route path="/nhiem-vu" element={<Tasks />} />
                <Route path="/employees" element={<EmployeeList role={currentRole} />} />
                <Route path="/guide" element={<Guide />} />
                <Route path="/settings" element={<Settings role={currentRole} user={user} />} />
              </>
            )}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
