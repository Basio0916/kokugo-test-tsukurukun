## Why

現役の国語の先生が実際に作った定期テストでは、字数つきの空欄を埋める要約文の問いが、四か所・三つの大問に出てくる。記号選択より考えさせ、記述ほど採点が重くない形だが、今の小問は答えも字数も一つしか持てないので表せない。先生が問い文を工夫して書いても、解答用紙の欄は一つのままになる。データの形を足せば、紙面・解答用紙・模範解答が連動して変わる。

## What Changes

- 小問に「穴埋め文」を足す。穴埋め文は文字と空欄の並びで、抜き出しと短答の小問が持てる。答えは空欄ごとに持ち、字数は答えの字数ちょうどか「◯字以内」にする
- 問題用紙に穴埋め文を描く（「◎メロスは（Ⅰ　二字）し、…」）。空欄の番号はシステムが並び順で振る
- 解答用紙に空欄ごとのマス目を、模範解答に空欄ごとの答えを描く
- AI が空欄補充の小問を提案できるようにする（大問を作る、小問を足す、会話で小問を直す）。抜き出しの空欄は答えが本文にあることを確かめる
- 小問を直すポップアップで穴埋め文を直せるようにする
- 小問を足す画面に空欄補充を足す（形式を選んで AI に作ってもらう、自分で書く）
- 本文を直したときの確かめを、抜き出しの空欄の答えにも広げる

枝問（問の下の (1)(2)）と、本文の中の空欄は扱わない。

## Capabilities

### New Capabilities
（なし）

### Modified Capabilities
- `test-model`: 小問が穴埋め文を持てる。空欄の番号は並び順で計算する
- `question-paper`: 穴埋め文を描く
- `answer-sheet`: 空欄ごとの解答欄を作る
- `answer-key`: 空欄ごとの答えを並べる
- `ai-section-draft`: 空欄補充の小問を AI が作り、関門で確かめる
- `paper-editing`: 小問を直すポップアップで穴埋め文を直す
- `question-adding`: 小問を足す画面で空欄補充を選ぶ。案の一覧に穴埋め文を出す
- `passage-editing`: 本文を直したときに、抜き出しの空欄の答えも確かめる

## Impact

- 変更: `src/model/schema.ts`・`notation.ts`・`derive.ts`（穴埋め文の形、記法、空欄の番号）、`src/paper/parts.tsx`・`paper.css`（描き方）、`src/sheet/layout.ts`・`keyRows.ts`（解答欄、答え）、`src/ai/proposal.ts`・`toSection.ts`・`prompt.ts`・`chat.ts`・`questionDraft.ts`（AI の返答と関門、AI に見せる今の小問）、`src/edit/QuestionEditor.tsx`・`AddQuestion.tsx`・`addQuestionModel.ts`・`passageEdit.ts`（直す、足す、確かめる）
- 新しい項目は任意なので、穴埋め文を持たない今のデータはそのまま動く
- `widen-question-prompts` と同じ指示と検証の箇所を変えるので、その change のあとに適用する
