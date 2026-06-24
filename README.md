# 🏥 SaaS 診所預約系統 (v4.6) — 開發啟動指南

本文件記錄專案開發環境的完整啟動流程，包含資料庫、後端 API、Worker、Cron、前端 UI 與 ngrok 的啟動指令。

---

## 📦 前置需求

請確認已安裝以下工具：

- **Node.js** (v20 以上)
- **npm** (隨 Node.js 安裝)
- **pnpm** (v8 以上)
- **Docker** (用於本地 Redis)
- **Supabase 帳號** (雲端資料庫)
- **Upstash Redis** (已建立免費資料庫)
- **ngrok** (選用，用於 LINE LIFF 本地測試)

---

## 🔧 1. 環境變數設定

### 1.1 複製環境變數範本

```bash
# 在專案根目錄執行
cp backend/.env.example backend/.env
# 若沒有 .env.example，請手動建立 backend/.env
1.2 填入必要的環境變數
backend/.env 內容範例：

env
# Supabase
SUPABASE_URL=https://你的專案.supabase.co
SUPABASE_SERVICE_ROLE_KEY=你的_service_role_key

# Redis (Upstash)
REDIS_URL=rediss://default:你的密碼@主機.upstash.io:6379

# JWT
JWT_SECRET=請換成一串隨機的32位以上字串

# SMTP (Email 發送)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=你的gmail@gmail.com
SMTP_PASS=你的應用程式密碼

# LINE (選用，僅在啟用 LINE 通知時需要)
LINE_CHANNEL_SECRET=你的LINE_Channel_Secret
LINE_CHANNEL_ACCESS_TOKEN=你的LINE_Access_Token

# LINE Login (選用，僅在啟用 LIFF 登入時需要)
LINE_LOGIN_CHANNEL_ID=你的LINE_Login_Channel_ID
LINE_LOGIN_CHANNEL_SECRET=你的LINE_Login_Channel_Secret
LIFF_ID=你的_LIFF_ID

# 功能開關
LINE_REMINDER_ENABLED=false
RECONCILE_ENABLED=false
ALERT_ENABLED=true
GOOGLE_API_RATE_LIMIT=10
🗄️ 2. 資料庫初始化
2.1 啟動本地 Redis (Docker)
bash
docker-compose up -d
如果你使用 Upstash 雲端 Redis，可以跳過此步驟。

2.2 執行 Migration
登入 Supabase Dashboard → SQL Editor，貼上 /supabase/migrations/ 中的 SQL 檔案並執行。

🔧 3. 安裝依賴
bash
# 在專案根目錄執行
pnpm install
🚀 4. 啟動所有服務
4.1 後端 API (Backend)
bash
cd backend
npm exec tsx watch src/index.ts
啟動成功後，會顯示：

text
🚀 後端伺服器 (v4.6 Phase 1) 已啟動 -> http://localhost:3000
📌 測試時段查詢: http://localhost:3000/api/booking/slots?date=2026-07-01
📌 建立預約: POST http://localhost:3000/api/booking/appointments
4.2 Worker (BullMQ 通知處理)
bash
cd apps/worker
npm exec tsx watch src/index.ts
啟動成功後，會顯示：

text
🚀 Worker 已啟動，監聽 notification.queue
4.3 Cron (排程任務)
bash
cd apps/cron
npm exec tsx watch src/index.ts
啟動成功後，會顯示：

text
🕐 Cron 已啟動，每日 02:00 自動生成時段
🔄 開始生成未來 7 天的時段...
✅ 完成！共建立 X 個時段
4.4 前端 (Frontend)
bash
cd frontend
npm run dev -- --port 5174
啟動成功後，會顯示：

text
VITE v8.0.16 ready in xxx ms
➜  Local:   http://localhost:5174/
4.5 ngrok (選用，LINE LIFF 本地測試)
bash
# 先啟動前端 (必須在 5174 埠運行)
cd frontend
npm run dev -- --port 5174

# 另開一個終端機，啟動 ngrok
ngrok http 5174
啟動成功後，會顯示：

text
Forwarding  https://xxxx-xx-xx-xx-xx.ngrok.io -> http://localhost:5174
將 https://xxxx-xx-xx-xx-xx.ngrok.io 填入 LINE Developers Console 的 Endpoint URL。

📋 5. 服務啟動順序建議
順序	服務	指令	說明
1	Redis (Docker)	docker-compose up -d	僅在本地開發需要
2	後端 API	cd backend && npm exec tsx watch src/index.ts	必須最先啟動
3	Worker	cd apps/worker && npm exec tsx watch src/index.ts	處理通知佇列
4	Cron	cd apps/cron && npm exec tsx watch src/index.ts	定時任務
5	前端	cd frontend && npm run dev -- --port 5174	使用者介面
6	ngrok	ngrok http 5174	LINE LIFF 測試（選用）
🧪 6. 驗收測試
6.1 測試後端 API
bash
curl http://localhost:3000/api/health
預期回應：

json
{
  "status": "healthy",
  "checks": { "database": true, "redis": true },
  "version": "4.6 (Phase 1)"
}
6.2 測試前端
打開瀏覽器，拜訪 http://localhost:5174/，應顯示診所預約系統首頁。

6.3 測試 Email OTP 登入
點擊「Email 登入」

輸入 Email，點擊「發送驗證碼」

檢查信箱取得 6 位數 OTP

輸入 OTP，點擊「驗證登入」

應成功登入並導向病人首頁

🧹 7. 停止服務
服務	停止方式
後端 API	Ctrl + C
Worker	Ctrl + C
Cron	Ctrl + C
前端	Ctrl + C
ngrok	Ctrl + C
Docker (Redis)	docker-compose down
📁 專案目錄結構摘要
text
clinic-saas-v4.5/
├── apps/
│   ├── api/                # Fastify API (backend)
│   ├── worker/             # BullMQ Worker
│   └── cron/               # 排程任務
├── packages/
│   ├── engine-booking/     # 預約引擎
│   ├── engine-auth/        # 認證引擎
│   └── shared/             # 共用工具
├── frontend/               # Vue 3 + Vite
├── backend/                # Fastify API (root)
├── supabase/
│   └── migrations/         # 資料庫 Schema
└── docker-compose.yml      # 本地 Redis
🛠️ 常見問題
❌ pnpm: command not found
請安裝 pnpm：

bash
npm install -g pnpm
❌ npm exec tsx 失敗
請確保已安裝 tsx：

bash
npm install -g tsx
# 或使用 npx
npx tsx watch src/index.ts
❌ 後端出現 WRONGPASS invalid username-password pair
請檢查 REDIS_URL 格式是否正確：rediss://default:密碼@主機:6379

❌ 瀏覽器顯示「找不到 localhost」
改用 http://127.0.0.1:5174/ 試試看。

❌ Worker 顯示 LINE 初始化失敗
這是正常的，表示你尚未設定 LINE Token，系統僅使用 Email 通知。

❌ ngrok: command not found
請下載並安裝 ngrok：https://ngrok.com/download

📌 下一步
Phase 1 完成後，下一階段為 Phase 2：信任與變現強化。

更多細節請參閱 docs/ 資料夾中的開發規劃書。

最後更新時間：2026 年 6 月

text

---

## ✅ 更新重點

| 項目 | 修改內容 |
|------|----------|
| 後端啟動指令 | `npm exec tsx watch src/index.ts` |
| 前端啟動指令 | `npm run dev -- --port 5174` |
| ngrok 啟動指令 | `ngrok http 5174` |
| 服務啟動順序表 | 更新所有指令為 `npm exec tsx` |
| 常見問題 | 新增 `npm exec tsx` 相關說明 |

---
