import React, { useState, useEffect } from "react";
import {
  RefreshCw,
  Check,
  Bot,
  Cpu,
  Zap,
  X,
} from "lucide-react";

interface Agent {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  system_prompt: string;
}

const AGENT_ICONS: Record<string, React.ComponentType<any>> = {
  pii_detector:              Bot,
  pci_detector:              Cpu,
  phi_detector:              Zap,
  business_domain_classifier: Bot,
  sensitivity_classifier:    Cpu,
  regulatory_tagger:         Zap,
  description_generator:     Bot,
  table_summarizer:          Zap,
  database_profiler:         Cpu,
};

export default function Settings() {
  // AI Engine state
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [hermesUrl, setHermesUrl] = useState("");
  const [hermesKey, setHermesKey] = useState("");
  const [hermesModel, setHermesModel] = useState("");
  const [savingHermes, setSavingHermes] = useState(false);
  const [hermesMsg, setHermesMsg] = useState("");
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    setLoadingAgents(true);
    try {
      const res = await fetch("http://localhost:8000/api/v1/agents");
      if (res.ok) {
        const d = await res.json();
        setAgents(d.agents || d);
      }
    } catch {}
    setLoadingAgents(false);
  };

  const handleToggleAgent = async (id: string, enabled: boolean) => {
    try {
      await fetch(`http://localhost:8000/api/v1/agents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      fetchAgents();
    } catch {}
  };

  const handleSaveAgent = async () => {
    if (!editingAgent) return;
    try {
      await fetch(`http://localhost:8000/api/v1/agents/${editingAgent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editingAgent.name,
          description: editingAgent.description,
          system_prompt: editingAgent.system_prompt,
        }),
      });
      setEditingAgent(null);
      fetchAgents();
    } catch {}
  };

  return (
    <div className="page-wrapper fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Configure the AI classification engine and manage agents.</p>
        </div>
      </div>

      {/* ── AI Engine ── */}
      <div className="fade-in">
          {/* Hermes config */}
          <div className="card card-pad" style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 18, display: "flex", alignItems: "center", gap: 8 }}>
              <Bot size={15} style={{ color: "var(--color-grey)" }} /> LLM Gateway (Hermes)
            </div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.6 }}>
              Configure the AI model used by classification agents. Set the base URL, API key, and model name.
              The <code style={{ fontSize: 12, background: "var(--color-light)", padding: "1px 5px", borderRadius: 4 }}>.env</code> file
              is authoritative — changes below override until server restart.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 14 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Base URL</label>
                <input className="form-input" placeholder="https://api.anthropic.com" value={hermesUrl}
                  onChange={e => setHermesUrl(e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Model</label>
                <input className="form-input" placeholder="claude-haiku-4-5-20251001" value={hermesModel}
                  onChange={e => setHermesModel(e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">API Key</label>
                <input type="password" className="form-input" placeholder="sk-ant-…" value={hermesKey}
                  onChange={e => setHermesKey(e.target.value)} />
              </div>
            </div>
            {hermesMsg && (
              <div className="alert alert-accent fade-in" style={{ marginTop: 12 }}>
                <Check size={13} /> {hermesMsg}
              </div>
            )}
            <div style={{ marginTop: 14, display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn btn-secondary btn-sm" onClick={async () => {
                try {
                  const res = await fetch("http://localhost:8000/api/v1/settings/agents");
                  const d = await res.json();
                  setHermesUrl(d.base_url || ""); setHermesModel(d.model || ""); setHermesKey(d.api_key || "");
                } catch {}
              }}>Load Current</button>
              <button className="btn btn-primary btn-sm" disabled={savingHermes} onClick={async () => {
                setSavingHermes(true);
                try {
                  await fetch("http://localhost:8000/api/v1/settings/agents", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ base_url: hermesUrl, api_key: hermesKey, model: hermesModel }),
                  });
                  setHermesMsg("Saved. Takes effect on next scan.");
                  setTimeout(() => setHermesMsg(""), 4000);
                } catch {}
                setSavingHermes(false);
              }}>
                {savingHermes ? <RefreshCw size={12} className="spin" /> : null} Save
              </button>
            </div>
          </div>

          {/* Agents list */}
          <div className="card">
            <div className="card-header">
              <span className="card-title"><Cpu size={15} /> Classification Agents</span>
              <button className="btn btn-secondary btn-sm" onClick={fetchAgents} disabled={loadingAgents}>
                <RefreshCw size={11} className={loadingAgents ? "spin" : ""} /> Reload
              </button>
            </div>

            {loadingAgents ? (
              <div style={{ padding: 30, textAlign: "center", color: "var(--text-muted)" }}>
                <RefreshCw size={20} className="spin" style={{ display: "block", margin: "0 auto" }} />
              </div>
            ) : agents.length === 0 ? (
              <div className="empty-state" style={{ padding: "32px 20px" }}>
                <p style={{ margin: 0 }}>No agents found. Ensure the backend is running.</p>
              </div>
            ) : (
              agents.map(agent => {
                const Icon = AGENT_ICONS[agent.id] || Bot;
                return (
                  <div key={agent.id} className="agent-card">
                    <div className="agent-card-icon"><Icon size={16} /></div>
                    <div className="agent-card-body">
                      <div className="agent-card-name">{agent.name}</div>
                      <div className="agent-card-desc">{agent.description}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => setEditingAgent({ ...agent })}>
                        Edit
                      </button>
                      <label className="toggle">
                        <input type="checkbox" checked={agent.enabled}
                          onChange={() => handleToggleAgent(agent.id, agent.enabled)} />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      {/* Agent edit modal */}
      {editingAgent && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditingAgent(null)}>
          <div className="modal fade-in" style={{ width: 640 }}>
            <div className="modal-header">
              <span className="modal-title">Edit: {editingAgent.name}</span>
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setEditingAgent(null)}>
                <X size={13} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Display Name</label>
                <input className="form-input" value={editingAgent.name}
                  onChange={e => setEditingAgent(a => a ? { ...a, name: e.target.value } : null)} />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <input className="form-input" value={editingAgent.description}
                  onChange={e => setEditingAgent(a => a ? { ...a, description: e.target.value } : null)} />
              </div>
              <div className="form-group">
                <label className="form-label">System Prompt</label>
                <textarea
                  className="form-input"
                  rows={10}
                  style={{ resize: "vertical", fontFamily: "monospace", fontSize: 12 }}
                  value={editingAgent.system_prompt}
                  onChange={e => setEditingAgent(a => a ? { ...a, system_prompt: e.target.value } : null)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditingAgent(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveAgent}>Save Agent</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
