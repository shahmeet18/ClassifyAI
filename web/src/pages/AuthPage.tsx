import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { isSupabaseConfigured } from '../lib/supabase'

const GRADIENT = 'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)'

interface Props {
  initialMode?: 'login' | 'signup'
  onBack: () => void
  onSuccess: () => void
}

export default function AuthPage({ initialMode = 'login', onBack, onSuccess }: Props) {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode)

  const [fullName, setFullName] = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [info, setInfo]         = useState('')

  // Demo mode: skip Supabase
  if (!isSupabaseConfigured) {
    return (
      <div style={{ minHeight:'100vh', background:'#f8fafc', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'system-ui, sans-serif', padding:24 }}>
        <div style={{ background:'#fff', borderRadius:20, padding:48, maxWidth:440, width:'100%', boxShadow:'0 20px 60px rgba(0,0,0,.1)', textAlign:'center' }}>
          <div style={{ width:52, height:52, borderRadius:12, background:GRADIENT, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, color:'#fff', fontSize:22, margin:'0 auto 20px' }}>C</div>
          <h2 style={{ fontSize:24, fontWeight:800, color:'#0f172a', margin:'0 0 12px' }}>Demo Mode</h2>
          <p style={{ color:'#64748b', fontSize:15, marginBottom:28, lineHeight:1.6 }}>
            Supabase is not configured yet. You can still explore the full platform in demo mode.
          </p>
          <button onClick={onSuccess}
            style={{ background:GRADIENT, border:'none', color:'#fff', borderRadius:10, padding:'13px 28px', fontSize:16, fontWeight:700, cursor:'pointer', width:'100%', marginBottom:14 }}>
            Continue as Demo User →
          </button>
          <button onClick={onBack}
            style={{ background:'transparent', border:'1px solid #e2e8f0', color:'#64748b', borderRadius:10, padding:'11px 24px', fontSize:14, cursor:'pointer', width:'100%' }}>
            ← Back to home
          </button>
          <p style={{ color:'#94a3b8', fontSize:12, marginTop:20, lineHeight:1.7 }}>
            To enable real auth, add your <code style={{ background:'#f1f5f9', padding:'1px 5px', borderRadius:4 }}>VITE_SUPABASE_URL</code> and <code style={{ background:'#f1f5f9', padding:'1px 5px', borderRadius:4 }}>VITE_SUPABASE_ANON_KEY</code> to <code style={{ background:'#f1f5f9', padding:'1px 5px', borderRadius:4 }}>web/.env.local</code>
          </p>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setInfo(''); setLoading(true)
    try {
      if (mode === 'signup') {
        if (!fullName.trim()) { setError('Please enter your full name.'); return }
        const { error: err } = await signUp(email, password, fullName)
        if (err) { setError(err.message); return }
        setInfo('Account created! Check your email to verify, then sign in.')
        setMode('login')
      } else {
        const { error: err } = await signIn(email, password)
        if (err) { setError(err.message); return }
        onSuccess()
      }
    } finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', fontFamily:'system-ui, -apple-system, sans-serif' }}>
      {/* Left panel */}
      <div style={{ flex:1, background:'linear-gradient(160deg, #0f0728 0%, #0a1628 50%, #030d1a 100%)', display:'flex', flexDirection:'column', justifyContent:'center', padding:'60px 72px', position:'relative', overflow:'hidden' }}>
        {/* Glow */}
        <div style={{ position:'absolute', top:'-20%', left:'-10%', width:400, height:400, borderRadius:'50%', background:'radial-gradient(circle, rgba(139,92,246,.15) 0%, transparent 70%)', pointerEvents:'none' }}/>
        <div style={{ position:'absolute', bottom:'-10%', right:'-10%', width:300, height:300, borderRadius:'50%', background:'radial-gradient(circle, rgba(6,182,212,.1) 0%, transparent 70%)', pointerEvents:'none' }}/>

        {/* Logo */}
        <div onClick={onBack} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:56, cursor:'pointer' }}>
          <div style={{ width:34, height:34, borderRadius:9, background:GRADIENT, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, color:'#fff', fontSize:17 }}>C</div>
          <span style={{ color:'#f8fafc', fontWeight:700, fontSize:18 }}>ClassifyAI</span>
        </div>

        <h2 style={{ fontSize:36, fontWeight:800, color:'#f8fafc', margin:'0 0 16px', letterSpacing:-0.5 }}>
          {mode === 'signup' ? 'Start governing your data' : 'Welcome back'}
        </h2>
        <p style={{ color:'#94a3b8', fontSize:16, margin:'0 0 48px', lineHeight:1.6, maxWidth:360 }}>
          {mode === 'signup'
            ? 'Join teams using ClassifyAI to discover and protect sensitive data automatically.'
            : 'Your data is waiting. Sign in to continue governing.'}
        </p>

        {/* Feature list */}
        <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
          {[
            { icon:'🧠', text:'7-agent AI classification pipeline' },
            { icon:'🛡️', text:'GDPR, HIPAA & PCI-DSS compliance' },
            { icon:'🔄', text:'One-click OpenMetadata sync' },
            { icon:'📤', text:'CSV & database source support' },
          ].map(f => (
            <div key={f.text} style={{ display:'flex', alignItems:'center', gap:14 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:'rgba(255,255,255,.06)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, flexShrink:0 }}>{f.icon}</div>
              <span style={{ color:'#cbd5e1', fontSize:15 }}>{f.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div style={{ width:480, background:'#fff', display:'flex', flexDirection:'column', justifyContent:'center', padding:'60px 56px', flexShrink:0 }}>
        <h3 style={{ fontSize:26, fontWeight:800, color:'#0f172a', margin:'0 0 8px' }}>
          {mode === 'signup' ? 'Create your account' : 'Sign in to your account'}
        </h3>
        <p style={{ color:'#64748b', fontSize:14, margin:'0 0 32px' }}>
          {mode === 'signup' ? 'Already have one? ' : "Don't have one? "}
          <span onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(''); setInfo('') }}
            style={{ color:'#8b5cf6', cursor:'pointer', fontWeight:600 }}>
            {mode === 'signup' ? 'Sign in' : 'Sign up free'}
          </span>
        </p>

        {error && (
          <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, padding:'12px 16px', color:'#dc2626', fontSize:14, marginBottom:20 }}>
            ⚠ {error}
          </div>
        )}
        {info && (
          <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:10, padding:'12px 16px', color:'#16a34a', fontSize:14, marginBottom:20 }}>
            ✓ {info}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:18 }}>
          {mode === 'signup' && (
            <div>
              <label style={{ fontSize:13, fontWeight:600, color:'#374151', marginBottom:6, display:'block' }}>Full Name</label>
              <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Smith" required
                style={{ width:'100%', padding:'11px 14px', border:'1.5px solid #e2e8f0', borderRadius:10, fontSize:15, color:'#0f172a', outline:'none', boxSizing:'border-box',
                  transition:'border-color .2s' }}
                onFocus={e => e.target.style.borderColor='#8b5cf6'}
                onBlur={e => e.target.style.borderColor='#e2e8f0'}
              />
            </div>
          )}

          <div>
            <label style={{ fontSize:13, fontWeight:600, color:'#374151', marginBottom:6, display:'block' }}>Email address</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required
              style={{ width:'100%', padding:'11px 14px', border:'1.5px solid #e2e8f0', borderRadius:10, fontSize:15, color:'#0f172a', outline:'none', boxSizing:'border-box' }}
              onFocus={e => e.target.style.borderColor='#8b5cf6'}
              onBlur={e => e.target.style.borderColor='#e2e8f0'}
            />
          </div>

          <div>
            <label style={{ fontSize:13, fontWeight:600, color:'#374151', marginBottom:6, display:'block' }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'} required minLength={8}
              style={{ width:'100%', padding:'11px 14px', border:'1.5px solid #e2e8f0', borderRadius:10, fontSize:15, color:'#0f172a', outline:'none', boxSizing:'border-box' }}
              onFocus={e => e.target.style.borderColor='#8b5cf6'}
              onBlur={e => e.target.style.borderColor='#e2e8f0'}
            />
          </div>

          <button type="submit" disabled={loading}
            style={{ background: loading ? '#c4b5fd' : GRADIENT, border:'none', color:'#fff', borderRadius:10, padding:'13px', fontSize:16, fontWeight:700, cursor: loading ? 'not-allowed' : 'pointer', marginTop:4, transition:'opacity .2s' }}>
            {loading ? '...' : mode === 'signup' ? 'Create Account →' : 'Sign In →'}
          </button>
        </form>

        <p style={{ color:'#94a3b8', fontSize:12, textAlign:'center', marginTop:28, lineHeight:1.7 }}>
          By continuing you agree to our Terms of Service and Privacy Policy.
        </p>

        <button onClick={onBack} style={{ background:'transparent', border:'none', color:'#94a3b8', fontSize:13, cursor:'pointer', marginTop:16 }}>
          ← Back to home
        </button>
      </div>
    </div>
  )
}
