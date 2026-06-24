-- Supabase 預設已啟用 uuid-ossp，這行只是確認
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 第二段：租戶與使用者 --
CREATE TABLE tenants ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name TEXT NOT NULL, status TEXT DEFAULT 'active', notification_templates JSONB DEFAULT '{}', line_limit INTEGER DEFAULT 2000, email_limit INTEGER DEFAULT 500, bank_transfer_enabled BOOLEAN DEFAULT false, tax_id TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now() );

CREATE TABLE users ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, email TEXT UNIQUE NOT NULL, password_hash TEXT, role TEXT NOT NULL CHECK (role IN ('admin','clinic_admin','staff','doctor')), doctor_id UUID, line_user_id TEXT, location_permissions UUID[], created_at TIMESTAMPTZ DEFAULT now() );

-- 第三段：病人表（FHIR）--
CREATE TABLE patients ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, identifier TEXT UNIQUE, name_given TEXT NOT NULL, name_family TEXT NOT NULL, telecom_phone TEXT, telecom_email TEXT, gender TEXT CHECK (gender IN ('male','female','other','unknown')), birth_date DATE, email_verified BOOLEAN DEFAULT false, line_user_id TEXT UNIQUE, ical_uuid UUID DEFAULT uuid_generate_v4(), google_refresh_token TEXT, google_calendar_synced BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now() );

-- 第四段：方案與訂閱 --
CREATE TABLE plans ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name TEXT NOT NULL, features JSONB DEFAULT '{}', stripe_price_id TEXT, ecpay_plan_id TEXT, created_at TIMESTAMPTZ DEFAULT now() );

CREATE TABLE plan_addons ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), module_code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, price_monthly INTEGER, price_once INTEGER, feature_key TEXT );

CREATE TABLE subscriptions ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, plan_id UUID REFERENCES plans(id), status TEXT DEFAULT 'active', billing_day INTEGER NOT NULL, current_period_start TIMESTAMPTZ, current_period_end TIMESTAMPTZ, next_billing_date TIMESTAMPTZ, retry_count INTEGER DEFAULT 0, failed_reason TEXT, created_at TIMESTAMPTZ DEFAULT now() );

CREATE TABLE tenant_addons ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, module_code TEXT REFERENCES plan_addons(module_code), status TEXT DEFAULT 'active', started_at TIMESTAMPTZ, expires_at TIMESTAMPTZ );

-- 第五段：合約 --
CREATE TABLE contract_templates ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name TEXT NOT NULL, content TEXT NOT NULL, is_default BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now() );

CREATE TABLE contracts ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, template_id UUID REFERENCES contract_templates(id), status TEXT DEFAULT 'draft' CHECK (status IN ('draft','pending_sign','signed','pending_payment','active','expired','superseded','suspended','cancelled')), payment_method TEXT CHECK (payment_method IN ('credit_card','bank_transfer')), setup_fee INTEGER, first_month_fee INTEGER, first_month_days INTEGER, first_period_start TIMESTAMPTZ, first_period_end TIMESTAMPTZ, total_first_payment INTEGER, regular_monthly_fee INTEGER, first_billing_date TIMESTAMPTZ, signer_name TEXT, signer_id_number TEXT, signed_at TIMESTAMPTZ, document_url TEXT, signature_hash TEXT, signature_ip TEXT, auto_renew BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT now() );

CREATE TABLE signup_links ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE, token TEXT UNIQUE NOT NULL, expires_at TIMESTAMPTZ, used_at TIMESTAMPTZ );

CREATE TABLE payment_links ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE, token TEXT UNIQUE NOT NULL, amount INTEGER, expires_at TIMESTAMPTZ, used_at TIMESTAMPTZ );

-- 第六段：診所業務 --
CREATE TABLE locations ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, name TEXT NOT NULL, address TEXT, phone TEXT, created_at TIMESTAMPTZ DEFAULT now() );

CREATE TABLE doctors ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, location_id UUID REFERENCES locations(id), name TEXT NOT NULL, specialty TEXT, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT now() );

CREATE TABLE services ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, name TEXT NOT NULL, duration_minutes INTEGER NOT NULL, is_active BOOLEAN DEFAULT true, is_recurring BOOLEAN DEFAULT false, recurrence_interval_days INTEGER, strict_cooldown_days INTEGER DEFAULT 0, reminder_lead_days INTEGER DEFAULT 1, requires_deposit BOOLEAN DEFAULT false, deposit_amount INTEGER, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now() );

CREATE TABLE booking_slots ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, location_id UUID REFERENCES locations(id), doctor_id UUID REFERENCES doctors(id), service_id UUID REFERENCES services(id), day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6), start_time TIME, end_time TIME, max_capacity INTEGER DEFAULT 1, created_at TIMESTAMPTZ DEFAULT now() );

