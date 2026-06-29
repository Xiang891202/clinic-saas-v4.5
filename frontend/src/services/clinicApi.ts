// frontend/src/services/clinicApi.ts
import { Clinic } from '../types/clinic.js';

const API_BASE = import.meta.env.VITE_API_BASE || '';

export const clinicApi = {
  /**
   * 取得所有啟用中的診所列表
   */
  async getClinics(): Promise<Clinic[]> {
    const response = await fetch(`${API_BASE}/api/public/clinics`);
    if (!response.ok) {
      throw new Error('取得診所列表失敗');
    }
    const result = await response.json();
    return result.data || [];
  },
};