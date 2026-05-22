import React, { useState, useEffect } from "react";
import {
  Database, Folder, ChevronRight, ChevronDown, ShieldAlert, Sparkles,
  BookOpen, CheckCircle, AlertTriangle, User, Save, Sliders, X,
  Search, RefreshCw, Wand2, Eye, EyeOff, Clock, Shield,
  Info, Lock, Trash2, Share2, LayoutList, LayoutGrid,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Source {
  id: string; name: string; source_type: string;
  description?: string; last_scanned_at?: string | null;
}
interface TableAsset {
  id: string; display_name: string; fully_qualified_name: string;
  description?: string; asset_type: string;
}
interface ColumnAsset {
  id: string; display_name: string;
  metadata_json: { data_type?: string } | null;
  classification?: {
    sensitivity_level: string; data_type_tags: string[];
    regulatory_tags: string[];
  } | null;
}
interface ColumnDetails {
  id: string; display_name: string; fully_qualified_name: string;
  metadata_json: any;
  classification: {
    sensitivity_level: string; data_type_tags: string[];
    regulatory_tags: string[]; business_domain: string;
    confidence_score: number; review_status: string; reasoning: string;
  } | null;
  description_details: {
    business_description: string; technical_description: string;
    owner: string; steward: string; example_values: string;
    ai_suggested_description: string;
  } | null;
  glossary_terms: { id: string; name: string; definition: string }[];
  compliance: {
    policy_name: string; policy_description: string;
    remediation_steps: string; status: string; violation_details: string;
  }[];
}
interface GlossaryTerm { id: string; name: string; definition: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const SENS_COLOR: Record<string, string> = {
  Critical: "#dc2626", Restricted: "#ea580c", Confidential: "#d97706",
  Internal: "#2563eb", Public: "#059669",
};
const SENS_BG: Record<string, string> = {
  Critical: "rgba(220,38,38,.08)", Restricted: "rgba(234,88,12,.08)",
  Confidential: "rgba(217,119,6,.08)", Internal: "rgba(37,99,235,.08)",
  Public: "rgba(5,150,105,.08)",
};

function tagStyle(tag: string): React.CSSProperties {
  if (tag.startsWith("PII."))            return { background: "rgba(239,68,68,.12)", color: "#b91c1c", border: "1px solid rgba(239,68,68,.25)" };
  if (tag.startsWith("PCI."))            return { background: "rgba(234,88,12,.12)", color: "#c2410c", border: "1px solid rgba(234,88,12,.25)" };
  if (tag.startsWith("PHI."))            return { background: "rgba(139,92,246,.12)", color: "#6d28d9", border: "1px solid rgba(139,92,246,.25)" };
  if (tag.startsWith("BusinessDomain.")) return { background: "rgba(14,165,233,.12)", color: "#0369a1", border: "1px solid rgba(14,165,233,.25)" };
  if (tag.startsWith("AIReadiness."))    return { background: "rgba(16,185,129,.12)", color: "#047857", border: "1px solid rgba(16,185,129,.25)" };
  // Regulatory
  return { background: "rgba(59,130,246,.12)", color: "#1d4ed8", border: "1px solid rgba(59,130,246,.25)" };
}

function shortTag(tag: string) {
  // Shorten tag for display: "BusinessDomain.Financial" → "Financial"
  const parts = tag.split(".");
  return parts.length > 1 ? parts.slice(1).join(".") : tag;
}

function timeAgo(iso?: string | null) {
  if (!iso) return "Never scanned";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "< 1 hr ago";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function ConfidenceBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = score >= 0.85 ? "#059669" : score >= 0.65 ? "#d97706" : "#dc2626";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 56, height: 4, background: "#e5e7eb", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 11, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
    </div>
  );
}

const API = "http://localhost:8000";

// ─── Tag / Sensitivity Legend Data ───────────────────────────────────────────
const SENS_LEGEND = [
  { level: "Public",       color: "#059669", desc: "Non-sensitive, freely shareable. Examples: product codes, country names, public statistics." },
  { level: "Internal",     color: "#2563eb", desc: "Low sensitivity, for internal use only. Examples: operational metrics, timestamps, internal IDs." },
  { level: "Confidential", color: "#d97706", desc: "Moderate sensitivity — contains personal information. Examples: names, emails, phone numbers." },
  { level: "Restricted",   color: "#ea580c", desc: "High sensitivity — regulated data. Examples: SSNs, credit card numbers, medical diagnoses." },
  { level: "Critical",     color: "#dc2626", desc: "Maximum sensitivity — severe harm if exposed. Examples: passwords, API keys, biometric data." },
];
const TAG_LEGEND: { prefix: string; color: string; bg: string; tags: { tag: string; desc: string }[] }[] = [
  {
    prefix: "PII", color: "#b91c1c", bg: "rgba(239,68,68,.08)",
    tags: [
      { tag: "PII.Name",        desc: "Full names, first names, last names of individuals" },
      { tag: "PII.Email",       desc: "Email addresses" },
      { tag: "PII.Phone",       desc: "Phone numbers, mobile numbers, telephone numbers" },
      { tag: "PII.Address",     desc: "Street addresses, postal codes, geographic locations" },
      { tag: "PII.SSN",         desc: "Social security numbers or national ID numbers" },
      { tag: "PII.Biometric",   desc: "Fingerprints, facial recognition data, voice data" },
      { tag: "PII.Behavioral",  desc: "IP addresses, device IDs, browsing history" },
    ],
  },
  {
    prefix: "PCI", color: "#c2410c", bg: "rgba(234,88,12,.08)",
    tags: [
      { tag: "PCI.CardNumber",  desc: "Credit/debit card numbers (PANs, 16-digit card numbers)" },
      { tag: "PCI.CVV",         desc: "Card verification values (CVV/CVC/CID codes)" },
      { tag: "PCI.BankAccount", desc: "Bank account numbers, routing numbers, IBANs" },
    ],
  },
  {
    prefix: "PHI", color: "#6d28d9", bg: "rgba(139,92,246,.08)",
    tags: [
      { tag: "PHI.MedicalRecord", desc: "Patient IDs, medical record numbers, health record references" },
      { tag: "PHI.Diagnosis",     desc: "Medical diagnoses, ICD codes, conditions, symptoms, treatment plans" },
      { tag: "PHI.Insurance",     desc: "Insurance policy IDs, provider names, coverage details" },
    ],
  },
  {
    prefix: "Regulatory", color: "#1d4ed8", bg: "rgba(59,130,246,.08)",
    tags: [
      { tag: "GDPR",    desc: "EU General Data Protection Regulation — personal data of EU residents" },
      { tag: "HIPAA",   desc: "US Health Insurance Portability and Accountability Act — medical data" },
      { tag: "PCI-DSS", desc: "Payment Card Industry Data Security Standard — payment card data" },
      { tag: "CCPA",    desc: "California Consumer Privacy Act — personal data of California residents" },
      { tag: "SOX",     desc: "Sarbanes-Oxley Act — financial reporting and accounting records" },
    ],
  },
  {
    prefix: "AIReadiness", color: "#047857", bg: "rgba(16,185,129,.08)",
    tags: [
      { tag: "AIReadiness.TrainingApproved",   desc: "Data is safe and appropriate for AI/ML model training" },
      { tag: "AIReadiness.TrainingRestricted", desc: "Sensitive data — must NOT be used for AI model training" },
    ],
  },
];

// ─── Tag Legend Modal ─────────────────────────────────────────────────────────
function TagLegendModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal fade-in" style={{ width: 700, maxHeight: "88vh", overflowY: "auto" }}>
        <div className="modal-header">
          <span className="modal-title" style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Info size={15} /> Classification Reference
          </span>
          <button className="btn btn-secondary btn-sm btn-icon" onClick={onClose}><X size={13} /></button>
        </div>
        <div className="modal-body" style={{ padding: "20px 24px" }}>
          {/* Sensitivity levels */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--text-muted)", marginBottom: 12 }}>
              Sensitivity Levels
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {SENS_LEGEND.map(s => (
                <div key={s.level} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span style={{
                    fontSize: 11, padding: "2px 10px", borderRadius: 10, fontWeight: 700,
                    background: `${s.color}18`, color: s.color, border: `1px solid ${s.color}30`,
                    minWidth: 90, textAlign: "center", flexShrink: 0,
                  }}>{s.level}</span>
                  <span style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5, paddingTop: 1 }}>{s.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tag categories */}
          {TAG_LEGEND.map(cat => (
            <div key={cat.prefix} style={{ marginBottom: 20 }}>
              <div style={{
                fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px",
                color: cat.color, marginBottom: 10, display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: cat.color, display: "inline-block" }} />
                {cat.prefix} Tags
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {cat.tags.map(t => (
                  <div key={t.tag} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <span style={{
                      fontSize: 10, padding: "2px 8px", borderRadius: 8, fontWeight: 600,
                      background: cat.bg, color: cat.color, border: `1px solid ${cat.color}30`,
                      whiteSpace: "nowrap", flexShrink: 0, fontFamily: "monospace",
                    }}>{t.tag}</span>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5, paddingTop: 1 }}>{t.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Governance Recommendations Panel ────────────────────────────────────────
interface GovernanceRec {
  retention_period: string;
  encryption_required: boolean;
  access_level: string;
  sharing_policy: string;
  deletion_guidance: string;
  masking_required: boolean;
  regulatory_notes: string[];
  applicable_regulations: string[];
  sensitivity_level: string;
}
function GovernancePanel({ colId, sens }: { colId: string; sens: string }) {
  const [recs, setRecs] = useState<GovernanceRec | null>(null);
  const [aiSummary, setAiSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const fetch_ = async () => {
    if (loaded) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/v1/assets/${colId}/governance`);
      if (res.ok) {
        const d = await res.json();
        setRecs(d.recommendations);
        setAiSummary(d.ai_summary || "");
        setLoaded(true);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetch_(); }, [colId]);

  const sensColor = SENS_COLOR[sens] || "#6b7280";

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-muted)", padding: "10px 0" }}>
      <RefreshCw size={12} className="spin" /> Loading governance recommendations…
    </div>
  );
  if (!recs) return null;

  return (
    <div style={{ background: `${sensColor}06`, border: `1px solid ${sensColor}20`, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: sensColor, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
        <Shield size={12} /> Governance & Handling Requirements
      </div>

      {/* AI summary */}
      {aiSummary && (
        <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 12, fontStyle: "italic", display: "flex", gap: 7 }}>
          <Sparkles size={12} style={{ color: "var(--color-accent)", flexShrink: 0, marginTop: 2 }} />
          <span>{aiSummary}</span>
        </div>
      )}

      {/* Requirement grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {[
          { icon: Clock, label: "Retention Period", value: recs.retention_period },
          { icon: Lock, label: "Encryption", value: recs.encryption_required ? "Required (at rest & in transit)" : "Not required" },
          { icon: Shield, label: "Access Level", value: recs.access_level },
          { icon: Share2, label: "Sharing Policy", value: recs.sharing_policy },
          { icon: Trash2, label: "Deletion Guidance", value: recs.deletion_guidance },
          { icon: Eye, label: "Data Masking", value: recs.masking_required ? "Required before sharing/display" : "Not required" },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} style={{ background: "rgba(255,255,255,.6)", borderRadius: 7, padding: "9px 11px", border: "1px solid var(--card-border)" }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
              <Icon size={9} /> {label}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: 500, lineHeight: 1.4 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Regulatory notes */}
      {recs.regulatory_notes.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
          {recs.regulatory_notes.map((note, i) => (
            <div key={i} style={{ fontSize: 11.5, color: "#1d4ed8", lineHeight: 1.5, display: "flex", gap: 6 }}>
              <AlertTriangle size={11} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{note}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AssetDictionary() {
  const [sources, setSources]   = useState<Source[]>([]);
  const [glossary, setGlossary] = useState<GlossaryTerm[]>([]);
  const [search, setSearch]     = useState("");
  const [filterSens, setFilterSens] = useState("all");

  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const [expandedTables, setExpandedTables]   = useState<Record<string, boolean>>({});
  const [expandedColumns, setExpandedColumns] = useState<Record<string, boolean>>({});
  const [showReasoning, setShowReasoning]     = useState<Record<string, boolean>>({});

  const [tablesBySource, setTablesBySource]         = useState<Record<string, TableAsset[]>>({});
  const [columnsByTable, setColumnsByTable]         = useState<Record<string, ColumnAsset[]>>({});
  const [columnDetailsCache, setColumnDetailsCache] = useState<Record<string, ColumnDetails>>({});

  const [loadingSources,   setLoadingSources]   = useState(true);
  const [loadingTables,    setLoadingTables]    = useState<Record<string, boolean>>({});
  const [loadingColumns,   setLoadingColumns]   = useState<Record<string, boolean>>({});
  const [loadingDetails,   setLoadingDetails]   = useState<Record<string, boolean>>({});
  const [generatingFor,    setGeneratingFor]    = useState<string | null>(null);

  const [showLegend,       setShowLegend]       = useState(false);
  const [showGovernance,   setShowGovernance]   = useState<Record<string, boolean>>({});
  const [tableViewMode,    setTableViewMode]    = useState<Record<string, "detail" | "table">>({});

  const [editForms, setEditForms] = useState<Record<string, {
    sensitivity_level: string; business_description: string; owner: string;
    steward: string; reasoning: string; data_type_tags: string;
    regulatory_tags: string; business_domain: string; linked_glossary_ids: string[];
  }>>({});
  const [savingStatus,     setSavingStatus]     = useState<Record<string, string>>({});
  const [editingColumns,   setEditingColumns]   = useState<Record<string, boolean>>({});

  useEffect(() => { fetchSources(); fetchGlossary(); }, []);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchSources = async () => {
    try {
      const res = await fetch(`${API}/api/v1/sources`);
      if (res.ok) {
        const data: Source[] = await res.json();
        setSources(data);
        if (data.length > 0) toggleSource(data[0].id, data[0]);
      }
    } catch {}
    setLoadingSources(false);
  };

  const fetchGlossary = async () => {
    try {
      const res = await fetch(`${API}/api/v1/glossary`);
      if (res.ok) setGlossary(await res.json());
    } catch {}
  };

  const toggleSource = async (srcId: string, srcObj?: Source) => {
    const isExpanded = !!expandedSources[srcId];
    setExpandedSources(prev => ({ ...prev, [srcId]: !isExpanded }));
    if (!isExpanded && !tablesBySource[srcId]) {
      setLoadingTables(prev => ({ ...prev, [srcId]: true }));
      try {
        const res = await fetch(`${API}/api/v1/assets?source_id=${srcId}&asset_type=table`);
        if (res.ok) {
          const data: TableAsset[] = await res.json();
          setTablesBySource(prev => ({ ...prev, [srcId]: data }));
        }
      } catch {}
      setLoadingTables(prev => ({ ...prev, [srcId]: false }));
    }
  };

  const toggleTable = async (tblId: string) => {
    const isExpanded = !!expandedTables[tblId];
    setExpandedTables(prev => ({ ...prev, [tblId]: !isExpanded }));
    if (!isExpanded && !columnsByTable[tblId]) {
      setLoadingColumns(prev => ({ ...prev, [tblId]: true }));
      try {
        const res = await fetch(`${API}/api/v1/assets?parent_id=${tblId}`);
        if (res.ok) { const d = await res.json(); setColumnsByTable(prev => ({ ...prev, [tblId]: d })); }
      } catch {}
      setLoadingColumns(prev => ({ ...prev, [tblId]: false }));
    }
  };

  const toggleColumn = async (colId: string) => {
    const isExpanded = !!expandedColumns[colId];
    setExpandedColumns(prev => ({ ...prev, [colId]: !isExpanded }));
    if (!isExpanded && !columnDetailsCache[colId]) {
      setLoadingDetails(prev => ({ ...prev, [colId]: true }));
      try {
        const res = await fetch(`${API}/api/v1/assets/${colId}`);
        if (res.ok) {
          const data: ColumnDetails = await res.json();
          setColumnDetailsCache(prev => ({ ...prev, [colId]: data }));
          setEditForms(prev => ({
            ...prev,
            [colId]: {
              sensitivity_level:  data.classification?.sensitivity_level || "Internal",
              business_description: data.description_details?.business_description || "",
              owner:              data.description_details?.owner || "",
              steward:            data.description_details?.steward || "",
              reasoning:          data.classification?.reasoning || "",
              data_type_tags:     data.classification?.data_type_tags?.join(", ") || "",
              regulatory_tags:    data.classification?.regulatory_tags?.join(", ") || "",
              business_domain:    data.classification?.business_domain || "Operational",
              linked_glossary_ids: data.glossary_terms?.map(t => t.id) || [],
            },
          }));
        }
      } catch {}
      setLoadingDetails(prev => ({ ...prev, [colId]: false }));
    }
  };

  const generateDescriptions = async (srcId: string) => {
    setGeneratingFor(srcId);
    try {
      const res = await fetch(`${API}/api/v1/sources/${srcId}/generate-descriptions`, { method: "POST" });
      if (res.ok) {
        // Refresh source list to get updated description
        const srcRes = await fetch(`${API}/api/v1/sources`);
        if (srcRes.ok) setSources(await srcRes.json());
        // Refresh tables for this source
        const tblRes = await fetch(`${API}/api/v1/assets?source_id=${srcId}&asset_type=table`);
        if (tblRes.ok) { const d = await tblRes.json(); setTablesBySource(prev => ({ ...prev, [srcId]: d })); }
      }
    } catch {}
    setGeneratingFor(null);
  };

  // ── Edit handlers ──────────────────────────────────────────────────────────
  const handleFieldChange = (colId: string, field: string, value: any) =>
    setEditForms(prev => ({ ...prev, [colId]: { ...prev[colId], [field]: value } }));

  const handleToggleGlossary = (colId: string, termId: string) => {
    const ids = [...(editForms[colId]?.linked_glossary_ids || [])];
    const i = ids.indexOf(termId);
    if (i > -1) ids.splice(i, 1); else ids.push(termId);
    handleFieldChange(colId, "linked_glossary_ids", ids);
  };

  const handleSaveAll = async (colId: string) => {
    const form = editForms[colId]; if (!form) return;
    setSavingStatus(prev => ({ ...prev, [colId]: "saving" }));
    try {
      const data_type_tags = form.data_type_tags.split(",").map(t => t.trim()).filter(Boolean);
      const regulatory_tags = form.regulatory_tags.split(",").map(t => t.trim()).filter(Boolean);
      const [clsRes, glsRes] = await Promise.all([
        fetch(`${API}/api/v1/assets/${colId}/classification`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sensitivity_level: form.sensitivity_level,
            business_description: form.business_description,
            owner: form.owner, steward: form.steward,
            reasoning: form.reasoning, data_type_tags, regulatory_tags,
            business_domain: form.business_domain,
          }),
        }),
        fetch(`${API}/api/v1/assets/${colId}/glossary`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ glossary_term_ids: form.linked_glossary_ids }),
        }),
      ]);
      if (clsRes.ok && glsRes.ok) {
        setSavingStatus(prev => ({ ...prev, [colId]: "success" }));
        const fresh = await (await fetch(`${API}/api/v1/assets/${colId}`)).json();
        setColumnDetailsCache(prev => ({ ...prev, [colId]: fresh }));
        setTimeout(() => setSavingStatus(prev => ({ ...prev, [colId]: "" })), 3000);
      } else {
        setSavingStatus(prev => ({ ...prev, [colId]: "error" }));
      }
    } catch { setSavingStatus(prev => ({ ...prev, [colId]: "error" })); }
  };

  // ── Search / filter ────────────────────────────────────────────────────────
  function colMatchesSearch(col: ColumnAsset) {
    if (!search) return true;
    return col.display_name.toLowerCase().includes(search.toLowerCase());
  }
  function colMatchesSens(col: ColumnAsset) {
    if (filterSens === "all") return true;
    const lvl = col.classification?.sensitivity_level || "Internal";
    return lvl === filterSens;
  }
  function colVisible(col: ColumnAsset) { return colMatchesSearch(col) && colMatchesSens(col); }

  // ── Global stats from loaded columns ──────────────────────────────────────
  const allCols = Object.values(columnsByTable).flat();
  const sensCounts: Record<string, number> = {};
  allCols.forEach(c => {
    const lvl = c.classification?.sensitivity_level || "Internal";
    sensCounts[lvl] = (sensCounts[lvl] || 0) + 1;
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="page-wrapper fade-in">
      {/* ── Legend modal ── */}
      {showLegend && <TagLegendModal onClose={() => setShowLegend(false)} />}

      {/* ── Header ── */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div className="page-header-left">
          <h1 className="page-title">Results</h1>
          <p className="page-subtitle">
            Browse and manage classified columns across all connected databases.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={() => setShowLegend(true)}>
          <Info size={13} /> Tag Reference
        </button>
      </div>

      {/* ── Stats strip ── */}
      {allCols.length > 0 && (
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          {(["Critical","Restricted","Confidential","Internal","Public"] as const).map(lvl => {
            const cnt = sensCounts[lvl] || 0;
            if (!cnt) return null;
            return (
              <button
                key={lvl}
                onClick={() => setFilterSens(filterSens === lvl ? "all" : lvl)}
                style={{
                  display: "flex", alignItems: "center", gap: 7, padding: "6px 14px",
                  borderRadius: 20, border: `1.5px solid ${filterSens === lvl ? SENS_COLOR[lvl] : "transparent"}`,
                  background: SENS_BG[lvl], cursor: "pointer", transition: "all .15s",
                  boxShadow: filterSens === lvl ? `0 0 0 2px ${SENS_COLOR[lvl]}30` : "none",
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: SENS_COLOR[lvl], flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: SENS_COLOR[lvl] }}>{lvl}</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>{cnt}</span>
              </button>
            );
          })}
          {filterSens !== "all" && (
            <button
              onClick={() => setFilterSens("all")}
              style={{ fontSize: 12, color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer", padding: "6px 8px" }}
            >
              Clear ×
            </button>
          )}
        </div>
      )}

      {/* ── Search + filter bar ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "center" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search columns by name…"
            style={{
              width: "100%", padding: "9px 12px 9px 34px", border: "1px solid var(--card-border)",
              borderRadius: 8, fontSize: 13, background: "var(--card-bg)",
              color: "var(--text-primary)", outline: "none", boxSizing: "border-box",
            }}
          />
        </div>
        <select
          value={filterSens}
          onChange={e => setFilterSens(e.target.value)}
          className="form-input"
          style={{ width: "auto", padding: "9px 12px", fontSize: 13, minWidth: 150 }}
        >
          <option value="all">All sensitivity levels</option>
          {["Critical","Restricted","Confidential","Internal","Public"].map(l =>
            <option key={l} value={l}>{l}</option>
          )}
        </select>
      </div>

      {/* ── Source list ── */}
      {loadingSources ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
          <RefreshCw size={28} className="spin" style={{ margin: "0 auto 12px", display: "block" }} />
          Loading sources…
        </div>
      ) : sources.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <Database size={40} style={{ color: "var(--text-muted)", margin: "0 auto 12px", display: "block" }} />
          <h3 style={{ marginBottom: 8 }}>No databases connected</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>Connect a data source and run a scan to see results here.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {sources.map(source => {
            const isExpanded   = !!expandedSources[source.id];
            const tables       = (tablesBySource[source.id] || []).filter(t => t.asset_type === "table");
            const isLoading    = !!loadingTables[source.id];
            const isGenerating = generatingFor === source.id;
            const totalLoaded  = tables.reduce((s, t) => s + (columnsByTable[t.id]?.length || 0), 0);

            return (
              <div key={source.id} className="card" style={{ overflow: "hidden", padding: 0 }}>
                {/* ── Source header ── */}
                <div
                  style={{
                    display: "flex", alignItems: "center", padding: "14px 18px",
                    background: "var(--card-bg)", cursor: "pointer", userSelect: "none",
                    borderBottom: isExpanded ? "1px solid var(--card-border)" : "none",
                    gap: 10,
                  }}
                  onClick={() => toggleSource(source.id)}
                >
                  <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </span>
                  <Database size={18} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{source.name}</span>
                  <span className="badge badge-tag" style={{ textTransform: "uppercase", fontSize: 10 }}>
                    {source.source_type}
                  </span>
                  <span style={{ flex: 1 }} />
                  {tables.length > 0 && (
                    <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {tables.length} table{tables.length !== 1 ? "s" : ""}
                      {totalLoaded > 0 ? ` · ${totalLoaded} columns loaded` : ""}
                    </span>
                  )}
                  {source.last_scanned_at && (
                    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap", marginLeft: 4 }}>
                      <Clock size={11} /> {timeAgo(source.last_scanned_at)}
                    </span>
                  )}
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ marginLeft: 8, flexShrink: 0, display: "flex", alignItems: "center", gap: 5 }}
                    onClick={e => { e.stopPropagation(); generateDescriptions(source.id); }}
                    disabled={isGenerating}
                    title="Generate AI descriptions for this database and its tables"
                  >
                    {isGenerating
                      ? <><RefreshCw size={11} className="spin" /> Generating…</>
                      : <><Wand2 size={11} /> AI Describe</>}
                  </button>
                </div>

                {/* ── Source AI description ── */}
                {source.description && (
                  <div style={{
                    padding: "10px 18px 10px 48px",
                    background: "linear-gradient(90deg, rgba(99,102,241,.04), transparent)",
                    borderBottom: isExpanded ? "1px solid var(--card-border)" : "none",
                    fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.6,
                    display: "flex", alignItems: "flex-start", gap: 8,
                  }}>
                    <Sparkles size={13} style={{ color: "var(--color-accent)", flexShrink: 0, marginTop: 2 }} />
                    <span>{source.description}</span>
                  </div>
                )}

                {/* ── Tables ── */}
                {isExpanded && (
                  <div style={{ padding: "10px 14px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {isLoading ? (
                      <div style={{ padding: "16px 12px", fontSize: 13, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8 }}>
                        <RefreshCw size={14} className="spin" /> Loading tables…
                      </div>
                    ) : tables.length === 0 ? (
                      <div style={{ padding: "16px 12px", fontSize: 13, color: "var(--text-muted)" }}>
                        No tables found. Run a scan first.
                      </div>
                    ) : tables.map(table => {
                      const isTblExp  = !!expandedTables[table.id];
                      const cols      = (columnsByTable[table.id] || []).filter(colVisible);
                      const allCols2  = columnsByTable[table.id] || [];
                      const isTblLoad = !!loadingColumns[table.id];

                      return (
                        <div key={table.id} style={{
                          border: "1px solid var(--card-border)", borderRadius: 10,
                          overflow: "hidden", background: "#fff",
                        }}>
                          {/* ── Table header ── */}
                          <div
                            style={{
                              cursor: "pointer", userSelect: "none",
                              background: isTblExp ? "rgba(99,102,241,.03)" : "#fff",
                              borderBottom: isTblExp ? "1px solid var(--card-border)" : "none",
                            }}
                            onClick={() => toggleTable(table.id)}
                          >
                            {/* Top row: icon + name + column count + chevron */}
                            <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", gap: 8 }}>
                              <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                                {isTblExp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </span>
                              <Folder size={14} style={{ color: "#6366f1", flexShrink: 0 }} />
                              <span style={{ fontWeight: 600, fontSize: 13 }}>{table.display_name}</span>
                              {allCols2.length > 0 && (
                                <span style={{ fontSize: 11, color: "var(--text-muted)", background: "rgba(0,0,0,.04)", padding: "1px 7px", borderRadius: 10 }}>
                                  {allCols2.length} col{allCols2.length !== 1 ? "s" : ""}
                                </span>
                              )}
                            </div>
                            {/* Description: full text, wrapping, below the title row */}
                            {table.description && (
                              <div style={{
                                padding: "0 14px 10px 36px",
                                fontSize: 12, color: "var(--text-secondary)",
                                lineHeight: 1.55,
                                display: "flex", alignItems: "flex-start", gap: 6,
                              }}>
                                <Sparkles size={11} style={{ color: "#6366f1", flexShrink: 0, marginTop: 2 }} />
                                <span>{table.description}</span>
                              </div>
                            )}
                          </div>

                          {/* ── Columns ── */}
                          {isTblExp && (
                            <div style={{ padding: "8px 12px 12px" }}>
                              {/* View toggle */}
                              {!isTblLoad && allCols2.length > 0 && (
                                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8, gap: 4 }}>
                                  <button
                                    className={`btn btn-secondary btn-sm${tableViewMode[table.id] !== "table" ? " active" : ""}`}
                                    onClick={() => setTableViewMode(p => ({ ...p, [table.id]: "detail" }))}
                                    title="Detail view"
                                    style={{ padding: "3px 8px" }}
                                  >
                                    <LayoutGrid size={12} />
                                  </button>
                                  <button
                                    className={`btn btn-secondary btn-sm${tableViewMode[table.id] === "table" ? " active" : ""}`}
                                    onClick={() => setTableViewMode(p => ({ ...p, [table.id]: "table" }))}
                                    title="Table view"
                                    style={{ padding: "3px 8px" }}
                                  >
                                    <LayoutList size={12} />
                                  </button>
                                </div>
                              )}

                              {isTblLoad ? (
                                <div style={{ padding: "10px 8px", fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8 }}>
                                  <RefreshCw size={12} className="spin" /> Loading columns…
                                </div>
                              ) : allCols2.length === 0 ? (
                                <div style={{ padding: "10px 8px", fontSize: 12, color: "var(--text-muted)" }}>No columns found.</div>
                              ) : cols.length === 0 ? (
                                <div style={{ padding: "10px 8px", fontSize: 12, color: "var(--text-muted)" }}>
                                  No columns match the current filter.
                                </div>

                              /* ── Table view mode ── */
                              ) : tableViewMode[table.id] === "table" ? (
                                <div className="table-wrap" style={{ borderRadius: 8, overflow: "hidden", border: "1px solid var(--card-border)" }}>
                                  <table className="table" style={{ margin: 0 }}>
                                    <thead>
                                      <tr>
                                        <th style={{ width: "22%" }}>Column</th>
                                        <th style={{ width: "8%" }}>Type</th>
                                        <th style={{ width: "12%" }}>Sensitivity</th>
                                        <th style={{ width: "20%" }}>Privacy Tags</th>
                                        <th style={{ width: "15%" }}>Regulatory</th>
                                        <th style={{ width: "12%" }}>Domain</th>
                                        <th style={{ width: "11%" }}>Description</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {cols.map(col => {
                                        const sens = col.classification?.sensitivity_level || "Internal";
                                        const sColor = SENS_COLOR[sens] || "#6b7280";
                                        const details = columnDetailsCache[col.id];
                                        const descText = details?.description_details?.business_description
                                          || details?.description_details?.ai_suggested_description || "";
                                        return (
                                          <tr key={col.id} style={{ cursor: "pointer" }} onClick={() => toggleColumn(col.id)}>
                                            <td style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600 }}>
                                              {col.display_name}
                                            </td>
                                            <td style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace" }}>
                                              {col.metadata_json?.data_type || "VARCHAR"}
                                            </td>
                                            <td>
                                              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, fontWeight: 700, background: `${sColor}18`, color: sColor, border: `1px solid ${sColor}28` }}>
                                                {sens}
                                              </span>
                                            </td>
                                            <td>
                                              <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                                                {(col.classification?.data_type_tags || [])
                                                  .filter(t => t.startsWith("PII.") || t.startsWith("PCI.") || t.startsWith("PHI."))
                                                  .slice(0, 2).map(t => (
                                                    <span key={t} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 8, fontWeight: 600, ...tagStyle(t) }}>
                                                      {shortTag(t)}
                                                    </span>
                                                  ))}
                                              </div>
                                            </td>
                                            <td>
                                              <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                                                {(col.classification?.regulatory_tags || []).slice(0, 2).map(t => (
                                                  <span key={t} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 8, fontWeight: 600, ...tagStyle(t) }}>
                                                    {t}
                                                  </span>
                                                ))}
                                              </div>
                                            </td>
                                            <td style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                                              {(() => {
                                                const d = col.classification?.data_type_tags || [];
                                                const bd = d.find(t => t.startsWith("BusinessDomain."));
                                                return bd ? shortTag(bd) : "—";
                                              })()}
                                            </td>
                                            <td style={{ fontSize: 11, color: "var(--text-secondary)", maxWidth: 140 }}>
                                              {descText ? (
                                                <span style={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                                                  {descText}
                                                </span>
                                              ) : (
                                                <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>—</span>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>

                              /* ── Detail view mode (default) ── */
                              ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                              {cols.map(col => {
                                const isColExp   = !!expandedColumns[col.id];
                                const details    = columnDetailsCache[col.id];
                                const isDetLoad  = !!loadingDetails[col.id];
                                const form       = editForms[col.id];
                                const sens       = details?.classification?.sensitivity_level
                                  || col.classification?.sensitivity_level || "Internal";
                                const sensColor  = SENS_COLOR[sens] || "#6b7280";
                                const sensBg     = SENS_BG[sens] || "rgba(107,114,128,.06)";
                                const isViolated = details?.compliance?.length ? details.compliance.length > 0 : false;
                                const privTags   = [...(col.classification?.data_type_tags || [])].filter(t =>
                                  t.startsWith("PII.") || t.startsWith("PCI.") || t.startsWith("PHI.")
                                );

                                return (
                                  <div key={col.id} style={{
                                    borderRadius: 8,
                                    border: `1px solid ${isColExp ? sensColor + "50" : "var(--card-border)"}`,
                                    borderLeft: `3px solid ${sensColor}`,
                                    overflow: "hidden",
                                    background: isColExp ? sensBg : "#fdfdfd",
                                    transition: "border-color .15s, background .15s",
                                  }}>
                                    {/* ── Column row (collapsed) ── */}
                                    <div
                                      onClick={() => toggleColumn(col.id)}
                                      style={{
                                        display: "flex", alignItems: "center", padding: "9px 12px",
                                        cursor: "pointer", userSelect: "none", gap: 8,
                                      }}
                                    >
                                      <span style={{ color: "var(--text-muted)", flexShrink: 0, lineHeight: 1 }}>
                                        {isColExp ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                      </span>
                                      <span style={{ fontWeight: 600, fontSize: 13, fontFamily: "var(--font-mono, monospace)" }}>
                                        {col.display_name}
                                      </span>
                                      <span style={{
                                        fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace",
                                        background: "rgba(0,0,0,.05)", padding: "1px 5px", borderRadius: 3,
                                      }}>
                                        {col.metadata_json?.data_type || "VARCHAR"}
                                      </span>
                                      {/* Inline privacy tags (collapsed) */}
                                      {!isColExp && privTags.slice(0, 2).map(t => (
                                        <span key={t} style={{
                                          fontSize: 10, padding: "1px 6px", borderRadius: 10,
                                          fontWeight: 600, ...tagStyle(t),
                                        }}>{shortTag(t)}</span>
                                      ))}
                                      {!isColExp && privTags.length > 2 && (
                                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>+{privTags.length - 2}</span>
                                      )}
                                      <span style={{ flex: 1 }} />
                                      {details && (
                                        isViolated ? (
                                          <span style={{
                                            fontSize: 10, padding: "2px 7px", borderRadius: 10,
                                            background: "rgba(220,38,38,.1)", color: "#dc2626",
                                            display: "flex", alignItems: "center", gap: 3, fontWeight: 600,
                                          }}>
                                            <AlertTriangle size={9} /> Non-Compliant
                                          </span>
                                        ) : (
                                          <span style={{
                                            fontSize: 10, padding: "2px 7px", borderRadius: 10,
                                            background: "rgba(5,150,105,.1)", color: "#059669",
                                            display: "flex", alignItems: "center", gap: 3,
                                          }}>
                                            <CheckCircle size={9} /> Compliant
                                          </span>
                                        )
                                      )}
                                      <span style={{
                                        fontSize: 11, padding: "2px 9px", borderRadius: 10, fontWeight: 700,
                                        background: sensBg, color: sensColor,
                                        border: `1px solid ${sensColor}30`, flexShrink: 0,
                                      }}>
                                        {sens}
                                      </span>
                                    </div>

                                    {/* ── Column expanded content ── */}
                                    {isColExp && (
                                      <div style={{ borderTop: `1px solid ${sensColor}25`, padding: "14px 16px" }}>
                                        {isDetLoad ? (
                                          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-muted)" }}>
                                            <RefreshCw size={13} className="spin" /> Loading…
                                          </div>
                                        ) : !details ? (
                                          <div style={{ fontSize: 12, color: "var(--danger)" }}>Failed to load details.</div>
                                        ) : (
                                          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

                                            {/* ── Compliance banner ── */}
                                            {isViolated && (
                                              <div style={{
                                                background: "rgba(220,38,38,.06)", border: "1px solid rgba(220,38,38,.2)",
                                                borderRadius: 8, padding: "10px 14px",
                                              }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#dc2626", marginBottom: 6 }}>
                                                  <ShieldAlert size={13} /> Policy Violation
                                                </div>
                                                {details.compliance.map((c, i) => (
                                                  <div key={i} style={{ fontSize: 12, borderLeft: "2px solid #dc2626", paddingLeft: 10, marginTop: 5, color: "var(--text-secondary)" }}>
                                                    <strong style={{ color: "var(--text-primary)" }}>{c.policy_name}</strong>
                                                    {c.policy_description ? ` — ${c.policy_description}` : ""}
                                                  </div>
                                                ))}
                                              </div>
                                            )}

                                            {/* ── Classification grid ── */}
                                            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: "16px 24px", alignItems: "start" }}>
                                              {/* Sensitivity */}
                                              <div>
                                                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--text-muted)", marginBottom: 6 }}>Sensitivity</div>
                                                <div style={{
                                                  display: "inline-flex", alignItems: "center", gap: 6,
                                                  padding: "4px 12px", borderRadius: 20, fontWeight: 700, fontSize: 12,
                                                  background: sensBg, color: sensColor, border: `1.5px solid ${sensColor}30`,
                                                }}>
                                                  <Shield size={11} /> {sens}
                                                </div>
                                                {details.classification?.confidence_score != null && (
                                                  <div style={{ marginTop: 6 }}>
                                                    <ConfidenceBar score={details.classification.confidence_score} />
                                                  </div>
                                                )}
                                              </div>

                                              {/* Tags */}
                                              <div>
                                                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--text-muted)", marginBottom: 6 }}>Tags</div>
                                                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                                  {[
                                                    ...(details.classification?.data_type_tags || []),
                                                    ...(details.classification?.regulatory_tags || []),
                                                  ].map(t => (
                                                    <span key={t} style={{
                                                      fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 600,
                                                      ...tagStyle(t),
                                                    }}>{shortTag(t)}</span>
                                                  ))}
                                                  {!details.classification?.data_type_tags?.length && !details.classification?.regulatory_tags?.length && (
                                                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>No tags</span>
                                                  )}
                                                </div>
                                              </div>

                                              {/* Domain */}
                                              <div>
                                                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--text-muted)", marginBottom: 6 }}>Domain</div>
                                                <span style={{ fontSize: 12, fontWeight: 500 }}>{details.classification?.business_domain || "—"}</span>
                                              </div>
                                            </div>

                                            {/* ── Description + samples ── */}
                                            <div style={{ background: "rgba(0,0,0,.02)", borderRadius: 8, padding: "10px 12px" }}>
                                              {(details.description_details?.business_description || details.description_details?.ai_suggested_description) ? (
                                                <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: details.description_details?.example_values ? 8 : 0 }}>
                                                  {details.description_details.business_description ? (
                                                    details.description_details.business_description
                                                  ) : (
                                                    <span>
                                                      <Sparkles size={11} style={{ display: "inline", marginRight: 4, color: "var(--color-accent)" }} />
                                                      <em>{details.description_details.ai_suggested_description}</em>
                                                    </span>
                                                  )}
                                                </div>
                                              ) : (
                                                <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                                                  No description yet. AI descriptions generate after scan completes.
                                                </div>
                                              )}
                                              {details.description_details?.example_values && (
                                                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                                                  <span style={{ fontWeight: 600 }}>Samples: </span>
                                                  <code style={{ background: "rgba(0,0,0,.05)", padding: "1px 5px", borderRadius: 3, fontSize: 10 }}>
                                                    {details.description_details.example_values}
                                                  </code>
                                                </div>
                                              )}
                                            </div>

                                            {/* ── Governance Recommendations ── */}
                                            <div>
                                              <button
                                                onClick={() => setShowGovernance(p => ({ ...p, [col.id]: !p[col.id] }))}
                                                style={{ fontSize: 11, color: sensColor, background: "none", border: "none", cursor: "pointer", padding: "2px 0", display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}
                                              >
                                                {showGovernance[col.id] ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                                                <Shield size={11} /> Governance & Handling Requirements
                                              </button>
                                              {showGovernance[col.id] && (
                                                <div style={{ marginTop: 8 }}>
                                                  <GovernancePanel colId={col.id} sens={sens} />
                                                </div>
                                              )}
                                            </div>

                                            {/* ── Reasoning (collapsible) ── */}
                                            {details.classification?.reasoning && (
                                              <div>
                                                <button
                                                  onClick={() => setShowReasoning(p => ({ ...p, [col.id]: !p[col.id] }))}
                                                  style={{ fontSize: 11, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", padding: "2px 0", display: "flex", alignItems: "center", gap: 4 }}
                                                >
                                                  {showReasoning[col.id] ? <EyeOff size={11} /> : <Eye size={11} />}
                                                  {showReasoning[col.id] ? "Hide reasoning" : "Show reasoning"}
                                                </button>
                                                {showReasoning[col.id] && (
                                                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.6, fontStyle: "italic", padding: "6px 10px", background: "rgba(0,0,0,.02)", borderRadius: 6, borderLeft: "2px solid var(--card-border)" }}>
                                                    {details.classification.reasoning}
                                                  </div>
                                                )}
                                              </div>
                                            )}

                                            {/* ── Action bar ── */}
                                            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                                              <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => setEditingColumns(p => ({ ...p, [col.id]: !p[col.id] }))}
                                              >
                                                {editingColumns[col.id]
                                                  ? <><X size={12} /> Cancel</>
                                                  : <><Sliders size={12} /> Edit</>}
                                              </button>
                                            </div>

                                            {/* ── Edit form ── */}
                                            {editingColumns[col.id] && form && (
                                              <div style={{ border: "1px solid var(--card-border)", borderRadius: 10, padding: 16, background: "#fff", marginTop: 2 }}>
                                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                                                  {/* Left: classification */}
                                                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-muted)", borderBottom: "1px solid var(--card-border)", paddingBottom: 6 }}>
                                                      Privacy & Classification
                                                    </div>
                                                    <div className="form-group" style={{ margin: 0 }}>
                                                      <label className="form-label">Sensitivity</label>
                                                      <select className="form-input" value={form.sensitivity_level} onChange={e => handleFieldChange(col.id, "sensitivity_level", e.target.value)}>
                                                        {["Public","Internal","Confidential","Restricted","Critical"].map(l => <option key={l}>{l}</option>)}
                                                      </select>
                                                    </div>
                                                    <div className="form-group" style={{ margin: 0 }}>
                                                      <label className="form-label">Business Domain</label>
                                                      <select className="form-input" value={form.business_domain} onChange={e => handleFieldChange(col.id, "business_domain", e.target.value)}>
                                                        {["Customer","Financial","Legal & Compliance","Operational","HR & Employee","R&D"].map(d => <option key={d}>{d}</option>)}
                                                      </select>
                                                    </div>
                                                    <div className="form-group" style={{ margin: 0 }}>
                                                      <label className="form-label">Privacy Tags (comma-separated)</label>
                                                      <input className="form-input" value={form.data_type_tags} onChange={e => handleFieldChange(col.id, "data_type_tags", e.target.value)} placeholder="PII.Email, PHI.Diagnosis" />
                                                    </div>
                                                    <div className="form-group" style={{ margin: 0 }}>
                                                      <label className="form-label">Regulatory Tags</label>
                                                      <input className="form-input" value={form.regulatory_tags} onChange={e => handleFieldChange(col.id, "regulatory_tags", e.target.value)} placeholder="GDPR, HIPAA" />
                                                    </div>
                                                    <div className="form-group" style={{ margin: 0 }}>
                                                      <label className="form-label">Override Justification</label>
                                                      <input className="form-input" value={form.reasoning} onChange={e => handleFieldChange(col.id, "reasoning", e.target.value)} placeholder="e.g. Confirmed SSN pattern manually" />
                                                    </div>
                                                  </div>
                                                  {/* Right: description */}
                                                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-muted)", borderBottom: "1px solid var(--card-border)", paddingBottom: 6 }}>
                                                      Asset Definition
                                                    </div>
                                                    <div className="form-group" style={{ margin: 0 }}>
                                                      <label className="form-label">Business Description</label>
                                                      <textarea className="form-input" rows={3} style={{ resize: "vertical" }} value={form.business_description} onChange={e => handleFieldChange(col.id, "business_description", e.target.value)} placeholder="Business meaning of this field…" />
                                                    </div>
                                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                                      <div className="form-group" style={{ margin: 0 }}>
                                                        <label className="form-label"><User size={10} style={{ display: "inline", marginRight: 3 }} />Owner</label>
                                                        <input className="form-input" value={form.owner} onChange={e => handleFieldChange(col.id, "owner", e.target.value)} placeholder="Team name" />
                                                      </div>
                                                      <div className="form-group" style={{ margin: 0 }}>
                                                        <label className="form-label"><User size={10} style={{ display: "inline", marginRight: 3 }} />Steward</label>
                                                        <input className="form-input" value={form.steward} onChange={e => handleFieldChange(col.id, "steward", e.target.value)} placeholder="email@domain.com" />
                                                      </div>
                                                    </div>
                                                    {glossary.length > 0 && (
                                                      <div className="form-group" style={{ margin: 0 }}>
                                                        <label className="form-label"><BookOpen size={10} style={{ display: "inline", marginRight: 3 }} />Glossary Terms</label>
                                                        <div style={{ border: "1px solid var(--card-border)", borderRadius: 6, padding: 8, maxHeight: 110, overflowY: "auto", display: "flex", flexDirection: "column", gap: 5 }}>
                                                          {glossary.map(term => (
                                                            <label key={term.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                                                              <input type="checkbox" checked={form.linked_glossary_ids.includes(term.id)} onChange={() => handleToggleGlossary(col.id, term.id)} />
                                                              <strong>{term.name}</strong>
                                                            </label>
                                                          ))}
                                                        </div>
                                                      </div>
                                                    )}
                                                    {details.description_details?.ai_suggested_description && (
                                                      <button className="btn btn-secondary btn-sm" onClick={() => handleFieldChange(col.id, "business_description", details.description_details!.ai_suggested_description)}>
                                                        <Sparkles size={11} /> Use AI Suggestion
                                                      </button>
                                                    )}
                                                  </div>
                                                </div>
                                                {/* Save bar */}
                                                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--card-border)" }}>
                                                  {savingStatus[col.id] === "saving" && <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Saving…</span>}
                                                  {savingStatus[col.id] === "success" && <span style={{ fontSize: 12, color: "var(--success)" }}>✓ Saved</span>}
                                                  {savingStatus[col.id] === "error"   && <span style={{ fontSize: 12, color: "var(--danger)" }}>Failed to save</span>}
                                                  <button className="btn btn-secondary btn-sm" onClick={() => setEditingColumns(p => ({ ...p, [col.id]: false }))}>Cancel</button>
                                                  <button className="btn btn-primary btn-sm" onClick={() => handleSaveAll(col.id)}>
                                                    <Save size={12} /> Save
                                                  </button>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
