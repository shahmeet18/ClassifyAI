# ClassifyAI: Classification Criteria

This document describes every classification criterion used by the system — sensitivity levels, rule-based detection, LLM taxonomy, policy overrides, classification methods, and review statuses.

---

## 1. Sensitivity Levels (5 tiers)

| Level | Risk Score | Meaning |
|---|---|---|
| `Public` | 10 | Safe to share externally |
| `Internal` | 25 | Default / operational data |
| `Confidential` | 60 | PII like names, emails, phones |
| `Restricted` | 85 | SSNs, credit cards, medical records |
| `Critical` | 99 | API keys, secrets, cardholder data |

---

## 2. Rule-Based Detection

Runs via `ClassificationEngine.classify_local()` — always active, no API key required.

### A. Sample Value Regex Patterns

Fires when >50% of a column's sample values match the pattern.

| Pattern | Tag Applied | Sensitivity | Regulatory Tag | Confidence |
|---|---|---|---|---|
| Email format | `PII.Email` | Confidential | GDPR | 0.90 |
| Phone / mobile number | `PII.Phone` | Confidential | GDPR | 0.90 |
| SSN (`000-00-0000`) | `PII.SSN` | Restricted | GDPR, CCPA | 0.95 |
| Credit card number (Luhn formats) | `PCI.CardNumber` | Restricted | PCI-DSS | 0.95 |
| IP address | `PII.Behavioral` | Internal | GDPR | 0.80 |

### B. Column Name Keyword Matching

Fires on substring match against the column name (case-insensitive).

| Keyword(s) | Tag Applied | Sensitivity | Regulatory Tag | Confidence |
|---|---|---|---|---|
| `email` | `PII.Email` | Confidential | GDPR | 0.85 |
| `phone`, `mobile`, `telephone` | `PII.Phone` | Confidential | GDPR | 0.80 |
| `ssn`, `social_security`, `socialsecurity` | `PII.SSN` | Restricted | GDPR, CCPA | 0.90 |
| `card`, `cc_`, `creditcard`, `pan` | `PCI.CardNumber` | Restricted | PCI-DSS | 0.90 |
| `name`, `fname`, `lname`, `firstname`, `lastname` | `PII.Name` | Confidential | GDPR | 0.80 |
| `salary`, `wage`, `compensation`, `payroll` | `BusinessDomain.HR` | Confidential | — | 0.85 |
| `revenue`, `transaction`, `amount`, `price`, `invoice`, `payment` | `BusinessDomain.Financial` | Internal | — | 0.75 |
| *(no match)* | `BusinessDomain.Operational` | Internal | — | 0.50 |

---

## 3. LLM-Based Classification

Runs via `ClassificationEngine.classify_with_settings()` when a Gemini or OpenAI API key is configured. Falls back to rule-based if the call fails.

The LLM receives: table name, column name, data type, and sample values. It is instructed to return all fields as JSON using the following taxonomy.

### Data Type Tags

| Category | Tags |
|---|---|
| PII | `PII.Name`, `PII.Email`, `PII.Phone`, `PII.Address`, `PII.SSN`, `PII.Biometric`, `PII.Behavioral` |
| PCI | `PCI.CardNumber`, `PCI.CVV`, `PCI.BankAccount` |
| PHI | `PHI.MedicalRecord`, `PHI.Diagnosis`, `PHI.Insurance` |
| Business Domain | `BusinessDomain.Financial`, `BusinessDomain.HR`, `BusinessDomain.Legal`, `BusinessDomain.Customer`, `BusinessDomain.Operational` |
| AI Readiness | `AIReadiness.TrainingApproved`, `AIReadiness.TrainingRestricted` |

### Regulatory Tags

`GDPR`, `HIPAA`, `PCI-DSS`, `CCPA`, `SOX`

### Business Domains

`Financial`, `HR`, `Legal`, `Customer`, `Operational`, `R&D`

---

## 4. Policy-Based Override

Runs via `PolicyExecutor.evaluate_policies()` immediately after AI/rule classification. Matching policies override the sensitivity and tags produced by the engine.

### Seeded Policies

| Group | Policy Name | Condition | Actions |
|---|---|---|---|
| GDPR | GDPR Email Protection Policy | column name contains `email` | Sensitivity → Confidential, tags: `PII.Email`, `GDPR` |
| GDPR | GDPR Customer Contact Info Policy | column name contains `phone` | Sensitivity → Confidential, tags: `PII.Phone`, `GDPR` |
| HIPAA | HIPAA Medical Record Policy | column name contains `diagnosis` | Sensitivity → Restricted, tags: `PHI.MedicalRecord`, `HIPAA` |
| PCI | PCI Cardholder Data Policy | column name contains `card` | Sensitivity → Critical, tags: `PCI.CardNumber`, `PCI-DSS` |
| Custom | Custom API Key Leak Prevention | column name contains `key` | Sensitivity → Critical, tag: `AIReadiness.TrainingRestricted` |

### Available Condition Types

| Condition Key | How It Matches |
|---|---|
| `column_name_like` | Substring match on column name (case-insensitive) |
| `column_name_equals` | Exact match on column name |
| `data_type` | Substring match on SQL data type (e.g. `DECIMAL`, `VARCHAR`) |
| `sample_matches` | Regex against any sample value |

---

## 5. Classification Methods

| Value | When Set |
|---|---|
| `Rule-Based` | `classify_local` ran, no LLM configured |
| `LLM` | Gemini or OpenAI returned a valid response |
| `Policy-Enforced` | A policy matched and overrode the AI/rule result |
| `Manual` | Human edited directly via Asset Dictionary or Override in Review Queue |
| `Automated` | Model-level default before any classification runs |

---

## 6. Review Statuses

| Status | Set When |
|---|---|
| `Pending` | Immediately after a scan completes |
| `Approved` | Reviewer accepted the AI classification as-is |
| `Rejected` | Reviewer dismissed it — resets to `Internal` sensitivity with no tags, risk score → 25 |
| `Overridden` | Reviewer replaced it with their own sensitivity, tags, and domain |
| `Reviewed` | Set by a direct manual edit via the Asset Dictionary |
