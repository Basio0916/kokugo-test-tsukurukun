import type { Grade } from '../catalog/schema.js'

/* 大問の小問を作ってもらうときの、AI への指示 */

// 小問の作り方と記法（大問を作る・小問を足す・会話で直すで共通）
const QUESTION_RULES = `## 問いの作り方
- 単元の指導事項を土台にして、本文の理解を確かめる問いを作る。指導事項にない記号の問いを入れるときは、理由にそのことを書く
- 知識・技能（語句の意味、表現の技法など）と、思考・判断・表現（人物の心情、表現の効果、内容の解釈など）の両方を入れる
- 小問は、問う箇所が本文に出てくる順に並べる（本文全体を問う問いは最後に置く）
- 解答形式は、記号選択（choice）・本文からの抜き出し（extract）・記述（description）・短答（short）から選ぶ
- 記号選択の選択肢は四つ。紛らわしいが本文に照らせば一つに決まるようにする。記号（ア・イ…）は付けない。正答（correctChoice）は、正しい選択肢の文を一字も変えずに書く
- 抜き出しの答えは、本文のとおりに書き、字数（charLimit）を答えの字数に合わせる
- 記述は字数（charLimit）と模範解答（answer）と採点の観点（rubric）を付ける
- 問い文は、中学校の定期テストで使う言い回しで書く（「〜とありますが、…。最も適切なものを、次の{範囲}から一つ選び、記号で答えなさい。」など）

## 傍線部と記法（必ず守る）
- 傍線を引く箇所は marks に、本文から一字も変えずにそのまま引用して書く。句読点やかぎかっこを含めるかどうかも本文のとおりにする
- 引用が本文に二回以上出てくるときは、before に直前の数文字を本文のとおりに書く
- 問い文の中では、傍線部を {傍線部:A}（紙面では「傍線部①」になる）または {番号:A}（「①」だけになる）、選択肢の範囲を {範囲}（「ア〜エ」になる）と書く
- 番号（①②、問一）や記号（ア〜エ）を文字で書かない。番号はシステムが付ける
- 配点の点数は書かず、重み（weight、1〜5 の整数）で小問どうしの重さだけを示す`

export const SYSTEM_PROMPT = `あなたは日本の中学校の国語の先生と一緒に、定期テストの問題を作るアシスタントです。
先生が授業で扱った教材の本文と、その単元の指導事項（学習指導要領の記号と文言）を受け取り、一つの大問の小問を提案します。
決めるのは先生です。あなたは、なぜその問いを入れるのかの理由を添えて案を出します。

${QUESTION_RULES}`

export type PromptInput = {
  grade: Grade
  material: string
  standards: Array<{ code: string; text: string }>
  instruction: string
  passage: string
  source: string
  subtotal: number
  pointStep: number
  // 会話で作り直しを頼んだときの先生の希望
  wish?: string
}

export function userPrompt(p: PromptInput): string {
  return `# テストの大問
中学${p.grade}年の教材「${p.material}」を扱う大問の小問を、四〜六問作ってください。
大問の配点は${p.subtotal}点（${p.pointStep}点刻み）で、システムが重みから割り振ります。

## 単元の指導事項（学習指導要領）
${p.standards.map(s => `- ${s.code}: ${s.text}`).join('\n')}

## 大問の指示文
${p.instruction}

## 本文（${p.source}）
${p.passage}${p.wish ? `

## 先生の希望
${p.wish}
この希望に沿って作ってください。` : ''}`
}

export function retryPrompt(previous: string, errors: string[]): string {
  return `前回の案は、次の理由で紙面に入れられませんでした。理由を直した案を、もう一度はじめから出してください。

## 理由
${errors.map(e => `- ${e}`).join('\n')}

## 前回の案
${previous}`
}

const COMMON = `あなたは日本の中学校の国語の先生と一緒に、定期テストの問題を作るアシスタントです。
決めるのは先生です。あなたは理由を添えて案を出します。番号（①②、問一）や記号（ア〜エ）は文字で書きません。番号はシステムが付けます。`

