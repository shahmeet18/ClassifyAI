import React, { useState, useEffect } from "react";
import {
  Database,
  Shield,
  CheckCircle2,
  BarChart3,
  RefreshCw,
  Play,
  ScanLine,
  Plus,
  AlertTriangle,
  TrendingUp,
  Zap,
  FileText,
  Clock,
} from "lucide-react";

interface Source {
  id: string;
  name: string;
  description: string;
  source_type: string;
  last_scanned_at: string | null;
  sampling_rate: number;
  scan_status: string;
}

interface Stats {
  total_sources: number;
  total_assets: number;
  total_tables: number;
  total_columns: number;
  coverage_percentage: number;
  pending_reviews: number;
  sensitivity_breakdown: Record<string, number>;
  average_risk_score: number;
  database_profiles?: any[];
}

interface Props {
  onNavigate: (tab: any) => void;
}

// Sensitivity colour palette
const SENS_COLOR: Record<string, string> = {
  Critical:     "#dc2626",
  Restricted:   "#ea580c",
  Confidential: "#d97706",
  Internal:     "#2563eb",
  Public:       "#059669",
};
const SENS_BG: Record<string, string> = {
  Critical:     "rgba(220,38,38,.1)",
  Restricted:   "rgba(234,88,12,.1)",
  Confidential: "rgba(217,119,6,.1)",
  Internal:     "rgba(37,99,235,.1)",
  Public:       "rgba(5,150,105,.1)",
};
const SENS_ORDER = ["Critical", "Restricted", "Confidential", "Internal", "Public"];

