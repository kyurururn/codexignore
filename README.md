# codexignore

### Codexに渡さないファイルを、自分で決める。

`.codexignore` を置いて、いつもどおり `codex` を起動する。

![macOS](https://img.shields.io/badge/platform-macOS-black)
![zsh](https://img.shields.io/badge/shell-zsh-4EAA25)
![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933)
![Experimental](https://img.shields.io/badge/status-experimental-orange)

[導入する](#導入する) · [ルールを書く](#ルールを書く) · [対応範囲](#対応範囲) · [仕組み](#仕組み)

---

コードは読んでほしい。でも、`.env` や秘密鍵には触れてほしくない。

**codexignoreなら、Codexに渡したくないファイルを `.codexignore` に指定できます。** 起動時にルールを読み込み、指定したファイルへのCodex CLIとローカル子プロセスの読み書きをmacOSのサンドボックスで制限します。

```gitignore
# .codexignore
.env
.env.*
secrets/
**/*.pem
```

```sh
codex "このプロジェクトをレビューして"
```

初回の連携後は、プロジェクトごとの `init` も、専用の `run` コマンドも不要です。

| | codexignoreでできること |
| --- | --- |
| **いつもの起動方法** | `codex` と `codex exec` で自動的にルールを読み込む |
| **プロジェクトごとの設定** | `.codexignore` で、触れてほしくないパスを指定する |
| **プロセスのアクセス制限** | Codexが起動したローカルコマンドにも拒否ルールを適用する |
| **適用できなければ停止** | 不正な設定や未対応の起動方法では、エラーで起動を止める |

> **現在はmacOS・zsh向けの実験的なMVPです。** Codex Desktopは未対応です。npmレジストリには未公開です。[GitHub Release](https://github.com/kyurururn/codexignore/releases/tag/v0.4.0)の配布パッケージ、または以下の手順でソースから導入できます。

## 導入する

必要なもの：**macOS / zsh / Node.js 22以上 / Codex CLI 0.162.0以上**。Codex CLIへのログインを先に済ませてください。

### 1. 初回だけ、連携をインストール

```sh
git clone https://github.com/kyurururn/codexignore.git
cd codexignore
npm install -g .
codexignore install
```

完了したら、**新しいターミナルを開きます**。

### 2. 対象プロジェクトに `.codexignore` を作成

プロジェクトのルートに、拒否したいパスを記載します。

```gitignore
# 環境ファイル
.env
.env.local

# 秘密情報
secrets/
**/*.pem
```

### 3. いつもどおり `codex` を起動

```sh
codex
```

読み込んだ `.codexignore` の場所とルール数が表示されれば、連携が動作しています。プロンプトの指定、非対話実行、ディレクトリの指定も使えます。

```sh
codex "テストを追加して"
codex exec "テストを実行して"
codex -C /path/to/project
```

## ルールを書く

パスの基準は、`.codexignore` があるディレクトリです。拒否したパスとその配下へのアクセスを制限します。

| パターン | 拒否する対象 |
| --- | --- |
| `.env` | すべての階層にある `.env` |
| `.env.*` | すべての階層にある `.env.local` など |
| `secrets/` | すべての階層にある `secrets` とその配下 |
| `/private/` | ルート直下の `private` とその配下 |
| `config/private` | ルートから見た `config/private` とその配下 |
| `config/*.pem` | `config` 直下のPEMファイル |
| `**/*.pem` | すべての階層のPEMファイル |
| `keys/?.key` | `keys` 直下の `a.key` など、名前が1文字のファイル |

空行と `#` で始まる行は無視します。`*` はパス要素内の任意の文字列、`?` は1文字、独立したパス要素の `**` は複数の階層に一致します。各行の前後の空白は取り除きます。

**`.env.*` は `.env.example` にも一致します。** 共有したいテンプレートがある場合は、`.env.local` などの名前を個別に指定してください。

<details>
<summary>gitignoreとの違い</summary>

完全なgitignore互換ではありません。

- `!` による例外指定、文字クラス、波括弧、エスケープ、`..` は未対応です。
- 末尾 `/` のルールも、同名の通常ファイルを拒否します。
- 複数の `.codexignore` はマージしません。`.gitignore` も読み込みません。

</details>

### 設定を確認する

```sh
codexignore check             # 構文を確認
codexignore explain .env      # 一致する拒否ルールを表示
codexignore check --root /path/to/project
```

これらはルールを確認するコマンドです。実際のサンドボックスによる保護を検証するものではありません。

### どの設定が読み込まれる？

起動するディレクトリから親へ探し、**最も近い `.codexignore`** を使います。`-C` / `--cd` を指定した場合は、そのディレクトリが起点です。探索はGitリポジトリの境界で止まります。

子ディレクトリから起動しても、作業ディレクトリは維持します。設定がなければ、本来のCodex CLIへ引数をそのまま渡します。空の設定ファイルも使えます。

**ルールを変更したら、会話を終了して `codex` を起動し直してください。**

## 対応範囲

| 起動方法 | 自動適用 |
| --- | --- |
| 連携を導入したzshでの `codex` / `codex exec` | 対応 |
| 同じzshでの `codex -C /path/to/project` | 対応 |
| Codex Desktopからの会話開始 | 未対応 |
| Codexの実行ファイルを絶対パスで起動 | 対象外 |
| `command codex` / 連携を読み込まない非対話シェル | 対象外 |

通常の対話と `exec` に対応します。`--model` / `-m`、`--image` / `-i`、`--search`、`--no-alt-screen`、`--json` などを利用できます。

`.codexignore` がある場合、remote、resume、fork、worktree、設定上書き、サンドボックス無効化などの未対応操作は起動を拒否します。`--help`、`--version`、`login`、`logout`、`completion`、`update` は本来のCLIへ直接渡します。

制限するのは、**Codexとそのローカル子プロセスによるファイルアクセス**です。リモートMCP、コネクター、ブラウザー、ファイルの別コピー、環境変数や会話にすでに入っている秘密は対象外です。

## 更新・解除

更新は、どの導入方法でもこの1コマンドです。

```sh
codexignore update
```

GitHub Releaseから最新版を取得し、SHA-256チェックサムとパッケージの内容を検証してから適用します。最新版ならそのまま終了します。現在は実験版のため、公開されたPre-releaseも更新対象です。

- `.codexignore` や `.zshrc` の再設定は不要です。
- **次回の `codex` 起動から新版が使われます。** ターミナルの再起動は不要で、進行中の会話はその版で続きます。
- ダウンロード・検証・切り替えが失敗した場合は、旧版を維持します。
- 更新は明示的なコマンドで行います。会話の起動時に自動でダウンロードすることはありません。

<details>
<summary>v0.3.0以前からの移行（初回だけ）</summary>

旧版には `update` コマンドがないため、一度だけv0.4.0以降のパッケージをインストールして連携を更新してください。

```sh
npm install -g ./codexignore-0.4.0.tgz
codexignore install
```

新しいターミナルを開いた後は、`codexignore update` だけで更新できます。`.codexignore` の変更は不要です。

ソースから導入した場合は、クローンしたリポジトリで `git pull --ff-only`、`npm install -g .`、`codexignore install` を順に実行してください。

</details>

連携を解除する場合：

```sh
codexignore uninstall
```

新しいターミナルを開くと、本来の `codex` コマンドに戻ります。現在のターミナルだけ先に戻す場合は、`unfunction codex codexignore` を実行してください。

## 仕組み

```text
いつもの codex コマンド
        ↓
zshの連携が .codexignore を読み込む
        ↓
拒否ルール付きのmacOSサンドボックス
        ↓
Codex CLI ＋ ローカル子プロセス
```

<details>
<summary>シェルへの導入とファイルアクセス制限の詳細</summary>

### シェルへの導入

`codexignore install` は `~/.local/share/codexignore/` にプログラムを保存し、`.zshrc` に `codex` と `codexignore` の関数を追加します。`ZDOTDIR` を設定している場合は、そのディレクトリの `.zshrc` が対象です。

最初の変更時に `.zshrc.codexignore-backup` を作成します。再実行しても設定を重複追加せず、解除時は他の設定を保持します。既存のCodex実行ファイルとCodexの設定ファイルは編集しません。

関数からはPATH上の本来のCodex CLIを直接起動します。この呼び出しはシェル関数を経由しないため、再帰しません。

### 更新の切り替え

実行用プログラムは版ごとのディレクトリに保存し、固定の起動用スクリプトが `current` の指す版を読み込みます。更新時は新しい版を準備してから、シンボリックリンクを1回のrenameで切り替えます。旧版のディレクトリは保持します。npmで導入したCLIも、連携先の版へ処理を転送します。

### ファイルアクセスの制限

Codexとローカル子プロセスを、拒否ルール付きの `codex sandbox` で囲みます。ルールは絶対パスに固定し、共有daemonを使わず、内側CLIの承認ポリシーを `never` にします。実行中の `.codexignore` 自体も読み書きできません。

認証と状態保存のため、`CODEX_HOME`（通常 `~/.codex`）には書き込みを許可します。ただし `config.toml`、`requirements.toml`、`rules`、`hooks`、`skills`、`plugins` は読み取り専用にします。`CODEX_HOME` はワークスペースの外に必要です。

API通信のため外側サンドボックスのネットワークを有効にし、管理者が設定したmanaged requirementsも権限の解決に含めます。

</details>

## 開発・配布

外部依存はありません。

```sh
npm test                 # CLI・自動読み込み・導入と解除
npm run test:sandbox     # 実際のmacOSサンドボックスで拒否を検証
npm run pack:release     # dist/ にパッケージとSHA256SUMSを作成
```

更新のテストでは、設定の保持、最新版への切り替え、旧CLIからの転送、通信・検証・切り替え失敗時の旧版維持を確認します。

サンドボックスのテストは、読み取り・変更・削除・rename・新規作成・symlink経由のアクセス拒否を確認します。モデルは呼び出しません。別のサンドボックス内では実行できないことがあります。

<details>
<summary>配布パッケージからの導入</summary>

作成したパッケージは、次のようにインストールできます。ファイル名は対象バージョンに置き換えてください。

```sh
npm install -g ./dist/codexignore-0.4.0.tgz
codexignore install
```

インストール時の自動スクリプトはありません。zsh連携は明示的な `install` コマンドで有効にします。

</details>

GitHub Releaseには、同じビルドの `codexignore-<version>.tgz` と `SHA256SUMS` を両方添付してください。更新処理はGitHubの公開Releaseを参照し、npmの公開は必要ありません。

現在のライセンス表記は `UNLICENSED` です。