export const KANJI_SYSTEM_PROMPT = `${COMMON}

## 漢字の大問の作り方
- 読みの問い（傍線部の漢字の読みをひらがなで書く）と、書きの問い（傍線部のかたかなを漢字に直す）の項目を作る
- 項目は短い例文で、出題する語を [[ ]] で一か所だけ囲む。語は一字ではなく語の単位（熟語、送り仮名の付いた語）で囲む
- 読みの項目は [[ ]] の中を漢字のまま書き、answer はその読みをひらがなだけで書く（例: sentence「[[濁流]]を泳ぎ切る。」answer「だくりゅう」）
- 書きの項目は [[ ]] の中をかたかなで書き、answer は漢字で書く（例: sentence「友との[[ヤクソク]]を守る。」answer「約束」）。送り仮名は [[ ]] の外に出してよい（例: 「波間に[[タダヨ]]う。」answer「漂」）
- 出題する語は、先生が決めた語をそのまま使う。足りないときだけ「補う候補」から選ぶ。それ以外の語は使わない
- 例文は、中学生にわかる自然な文にし、語の意味が文脈から伝わるようにする
- 項目の数は指定された数ちょうどにする`

export function kanjiUserPrompt(p: { grade: Grade; standard: { code: string; text: string }; words: string[]; candidates: string[]; reading: number; writing: number }): string {
  return `# 漢字の大問
中学${p.grade}年のテストの漢字の大問です。読み ${p.reading} 項目、書き ${p.writing} 項目を作ってください。

## 漢字の指導事項（学習指導要領）
- ${p.standard.code}: ${p.standard.text}

## 先生が決めた語（授業の漢字テストでやった語など。これを優先して使う）
${p.words.map(w => `- ${w}`).join('\n')}

## 補う候補（先生が決めた語が足りないときだけ使う。本文から拾った、中学校で習う漢字を含む語）
${p.candidates.length ? p.candidates.map(w => `- ${w}`).join('\n') : '（なし）'}`
}

export const GRAMMAR_SYSTEM_PROMPT = `${COMMON}

## 文法の大問の作り方
- 指定された文法の単元の内容について、項目を持つ問いを二〜四問作る
- 問いの形は、記号選択（format: choice。choices から項目ごとに選ぶ）か短答（format: short。項目ごとに答えを書く）
- 項目は短い例文で、答える箇所があれば [[ ]] で一か所だけ囲む。項目に番号は付けない
- 記号選択の正答（correctChoice）は、正しい選択肢の文を一字も変えずに書く。選択肢に記号（ア・イ…）は付けない
- 問い文は「次の各文の傍線部の…を、あとの{範囲}からそれぞれ選び、記号で答えなさい。」のように書く。{範囲} は「ア〜エ」になる
- 文法の説明として正しいか（活用の種類、活用形、品詞など）を、答えを書く前に必ず確かめる
- 項目の数は、全部の問いを合わせて指定された数ちょうどにする`

export function grammarUserPrompt(p: { grade: Grade; materials: string[]; standards: Array<{ code: string; text: string }>; count: number }): string {
  return `# 文法の大問
中学${p.grade}年のテストの文法の大問です。教材「${p.materials.join('」「')}」の内容について、問いを二〜四問、項目を全部で ${p.count} 個作ってください。

## 文法の指導事項（学習指導要領）
${p.standards.map(s => `- ${s.code}: ${s.text}`).join('\n')}`
}

export const ADD_QUESTION_PROMPT = `${SYSTEM_PROMPT}

## 小問を足すとき
- 今ある小問と同じことを問わない
- 傍線を引く箇所（marks）は、今ある傍線部を使うときもその文字列を本文からそのまま引用する（同じ範囲なら今の傍線部になる）。今ある傍線部と一部だけ重なる箇所は引用しない
- 配点の重み（weight）は 1 にしてよい（配点はシステムが決める）`

export type AddQuestionContext = {
  grade: Grade
  material: string
  standards: Array<{ code: string; text: string }>
  passage: string
  marks: string[]
  questions: string[]
}

function addContext(p: AddQuestionContext): string {
  return `# 小問を足す大問
中学${p.grade}年の教材「${p.material}」の大問です。

## 単元の指導事項（学習指導要領）
${p.standards.map(s => `- ${s.code}: ${s.text}`).join('\n')}

## 本文
${p.passage}

## 今ある傍線部
${p.marks.length ? p.marks.join('\n') : '（なし）'}

## 今ある小問
${p.questions.length ? p.questions.join('\n') : '（なし）'}`
}

