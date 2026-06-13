import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  api,
  getStoredUser,
  getToken,
  setStoredUser,
  setToken,
} from '../api'
import type { Brain, User } from '../types'

const STATE_LABEL: Record<string, string> = {
  gestating: '孕育中',
  active: '思考中',
  paused: '已暂停',
  archived: '已归档',
}

const STATE_COLOR: Record<string, string> = {
  gestating: '#94a3b8',
  active: '#22c55e',
  paused: '#eab308',
  archived: '#64748b',
}

export default function BrainList() {
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(getStoredUser())
  const [brains, setBrains] = useState<Brain[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [actionBusy, setActionBusy] = useState<number | null>(null)

  const isAdmin = (user?.role || '').toLowerCase() === 'admin'

  useEffect(() => {
    if (!getToken()) {
      navigate('/login', { replace: true })
      return
    }
    refreshUser()
    load(showAll)
  }, [showAll])

  async function refreshUser() {
    try {
      const r = await api.me()
      setUser(r.user)
      setStoredUser(r.user)
    } catch {
      navigate('/login', { replace: true })
    }
  }

  async function load(all: boolean) {
    setLoading(true)
    setError('')
    try {
      const r = await api.listBrains({ all })
      setBrains(r.items || [])
    } catch (e: any) {
      setError(e?.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  async function togglePause(brain: Brain) {
    if (!isAdmin) return
    setActionBusy(brain.id)
    try {
      if (brain.state === 'paused') {
        await api.resumeBrain(brain.id)
      } else {
        await api.pauseBrain(brain.id)
      }
      load(showAll)
    } catch (e: any) {
      setError(e?.message || '操作失败')
    } finally {
      setActionBusy(null)
    }
  }

  function logout() {
    setToken(null)
    setStoredUser(null)
    navigate('/login', { replace: true })
  }

  return (
    <div style={pageStyle}>
      <div style={gridBg} />

      <div style={navStyle}>
        <div style={brandStyle}>
          <div style={brandMarkStyle}>AI</div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text2)', letterSpacing: 3 }}>AINSTEIN</div>
            <div style={{ fontSize: 16, color: 'var(--accent2)', fontWeight: 600 }}>我的硅基大脑</div>
          </div>
        </div>
        <div style={navRightStyle}>
          {user && (
            <span style={userPillStyle}>
              <span style={{ color: 'var(--text2)' }}>观察员 ·</span>{' '}
              <span style={{ color: 'var(--text)' }}>{user.username}</span>
              {isAdmin && <span style={adminBadgeStyle}>ADMIN</span>}
            </span>
          )}
          <button onClick={logout} style={ghostBtnStyle}>退出</button>
        </div>
      </div>

      <div style={contentStyle}>
        <div style={heroStyle}>
          <div>
            <h1 style={{ fontSize: 32, color: 'var(--accent2)', fontWeight: 700, lineHeight: 1.2 }}>
              你的大脑，正在思考。
            </h1>
            <p style={{ color: 'var(--text2)', marginTop: 8, fontSize: 14, maxWidth: 560, lineHeight: 1.7 }}>
              每一个硅基大脑由一个种子问题诞生。你不再是它的指挥者，而是它的观察员。
              在这里，看见多 Agent 的协商、博弈与涌现。
            </p>
          </div>
          <button
            onClick={() => navigate('/brains/new')}
            style={primaryBtnStyle}
          >
            <span style={{ marginRight: 6 }}>＋</span>
            创建新大脑
          </button>
        </div>

        {isAdmin && (
          <div style={adminToolbar}>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>管理员视图：</span>
            <ToggleChip active={!showAll} onClick={() => setShowAll(false)} label="我的大脑" />
            <ToggleChip active={showAll} onClick={() => setShowAll(true)} label="所有大脑" />
          </div>
        )}

        {error && <div style={errorBoxStyle}>⚠ {error}</div>}

        {loading ? (
          <div style={emptyStyle}>加载中…</div>
        ) : brains.length === 0 ? (
          <div style={emptyStyle}>
            <div style={{ fontSize: 18, marginBottom: 8 }}>这里还没有大脑。</div>
            <div style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 20 }}>
              提出你的第一个种子问题，开启一段涌现智能的旅程。
            </div>
            <button onClick={() => navigate('/brains/new')} style={primaryBtnStyle}>
              ＋ 创建第一个大脑
            </button>
          </div>
        ) : (
          <div style={gridStyle}>
            {brains.map((b) => (
              <BrainCard
                key={b.id}
                brain={b}
                isAdmin={isAdmin}
                isOwner={!!user && b.owner_user_id === user.id}
                actionBusy={actionBusy === b.id}
                onOpen={() => navigate(`/project/${b.id}`)}
                onTogglePause={() => togglePause(b)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function BrainCard({
  brain,
  isAdmin,
  isOwner,
  actionBusy,
  onOpen,
  onTogglePause,
}: {
  brain: Brain
  isAdmin: boolean
  isOwner: boolean
  actionBusy: boolean
  onOpen: () => void
  onTogglePause: () => void
}) {
  const stateColor = STATE_COLOR[brain.state] || '#64748b'
  return (
    <div style={cardStyle} onClick={onOpen}>
      <div style={cardTopStyle}>
        <span style={{ ...statePillStyle, color: stateColor, borderColor: stateColor + '66', background: stateColor + '14' }}>
          <span style={{ ...stateDot, background: stateColor }} /> {STATE_LABEL[brain.state] || brain.state}
        </span>
        <span style={{ color: 'var(--text2)', fontSize: 11 }}>#{brain.id}</span>
      </div>
      <h3 style={{ fontSize: 18, color: 'var(--text)', fontWeight: 600, margin: '14px 0 8px' }}>
        {brain.name}
      </h3>
      <p style={seedQuestionStyle}>「{brain.seed_question}」</p>
      <div style={metricsRow}>
        <Metric label="Agent" value={brain.agent_count ?? '-'} />
        <Metric label="认知节点" value={brain.ce_count ?? '-'} />
        <Metric label="边界" value={(brain.frontier_score ?? 0).toFixed(2)} />
      </div>
      {(isAdmin || isOwner) && (
        <div style={cardActions} onClick={(e) => e.stopPropagation()}>
          <button onClick={onOpen} style={smallBtnStyle}>查看图谱</button>
          {isAdmin && (
            <button
              onClick={onTogglePause}
              disabled={actionBusy}
              style={{
                ...smallBtnStyle,
                color: brain.state === 'paused' ? 'var(--green)' : 'var(--yellow)',
                borderColor: (brain.state === 'paused' ? 'var(--green)' : 'var(--yellow)') + '55',
              }}
            >
              {actionBusy ? '…' : brain.state === 'paused' ? '▶ 恢复思考' : '⏸ 暂停思考'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ToggleChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? '#fff' : 'var(--text2)',
        border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'),
        borderRadius: 999, padding: '4px 12px', fontSize: 12, cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 18, color: 'var(--text)', fontWeight: 600 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text2)', letterSpacing: 1 }}>{label}</div>
    </div>
  )
}

const pageStyle: CSSProperties = { minHeight: '100vh', position: 'relative', overflow: 'hidden' }
const gridBg: CSSProperties = {
  position: 'absolute', inset: 0, pointerEvents: 'none',
  backgroundImage:
    'linear-gradient(rgba(99,102,241,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.04) 1px, transparent 1px)',
  backgroundSize: '48px 48px',
  maskImage: 'radial-gradient(ellipse at top, #000 5%, transparent 70%)',
  WebkitMaskImage: 'radial-gradient(ellipse at top, #000 5%, transparent 70%)',
}
const navStyle: CSSProperties = {
  position: 'relative', zIndex: 1, padding: '20px 40px',
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  borderBottom: '1px solid var(--border)', background: 'rgba(15,17,23,0.7)',
  backdropFilter: 'blur(8px)',
}
const brandStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12 }
const brandMarkStyle: CSSProperties = {
  width: 36, height: 36, borderRadius: 8,
  background: 'linear-gradient(135deg, #6366f1, #ec4899)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#fff', fontWeight: 700, fontSize: 13,
}
const navRightStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12 }
const userPillStyle: CSSProperties = {
  fontSize: 13, padding: '6px 12px', background: 'var(--bg2)',
  border: '1px solid var(--border)', borderRadius: 999,
  display: 'inline-flex', alignItems: 'center', gap: 6,
}
const adminBadgeStyle: CSSProperties = {
  fontSize: 10, fontWeight: 700, color: '#fff', background: 'var(--accent)',
  padding: '1px 6px', borderRadius: 4, marginLeft: 4, letterSpacing: 1,
}
const ghostBtnStyle: CSSProperties = {
  background: 'transparent', color: 'var(--text2)',
  border: '1px solid var(--border)', borderRadius: 6,
  padding: '6px 14px', fontSize: 13, cursor: 'pointer',
}

const contentStyle: CSSProperties = {
  position: 'relative', zIndex: 1, maxWidth: 1200, margin: '0 auto',
  padding: '32px 40px 60px',
}
const heroStyle: CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
  gap: 24, marginBottom: 28, flexWrap: 'wrap',
}
const primaryBtnStyle: CSSProperties = {
  background: 'linear-gradient(90deg, var(--accent), var(--accent2))',
  color: '#fff', border: 'none', borderRadius: 8,
  padding: '12px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  boxShadow: '0 8px 24px rgba(99,102,241,0.35)',
}
const adminToolbar: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
}
const errorBoxStyle: CSSProperties = {
  background: 'rgba(239,68,68,0.1)', color: 'var(--red)',
  border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8,
  padding: '10px 14px', fontSize: 13, marginBottom: 16,
}
const emptyStyle: CSSProperties = {
  background: 'var(--bg2)', border: '1px dashed var(--border)',
  borderRadius: 12, padding: '60px 24px', textAlign: 'center', color: 'var(--text)',
}
const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
  gap: 18,
}
const cardStyle: CSSProperties = {
  background: 'var(--bg2)', border: '1px solid var(--border)',
  borderRadius: 12, padding: 20, cursor: 'pointer',
  transition: 'transform .15s ease, border-color .15s',
  position: 'relative', overflow: 'hidden',
}
const cardTopStyle: CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
}
const statePillStyle: CSSProperties = {
  fontSize: 11, padding: '3px 10px', borderRadius: 999,
  border: '1px solid', display: 'inline-flex', alignItems: 'center', gap: 6,
  letterSpacing: 1, fontWeight: 500,
}
const stateDot: CSSProperties = {
  width: 6, height: 6, borderRadius: '50%',
  boxShadow: '0 0 8px currentColor',
}
const seedQuestionStyle: CSSProperties = {
  color: 'var(--text2)', fontSize: 13, lineHeight: 1.6,
  borderLeft: '2px solid var(--accent)', paddingLeft: 10,
  display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
}
const metricsRow: CSSProperties = {
  display: 'flex', gap: 8, marginTop: 18,
  paddingTop: 14, borderTop: '1px dashed var(--border)',
}
const cardActions: CSSProperties = {
  display: 'flex', gap: 8, marginTop: 14,
}
const smallBtnStyle: CSSProperties = {
  background: 'transparent', color: 'var(--text2)',
  border: '1px solid var(--border)', borderRadius: 6,
  padding: '6px 12px', fontSize: 12, cursor: 'pointer',
}
