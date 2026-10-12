# codexignore

**`.codexignore` を置いて、いつもどおり `codex` を起動する。**

Codex CLIによるファイルの読み書きを、プロジェクトごとのルールで制限するツールです。初回の導入後は、プロジェクトごとの初期化や専用の起動コマンドは不要です。

> 現在は **macOS・zsh向けの実験的なMVP** です。Codex Desktopには適用されません。npmレジストリには未公開です。

## クイックスタート

### 1. インストールする

Node.js **22以上** と Codex CLI **0.162.0以上** が必要です。Codex CLIへのログインを済ませてから、配布パッケージをインストールします。

```sh
npm install -g ./codexignore-0.3.0.tgz
codexignore install
```

導入は初回だけです。完了したら **新しいターミナルを開いてください**。

ソースから導入する場合は、次の手順でも利用できます。

```sh
git clone https://github.com/kyurururn/codexignore.git
cd codexignore
npm install -g .
codexignore install
```

### 2. `.codexignore` を作成する

プロジェクトのルートに、拒否したいファイルやディレクトリを書きます。

```gitignore
# 環境ファイル
.env
.env.*

# 秘密情報を置くディレクトリ
secrets/

# すべての階層のPEMファイル
**/*.pem
```

`.env.*` は `.env.example` にも一致します。必要なファイルまで除外しないよう、ルールを調整してください。

### 3. 普段どおり起動する

```sh
codex
```

プロンプトの指定、非対話実行、別のディレクトリからの起動にも対応します。

```sh
codex "プロジェクトをレビューして"
codex exec "テストを実行して"
codex -C /path/to/project
```

起動時に、読み込んだ `.codexignore` の場所とルール数が表示されます。

## 読み込みのルール

- 現在のディレクトリから親へ探し、最も近い `.codexignore` を使います。`-C` / `--cd` を指定した場合は、そのディレクトリから探します。
- Gitリポジトリの境界を越えて探索しません。子ディレクトリから起動しても、作業ディレクトリは維持します。
- 設定がない場合は、引数をそのまま本来のCodex CLIへ渡します。空の設定ファイルも利用できます。
- 設定が不正、オプションが未対応、または制限を適用できない場合は、エラーで起動を止めます。

設定を変更したら、会話を終了して `codex` を起動し直してください。

## パターンの書き方

パスは `.codexignore` のあるディレクトリを基準に解釈します。

| パターン | 対象 |
| --- | --- |
| `.env` | すべての階層にある `.env` |
| `.env.*` | `.env.local` など、すべての階層の一致する名前 |
| `secrets/` | すべての階層にある `secrets` とその子孫 |
| `/private/` | ルート直下の `private` とその子孫 |
| `config/private` | ルートから見た `config/private` とその子孫 |
| `config/*.pem` | `config` 直下のPEMファイル |
| `**/*.pem` | すべての階層のPEMファイル |
| `keys/?.key` | `keys` 直下の `a.key` など、名前が1文字のファイル |

空行と `#` で始まる行は無視し、前後の空白を取り除きます。`*` はパス要素内の任意の文字列、`?` は1文字、独立したパス要素の `**` は複数の階層に一致します。

完全なgitignore互換ではありません。

- `!` による例外指定、文字クラス、波括弧、エスケープ、`..` は未対応です。
- 末尾 `/` のルールも、同名の通常ファイルを拒否します。
- 複数の `.codexignore` はマージしません。`.gitignore` も読み込みません。

## 設定の確認

必要に応じて、構文や一致するルールを確認できます。

```sh
codexignore check
codexignore explain .env
codexignore check --root /path/to/project
```

| コマンド | 用途 |
| --- | --- |
| `check` | 設定ファイルの構文を検証する |
| `explain PATH` | パスに一致する拒否ルールを表示する |

どちらも、実際のサンドボックスによる保護を検証するコマンドではありません。

## 対応範囲

