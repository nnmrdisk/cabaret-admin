# Netlifyで公開する手順

このフォルダ `outputs/cabaret-admin` をNetlifyにアップロードすると、どのパソコンからでも同じURLで管理画面を開けます。

## 事前確認

`cloud-config.js` が以下の状態になっていることを確認します。

```js
enabled: true
```

`supabaseUrl` は `/rest/v1/` を付けず、以下のような形にします。

```js
https://xxxxx.supabase.co
```

## 公開手順

1. Netlifyにログインします。
   https://app.netlify.com/

2. 左側または上部の `Sites` / `Projects` を開きます。

3. `Add new site` を押します。

4. `Deploy manually` または `Deploy with drag and drop` を選びます。

5. このフォルダをドラッグ&ドロップします。

```text
C:\Users\Owner\Documents\Codex\2026-07-05\new-chat-2\outputs\cabaret-admin
```

6. デプロイが完了すると、NetlifyのURLが発行されます。

```text
https://xxxxx.netlify.app
```

このURLを他のパソコンで開くと、同じ管理画面にアクセスできます。

## 他のパソコンから使う方法

1. 発行されたNetlifyのURLを開きます。
2. Supabaseで作成したログイン用メールアドレスとパスワードを入力します。
3. 同じ `cabaret_app_state` のデータが読み込まれます。

## 更新するとき

このアプリをCodexで修正した後は、同じNetlifyサイトの `Deploys` ページから、更新後の `outputs/cabaret-admin` フォルダをもう一度ドラッグ&ドロップします。
