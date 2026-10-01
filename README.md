# global-tools-loop

海外（英語圏）向け、Chrome拡張を第一レーンとした「作る→検証→公開→計測→判定」無人ループ。
設計の全体像は `closed-loop-design.md` を参照。3レーン構成（Chrome拡張／無料ツールサイト／機械向け販売）のうち、
このリポジトリは拡張レーンを実装している。

## 現在の状態（2026-09-28）

- 実装済み: 拡張第1弾「CleanCopy」（ページ本文をMarkdownでコピー。LLM不要）
  - `extensions/cleancopy/` — manifest v3、抽出ロジック、ユニットテスト5件（`npm test`で全通過確認済み）
- 実装済み: CI（`.github/workflows/ci.yml`）、日次計測・判定（`measure-and-judge.yml`）、
  公開更新用（`publish-extension.yml`）、@claudeメンションでの構築用（`claude.yml`）
- **GitHubへpush済み・公開リポジトリ化済み**: https://github.com/nume0449/global-tools-loop
  （非公開のままだとブランチ保護がGitHub Pro専用機能のため、公開に切り替え済み。秘密情報が
  含まれていないことは事前に確認済み）
- **ブランチ保護設定済み**: mainへの直接push禁止、CI(`test`)通過必須、force-push/削除禁止。
  レビュー必須人数は0（レビュワーがヌメさん1人しかおらず、自分のPRは自分で承認できない
  GitHubの仕様上、1件必須にすると永久にマージ不能になるため）。管理者は`enforce_admins: false`で
  緊急時に手動マージできる状態にしてある。**つまり今のところ「PRを経由しないとmainに入らない」
  「CIが通らないとマージできない」は強制されるが、「人が中身を見てから承認する」は強制されていない**。
  claude.ymlのPRを人が確認せずマージしてしまうリスクが残るので、慣れるまでは目視してからマージ推奨
- `measure-and-judge.yml`のYAML構文バグ（複数行文字列がブロックリテラルのインデントを壊し
  ワークフロー全体がパース不能になっていた）を発見・修正・`workflow_dispatch`で実行確認済み
- **未公開**: Chrome Web Storeへの初回提出は人がやる必要があり、まだ行っていない
- **未接続**: Chrome Web Store Developerアカウント、Chrome Web Store APIのOAuth Secrets、
  Anthropic APIキー（`ANTHROPIC_API_KEY`）— これらは決済・本人確認・鍵の発行が絡むため代行していない

## 1. このループが自動でできること

- issueの起票 → `@claude`メンションでの構築（PR作成）
- テスト・manifest検証・zip化（CI）
- 公開済み拡張の公開ページから rating / rating数 / user数表示 を毎日取得し、判定表に従って
  「様子見／改稿／アーカイブ／兄弟ツール追加」の判定issueを自動で起票
- 更新版のストア再提出（`publish-extension.yml`を手動起動、または将来cron化）

## 2. 人が最初に1回だけやること（エージェントには不可）

✅ = 代行済み。それ以外は決済・本人確認・鍵の発行が絡むため人の作業が必要。

1. ✅ このリポジトリをGitHubにpush（https://github.com/nume0449/global-tools-loop）
2. ✅ GitHubのブランチ保護（mainへの直接push禁止・CI通過必須・1レビュー必須・force-push禁止）
   - claude.ymlのPRは自動マージされない。マージは人が承認するか、
     「CI通過で自動マージ」ルールを意図して設定するかを決める（design doc 4章参照）
3. ⬜ Chrome Web Store Developerアカウント登録（$5の一回払い）
   https://chrome.google.com/webstore/devconsole
4. ⬜ `extensions/cleancopy/` を手動でzip化し（`node scripts/package-extensions.js`）、
   Developer Dashboardから**初回提出だけ手動**で行う
   - 提出後に発行される Item ID を `extensions/cleancopy/store.json` の `web_store_id` に、
     公開ページURLを `web_store_url` に記入してpush（PR経由。mainへの直接pushはできない）
5. ⬜ 2回目以降の更新を自動化する場合のみ: Chrome Web Store APIのOAuthクライアントを発行し、
   `CWS_CLIENT_ID` / `CWS_CLIENT_SECRET` / `CWS_REFRESH_TOKEN` をGitHub Secretsに登録
   （参考: https://developer.chrome.com/docs/webstore/using-api）
6. ⬜ Anthropic APIキーを `ANTHROPIC_API_KEY` としてGitHub Secretsに登録
   （またはClaude Code GitHub Appでのプラン内利用に切り替える。公式ドキュメントで要確認）
7. `loop/kill-switch.json` の場所を控えておく（止めたいときは `enabled: false` にしてpush、PR経由）

## 3. 判定ルール

`loop/judge-rules.json` に初期値。すべて仮置きの数値で、最初の1ヶ月の実測後に見直す。
判定結果は `loop/decisions.json` に出力され、`hold`/`skip`以外は自動でissueが起票される。
mainは保護されているため、日次の計測結果（`stats/`と`loop/decisions.json`）は保護なしの`loop-state`ブランチに保存される。

## 4. 既知の限界（正直に書く）

- **Chrome Web Storeにはインストール数の公開APIが無い。** 正確な日次インストール／アンインストール数は
  Developer Dashboardからの手動CSVエクスポートのみ対応。`fetch-public-stats.js`が拾えるのは
  公開リスティングページに表示される評価・レビュー数・おおまかな利用者数表示だけで、粗い遅行指標。
- 拡張の初回提出は必ず人が行う（Googleの審査プロセス上、自動化できない）。
- claude-code-actionは自分のPRを自動承認・自動マージしない。無人化するには
  「CI通過で自動マージ」をリポジトリ側で明示的に設定する必要がある（design doc 4章の安全装置と対立するため、
  現時点では**あえて設定していない**。最初の数回は人が見てからマージすることを推奨）。
- llms.txtやAI検索経由の効果測定は未実装。

## 5. ローカルでの動作確認

```bash
npm install
npm test                          # 抽出ロジックのユニットテスト
node scripts/validate-manifests.js
node scripts/package-extensions.js
node scripts/fetch-public-stats.js  # 未公開時は安全にスキップ
node scripts/judge.js
```

すべて2026-09-26時点でこのマシン上で実行し、成功を確認済み。
