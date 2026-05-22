import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { isSupabaseConfigured } from '../lib/supabase'

const GRADIENT = 'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)'

const ROLES   = ['Data Engineer','Data Steward','Data Analyst','Compliance Officer','Security Engineer','CTO / Head of Data','Other']
const USE_CASES = ['PII / GDPR compliance','HIPAA health data','PCI payment data','AI training data readiness','General data governance','Security audit']

interface Props { onComplete: () => void }

export default function Onboarding({ onComplete }: Props) {
  const { createOrganization, user, signOut } = useAuth()
  const [orgName, setOrgName]       = useState('')
  const [role, setRole]             = useState('')
  const [useCase, setUseCase]       = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

  // Demo mode — just continue
  if (!isSupabaseConfigured) { onComplete(); return null }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orgName.trim()) { setError('Please enter your workspace name.'); return }
    setLoading(true); setError('')
    const { error: err } = await createOrganization(orgName.trim())
    if (err) { setError(err.message); setLoading(false); return }
    onComplete()
  }

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(135deg, #f8fafc 0%, #f0f4ff 100%)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'system-ui, -apple-system, sans-serif', padding:24 }}>
      <div style={{ background:'#fff', borderRadius:24, padding:'56px 52px', maxWidth:520, width:'100%', boxShadow:'0 24px 64px rgba(0,0,0,.1)' }}>
        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:40 }}>
          <div style={{ width:56, height:56, borderRadius:14, background:GRADIENT, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, color:'#fff', fontSize:24, margin:'0 auto 16px' }}>C</div>
          <h1 style={{ fontSize:28, fontWeight:800, color:'#0f172a', margin:'0 0 8px', letterSpacing:-0.5 }}>Set up your workspace</h1>
          <p style={{ color:'#64748b', fontSize:15, margin:0 }}>
            Welcome{user?.email ? `, ${user.email.split('@')[0]}` : ''}! Let's get your organisation ready.
          </p>
        </div>

        {/* Progress dots */}
        <div style={{ display:'flex', gap:8, justifyContent:'center', marginBottom:36 }}>
          {[0,1,2].map(i => (
            <div key={i} style={{ width:i===0?28:8, height:8, borderRadius:99, background:i===0?GRADIENT:'#e2e8f0', transition:'all .3s' }}/>
          ))}
        </div>

        {error && (
          <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, padding:'11px 16px', color:'#dc2626', fontSize:14, marginBottom:20 }}>
            ⚠ {error}
          </div>
        )}

        <form onSubmit={handleCreate} style={{ display:'flex', flexDirection:'column', gap:22 }}>
          {/* Org name */}
          <div>
            <label style={{ fontSize:13, fontWeight:600, color:'#374151', marginBottom:6, display:'block' }}>Workspace name <span style={{ color:'#ef4444' }}>*</span></label>
            <input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Acme Corp Data Team"
              required style={{ width:'100%', padding:'12px 14px', border:'1.5px solid #e2e8f0', borderRadius:10, fontSize:15, color:'#0f172a', outline:'none', boxSizing:'border-box' }}
              onFocus={e => e.target.style.borderColor='#8b5cf6'}
              onBlur={e => e.target.style.borderColor='#e2e8f0'}
            />
            <p style={{ color:'#94a3b8', fontSize:12, marginTop:6 }}>This will be your organisation's display name in ClassifyAI.</p>
          </div>

          {/* Role */}
          <div>
            <label style={{ fontSize:13, fontWeight:600, color:'#374151', marginBottom:10, display:'block' }}>Your role</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {ROLES.map(r => (
                <button key={r} type="button" onClick={() => setRole(r === role ? '' : r)}
                  style={{ padding:'7px 14px', borderRadius:99, fontSize:13, cursor:'pointer', border:`1.5px solid ${role===r?'#8b5cf6':'#e2e8f0'}`, background:role===r?'rgba(139,92,246,.08)':'transparent', color:role===r?'#8b5cf6':'#64748b', fontWeight:role===r?600:400, transition:'all .15s' }}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Use case */}
          <div>
            <label style={{ fontSize:13, fontWeight:600, color:'#374151', marginBottom:10, display:'block' }}>Primary use case</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {USE_CASES.map(u => (
                <button key={u} type="button" onClick={() => setUseCase(u === useCase ? '' : u)}
                  style={{ padding:'7px 14px', borderRadius:99, fontSize:13, cursor:'pointer', border:`1.5px solid ${useCase===u?'#06b6d4':'#e2e8f0'}`, background:useCase===u?'rgba(6,182,212,.08)':'transparent', color:useCase===u?'#06b6d4':'#64748b', fontWeight:useCase===u?600:400, transition:'all .15s' }}>
                  {u}
                </button>
              ))}
            </div>
          </div>

          <button type="submit" disabled={loading}
            style={{ background:loading?'#c4b5fd':GRADIENT, border:'none', color:'#fff', borderRadius:10, padding:'14px', fontSize:16, fontWeight:700, cursor:loading?'not-allowed':'pointer', marginTop:4, boxShadow:'0 4px 16px rgba(139,92,246,.4)' }}>
            {loading ? 'Creating workspace…' : 'Create Workspace & Continue →'}
          </button>
        </form>

        <div style={{ textAlign:'center', marginTop:20 }}>
          <button onClick={signOut} style={{ background:'transparent', border:'none', color:'#94a3b8', fontSize:13, cursor:'pointer' }}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