CREATE TABLE slot_instances ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, booking_slot_id UUID REFERENCES booking_slots(id), location_id UUID REFERENCES locations(id), slot_date DATE NOT NULL, start_time TIME, end_time TIME, max_capacity INTEGER DEFAULT 1, booked_count INTEGER DEFAULT 0, status TEXT DEFAULT 'open' CHECK (status IN ('open','locked','closed')), version INTEGER DEFAULT 1, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now() );

-- 第七段：預約與通知（含 v4.5 冪等性欄位）--
CREATE TABLE booking_events ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, slot_instance_id UUID REFERENCES slot_instances(id), patient_id UUID REFERENCES patients(id), service_id UUID REFERENCES services(id), location_id UUID REFERENCES locations(id), doctor_id UUID REFERENCES doctors(id), status TEXT DEFAULT 'booked' CHECK (status IN ('booked','arrived','cancelled','noshow','completed')), source TEXT DEFAULT 'web', previous_appointment_id UUID REFERENCES booking_events(id), next_suggested_date DATE, recurrence_token UUID, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now() );

CREATE TABLE notification_logs ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, booking_event_id UUID REFERENCES booking_events(id), channel TEXT CHECK (channel IN ('line','email','push')), status TEXT CHECK (status IN ('sent','failed','fallback')), detail JSONB, idempotency_key TEXT UNIQUE, created_at TIMESTAMPTZ DEFAULT now() );

CREATE UNIQUE INDEX idx_notification_logs_unique ON notification_logs (booking_event_id, channel);

CREATE TABLE notification_usage ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, year_month TEXT NOT NULL, channel TEXT CHECK (channel IN ('line','email')), sent_count INTEGER DEFAULT 0, failed_count INTEGER DEFAULT 0, fallback_count INTEGER DEFAULT 0, updated_at TIMESTAMPTZ DEFAULT now() );

-- 第八段：金流 --
CREATE TABLE payments ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, provider TEXT CHECK (provider IN ('stripe','ecpay','manual','bank_transfer')), provider_event_id TEXT UNIQUE, amount INTEGER NOT NULL, status TEXT DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','confirmed')), type TEXT DEFAULT 'subscription' CHECK (type IN ('subscription','deposit','setup_fee')), metadata JSONB, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now() );

CREATE TABLE billing_events ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, event_type TEXT, provider_event_id TEXT UNIQUE, payload JSONB, processed BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now() );

CREATE TABLE platform_bank_accounts ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), bank_name TEXT NOT NULL, account_number TEXT NOT NULL, status TEXT DEFAULT 'active' CHECK (status IN ('active','inactive')), deactivated_reason TEXT, created_at TIMESTAMPTZ DEFAULT now() );

CREATE TABLE tenant_bank_accounts ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, bank_name TEXT NOT NULL, account_number_encrypted TEXT NOT NULL, account_last_five TEXT, verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending','approved','rejected')), created_at TIMESTAMPTZ DEFAULT now() );

CREATE TABLE tenant_kyc_documents ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, document_type TEXT CHECK (document_type IN ('clinic_license','doctor_certificate','bank_passbook')), file_url TEXT NOT NULL, verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending','approved','rejected')), reviewed_by UUID REFERENCES users(id), reviewed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now() );

-- 第九段：安全、稽核、事故、降級 --
CREATE TABLE security_events ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, event_type TEXT, target_email TEXT, source_ip TEXT, created_at TIMESTAMPTZ DEFAULT now() );

CREATE TABLE audit_logs ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, actor_id UUID, actor_type TEXT, action TEXT, target_type TEXT, target_id UUID, old_value JSONB, new_value JSONB, ip_address TEXT, created_at TIMESTAMPTZ DEFAULT now() );

REVOKE DELETE, UPDATE ON audit_logs FROM PUBLIC;

CREATE TABLE conflict_resolutions ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), slot_instance_id UUID REFERENCES slot_instances(id), affected_booking_ids UUID[], status TEXT DEFAULT 'resolved', resolution_type TEXT, resolved_by UUID REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT now() );

CREATE TABLE incidents ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, incident_type TEXT CHECK (incident_type IN ('bank_freeze','fraud','system_outage')), freeze_start_date DATE, freeze_end_date DATE, freeze_days INTEGER, daily_average_loss INTEGER, total_loss INTEGER, status TEXT DEFAULT 'open', created_at TIMESTAMPTZ DEFAULT now() );

CREATE TABLE service_degradation ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), service_name TEXT NOT NULL CHECK (service_name IN ('line','google_calendar','stripe','email')), status TEXT DEFAULT 'active' CHECK (status IN ('active','degraded')), degraded_by TEXT CHECK (degraded_by IN ('manual','auto')), degraded_at TIMESTAMPTZ, degraded_reason TEXT, restored_at TIMESTAMPTZ, restored_by TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now() );

