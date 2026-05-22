import React, { useEffect, useState, useRef } from 'react'

const GRADIENT = 'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)'
const DARK_BG  = '#030712'
const HERO_BG  = 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(139,92,246,0.25) 0%, transparent 70%), radial-gradient(ellipse 60% 50% at 90% 50%, rgba(6,182,212,0.15) 0%, transparent 60%), #030712'

const COLS = [
  { name: 'email_address',  type: 'VARCHAR(255)', tag: 'PII.Email',        color: '#ef4444', sens: 'Confidential', conf: 94 },
  { name: 'full_name',      type: 'VARCHAR(100)', tag: 'PII.Name',         color: '#f59e0b', sens: 'Confidential', conf: 91 },
  { name: 'cc_number',      type: 'VARCHAR(16)',  tag: 'PCI.CardNumber',   color: '#ec4899', sens: 'Restricted',   conf: 98 },
  { name: 'diagnosis_code', type: 'VARCHAR(20)',  tag: 'PHI.MedicalRecord',color: '#8b5cf6', sens: 'Critical',     conf: 97 },
  { name: 'ssn',            type: 'VARCHAR(11)',  tag: 'PII.SSN',          color: '#dc2626', sens: 'Restricted',   conf: 99 },
  { name: 'created_at',     type: 'TIMESTAMP',    tag: 'Operational',      color: '#10b981', sens: 'Public',       conf: 88 },
]

const FEATURES = [
  { icon: '🧠', title: 'Multi-Agent AI Pipeline', desc: '7 specialized AI agents run in parallel — PII detector, PCI scanner, PHI identifier, sensitivity classifier, regulatory tagger, and more. Powered by Claude & Gemini.' },
  { icon: '🛡️', title: 'Automated Policy Engine', desc: 'Define compliance rules for GDPR, HIPAA, and PCI-DSS once. Automatically enforce sensitivity levels and tag requirements across every column at scan time.' },
  { icon: '🔄', title: 'OpenMetadata Sync', desc: 'One-click sync pushes verified classifications, sensitivity tags, and AI-generated descriptions directly into your OpenMetadata catalog. Stay in sync, always.' },
  { icon: '📚', title: 'AI Asset Dictionary', desc: 'Auto-generate business and technical descriptions for every column and table using LLMs. Eliminate documentation debt with a single scan.' },
  { icon: '🌐', title: 'Browser Extension', desc: 'Classify data inside Snowflake, BigQuery, or any web UI in real-time. Inject colour-coded classification badges without leaving your browser.' },
  { icon: '📤', title: 'CSV & File Upload', desc: 'No database? Upload a CSV and get instant AI-powered classification of every column. Perfect for quick audits, partner data, or ad-hoc governance.' },
]

const STEPS = [
  { n: '01', icon: '🔌', title: 'Connect Sources', desc: 'Link PostgreSQL, Snowflake, BigQuery, S3, MySQL — or simply upload a CSV file.' },
  { n: '02', icon: '🤖', title: 'AI Scans & Classifies', desc: '7 AI agents detect PII, PCI, PHI, financial and HR data across every column simultaneously.' },
  { n: '03', icon: '✅', title: 'Review & Approve', desc: 'Human-in-the-loop governance. Override AI suggestions, apply policies, set sensitivity levels.' },
  { n: '04', icon: '🔄', title: 'Sync to Catalog', desc: 'Push verified tags, descriptions, and compliance metadata back to OpenMetadata in one click.' },
]

const SOURCES = [
  { name: 'PostgreSQL', color: '#336791' },
  { name: 'Snowflake',  color: '#29B5E8' },
  { name: 'BigQuery',   color: '#4285F4' },
  { name: 'AWS S3',     color: '#FF9900' },
  { name: 'MySQL',      color: '#4479A1' },
  { name: 'MongoDB',    color: '#47A248' },
  { name: 'CSV Files',  color: '#10b981' },
]

const COMPLIANCE = [
  { name: 'GDPR',    desc: 'EU General Data Protection' },
  { name: 'HIPAA',   desc: 'Health Insurance Portability' },
  { name: 'PCI-DSS', desc: 'Payment Card Industry' },
  { name: 'CCPA',    desc: 'California Consumer Privacy' },
  { name: 'SOX',     desc: 'Sarbanes-Oxley Act' },
]

