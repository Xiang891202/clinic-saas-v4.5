-- =============================================
-- Phase 1 完整 Schema (v4.6)
-- 建立時間: 2026-06-23
-- 包含: 租戶、服務、醫師、時段、預約、冷卻期測試資料
-- =============================================

-- 啟用擴展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. 租戶
INSERT INTO tenants (id, name, status) 
VALUES ('550e8400-e29b-41d4-a716-446655440000', '測試診所', 'active')
ON CONFLICT (id) DO NOTHING;

-- 2. 服務 (含冷卻期設定)
INSERT INTO services (id, tenant_id, name, duration_minutes, is_active, strict_cooldown_days) VALUES
('11111111-1111-1111-1111-111111111111', '550e8400-e29b-41d4-a716-446655440000', '一般門診', 30, true, 0),
('22222222-2222-2222-2222-222222222222', '550e8400-e29b-41d4-a716-446655440000', '牙科洗牙', 60, true, 30),
('33333333-3333-3333-3333-333333333333', '550e8400-e29b-41d4-a716-446655440000', '復健治療', 45, true, 7)
ON CONFLICT (id) DO NOTHING;

-- 3. 醫師
INSERT INTO doctors (id, tenant_id, location_id, name, is_active) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '550e8400-e29b-41d4-a716-446655440000', NULL, '王醫師', true),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '550e8400-e29b-41d4-a716-446655440000', NULL, '李醫師', true)
ON CONFLICT (id) DO NOTHING;

-- 4. 時段 (slot_instances)
INSERT INTO slot_instances (
  id, tenant_id, slot_date, start_time, end_time, 
  max_capacity, booked_count, status, 
  doctor_id, service_id, version
) VALUES
  (gen_random_uuid(), '550e8400-e29b-41d4-a716-446655440000', '2026-07-01', '09:00:00', '09:30:00', 5, 0, 'open', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 1),
  (gen_random_uuid(), '550e8400-e29b-41d4-a716-446655440000', '2026-07-01', '10:00:00', '10:30:00', 5, 0, 'open', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 1),
  (gen_random_uuid(), '550e8400-e29b-41d4-a716-446655440000', '2026-07-01', '14:00:00', '15:00:00', 3, 0, 'open', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 1),
  (gen_random_uuid(), '550e8400-e29b-41d4-a716-446655440000', '2026-07-01', '15:30:00', '16:30:00', 3, 0, 'open', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 1),
  (gen_random_uuid(), '550e8400-e29b-41d4-a716-446655440000', '2026-07-01', '09:30:00', '10:15:00', 4, 2, 'open', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 1),
  (gen_random_uuid(), '550e8400-e29b-41d4-a716-446655440000', '2026-07-01', '11:00:00', '11:45:00', 4, 0, 'open', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 1);

-- 5. 測試病人
INSERT INTO patients (id, tenant_id, name_given, name_family, line_user_id)
VALUES (gen_random_uuid(), '550e8400-e29b-41d4-a716-446655440000', '測試', '病人', 'line_test_user_123')
ON CONFLICT (line_user_id) DO NOTHING;

-- 6. 取得病人 ID 並建立近期預約 (觸發冷卻期)
DO $$
DECLARE
  patient_id UUID;
BEGIN
  SELECT id INTO patient_id FROM patients WHERE line_user_id = 'line_test_user_123' LIMIT 1;
  IF patient_id IS NOT NULL THEN
    INSERT INTO booking_events (id, tenant_id, patient_id, service_id, doctor_id, status, source, created_at)
    VALUES (gen_random_uuid(), '550e8400-e29b-41d4-a716-446655440000', patient_id, '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'completed', 'web', '2026-06-20 10:00:00')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
