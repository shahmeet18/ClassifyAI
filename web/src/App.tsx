import React, { useState, useEffect } from 'react'
import {
  LayoutDashboard, Database, ScanLine, BarChart3,
  ShieldCheck, Settings as SettingsIcon, LogOut, User,
} from 'lucide-react'

import { AuthProvider, useAuth } from './contexts/AuthContext'
import { isSupabaseConfigured } from './lib/supabase'

import Landing     from './pages/Landing'
import AuthPage    from './pages/AuthPage'
import Onboarding  from './pages/Onboarding'

import Dashboard        from './components/Dashboard'
import SourceManager    from './components/SourceManager'
import ScanWizard       from './components/ScanWizard'
import AssetDictionary  from './components/AssetDictionary'
import Policies         from './components/Policies'
import Settings         from './components/Settings'

// ── App views (state machine) ────────────────────────────────────────────────
type View = 'landing' | 'login' | 'signup' | 'onboarding' | 'app'
type Tab  = 'overview' | 'connections' | 'scan' | 'results' | 'policies' | 'settings'

const NAV: { id: Tab; label: string; Icon: React.ComponentType<any> }[] = [
  { id:'overview',    label:'Overview',       Icon: LayoutDashboard },
  { id:'connections', label:'Connections',    Icon: Database        },
  { id:'scan',        label:'Scan & Classify',Icon: ScanLine        },
  { id:'results',     label:'Results',        Icon: BarChart3       },
  { id:'policies',    label:'Policy Rules',   Icon: ShieldCheck     },
  { id:'settings',    label:'Settings',       Icon: SettingsIcon    },
]

// ── Inner shell (requires auth context) ─────────────────────────────────────
function AppShell() {
  const { user, organization, loading, signOut } = useAuth()
  const [view, setView]     = useState<View>('landing')
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  useEffect(() => {
    if (loading) return
    if (!isSupabaseConfigured) {
      // Demo mode — go straight to app
      setView('app')
      return
    }
    if (user) {
      setView(organization ? 'app' : 'onboarding')
    } else {
      setView('landing')
    }
  }, [user, organization, loading])

  // ── Loading spinner ──
  if (loading) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#030712' }}>
        <div style={{ textAlign:'center', color:'#94a3b8' }}>
          <div style={{ width:48, height:48, borderRadius:12, background:'linear-gradient(135deg,#8b5cf6,#06b6d4)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, color:'#fff', fontSize:22, margin:'0 auto 16px' }}>C</div>
          <div style={{ fontSize:15 }}>Loading ClassifyAI…</div>
        </div>
      </div>
    )
  }

  // ── Route views ──
  if (view === 'landing')    return <Landing    onLogin={() => setView('login')} onSignup={() => setView('signup')} />
  if (view === 'login')      return <AuthPage   initialMode="login"  onBack={() => setView('landing')} onSuccess={() => setView(organization ? 'app' : 'onboarding')} />
  if (view === 'signup')     return <AuthPage   initialMode="signup" onBack={() => setView('landing')} onSuccess={() => setView('onboarding')} />
  if (view === 'onboarding') return <Onboarding onComplete={() => setView('app')} />

  // ── Dashboard shell ──
  return (
    <div className="app-container">
      <aside className="sidebar">
        {/* Brand */}
        <div className="brand">
          <div className="brand-icon">C</div>
          <div>
            <div className="brand-name">ClassifyAI</div>
            <div className="brand-tagline">{organization?.name ?? 'Data Governance'}</div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="nav-links" style={{ paddingTop:16 }}>
          {NAV.map(({ id, label, Icon }) => (
            <button key={id} className={`nav-item${activeTab === id ? ' active' : ''}`} onClick={() => setActiveTab(id)}>
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar">
              <User size={14} />
            </div>
            <div className="user-info">
              <span className="user-name">{user?.email?.split('@')[0] ?? 'Demo User'}</span>
              <span className="user-role">{organization?.name ?? 'Demo Workspace'}</span>
            </div>
          </div>
          {isSupabaseConfigured && (
            <button onClick={signOut}
              title="Sign out"
              style={{ background:'transparent', border:'none', color:'#94a3b8', cursor:'pointer', padding:'6px', borderRadius:6, display:'flex', alignItems:'center', marginLeft:'auto' }}>
              <LogOut size={14} />
            </button>
          )}
        </div>
      </aside>

      <main className="main-content">
        {activeTab === 'overview'    && <Dashboard     onNavigate={t => setActiveTab(t as Tab)} />}
        {activeTab === 'connections' && <SourceManager onNavigate={t => setActiveTab(t as Tab)} />}
        {activeTab === 'scan'        && <ScanWizard    onNavigate={t => setActiveTab(t as Tab)} />}
        {activeTab === 'results'     && <AssetDictionary />}
        {activeTab === 'policies'    && <Policies />}
        {activeTab === 'settings'    && <Settings />}
      </main>
    </div>
  )
}

// ── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
