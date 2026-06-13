import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, getToken, setStoredUser, setToken } from '../api'

type Mode = 'login' | 'register'

export default function Login() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (getToken()) {
      navigate('/brains', { replace: true })
    }
  }, [navigate])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setError('')
    if (!username.trim() || !password) {
      setError('请填写用户名和密码')
      return
    }
    setBusy(true)
    try {
      const result =
        mode === 'login'
          ? await api.login({ username: username.trim(), password })
          : await api.register({
              username: username.trim(),
              password,
              email: email.trim() || undefined,
            })
      setToken(result.token)
      setStoredUser(result.user)
      navigate('/brains', { replace: true })
    } catch (err: any) {
      setError(err?.message || '操作失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={pageStyle}>
      {/* 背景装饰：网格 + 光晕 */}
      <div style={gridBg} />
      <div style={glowBlue} />
      <div style={glowPurple} />

      <div style={shellStyle}>
        <div style={brandStyle}>
          <div style={brandMarkStyle}>AI</div>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text2)', letterSpacing: 4 }}>AINSTEIN</div>
            <div style={{ fontSize: 22, color: 'var(--accent2)', fontWeight: 600 }}>硅基大脑控制台</div>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={tabsStyle}>
            <button
              type="button"
              onClick={() => { setMode('login'); setError('') }}
              style={{ ...tabBtnStyle, ...(mode === 'login' ? tabActive : null) }}
            >
              登录
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError('') }}
              style={{ ...tabBtnStyle, ...(mode === 'register' ? tabActive : null) }}
            >
              注册
            </button>
          </div>

          <p style={subtitleStyle}>
            {mode === 'login'
              ? '欢迎回来。登录后可以观察你创建的硅基大脑的思考轨迹。'
              : '注册一个观察员账户，向硅基大脑提出你的第一个种子问题。'}
          </p>

          <form onSubmit={submit} style={{ marginTop: 24 }}>
            <Field label="用户名">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="例如：observer_alpha"
                style={inputStyle}
                autoComplete="username"
                autoFocus
              />
            </Field>

            {mode === 'register' && (
              <Field label="邮箱（选填）">
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="you@example.com"
                  style={inputStyle}
                  autoComplete="email"
                />
              </Field>
            )}

            <Field label="密码">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder={mode === 'register' ? '至少 6 位' : ''}
                style={inputStyle}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </Field>

            {error && <div style={errorStyle}>⚠ {error}</div>}

            <button type="submit" disabled={busy} style={{ ...primaryBtnStyle, opacity: busy ? 0.6 : 1 }}>
              {busy ? '处理中…' : mode === 'login' ? '登录' : '创建账户'}
            </button>
          </form>

          <div style={hintStyle}>
            {mode === 'login' ? (
              <>还没有账户？ <a onClick={() => { setMode('register'); setError('') }} style={linkStyle}>立即注册</a></>
            ) : (
              <>已有账户？ <a onClick={() => { setMode('login'); setError('') }} style={linkStyle}>返回登录</a></>
            )}
          </div>
        </div>

        <div style={footerStyle}>
          硅基生命体 · 涌现智能观 · v0.5
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', letterSpacing: 1, marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative',
  overflow: 'hidden',
  padding: '40px 20px',
}

const gridBg: CSSProperties = {
  position: 'absolute', inset: 0, pointerEvents: 'none',
  backgroundImage:
    'linear-gradient(rgba(99,102,241,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.06) 1px, transparent 1px)',
  backgroundSize: '48px 48px',
  maskImage: 'radial-gradient(ellipse at center, #000 30%, transparent 75%)',
  WebkitMaskImage: 'radial-gradient(ellipse at center, #000 30%, transparent 75%)',
}

const glowBlue: CSSProperties = {
  position: 'absolute', top: '15%', left: '10%', width: 320, height: 320,
  background: 'radial-gradient(circle, rgba(99,102,241,0.45), transparent 70%)',
  filter: 'blur(40px)', pointerEvents: 'none',
}
const glowPurple: CSSProperties = {
  position: 'absolute', bottom: '10%', right: '8%', width: 360, height: 360,
  background: 'radial-gradient(circle, rgba(236,72,153,0.30), transparent 70%)',
  filter: 'blur(50px)', pointerEvents: 'none',
}

const shellStyle: CSSProperties = {
  position: 'relative', zIndex: 1, width: '100%', maxWidth: 440,
  display: 'flex', flexDirection: 'column', gap: 24,
}

const brandStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 14,
}
const brandMarkStyle: CSSProperties = {
  width: 44, height: 44, borderRadius: 10,
  background: 'linear-gradient(135deg, #6366f1, #ec4899)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#fff', fontWeight: 700, letterSpacing: 1,
}

const cardStyle: CSSProperties = {
  background: 'rgba(26,29,39,0.85)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: 28,
  backdropFilter: 'blur(20px)',
  boxShadow: '0 30px 60px rgba(0,0,0,0.4)',
}

const tabsStyle: CSSProperties = {
  display: 'flex', background: 'var(--bg)', borderRadius: 8,
  padding: 4, border: '1px solid var(--border)',
}
const tabBtnStyle: CSSProperties = {
  flex: 1, background: 'transparent', border: 'none',
  color: 'var(--text2)', padding: '8px 12px', cursor: 'pointer',
  fontSize: 14, borderRadius: 6, transition: 'all .2s',
}
const tabActive: CSSProperties = {
  background: 'var(--bg3)', color: 'var(--text)',
}

const subtitleStyle: CSSProperties = {
  marginTop: 18, color: 'var(--text2)', fontSize: 13, lineHeight: 1.6,
}

const inputStyle: CSSProperties = {
  width: '100%', background: 'var(--bg)',
  border: '1px solid var(--border)', borderRadius: 8,
  padding: '10px 12px', color: 'var(--text)', fontSize: 14, outline: 'none',
  transition: 'border-color .2s',
}

const errorStyle: CSSProperties = {
  background: 'rgba(239,68,68,0.12)', color: 'var(--red)',
  border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6,
  padding: '8px 12px', fontSize: 13, marginBottom: 12,
}

const primaryBtnStyle: CSSProperties = {
  width: '100%', background: 'linear-gradient(90deg, var(--accent), var(--accent2))',
  color: '#fff', border: 'none', borderRadius: 8,
  padding: '12px', cursor: 'pointer', fontSize: 14, fontWeight: 600,
  letterSpacing: 1, marginTop: 4,
}

const hintStyle: CSSProperties = {
  marginTop: 18, textAlign: 'center', fontSize: 13, color: 'var(--text2)',
}
const linkStyle: CSSProperties = {
  color: 'var(--accent2)', cursor: 'pointer', fontWeight: 500,
}

const footerStyle: CSSProperties = {
  textAlign: 'center', color: 'var(--text2)', fontSize: 11, letterSpacing: 2,
}
