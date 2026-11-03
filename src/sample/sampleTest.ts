import { itemSegments, kanbunLine, prose, stem } from '../model/notation'
import { Test } from '../model/schema'

/* 動作確認用のサンプル。中身は docs/reference/モック.html のデータに合わせている */

const items = (rows: Array<[string, string]>) => rows.map(([text, answer]) => ({ segments: itemSegments(text), answer }))

export const sampleTest: Test = Test.parse({
  info: { year: '令和八年度', name: '第三学期　学年末テスト', grade: '二年', fullMarks: 100, minutes: 50, pointStep: 1 },
  sections: [
    {
      id: 'kanji', kind: 'kanji', instruction: '次の問いに答えなさい。',
      questions: [
        { id: 'k1', format: 'kanji', kanten: 'knowledge', standard: '(1)ウ', pointsEach: 2,
          stem: stem('次の傍線部の漢字の読みを、ひらがなで書きなさい。'),
          items: items([['人を[[欺]]くことはしない。', 'あざむ'], ['[[濁流]]を泳ぎ切る。', 'だくりゅう'], ['[[刑吏]]に引き立てられる。', 'けいり'], ['[[磯]]に打ち寄せる波。', 'いそ'], ['見事に的を[[射]]る。', 'い']]) },
        { id: 'k2', format: 'kanji', kanten: 'knowledge', standard: '(1)ウ', pointsEach: 2,
          stem: stem('次の傍線部のかたかなを、漢字に直して書きなさい。'),
          items: items([['友との[[ヤクソク]]を守る。', '約束'], ['友の[[シンライ]]にこたえる。', '信頼'], ['[[メイヨ]]ある勝利を手にする。', '名誉'], ['走り続けて[[ヒロウ]]がたまる。', '疲労'], ['小舟が波間に[[タダヨ]]う。', '漂']]) },
      ],
    },
    {
      id: 'grammar', kind: 'grammar', instruction: '次の問いに答えなさい。',
      questions: [
        { id: 'g1', format: 'choice', kanten: 'knowledge', standard: '(1)オ', pointsEach: 2,
          stem: stem('次の①〜③の動詞の活用の種類を、あとの{範囲}からそれぞれ選び、記号で答えなさい。'),
          items: items([['走る', 'ア'], ['起きる', 'イ'], ['来る', 'エ']]),
          choices: ['五段活用', '上一段活用', '下一段活用', 'カ行変格活用'] },
        { id: 'g2', format: 'short', kanten: 'knowledge', standard: '(1)オ', pointsEach: 2,
          stem: stem('次の①〜③の傍線部の動詞の活用形を書きなさい。'),
          items: items([['友を[[信じれ]]ば、道は開ける。', '仮定形'], ['メロスは野を[[越え]]て走った。', '連用形'], ['約束を[[守る]]とき、人は強くなる。', '連体形']]) },
        { id: 'g3', format: 'short', kanten: 'knowledge', standard: '(1)オ', pointsEach: 2,
          stem: stem('次の①・②の文から形容詞を一つ抜き出し、終止形に直して書きなさい。'),
          items: items([['空は青く澄んでいた。', '青い'], ['水は思ったより冷たかった。', '冷たい']]) },
      ],
    },
    {
      id: 'meros', kind: 'literary', instruction: '次の文章を読んで、あとの問いに答えなさい。',
      passage: { kind: 'prose', source: '太宰治「走れメロス」より', segments: prose('メロスは<m:a>激怒した</m>。必ず、かの<m:b>邪智暴虐</m>の王を除かなければならぬと決意した。<m:c>メロスには政治がわからぬ</m>。メロスは、村の牧人である。笛を吹き、羊と遊んで暮して来た。けれども邪悪に対しては、人一倍に敏感であった。きょう未明メロスは村を出発し、野を越え山越え、十里はなれた此のシラクスの市にやって来た。') },
      questions: [
        { id: 'q1', format: 'extract', charLimit: 11, kanten: 'thinking', standard: 'C(1)イ', points: 4,
          stem: stem('{傍線部:a}「激怒した」とありますが、激怒したメロスは何をしようと決意しましたか。本文中から十一字で抜き出しなさい。'),
          answer: '王を除かなければならぬ' },
        { id: 'q2', format: 'choice', kanten: 'knowledge', standard: '(1)エ', points: 4,
          stem: stem('{傍線部:b}「邪智暴虐」の意味として最も適切なものを、次の{範囲}から一つ選び、記号で答えなさい。'),
          choices: ['知恵がはたらき、人々をよく治めること。', '悪知恵がはたらき、乱暴で残虐なこと。', '知識は乏しいが、正直で心が優しいこと。', '力ばかり強く、乱暴で考えが浅いこと。'], correct: 1 },
        { id: 'q3', format: 'description', charLimit: 40, kanten: 'thinking', standard: 'C(1)イ', points: 10,
          stem: stem('{傍線部:c}「メロスには政治がわからぬ」とありますが、メロスはどのような人物として描かれていますか。本文中の言葉を使って、四十字以内で書きなさい。'),
          answer: '政治のことはわからない村の牧人だが、邪悪に対しては人一倍に敏感な人物。',
          rubric: ['「政治がわからない」「村の牧人である」など、素朴な人物であることが書けている', '「邪悪に対しては人一倍に敏感」であることが書けている', '本文の言葉を使い、四十字以内で「〜人物。」の形にまとめている'] },
        { id: 'q4', format: 'choice', kanten: 'thinking', standard: 'C(1)エ', points: 6,
          stem: stem('この文章が「メロスは激怒した。」という短い一文で始まっていることの効果として最も適切なものを、次の{範囲}から一つ選び、記号で答えなさい。'),
          choices: ['主人公の強い怒りをいきなり示し、読者を物語に引き込む効果。', '物語の時代や場所を、くわしく説明する効果。', 'メロスが落ち着いた性格であることを示す効果。', '王の立場から出来事を語り、話に客観性をもたせる効果。'], correct: 0 },
      ],
    },
    {
      id: 'ougi', kind: 'classical', instruction: '次の古文（「平家物語」の一節）を読んで、あとの問いに答えなさい。',
      passage: { kind: 'prose', source: '「平家物語」より', segments: prose('ころは二月十八日の<m:a>酉{とり}の刻{こく}</m>ばかりのことなるに、をりふし北風激しくて、磯{いそ}打つ波も高かりけり。舟は、揺り上げ<m:b>揺りすゑ</m><m:c>漂へ</m>ば、扇もくしに定まらずひらめいたり。沖には平家、舟を一面に並べて見物す。陸{くが}には源氏、くつばみを並べてこれを見る。<m:d>いづれもいづれも晴れならずといふことぞなき</m>。') },
      questions: [
        { id: 'o1', format: 'choice', kanten: 'knowledge', standard: '(3)イ', points: 4,
          stem: stem('{傍線部:a}「酉の刻」は、現在のおよそ何時ごろですか。最も適切なものを、次の{範囲}から一つ選び、記号で答えなさい。'),
          choices: ['午前六時ごろ', '正午ごろ', '午後六時ごろ', '午前零時ごろ'], correct: 2 },
        { id: 'o2', format: 'kana', kanten: 'knowledge', standard: '(3)ア', pointsEach: 2,
          stem: stem('{傍線部:b}「揺りすゑ」・{番号:c}「漂へ」を現代仮名遣いに直し、すべてひらがなで書きなさい。'),
          items: [{ markId: 'b', answer: 'ゆりすえ' }, { markId: 'c', answer: 'ただよえ' }] },
        { id: 'o3', format: 'choice', kanten: 'thinking', standard: 'C(1)イ', points: 4,
          stem: stem('{傍線部:d}の意味として最も適切なものを、次の{範囲}から一つ選び、記号で答えなさい。'),
          choices: ['源氏も平家も、晴れがましく思わない者はいなかった。', '源氏も平家も、天気が晴れないことを残念がっていた。', '平家の人々だけが、晴れがましい気持ちでいた。', '源氏の人々だけが、晴れがましい気持ちでいた。'], correct: 0 },
        { id: 'o4', format: 'short', charLimit: 2, kanten: 'knowledge', standard: '(3)ア', points: 4,
          stem: stem('「沖には平家、舟を一面に並べて見物す。陸には源氏、くつばみを並べてこれを見る。」のように、組み立ての似た文を並べる表現技法を何といいますか。漢字二字で書きなさい。'),
          answer: '対句' },
      ],
    },
    {
      id: 'kanshi', kind: 'kanbun', instruction: '次の漢詩を読んで、あとの問いに答えなさい。',
      passage: { kind: 'kanbun', title: '春暁', author: '孟浩然',
        lines: [kanbunLine('春眠不[レ]覚(エ)[レ]暁(ヲ)'), kanbunLine('処処聞(ク)[二]啼鳥(ヲ)[一]'), kanbunLine('夜来風雨(ノ)声'), kanbunLine('<m:a>花落(ツルコト)知(ル)多少</m>')],
        notes: ['＊啼鳥……鳴いている鳥。', '＊夜来……昨夜から。'] },
      questions: [
        { id: 'h1', format: 'short', charLimit: 4, kanten: 'knowledge', standard: '(3)ア', points: 2,
          stem: stem('この漢詩の形式を何といいますか。漢字四字で書きなさい。'), answer: '五言絶句' },
        { id: 'h2', format: 'short', kanten: 'knowledge', standard: '(3)ア', points: 2,
          stem: stem('第一句「春眠不覚暁」を、返り点に従って書き下し文に直しなさい。'), answer: '春眠暁を覚えず' },
        { id: 'h3', format: 'choice', kanten: 'knowledge', standard: '(3)イ', points: 4,
          stem: stem('{傍線部:a}「花落知多少」には、作者のどのような思いが表れていますか。語注を参考にして、最も適切なものを、次の{範囲}から一つ選び、記号で答えなさい。'),
          choices: ['昨夜の風雨で、どれほどの花が散ってしまったのだろうかと気にかける思い。', '花が散ることなど、少しも気にかけていないという思い。', '散った花の数を、正確に数えて書き留めておきたいという思い。', '雨がやんだので、早く花見に出かけたいとはやる思い。'], correct: 0 },
        { id: 'h4', format: 'short', kanten: 'thinking', standard: 'C(1)エ', pointsEach: 2,
          stem: stem('この詩で、作者が寝床の中で耳にしたものを、詩の中からそれぞれ漢字二字で二つ抜き出しなさい。'),
          items: [{ answer: '啼鳥' }, { answer: '風雨' }] },
      ],
    },
    {
      id: 'sakubun', kind: 'composition',
      instruction: '「走れメロス」で、メロスは友との約束を守るために走り続けました。「人を信じること」について、あなたが考えたことを、次の条件にしたがって書きなさい。',
      questions: [
        { id: 'c1', format: 'composition', charLimit: 200, kanten: 'thinking', standard: 'C(1)オ・B(1)ウ', points: 12, stem: [],
          conditions: ['二段落で書くこと。第一段落には自分の体験や見聞きしたことを、第二段落にはそれをふまえた自分の考えを書くこと。', '百六十字以上、二百字以内で書くこと。'] },
      ],
    },
  ],
})
