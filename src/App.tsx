/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import { Calendar, Users, BookOpen, LogOut, User as UserIcon, Settings as SettingsIcon, CalendarMinus, Info, AlertCircle, RefreshCw, X, Link as LinkIcon, CheckCircle2 } from 'lucide-react';
import ScheduleView from './pages/ScheduleView';
import EmployeeList from './pages/EmployeeList';
import Guide from './pages/Guide';
import Settings from './pages/Settings';
import LeaveRequests from './pages/LeaveRequests';
import AnnouncementsAndTasks from './pages/AnnouncementsAndTasks';
import { io } from 'socket.io-client';

export const socket = io();

export type Role = 'Admin' | 'Tổ trưởng' | 'Nhân viên';

export interface User {
  id: number;
  code: string;
  name: string;
  department: string;
  role: Role;
  resigned_date?: string | null;
  joined_date?: string | null;
  is_hidden?: boolean;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [showLogin, setShowLogin] = useState(true);
  const [loginCode, setLoginCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [employees, setEmployees] = useState<any[]>([]);
  const [pendingTasks, setPendingTasks] = useState<{ count: number, titles: string[] } | null>(null);
  const [hasDismissedTasks, setHasDismissedTasks] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    const saved = localStorage.getItem('notifications_enabled');
    return saved === null ? true : saved === 'true';
  });

  // Modal cấu hình link Google Sheets ngay từ màn hình đăng nhập
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [sheetsUrlInput, setSheetsUrlInput] = useState('');
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectMsg, setConnectMsg] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);

  const fetchEmployeesList = () => {
    fetch('/api/employees')
      .then(res => res.json())
      .then((data: any[]) => {
        if (!Array.isArray(data)) return;
        setEmployees(data);

        // Cập nhật và tự động bù đắp ngày nhân viên từ bộ nhớ cục bộ (localStorage)
        try {
          const rawCache = localStorage.getItem('EMPLOYEE_DATES_CACHE');
          const cache = rawCache ? JSON.parse(rawCache) : {};
          let needsRestore = false;
          const toRestore: Record<string, any> = {};

          data.forEach(emp => {
            if (emp.code) {
              const sDate = emp.start_date || emp.joined_date;
              const eDate = emp.end_date || emp.resigned_date;
              if (sDate || eDate) {
                cache[emp.code] = {
                  name: emp.name,
                  start_date: sDate || (cache[emp.code]?.start_date || null),
                  end_date: eDate || (cache[emp.code]?.end_date || null)
                };
              } else if (cache[emp.code] && (cache[emp.code].start_date || cache[emp.code].end_date)) {
                needsRestore = true;
                toRestore[emp.code] = cache[emp.code];
              }
            }
          });

          localStorage.setItem('EMPLOYEE_DATES_CACHE', JSON.stringify(cache));

          if (needsRestore && Object.keys(toRestore).length > 0) {
            console.log('[Auto-Heal] Bù đắp ngày nhân viên bị thiếu từ localStorage:', toRestore);
            fetch('/api/employee-dates/restore', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ dates: toRestore })
            }).then(() => {
              fetch('/api/employees')
                .then(r => r.json())
                .then(refreshed => Array.isArray(refreshed) && setEmployees(refreshed));
            });
          }
        } catch (e) {}
      })
      .catch(() => {});
  };

  const handleConnectSheets = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!sheetsUrlInput.trim()) {
      setConnectMsg({ type: 'error', text: 'Vui lòng dán đường link Google Sheets Web App' });
      return;
    }
    setConnectLoading(true);
    setConnectMsg({ type: 'info', text: 'Đang kết nối tới Google Sheets và tải toàn bộ dữ liệu...' });
    try {
      const res = await fetch('/api/config/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sheetsUrlInput.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('GOOGLE_SHEETS_URL', sheetsUrlInput.trim());
        setConnectMsg({ 
          type: 'success', 
          text: `Kết nối thành công! Đã nạp ${data.employeesCount || 0} nhân viên và ${data.schedulesCount || 0} ca/lịch làm việc.` 
        });
        fetchEmployeesList();
        setTimeout(() => {
          setShowConnectModal(false);
          setConnectMsg(null);
        }, 1800);
      } else {
        setConnectMsg({ type: 'error', text: data.error || 'Không thể đồng bộ với đường link này. Vui lòng kiểm tra lại URL.' });
      }
    } catch (err: any) {
      setConnectMsg({ type: 'error', text: 'Lỗi kết nối máy chủ: ' + err.message });
    } finally {
      setConnectLoading(false);
    }
  };

  useEffect(() => {
    // Request notification permission if enabled
    if (notificationsEnabled && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // Tự động khôi phục URL Google Sheets & ngày nhân viên từ localStorage nếu máy chủ vừa khởi động lại
    const localSheetsUrl = localStorage.getItem('GOOGLE_SHEETS_URL');
    fetch('/api/config/sheets')
      .then(res => res.json())
      .then(cfg => {
        if (!cfg.url && localSheetsUrl) {
          console.log('[Auto-Heal] Khôi phục GOOGLE_SHEETS_URL từ trình duyệt...');
          fetch('/api/config/sheets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: localSheetsUrl })
          }).then(() => {
            fetchEmployeesList();
          });
        } else if (cfg.url) {
          localStorage.setItem('GOOGLE_SHEETS_URL', cfg.url);
        }
      })
      .catch(() => {});

    // Tự động khôi phục danh sách nhân viên bị ẩn từ localStorage nếu máy chủ vừa khởi động lại
    const localHiddenRaw = localStorage.getItem('HIDDEN_EMPLOYEE_CODES');
    if (localHiddenRaw) {
      try {
        const hiddenList = JSON.parse(localHiddenRaw);
        if (Array.isArray(hiddenList) && hiddenList.length > 0) {
          fetch('/api/employees/hidden/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hiddenCodes: hiddenList })
          }).catch(() => {});
        }
      } catch (e) {}
    }

    fetchEmployeesList();

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

    const handleTaskUpdate = () => {
      const currentUser = localStorage.getItem('user');
      if (currentUser) {
        const parsed = JSON.parse(currentUser);
        fetchPendingTasks(parsed.id, true);
      }
    };

    socket.on('assigned_tasks:updated', handleTaskUpdate);
    return () => {
      socket.off('assigned_tasks:updated', handleTaskUpdate);
    };
  }, [notificationsEnabled]);

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
      const allEmployees: any[] = await res.json();
      setEmployees(allEmployees); // Update local state as well
      
      const foundUser = allEmployees.find(emp => emp.code.trim().toLowerCase() === trimmedCode.toLowerCase());
      
      if (foundUser) {
        if (foundUser.joined_date) {
          const joinedDate = new Date(foundUser.joined_date);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (today < joinedDate) {
            setError('Tài khoản này chưa đến ngày bắt đầu làm việc.');
            return;
          }
        }

        if (foundUser.resigned_date) {
          const resignedDate = new Date(foundUser.resigned_date);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (today > resignedDate) {
            setError('Tài khoản này đã ngừng hoạt động (nhân viên đã nghỉ việc).');
            return;
          }
        }

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
        setHasDismissedTasks(false); // Reset dismissal on login
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
    setPendingTasks(null);
    setHasDismissedTasks(false);
    localStorage.removeItem('user');
    localStorage.removeItem('isGuest');
  };

  const fetchPendingTasks = async (userId: number, isFromSocket = false) => {
    try {
      const res = await fetch(`/api/assigned-tasks/pending-count?employee_id=${userId}`);
      const data = await res.json();
      
      setPendingTasks(prev => {
        // Only trigger "new" notification state if the count increased or titles changed
        const isActuallyNew = !prev || 
          data.count > prev.count || 
          JSON.stringify(data.titles) !== JSON.stringify(prev.titles);

        if (data.count > 0) {
          if (isActuallyNew && isFromSocket) {
            setHasDismissedTasks(false); // Only reset dismissal if it's actually a new/different task set
            
            // Browser Notification
            if (notificationsEnabled && 'Notification' in window && Notification.permission === 'granted') {
              new Notification('Nhiệm vụ mới!', {
                body: `Bạn có ${data.count} nhiệm vụ chưa hoàn thành.`,
                icon: '/favicon.ico'
              });
            }
          }
          return data;
        }
        return null;
      });
    } catch (err) {
      console.error('Error fetching pending tasks:', err);
    }
  };

  const currentRole: Role = user ? user.role : 'Nhân viên';

  const isLoggingInAsAdmin = loginCode.trim().toLowerCase() === 'admin' || 
    employees?.find(e => e.code.trim().toLowerCase() === loginCode.trim().toLowerCase())?.role.toLowerCase() === 'admin';

  if (showLogin) {
    const isDataEmpty = !employees || employees.length <= 1;

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-100">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">Lịch Làm Việc</h1>
            <p className="text-slate-500 mt-1 text-sm">Đăng nhập để xem và quản lý lịch</p>
          </div>

          {/* Cảnh báo & hướng dẫn nạp lại dữ liệu khi hệ thống vừa khởi động lại */}
          {isDataEmpty && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-left animate-in fade-in duration-200">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-xs mb-1">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Chưa có dữ liệu hoặc máy chủ vừa khởi động lại</span>
              </div>
              <p className="text-xs text-slate-600 mb-3 leading-relaxed">
                Hệ thống chưa kết nối dữ liệu Google Sheets. Bạn có thể bấm nút bên dưới để dán link và tải dữ liệu ngay:
              </p>
              <button
                type="button"
                onClick={() => {
                  setSheetsUrlInput(localStorage.getItem('GOOGLE_SHEETS_URL') || '');
                  setConnectMsg(null);
                  setShowConnectModal(true);
                }}
                className="w-full flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-colors shadow-sm"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Cấu hình & Kết nối Google Sheet ngay</span>
              </button>
            </div>
          )}

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

          {/* Nút mở modal cấu hình dữ liệu */}
          <div className="mt-5 pt-4 border-t border-slate-100 text-center">
            <button
              type="button"
              onClick={() => {
                setSheetsUrlInput(localStorage.getItem('GOOGLE_SHEETS_URL') || '');
                setConnectMsg(null);
                setShowConnectModal(true);
              }}
              className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-semibold transition-colors py-1 px-2 rounded-lg hover:bg-indigo-50"
            >
              <LinkIcon className="w-3.5 h-3.5" />
              <span>Cấu hình / Kết nối lại dữ liệu Google Sheet</span>
            </button>
          </div>
        </div>

        {/* Modal Cấu hình link Google Sheets */}
        {showConnectModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[300] p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-200 border border-slate-100">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center font-bold">
                    <RefreshCw className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">Kết nối Google Sheets</h3>
                    <p className="text-xs text-slate-500">Đồng bộ 2 chiều nhân viên & lịch làm việc</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowConnectModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200/50 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleConnectSheets} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Đường dẫn Google Sheets Web App URL
                  </label>
                  <input
                    type="text"
                    value={sheetsUrlInput}
                    onChange={(e) => setSheetsUrlInput(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  />
                  <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                    Dán URL Web App triển khai từ Google Apps Script (kết thúc bằng <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-indigo-600">/exec</code>). Toàn bộ danh sách nhân viên, ngày vào làm/nghỉ việc và lịch làm việc sẽ được nạp lại tức thì.
                  </p>
                </div>

                {connectMsg && (
                  <div className={`p-3.5 rounded-xl border text-xs font-medium flex items-start gap-2.5 ${
                    connectMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                    connectMsg.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' :
                    'bg-indigo-50 border-indigo-200 text-indigo-800'
                  }`}>
                    {connectMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" /> :
                     connectMsg.type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" /> :
                     <RefreshCw className="w-4 h-4 shrink-0 text-indigo-600 mt-0.5 animate-spin" />}
                    <span className="flex-1 leading-relaxed">{connectMsg.text}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowConnectModal(false)}
                    className="px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-medium transition-colors"
                  >
                    Đóng
                  </button>
                  <button
                    type="submit"
                    disabled={connectLoading}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 shadow-sm"
                  >
                    <RefreshCw className={`w-4 h-4 ${connectLoading ? 'animate-spin' : ''}`} />
                    <span>{connectLoading ? 'Đang tải dữ liệu...' : 'Lưu & Nạp dữ liệu'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
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
                {(currentRole === 'Admin' || currentRole === 'Tổ trưởng') && (
                  <Link to="/announcements" className="flex-1 md:flex-none flex flex-col md:flex-row items-center gap-1 md:gap-3 p-2 md:p-3 rounded-xl hover:bg-slate-50 text-slate-700 hover:text-indigo-600 transition-colors">
                    <Info className="w-5 h-5" />
                    <span className="text-[10px] md:text-sm font-medium">Thông Báo & Nhiệm Vụ</span>
                  </Link>
                )}
                {currentRole === 'Nhân viên' && (
                   <Link to="/announcements" className="flex-1 md:flex-none flex flex-col md:flex-row items-center gap-1 md:gap-3 p-2 md:p-3 rounded-xl hover:bg-slate-50 text-slate-700 hover:text-indigo-600 transition-colors">
                    <Info className="w-5 h-5" />
                    <span className="text-[10px] md:text-sm font-medium">Thông Báo & Nhiệm Vụ</span>
                  </Link>
                )}
                {currentRole === 'Admin' && (
                  <Link to="/employees" className="flex-1 md:flex-none flex flex-col md:flex-row items-center gap-1 md:gap-3 p-2 md:p-3 rounded-xl hover:bg-slate-50 text-slate-700 hover:text-indigo-600 transition-colors">
                    <Users className="w-5 h-5" />
                    <span className="text-[10px] md:text-sm font-medium">Nhân sự / Staff</span>
                  </Link>
                )}
              </>
            )}

            {/* Cài đặt & Hướng dẫn: Khách và mọi người dùng đều truy cập được */}
            <Link to="/settings" className="flex-1 md:flex-none flex flex-col md:flex-row items-center gap-1 md:gap-3 p-2 md:p-3 rounded-xl hover:bg-slate-50 text-slate-700 hover:text-indigo-600 transition-colors">
              <SettingsIcon className="w-5 h-5" />
              <span className="text-[10px] md:text-sm font-medium">Cài đặt / Settings</span>
            </Link>
            <Link to="/guide" className="flex-1 md:flex-none flex flex-col md:flex-row items-center gap-1 md:gap-3 p-2 md:p-3 rounded-xl hover:bg-slate-50 text-slate-700 hover:text-indigo-600 transition-colors">
              <BookOpen className="w-5 h-5" />
              <span className="text-[10px] md:text-sm font-medium">HDSD / Guide</span>
            </Link>
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
          {pendingTasks && !hasDismissedTasks && (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-300 border-t-8 border-indigo-600">
                <div className="p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center">
                      <Info className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Nhiệm vụ mới!</h3>
                      <p className="text-sm text-slate-500">Bạn có {pendingTasks.count} nhiệm vụ chưa hoàn thành</p>
                    </div>
                  </div>
                  
                  <div className="space-y-2 mb-6 max-h-48 overflow-y-auto">
                    {pendingTasks.titles.map((title, i) => (
                      <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-sm font-bold text-slate-700">
                        • {title}
                      </div>
                    ))}
                  </div>
                  
                  <button 
                    onClick={() => setHasDismissedTasks(true)}
                    className="w-full py-3 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                  >
                    Đã hiểu
                  </button>
                </div>
              </div>
            </div>
          )}
          <Routes>
            <Route path="/" element={<ScheduleView user={user} />} />
            <Route path="/guide" element={<Guide />} />
            <Route path="/settings" element={
              <Settings 
                role={currentRole} 
                user={user} 
                notificationsEnabled={notificationsEnabled}
                setNotificationsEnabled={(val) => {
                  setNotificationsEnabled(val);
                  localStorage.setItem('notifications_enabled', String(val));
                }}
              />
            } />
            {!isGuest && (
              <>
                <Route path="/leave" element={<LeaveRequests user={user} />} />
                <Route path="/announcements" element={<AnnouncementsAndTasks user={user} />} />
                {currentRole === 'Admin' && <Route path="/employees" element={<EmployeeList role={currentRole} />} />}
              </>
            )}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
