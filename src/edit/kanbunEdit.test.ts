import { describe, expect, it } from 'vitest'
import { applyRuby } from '../ai/classical'
import { checkKanbunLines, checkRuby } from '../ai/annotate'
import { lineChars, lineText } from '../model/kanbun'
import type { KanbunPassage, Section } from '../model/schema'
import { sampleTest } from '../sample/sampleTest'
import { kanbunToText, rebuildKanbun } from './kanbunEdit'
import { passageIssues } from './passageEdit'

const kanshi = () => sampleTest.sections.find(s => s.id === 'kanshi')!
const passage = () => kanshi().passage as KanbunPassage

describe('漢文の白文を直す', () => {
  it('同じ句は訓読も傍線部も残し、変わった句は返り点と送り仮名を外して付け直す句にする', () => {
    const r = rebuildKanbun(passage(), kanbunToText(passage()).replace('夜来風雨声', '夜来風雨音'))!
    expect(r.changed).toEqual([2])
    expect(r.passage.lines[0]).toEqual(passage().lines[0])
    expect(lineChars(r.passage.lines[2]).every(c => !c.okurigana && !c.kaeriten)).toBe(true)
    expect(lineText(r.passage.lines[2])).toBe('夜来風雨音')
  })

  it('傍線部の句を直すと、傍線部は残った字に付いたまま。字が変わったので小問が要確認になる', () => {
    const r = rebuildKanbun(passage(), kanbunToText(passage()).replace('花落知多少', '花落知何多'))!
    expect(r.passage.lines[3][0]).toMatchObject({ kind: 'mark', id: 'a' })
    const after: Section = { ...kanshi(), passage: r.passage }
    expect(passageIssues(kanshi(), after).h3).toEqual([{ key: 'changed:a:花落知何多', text: '傍線部①の文字が「花落知多少」から「花落知何多」に変わりました' }])
  })

  it('句を足す・消す。空なら null', () => {
    const added = rebuildKanbun(passage(), `${kanbunToText(passage())}\n春風吹柳`)!
    expect(added.changed).toEqual([4])
    expect(added.passage.lines).toHaveLength(5)
    expect(rebuildKanbun(passage(), kanbunToText(passage()).split('\n').slice(0, 3).join('\n'))!.passage.lines).toHaveLength(3)
    expect(rebuildKanbun(passage(), ' \n ')).toBeNull()
  })
})

describe('付け直しの関門', () => {
  const lines = ['春眠不覚暁', '処処聞啼鳥', '夜来風雨音', '花落知多少']
  it('漢文: 付け直す句がそろい、白文と同じで返り点の対応がとれるか', () => {
    expect(checkKanbunLines(lines, [2], { lines: [{ index: 2, notation: '夜来風雨(ノ)音' }] })).toEqual({ ok: true, lines: [{ index: 2, notation: '夜来風雨(ノ)音' }] })
    expect(checkKanbunLines(lines, [2], { lines: [] }).ok).toBe(false)
    expect(checkKanbunLines(lines, [2], { lines: [{ index: 2, notation: '夜来風雨(ノ)声' }] }).ok).toBe(false)
    expect(checkKanbunLines(lines, [2], { lines: [{ index: 2, notation: '夜来風[二]雨(ノ)音' }] }).ok).toBe(false)
  })

  it('古文: 親字が本文にあり、読みがひらがな', () => {
    expect(checkRuby('浜辺打つ波も高かりけり', { ruby: [{ base: '浜辺', reading: 'はまべ' }] }).ok).toBe(true)
    expect(checkRuby('浜辺打つ波も高かりけり', { ruby: [{ base: '磯', reading: 'いそ' }] }).ok).toBe(false)
    expect(checkRuby('浜辺打つ波も高かりけり', { ruby: [{ base: '浜辺', reading: 'ハマベ' }] }).ok).toBe(false)
  })
})

describe('傍線部を残してルビを付ける', () => {
  const ougi = () => sampleTest.sections.find(s => s.id === 'ougi')!
  const segs = () => (ougi().passage!.kind === 'prose' ? (ougi().passage as Extract<Section['passage'], { kind: 'prose' }>).segments : [])
  it('地の文と傍線部の中に付け、仮名遣いを問う傍線部の中と、すでにルビのある字には付けない', () => {
    const r = applyRuby(segs(), [{ base: '平家', reading: 'へいけ' }])
    expect(r.errors).toEqual([])
    expect(r.segments.filter(s => s.kind === 'ruby' && s.base === '平家')).toHaveLength(1)
    expect(r.segments.filter(s => s.kind === 'mark')).toHaveLength(segs().filter(s => s.kind === 'mark').length)
    expect(applyRuby(segs(), [{ base: '漂', reading: 'ただよ' }], new Set(['c'])).errors).toHaveLength(1)
    expect(applyRuby(segs(), [{ base: '磯', reading: 'いそ' }]).errors).toHaveLength(1)
  })
})
