# クラウド同期設定

このアプリは未設定の間はこれまで通り、このパソコンのブラウザ内に保存します。
他のパソコンから同じデータを編集する場合は Supabase を設定します。

1. Supabase でプロジェクトを作成します。
2. SQL Editor で `supabase-setup.sql` の内容を実行します。
3. Authentication でログイン用ユーザーを作成します。
4. Project Settings の API から Project URL と anon public key を確認します。
5. `cloud-config.js` を編集します。

```js
window.CABARET_CLOUD_CONFIG = {
  enabled: true,
  provider: "supabase",
  supabaseUrl: "https://xxxxx.supabase.co",
  supabaseAnonKey: "xxxxx",
  requireAuth: true,
  stateTable: "cabaret_app_state",
  stateId: "main-store"
};
```

別のパソコンから開いた時は、同じSupabaseユーザーでログインすると同じデータを読み書きできます。
