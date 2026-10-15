# 匿名聊天室

不用登入的匿名聊天室,所有人在同一個聊天室裡。原生 TypeScript + Vite + Supabase。

## 功能(最小版本)

- 不需登入,進來就能發言,暱稱隨機產生並記在瀏覽器裡
- 訊息即時顯示給所有人(Supabase Realtime)
- 重新整理後可看到最近 50 則訊息
- 手機、電腦皆可使用

## 設定

1. 到 Supabase 建立專案,在 SQL Editor 執行 `supabase/schema.sql`。
2. 複製 `.env.example` 為 `.env.local`,填入專案網址與 publishable key。
3. 安裝並啟動:

```
npm install
npm run dev
```

## 安全說明

- 前端只使用 publishable key,不放 secret / service_role key。
- 資料表啟用 RLS:匿名使用者只能讀取與新增,不能修改或刪除。
- 訊息以 `textContent` 顯示,不會被當成 HTML 執行。
