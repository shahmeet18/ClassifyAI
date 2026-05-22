import React, { useState, useEffect, useRef } from "react";
import {
  Database, CheckCircle2, Circle, RefreshCw, Play, ChevronRight,
  Shield, ShieldAlert, CreditCard, Stethoscope, Lock, BarChart3,
  AlertTriangle, Check, X, Plus, Clock, Cpu, Zap,
} from "lucide-react";

type Step = 1 | 2 | 3;

interface Source {
  id: string;
  name: string;
  description: string;
  source_type: string;
  last_scanned_at: string | null;
  scan_status: string;
  sampling_rate: number;
}

interface Policy {
  id: string;
  name: string;
  description: string;
  group_name: string;
  is_active: boolean;
}

interface ScanResult {
  status?: string;
  message?: string;
  assets_discovered?: number;
  pii_found?: number;
  tables_scanned?: number;
  columns_classified?: number;
}

interface ScanProgressData {
  status: string;
  phase: string;
  phase_label: string;
  phase_number: number;
  total_phases: number;
  current_table: string;
  current_column: string;
  columns_done: number;
  columns_total: number;
  tables_done: number;
  tables_total: number;
  elapsed_seconds: number;
  log: string[];
}

function formatElapsed(secs: number) {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s < 10 ? "0" : ""}${s}s`;
}

interface ClassifiedAsset {
  id: string;
  display_name: string;
  fully_qualified_name: string;
  asset_type: string;
  metadata_json: { data_type?: string } | null;
  classification: {
    sensitivity_level: string;
    data_type_tags: string[];
    regulatory_tags: string[];
    business_domain: string;
    confidence_score: number;
  } | null;
  description_details: { business_description?: string; ai_suggested_description?: string } | null;
}

function tableFromFqn(fqn: string): string {
  const parts = fqn.split(".");
  return parts.length >= 2 ? parts[parts.length - 2] : fqn;
}

const GROUP_META: Record<string, { color: string; icon: React.ComponentType<any>; desc: string }> = {
  GDPR:   { color: "#2563eb", icon: Shield,      desc: "EU personal data protection" },
  HIPAA:  { color: "#1e8c5a", icon: Stethoscope, desc: "Healthcare data privacy (US)" },
  PCI:    { color: "#c0392b", icon: CreditCard,  desc: "Payment card data security" },
  Custom: { color: "#6e7e85", icon: Lock,        desc: "Your organization's rules" },
};

function sensitivityBadgeClass(level: string) {
  return `badge badge-${level.toLowerCase()}`;
}

interface Props {
  onNavigate: (tab: any) => void;
}

export default function ScanWizard({ onNavigate }: Props) {
  const [step, setStep] = useState<Step>(1);

  // Step 1
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [loadingSources, setLoadingSources] = useState(true);

  // Step 2
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set(["GDPR", "HIPAA", "PCI"]));
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["GDPR"]));
  const [loadingPolicies, setLoadingPolicies] = useState(false);

  // Step 3
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [assets, setAssets] = useState<ClassifiedAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [filterLevel, setFilterLevel] = useState<string>("all");
  const [scanProgress, setScanProgress] = useState<ScanProgressData | null>(null);
  const [localElapsed, setLocalElapsed] = useState(0);
  const pollRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef    = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const preScanAtRef  = useRef<string | null>(null);
  const scanStartRef  = useRef<Date | null>(null);

  useEffect(() => {
    fetchSources();
  }, []);

  useEffect(() => {
    if (step === 2) fetchPolicies();
  }, [step]);

  useEffect(() => {
    return () => {
      if (pollRef.current)     clearInterval(pollRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
      if (timerRef.current)    clearInterval(timerRef.current);
      if (timeoutRef.current)  clearTimeout(timeoutRef.current);
    };
  }, []);

  const fetchSources = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/v1/sources");
      const data = await res.json();
      setSources(data);
    } catch {}
    setLoadingSources(false);
  };

  const fetchPolicies = async () => {
    setLoadingPolicies(true);
    try {
      const res = await fetch("http://localhost:8000/api/v1/policies");
      const data = await res.json();
      setPolicies(data);
    } catch {}
    setLoadingPolicies(false);
  };

  const fetchAssets = async (sourceId: string) => {
    setLoadingAssets(true);
    try {
      // source_id filter returns all asset types — filter to columns client-side
      const res = await fetch(`http://localhost:8000/api/v1/assets?source_id=${sourceId}`);
      if (res.ok) {
        const data: any[] = await res.json();
        setAssets((data || []).filter(a => a.asset_type === "column"));
      }
    } catch {}
    setLoadingAssets(false);
  };

  const toggleGroup = (group: string) => {
    setSelectedGroups(prev => {
      const next = new Set(prev);
      next.has(group) ? next.delete(group) : next.add(group);
      return next;
    });
  };

  const toggleExpand = (group: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(group) ? next.delete(group) : next.add(group);
      return next;
    });
  };

  const stopAllPolling = () => {
    if (pollRef.current)     { clearInterval(pollRef.current);     pollRef.current = null; }
    if (progressRef.current) { clearInterval(progressRef.current); progressRef.current = null; }
    if (timerRef.current)    { clearInterval(timerRef.current);    timerRef.current = null; }
    if (timeoutRef.current)  { clearTimeout(timeoutRef.current);   timeoutRef.current = null; }
  };

  const stopPolling = stopAllPolling;

  const runScan = async () => {
    if (!selectedSource) return;
    preScanAtRef.current = selectedSource.last_scanned_at;
    scanStartRef.current = new Date();

    setScanning(true);
    setScanError(null);
    setScanResult(null);
    setScanProgress(null);
    setLocalElapsed(0);
    setStep(3);

    try {
      const res = await fetch(`http://localhost:8000/api/v1/sources/${selectedSource.id}/scan`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        setScanError(err.detail || "Scan failed to start.");
        setScanning(false);
        return;
      }
      // 1. Local elapsed timer (updates every second)
      timerRef.current = setInterval(() => {
        if (scanStartRef.current)
          setLocalElapsed(Math.round((Date.now() - scanStartRef.current.getTime()) / 1000));
      }, 1000);

      // 2. Progress polling (every 1.5 s)
      progressRef.current = setInterval(async () => {
        try {
          const r = await fetch(`http://localhost:8000/api/v1/sources/${selectedSource.id}/progress`);
          if (r.ok) setScanProgress(await r.json());
        } catch {}
      }, 1500);

      // 3. Completion polling — watch last_scanned_at
      pollRef.current = setInterval(async () => {
        try {
          const s = await fetch("http://localhost:8000/api/v1/sources");
          const srcs: Source[] = await s.json();
          const updated = srcs.find(x => x.id === selectedSource.id);
          if (updated && updated.last_scanned_at !== preScanAtRef.current) {
            stopAllPolling();
            setScanning(false);
            await fetchAssets(selectedSource.id);
          }
        } catch {}
      }, 3000);

      // Safety timeout: 10 min ceiling
      timeoutRef.current = setTimeout(async () => {
        stopAllPolling();
        setScanning(false);
        await fetchAssets(selectedSource.id);
      }, 600_000);

    } catch {
      setScanError("Network error. Could not start scan.");
      setScanning(false);
    }
  };

  const groupNames = Array.from(
    new Set(policies.map(p => p.group_name))
  ).filter(Boolean);

  const knownGroups = ["GDPR", "HIPAA", "PCI", "Custom"];
  const extraGroups = groupNames.filter(g => !knownGroups.includes(g));
  const allGroups = [...knownGroups.filter(g => groupNames.includes(g)), ...extraGroups];

  const filteredAssets = filterLevel === "all"
    ? assets
    : assets.filter(a => a.classification?.sensitivity_level === filterLevel);

  const sensitivityCounts = assets.reduce<Record<string, number>>((acc, a) => {
    const lvl = a.classification?.sensitivity_level || "Unknown";
    acc[lvl] = (acc[lvl] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="page-wrapper fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Scan & Classify</h1>
          <p className="page-subtitle">Connect a data source, choose your policies, and run AI-powered classification.</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="steps" style={{ marginBottom: 28 }}>
        {[
          { n: 1, label: "Select Source" },
          { n: 2, label: "Choose Policies" },
          { n: 3, label: "Results" },
        ].map(({ n, label }) => {
          const state = step > n ? "done" : step === n ? "active" : "";
          return (
            <div key={n} className={`step ${state}`}>
              <div className="step-num">
                {step > n ? <Check size={14} /> : n}
              </div>
              <span className="step-label">{label}</span>
            </div>
          );
        })}
      </div>

      {/* ── Step 1: Select Source ── */}
      {step === 1 && (
        <div className="card fade-in">
          <div className="card-header">
            <span className="card-title"><Database size={16} /> Choose a database to scan</span>
          </div>
          <div style={{ padding: "20px 22px" }}>
            {loadingSources ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
                <RefreshCw size={24} className="spin" style={{ margin: "0 auto 12px", display: "block" }} />
                Loading sources…
              </div>
            ) : sources.length === 0 ? (
              <div className="empty-state">
                <Database size={40} />
                <h3>No databases connected</h3>
                <p>Go to Connections to add your first data source before scanning.</p>
                <button className="btn btn-primary" onClick={() => onNavigate("connections")}>
                  <Plus size={14} /> Add Connection
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {sources.map(source => (
                  <div
                    key={source.id}
                    className={`source-card${selectedSource?.id === source.id ? " selected" : ""}`}
                    onClick={() => setSelectedSource(source)}
                  >
                    <div className="source-card-icon">
                      <Database size={20} />
                    </div>
                    <div className="source-card-body">
                      <div className="source-card-name" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {source.name}
                        <span className="badge badge-tag">{source.source_type.toUpperCase()}</span>
                      </div>
                      <div className="source-card-meta">
                        {source.description || "No description"} ·{" "}
                        {source.last_scanned_at
                          ? `Last scanned ${new Date(source.last_scanned_at).toLocaleDateString()}`
                          : "Never scanned"}
                      </div>
                    </div>
                    {selectedSource?.id === source.id && (
                      <CheckCircle2 size={20} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
                    )}
                    {selectedSource?.id !== source.id && (
                      <Circle size={20} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          {selectedSource && (
            <div style={{ padding: "14px 22px", borderTop: "1px solid var(--card-border)", display: "flex", justifyContent: "flex-end" }}>
              <button className="btn btn-primary" onClick={() => setStep(2)}>
                Continue <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Choose Policies ── */}
      {step === 2 && (
        <div className="fade-in">
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <span className="card-title"><ShieldAlert size={16} /> Select policy groups to enforce</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setStep(1)}>Back</button>
              </div>
            </div>
            <div style={{ padding: "16px 22px" }}>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
                Selected groups will be evaluated during classification. Toggle groups on or off, and expand them to manage individual rules.
              </p>

              {loadingPolicies ? (
                <div style={{ textAlign: "center", padding: 30, color: "var(--text-muted)" }}>
                  <RefreshCw size={20} className="spin" style={{ margin: "0 auto", display: "block" }} />
                </div>
              ) : (
                allGroups.map(group => {
                  const meta = GROUP_META[group] || GROUP_META["Custom"];
                  const groupPolicies = policies.filter(p => p.group_name === group);
                  const isSelected = selectedGroups.has(group);
                  const isExpanded = expandedGroups.has(group);
                  const Icon = meta.icon;

                  return (
                    <div key={group} className="policy-group">
                      <div className="policy-group-header" onClick={() => toggleExpand(group)}>
                        <div className="policy-group-header-left">
                          <div className="policy-group-dot" style={{ background: meta.color }} />
                          <div>
                            <div className="policy-group-name" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <Icon size={15} style={{ color: meta.color }} />
                              {group}
                            </div>
                            <div className="policy-group-count">{meta.desc} · {groupPolicies.length} rules</div>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <label className="toggle" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleGroup(group)}
                            />
                            <span className="toggle-slider" />
                          </label>
                          <ChevronRight
                            size={16}
                            style={{
                              color: "var(--text-muted)",
                              transform: isExpanded ? "rotate(90deg)" : "rotate(0)",
                              transition: "transform 0.2s",
                            }}
                          />
                        </div>
                      </div>

                      {isExpanded && groupPolicies.length > 0 && (
                        <div className="policy-group-body">
                          {groupPolicies.map(policy => (
                            <div key={policy.id} className="policy-row">
                              <div className="policy-row-left">
                                <div className="policy-row-name">{policy.name}</div>
                                <div className="policy-row-desc">{policy.description}</div>
                              </div>
                              <span className={`badge ${policy.is_active ? "badge-public" : ""}`}
                                style={!policy.is_active ? { background: "var(--color-light)", color: "var(--text-muted)" } : {}}>
                                {policy.is_active ? "Active" : "Inactive"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {isExpanded && groupPolicies.length === 0 && (
                        <div className="policy-group-body">
                          <div style={{ padding: "14px 18px", fontSize: 13, color: "var(--text-muted)" }}>
                            No policies in this group yet. Add them in Policy Rules.
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Scan config summary */}
          <div className="card" style={{ padding: "16px 22px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ color: "var(--text-secondary)" }}>Source:</span>
              <strong>{selectedSource?.name}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 8 }}>
              <span style={{ color: "var(--text-secondary)" }}>Sampling rate:</span>
              <strong>{selectedSource?.sampling_rate}%</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 8 }}>
              <span style={{ color: "var(--text-secondary)" }}>Active policy groups:</span>
              <strong>{selectedGroups.size > 0 ? Array.from(selectedGroups).join(", ") : "None"}</strong>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button className="btn btn-secondary" onClick={() => setStep(1)}>Back</button>
            <button className="btn btn-primary" onClick={runScan}>
              <Play size={14} /> Run Classification Scan
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Results ── */}
      {step === 3 && (
        <div className="fade-in">
          {scanning ? (
            <div className="card" style={{ padding: "32px 36px" }}>
              {/* ── Header row ── */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
                    <RefreshCw size={18} className="spin" style={{ color: "var(--color-accent)" }} />
                    Scanning {selectedSource?.name}
                  </h2>
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
                    {scanProgress?.phase_label || "Initialising…"}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--text-muted)", background: "rgba(0,0,0,.04)", padding: "6px 12px", borderRadius: 20 }}>
                  <Clock size={13} />
                  {formatElapsed(scanProgress?.elapsed_seconds ?? localElapsed)}
                </div>
              </div>

              {/* ── Phase stepper ── */}
              <div style={{ display: "flex", alignItems: "center", marginBottom: 28, gap: 0 }}>
                {[
                  { n: 1, label: "Schema Discovery", icon: Database },
                  { n: 2, label: "Classifying Columns", icon: Cpu },
                  { n: 3, label: "AI Descriptions", icon: Zap },
                  { n: 4, label: "Complete", icon: Check },
                ].map(({ n, label, icon: Icon }, i) => {
                  const current = scanProgress?.phase_number ?? 1;
                  const done    = current > n;
                  const active  = current === n;
                  return (
                    <React.Fragment key={n}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 90 }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: "50%",
                          background: done ? "var(--color-accent)" : active ? "var(--color-accent)" : "#e5e7eb",
                          color: done || active ? "#fff" : "#9ca3af",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          boxShadow: active ? "0 0 0 5px rgba(99,102,241,.2)" : "none",
                          transition: "all .3s",
                        }}>
                          {done ? <Check size={14} /> : <Icon size={14} />}
                        </div>
                        <div style={{
                          fontSize: 10, marginTop: 6, textAlign: "center", fontWeight: active ? 700 : 400,
                          color: active ? "var(--color-accent)" : done ? "var(--text-secondary)" : "#9ca3af",
                        }}>
                          {label}
                        </div>
                      </div>
                      {i < 3 && (
                        <div style={{
                          flex: 1, height: 2, marginBottom: 18,
                          background: current > n + 1 ? "var(--color-accent)"
                            : current === n + 1 ? "linear-gradient(90deg, var(--color-accent), #e5e7eb)"
                            : "#e5e7eb",
                          transition: "background .5s",
                        }} />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>

              {/* ── Progress bar ── */}
              <div style={{ marginBottom: 22 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-secondary)", marginBottom: 7 }}>
                  <span>
                    {scanProgress?.columns_done ?? 0}
                    {scanProgress?.columns_total ? ` / ${scanProgress.columns_total}` : ""} columns classified
                    {scanProgress?.tables_total ? ` · ${scanProgress.tables_total} tables` : ""}
                  </span>
                  {scanProgress?.columns_total ? (
                    <span style={{ fontWeight: 600, color: "var(--color-accent)" }}>
                      {Math.round((scanProgress.columns_done / scanProgress.columns_total) * 100)}%
                    </span>
                  ) : null}
                </div>
                <div style={{ height: 10, background: "#e5e7eb", borderRadius: 5, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 5,
                    background: "linear-gradient(90deg, #8b5cf6 0%, #06b6d4 100%)",
                    backgroundSize: "200% 100%",
                    animation: "shimmer 1.8s linear infinite",
                    transition: "width .6s ease",
                    width: scanProgress?.columns_total
                      ? `${Math.max(6, Math.round(
                          ((scanProgress.columns_done / scanProgress.columns_total) * 0.75
                           + ((scanProgress.phase_number - 1) / 4) * 0.25) * 100
                        ))}%`
                      : "12%",
                  }} />
                </div>
              </div>

              {/* ── Current operation ── */}
              {(scanProgress?.current_table || scanProgress?.current_column) && (
                <div style={{
                  background: "rgba(99,102,241,.06)", border: "1px solid rgba(99,102,241,.18)",
                  borderRadius: 10, padding: "11px 15px", marginBottom: 18,
                  display: "flex", alignItems: "center", gap: 12,
                }}>
                  <RefreshCw size={13} className="spin" style={{ color: "var(--color-accent)", flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, fontFamily: "monospace" }}>
                      {scanProgress?.current_table}
                      {scanProgress?.current_column && (
                        <span style={{ color: "var(--color-accent)" }}>.{scanProgress.current_column}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                      Running 7 AI agents: PII · PCI · PHI · Domain · Sensitivity · Regulatory · Description
                    </div>
                  </div>
                </div>
              )}

              {/* ── Live activity log ── */}
              {scanProgress?.log && scanProgress.log.length > 0 && (
                <div style={{
                  background: "#f8fafc", border: "1px solid var(--card-border)",
                  borderRadius: 10, padding: "12px 15px",
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.7px", color: "var(--text-muted)", marginBottom: 8 }}>
                    Live Activity
                  </div>
                  {scanProgress.log.map((entry, i) => (
                    <div key={i} style={{
                      fontSize: 12, fontFamily: "monospace", padding: "2px 0",
                      color: i === 0 ? "var(--text-primary)" : "var(--text-muted)",
                      opacity: Math.max(0.35, 1 - i * 0.12),
                      transition: "opacity .2s",
                    }}>
                      {entry}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : scanError ? (
            <div className="card" style={{ padding: "40px 32px" }}>
              <div className="alert alert-danger" style={{ marginBottom: 20 }}>
                <AlertTriangle size={16} />{scanError}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-secondary" onClick={() => { setStep(2); setScanError(null); }}>Back</button>
                <button className="btn btn-primary" onClick={runScan}><RefreshCw size={14} /> Retry</button>
              </div>
            </div>
          ) : (
            <>
              {/* Summary eval cards */}
              <div className="eval-grid">
                <div className="eval-card">
                  <div className="eval-label">Columns Classified</div>
                  <div className="eval-value">{assets.length}</div>
                  <div className="eval-sub">
                    {new Set(assets.map(a => tableFromFqn(a.fully_qualified_name))).size} tables scanned
                  </div>
                </div>
                <div className="eval-card">
                  <div className="eval-label">PII Detected</div>
                  <div className="eval-value" style={{ color: "var(--confidential)" }}>
                    {assets.filter(a =>
                      a.classification?.data_type_tags?.some(t => t.startsWith("PII"))).length}
                  </div>
                  <div className="eval-sub">columns with personal data</div>
                </div>
                <div className="eval-card">
                  <div className="eval-label">Critical / Restricted</div>
                  <div className="eval-value" style={{ color: "var(--restricted)" }}>
                    {(sensitivityCounts["Critical"] || 0) + (sensitivityCounts["Restricted"] || 0)}
                  </div>
                  <div className="eval-sub">high-risk columns</div>
                </div>
                <div className="eval-card">
                  <div className="eval-label">Scan Status</div>
                  <div className="eval-value" style={{ fontSize: 15, display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                    <CheckCircle2 size={18} style={{ color: "var(--success)" }} /> Complete
                  </div>
                  <div className="eval-sub">Scan finished successfully</div>
                </div>
              </div>

              {/* Sensitivity breakdown bar */}
              {assets.length > 0 && (
                <div className="card card-pad" style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Sensitivity Distribution</span>
                    <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
                      {["Critical","Restricted","Confidential","Internal","Public"].map(lvl => (
                        (sensitivityCounts[lvl] || 0) > 0 && (
                          <span key={lvl} style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--text-secondary)" }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", display: "inline-block" }}
                              className={`color-${lvl.toLowerCase()}`} />
                            {lvl}: {sensitivityCounts[lvl]}
                          </span>
                        )
                      ))}
                    </div>
                  </div>
                  <div className="sens-bar">
                    {["Critical","Restricted","Confidential","Internal","Public"].map(lvl => {
                      const pct = assets.length > 0 ? ((sensitivityCounts[lvl] || 0) / assets.length) * 100 : 0;
                      return pct > 0 ? (
                        <div key={lvl} className={`sens-bar-seg color-${lvl.toLowerCase()}`}
                          style={{ width: `${pct}%` }} title={`${lvl}: ${sensitivityCounts[lvl]}`} />
                      ) : null;
                    })}
                  </div>
                </div>
              )}

              {/* Filter + results table */}
              <div className="card">
                <div className="card-header">
                  <span className="card-title"><BarChart3 size={16} /> Classification Results</span>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <select
                      className="form-input"
                      value={filterLevel}
                      onChange={e => setFilterLevel(e.target.value)}
                      style={{ width: "auto", padding: "5px 10px", fontSize: 12 }}
                    >
                      <option value="all">All levels</option>
                      {["Critical","Restricted","Confidential","Internal","Public"].map(l =>
                        <option key={l} value={l}>{l}</option>
                      )}
                    </select>
                    <button className="btn btn-secondary btn-sm" onClick={() => onNavigate("results")}>
                      View Full Results →
                    </button>
                  </div>
                </div>

                {loadingAssets ? (
                  <div style={{ padding: 30, textAlign: "center", color: "var(--text-muted)" }}>
                    <RefreshCw size={20} className="spin" style={{ margin: "0 auto", display: "block" }} />
                  </div>
                ) : filteredAssets.length === 0 ? (
                  <div className="empty-state" style={{ padding: "40px 20px" }}>
                    <p style={{ margin: 0 }}>No results yet. Start the scan or check back after it completes.</p>
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Table · Column</th>
                          <th>Type</th>
                          <th>Sensitivity</th>
                          <th>Tags</th>
                          <th>Regulations</th>
                          <th style={{ textAlign: "right" }}>Confidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAssets.slice(0, 50).map(asset => {
                          const cl = asset.classification;
                          const sensitivity = cl?.sensitivity_level || "Unknown";
                          return (
                            <tr key={asset.id}>
                              <td>
                                <div style={{ fontWeight: 500, fontSize: 13 }}>{asset.display_name}</div>
                                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                                  {tableFromFqn(asset.fully_qualified_name)}
                                </div>
                              </td>
                              <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                                {asset.metadata_json?.data_type || "—"}
                              </td>
                              <td>
                                <span className={sensitivityBadgeClass(sensitivity)}>{sensitivity}</span>
                              </td>
                              <td>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                  {(cl?.data_type_tags || []).slice(0, 3).map(t => (
                                    <span key={t} className="badge badge-tag" style={{ fontSize: 10 }}>{t}</span>
                                  ))}
                                </div>
                              </td>
                              <td>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                  {(cl?.regulatory_tags || []).map(t => (
                                    <span key={t} className="badge badge-regulatory" style={{ fontSize: 10 }}>{t}</span>
                                  ))}
                                </div>
                              </td>
                              <td style={{ textAlign: "right", fontSize: 12, color: "var(--text-secondary)" }}>
                                {cl?.confidence_score ? `${Math.round(cl.confidence_score * 100)}%` : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {filteredAssets.length > 50 && (
                      <div style={{ padding: "10px 16px", fontSize: 12, color: "var(--text-secondary)", textAlign: "center" }}>
                        Showing 50 of {filteredAssets.length} results.{" "}
                        <button className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }} onClick={() => onNavigate("results")}>
                          View all →
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 16, display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button className="btn btn-secondary" onClick={() => { setStep(1); setSelectedSource(null); setScanResult(null); setAssets([]); }}>
                  New Scan
                </button>
                <button className="btn btn-primary" onClick={() => onNavigate("results")}>
                  <BarChart3 size={14} /> View Full Results
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
