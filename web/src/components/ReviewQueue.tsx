import React, { useState, useEffect } from "react";
import { Check, X, Edit, ShieldAlert, Sparkles, RefreshCw, Eye } from "lucide-react";

interface ReviewItem {
  classification_id: string;
  asset_id: string;
  asset_name: string;
  parent_table: string;
  asset_type: string;
  data_type: string;
  sensitivity_level: string;
  data_type_tags: string[];
  regulatory_tags: string[];
  confidence_score: number;
  reasoning: string;
  example_values: string;
}

export default function ReviewQueue() {
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeOverride, setActiveOverride] = useState<ReviewItem | null>(null);
  
  // Override form states
  const [overrideSensitivity, setOverrideSensitivity] = useState("Internal");
  const [overrideDataTypeTags, setOverrideDataTypeTags] = useState("");
  const [overrideRegTags, setOverrideRegTags] = useState("");

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/v1/review");
      const data = await res.json();
      setQueue(data);
    } catch (e) {
      console.error("Failed to load review queue", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const handleApprove = async (id: string) => {
    try {
      await fetch(`http://localhost:8000/api/v1/review/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "Approve" })
      });
      setQueue((prev) => prev.filter((item) => item.classification_id !== id));
    } catch (e) {
      console.error("Approval failed", e);
    }
  };

  const handleReject = async (id: string) => {
    try {
      await fetch(`http://localhost:8000/api/v1/review/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "Reject" })
      });
      setQueue((prev) => prev.filter((item) => item.classification_id !== id));
    } catch (e) {
      console.error("Rejection failed", e);
    }
  };

  const openOverrideModal = (item: ReviewItem) => {
    setActiveOverride(item);
    setOverrideSensitivity(item.sensitivity_level);
    setOverrideDataTypeTags(item.data_type_tags.join(", "));
    setOverrideRegTags(item.regulatory_tags.join(", "));
  };

  const handleOverrideSubmit = async () => {
    if (!activeOverride) return;
    try {
      const dataTypes = overrideDataTypeTags.split(",").map(t => t.trim()).filter(Boolean);
      const regTypes = overrideRegTags.split(",").map(t => t.trim()).filter(Boolean);

      await fetch(`http://localhost:8000/api/v1/review/${activeOverride.classification_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "Override",
          sensitivity_level: overrideSensitivity,
          data_type_tags: dataTypes,
          regulatory_tags: regTypes
        })
      });
      setQueue((prev) => prev.filter((item) => item.classification_id !== activeOverride.classification_id));
      setActiveOverride(null);
    } catch (e) {
      console.error("Override failed", e);
    }
  };

  return (
    <div className="page-wrapper fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Review Queue</h1>
          <p className="page-subtitle">Verify AI classification recommendations and confirm compliance mappings.</p>
        </div>
        <button className="btn btn-secondary" onClick={fetchQueue} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Reload Queue
        </button>
      </div>

      {queue.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: "center", padding: "64px 32px" }}>
          <ShieldAlert size={48} style={{ color: "var(--text-muted)", marginBottom: "16px" }} />
          <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px" }}>Review Queue Clear</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", maxWidth: "400px", margin: "0 auto" }}>
            No columns are pending validation. Start metadata scans on your active data sources to trigger AI classifiers.
          </p>
        </div>
      ) : (
        <div className="glass-panel" style={{ padding: "0" }}>
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Column / Table</th>
                  <th>Examples</th>
                  <th>Classification</th>
                  <th>Compliance Tags</th>
                  <th>Confidence</th>
                  <th>Reasoning</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((item) => (
                  <tr key={item.classification_id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{item.asset_name}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                        Table: <span style={{ color: "var(--text-primary)" }}>{item.parent_table}</span> • {item.data_type}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontFamily: "monospace", fontSize: "11px", color: "var(--text-secondary)", background: "rgba(255,255,255,0.03)", padding: "2px 6px", borderRadius: "4px" }}>
                        {item.example_values || "N/A"}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-sensitivity badge-${item.sensitivity_level.toLowerCase()}`}>
                        {item.sensitivity_level}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                        {item.data_type_tags.map((tag) => (
                          <span key={tag} className="badge badge-tag">{tag}</span>
                        ))}
                        {item.regulatory_tags.map((tag) => (
                          <span key={tag} className="badge badge-regulatory">{tag}</span>
                        ))}
                        {item.data_type_tags.length === 0 && item.regulatory_tags.length === 0 && (
                          <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>-</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: item.confidence_score >= 0.8 ? "var(--success)" : "var(--warning)", display: "flex", alignItems: "center", gap: "2px" }}>
                        <Sparkles size={11} /> {Math.round(item.confidence_score * 100)}%
                      </span>
                    </td>
                    <td style={{ fontSize: "12px", color: "var(--text-secondary)", maxWidth: "200px" }}>
                      {item.reasoning}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: "6px", borderRadius: "6px" }}
                          title="Override details"
                          onClick={() => openOverrideModal(item)}
                        >
                          <Edit size={12} />
                        </button>
                        <button
                          className="btn btn-danger"
                          style={{ padding: "6px", borderRadius: "6px" }}
                          title="Reject and clear"
                          onClick={() => handleReject(item.classification_id)}
                        >
                          <X size={12} />
                        </button>
                        <button
                          className="btn btn-primary"
                          style={{ padding: "6px", borderRadius: "6px", background: "var(--success)" }}
                          title="Approve AI suggestion"
                          onClick={() => handleApprove(item.classification_id)}
                        >
                          <Check size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Override Dialog Modal */}
      {activeOverride && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15, 23, 42, 0.6)", display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "center", zIndex: 100, backdropFilter: "blur(4px)" }}>
          <div className="glass-panel" style={{ width: "450px", background: "#ffffff", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)" }}>
            <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
              <Edit size={18} style={{ color: "var(--primary)" }} /> Override Classification
            </h2>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "20px" }}>
              Manually map column <strong>{activeOverride.asset_name}</strong> to your customized sensitivity tags.
            </p>

            <div className="form-group">
              <label className="form-label">Sensitivity level</label>
              <select
                className="form-input"
                value={overrideSensitivity}
                onChange={(e) => setOverrideSensitivity(e.target.value)}
              >
                <option value="Public">Public</option>
                <option value="Internal">Internal</option>
                <option value="Confidential">Confidential</option>
                <option value="Restricted">Restricted</option>
                <option value="Critical">Critical</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Data Type Tags (comma-separated)</label>
              <input
                type="text"
                className="form-input"
                value={overrideDataTypeTags}
                onChange={(e) => setOverrideDataTypeTags(e.target.value)}
                placeholder="e.g. PII.Email, PII.Name"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Regulatory Compliance Tags (comma-separated)</label>
              <input
                type="text"
                className="form-input"
                value={overrideRegTags}
                onChange={(e) => setOverrideRegTags(e.target.value)}
                placeholder="e.g. GDPR, CCPA, HIPAA"
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
              <button className="btn btn-secondary" onClick={() => setActiveOverride(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleOverrideSubmit}>
                Apply Override
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
