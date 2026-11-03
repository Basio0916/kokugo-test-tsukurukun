import { useEffect, useRef, useState } from 'react'
import type { Chip } from './chips'
import { buttonUsed, type ChatButton, type ChatMessage } from './messages'

/* 「AIと相談」の会話の欄。紙面の左に置き、印刷には出さない */

type Props = {
  messages: ChatMessage[]
  canUndo: (message: ChatMessage) => boolean
  onButton: (message: ChatMessage, button: ChatButton) => void
  // 選んでいる大問・小問（【三】問二）
  target: string | null
  onClearTarget: () => void
  chips: Chip[]
  onChip: (chip: Chip) => void
  // 作っている大問・AI が考えていることの表示
  statuses: string[]
  // 一枚に収まらない本文などの知らせ
  alerts: string[]
  busy: boolean
  onSend: (text: string) => void
  // 頼み方の例（押すと入力欄に入る）
  suggestions: string[]
}

export function ChatPanel({ messages, canUndo, onButton, target, onClearTarget, chips, onChip, statuses, alerts, busy, onSend, suggestions }: Props) {
  const [text, setText] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  // 新しいメッセージや表示が出たら、いちばん下まで送る
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, statuses.length, alerts.length])

  function send() {
    if (busy || !text.trim()) return
    onSend(text.trim())
    setText('')
  }

  return (
    <aside className="chat" aria-label="AIと相談">
      <div className="chat-h">
        <b>AIと相談</b>
        {target && (
          <span className="chat-ctx">選択中：{target}<button type="button" onClick={onClearTarget} aria-label="選択を外す">×</button></span>
        )}
      </div>
      <div className="chat-msgs" ref={listRef}>
        {messages.map(m => (
          <div key={m.id} className={`msg msg-${m.who}`}>
            {m.who === 'ai' && <div className="msg-who" aria-hidden="true">AI</div>}
            <div className="msg-body" role={m.error ? 'alert' : undefined}>
              <p>{m.text}</p>
              {m.notes && m.notes.items.length > 0 && (
                <section className="ai-notes" aria-label={m.notes.label}>
                  <h2>{m.notes.title}</h2>
                  <ul>
                    {m.notes.items.map((n, i) => (
                      <li key={i}>
                        {n.head && <b>{n.head}</b>}
                        {n.outside && <span className="ai-outside">単元の指導事項にない</span>}
                        <p>{n.text}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {m.buttons && (
                <div className="msg-acts">
                  {m.buttons.map(b => (
                    <button key={b.label} type="button" disabled={buttonUsed(m, b) || (b.action === 'undo' && !canUndo(m))} onClick={() => onButton(m, b)}>{b.label}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {statuses.map(s => (
          <div key={s} className="msg msg-ai">
            <div className="msg-who" aria-hidden="true">AI</div>
            <div className="msg-body"><p className="ai-status" role="status">{s}</p></div>
          </div>
        ))}
        {alerts.map(a => <p key={a} className="ai-status ai-error" role="alert">{a}</p>)}
      </div>
      <div className="chat-composer">
        {target
          ? chips.length > 0 && (
            <div className="chips" role="group" aria-label={`${target}について頼む`}>
              {chips.map(c => <button key={c.label} type="button" className="chip" disabled={c.disabled} onClick={() => onChip(c)}>{c.label}</button>)}
            </div>
          )
          : <p className="chat-hint">紙面の大問や小問をクリックすると、それについて頼めます</p>}
        {suggestions.length > 0 && (
          <div className="chips" role="group" aria-label="こう伝えてみる">
            <span className="chips-label">こう伝えてみる</span>
            {suggestions.map(s => <button key={s} type="button" className="chip chip-sug" onClick={() => setText(s)}>{s}</button>)}
          </div>
        )}
        <div className="chat-input">
          <textarea
            rows={2} value={text} aria-label="AIへの相談"
            placeholder="AIに相談する（例：大問二と三を入れ替えて）"
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              // 日本語を変換している途中の Enter では送らない
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) { e.preventDefault(); send() }
            }}
          />
          <button type="button" className="chat-send" disabled={busy} onClick={send}>送信</button>
        </div>
        <p className="chat-hint">⌘ / Ctrl + Enter でも送信できます</p>
      </div>
    </aside>
  )
}
