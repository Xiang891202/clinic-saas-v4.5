// src/services/__tests__/ClinicAuthService.test.ts
import { jest, describe, beforeEach, it, expect } from '@jest/globals';
import { ClinicAuthService } from '../ClinicAuthService';
import { SupabaseClient } from '@supabase/supabase-js';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(),
}));

// 导入 bcrypt 和 jwt（它们在 mock 之后导入）
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

describe('ClinicAuthService', () => {
  let mockSupabase: any;
  let authService: any;
  let mockChain: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
    };

    mockSupabase = {
      from: jest.fn().mockReturnValue(mockChain),
    };

    authService = new ClinicAuthService(mockSupabase);
    process.env.JWT_SECRET = 'test-secret';
  });

  describe('login', () => {
    const email = 'admin@clinic.com';
    const password = 'password123';

    it('should throw if email or password missing', async () => {
      await expect(authService.login('', password)).rejects.toThrow('Email 和密碼為必填');
      await expect(authService.login(email, '')).rejects.toThrow('Email 和密碼為必填');
    });

    it('should throw if user not found', async () => {
      mockChain.single.mockResolvedValue({ data: null, error: { message: 'Not found' } });
      await expect(authService.login(email, password)).rejects.toThrow('帳號或密碼錯誤');
    });

    it('should throw if password incorrect', async () => {
      const mockUser = {
        id: 'user-123',
        email,
        password_hash: 'hashed',
        role: 'clinic_admin',
        tenant_id: 'tenant-123',
      };
      mockChain.single.mockResolvedValue({ data: mockUser, error: null });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(authService.login(email, password)).rejects.toThrow('帳號或密碼錯誤');
      expect(bcrypt.compare).toHaveBeenCalledWith(password, mockUser.password_hash);
    });

    it('should return token on success', async () => {
      const mockUser = {
        id: 'user-123',
        email,
        password_hash: 'hashed',
        role: 'clinic_admin',
        tenant_id: 'tenant-123',
      };
      const mockToken = 'jwt-token-123';

      mockChain.single.mockResolvedValue({ data: mockUser, error: null });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (jwt.sign as jest.Mock).mockReturnValue(mockToken);

      const result = await authService.login(email, password);

      expect(result).toEqual({
        success: true,
        data: {
          token: mockToken,
          user: {
            id: mockUser.id,
            email: mockUser.email,
            role: mockUser.role,
            tenant_id: mockUser.tenant_id,
          },
        },
      });
    });
  });
});