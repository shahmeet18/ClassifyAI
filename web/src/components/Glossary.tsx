import React, { useState, useEffect } from "react";
import { BookOpen, Plus, Tag, HelpCircle, User, RefreshCw, UserCheck } from "lucide-react";

interface GlossaryTerm {
  id: string;
  name: string;
  definition: string;
  formula: string | null;
  domain: string;
  owner: string;
  synonyms: string[];
  status: string;
}

export default function Glossary() {
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // New Term Form States
  const [name, setName] = useState("");
  const [definition, setDefinition] = useState("");
  const [formula, setFormula] = useState("");
  const [domain, setDomain] = useState("Operational");
  const [owner, setOwner] = useState("Data Governance");
  const [synonyms, setSynonyms] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const fetchGlossary = async () => {
    setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/v1/glossary");
      const data = await res.json();
      setTerms(data);
    } catch (e) {
      console.error("Failed to load glossary", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGlossary();
  }, []);

  const handleCreateTerm = async () => {
    if (!name || !definition) {
      setErrorMsg("Term Name and Definition are required.");
      return;
    }
    setErrorMsg("");
    try {
      const synonymList = synonyms.split(",").map(s => s.trim()).filter(Boolean);
      const res = await fetch("http://localhost:8000/api/v1/glossary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          definition,
          formula: formula || null,
          domain,
          owner,
          synonyms: synonymList
        })
      });

      if (res.status === 200 || res.status === 201) {
        // Reset form
        setName("");
        setDefinition("");
        setFormula("");
        setDomain("Operational");
        setOwner("Data Governance");
        setSynonyms("");
        setShowAddModal(false);
        fetchGlossary();
      } else {
        const error = await res.json();
        setErrorMsg(error.detail || "Failed to create term.");
      }
    } catch (e) {
      setErrorMsg("Connection error.");
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Business Glossary</h1>
          <p className="page-subtitle">Standardize business definitions, calculations, and KPI formulas across all databases.</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button className="btn btn-secondary" onClick={fetchGlossary} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Reload
          </button>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <Plus size={14} /> Add Glossary Term
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {terms.map((term) => (
          <div key={term.id} className="glass-panel" style={{ borderLeft: "4px solid var(--primary)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
              <div>
                <h2 style={{ fontSize: "18px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                  {term.name}
                  {term.synonyms.map((syn) => (
                    <span key={syn} className="badge badge-tag" style={{ fontSize: "10px" }}>{syn}</span>
                  ))}
                </h2>
                <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "4px" }}>
                  Domain: <strong>{term.domain}</strong> • Status: <span style={{ color: "var(--success)" }}>{term.status}</span>
                </div>
              </div>
              
              <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "12px", color: "var(--text-secondary)" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <User size={12} /> Steward: <strong>{term.owner}</strong>
                </span>
              </div>
            </div>

            <p style={{ fontSize: "14px", color: "var(--text-primary)", marginTop: "12px", lineHeight: "1.6" }}>
              {term.definition}
            </p>

            {term.formula && (
              <div
                style={{
                  background: "rgba(0,0,0,0.3)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  padding: "10px 14px",
                  marginTop: "12px",
                  fontFamily: "monospace",
                  fontSize: "12px",
                  color: "var(--secondary)"
                }}
              >
                <span style={{ color: "var(--text-secondary)", fontWeight: 600, marginRight: "8px" }}>CALCULATION:</span>
                {term.formula}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div className="glass-panel" style={{ width: "480px", border: "1px solid rgba(255,255,255,0.15)", background: "#0a0a0d" }}>
            <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
              <BookOpen size={18} style={{ color: "var(--primary)" }} /> Add Glossary Term
            </h2>

            {errorMsg && (
              <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "var(--danger)", padding: "10px", borderRadius: "6px", fontSize: "13px", marginBottom: "16px" }}>
                {errorMsg}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Term Name</label>
              <input
                type="text"
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Annual Recurring Revenue"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Synonyms (comma-separated)</label>
              <input
                type="text"
                className="form-input"
                value={synonyms}
                onChange={(e) => setSynonyms(e.target.value)}
                placeholder="e.g. ARR, Recurring Revenue"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Definition</label>
              <textarea
                className="form-input"
                style={{ resize: "vertical", height: "80px" }}
                value={definition}
                onChange={(e) => setDefinition(e.target.value)}
                placeholder="Business definition..."
              />
            </div>

            <div className="form-group">
              <label className="form-label">Calculation Formula (Optional)</label>
              <input
                type="text"
                className="form-input"
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
                placeholder="e.g. MRR * 12"
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }} className="form-group">
              <div>
                <label className="form-label">Domain</label>
                <select
                  className="form-input"
                  style={{ background: "#111" }}
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                >
                  <option value="Financial">Financial</option>
                  <option value="Customer">Customer</option>
                  <option value="HR">HR</option>
                  <option value="Legal">Legal & Compliance</option>
                  <option value="Operational">Operational</option>
                </select>
              </div>
              <div>
                <label className="form-label">Steward / Owner</label>
                <input
                  type="text"
                  className="form-input"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  placeholder="e.g. Finance Operations"
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleCreateTerm}>
                Create Term
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
