-- supabase/migrations/20260628000000_add_public_code_to_tenants.sql

-- 1. 新增 public_code 欄位
ALTER TABLE tenants
ADD COLUMN public_code TEXT UNIQUE;

-- 2. 為現有租戶產生 public_code（使用 UUID 前 8 碼 + 時間戳）
UPDATE tenants
SET public_code = 
  'clinic_' || 
  LEFT(REPLACE(gen_random_uuid()::TEXT, '-', ''), 8) ||
  '_' || 
  TO_CHAR(NOW(), 'YYMMDD');

-- 3. 設定為 NOT NULL（確保所有既有記錄都有值）
ALTER TABLE tenants
ALTER COLUMN public_code SET NOT NULL;

-- 4. 建立索引（加速查詢）
CREATE INDEX idx_tenants_public_code ON tenants(public_code);

-- 5. 加入註解
COMMENT ON COLUMN tenants.public_code IS '診所公開識別碼，用於病人端診所選擇與登入綁定';

-- 自動產生 public_code 的函數
CREATE OR REPLACE FUNCTION generate_public_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.public_code IS NULL THEN
    NEW.public_code := 'clinic_' || 
      LEFT(REPLACE(gen_random_uuid()::TEXT, '-', ''), 8) ||
      '_' || 
      TO_CHAR(NOW(), 'YYMMDD');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 建立 Trigger
CREATE TRIGGER set_public_code_before_insert
BEFORE INSERT ON tenants
FOR EACH ROW
EXECUTE FUNCTION generate_public_code();