# 🏥 SaaS 診所預約系統 (v4.5) — 開發啟動指南

本文件記錄 Phase 0 開發環境的完整啟動流程，包含資料庫、後端 API、與前端 UI 的啟動指令。

---

## 📦 前置需求

請確認已安裝以下工具：

- **Node.js** (v20 以上)
- **npm** (隨 Node.js 安裝)
- **Supabase 帳號** (用於雲端資料庫，或使用本地 Postgres)
- **Upstash Redis** (已建立免費資料庫)

---

## 🗄️ 1. 資料庫初始化

> 僅需在初次建置時執行一次。  
> 請登入 Supabase Dashboard → SQL Editor，貼上 `/supabase/migrations/...` 中的完整 Schema SQL 並執行。

---

## 🔧 2. 後端啟動 (Backend)

### 2.1 安裝依賴（第一次執行）
```powershell
cd backend
npm install
2.2 設定環境變數
在 backend 目錄下建立 .env 檔案，內容如下（請替換為真實值）：

env
SUPABASE_URL=https://你的專案.supabase.co
SUPABASE_SERVICE_ROLE_KEY=你的_service_role_key
REDIS_URL=rediss://default:你的密碼@neat-shark-74710.upstash.io:6379
JWT_SECRET=請換成一串隨機密碼
2.3 啟動後端開發伺服器
powershell
npm exec tsx watch src/index.ts
啟動成功後，會顯示：

text
🚀 後端伺服器 (v4.5) 已啟動 -> http://localhost:3000
📌 測試端點: http://localhost:3000/api/test/db
🎨 3. 前端啟動 (Frontend)
3.1 安裝依賴（第一次執行）
powershell
cd frontend
npm install
3.2 啟動前端開發伺服器
powershell
npm run dev -- --port 5174
啟動成功後，會顯示：

text
VITE v8.0.16 ready in xxx ms
➜  Local:   http://localhost:5174/
3.3 瀏覽器訪問
打開瀏覽器，拜訪 http://localhost:5174/，點擊「測試前後端串接」按鈕，確認能顯示 JSON 回應。

🔗 4. 驗收測試
4.1 測試後端 API（直接用瀏覽器或 curl）
powershell
curl http://localhost:3000/api/test/db
預期回應包含 message: "✅ 後端與 Supabase 串接成功！" 以及 redis_status: "連線正常"。

4.2 測試前後端串接（透過前端頁面）
打開 http://localhost:5174/

點擊「🔗 測試前後端串接」按鈕

應顯示與後端直接回應相同的 JSON 內容

🧹 5. 停止服務
後端：在終端機按 Ctrl + C

前端：在終端機按 Ctrl + C

📁 專案目錄結構摘要
text
clinic-saas-v4.5/
├── backend/
│   ├── src/
│   │   └── index.ts        # Fastify 伺服器主程式
│   ├── .env                # 環境變數（請勿提交至 Git）
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── main.ts         # Vue 入口
│   │   └── App.vue         # 測試畫面
│   ├── index.html          # Vite 入口
│   ├── vite.config.ts      # Vite 設定（含 Proxy）
│   └── package.json
└── supabase/
    └── migrations/
        └── ...             # v4.5 完整 Schema SQL
🛠️ 常見問題
❌ 後端出現 WRONGPASS invalid username-password pair
請檢查 .env 中的 REDIS_URL 是否正確，密碼需包含在 URL 中（格式：rediss://default:密碼@主機:6379）。

❌ 瀏覽器顯示「找不到 localhost」
改用 http://127.0.0.1:5174/ 試試看。

若仍無法訪問，請檢查防火牆是否封鎖 Node.js，或嘗試關閉防火牆後再測試。

❌ 前端頁面顯示空白
按 F12 打開開發者工具，檢查 Console 是否有錯誤訊息。

確認 index.html 存在於 frontend 目錄下。

📌 下一步
Phase 0 完成後，下一階段為 Phase 1：核心預約流程與 LINE LIFF 整合。

更多細節請參閱 docs/ 資料夾中的開發規劃書。

最後更新時間：2026 年 6 月
