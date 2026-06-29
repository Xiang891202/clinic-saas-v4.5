// frontend/src/types/clinic.ts
export interface Clinic {
  id: string;
  name: string;
  public_code: string;
}

export interface AuthRequest {
  email: string;
  otp?: string;
  clinic_code?: string;
}

export interface SendOtpRequest {
  email: string;
  clinic_code: string;
}