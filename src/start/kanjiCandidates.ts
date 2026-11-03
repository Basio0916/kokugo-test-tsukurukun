import { isJuniorHighKanji } from '../catalog/kanji'

/**
 * 本文から、中学校で習う漢字を一字でも含む「漢字の続く部分」を拾い、出題する語の候補にする。
 * 重複はまとめ、本文に出てくる順に並べる。送り仮名は付けない。
 */
export function kanjiCandidates(texts: string[]): string[] {
  const out: string[] = []
  for (const text of texts) {
    for (const [run] of text.matchAll(/[一-鿿々\u{20000}-\u{2ffff}]+/gu)) {
      if ([...run].some(isJuniorHighKanji) && !out.includes(run)) out.push(run)
    }
  }
  return out
}

/** 先生が貼った語の並びを、改行・読点・空白で区切って一つずつにする */
export function splitWords(text: string): string[] {
  return [...new Set(text.split(/[\s、,，・]+/).map(w => w.trim()).filter(Boolean))]
}
