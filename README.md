<div align="center">

# 🔍 ClassifyAI

**AI-powered data classification and governance platform**

Automatically scan, classify, and catalog sensitive data across your databases using a multi-agent AI pipeline, rule-based pattern detection, and a full policy engine — all from a clean web dashboard.

[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-Auth-3ECF8E?style=flat&logo=supabase&logoColor=white)](https://supabase.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## ✨ What is ClassifyAI?

ClassifyAI is an end-to-end **data security governance platform** that helps teams discover, classify, and manage sensitive data across databases and file stores. It combines fast rule-based detection with **Hermes** — a custom-built multi-agent AI orchestration framework — to label every column in your data estate with the correct sensitivity tier, regulatory tags, and a human-readable business description. All results surface in an interactive web dashboard where data stewards can review, approve, or override AI classifications before they become official.

---

## 🚀 Features

### 🧠 Hermes — Custom Multi-Agent AI Framework

**Hermes** is the AI engine at the heart of ClassifyAI. It is a custom-built multi-agent orchestration framework where 9 specialized LLM agents run in a coordinated sequence, each focused on a specific classification task and passing enriched context downstream to the next agent.

Every agent is independently defined in a **YAML configuration file** with its own system prompt, output schema, and enable/disable toggle — making the pipeline fully transparent, configurable, and extensible without touching any Python code.

```
Column Input
     │
     ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ PII         │───▶│ PCI         │───▶│ PHI         │
│ Detector    │    │ Detector    │    │ Detector    │
└─────────────┘    └─────────────┘    └─────────────┘
                                             │
                          ┌──────────────────┘
                          ▼
               ┌──────────────────────┐
               │ Business Domain      │
               │ Classifier           │
               └──────────────────────┘
                          │
               ┌──────────┴──────────┐
               ▼                     ▼
     ┌──────────────┐      ┌──────────────────┐
     │ Sensitivity  │      │ Regulatory       │
     │ Classifier   │      │ Tagger           │
     └──────────────┘      └──────────────────┘
               │                     │
               └──────────┬──────────┘
                          ▼
               ┌──────────────────────┐
               │ Description          │
               │ Generator            │
               └──────────────────────┘
                          │
               ┌──────────┴──────────┐
               ▼                     ▼
     ┌──────────────┐      ┌──────────────────┐
     │ Table        │      │ Database         │
     │ Summarizer   │      │ Profiler         │
     └──────────────┘      └──────────────────┘
```

| Agent | Role |
|---|---|
| **PII Detector** | Names, emails, phones, addresses, SSNs, biometrics, behavioral IDs |
| **PCI Detector** | Card numbers (PANs), CVVs, bank account numbers |
| **PHI Detector** | Medical records, diagnoses (ICD codes), insurance details |
| **Business Domain Classifier** | Assigns Financial / HR / Legal / Customer / Operational / R&D domain + AI readiness tag |
| **Sensitivity Classifier** | Synthesises all upstream tags into one of 5 sensitivity tiers |
| **Regulatory Tagger** | Maps detected data to GDPR, HIPAA, PCI-DSS, CCPA, SOX |
| **Description Generator** | Writes a 1–2 sentence business description per column |
| **Table Summarizer** | Generates a business-level summary for each table |
| **Database Profiler** | Produces an executive-level risk profile for the entire database |

Hermes connects to **Anthropic Claude** (or any OpenAI-compatible endpoint) and falls back gracefully to the built-in rule-based engine if no API key is configured — ensuring the platform is always functional.

### 🏷️ 5-Tier Sensitivity Classification

| Level | Risk Score | Meaning |
|---|---|---|
| `Public` | 10 | Non-sensitive — safe to share externally |
| `Internal` | 25 | Low sensitivity — for internal use only |
| `Confidential` | 60 | Moderate sensitivity — contains PII |
| `Restricted` | 85 | High sensitivity — regulated data (SSN, cards, PHI) |
| `Critical` | 99 | Maximum sensitivity — secrets, credentials, cardholder data |

### 🛡️ Corporate Policy Engine
- Define rules by column name pattern, data type, or sample value regex
- Automatically override AI classifications to enforce governance standards
- Pre-seeded regulatory policy groups: **GDPR, HIPAA, PCI-DSS, CCPA, Custom**
- One-click **Quick Remediate** to resolve compliance violations across your entire data estate

### 🔌 Data Connectors & Async Scanning
- **PostgreSQL** native schema discovery via `asyncpg`
- **CSV upload** for instant column analysis
- Simulated connectors for Snowflake, S3, and more
- Background scan queue with real-time progress tracking (phases, per-table/column updates)

### 📋 Governance Review Queue
Human-in-the-loop workflow: **Approve**, **Override**, or **Reject** every AI classification before it becomes official.

### 📚 Asset Dictionary
Nested directory view (Source → Table → Column) with inline classification editing, AI description acceptance, policy violation alerts, and governance recommendations per field.

### 📖 Business Glossary
Define and link reusable business terms (e.g. CLV, PHI, ARR) directly to catalog assets.

### 🔐 Auth & Multi-Tenancy
Supabase-backed authentication with organization support, role-based access (admin / steward / reviewer / viewer), and JWT-secured API.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     ClassifyAI Stack                            │
├──────────────────────────┬──────────────────────────────────────┤
│   React + TypeScript     │         FastAPI Backend              │
│   Vite • Supabase Auth   │   SQLAlchemy • aiosqlite/asyncpg     │
│                          │                                      │
│  Overview Dashboard      │   /api/v1/sources      (CRUD)        │
│  Source Manager          │   /api/v1/sources/scan  (async)      │
│  Scan & Classify Wizard  │   /api/v1/assets        (catalog)    │
│  Asset Dictionary        │   /api/v1/review        (queue)      │
│  Policy Rules            │   /api/v1/policies      (engine)     │
│  Settings + Agent Studio │   /api/v1/agents        (config)     │
└──────────────────────────┴──────────────────────────────────────┘
          │                              │
          └──────── Supabase Auth ───────┘
                         │
              ┌──────────▼──────────┐
              │       Hermes        │
              │  Multi-Agent AI     │
              │  Orchestration      │
              │  Framework          │
              │  9 specialized LLM  │
              │  agents · YAML cfg  │
              └─────────────────────┘
                         │
              ┌──────────▼──────────┐
              │  Anthropic Claude   │
              │  (or any OpenAI-    │
              │  compatible LLM)    │
              └─────────────────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.10+, FastAPI, SQLAlchemy 2.0, aiosqlite, asyncpg |
| **Frontend** | React 18, TypeScript, Vite 5 |
| **Auth** | Supabase (Auth + PostgreSQL for profiles/orgs) |
| **AI Agents** | Hermes (custom multi-agent framework) + Anthropic Claude / any OpenAI-compatible LLM |
| **Database** | SQLite (local dev) / PostgreSQL (production) |

---

## ⚡ Quick Start

### Prerequisites
- Python **3.10+**
- Node.js **18+**
- A [Supabase](https://supabase.com) project (free tier works)
- An Anthropic or OpenAI-compatible API key (optional — falls back to rule-based classification)

### 1. Clone the repository

```bash
git clone https://github.com/shahmeet18/ClassifyAI.git
cd ClassifyAI
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```env
# LLM (Anthropic Claude or any OpenAI-compatible endpoint)
HERMES_BASE_URL=https://api.anthropic.com
HERMES_API_KEY=your-api-key-here
HERMES_MODEL=claude-haiku-4-5-20251001

# Supabase
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key

# Backend URL (used by the frontend)
VITE_API_URL=http://localhost:8000
```

### 3. Set up Supabase tables

In your Supabase dashboard → **SQL Editor**, run the contents of [`supabase/schema.sql`](supabase/schema.sql).

### 4. Start the backend

```bash
# Create and activate virtualenv
python3 -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate

# Install dependencies
pip install -r backend/requirements.txt

# Seed default sources, glossary terms & policies
PYTHONPATH=. python backend/seed.py

# Start the API server
PYTHONPATH=. uvicorn backend.app.main:app --reload --port 8000
```

> The interactive API docs are available at **http://localhost:8000/docs**

### 5. Start the frontend

```bash
cd web
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## 📁 Project Structure

```
ClassifyAI/
├── backend/
│   ├── app/
│   │   ├── api/routes/       # Auth endpoints
│   │   ├── classification/
│   │   │   ├── agents/       # 9-agent YAML config + Hermes orchestrator
│   │   │   ├── engine.py     # Classification engine (rule-based + Hermes)
│   │   │   └── policy_executor.py
│   │   ├── connectors/       # PostgreSQL connector
│   │   ├── core/             # Database, security, JWT
│   │   ├── main.py           # FastAPI app + all routes
│   │   └── models.py         # SQLAlchemy models
│   ├── seed.py               # Seed default data
│   ├── test_suite.py         # Unit tests
│   └── requirements.txt
├── web/
│   ├── src/
│   │   ├── assets/           # Static assets (images)
│   │   ├── components/       # Dashboard, AssetDictionary, Policies…
│   │   ├── contexts/         # AuthContext (Supabase)
│   │   ├── lib/supabase.ts   # Supabase client
│   │   ├── pages/            # Landing, Auth, Onboarding
│   │   └── App.tsx
│   ├── vite.config.ts
│   └── package.json
├── supabase/
│   └── schema.sql            # Supabase tables + RLS policies
├── docs/
│   └── classification_criteria.md   # Full classification taxonomy reference
├── .env.example              # Environment variable template
├── LICENSE
└── README.md
```

---

## 🧪 Running Tests

```bash
# From project root with venv activated
PYTHONPATH=. python backend/test_suite.py
```

Covers: pattern detection, security helpers (password hashing, JWT), policy engine, and PostgreSQL connector mocking.

---

## 🔭 Roadmap

ClassifyAI is actively evolving. Here's what's coming next:

- **🧩 Custom Classifiers** — Allow users to define and plug in their own classification agents directly from the dashboard, without modifying any backend code. Custom agents will follow the same YAML-based configuration pattern as the built-in Hermes agents.

- **🔗 Data Catalog Integrations** — Native integrations with popular open-source data cataloging platforms including **OpenMetadata** and **DataHub**, enabling two-way sync of classifications, tags, and business descriptions.

- **📊 More Native Connectors** — First-class connectors for Snowflake, BigQuery, MySQL, and AWS S3 to replace the current simulated implementations.

- **🔔 Alerting & Notifications** — Slack and email alerts when high-sensitivity data is discovered or when policy violations are detected during a scan.

- **📈 Audit & Compliance Reports** — Exportable PDF/CSV compliance reports per regulatory standard (GDPR, HIPAA, PCI-DSS) for use in audits.

---

## 🤝 Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change, then submit a pull request.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<div align="center">
  Built with ❤️ using FastAPI, React, and Claude AI
</div>