// ── Animated scanner card ────────────────────────────────────────────────────
function ScannerCard() {
  const [step, setStep] = useState(0)
  const [scanning, setScanning] = useState(true)

  useEffect(() => {
    const t = setInterval(() => {
      setStep(s => {
        if (s >= COLS.length) {
          setTimeout(() => { setStep(0); setScanning(true) }, 2000)
          setScanning(false)
          return s
        }
        return s + 1
      })
    }, 700)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{
      background: 'rgba(15,18,36,0.95)',
      border: '1px solid rgba(139,92,246,0.3)',
      borderRadius: 16,
      padding: 24,
      width: 420,
      boxShadow: '0 0 60px rgba(139,92,246,0.2), 0 25px 50px rgba(0,0,0,0.5)',
      fontFamily: 'ui-monospace, SFMono-Regular, monospace',
    }}>
      {/* Header bar */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
        <div style={{ width:10, height:10, borderRadius:'50%', background:'#ef4444' }}/>
        <div style={{ width:10, height:10, borderRadius:'50%', background:'#f59e0b' }}/>
        <div style={{ width:10, height:10, borderRadius:'50%', background:'#10b981' }}/>
        <span style={{ marginLeft:8, color:'#64748b', fontSize:12 }}>classifyai — scanner</span>
        {scanning && step < COLS.length && (
          <span style={{ marginLeft:'auto', color:'#8b5cf6', fontSize:11, animation:'blink 1s infinite' }}>● scanning</span>
        )}
      </div>

      {/* Table header */}
      <div style={{ color:'#94a3b8', fontSize:12, marginBottom:12 }}>
        <span style={{ color:'#8b5cf6' }}>table:</span>
        <span style={{ color:'#e2e8f0', marginLeft:8, fontWeight:600 }}>customer_profiles</span>
        <span style={{ color:'#64748b', marginLeft:12 }}>({COLS.length} columns)</span>
      </div>

      {/* Progress bar */}
      <div style={{ height:3, background:'rgba(255,255,255,0.06)', borderRadius:99, marginBottom:16, overflow:'hidden' }}>
        <div style={{
          height:'100%',
          width: step >= COLS.length ? '100%' : `${(step / COLS.length) * 100}%`,
          background: GRADIENT,
          borderRadius: 99,
          transition: 'width 0.5s ease'
        }}/>
      </div>

      {/* Columns */}
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {COLS.map((col, i) => (
          <div key={col.name} style={{
            display:'flex', alignItems:'center', gap:8, padding:'8px 10px',
            borderRadius:8,
            background: i < step ? 'rgba(255,255,255,0.04)' : 'transparent',
            transition: 'all 0.3s ease',
            opacity: i < step ? 1 : 0.25,
          }}>
            <span style={{ color:'#e2e8f0', fontSize:12, flex:1, whiteSpace:'nowrap' }}>{col.name}</span>
            <span style={{ color:'#475569', fontSize:10, width:80, textAlign:'right' }}>{col.type}</span>
            {i < step && (
              <div style={{ display:'flex', gap:4, animation:'badgeIn 0.3s ease' }}>
                <span style={{
                  background: col.color + '22',
                  color: col.color,
                  border: `1px solid ${col.color}55`,
                  padding:'2px 7px', borderRadius:99, fontSize:10, fontWeight:600,
                  whiteSpace:'nowrap'
                }}>{col.tag}</span>
                <span style={{
                  background:'rgba(255,255,255,0.07)', color:'#94a3b8',
                  padding:'2px 6px', borderRadius:99, fontSize:10,
                  whiteSpace:'nowrap'
                }}>{col.conf}%</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      {step >= COLS.length && (
        <div style={{
          marginTop:14, padding:'8px 12px',
          background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.3)',
          borderRadius:8, display:'flex', alignItems:'center', gap:8,
          animation: 'fadeIn 0.4s ease',
          color:'#10b981', fontSize:12
        }}>
          ✓ Classification complete — 6 columns analysed
        </div>
      )}
    </div>
  )
}

// ── Main landing component ───────────────────────────────────────────────────
interface Props {
  onLogin: () => void
  onSignup: () => void
}

export default function Landing({ onLogin, onSignup }: Props) {
  const [scrolled, setScrolled] = useState(false)
  const featuresRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', h)
    return () => window.removeEventListener('scroll', h)
  }, [])

  const scrollToFeatures = () => featuresRef.current?.scrollIntoView({ behavior:'smooth' })

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', overflowX:'hidden' }}>
      {/* ── Injected animations ── */}
      <style>{`
        @keyframes blink   { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes badgeIn { from{opacity:0;transform:scale(.8)} to{opacity:1;transform:scale(1)} }
        @keyframes fadeIn  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes float   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
        @keyframes shimmer { 0%{background-position:200% center} 100%{background-position:-200% center} }
        @keyframes gradShift { 0%,100%{opacity:.6} 50%{opacity:1} }
        .land-btn-primary { transition: transform .15s, box-shadow .15s; }
        .land-btn-primary:hover { transform:translateY(-2px); box-shadow:0 8px 30px rgba(139,92,246,.5) !important; }
        .land-btn-ghost:hover { background:rgba(255,255,255,.1) !important; }
        .feat-card:hover { transform:translateY(-4px); box-shadow:0 16px 40px rgba(139,92,246,.12) !important; }
        .feat-card { transition: transform .2s, box-shadow .2s; }
        .source-chip:hover { transform:scale(1.05); background:rgba(139,92,246,.12) !important; border-color:rgba(139,92,246,.4) !important; }
        .source-chip { transition: all .2s; }
        .nav-link:hover { color:#e2e8f0 !important; }
        .compliance-badge:hover { transform:scale(1.05); }
        .compliance-badge { transition: transform .2s; cursor:default; }
        .scanner-float { animation: float 4s ease-in-out infinite; }
      `}</style>

      {/* ── NAVBAR ────────────────────────────────────────────────────────── */}
      <nav style={{
        position:'fixed', top:0, left:0, right:0, zIndex:100,
        padding:'0 40px', height:64,
        display:'flex', alignItems:'center', justifyContent:'space-between',
        background: scrolled ? 'rgba(3,7,18,.85)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,.08)' : 'none',
        transition: 'all .3s ease',
      }}>
        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:32, height:32, borderRadius:8, background:GRADIENT, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, color:'#fff', fontSize:16 }}>C</div>
          <span style={{ color:'#f8fafc', fontWeight:700, fontSize:18, letterSpacing:-0.5 }}>ClassifyAI</span>
        </div>

        {/* Nav links */}
        <div style={{ display:'flex', gap:32 }}>
          {['Features','How it Works','Sources','Compliance'].map(l => (
            <span key={l} className="nav-link" onClick={scrollToFeatures}
              style={{ color:'#94a3b8', fontSize:14, cursor:'pointer', fontWeight:500 }}>{l}</span>
          ))}
        </div>

        {/* Auth buttons */}
        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
          <button onClick={onLogin} className="land-btn-ghost"
            style={{ background:'transparent', border:'1px solid rgba(255,255,255,.2)', color:'#e2e8f0', borderRadius:8, padding:'8px 18px', fontSize:14, cursor:'pointer' }}>
            Sign In
          </button>
          <button onClick={onSignup} className="land-btn-primary"
            style={{ background:GRADIENT, border:'none', color:'#fff', borderRadius:8, padding:'8px 20px', fontSize:14, fontWeight:600, cursor:'pointer', boxShadow:'0 4px 15px rgba(139,92,246,.4)' }}>
            Get Started →
          </button>
        </div>
      </nav>

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section style={{ minHeight:'100vh', background:HERO_BG, display:'flex', alignItems:'center', padding:'80px 40px 60px', position:'relative', overflow:'hidden' }}>
        {/* Subtle grid overlay */}
        <div style={{ position:'absolute', inset:0, backgroundImage:'linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px)', backgroundSize:'60px 60px', pointerEvents:'none' }}/>

        <div style={{ maxWidth:1200, margin:'0 auto', display:'flex', alignItems:'center', gap:80, width:'100%', position:'relative' }}>
          {/* Left: copy */}
          <div style={{ flex:1 }}>
            {/* Badge */}
            <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:'rgba(139,92,246,.15)', border:'1px solid rgba(139,92,246,.3)', borderRadius:99, padding:'6px 16px', marginBottom:24 }}>
              <span style={{ fontSize:12, color:'#8b5cf6' }}>✨</span>
              <span style={{ color:'#c4b5fd', fontSize:13, fontWeight:500 }}>Powered by Multi-Agent AI — Claude & Gemini</span>
            </div>

            {/* Headline */}
            <h1 style={{ fontSize:58, fontWeight:800, lineHeight:1.1, color:'#f8fafc', margin:'0 0 20px', letterSpacing:-2 }}>
              The AI-Native<br/>
              <span style={{ backgroundImage:GRADIENT, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>
                Data Classification
              </span>
              <br/>Layer
            </h1>

            <p style={{ fontSize:19, color:'#94a3b8', lineHeight:1.7, margin:'0 0 36px', maxWidth:520 }}>
              Automatically discover, classify, and govern every sensitive data asset across your organisation — with GDPR, HIPAA, and PCI-DSS compliance built in.
            </p>

            {/* CTAs */}
            <div style={{ display:'flex', gap:14, flexWrap:'wrap' }}>
              <button onClick={onSignup} className="land-btn-primary"
                style={{ background:GRADIENT, border:'none', color:'#fff', borderRadius:10, padding:'14px 28px', fontSize:16, fontWeight:700, cursor:'pointer', boxShadow:'0 6px 25px rgba(139,92,246,.5)' }}>
                Start Classifying Free →
              </button>
              <button onClick={scrollToFeatures} className="land-btn-ghost"
                style={{ background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.15)', color:'#e2e8f0', borderRadius:10, padding:'14px 24px', fontSize:16, cursor:'pointer' }}>
                See How It Works ↓
              </button>
            </div>

            {/* Social proof */}
            <p style={{ color:'#475569', fontSize:13, marginTop:24 }}>
              No credit card required · GDPR compliant · Self-hostable
            </p>
          </div>

          {/* Right: Animated scanner */}
          <div className="scanner-float" style={{ flexShrink:0 }}>
            <ScannerCard />
          </div>
        </div>
      </section>

      {/* ── STATS BAR ─────────────────────────────────────────────────────── */}
      <section style={{ background:'#0a0f1e', borderTop:'1px solid rgba(255,255,255,.06)', borderBottom:'1px solid rgba(255,255,255,.06)', padding:'28px 40px' }}>
        <div style={{ maxWidth:1000, margin:'0 auto', display:'flex', justifyContent:'space-around', flexWrap:'wrap', gap:24 }}>
          {[
            { n:'50,000+', l:'Columns classified' },
            { n:'7',       l:'Specialized AI agents' },
            { n:'5',       l:'Compliance standards' },
            { n:'< 5 min', l:'Time to first scan' },
          ].map(s => (
            <div key={s.l} style={{ textAlign:'center' }}>
              <div style={{ fontSize:32, fontWeight:800, backgroundImage:GRADIENT, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>{s.n}</div>
              <div style={{ color:'#64748b', fontSize:14, marginTop:2 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────────────────── */}
      <section style={{ background:'#f8fafc', padding:'96px 40px' }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:64 }}>
            <div style={{ display:'inline-block', background:'rgba(139,92,246,.1)', color:'#8b5cf6', borderRadius:99, padding:'4px 16px', fontSize:13, fontWeight:600, marginBottom:16 }}>HOW IT WORKS</div>
            <h2 style={{ fontSize:40, fontWeight:800, color:'#0f172a', margin:0, letterSpacing:-1 }}>From data source to governed catalog</h2>
            <p style={{ color:'#64748b', fontSize:17, marginTop:12 }}>Four steps from connection to compliance</p>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:24 }}>
            {STEPS.map((s, i) => (
              <div key={s.n} style={{ position:'relative' }}>
                {/* Connector line */}
                {i < 3 && <div style={{ position:'absolute', top:40, left:'calc(50% + 40px)', width:'calc(100% - 80px)', height:2, background:'linear-gradient(90deg, #8b5cf6, #06b6d4)', zIndex:0 }}/>}
                <div style={{ background:'#fff', borderRadius:16, padding:28, border:'1px solid #e2e8f0', position:'relative', zIndex:1, boxShadow:'0 4px 16px rgba(0,0,0,.06)' }}>
                  <div style={{ width:56, height:56, borderRadius:14, background:GRADIENT, display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, marginBottom:16 }}>{s.icon}</div>
                  <div style={{ color:'#8b5cf6', fontSize:12, fontWeight:700, marginBottom:6 }}>STEP {s.n}</div>
                  <h3 style={{ fontSize:17, fontWeight:700, color:'#0f172a', margin:'0 0 10px' }}>{s.title}</h3>
                  <p style={{ color:'#64748b', fontSize:14, lineHeight:1.6, margin:0 }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ──────────────────────────────────────────────────────── */}
      <section ref={featuresRef} style={{ background:'#fff', padding:'96px 40px' }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:64 }}>
            <div style={{ display:'inline-block', background:'rgba(6,182,212,.1)', color:'#06b6d4', borderRadius:99, padding:'4px 16px', fontSize:13, fontWeight:600, marginBottom:16 }}>FEATURES</div>
            <h2 style={{ fontSize:40, fontWeight:800, color:'#0f172a', margin:0, letterSpacing:-1 }}>Everything your data governance needs</h2>
            <p style={{ color:'#64748b', fontSize:17, marginTop:12 }}>One platform. Complete coverage.</p>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:28 }}>
            {FEATURES.map(f => (
              <div key={f.title} className="feat-card" style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:16, padding:32, boxShadow:'0 4px 16px rgba(0,0,0,.05)' }}>
                <div style={{ fontSize:32, marginBottom:16 }}>{f.icon}</div>
                <h3 style={{ fontSize:18, fontWeight:700, color:'#0f172a', margin:'0 0 10px' }}>{f.title}</h3>
                <p style={{ color:'#64748b', fontSize:14, lineHeight:1.7, margin:0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SUPPORTED SOURCES ─────────────────────────────────────────────── */}
      <section style={{ background:'#f8fafc', padding:'80px 40px' }}>
        <div style={{ maxWidth:900, margin:'0 auto', textAlign:'center' }}>
          <h2 style={{ fontSize:32, fontWeight:800, color:'#0f172a', margin:'0 0 12px', letterSpacing:-0.5 }}>Works with your entire data stack</h2>
          <p style={{ color:'#64748b', fontSize:16, marginBottom:40 }}>Connect any source in seconds. More integrations added regularly.</p>
          <div style={{ display:'flex', flexWrap:'wrap', gap:16, justifyContent:'center' }}>
            {SOURCES.map(s => (
              <div key={s.name} className="source-chip" style={{
                background:'#fff', border:'1px solid #e2e8f0', borderRadius:99,
                padding:'10px 22px', display:'flex', alignItems:'center', gap:10,
                boxShadow:'0 2px 8px rgba(0,0,0,.05)'
              }}>
                <div style={{ width:10, height:10, borderRadius:'50%', background:s.color }}/>
                <span style={{ fontWeight:600, color:'#334155', fontSize:15 }}>{s.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMPLIANCE ────────────────────────────────────────────────────── */}
      <section style={{ background:DARK_BG, padding:'80px 40px' }}>
        <div style={{ maxWidth:900, margin:'0 auto', textAlign:'center' }}>
          <div style={{ display:'inline-block', background:'rgba(16,185,129,.1)', color:'#10b981', borderRadius:99, padding:'4px 16px', fontSize:13, fontWeight:600, marginBottom:20 }}>COMPLIANCE READY</div>
          <h2 style={{ fontSize:36, fontWeight:800, color:'#f8fafc', margin:'0 0 14px', letterSpacing:-0.5 }}>Built for enterprise compliance</h2>
          <p style={{ color:'#64748b', fontSize:16, margin:'0 0 48px', maxWidth:560, marginLeft:'auto', marginRight:'auto' }}>
            ClassifyAI automatically maps your data to the right regulatory frameworks so your team can focus on action, not discovery.
          </p>
          <div style={{ display:'flex', gap:16, justifyContent:'center', flexWrap:'wrap' }}>
            {COMPLIANCE.map(c => (
              <div key={c.name} className="compliance-badge" style={{
                background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.1)',
                borderRadius:12, padding:'18px 28px', minWidth:140
              }}>
                <div style={{ fontSize:18, fontWeight:800, color:'#f8fafc', marginBottom:4 }}>{c.name}</div>
                <div style={{ fontSize:12, color:'#64748b' }}>{c.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHAT MAKES US DIFFERENT ───────────────────────────────────────── */}
      <section style={{ background:'#fff', padding:'80px 40px' }}>
        <div style={{ maxWidth:1000, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:56 }}>
            <h2 style={{ fontSize:36, fontWeight:800, color:'#0f172a', margin:0, letterSpacing:-0.5 }}>Why ClassifyAI?</h2>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:32 }}>
            {[
              { icon:'⚡', title:'Instant Setup', desc:'Connect a data source and get your first classification report in under 5 minutes. No lengthy onboarding.' },
              { icon:'🔐', title:'Privacy First', desc:'We never store your raw data. Only column names and masked samples — your data stays in your infrastructure.' },
              { icon:'🧩', title:'OpenMetadata Native', desc:'The only classifier built for OpenMetadata. Push tags, descriptions, and lineage back to your catalog automatically.' },
            ].map(i => (
              <div key={i.title} style={{ textAlign:'center', padding:24 }}>
                <div style={{ fontSize:40, marginBottom:16 }}>{i.icon}</div>
                <h3 style={{ fontSize:18, fontWeight:700, color:'#0f172a', margin:'0 0 10px' }}>{i.title}</h3>
                <p style={{ color:'#64748b', fontSize:14, lineHeight:1.7, margin:0 }}>{i.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────────────────────────── */}
      <section style={{ background: 'linear-gradient(135deg, #1e0a3c 0%, #0a1628 50%, #0c1a2e 100%)', padding:'100px 40px', position:'relative', overflow:'hidden' }}>
        {/* Glow orbs */}
        <div style={{ position:'absolute', top:-100, left:'20%', width:400, height:400, borderRadius:'50%', background:'radial-gradient(circle, rgba(139,92,246,.15) 0%, transparent 70%)', pointerEvents:'none' }}/>
        <div style={{ position:'absolute', bottom:-100, right:'20%', width:400, height:400, borderRadius:'50%', background:'radial-gradient(circle, rgba(6,182,212,.12) 0%, transparent 70%)', pointerEvents:'none' }}/>
        <div style={{ maxWidth:640, margin:'0 auto', textAlign:'center', position:'relative' }}>
          <h2 style={{ fontSize:44, fontWeight:800, color:'#f8fafc', margin:'0 0 16px', letterSpacing:-1 }}>
            Start governing your data today
          </h2>
          <p style={{ color:'#94a3b8', fontSize:18, margin:'0 0 40px', lineHeight:1.6 }}>
            Join teams using ClassifyAI to discover, classify, and protect sensitive data — automatically.
          </p>
          <button onClick={onSignup} className="land-btn-primary"
            style={{ background:GRADIENT, border:'none', color:'#fff', borderRadius:12, padding:'16px 40px', fontSize:18, fontWeight:700, cursor:'pointer', boxShadow:'0 8px 30px rgba(139,92,246,.5)' }}>
            Create Your Free Account →
          </button>
          <p style={{ color:'#475569', fontSize:14, marginTop:18 }}>
            No credit card · Free to get started · Cancel anytime
          </p>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <footer style={{ background:'#030712', borderTop:'1px solid rgba(255,255,255,.06)', padding:'48px 40px 32px' }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <div style={{ display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:40, marginBottom:40 }}>
            {/* Brand */}
            <div style={{ maxWidth:280 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                <div style={{ width:28, height:28, borderRadius:7, background:GRADIENT, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, color:'#fff', fontSize:14 }}>C</div>
                <span style={{ color:'#f8fafc', fontWeight:700, fontSize:16 }}>ClassifyAI</span>
              </div>
              <p style={{ color:'#475569', fontSize:14, lineHeight:1.6, margin:0 }}>The AI-native data classification layer. Discover, classify, and govern every data asset automatically.</p>
            </div>
            {/* Links */}
            {[
              { title:'Product', links:['Features','How it Works','Integrations','Pricing'] },
              { title:'Compliance', links:['GDPR','HIPAA','PCI-DSS','CCPA'] },
              { title:'Resources', links:['Documentation','API Docs','Changelog','Status'] },
            ].map(col => (
              <div key={col.title}>
                <h4 style={{ color:'#f8fafc', fontSize:14, fontWeight:600, margin:'0 0 14px' }}>{col.title}</h4>
                {col.links.map(l => <div key={l} style={{ color:'#475569', fontSize:14, marginBottom:8, cursor:'pointer' }}>{l}</div>)}
              </div>
            ))}
          </div>
          <div style={{ borderTop:'1px solid rgba(255,255,255,.06)', paddingTop:24, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
            <span style={{ color:'#334155', fontSize:13 }}>© 2026 ClassifyAI. Built for the data governance community.</span>
            <span style={{ color:'#334155', fontSize:13 }}>Made with ♥ at the hackathon</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