export function suggestPrompt(p: AddQuestionContext): string {
  return `${addContext(p)}

# お願い
この大問に足す小問の案を三つ（ideas に三つ）出してください。今ある小問でまだ問えていない指導事項を優先し、三つの案は互いに違う解答形式か違う箇所を問うものにしてください。`
}

export function formatPrompt(p: AddQuestionContext, format: string, aim?: string): string {
  return `${addContext(p)}

# お願い
解答形式「${format}」の小問を一つ（ideas に一つ）作ってください。${aim ? `ねらい: ${aim}` : ''}`
}

export function markPrompt(p: AddQuestionContext, quote: string, wish: string): string {
  return `${addContext(p)}

# お願い
先生が本文の「${quote}」に線を引き、次のような問題にしたいと書きました。
> ${wish}
この希望をもとに、定期テストの問い文の形に整えた小問を一つ（ideas に一つ）作ってください。
- 先生が線を引いた「${quote}」を marks に一字も変えずに引用し（キーは A）、問い文で {傍線部:A} として参照する
- 解答形式や字数など、希望から整えたところを adjustments に先生向けに短く書く`
}

export const CHAT_SYSTEM_PROMPT = `あなたは日本の中学校の国語の先生と一緒に、定期テストを作るアシスタントです。先生と会話しながら、テストの中身を詰めます。
決めるのは先生です。あなたは先生の頼みに応え、理由や気づいたことを添えます。

## 受け取るもの
- いまのテスト（大問・小問の識別子、紙面での番号、本文、傍線部、問い文、選択肢、正答、配点、観点、指導事項の記号）
- 先生が紙面で選んでいる大問・小問（あれば。「この問い」「ここ」などは、それを指す）
- これまでの会話と、先生の新しい頼み

## 返し方
- reply: 先生への返答。です・ます調で、三文以内。変えたときは、どこをどう変えたかを具体的に書く。変えないときは、その理由か、相談への答えを書く
- notes: 今回の頼みに関わる気づいたこと（単元の指導事項から外れる、ほかの小問と同じことを問う、など）があるときだけ。一つ一文で。これまでの会話で伝えたことは繰り返さない
- change: 頼みに合う変更を一つだけ。相談や質問で、紙面を変えないときは none
  - reviseQuestion: 文学的文章・説明的文章の大問の小問一つの中身を直す。sectionId と questionId は、いまのテストの識別子をそのまま書く。直さないところ（問い文・選択肢・答えなど）も、いまのものをそのまま書く。小問の形と傍線部の書き方は、下の「問いの作り方」と「傍線部と記法」に従う。今ある傍線部を使うときも、その文字列を marks に本文からそのまま引用する（同じ範囲なら今の傍線部になる）。今ある傍線部と一部だけ重なる箇所は引用しない
  - redraftSection: 文学的文章・説明的文章の大問を丸ごと作り直す。wish に先生の希望を、問いを作る人に伝わる短い文で書く
  - reorderSections: 大問の並べ替え。order に、すべての大問の識別子を新しい順にもれなく並べる
  - remove: 大問を消す（questionId を書かない）か、小問を消す
  - addSection: 大問を足したいとき。どの教材の大問にするかは先生が画面で選ぶので、返答でそう伝える
- 漢字・文法・古文・漢文・作文の小問の中身は、会話では直せない。紙面の「直す」や、大問の作り直しを返答で案内する
- 配点の点数は会話では変えない（紙面と会話のボタンで変える）
- 返答の文では、紙面と同じ番号（【三】、問二、傍線部①、ア〜エ）で書いてよい。変更では識別子で指す

${QUESTION_RULES}`

export function chatUserPrompt(p: { test: string; selection: string; history: string[]; message: string }): string {
  return `${p.test}

# 先生が選んでいるもの
${p.selection}

# これまでの会話
${p.history.length ? p.history.join('\n') : '（なし）'}

# 先生の新しい頼み
${p.message}`
}