-- 第十段：系統監控與排程協調（v4.5 重點） --
CREATE TABLE reconcile_logs ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, action TEXT, target_table TEXT, target_id UUID, description TEXT, created_at TIMESTAMPTZ DEFAULT now() );

CREATE TABLE alert_config ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), enabled BOOLEAN DEFAULT true, emails TEXT[], channels TEXT[], rules JSONB, created_at TIMESTAMPTZ DEFAULT now() );

CREATE TABLE alert_history ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), alert_type TEXT, severity TEXT, title TEXT, current_value TEXT, threshold TEXT, detail JSONB, cooldown_until TIMESTAMPTZ, dismissed BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now() );

CREATE TABLE export_schedules ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, format TEXT, scope TEXT, frequency TEXT, time_of_day TIME, recipient_emails TEXT[], created_at TIMESTAMPTZ DEFAULT now() );

CREATE TABLE sla_metrics ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, metric_type TEXT, value NUMERIC, recorded_at TIMESTAMPTZ DEFAULT now() );

CREATE TABLE schedule_coordination_logs ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), job_id TEXT NOT NULL, job_name TEXT NOT NULL, trigger_source TEXT CHECK (trigger_source IN ('cron','bull_repeatable','manual')), scheduled_time TIMESTAMPTZ NOT NULL, received_at TIMESTAMPTZ DEFAULT now(), dispatched_at TIMESTAMPTZ, executed_at TIMESTAMPTZ, result TEXT CHECK (result IN ('dispatched','skipped','executed','failed')), reason TEXT, created_at TIMESTAMPTZ DEFAULT now(), UNIQUE(job_id, scheduled_time, trigger_source) );

CREATE INDEX idx_schedule_coordination_job_time ON schedule_coordination_logs (job_id, scheduled_time DESC);

-- 第十一段：FHIR 模組 --
CREATE TABLE fhir_profiles ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name TEXT NOT NULL, is_default BOOLEAN DEFAULT false, config JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now() );

CREATE TABLE fhir_field_mappings ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), profile_id UUID REFERENCES fhir_profiles(id) ON DELETE CASCADE, resource_type TEXT NOT NULL, source_path TEXT NOT NULL, target_path TEXT NOT NULL, is_enabled BOOLEAN DEFAULT true, is_required BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(), UNIQUE(profile_id, resource_type, source_path) );

CREATE TABLE fhir_extensions ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), profile_id UUID REFERENCES fhir_profiles(id) ON DELETE CASCADE, url TEXT NOT NULL, source_field TEXT NOT NULL, fhir_path TEXT NOT NULL, is_enabled BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now() );

CREATE TABLE fhir_validation_logs ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), profile_id UUID REFERENCES fhir_profiles(id) ON DELETE SET NULL, resource_type TEXT NOT NULL, record_id UUID, status TEXT CHECK (status IN ('passed','failed')), errors JSONB, created_at TIMESTAMPTZ DEFAULT now() );

CREATE TABLE fhir_exports ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, profile_id UUID REFERENCES fhir_profiles(id), resource_type TEXT NOT NULL, export_url TEXT, created_at TIMESTAMPTZ DEFAULT now() );

-- 第十二段：預設資料 --
INSERT INTO fhir_profiles (name, is_default) VALUES ('Default R4', true);

WITH profile AS (SELECT id FROM fhir_profiles WHERE is_default = true LIMIT 1)
INSERT INTO fhir_field_mappings (profile_id, resource_type, source_path, target_path, is_required)
SELECT profile.id, 'Patient', 'patients.id', 'id', true FROM profile
UNION ALL SELECT profile.id, 'Patient', 'patients.identifier', 'identifier[0].value', false FROM profile
UNION ALL SELECT profile.id, 'Patient', 'patients.name_given', 'name[0].given[0]', true FROM profile
UNION ALL SELECT profile.id, 'Patient', 'patients.name_family', 'name[0].family', true FROM profile
UNION ALL SELECT profile.id, 'Patient', 'patients.telecom_phone', 'telecom[0].value', false FROM profile
UNION ALL SELECT profile.id, 'Patient', 'patients.telecom_email', 'telecom[1].value', false FROM profile
UNION ALL SELECT profile.id, 'Patient', 'patients.gender', 'gender', false FROM profile
UNION ALL SELECT profile.id, 'Patient', 'patients.birth_date', 'birthDate', false FROM profile;

INSERT INTO service_degradation (service_name, status) VALUES ('line','active'),('google_calendar','active'),('stripe','active'),('email','active');

-- 第十三段：啟用 RLS --
DO $$ DECLARE t text; BEGIN FOR t IN SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' LOOP EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t); END LOOP; END $$;