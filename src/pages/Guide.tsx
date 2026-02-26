import { BookOpen, Calendar, ShieldAlert, Users } from 'lucide-react';

export default function Guide() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-slate-800 mb-2">Hướng dẫn sử dụng / User Guide</h2>
        <p className="text-slate-500 text-lg">Hệ thống quản lý thời khóa biểu thời gian thực</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-4">
            <Calendar className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-3">1. Xem & Xếp Lịch</h3>
          <ul className="space-y-3 text-slate-600">
            <li className="flex gap-2"><span className="text-indigo-500 font-bold">•</span> <b>View Máy tính:</b> Dạng bảng lưới (Table) giúp bao quát toàn bộ chi nhánh.</li>
            <li className="flex gap-2"><span className="text-indigo-500 font-bold">•</span> <b>View Điện thoại:</b> Dạng danh sách dọc (Card view) tối ưu cho cá nhân.</li>
            <li className="flex gap-2"><span className="text-indigo-500 font-bold">•</span> <b>Đổi ca:</b> Bấm vào ô lịch của nhân viên để chọn ca làm và nhiệm vụ.</li>
            <li className="flex gap-2"><span className="text-indigo-500 font-bold">•</span> <b>Copy lịch:</b> Dùng nút "Copy tuần trước" để tạo nhanh lịch mới.</li>
          </ul>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-4">
            <Users className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-3">2. Quản lý Nhân sự</h3>
          <ul className="space-y-3 text-slate-600">
            <li className="flex gap-2"><span className="text-emerald-500 font-bold">•</span> <b>Thêm mới:</b> Admin có thể thêm nhân viên mới trực tiếp trên App.</li>
            <li className="flex gap-2"><span className="text-emerald-500 font-bold">•</span> <b>Bộ phận:</b> Chọn sẵn từ danh sách (Dropdown) để tránh sai chính tả.</li>
            <li className="flex gap-2"><span className="text-emerald-500 font-bold">•</span> <b>Tìm kiếm:</b> Dễ dàng lọc nhân viên theo tên, mã NV hoặc bộ phận.</li>
          </ul>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center mb-4">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-3">3. Phân quyền & Khóa dữ liệu</h3>
          <ul className="space-y-3 text-slate-600">
            <li className="flex gap-2"><span className="text-amber-500 font-bold">•</span> <b>Admin:</b> Toàn quyền sửa lịch, thêm nhân viên, chốt sổ tháng.</li>
            <li className="flex gap-2"><span className="text-amber-500 font-bold">•</span> <b>Tổ trưởng:</b> Chỉ được sửa lịch của nhân viên trong bộ phận mình.</li>
            <li className="flex gap-2"><span className="text-amber-500 font-bold">•</span> <b>Nhân viên:</b> Chỉ xem lịch, không được phép chỉnh sửa.</li>
            <li className="flex gap-2"><span className="text-amber-500 font-bold">•</span> <b>Khóa 24h:</b> Không được sửa ca làm nếu còn dưới 24h trước giờ bắt đầu.</li>
          </ul>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center mb-4">
            <BookOpen className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-3">4. Quy định Màu sắc</h3>
          <ul className="space-y-3 text-slate-600">
            <li className="flex items-center gap-3">
              <div className="w-6 h-6 rounded bg-[#fef08a] border border-yellow-300"></div>
              <span><b>OFF:</b> Nghỉ phép / Không lương</span>
            </li>
            <li className="flex items-center gap-3">
              <div className="w-6 h-6 rounded bg-[#ef4444] border border-red-500"></div>
              <span><b>Tăng ca:</b> Full 8:30 - 21:00</span>
            </li>
            <li className="flex items-center gap-3">
              <div className="w-6 h-6 rounded bg-[#d6c4b5] border border-[#c2b0a1]"></div>
              <span><b>Ca Lỡ:</b> Nâu cà phê nhạt</span>
            </li>
            <li className="flex items-center gap-3">
              <div className="w-6 h-6 rounded bg-[#4c1d95] border border-purple-900"></div>
              <span><b>Trực cửa:</b> Tím đậm (Nhiệm vụ)</span>
            </li>
            <li className="flex items-center gap-3">
              <div className="w-6 h-6 rounded bg-[#16a34a] border border-green-600"></div>
              <span><b>Hotline:</b> Xanh lá (Nhiệm vụ)</span>
            </li>
            <li className="flex items-center gap-3">
              <div className="w-6 h-6 rounded bg-[#2dd4bf] border border-teal-400"></div>
              <span><b>Vệ sinh:</b> Xanh ngọc (Nhiệm vụ)</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
