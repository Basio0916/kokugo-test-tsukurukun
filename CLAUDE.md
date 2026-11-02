# 問題用紙つくるくん

日本の中学校の国語の先生向けに、テストの問題用紙づくりを支援するシステム。
Anthropic のハッカソン（2026-11-02 から約1週間）向けに開発している。

## 開発の進め方

仕様と変更は OpenSpec で管理する。

- アイデア出し・設計の議論: `/opsx:explore`
- 機能の追加・変更: `/opsx:propose` → `/opsx:apply` → `/opsx:archive`
- 現在の仕様は `openspec/specs/`、進行中の変更は `openspec/changes/` に置く
- プロダクトの前提（誰向けか、MVP の範囲など）は `openspec/config.yaml` の `context` に書く

superpowers との使い分け:

- `/opsx:apply` での実装中は superpowers のスキル（test-driven-development、systematic-debugging、verification-before-completion など）を使ってよい
- superpowers の brainstorming → writing-plans の流れは使わない。`docs/superpowers/specs/` に設計文書を作らず、計画は OpenSpec の change（proposal / design / tasks）に書く
