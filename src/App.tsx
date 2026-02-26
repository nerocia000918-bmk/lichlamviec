/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import { Calendar, Users, BookOpen, LogOut, User as UserIcon, Settings as SettingsIcon, CalendarMinus, Info } from 'lucide-react';
import ScheduleView from './pages/ScheduleView';
import EmployeeList from './pages/EmployeeList';
import Guide from './pages/Guide';
import Settings from './pages/Settings';
import LeaveRequests from './pages/LeaveRequests';
import Announcements from './pages/Announcements';
import { io } from 'socket.io-client';

export const socket = io();

export type Role = 'Admin' | 'Tổ trưởng' | 'Nhân viên';

export interface User {
  id: number;
  code: string;
  name: string;
  department: string;
  role: Role;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [showLogin, setShowLogin] = useState(true);
  const [loginCode, setLoginCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [employees, setEmployees] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/employees')
      .then(res => res.json())
      .then(data => setEmployees(data))
      .catch(() => {});

    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
      setShowLogin(false);
    } else {
      const guest = localStorage.getItem('isGuest');
      if (guest) {
        setIsGuest(true);
        setShowLogin(false);
      }
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!loginCode.trim()) {
      setIsGuest(true);
      setShowLogin(false);
      localStorage.setItem('isGuest', 'true');
      return;
    }

    try {
      const res = await fetch('/api/employees');
      const employees: any[] = await res.json();
      const foundUser = employees.find(emp => emp.code.trim().toLowerCase() === loginCode.trim().toLowerCase());
      
      if (foundUser) {
        // Admin requires password
        if (foundUser.role.toLowerCase() === 'admin') {
          if (!password) {
            setError('Admin yêu cầu mật khẩu!');
            return;
          }
          if (foundUser.password !== password) {
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
      } else {
        setError(`Mã nhân viên "${loginCode}" không tồn tại trong hệ thống! Hãy kiểm tra lại cột code trong Google Sheet.`);
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
    localStorage.removeItem('user');
    localStorage.removeItem('isGuest');
  };

  const currentRole: Role = user ? user.role : 'Nhân viên';

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
                onChange={(e) => setLoginCode(e.target.value)}
                placeholder="VD: NV001 (Bỏ trống để xem với tư cách Khách)"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              />
            </div>

            {loginCode.trim().toLowerCase() === 'admin' || employees?.find(e => e.code.toLowerCase() === loginCode.trim().toLowerCase())?.role.toLowerCase() === 'admin' ? (
              <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                <label className="block text-sm font-medium text-slate-700 mb-1">Mật khẩu (Chỉ dành cho Admin)</label>
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mật khẩu mặc định: 1234"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                />
              </div>
            ) : null}

            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            
            <button 
              type="submit"
              className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
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
                {(currentRole === 'Admin' || currentRole === 'Tổ trưởng') && (
                  <Link to="/announcements" className="flex-1 md:flex-none flex flex-col md:flex-row items-center gap-1 md:gap-3 p-2 md:p-3 rounded-xl hover:bg-slate-50 text-slate-700 hover:text-indigo-600 transition-colors">
                    <Info className="w-5 h-5" />
                    <span className="text-[10px] md:text-sm font-medium">Thông báo</span>
                  </Link>
                )}
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
          <Routes>
            <Route path="/" element={<ScheduleView user={user} />} />
            {!isGuest && (
              <>
                <Route path="/leave" element={<LeaveRequests user={user} />} />
                <Route path="/announcements" element={<Announcements user={user} />} />
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
