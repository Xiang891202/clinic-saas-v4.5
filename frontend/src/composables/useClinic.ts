// frontend/src/composables/useClinic.ts
import { ref, onMounted, computed } from 'vue';
import { clinicApi } from '../services/clinicApi.js';
import { Clinic } from '../types/clinic.js';

export function useClinic() {
  const clinics = ref<Clinic[]>([]);
  const selectedClinic = ref<Clinic | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  /**
   * 載入診所列表
   */
  const loadClinics = async () => {
    isLoading.value = true;
    error.value = null;
    try {
      clinics.value = await clinicApi.getClinics();
      
      // 從 URL 參數讀取 ?c=xxx
      const urlParams = new URLSearchParams(window.location.search);
      const clinicCode = urlParams.get('c');
      
      if (clinicCode) {
        const matched = clinics.value.find(c => c.public_code === clinicCode);
        if (matched) {
          selectedClinic.value = matched;
        } else {
          error.value = '診所代碼無效，請重新選擇';
        }
      }
    } catch (err: any) {
      error.value = err.message || '載入診所列表失敗';
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * 選擇診所
   */
  const selectClinic = (clinic: Clinic) => {
    selectedClinic.value = clinic;
    error.value = null;
  };

  /**
   * 取得目前選擇的診所代碼
   */
  const getClinicCode = (): string | undefined => {
    return selectedClinic.value?.public_code;
  };

  // 自動載入
  onMounted(() => {
    loadClinics();
  });

  return {
    clinics,
    selectedClinic,
    isLoading,
    error,
    loadClinics,
    selectClinic,
    getClinicCode,
  };
}