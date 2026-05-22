import React, { useState, useEffect } from "react";
import {
  Shield,
  Plus,
  Trash2,
  RefreshCw,
  ChevronRight,
  CreditCard,
  Stethoscope,
  Lock,
  Check,
  AlertTriangle,
  X,
} from "lucide-react";

interface Policy {
  id: string;
  name: string;
  description: string;
  policy_type: string;
  group_name: string;
  conditions: any;
  actions: any;
  is_active: boolean;
}

const GROUP_META: Record<string, { color: string; icon: React.ComponentType<any>; desc: string }> = {
  GDPR:   { color: "#2563eb", icon: Shield,      desc: "EU General Data Protection Regulation" },
  HIPAA:  { color: "#1e8c5a", icon: Stethoscope, desc: "US Health Insurance Portability & Accountability Act" },
  PCI:    { color: "#c0392b", icon: CreditCard,  desc: "Payment Card Industry Data Security Standard" },
  Custom: { color: "#6e7e85", icon: Lock,        desc: "Custom organizational rules" },
};

const getGroupMeta = (group: string) => GROUP_META[group] || GROUP_META["Custom"];

export default function Policies() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["GDPR"]));
  const [showModal, setShowModal] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [groupName, setGroupName] = useState("GDPR");
  const [customGroup, setCustomGroup] = useState("");
  const [colKeyword, setColKeyword] = useState("");
  const [sensitivity, setSensitivity] = useState("Confidential");
  const [dataTypeTag, setDataTypeTag] = useState("");
  const [regTag, setRegTag] = useState("");

  const fetchPolicies = async () => {
    setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/v1/policies");
      if (res.ok) setPolicies(await res.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchPolicies(); }, []);

  const flash = (msg: string, isError = false) => {
    if (isError) { setError(msg); setTimeout(() => setError(""), 4000); }
    else { setSuccess(msg); setTimeout(() => setSuccess(""), 4000); }
  };

  const handleToggle = async (id: string) => {
    try {
      const res = await fetch(`http://localhost:8000/api/v1/policies/${id}/toggle`, { method: "PATCH" });
      if (res.ok) fetchPolicies();
    } catch {}
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this policy rule?")) return;
    try {
      const res = await fetch(`http://localhost:8000/api/v1/policies/${id}`, { method: "DELETE" });
      if (res.ok) { flash("Policy deleted."); fetchPolicies(); }
    } catch { flash("Delete failed.", true); }
  };

  const handleCreate = async () => {
    if (!name || !colKeyword) { flash("Name and column keyword are required.", true); return; }
    const group = groupName === "__custom__" ? (customGroup || "Custom") : groupName;
    try {
      const res = await fetch("http://localhost:8000/api/v1/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, description, policy_type: "classification", group_name: group,
          conditions: { column_name_like: colKeyword.toLowerCase() },
          actions: {
            apply_tag: dataTypeTag || "PII.General",
            set_sensitivity: sensitivity,
            apply_tags: regTag ? [regTag] : [],
          },
        }),
      });
      if (res.ok) {
        flash("Policy created.");
        setShowModal(false);
        setName(""); setDescription(""); setColKeyword(""); setSensitivity("Confidential");
        setDataTypeTag(""); setRegTag(""); setCustomGroup("");
        fetchPolicies();
      } else {
        const e = await res.json();
        flash(e.detail || "Creation failed.", true);
      }
    } catch { flash("Network error.", true); }
  };

  // Build group list
  const groupNamesInData: string[] = Array.from(new Set(policies.map(p => p.group_name)));
  const knownOrder = ["GDPR", "HIPAA", "PCI", "Custom"];
  const allGroups = [
    ...knownOrder.filter(g => groupNamesInData.includes(g)),
    ...groupNamesInData.filter(g => !knownOrder.includes(g)),
    ...knownOrder.filter(g => !groupNamesInData.includes(g)), // show empty groups too
  ].filter((v, i, a) => a.indexOf(v) === i);

  const toggleExpand = (g: string) => setExpandedGroups(prev => {
    const next = new Set(prev);
    next.has(g) ? next.delete(g) : next.add(g);
    return next;
  });

  const totalActive = policies.filter(p => p.is_active).length;

  return (
    <div className="page-wrapper fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Policy Rules</h1>
          <p className="page-subtitle">
            Manage compliance rules grouped by regulation. {policies.length} rules · {totalActive} active.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-secondary" onClick={fetchPolicies} disabled={loading}>
            <RefreshCw size={13} className={loading ? "spin" : ""} /> Reload
          </button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={13} /> New Rule
          </button>
        </div>
      </div>

      {success && <div className="alert alert-success fade-in" style={{ marginBottom: 16 }}><Check size={13} />{success}</div>}
      {error   && <div className="alert alert-danger  fade-in" style={{ marginBottom: 16 }}><AlertTriangle size={13} />{error}</div>}

      {/* Policy group accordions */}
      <div>
        {allGroups.map(group => {
          const meta = getGroupMeta(group);
          const Icon = meta.icon;
          const groupPolicies = policies.filter(p => p.group_name === group);
          const isExpanded = expandedGroups.has(group);
          const activeCount = groupPolicies.filter(p => p.is_active).length;

          return (
            <div key={group} className="policy-group">
              <div className="policy-group-header" onClick={() => toggleExpand(group)}>
                <div className="policy-group-header-left">
                  <div className="policy-group-dot" style={{ background: meta.color }} />
                  <div>
                    <div className="policy-group-name" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Icon size={15} style={{ color: meta.color }} />
                      {group}
                      <span className="badge" style={{ background: "var(--color-light)", color: "var(--text-secondary)", fontSize: 10 }}>
                        {activeCount}/{groupPolicies.length} active
                      </span>
                    </div>
                    <div className="policy-group-count">{meta.desc}</div>
                  </div>
                </div>
                <ChevronRight
                  size={16}
                  style={{ color: "var(--text-muted)", transform: isExpanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.2s" }}
                />
              </div>

              {isExpanded && (
                <div className="policy-group-body">
                  {groupPolicies.length === 0 ? (
                    <div style={{ padding: "20px 18px", fontSize: 13, color: "var(--text-muted)", textAlign: "center" }}>
                      No rules in this group.{" "}
                      <button className="btn btn-secondary btn-sm" style={{ marginLeft: 6 }}
                        onClick={() => { setGroupName(group); setShowModal(true); }}>
                        <Plus size={11} /> Add Rule
                      </button>
                    </div>
                  ) : (
                    groupPolicies.map(policy => (
                      <div key={policy.id} className="policy-row" style={{ alignItems: "flex-start", gap: 14 }}>
                        <div className="policy-row-left">
                          <div className="policy-row-name" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {policy.name}
                            <span className={`badge ${policy.is_active ? "badge-public" : ""}`}
                              style={!policy.is_active ? { background: "var(--color-light)", color: "var(--text-muted)" } : {}}>
                              {policy.is_active ? "Active" : "Inactive"}
                            </span>
                          </div>
                          <div className="policy-row-desc">{policy.description}</div>
                          {/* Condition & action pills */}
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                            {policy.conditions?.column_name_like && (
                              <span style={{ fontSize: 11, background: "var(--color-light)", borderRadius: 5, padding: "2px 8px", color: "var(--text-secondary)" }}>
                                column contains: <strong>{policy.conditions.column_name_like}</strong>
                              </span>
                            )}
                            {policy.actions?.set_sensitivity && (
                              <span className={`badge badge-${policy.actions.set_sensitivity.toLowerCase()}`} style={{ fontSize: 10 }}>
                                → {policy.actions.set_sensitivity}
                              </span>
                            )}
                            {policy.actions?.apply_tag && (
                              <span className="badge badge-tag" style={{ fontSize: 10 }}>{policy.actions.apply_tag}</span>
                            )}
                            {(policy.actions?.apply_tags || []).map((t: string) => (
                              <span key={t} className="badge badge-regulatory" style={{ fontSize: 10 }}>{t}</span>
                            ))}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginTop: 2 }}>
                          <label className="toggle">
                            <input type="checkbox" checked={policy.is_active}
                              onChange={() => handleToggle(policy.id)} />
                            <span className="toggle-slider" />
                          </label>
                          <button className="btn btn-danger btn-sm btn-icon"
                            onClick={() => handleDelete(policy.id)}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Rule Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal fade-in">
            <div className="modal-header">
              <span className="modal-title">New Policy Rule</span>
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setShowModal(false)}>
                <X size={13} />
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div className="form-group" style={{ gridColumn: "span 2" }}>
                  <label className="form-label">Rule Name</label>
                  <input className="form-input" placeholder="e.g. Flag email columns" value={name}
                    onChange={e => setName(e.target.value)} />
                </div>
                <div className="form-group" style={{ gridColumn: "span 2" }}>
                  <label className="form-label">Description</label>
                  <input className="form-input" placeholder="What does this rule enforce?" value={description}
                    onChange={e => setDescription(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Policy Group</label>
                  <select className="form-input" value={groupName} onChange={e => setGroupName(e.target.value)}>
                    <option value="GDPR">GDPR</option>
                    <option value="HIPAA">HIPAA</option>
                    <option value="PCI">PCI</option>
                    <option value="Custom">Custom</option>
                    <option value="__custom__">— New group name —</option>
                  </select>
                </div>
                {groupName === "__custom__" && (
                  <div className="form-group">
                    <label className="form-label">New Group Name</label>
                    <input className="form-input" placeholder="e.g. SOX" value={customGroup}
                      onChange={e => setCustomGroup(e.target.value)} />
                  </div>
                )}
                <div className="form-group" style={groupName !== "__custom__" ? { gridColumn: "span 2" } : {}}>
                  <label className="form-label">Column keyword (condition)</label>
                  <input className="form-input" placeholder="e.g. email, ssn, card" value={colKeyword}
                    onChange={e => setColKeyword(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Set Sensitivity</label>
                  <select className="form-input" value={sensitivity} onChange={e => setSensitivity(e.target.value)}>
                    {["Public","Internal","Confidential","Restricted","Critical"].map(l =>
                      <option key={l} value={l}>{l}</option>
                    )}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Apply Tag (optional)</label>
                  <input className="form-input" placeholder="e.g. PII.Email" value={dataTypeTag}
                    onChange={e => setDataTypeTag(e.target.value)} />
                </div>
                <div className="form-group" style={{ gridColumn: "span 2" }}>
                  <label className="form-label">Regulatory Tag (optional)</label>
                  <select className="form-input" value={regTag} onChange={e => setRegTag(e.target.value)}>
                    <option value="">— None —</option>
                    {["GDPR","HIPAA","PCI-DSS","CCPA","SOX"].map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate}>Create Rule</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
