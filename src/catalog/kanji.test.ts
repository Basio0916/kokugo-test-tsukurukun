import { describe, expect, it } from 'vitest'
import tables from './kanji.json'
import { isElementaryKanji, isJoyoKanji, isJuniorHighKanji } from './kanji'

describe('学年別漢字配当表と常用漢字表', () => {
  it('字数が告示のとおり', () => {
    expect(Object.values(tables.haito).map(s => [...s].length)).toEqual([80, 160, 200, 202, 193, 191])
    expect([...tables.joyo].length).toBe(2136)
    expect([...Object.values(tables.haito).join('')].every(c => isJoyoKanji(c))).toBe(true)
  })

  it('中学校で習う漢字を見分ける', () => {
    expect(isJuniorHighKanji('虐')).toBe(true)
    expect(isJuniorHighKanji('嵐')).toBe(true)
    expect(isElementaryKanji('意')).toBe(true)
    expect(isJuniorHighKanji('意')).toBe(false)
    // 常用漢字でない字は、どちらでもない
    expect(isJoyoKanji('龍')).toBe(false)
    expect(isJuniorHighKanji('龍')).toBe(false)
    // 本表の字体と、一般に使われる許容字体の両方
    expect(isJuniorHighKanji('𠮟')).toBe(true)
    expect(isJuniorHighKanji('叱')).toBe(true)
  })
})
