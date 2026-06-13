import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import type { ObserverLog, ObserverLogBody } from '../types'

// ============================================================
//  ObserverPanel — 观察员视角（紧凑版）
//  一屏可见，溢出可隐式滚动，绝不截断。
// ============================================================

interface Props {
  brainId: number
  /** 默认展开 */
  defaultOpen?: boolean
  /** 轮询间隔，单位 ms */
  pollIntervalMs?: number
}

const POLL_DEFAULT = 30_000

export default function ObserverPanel({ brainId, defaultOpen = true, pollIntervalMs = POLL_DEFAULT }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const [latest, setLatest] = useState<ObserverLog | null>(null)
  const [history, setHistory] = useState<ObserverLog[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string>('')
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [narrativeExpanded, setNarrativeExpanded] = useState(false)
  const aliveRef = useRef(true)

  // ---------- 拉取最新总结 ----------
  useEffect(() => {
    if (!brainId || Number.isNaN(brainId)) return
    aliveRef.current = true

    async function load() {
      try {
        const data = await api.getLatestObserverLog(brainId)
        if (!aliveRef.current) return
        setLatest(data || null)
        setLastSync(new Date())
        setError('')
      } catch (e: any) {
        if (aliveRef.current) setError(e?.message || '加载失败')
      }
    }

    load()
    const t = setInterval(load, pollIntervalMs)
    return () => {
      aliveRef.current = false
      clearInterval(t)
    }
  }, [brainId, pollIntervalMs])

  // ---------- 历史展开时拉取列表 ----------
  useEffect(() => {
    if (!historyOpen || !brainId) return
    let alive = true
    setHistoryLoading(true)
    api
      .getObserverLogs(brainId, { kind: 'summary', limit: 10 })
      .then(res => {
        if (!alive) return
        setHistory(res.items || [])
      })
      .catch(e => {
        if (alive) setError(e?.message || '历史加载失败')
      })
      .finally(() => {
        if (alive) setHistoryLoading(false)
      })
    return () => {
      alive = false
    }
  }, [historyOpen, brainId])

  // ---------- 手动触发生成 ----------
  async function handleGenerate() {
    if (generating) return
    setGenerating(true)
    setError('')
    try {
      await api.generateObserverSummary(brainId, { reason: 'manual', force: true })
      const data = await api.getLatestObserverLog(brainId)
      setLatest(data || null)
      setLastSync(new Date())
      if (historyOpen) {
        const res = await api.getObserverLogs(brainId, { kind: 'summary', limit: 10 })
        setHistory(res.items || [])
      }
    } catch (e: any) {
      setError(e?.message || '生成失败')
    } finally {
      setGenerating(false)
    }
  }

  // ---------- 解析 body ----------
  const body: ObserverLogBody | null = useMemo(() => {
    if (!latest) return null
    if (latest.body_struct) return latest.body_struct
    try {
      return JSON.parse(latest.body) as ObserverLogBody
    } catch {
      return null
    }
  }, [latest])

  const isHighImportance = (body?.importance ?? 0) >= 0.7

  // ============================================================
  //  渲染
  // ============================================================
  return (
    <aside
      className={'observer-panel' + (isHighImportance ? ' is-elevated' : '')}
      style={{
        ...wrapperStyle,
        ...(isHighImportance ? elevatedStyle : {}),
      }}
    >
      {/* 顶部标题栏 */}
      <button
        onClick={() => setOpen(o => !o)}
        style={headerBtn}
        title={open ? '折叠' : '展开'}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={titleEmoji} aria-hidden>🔭</span>
          <span style={titleText}>观察员视角</span>
          {body && (
            <span style={importanceMeter(body.importance)}>
              {(body.importance * 100).toFixed(0)}
            </span>
          )}
          {isHighImportance && <span style={importanceBadge}>HIGH</span>}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {lastSync && (
            <span style={syncStamp}>{lastSync.toLocaleTimeString().slice(0, 5)}</span>
          )}
          <span style={chevron(open)} aria-hidden>▾</span>
        </span>
      </button>

      {open && (
        <div className="observer-body" style={bodyStyle}>
          {error && <div style={errorBox}>{error}</div>}

          {/* 占位 */}
          {!latest && !error && (
            <EmptyState />
          )}

          {/* 主内容 */}
          {latest && body && (
            <div style={contentStack}>
              {/* 标题行：编号 + 标题 + 时间 */}
              <div style={titleRow}>
                <span style={kicker}>#{latest.id}</span>
                <span style={summaryTitle} title={latest.title || ''}>
                  {latest.title || '尚未命名的观察'}
                </span>
                <span style={timeStamp}>{formatTime(latest.created_at)}</span>
              </div>

              {body.narrative && (
                <p
                  style={narrativeExpanded ? narrativeOpen : narrativeStyle}
                  onClick={() => setNarrativeExpanded(v => !v)}
                  title={narrativeExpanded ? '点击折叠' : '点击展开全文'}
                >
                  {body.narrative}
                </p>
              )}

              {/* 主要方向 */}
              {Array.isArray(body.main_directions) && body.main_directions.length > 0 && (
                <Row label="方向">
                  <div style={chipRow}>
                    {body.main_directions.map((d, i) => (
                      <span key={i} style={chipStyle} title={d}>{d}</span>
                    ))}
                  </div>
                </Row>
              )}

              {/* 关键发展 */}
              {Array.isArray(body.key_developments) && body.key_developments.length > 0 && (
                <Row label="发展">
                  <ul style={listStyle}>
                    {body.key_developments.map((d, i) => {
                      const tip = d.cited_ce_ids && d.cited_ce_ids.length > 0
                        ? `${d.summary}  (${d.cited_ce_ids.map(id => '#' + id).join(' · ')})`
                        : d.summary
                      return (
                        <li key={i} style={listItem} title={tip}>
                          <span style={bullet} aria-hidden />
                          <span style={lineEllipsis}>{d.summary}</span>
                          {d.cited_ce_ids && d.cited_ce_ids.length > 0 && (
                            <span style={citeStyle}>
                              {d.cited_ce_ids.slice(0, 3).map(id => `#${id}`).join('·')}
                            </span>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </Row>
              )}

              {/* 单行摘要型字段 */}
              {body.deliberation_dynamics && (
                <Row label="博弈">
                  <span style={oneLine} title={body.deliberation_dynamics}>{body.deliberation_dynamics}</span>
                </Row>
              )}
              {body.frontier_movement && (
                <Row label="边界">
                  <span style={oneLine} title={body.frontier_movement}>{body.frontier_movement}</span>
                </Row>
              )}
              {body.health_assessment && (
                <Row label="评价">
                  <span style={oneLine} title={body.health_assessment}>{body.health_assessment}</span>
                </Row>
              )}
            </div>
          )}

          {/* fallback — 拿到 log 但无法解析 body */}
          {latest && !body && (
            <div>
              <div style={summaryTitle}>{latest.title || '观察员日志'}</div>
              <pre style={rawBox}>{latest.body}</pre>
            </div>
          )}

          {/* 历史折叠 */}
          <div style={historyBlock}>
            <button onClick={() => setHistoryOpen(o => !o)} style={historyToggle}>
              <span>{historyOpen ? '收起历史' : '查看历史'}</span>
              <span style={{ opacity: 0.5, fontSize: 10 }}>{historyOpen ? '▴' : '▾'}</span>
            </button>

            {historyOpen && (
              <div style={{ marginTop: 4 }}>
                {historyLoading && <div style={oneLine}>加载中…</div>}
                {!historyLoading && history.length === 0 && (
                  <div style={oneLine}>暂无历史总结</div>
                )}
                {!historyLoading && history.length > 0 && (
                  <ol style={historyList}>
                    {history.map(h => (
                      <li key={h.id} style={historyItem}>
                        <span style={historyDot} />
                        <span style={historyTitle} title={h.title || `观察 #${h.id}`}>
                          {h.title || `观察 #${h.id}`}
                        </span>
                        <span style={historyTime}>{formatTime(h.created_at)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </div>

          {/* 操作行：按钮 inline */}
          <div style={footerRow}>
            <button onClick={handleGenerate} disabled={generating} style={generateBtn(generating)}>
              {generating ? '凝视中…' : '请求新观察'}
            </button>
            {body && (
              <span style={{ fontSize: 10, color: 'var(--text2)', letterSpacing: 1, opacity: 0.6 }}>
                IMPORTANCE · {(body.importance * 100).toFixed(0)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 局部样式：动画 + 隐藏滚动条 */}
      <style>{`
        @keyframes observerScan {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes observerEyeFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        .observer-panel::before {
          content: "";
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          padding: 1px;
          background: linear-gradient(115deg, rgba(99,102,241,0.55), rgba(168,85,247,0.45) 38%, rgba(56,189,248,0.45) 72%, rgba(99,102,241,0.55));
          background-size: 200% 200%;
          animation: observerScan 9s ease-in-out infinite;
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
                  mask-composite: exclude;
          pointer-events: none;
          opacity: 0.85;
        }
        .observer-panel.is-elevated::before {
          background: linear-gradient(115deg, rgba(255,196,0,0.85), rgba(255,140,0,0.65) 50%, rgba(255,196,0,0.85));
          background-size: 200% 200%;
          opacity: 1;
        }
        .observer-eye {
          animation: observerEyeFloat 4.6s ease-in-out infinite;
          display: inline-block;
        }
        /* 关键：允许滚动但隐藏滚动条 */
        .observer-body {
          scrollbar-width: none;          /* Firefox */
          -ms-overflow-style: none;       /* IE/Edge */
        }
        .observer-body::-webkit-scrollbar {
          display: none;                  /* Chrome/Safari */
          width: 0;
          height: 0;
        }
      `}</style>
    </aside>
  )
}

// ============================================================
//  子组件
// ============================================================

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={rowWrap}>
      <span style={rowLabel}>{label}</span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}

function EmptyState() {
  return (
    <div style={emptyWrap}>
      <span className="observer-eye" style={{ fontSize: 26, filter: 'drop-shadow(0 0 10px rgba(168,85,247,0.55))' }}>
        🔭
      </span>
      <div style={emptyTitle}>观察员正在凝视…</div>
      <div style={emptySub}>
        当涌现出值得讲述的演化时，<br />这里会浮现观察员的叙事。
      </div>
    </div>
  )
}

// ============================================================
//  工具
// ============================================================
function formatTime(s: string): string {
  if (!s) return ''
  const safe = s.includes('T') ? s : s.replace(' ', 'T') + 'Z'
  const d = new Date(safe)
  if (isNaN(d.getTime())) return s
  const now = Date.now()
  const diff = now - d.getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}时前`
  return d.toLocaleDateString()
}

// ============================================================
//  样式（紧凑）
// ============================================================

const wrapperStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  background:
    'linear-gradient(180deg, rgba(15,20,30,0.92) 0%, rgba(11,13,22,0.94) 100%)',
  borderRadius: 12,
  border: '1px solid rgba(99,102,241,0.18)',
  boxShadow: '0 12px 40px rgba(0,0,0,0.45), inset 0 0 24px rgba(99,102,241,0.05)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  overflow: 'hidden',           // 外壳保持 hidden，避免阴影跑出
  isolation: 'isolate',
  minHeight: 0,
}

const elevatedStyle: React.CSSProperties = {
  borderColor: 'rgba(255,196,0,0.55)',
  boxShadow:
    '0 0 0 1px rgba(255,196,0,0.25), 0 18px 50px rgba(255,140,0,0.18), inset 0 0 30px rgba(255,196,0,0.08)',
}

const headerBtn: React.CSSProperties = {
  appearance: 'none',
  background: 'transparent',
  border: 'none',
  color: 'var(--text)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  padding: '4px 10px',
  cursor: 'pointer',
  borderBottom: '1px solid rgba(99,102,241,0.12)',
  flexShrink: 0,
  minHeight: 26,
}

const titleEmoji: React.CSSProperties = {
  fontSize: 13,
  filter: 'drop-shadow(0 0 6px rgba(168,85,247,0.5))',
}

const titleText: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: 1.5,
  background: 'linear-gradient(90deg, #c4b5fd, #93c5fd)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
  textTransform: 'uppercase' as const,
  whiteSpace: 'nowrap',
}

const importanceBadge: React.CSSProperties = {
  fontSize: 8,
  letterSpacing: 1.2,
  padding: '1px 5px',
  borderRadius: 3,
  background: 'rgba(255,196,0,0.18)',
  color: '#FFD27F',
  border: '1px solid rgba(255,196,0,0.35)',
  whiteSpace: 'nowrap',
}

const syncStamp: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: 0.8,
  color: 'var(--text2)',
  opacity: 0.55,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
}

const chevron = (open: boolean): React.CSSProperties => ({
  fontSize: 11,
  color: 'var(--text2)',
  transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
  transition: 'transform .2s ease',
  opacity: 0.6,
})

// 关键：body 区允许滚动，且隐藏滚动条（在 <style> 里实现）
const bodyStyle: React.CSSProperties = {
  padding: '6px 8px 8px',
  overflowY: 'auto',
  flex: 1,
  minHeight: 0,
  fontSize: 11,
  lineHeight: 1.4,
  color: 'var(--text2)',
}

const errorBox: React.CSSProperties = {
  background: 'rgba(239,68,68,0.12)',
  border: '1px solid rgba(239,68,68,0.35)',
  color: '#fca5a5',
  padding: '3px 6px',
  borderRadius: 4,
  fontSize: 11,
  marginBottom: 4,
}

const contentStack: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const titleRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 6,
  minWidth: 0,
}

const kicker: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: 1,
  color: 'rgba(196,181,253,0.7)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  flexShrink: 0,
}

const summaryTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text)',
  lineHeight: 1.3,
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const timeStamp: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text2)',
  flexShrink: 0,
  opacity: 0.7,
}

const importanceMeter = (v: number): React.CSSProperties => ({
  fontSize: 9,
  letterSpacing: 0.6,
  color: v >= 0.7 ? '#FFD27F' : v >= 0.4 ? '#93c5fd' : 'var(--text2)',
  border: `1px solid ${v >= 0.7 ? 'rgba(255,196,0,0.4)' : 'rgba(99,102,241,0.25)'}`,
  borderRadius: 999,
  padding: '0 5px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
})

// 默认折叠：4 行 line-clamp，点击展开
const narrativeStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  lineHeight: 1.45,
  color: 'var(--text)',
  background:
    'linear-gradient(180deg, rgba(99,102,241,0.07), rgba(168,85,247,0.04))',
  border: '1px solid rgba(99,102,241,0.18)',
  borderRadius: 5,
  padding: '5px 8px',
  whiteSpace: 'pre-wrap',
  cursor: 'pointer',
  display: '-webkit-box',
  WebkitLineClamp: 4,
  WebkitBoxOrient: 'vertical' as any,
  overflow: 'hidden',
  transition: 'all .2s ease',
}

const narrativeOpen: React.CSSProperties = {
  ...narrativeStyle,
  display: 'block',
  WebkitLineClamp: 'unset' as any,
  overflow: 'visible',
}

// 行式区块：标签 + 内容（一行）
const rowWrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 6,
  minWidth: 0,
}

const rowLabel: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: 1,
  color: 'rgba(196,181,253,0.7)',
  textTransform: 'uppercase' as const,
  flexShrink: 0,
  width: 30,
  paddingTop: 2,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
}

const chipRow: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 3,
}

const chipStyle: React.CSSProperties = {
  fontSize: 10,
  padding: '1px 6px',
  borderRadius: 999,
  background: 'rgba(99,102,241,0.12)',
  color: '#c4b5fd',
  border: '1px solid rgba(99,102,241,0.32)',
  maxWidth: 180,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const listStyle: React.CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
}

const listItem: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  fontSize: 11,
  color: 'var(--text2)',
  lineHeight: 1.35,
  minWidth: 0,
}

const lineEllipsis: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: 'var(--text)',
}

const bullet: React.CSSProperties = {
  width: 4,
  height: 4,
  borderRadius: 2,
  background: 'linear-gradient(135deg, #a855f7, #6366f1)',
  flexShrink: 0,
  boxShadow: '0 0 4px rgba(168,85,247,0.4)',
}

const citeStyle: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: 0.3,
  color: 'rgba(147,197,253,0.7)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  flexShrink: 0,
}

const oneLine: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  color: 'var(--text2)',
  lineHeight: 1.4,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
}

const rawBox: React.CSSProperties = {
  background: 'rgba(0,0,0,0.3)',
  border: '1px solid rgba(99,102,241,0.18)',
  borderRadius: 5,
  padding: 6,
  fontSize: 10,
  whiteSpace: 'pre-wrap',
  maxHeight: 120,
  overflow: 'auto',
}

const historyBlock: React.CSSProperties = {
  marginTop: 6,
  paddingTop: 4,
  borderTop: '1px dashed rgba(140,150,200,0.16)',
}

const historyToggle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  background: 'transparent',
  border: 'none',
  color: 'rgba(196,181,253,0.85)',
  fontSize: 10,
  letterSpacing: 1,
  cursor: 'pointer',
  padding: 0,
  textTransform: 'uppercase' as const,
}

const historyList: React.CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  borderLeft: '1px solid rgba(99,102,241,0.2)',
  paddingLeft: 8,
  gap: 2,
}

const historyItem: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  position: 'relative',
  minWidth: 0,
  fontSize: 11,
}

const historyDot: React.CSSProperties = {
  position: 'absolute',
  left: -11,
  top: '50%',
  marginTop: -2.5,
  width: 5,
  height: 5,
  borderRadius: 3,
  background: '#6366f1',
  boxShadow: '0 0 5px rgba(99,102,241,0.7)',
}

const historyTitle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 11,
  color: 'var(--text)',
  lineHeight: 1.3,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const historyTime: React.CSSProperties = {
  fontSize: 9,
  color: 'var(--text2)',
  letterSpacing: 0.3,
  flexShrink: 0,
  opacity: 0.7,
}

const footerRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  marginTop: 6,
  paddingTop: 4,
  borderTop: '1px solid rgba(99,102,241,0.12)',
  flexShrink: 0,
}

const generateBtn = (loading: boolean): React.CSSProperties => ({
  appearance: 'none',
  border: '1px solid rgba(99,102,241,0.35)',
  background:
    'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(168,85,247,0.12))',
  color: '#c4b5fd',
  fontSize: 11,
  letterSpacing: 1,
  padding: '3px 9px',
  borderRadius: 4,
  cursor: loading ? 'wait' : 'pointer',
  opacity: loading ? 0.6 : 1,
})

const emptyWrap: React.CSSProperties = {
  textAlign: 'center',
  padding: '16px 8px',
  color: 'var(--text2)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
}

const emptyTitle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text)',
  letterSpacing: 1,
}

const emptySub: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text2)',
  lineHeight: 1.5,
  opacity: 0.7,
}
