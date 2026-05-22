import React, { useState, useEffect, useRef } from "react";
import {
  Database,
  Plus,
  RefreshCw,
  Trash2,
  Play,
  CheckCircle2,
  AlertTriangle,
  Settings2,
  Calendar,
  Shield,
  X,
  Upload,
  FileText,
} from "lucide-react";

interface DataSource {
  id: string;
  name: string;
  description: string;
  source_type: string;
  connection_config: any;
  scan_schedule: string;
  sampling_rate: number;
  last_scanned_at: string | null;
  scan_status: string;
}

interface Props {
  onNavigate?: (tab: any) => void;
}

export default function SourceManager({ onNavigate }: Props) {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sourceType, setSourceType] = useState("postgres");
  const [schedule, setSchedule] = useState("0 0 * * *");
  const [samplingRate, setSamplingRate] = useState(10);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [database, setDatabase] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [account, setAccount] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [bucket, setBucket] = useState("");
  const [region, setRegion] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testMessages, setTestMessages] = useState<Record<string, string>>({});

  // CSV upload state
  const [showCsvUpload, setShowCsvUpload]         = useState(false);
  const [csvFile, setCsvFile]                      = useState<File | null>(null);
  const [csvSourceName, setCsvSourceName]          = useState("");
  const [csvUploading, setCsvUploading]            = useState(false);
  const [csvResult, setCsvResult]                  = useState<any | null>(null);
  const [csvDragOver, setCsvDragOver]              = useState(false);
  const [csvAiProgress, setCsvAiProgress]          = useState<any | null>(null);
  const [csvSourceId, setCsvSourceId]              = useState<string | null>(null);
  const fileInputRef                               = useRef<HTMLInputElement>(null);
  const csvProgressRef                             = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSources = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/v1/sources");
      if (res.ok) setSources(await res.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    fetchSources();
    const t = setInterval(fetchSources, 5000);
    return () => clearInterval(t);
  }, []);

  const clearForm = () => {
    setName(""); setDescription(""); setHost(""); setPort(""); setDatabase("");
    setUsername(""); setPassword(""); setAccount(""); setWarehouse(""); setBucket(""); setRegion("");
    setSourceType("postgres"); setSchedule("0 0 * * *"); setSamplingRate(10);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSuccess("");

    let connectionConfig: any = {};
    if (sourceType === "postgres" || sourceType === "mysql") {
      connectionConfig = { host, port: parseInt(port) || 5432, database, username, password };
    } else if (sourceType === "snowflake") {
      connectionConfig = { account, warehouse, database, username, password };
    } else if (sourceType === "s3") {
      connectionConfig = { bucket, region };
    }

    try {
      const res = await fetch("http://localhost:8000/api/v1/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, source_type: sourceType, connection_config: connectionConfig, scan_schedule: schedule, sampling_rate: samplingRate }),
      });
      if (res.ok) {
        setSuccess(`"${name}" added successfully.`);
        setShowForm(false);
        clearForm();
        fetchSources();
      } else {
        const err = await res.json();
        setError(err.detail || "Failed to create data source.");
      }
    } catch {
      setError("Network error. Please try again.");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? All classified metadata will be removed.`)) return;
    try {
      const res = await fetch(`http://localhost:8000/api/v1/sources/${id}`, { method: "DELETE" });
      if (res.ok) { setSuccess("Source deleted."); fetchSources(); }
    } catch { setError("Failed to delete."); }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const res = await fetch(`http://localhost:8000/api/v1/sources/${id}/test`, { method: "POST" });
      const d = await res.json();
      setTestMessages(prev => ({ ...prev, [id]: d.message || "Connection tested." }));
      setTimeout(() => setTestMessages(prev => { const c = { ...prev }; delete c[id]; return c; }), 4000);
    } catch {
      setTestMessages(prev => ({ ...prev, [id]: "Test failed." }));
    }
    setTestingId(null);
  };

  // ── CSV Upload handlers ─────────────────────────────────────────────────
  const handleCsvDrop = (e: React.DragEvent) => {
    e.preventDefault(); setCsvDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith(".csv")) { setCsvFile(f); if (!csvSourceName) setCsvSourceName(f.name.replace(".csv","")); }
    else setError("Please drop a .csv file.");
  };

  const handleCsvFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setCsvFile(f); if (!csvSourceName) setCsvSourceName(f.name.replace(".csv","")); }
  };

  const stopCsvProgressPoll = () => {
    if (csvProgressRef.current) { clearInterval(csvProgressRef.current); csvProgressRef.current = null; }
  };

  const handleCsvUpload = async () => {
    if (!csvFile) { setError("Please select a CSV file first."); return; }
    setCsvUploading(true); setError(""); setCsvResult(null); setCsvAiProgress(null);
    const form = new FormData();
    form.append("file", csvFile);
    form.append("source_name", csvSourceName || csvFile.name.replace(".csv",""));
    try {
      const res = await fetch("http://localhost:8000/api/v1/sources/csv", { method:"POST", body:form });
      if (res.ok) {
        const data = await res.json();
        setCsvResult(data);
        setCsvSourceId(data.source_id || null);
        fetchSources();

        if (data.ai_reclassifying && data.source_id) {
          // Poll progress endpoint until AI reclassification finishes
          stopCsvProgressPoll();
          csvProgressRef.current = setInterval(async () => {
            try {
              const pr = await fetch(`http://localhost:8000/api/v1/sources/${data.source_id}/progress`);
              if (pr.ok) {
                const prog = await pr.json();
                setCsvAiProgress(prog);
                if (prog.status === "complete" || prog.status === "failed") {
                  stopCsvProgressPoll();
                  fetchSources();
                }
              }
            } catch {}
          }, 2000);
        }
      } else {
        const err = await res.json();
        setError(err.detail || "Upload failed.");
      }
    } catch { setError("Network error during upload."); }
    setCsvUploading(false);
  };

  const resetCsvForm = () => {
    stopCsvProgressPoll();
    setCsvFile(null); setCsvSourceName(""); setCsvResult(null);
    setCsvAiProgress(null); setCsvSourceId(null);
    setShowCsvUpload(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const SENS_COLOR: Record<string,string> = {
    Public:"#10b981", Internal:"#3b82f6", Confidential:"#f59e0b", Restricted:"#ef4444", Critical:"#ec4899"
  };

  const handleScan = async (id: string) => {
    try {
      const res = await fetch(`http://localhost:8000/api/v1/sources/${id}/scan`, { method: "POST" });
      if (res.ok) {
        setSuccess("Scan started. This runs in the background.");
        fetchSources();
      } else {
        const e = await res.json();
        setError(e.detail || "Scan failed to start.");
      }
    } catch { setError("Network error."); }
  };

  return (
    <div className="page-wrapper fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Connections</h1>
          <p className="page-subtitle">Connect databases and configure automated discovery scans.</p>
        </div>
        {!showForm && !showCsvUpload && (
          <div style={{ display:"flex", gap:10 }}>
            <button className="btn btn-secondary" onClick={() => { setShowCsvUpload(true); setShowForm(false); }}>
              <Upload size={14} /> Upload CSV
            </button>
            <button className="btn btn-primary" onClick={() => { setShowForm(true); setShowCsvUpload(false); }}>
              <Plus size={14} /> Add Connection
            </button>
          </div>
        )}
      </div>

      {success && (
        <div className="alert alert-success fade-in" style={{ marginBottom: 16 }}>
          <CheckCircle2 size={14} /> {success}
        </div>
      )}
      {error && (
        <div className="alert alert-danger fade-in" style={{ marginBottom: 16 }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* ── CSV Upload Panel ─────────────────────────────────────────────── */}
      {showCsvUpload && (
        <div className="card fade-in" style={{ marginBottom:20 }}>
          <div className="card-header">
            <span className="card-title"><Upload size={16}/> Upload CSV File</span>
            <button className="btn btn-secondary btn-sm" onClick={resetCsvForm}><X size={13}/> Cancel</button>
          </div>
          <div style={{ padding:"24px 28px" }}>
            <p style={{ color:"var(--text-secondary)", fontSize:14, marginBottom:20 }}>
              Upload a CSV file and ClassifyAI will instantly classify every column for PII, PCI, PHI, and sensitivity using AI agents — no database connection needed.
            </p>

            {/* Source name */}
            <div className="form-group" style={{ marginBottom:20 }}>
              <label className="form-label">Source Name</label>
              <input className="form-input" placeholder="e.g. customer_export_may_2026"
                value={csvSourceName} onChange={e => setCsvSourceName(e.target.value)} />
            </div>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setCsvDragOver(true); }}
              onDragLeave={() => setCsvDragOver(false)}
              onDrop={handleCsvDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${csvDragOver ? "var(--color-primary)" : csvFile ? "#10b981" : "var(--border)"}`,
                borderRadius:12, padding:"36px 24px", textAlign:"center", cursor:"pointer",
                background: csvDragOver ? "var(--accent-dim)" : csvFile ? "rgba(16,185,129,.05)" : "var(--color-light)",
                transition:"all .2s", marginBottom:16,
              }}>
              <input ref={fileInputRef} type="file" accept=".csv" style={{ display:"none" }} onChange={handleCsvFileInput}/>
              {csvFile ? (
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
                  <FileText size={32} style={{ color:"#10b981" }}/>
                  <span style={{ fontWeight:600, color:"#0f172a", fontSize:14 }}>{csvFile.name}</span>
                  <span style={{ color:"var(--text-muted)", fontSize:13 }}>{(csvFile.size / 1024).toFixed(1)} KB — ready to classify</span>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
                  <Upload size={32} style={{ color:"var(--text-muted)" }}/>
                  <span style={{ fontWeight:600, color:"var(--text-secondary)", fontSize:14 }}>Drag & drop a CSV file here</span>
                  <span style={{ color:"var(--text-muted)", fontSize:13 }}>or click to browse — .csv files only</span>
                </div>
              )}
            </div>

            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button className="btn btn-secondary" onClick={resetCsvForm}>Cancel</button>
              <button className="btn btn-primary" disabled={!csvFile || csvUploading} onClick={handleCsvUpload}>
                {csvUploading ? <><RefreshCw size={13} className="spin"/> Classifying…</> : <><Upload size={13}/> Upload & Classify</>}
              </button>
            </div>

            {/* Results */}
            {csvResult && (
              <div className="fade-in" style={{ marginTop:24, borderTop:"1px solid var(--border)", paddingTop:20 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
                  <CheckCircle2 size={18} style={{ color:"#10b981" }}/>
                  <span style={{ fontWeight:700, fontSize:15 }}>Upload Complete</span>
                  <span style={{ color:"var(--text-muted)", fontSize:13 }}>
                    {csvResult.rows_scanned} rows · {csvResult.columns_classified} columns
                  </span>
                </div>

                {/* AI reclassification progress banner */}
                {csvResult.ai_reclassifying && (
                  <div style={{
                    background: "linear-gradient(135deg, rgba(99,102,241,.08), rgba(139,92,246,.08))",
                    border: "1px solid rgba(99,102,241,.2)", borderRadius: 10, padding: "14px 16px", marginBottom: 16,
                  }}>
                    {csvAiProgress?.status === "complete" ? (
                      <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:13 }}>
                        <CheckCircle2 size={15} style={{ color:"#059669" }} />
                        <span style={{ fontWeight:600, color:"#059669" }}>AI classification complete!</span>
                        <span style={{ color:"var(--text-secondary)", fontSize:12 }}>Results updated in Results page.</span>
                      </div>
                    ) : csvAiProgress?.status === "failed" ? (
                      <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, color:"var(--danger)" }}>
                        <AlertTriangle size={15} /> AI classification failed. Initial results still available.
                      </div>
                    ) : (
                      <div>
                        <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, marginBottom:8 }}>
                          <RefreshCw size={13} className="spin" style={{ color:"#6366f1" }} />
                          <span style={{ fontWeight:600, color:"#6366f1" }}>AI agents reclassifying columns…</span>
                          {csvAiProgress && (
                            <span style={{ color:"var(--text-muted)", fontSize:12, marginLeft:"auto" }}>
                              {csvAiProgress.columns_done}/{csvAiProgress.columns_total} columns
                            </span>
                          )}
                        </div>
                        {csvAiProgress?.columns_total > 0 && (
                          <div style={{ height:4, background:"rgba(99,102,241,.15)", borderRadius:2, overflow:"hidden" }}>
                            <div style={{
                              height:"100%", borderRadius:2,
                              background:"linear-gradient(90deg,#6366f1,#8b5cf6)",
                              width:`${Math.round((csvAiProgress.columns_done/csvAiProgress.columns_total)*100)}%`,
                              transition:"width .4s",
                            }} />
                          </div>
                        )}
                        {csvAiProgress?.current_column && (
                          <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:6 }}>
                            → {csvAiProgress.current_column}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Initial classification preview */}
                <div style={{ fontSize:12, color:"var(--text-secondary)", marginBottom:10 }}>
                  {csvResult.ai_reclassifying
                    ? "Showing initial keyword-based classification. Results will update when AI agents finish."
                    : "Column classifications:"}
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(190px, 1fr))", gap:8 }}>
                  {csvResult.results?.map((r: any) => (
                    <div key={r.column_name} style={{ background:"var(--color-light)", borderRadius:8, padding:"10px 12px", border:"1px solid var(--border)" }}>
                      <div style={{ fontWeight:600, fontSize:12, color:"var(--text-primary)", marginBottom:5, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {r.column_name}
                      </div>
                      <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                        <span style={{ fontSize:10, padding:"2px 7px", borderRadius:99, background:SENS_COLOR[r.sensitivity_level]+"22", color:SENS_COLOR[r.sensitivity_level], fontWeight:600 }}>
                          {r.sensitivity_level}
                        </span>
                        {r.data_type_tags?.slice(0,2).map((t: string) => (
                          <span key={t} style={{ fontSize:9, padding:"2px 6px", borderRadius:99, background:"var(--accent-dim)", color:"var(--color-primary)", fontWeight:500 }}>{t}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop:16, display:"flex", gap:10 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => { resetCsvForm(); onNavigate && onNavigate("results"); }}>
                    View in Results →
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={resetCsvForm}>
                    Upload Another
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add connection form */}
      {showForm && (
        <div className="card fade-in" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title"><Database size={16} /> New Connection</span>
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowForm(false); clearForm(); }}>
              <X size={13} /> Cancel
            </button>
          </div>
          <form onSubmit={handleCreate} style={{ padding: "20px 24px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 4 }}>
              <div className="form-group">
                <label className="form-label">Connection Name</label>
                <input className="form-input" placeholder="e.g. Production PostgreSQL" value={name}
                  onChange={e => setName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Database Type</label>
                <select className="form-input" value={sourceType} onChange={e => setSourceType(e.target.value)}>
                  <option value="postgres">PostgreSQL</option>
                  <option value="mysql">MySQL</option>
                  <option value="snowflake">Snowflake</option>
                  <option value="s3">AWS S3</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <input className="form-input" placeholder="What data does this source hold?" value={description}
                onChange={e => setDescription(e.target.value)} />
            </div>

            {/* Credentials */}
            <div style={{ background: "var(--color-light)", borderRadius: 8, padding: "16px 18px", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, marginBottom: 14, color: "var(--text-secondary)" }}>
                <Settings2 size={14} /> Connection Credentials
              </div>

              {(sourceType === "postgres" || sourceType === "mysql") && (
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr", gap: 12 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Host</label>
                    <input className="form-input" placeholder="db.example.com" value={host}
                      onChange={e => setHost(e.target.value)} required />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Port</label>
                    <input className="form-input" placeholder={sourceType === "postgres" ? "5432" : "3306"} value={port}
                      onChange={e => setPort(e.target.value)} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Database</label>
                    <input className="form-input" placeholder="production_db" value={database}
                      onChange={e => setDatabase(e.target.value)} required />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Username</label>
                    <input className="form-input" placeholder="read_only_user" value={username}
                      onChange={e => setUsername(e.target.value)} />
                  </div>
                  <div className="form-group" style={{ margin: 0, gridColumn: "span 2" }}>
                    <label className="form-label">Password</label>
                    <input type="password" className="form-input" placeholder="••••••••" value={password}
                      onChange={e => setPassword(e.target.value)} />
                  </div>
                </div>
              )}

              {sourceType === "snowflake" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[
                    ["Account Locator", account, setAccount, "xy12345.us-east-1"],
                    ["Warehouse", warehouse, setWarehouse, "COMPUTE_WH"],
                    ["Database", database, setDatabase, "ANALYTICS_DB"],
                    ["Username", username, setUsername, "governance_agent"],
                  ].map(([label, val, setter, ph]: any) => (
                    <div key={label as string} className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">{label}</label>
                      <input className="form-input" placeholder={ph} value={val} onChange={e => setter(e.target.value)} required />
                    </div>
                  ))}
                  <div className="form-group" style={{ margin: 0, gridColumn: "span 2" }}>
                    <label className="form-label">Password</label>
                    <input type="password" className="form-input" placeholder="••••••••" value={password}
                      onChange={e => setPassword(e.target.value)} required />
                  </div>
                </div>
              )}

              {sourceType === "s3" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Bucket Name</label>
                    <input className="form-input" placeholder="company-data-lake" value={bucket}
                      onChange={e => setBucket(e.target.value)} required />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">AWS Region</label>
                    <input className="form-input" placeholder="us-west-2" value={region}
                      onChange={e => setRegion(e.target.value)} required />
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label"><Calendar size={11} style={{ display: "inline", marginRight: 4 }} />Scan Schedule (Cron)</label>
                <input className="form-input" value={schedule} onChange={e => setSchedule(e.target.value)} placeholder="0 0 * * *" required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label"><Shield size={11} style={{ display: "inline", marginRight: 4 }} />Sampling Rate (%)</label>
                <input type="number" className="form-input" min={1} max={100} value={samplingRate}
                  onChange={e => setSamplingRate(parseInt(e.target.value) || 10)} required />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); clearForm(); }}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save & Connect</button>
            </div>
          </form>
        </div>
      )}

      {/* Source list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)" }}>
          <RefreshCw size={28} className="spin" style={{ margin: "0 auto 12px", display: "block" }} />
          Loading…
        </div>
      ) : sources.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Database size={40} />
            <h3>No connections yet</h3>
            <p>Add your first database to start automated classification and privacy scanning.</p>
            <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
              <Plus size={13} /> Add Connection
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {sources.map(source => (
            <div key={source.id} className="card" style={{ padding: "18px 22px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div style={{
                  width: 46, height: 46, borderRadius: 10,
                  background: "var(--accent-dim)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--color-grey)", flexShrink: 0,
                }}>
                  <Database size={22} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{source.name}</span>
                    <span className="badge badge-tag">{source.source_type.toUpperCase()}</span>
                    {source.scan_status === "Scanning" && (
                      <span className="badge" style={{ background: "var(--info-bg)", color: "var(--info)" }}>
                        <RefreshCw size={9} className="spin" /> Scanning
                      </span>
                    )}
                    {source.scan_status === "Completed" && (
                      <span className="badge badge-public"><CheckCircle2 size={9} /> Scanned</span>
                    )}
                    {source.scan_status === "Failed" && (
                      <span className="badge badge-restricted"><AlertTriangle size={9} /> Failed</span>
                    )}
                  </div>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 8px" }}>{source.description}</p>
                  <div style={{ display: "flex", gap: 16, fontSize: 11.5, color: "var(--text-muted)" }}>
                    <span>Schedule: <strong style={{ color: "var(--text-secondary)" }}>{source.scan_schedule}</strong></span>
                    <span>Sampling: <strong style={{ color: "var(--text-secondary)" }}>{source.sampling_rate}%</strong></span>
                    <span>Last scan: <strong style={{ color: "var(--text-secondary)" }}>
                      {source.last_scanned_at ? new Date(source.last_scanned_at).toLocaleString() : "Never"}
                    </strong></span>
                  </div>

                  {testMessages[source.id] && (
                    <div className="alert alert-accent fade-in" style={{ marginTop: 10, padding: "7px 12px", fontSize: 12 }}>
                      {testMessages[source.id]}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button className="btn btn-secondary btn-sm" disabled={testingId === source.id}
                    onClick={() => handleTest(source.id)}>
                    {testingId === source.id ? <RefreshCw size={12} className="spin" /> : null}
                    Test
                  </button>
                  <button className="btn btn-secondary btn-sm" disabled={source.scan_status === "Scanning"}
                    onClick={() => handleScan(source.id)}>
                    <Play size={12} /> Scan
                  </button>
                  <button className="btn btn-danger btn-sm btn-icon"
                    onClick={() => handleDelete(source.id, source.name)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
