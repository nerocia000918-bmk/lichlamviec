export type Role = 'Admin' | 'Tổ trưởng' | 'Nhân viên';

export interface User {
  id: number;
  code: string;
  name: string;
  department: string;
  role: Role;
}
