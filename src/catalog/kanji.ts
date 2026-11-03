import { z } from 'zod'
import tables from './kanji.json' with { type: 'json' }
import { Source } from './schema.js'

/* 学年別漢字配当表（小学校）と常用漢字表。どちらも告示から作った（scripts/build_kanji_tables.py） */

const KanjiTables = z.object({
  sources: z.array(Source).length(2),
  haito: z.record(z.string(), z.string()),
  joyo: z.string(),
  // 本表の字体 → 一般に使われる許容字体（「𠮟」→「叱」など）
  variants: z.record(z.string(), z.string()),
})

const parsed = KanjiTables.parse(tables)
const elementary = new Set([...Object.values(parsed.haito).join('')])
const joyo = new Set([...parsed.joyo, ...Object.values(parsed.variants)])

/** 中学校で習う漢字（常用漢字表にあり、小学校の学年別漢字配当表にない字） */
export function isJuniorHighKanji(c: string): boolean {
  return joyo.has(c) && !elementary.has(c)
}

export function isElementaryKanji(c: string): boolean {
  return elementary.has(c)
}

export function isJoyoKanji(c: string): boolean {
  return joyo.has(c)
}

export const KANJI = /[一-鿿々\u{20000}-\u{2ffff}]/u
