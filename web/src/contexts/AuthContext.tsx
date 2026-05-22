import React, { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import type { User, Session } from '@supabase/supabase-js'

export interface Organization {
  id: string
  name: string
  slug: string
  plan?: string
}

export interface Profile {
  id: string
  full_name: string | null
  organization_id: string | null
  role: string
}

interface AuthCtx {
  user: User | null
  session: Session | null
  profile: Profile | null
  organization: Organization | null
  loading: boolean
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  createOrganization: (name: string) => Promise<{ error: Error | null; org: Organization | null }>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthCtx | undefined>(undefined)

// ─── demo fallback user (when Supabase is not configured) ────────────────────
const DEMO_USER: AuthCtx = {
  user: { id: 'demo', email: 'demo@classifyai.io' } as any,
  session: null,
  profile: { id: 'demo', full_name: 'Demo User', organization_id: 'demo-org', role: 'admin' },
  organization: { id: 'demo-org', name: 'Demo Workspace', slug: 'demo-workspace' },
  loading: false,
  signUp: async () => ({ error: null }),
  signIn: async () => ({ error: null }),
  signOut: async () => {},
  createOrganization: async () => ({ error: null, org: null }),
  refreshProfile: async () => {},
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]         = useState<User | null>(null)
  const [session, setSession]   = useState<Session | null>(null)
  const [profile, setProfile]   = useState<Profile | null>(null)
  const [org, setOrg]           = useState<Organization | null>(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) { setLoading(false); return }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session); setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else { setProfile(null); setOrg(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  const fetchProfile = async (uid: string) => {
    if (!supabase) return
    try {
      const { data: p } = await supabase.from('profiles').select('*').eq('id', uid).single()
      if (p) {
        setProfile(p)
        if (p.organization_id) {
          const { data: o } = await supabase.from('organizations').select('*').eq('id', p.organization_id).single()
          if (o) setOrg(o)
        }
      }
    } finally { setLoading(false) }
  }

  const signUp = async (email: string, password: string, fullName: string) => {
    if (!supabase) return { error: new Error('Supabase not configured') }
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } })
    if (!error && data.user) {
      await supabase.from('profiles').upsert({ id: data.user.id, full_name: fullName, role: 'admin' })
    }
    return { error: error as Error | null }
  }

  const signIn = async (email: string, password: string) => {
    if (!supabase) return { error: new Error('Supabase not configured') }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error as Error | null }
  }

  const signOut = async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setProfile(null); setOrg(null)
  }

  const createOrganization = async (name: string) => {
    if (!supabase || !user) return { error: new Error('Not authenticated'), org: null }
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Math.random().toString(36).slice(2,6)
    const { data: newOrg, error } = await supabase
      .from('organizations').insert({ name, slug, owner_id: user.id }).select().single()
    if (!error && newOrg) {
      await supabase.from('profiles').update({ organization_id: newOrg.id }).eq('id', user.id)
      setOrg(newOrg)
      setProfile(p => p ? { ...p, organization_id: newOrg.id } : p)
    }
    return { error: error as Error | null, org: newOrg ?? null }
  }

  const refreshProfile = async () => { if (user) await fetchProfile(user.id) }

  return (
    <AuthContext.Provider value={{ user, session, profile, organization: org, loading, signUp, signIn, signOut, createOrganization, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  // If Supabase is not configured, return demo context
  if (!isSupabaseConfigured) return DEMO_USER
  return ctx
}