function timeAgo(iso?: string | null) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "< 1 hr ago";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function Dashboard({ onNavigate }: Props) {
  const [sources, setSources]       = useState<Source[]>([]);
  const [stats, setStats]           = useState<Stats | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refreshDone, setRefreshDone]     = useState(false);

  const load = async () => {
    try {
      const [sRes, stRes] = await Promise.all([
        fetch("http://localhost:8000/api/v1/sources"),
        fetch("http://localhost:8000/api/v1/dashboard/stats"),
      ]);
      if (sRes.ok)  setSources(await sRes.json());
      if (stRes.ok) setStats(await stRes.json());
      setLastRefreshed(new Date());
    } catch {}
    setLoading(false);
  };

  const refresh = async () => {
    setRefreshing(true);
    setRefreshDone(false);
    await load();
    setRefreshing(false);
    setRefreshDone(true);
    setTimeout(() => setRefreshDone(false), 2500);
  };

  useEffect(() => { load(); }, []);

  const totalCols  = stats?.total_columns || 0;
  const breakdown  = stats?.sensitivity_breakdown || {};
  const hasData    = totalCols > 0;

  // Highest-risk level present
  const topRiskLevel = SENS_ORDER.find(l => (breakdown[l] || 0) > 0) || null;

  return (
    <div className="page-wrapper fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Overview</h1>
          <p className="page-subtitle">Data governance health across your connected sources.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {lastRefreshed && !refreshing && (
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {refreshDone ? "✓ Updated just now" : `Updated ${lastRefreshed.toLocaleTimeString()}`}
            </span>
          )}
          <button className="btn btn-secondary" onClick={refresh} disabled={refreshing}>
            <RefreshCw size={13} className={refreshing ? "spin" : ""} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0", color: "var(--text-muted)", gap: 10 }}>
          <RefreshCw size={18} className="spin" /> Loading workspace data…
        </div>
      ) : (
        <>
          {/* ── Stat cards ── */}
          <div className="stats-grid">
            <div className="card stat-card">
              <div className="stat-label">
                Data Sources
                <div className="stat-icon-wrap"><Database size={14} /></div>
              </div>
              <div className="stat-value">{stats?.total_sources ?? 0}</div>
              <div className="stat-sub">
                {sources.filter(s => s.last_scanned_at).length} scanned
                {sources.length > 0 && ` · ${sources.length - sources.filter(s => s.last_scanned_at).length} pending`}
              </div>
            </div>

            <div className="card stat-card">
              <div className="stat-label">
                Columns Classified
                <div className="stat-icon-wrap"><Shield size={14} /></div>
              </div>
              <div className="stat-value">{totalCols.toLocaleString()}</div>
              <div className="stat-sub">across {stats?.total_tables ?? 0} tables</div>
            </div>

            <div className="card stat-card">
              <div className="stat-label">
                Coverage
                <div className="stat-icon-wrap"><CheckCircle2 size={14} /></div>
              </div>
              <div className="stat-value"
                style={{ color: (stats?.coverage_percentage ?? 0) >= 80 ? "var(--success)" : "var(--warning)" }}>
                {stats?.coverage_percentage ?? 0}%
              </div>
              <div className="stat-sub">of columns mapped</div>
            </div>

            <div className="card stat-card">
              <div className="stat-label">
                Avg Risk Score
                <div className="stat-icon-wrap"><TrendingUp size={14} /></div>
              </div>
              <div className="stat-value"
                style={{ color: (stats?.average_risk_score ?? 0) > 60 ? "var(--restricted)" : (stats?.average_risk_score ?? 0) > 30 ? "var(--confidential)" : "var(--text-primary)" }}>
                {stats?.average_risk_score ?? 0}
              </div>
              <div className="stat-sub">
                {topRiskLevel
                  ? <span style={{ color: SENS_COLOR[topRiskLevel] }}>highest: {topRiskLevel}</span>
                  : "no sensitive data found"}
              </div>
            </div>
          </div>

          {/* ── No data yet: getting-started prompt ── */}
          {sources.length === 0 && (
            <div className="card card-pad fade-in" style={{ textAlign: "center", padding: "48px 24px", marginBottom: 20 }}>
              <Database size={40} style={{ color: "var(--text-muted)", margin: "0 auto 16px", display: "block" }} />
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Connect your first data source</h2>
              <p style={{ color: "var(--text-secondary)", fontSize: 13, maxWidth: 400, margin: "0 auto 20px" }}>
                Add a database or upload a CSV file to start AI-powered classification and governance.
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button className="btn btn-primary" onClick={() => onNavigate("connections")}>
                  <Plus size={13} /> Add Connection
                </button>
                <button className="btn btn-secondary" onClick={() => onNavigate("scan")}>
                  <ScanLine size={13} /> Upload CSV
                </button>
              </div>
            </div>
          )}

          {/* ── Quick actions ── */}
          <div className="quick-actions" style={{ marginBottom: 24 }}>
            <div className="card quick-action-card" onClick={() => onNavigate("connections")}>
              <div className="quick-action-icon"><Plus size={18} /></div>
              <div className="quick-action-body">
                <div className="quick-action-label">Add Connection</div>
                <div className="quick-action-sub">Connect a new database or upload CSV</div>
              </div>
            </div>

            <div className="card quick-action-card" onClick={() => onNavigate("scan")}>
              <div className="quick-action-icon"><ScanLine size={18} /></div>
              <div className="quick-action-body">
                <div className="quick-action-label">Scan & Classify</div>
                <div className="quick-action-sub">Run AI classification pipeline</div>
              </div>
            </div>

            <div className="card quick-action-card" onClick={() => onNavigate("results")}>
              <div className="quick-action-icon"><BarChart3 size={18} /></div>
              <div className="quick-action-body">
                <div className="quick-action-label">Browse Results</div>
                <div className="quick-action-sub">Review classified columns &amp; tags</div>
              </div>
            </div>

            <div className="card quick-action-card" onClick={() => onNavigate("policies")}>
              <div className="quick-action-icon"><Shield size={18} /></div>
              <div className="quick-action-body">
                <div className="quick-action-label">Policy Rules</div>
                <div className="quick-action-sub">GDPR, HIPAA, PCI-DSS policies</div>
              </div>
            </div>
          </div>

          {/* ── Two column: source health + sensitivity ── */}
          {sources.length > 0 && (
            <div className="two-col">
              {/* Source health */}
              <div className="card" style={{ overflow: "hidden" }}>
                <div className="card-header">
                  <span className="card-title"><Database size={15} /> Source Health</span>
                  <button className="btn btn-secondary btn-sm" onClick={() => onNavigate("connections")}>
                    Manage →
                  </button>
                </div>
                <div style={{ padding: "4px 0 8px" }}>
                  {sources.map((source, idx) => {
                    const profile  = stats?.database_profiles?.find((p: any) => p.source_id === source.id);
                    const hasScan  = !!source.last_scanned_at;
                    const colCount = profile?.columns_count || 0;
                    const clsCount = profile?.classified_count || 0;
                    const avgRisk  = profile?.average_risk_score || 0;
                    const riskColor = avgRisk > 60 ? "var(--restricted)" : avgRisk > 30 ? "var(--confidential)" : "var(--success)";
                    const srcBreak: Record<string,number> = profile?.sensitivity_breakdown || {};
                    const srcTotal = Object.values(srcBreak).reduce((a,b) => a + b, 0);
                    const isScanning = source.scan_status === "Scanning";

                    return (
                      <div key={source.id} style={{
                        padding: "14px 20px",
                        borderBottom: idx < sources.length - 1 ? "1px solid var(--color-light)" : "none",
                      }}>
                        {/* Row 1: Name + badges + scan button */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <div style={{
                            width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                            background: isScanning ? "var(--info)" : hasScan ? "var(--success)" : "var(--text-muted)",
                          }} />
                          <span style={{ fontWeight: 600, fontSize: 13, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {source.name}
                          </span>
                          <span className="badge badge-tag" style={{ fontSize: 10, textTransform: "uppercase", flexShrink: 0 }}>
                            {source.source_type}
                          </span>
                          {isScanning && (
                            <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 10, background: "var(--info-bg)", color: "var(--info)", display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                              <RefreshCw size={8} className="spin" /> Scanning
                            </span>
                          )}
                          <button className="btn btn-secondary btn-sm btn-icon" title="Run scan"
                            onClick={() => onNavigate("scan")} style={{ flexShrink: 0 }}>
                            <Play size={11} />
                          </button>
                        </div>

                        {/* Row 2: Scan date + column counts */}
                        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11.5, color: "var(--text-secondary)", marginBottom: hasScan && srcTotal > 0 ? 8 : 0, paddingLeft: 16 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <Clock size={10} />
                            {hasScan ? timeAgo(source.last_scanned_at) : "Not scanned yet"}
                          </span>
                          {colCount > 0 && (
                            <>
                              <span style={{ color: "var(--card-border)" }}>·</span>
                              <span>{clsCount.toLocaleString()} / {colCount.toLocaleString()} columns classified</span>
                            </>
                          )}
                          {hasScan && avgRisk > 0 && (
                            <>
                              <span style={{ color: "var(--card-border)" }}>·</span>
                              <span style={{ color: riskColor, fontWeight: 600 }}>Risk {avgRisk}</span>
                            </>
                          )}
                        </div>

                        {/* Row 3: Mini sensitivity bar */}
                        {hasScan && srcTotal > 0 && (
                          <div style={{ paddingLeft: 16 }}>
                            <div style={{ height: 5, borderRadius: 3, overflow: "hidden", display: "flex", background: "var(--color-light)" }}>
                              {SENS_ORDER.map(lvl => {
                                const cnt = srcBreak[lvl] || 0;
                                const pct = srcTotal > 0 ? (cnt / srcTotal) * 100 : 0;
                                return pct > 0 ? (
                                  <div key={lvl} style={{ width: `${pct}%`, height: "100%", background: SENS_COLOR[lvl] }}
                                    title={`${lvl}: ${cnt}`} />
                                ) : null;
                              })}
                            </div>
                            <div style={{ display: "flex", gap: 8, marginTop: 5, flexWrap: "wrap" }}>
                              {SENS_ORDER.filter(l => (srcBreak[l] || 0) > 0).map(lvl => (
                                <span key={lvl} style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 3, color: SENS_COLOR[lvl], fontWeight: 600 }}>
                                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: SENS_COLOR[lvl], display: "inline-block" }} />
                                  {srcBreak[lvl]} {lvl}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Not yet scanned */}
                        {!hasScan && (
                          <div style={{ paddingLeft: 16, marginTop: 4 }}>
                            <button className="btn btn-secondary btn-sm" style={{ fontSize: 11 }} onClick={() => onNavigate("scan")}>
                              <Zap size={10} /> Run first scan
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right column: sensitivity profile + alerts */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                {/* Sensitivity profile */}
                <div className="card card-pad">
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 7 }}>
                    <BarChart3 size={14} style={{ color: "var(--color-accent)" }} />
                    Sensitivity Profile
                  </div>

                  {!hasData ? (
                    <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>
                      Scan a source to see the sensitivity breakdown.
                    </div>
                  ) : (
                    <>
                      {/* Stacked bar */}
                      <div style={{ height: 10, borderRadius: 6, overflow: "hidden", display: "flex", marginBottom: 16, background: "var(--color-light)" }}>
                        {SENS_ORDER.map(lvl => {
                          const pct = totalCols > 0 ? ((breakdown[lvl] || 0) / totalCols) * 100 : 0;
                          return pct > 0 ? (
                            <div key={lvl}
                              style={{ width: `${pct}%`, height: "100%", background: SENS_COLOR[lvl], transition: "width .3s" }}
                              title={`${lvl}: ${breakdown[lvl]}`} />
                          ) : null;
                        })}
                      </div>

                      {/* Legend */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                        {SENS_ORDER.map(lvl => {
                          const count = breakdown[lvl] || 0;
                          if (!count) return null;
                          const pct = totalCols > 0 ? Math.round((count / totalCols) * 100) : 0;
                          return (
                            <div key={lvl} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <span style={{
                                width: 28, textAlign: "right", fontSize: 12, fontWeight: 700,
                                color: SENS_COLOR[lvl],
                              }}>{pct}%</span>
                              <div style={{ flex: 1, height: 4, background: "var(--color-light)", borderRadius: 2, overflow: "hidden" }}>
                                <div style={{ width: `${pct}%`, height: "100%", background: SENS_COLOR[lvl], borderRadius: 2 }} />
                              </div>
                              <span style={{ fontSize: 11, padding: "1px 8px", borderRadius: 10, background: SENS_BG[lvl], color: SENS_COLOR[lvl], fontWeight: 600, minWidth: 80, textAlign: "center" }}>
                                {lvl}
                              </span>
                              <span style={{ fontSize: 11, color: "var(--text-secondary)", minWidth: 28, textAlign: "right" }}>
                                {count}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--color-light)", fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
                        <FileText size={11} /> {totalCols.toLocaleString()} total columns · {stats?.coverage_percentage ?? 0}% coverage
                      </div>
                    </>
                  )}
                </div>

                {/* Pending reviews alert */}
                {(stats?.pending_reviews ?? 0) > 0 && (
                  <div className="card card-pad" style={{ background: "var(--warning-bg)", borderColor: "rgba(194,118,10,0.25)" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <AlertTriangle size={15} style={{ color: "var(--warning)", marginTop: 1, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--warning)" }}>
                          {stats?.pending_reviews} column{(stats?.pending_reviews ?? 0) > 1 ? "s" : ""} need review
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>
                          AI classifications flagged for human verification.
                        </div>
                        <button className="btn btn-sm" style={{ marginTop: 10, background: "var(--warning)", color: "white", border: "none" }}
                          onClick={() => onNavigate("results")}>
                          Review Now →
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* High sensitivity alert */}
                {((breakdown["Critical"] || 0) + (breakdown["Restricted"] || 0)) > 0 && (
                  <div className="card card-pad" style={{ background: "rgba(220,38,38,.04)", borderColor: "rgba(220,38,38,.18)" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <Shield size={15} style={{ color: "#dc2626", marginTop: 1, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#dc2626" }}>
                          {(breakdown["Critical"] || 0) + (breakdown["Restricted"] || 0)} high-risk columns detected
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>
                          Critical or Restricted data requires compliance review.
                        </div>
                        <button className="btn btn-sm" style={{ marginTop: 10, background: "#dc2626", color: "white", border: "none" }}
                          onClick={() => onNavigate("results")}>
                          View Details →
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
