# クラウド同期設定

このアプリは未設定の間はこれまで通り、このパソコンのブラウザ内に保存します。
他のパソコンから同じデータを編集する場合は Supabase を設定します。

## 簡単な方法: ログインなし共有

ログインでつまずく場合は、この方法が一番簡単です。
同じGitHub PagesのURLを開けば、他のパソコンでも同じデータを読み書きできます。

注意:

- URLを知っている人は編集できます。
- 社内・店舗内など、使う人を限定する運用向けです。
- GitHubのパスワードもSupabaseのログインも入力しません。

手順:

1. Supabaseで対象プロジェクトを開きます。
2. 左メニューの `SQL Editor` を開きます。
3. `supabase-simple-share.sql` の内容を貼り付けて実行します。
4. `cloud-config.js` が以下の状態であることを確認します。

```js
window.CABARET_CLOUD_CONFIG = {
  enabled: true,
  provider: "supabase",
  supabaseUrl: "https://ssprvmzwoxxgwugrnuzy.supabase.co",
  supabaseAnonKey: "sb_publishable_Zsq2BOrpcUVFmrJAKTLEaw_d4CItz1H",
  requireAuth: false,
  stateTable: "cabaret_app_state",
  stateId: "main-store-nnmrdisk"
};
```

5. GitHubに `outputs/cabaret-admin` の中身を再アップロードして `Commit changes` します。
6. 数分待ってからGitHub PagesのURLを開きます。

これでログイン画面は出ず、クラウド保存だけが動きます。

## 認証ありで使う方法

ログイン付きに戻したい場合は、以下の方法を使います。

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

## ログインに失敗する場合

データの追加や削除ができていても、クラウドログインに失敗している場合はブラウザ内保存だけで動いています。

確認すること:

1. 入力しているのはGitHubのID/パスワードではなく、Supabase Authenticationのメールアドレスとパスワードです。
2. Supabaseの `Authentication > Users` にユーザーが作成されています。
3. `Email confirmed` が必要な設定の場合、ユーザーのメール確認が完了しています。
4. `Authentication > Providers` で Email provider が有効です。
5. `cloud-config.js` の `supabaseUrl` は `/rest/v1/` なしの `https://xxxxx.supabase.co` 形式です。

GitHub Pagesで使う場合は、Supabase側でも公開URLを登録します。

1. Supabaseで対象プロジェクトを開きます。
2. `Authentication > URL Configuration` を開きます。
3. `Site URL` にGitHub PagesのURLを入れます。

```text
https://nnmrdisk.github.io
```

リポジトリ名付きで公開している場合は、実際のURLを入れます。

```text
https://nnmrdisk.github.io/cabaret-admin/
```

4. `Redirect URLs` にも同じURLを追加します。

```text
https://nnmrdisk.github.io/**
```

またはリポジトリ名付きの場合:

```text
https://nnmrdisk.github.io/cabaret-admin/**
```

保存後、GitHub Pages側に最新の `index.html`、`app.js`、`cloud-config.js` を再アップロードしてください。