| 起動方法 | 自動適用 |
| --- | --- |
| 連携を導入したzshでの `codex` / `codex exec` | 対応 |
| `codex -C /path/to/project` | 対応 |
| Codex Desktopからの会話開始 | 未対応 |
| Codexの実行ファイルを絶対パスで起動 | 対象外 |
| `command codex` や、連携を読み込まない非対話シェル | 対象外 |

通常の対話と `exec` に対応します。`--model` / `-m`、`--image` / `-i`、`--search`、`--no-alt-screen`、`--json` などを利用できます。

`.codexignore` がある場合、remote、resume、fork、worktree、設定上書き、サンドボックス無効化などの未対応操作は起動を拒否します。`--help`、`--version`、`login`、`logout`、`completion`、`update` は本来のCLIへ直接渡します。

制限の対象は、Codexとそのローカル子プロセスによるファイルアクセスです。リモートMCP、コネクター、ブラウザー、ファイルの別コピー、環境変数や会話にすでに入っている秘密は対象外です。

## 更新・解除

### 更新する

新しい配布パッケージをインストールし、連携を更新します。

```sh
npm install -g ./codexignore-0.3.0.tgz
codexignore install
```

ファイル名は受け取ったバージョンに置き換えてください。更新後は新しいターミナルを開きます。

### 連携を解除する

```sh
codexignore uninstall
```

新しいターミナルを開くと、本来の `codex` コマンドに戻ります。現在のターミナルだけ先に戻す場合は、`unfunction codex` を実行してください。

## 仕組み

### シェルへの導入

`codexignore install` は `~/.local/share/codexignore/` にプログラムを保存し、`.zshrc` に `codex` 関数を追加します。`ZDOTDIR` を設定している場合は、そのディレクトリの `.zshrc` が対象です。

最初の変更時に `.zshrc.codexignore-backup` を作成します。再実行しても設定を重複追加せず、解除時は他の設定を保持します。既存のCodex実行ファイルとCodexの設定ファイルは編集しません。

関数からはPATH上の本来のCodex CLIを直接起動します。この呼び出しはシェル関数を経由しないため、再帰しません。

### ファイルアクセスの制限

Codexとローカル子プロセスを、拒否ルール付きの `codex sandbox` で囲みます。ルールは絶対パスに固定し、共有daemonを使わず、内側CLIの承認ポリシーを `never` にします。実行中の `.codexignore` 自体も読み書きできません。

認証と状態保存のため、`CODEX_HOME`（通常 `~/.codex`）には書き込みを許可します。ただし `config.toml`、`requirements.toml`、`rules`、`hooks`、`skills`、`plugins` は読み取り専用にします。`CODEX_HOME` はワークスペースの外に必要です。

API通信のため外側サンドボックスのネットワークを有効にし、管理者が設定したmanaged requirementsも権限の解決に含めます。

関連仕様：[Codex Permissions](https://learn.chatgpt.com/docs/permissions)

## 開発・配布

外部依存はありません。リポジトリ内で次のコマンドを実行できます。

```sh
# CLI・自動読み込み・導入と解除のテスト
npm test

# 実際のmacOSサンドボックスによる拒否を検証
npm run test:sandbox

# 配布パッケージを作成
npm run pack:release
```

配布物は `dist/codexignore-0.3.0.tgz` です。インストール時の自動スクリプトはなく、zsh連携は明示的な `install` コマンドで有効にします。

テストでは、一時的なホームへの導入、自動読み込み、設定なしの引数転送、`-C`、重複導入、解除を確認します。サンドボックスのテストでは、読み取り・変更・削除・rename・新規作成・symlink経由のアクセス拒否を確認します。モデルは呼び出しません。すでに別のサンドボックス内にいる場合、サンドボックスのテストを実行できないことがあります。

ライセンス表記は現在 `UNLICENSED` です。npm公開前に、パッケージ名・公開先アカウント・ライセンスを決める必要があります。
