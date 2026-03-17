import React, { useState, useEffect } from 'react';
import { Role, socket } from '../App';
import { Search, UserPlus, Edit2, Trash2 } from 'lucide-react';

interface Employee {
  id: number;
  code: string;
  name: string;
  department: string;
  role: string;
  phone: string;
}

const DEPARTMENTS = ['Quản lý', 'Bán hàng', 'Thu ngân', 'Kỹ thuật', 'Giao vận', 'Kho'];
const ROLES = ['Admin', 'Tổ trưởng', 'Nhân viên'];

export default function EmployeeList({ role }: { role: Role }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ code: '', name: '', department: 'Bán hàng', role: 'Nhân viên', phone: '' });
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number, name: string } | null>(null);

  const fetchEmployees = async () => {
    const res = await fetch('/api/employees');
    const data = await res.json();
    setEmployees(data);
  };

  useEffect(() => {
    fetchEmployees();
    socket.on('employees:updated', fetchEmployees);
    return () => {
      socket.off('employees:updated', fetchEmployees);
    };
  }, []);

  const openAddForm = () => {
    setEditingId(null);
    setFormData({ code: '', name: '', department: 'Bán hàng', role: 'Nhân viên', phone: '' });
    setShowForm(true);
  };

  const openEditForm = (emp: Employee) => {
    setEditingId(emp.id);
    setFormData({ code: emp.code, name: emp.name, department: emp.department, role: emp.role, phone: emp.phone });
    setShowForm(true);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const res = await fetch(`/api/employees/${deleteConfirm.id}`, { method: 'DELETE' });
      if (!res.ok) {
        alert('Lỗi khi xóa nhân viên');
      }
    } catch (err) {
      alert('Lỗi kết nối');
    }
    setDeleteConfirm(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = editingId ? `/api/employees/${editingId}` : '/api/employees';
    const method = editingId ? 'PUT' : 'POST';
    
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    
    if (res.ok) {
      setShowForm(false);
    } else {
      const err = await res.json();
      alert(err.error);
    }
  };

  const filtered = employees
    .filter(e => 
      e.name.toLowerCase().includes(search.toLowerCase()) || 
      e.code.toLowerCase().includes(search.toLowerCase()) ||
      e.department.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const deptA = DEPARTMENTS.indexOf(a.department);
      const deptB = DEPARTMENTS.indexOf(b.department);
      if (deptA !== deptB) return (deptA === -1 ? 99 : deptA) - (deptB === -1 ? 99 : deptB);
      
      const roleA = ROLES.indexOf(a.role);
      const roleB = ROLES.indexOf(b.role);
      if (roleA !== roleB) return (roleA === -1 ? 99 : roleA) - (roleB === -1 ? 99 : roleB);
      
      return a.name.localeCompare(b.name);
    });

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Nhân sự / Staff</h2>
          <p className="text-slate-500">Quản lý danh sách nhân viên</p>
        </div>
        
        {role === 'Admin' && (
          <button 
            onClick={openAddForm}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            <span>Thêm nhân viên</span>
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
        <div className="p-4 border-b border-slate-100">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input 
              type="text" 
              placeholder="Tìm kiếm theo tên, mã NV, bộ phận..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
            />
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider">
                <th className="p-4 font-medium border-b border-slate-200">Mã NV</th>
                <th className="p-4 font-medium border-b border-slate-200">Họ tên</th>
                <th className="p-4 font-medium border-b border-slate-200">Bộ phận</th>
                <th className="p-4 font-medium border-b border-slate-200">Chức vụ</th>
                <th className="p-4 font-medium border-b border-slate-200">SĐT</th>
                {role === 'Admin' && <th className="p-4 font-medium border-b border-slate-200 text-right">Thao tác</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(emp => (
                <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-mono text-sm text-slate-600">{emp.code}</td>
                  <td className="p-4 font-medium text-slate-800">{emp.name}</td>
                  <td className="p-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                      {emp.department}
                    </span>
                  </td>
                  <td className="p-4 text-slate-600">{emp.role}</td>
                  <td className="p-4 text-slate-600">{emp.phone}</td>
                  {role === 'Admin' && (
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openEditForm(emp)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDeleteConfirm({ id: emp.id, name: emp.name })} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={role === 'Admin' ? 6 : 5} className="p-8 text-center text-slate-500">
                    Không tìm thấy nhân viên nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {filtered.map(emp => (
          <div key={emp.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="font-bold text-slate-800 text-lg">{emp.name}</div>
                <div className="text-sm text-slate-500 font-mono mt-0.5">{emp.code}</div>
              </div>
              {role === 'Admin' && (
                <div className="flex gap-1">
                  <button onClick={() => openEditForm(emp)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => setDeleteConfirm({ id: emp.id, name: emp.name })} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg font-medium">{emp.department}</span>
              <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg">{emp.role}</span>
              {emp.phone && <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg">{emp.phone}</span>}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center p-8 text-slate-500 bg-white rounded-2xl border border-slate-200">
            Không tìm thấy nhân viên nào.
          </div>
        )}
      </div>

      {/* Add/Edit Employee Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-800">
                {editingId ? 'Sửa thông tin nhân viên' : 'Thêm nhân viên mới'}
              </h3>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Mã NV</label>
                <input required type="text" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="VD: NV005" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Họ tên</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Nguyễn Văn A" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Bộ phận</label>
                <select value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})} className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Chức vụ</label>
                <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Số điện thoại</label>
                <input type="text" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                  Hủy
                </button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
                  {editingId ? 'Cập nhật' : 'Lưu nhân viên'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Xác nhận xóa</h3>
              <p className="text-slate-500 text-sm">
                Bạn có chắc muốn xóa nhân viên <strong className="text-slate-800">{deleteConfirm.name}</strong>? Toàn bộ lịch làm việc của nhân viên này cũng sẽ bị xóa vĩnh viễn.
              </p>
            </div>
            <div className="p-4 bg-slate-50 flex justify-end gap-3">
              <button 
                onClick={() => setDeleteConfirm(null)} 
                className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors font-medium"
              >
                Hủy
              </button>
              <button 
                onClick={handleDelete} 
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm font-medium"
              >
                Xóa nhân viên
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
