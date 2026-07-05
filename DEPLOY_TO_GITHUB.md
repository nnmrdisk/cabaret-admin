# GitHubで保存して他パソコンから開く手順

GitHubにはこの管理画面のファイルを保存します。
店舗データそのものはSupabaseに保存されます。

理由:

- GitHub PagesはHTML/CSS/JavaScriptの公開に向いています。
- ブラウザからGitHubへ営業データを書き込むには強い権限のトークンが必要になり、安全ではありません。
- そのため、画面はGitHub、データはSupabase、という分け方にします。

## 1. GitHubで新しいリポジトリを作る

1. GitHubにログインします。
2. 右上の `+` を押します。
3. `New repository` を押します。
4. Repository name に例として以下を入力します。

```text
cabaret-admin
```

5. `Public` を選びます。
6. `Create repository` を押します。

GitHub FreeでGitHub Pagesを使う場合、公開リポジトリが一番わかりやすいです。

## 2. ファイルをアップロードする

1. 作成したリポジトリを開きます。
2. `Add file` を押します。
3. `Upload files` を押します。
4. 以下のフォルダの中身をすべてドラッグ&ドロップします。

```text
C:\Users\Owner\Documents\Codex\2026-07-05\new-chat-2\outputs\cabaret-admin
```

フォルダそのものではなく、中のファイルをアップロードしてください。
少なくとも以下がリポジトリ直下に見える状態にします。

```text
index.html
app.js
styles.css
cloud-config.js
.nojekyll
```

5. 下の `Commit changes` を押します。

## 3. GitHub Pagesを有効にする

1. リポジトリ上部の `Settings` を押します。
2. 左メニューの `Pages` を押します。
3. `Build and deployment` の `Source` で `Deploy from a branch` を選びます。
4. `Branch` で以下を選びます。

```text
main
/(root)
```

5. `Save` を押します。

数分待つとURLが表示されます。

```text
https://ユーザー名.github.io/cabaret-admin/
```

このURLを他のパソコンで開けば、同じ管理画面が使えます。

## 4. 他パソコンから使う

1. GitHub PagesのURLを開きます。
2. ログインなしで、Supabaseの `cabaret_app_state` に保存された同じデータを読み込みます。
3. 他のパソコンでも同じURLを開けば、同じデータを編集できます。

ログイン付き設定に戻した場合だけ、Supabaseの `Authentication > URL Configuration` にGitHub PagesのURLを登録してください。

```text
Site URL: https://nnmrdisk.github.io
Redirect URLs: https://nnmrdisk.github.io/**
```

リポジトリ名付きURLの場合は、実際のURLに合わせます。

```text
Site URL: https://nnmrdisk.github.io/cabaret-admin/
Redirect URLs: https://nnmrdisk.github.io/cabaret-admin/**
```

## 5. 修正したあと更新する

Codexでアプリを修正したら、GitHubの同じリポジトリに更新後のファイルを再アップロードして `Commit changes` します。
数分後、GitHub PagesのURLにも反映されます。
