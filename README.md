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

ClassifyAI is an end-to-end **data security governance platform** that helps teams discover, classify, and manage sensitive data across databases and file stores. It combines fast rule-based detection with a coordinated pipeline of specialized AI agents to label every column in your data estate with the correct sensitivity tier, regulatory tags, and a human-readable business description — then surfaces all of this in an interactive web dashboard for stewards to review, approve, and publish back to your data catalog.

---

## 🚀 Features

### 🤖 Multi-Agent AI Classification Pipeline
Nine specialized AI agents (powered by Claude / any OpenAI-compatible LLM) work in sequence on every column:

| Agent | Role |
|---|---|
| **PII Detector** | Names, emails, phones, addresses, SSNs, biometrics, behavioral IDs |
| **PCI Detector** | Card numbers (PANs), CVVs, bank account numbers |
| **PHI Detector** | Medical records, diagnoses (ICD codes), insurance details |
| **Business Domain Classifier** | Assigns Financial / HR / Legal / Customer / Operational / R&D domain + AI readiness |
| **Sensitivity Classifier** | Synthesises all tags into one of 5 sensitivity tiers |
| **Regulatory Tagger** | Maps data to GDPR, HIPAA, PCI-DSS, CCPA, SOX |
| **Description Generator** | Writes a 1–2 sentence business description per column |
| **Table Summarizer** | Generates a business summary for each table |
| **Database Profiler** | Produces an executive-level database risk profile |

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

### 🔄 OpenMetadata Catalog Sync
Publish verified classifications and descriptions back to your OpenMetadata instance using the JSON Patch API with full sync audit logs.

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
│                          │   /api/v1/openmetadata  (sync)       │
└──────────────────────────┴──────────────────────────────────────┘
          │                              │
          └──────── Supabase Auth ───────┘
                         │
              ┌──────────▼──────────┐
              │   Multi-Agent AI    │
              │  (Claude / OpenAI)  │
              │  9 specialized LLM  │
              │  agents in pipeline │
              └─────────────────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.10+, FastAPI, SQLAlchemy 2.0, aiosqlite, asyncpg |
| **Frontend** | React 18, TypeScript, Vite 5 |
| **Auth** | Supabase (Auth + PostgreSQL for profiles/orgs) |
| **AI / LLM** | Anthropic Claude (or any OpenAI-compatible endpoint) |
| **Database** | SQLite (local dev) / PostgreSQL (production) |
| **Catalog** | OpenMetadata JSON Patch API |

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
│   │   │   ├── agents/       # 9-agent YAML config + orchestrator
│   │   │   ├── engine.py     # Classification engine (rule + LLM)
│   │   │   └── policy_executor.py
│   │   ├── connectors/       # PostgreSQL connector
│   │   ├── core/             # Database, security, JWT
│   │   ├── openmetadata/     # OM catalog sync client
│   │   ├── main.py           # FastAPI app + all routes
│   │   └── models.py         # SQLAlchemy models
│   ├── seed.py               # Seed default data
│   ├── test_suite.py         # Unit tests
│   └── requirements.txt
├── web/
│   ├── src/
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
└── README.md
```

---

## 🧪 Running Tests

```bash
# From project root with venv activated
PYTHONPATH=. python backend/test_suite.py
```

Covers: pattern detection, JSON patch builders, security helpers (password hashing, JWT), policy engine, and PostgreSQL connector mocking.

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
