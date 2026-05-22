import re
import os
import json
import logging
from typing import List, Dict, Any, Tuple
import httpx

logger = logging.getLogger("classifyai.engine")

# Load patterns
EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
PHONE_REGEX = re.compile(r"^\+?1?\s*\(?-?\d{3}\)?\s*-?\d{3}\s*-?\d{4}$")
SSN_REGEX = re.compile(r"^\d{3}-\d{2}-\d{4}$")
CREDIT_CARD_REGEX = re.compile(r"^(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12}|(?:2131|1800|35\d{3})\d{11})$")
IP_REGEX = re.compile(r"^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$")

class ClassificationEngine:
    @staticmethod
    def classify_local(column_name: str, sample_values: List[str]) -> Dict[str, Any]:
        """Runs fast structural name keyword matching and pattern checks on sample values."""
        name_lower = column_name.lower()
        data_type_tags = []
        regulatory_tags = []
        sensitivity_level = "Internal"
        business_domain = "Operational"
        confidence_score = 0.5
        reasoning_parts = []

        # 1. Check patterns in sample values
        email_matches = 0
        phone_matches = 0
        ssn_matches = 0
        cc_matches = 0
        ip_matches = 0
        total_samples = len(sample_values)

        for val in sample_values:
            val_str = str(val).strip()
            if not val_str:
                continue
            if EMAIL_REGEX.match(val_str):
                email_matches += 1
            if PHONE_REGEX.match(val_str):
                phone_matches += 1
            if SSN_REGEX.match(val_str):
                ssn_matches += 1
            if CREDIT_CARD_REGEX.match(val_str):
                cc_matches += 1
            if IP_REGEX.match(val_str):
                ip_matches += 1

        if total_samples > 0:
            if email_matches / total_samples > 0.5:
                data_type_tags.append("PII.Email")
                regulatory_tags.append("GDPR")
                sensitivity_level = "Confidential"
                confidence_score = 0.9
                reasoning_parts.append(f"More than 50% of values matched Email pattern.")
            
            if phone_matches / total_samples > 0.5:
                data_type_tags.append("PII.Phone")
                regulatory_tags.append("GDPR")
                sensitivity_level = "Confidential"
                confidence_score = 0.9
                reasoning_parts.append(f"More than 50% of values matched Phone pattern.")
                
            if ssn_matches / total_samples > 0.5:
                data_type_tags.append("PII.SSN")
                regulatory_tags.extend(["GDPR", "CCPA"])
                sensitivity_level = "Restricted"
                confidence_score = 0.95
                reasoning_parts.append(f"More than 50% of values matched SSN pattern.")

            if cc_matches / total_samples > 0.5:
                data_type_tags.append("PCI.CardNumber")
                regulatory_tags.append("PCI-DSS")
                sensitivity_level = "Restricted"
                confidence_score = 0.95
                reasoning_parts.append(f"More than 50% of values matched Credit Card pattern.")

            if ip_matches / total_samples > 0.5:
                data_type_tags.append("PII.Behavioral")
                regulatory_tags.append("GDPR")
                sensitivity_level = "Internal"
                confidence_score = 0.8
                reasoning_parts.append(f"More than 50% of values matched IP Address pattern.")

        # 2. Keyword checks on column name
        if "email" in name_lower and "PII.Email" not in data_type_tags:
            data_type_tags.append("PII.Email")
            regulatory_tags.append("GDPR")
            sensitivity_level = "Confidential"
            confidence_score = max(confidence_score, 0.85)
            reasoning_parts.append("Column name contains 'email'.")

        if any(kw in name_lower for kw in ["phone", "mobile", "telephone"]) and "PII.Phone" not in data_type_tags:
            data_type_tags.append("PII.Phone")
            regulatory_tags.append("GDPR")
            sensitivity_level = "Confidential"
            confidence_score = max(confidence_score, 0.8)
            reasoning_parts.append("Column name refers to telephone/phone number.")

        if any(kw in name_lower for kw in ["ssn", "social_security", "socialsecurity"]) and "PII.SSN" not in data_type_tags:
            data_type_tags.append("PII.SSN")
            regulatory_tags.extend(["GDPR", "CCPA"])
            sensitivity_level = "Restricted"
            confidence_score = max(confidence_score, 0.9)
            reasoning_parts.append("Column name contains 'ssn' / social security keywords.")

        if any(kw in name_lower for kw in ["card", "cc_", "creditcard", "pan"]) and "PCI.CardNumber" not in data_type_tags:
            data_type_tags.append("PCI.CardNumber")
            regulatory_tags.append("PCI-DSS")
            sensitivity_level = "Restricted"
            confidence_score = max(confidence_score, 0.9)
            reasoning_parts.append("Column name contains credit card indicators.")

        if any(kw in name_lower for kw in ["name", "fname", "lname", "firstname", "lastname"]):
            data_type_tags.append("PII.Name")
            regulatory_tags.append("GDPR")
            sensitivity_level = "Confidential"
            confidence_score = max(confidence_score, 0.8)
            reasoning_parts.append("Column name contains name identifiers.")

        if any(kw in name_lower for kw in ["salary", "wage", "compensation", "payroll"]):
            data_type_tags.append("BusinessDomain.HR")
            sensitivity_level = "Confidential"
            business_domain = "HR"
            confidence_score = max(confidence_score, 0.85)
            reasoning_parts.append("Column name relates to human resources and payroll.")

        if any(kw in name_lower for kw in ["revenue", "transaction", "amount", "price", "invoice", "payment"]):
            data_type_tags.append("BusinessDomain.Financial")
            business_domain = "Financial"
            confidence_score = max(confidence_score, 0.75)
            reasoning_parts.append("Column name relates to finance or business transactions.")

        # Default classification reasoning
        if not data_type_tags:
            data_type_tags.append("BusinessDomain.Operational")
            sensitivity_level = "Internal"
            reasoning_parts.append("Applied default Operational classification with low sensitivity.")

        return {
            "sensitivity_level": sensitivity_level,
            "data_type_tags": list(set(data_type_tags)),
            "regulatory_tags": list(set(regulatory_tags)),
            "business_domain": business_domain,
            "confidence_score": confidence_score,
            "reasoning": " | ".join(reasoning_parts),
            "classification_method": "Rule-Based"
        }

    @classmethod
    async def classify_with_gemini(cls, column_name: str, column_type: str, sample_values: List[str], table_name: str = "") -> Dict[str, Any]:
        """Backward compatible wrapper calling classify_with_settings."""
        return await cls.classify_with_settings(column_name, column_type, sample_values, table_name, None)

    @classmethod
    async def classify_with_settings(
        cls,
        column_name: str,
        column_type: str,
        sample_values: List[str],
        table_name: str = "",
        llm_config: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Calls the configured LLM provider for advanced semantic classification."""
        if not llm_config:
            api_key = os.getenv("GEMINI_API_KEY")
            if not api_key:
                return cls.classify_local(column_name, sample_values)
            llm_config = {
                "provider": "gemini",
                "model_name": "gemini-2.5-flash",
                "api_key": api_key
            }
            
        provider = llm_config.get("provider", "gemini")
        model_name = llm_config.get("model_name", "gemini-2.5-flash")
        api_url = llm_config.get("api_url", "")
        api_key = llm_config.get("api_key", "")
        
        if not api_key:
            return cls.classify_local(column_name, sample_values)
            
        prompt = f"""
You are a data classification expert. Analyze the following data asset column and classify its sensitivity, data types, and applicable regulations.

Context:
- Table Name: "{table_name}"
- Column Name: "{column_name}"
- Column Type: "{column_type}"
- Sample Values: {sample_values}

Classify based on this taxonomy:
1. sensitivity_level: One of [Public, Internal, Confidential, Restricted, Critical]
2. data_type_tags: List of tags from: [PII.Name, PII.Email, PII.Phone, PII.Address, PII.SSN, PII.Biometric, PII.Behavioral, PCI.CardNumber, PCI.CVV, PCI.BankAccount, PHI.MedicalRecord, PHI.Diagnosis, PHI.Insurance, BusinessDomain.Financial, BusinessDomain.HR, BusinessDomain.Legal, BusinessDomain.Customer, BusinessDomain.Operational, AIReadiness.TrainingApproved, AIReadiness.TrainingRestricted]
3. regulatory_tags: List of tags from: [GDPR, HIPAA, PCI-DSS, CCPA, SOX]
4. business_domain: One of [Financial, HR, Legal, Customer, Operational, R&D]
5. confidence_score: Float between 0.0 and 1.0
6. reasoning: Short, clear explanation of the classification.

Respond ONLY with a JSON object matching this structure:
{{
  "sensitivity_level": "...",
  "data_type_tags": ["..."],
  "regulatory_tags": ["..."],
  "business_domain": "...",
  "confidence_score": 0.95,
  "reasoning": "..."
}}
"""

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                if provider == "gemini":
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
                    payload = {
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {
                            "responseMimeType": "application/json",
                            "temperature": 0.1
                        }
                    }
                    response = await client.post(url, json=payload)
                    if response.status_code == 200:
                        result = response.json()
                        text_content = result["candidates"][0]["content"]["parts"][0]["text"]
                        data = json.loads(text_content.strip())
                        data["classification_method"] = "LLM"
                        return data
                    else:
                        logger.error(f"Gemini API returned status {response.status_code}: {response.text}")
                elif provider == "openai":
                    url = api_url or "https://api.openai.com/v1/chat/completions"
                    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                    payload = {
                        "model": model_name,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.1,
                        "response_format": {"type": "json_object"}
                    }
                    response = await client.post(url, headers=headers, json=payload)
                    if response.status_code == 200:
                        result = response.json()
                        text_content = result["choices"][0]["message"]["content"]
                        data = json.loads(text_content.strip())
                        data["classification_method"] = "LLM"
                        return data
                    else:
                        logger.error(f"OpenAI API returned status {response.status_code}: {response.text}")
        except Exception as e:
            logger.error(f"Failed to query dynamic LLM ({provider}): {str(e)}")

        # Fallback to local
        local_result = cls.classify_local(column_name, sample_values)
        local_result["reasoning"] = f"Dynamic LLM ({provider}) failed. Fallback: {local_result['reasoning']}"
        return local_result

    @classmethod
    async def generate_description(cls, column_name: str, column_type: str, sample_values: List[str], tags: List[str], table_name: str = "") -> str:
        """Backward compatible wrapper calling generate_description_with_settings."""
        return await cls.generate_description_with_settings(column_name, column_type, sample_values, tags, table_name, None)

    @classmethod
    async def generate_description_with_settings(
        cls,
        column_name: str,
        column_type: str,
        sample_values: List[str],
        tags: List[str],
        table_name: str = "",
        llm_config: Dict[str, Any] = None
    ) -> str:
        """Generates a business draft description using dynamic LLM, or a rule-based template."""
        if not llm_config:
            api_key = os.getenv("GEMINI_API_KEY")
            if not api_key:
                tag_str = ", ".join(tags)
                return f"Auto-generated column description for '{column_name}' of type {column_type}. Associated classifications: {tag_str}."
            llm_config = {
                "provider": "gemini",
                "model_name": "gemini-2.5-flash",
                "api_key": api_key
            }
            
        provider = llm_config.get("provider", "gemini")
        model_name = llm_config.get("model_name", "gemini-2.5-flash")
        api_url = llm_config.get("api_url", "")
        api_key = llm_config.get("api_key", "")
        
        if not api_key:
            tag_str = ", ".join(tags)
            return f"Auto-generated column description for '{column_name}' of type {column_type}. Associated classifications: {tag_str}."

        prompt = f"""
Given a column '{column_name}' of type {column_type} in table '{table_name}'.
Associated tags/classifications: {tags}.
Sample values: {sample_values}.

Write a clear, concise, professional business description (1-2 sentences) explaining what this field is and how it should be used by business users. 
Do not include any greeting or conversational filler.
"""

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                if provider == "gemini":
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
                    payload = {
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {"temperature": 0.2}
                    }
                    response = await client.post(url, json=payload)
                    if response.status_code == 200:
                        result = response.json()
                        text = result["candidates"][0]["content"]["parts"][0]["text"].strip()
                        if text.startswith('"') and text.endswith('"'):
                            text = text[1:-1]
                        return text
                elif provider == "openai":
                    url = api_url or "https://api.openai.com/v1/chat/completions"
                    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                    payload = {
                        "model": model_name,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.2
                    }
                    response = await client.post(url, headers=headers, json=payload)
                    if response.status_code == 200:
                        result = response.json()
                        text = result["choices"][0]["message"]["content"].strip()
                        if text.startswith('"') and text.endswith('"'):
                            text = text[1:-1]
                        return text
        except Exception as e:
            logger.error(f"Failed to generate dynamic description ({provider}): {str(e)}")

        return f"Auto-generated description for {column_name} ({column_type})."

    # ── Hermes direct caller (used by table/db description agents) ──────────────

    @classmethod
    async def _call_hermes_for_description(cls, system_prompt: str, user_message: str) -> str:
        """Calls the configured Hermes/Anthropic LLM and extracts the 'description' field from JSON."""
        base_url = os.getenv("HERMES_BASE_URL", "").strip().rstrip("/")
        api_key  = os.getenv("HERMES_API_KEY", "")
        model    = os.getenv("HERMES_MODEL", "claude-haiku-4-5-20251001")
        if not base_url:
            return ""
        try:
            if "anthropic.com" in base_url:
                headers = {
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                }
                payload = {
                    "model": model, "max_tokens": 1024,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": user_message}],
                }
                async with httpx.AsyncClient(timeout=45.0) as client:
                    resp = await client.post(f"{base_url}/v1/messages", headers=headers, json=payload)
                if resp.status_code != 200:
                    logger.warning("Hermes Anthropic HTTP %d: %s", resp.status_code, resp.text[:200])
                    return ""
                raw = resp.json()["content"][0]["text"].strip()
            else:
                headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
                payload = {
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user",   "content": user_message},
                    ],
                    "temperature": 0.2,
                    "response_format": {"type": "json_object"},
                }
                async with httpx.AsyncClient(timeout=45.0) as client:
                    resp = await client.post(f"{base_url}/chat/completions", headers=headers, json=payload)
                if resp.status_code != 200:
                    logger.warning("Hermes OpenAI HTTP %d: %s", resp.status_code, resp.text[:200])
                    return ""
                raw = resp.json()["choices"][0]["message"]["content"]

            # Strip markdown fences if present
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"): raw = raw[4:]
                raw = raw.strip()
            return json.loads(raw).get("description", "")
        except Exception as exc:
            logger.warning("_call_hermes_for_description error: %s", exc)
            return ""

    @classmethod
    async def summarize_table(
        cls,
        table_name: str,
        source_name: str,
        columns: List[Dict[str, Any]],
    ) -> str:
        """
        Calls the table_summarizer agent to generate a 2-3 sentence business description
        for a table from its column classifications and sample values.

        columns: list of dicts with keys: name, type, sensitivity, tags, samples
        """
        system_prompt = (
            "You are a data catalog documentation specialist for data governance.\n"
            "You will receive a database table name and a structured JSON summary of its columns,\n"
            "including data types, classification tags (PII/PCI/PHI), sensitivity levels, and sample values.\n\n"
            "Write a clear, professional 2-3 sentence business description that explains:\n"
            "  - What this table stores and represents in the business context\n"
            "  - The sensitivity profile and key data risks present\n"
            "  - How this data is likely used by the business\n\n"
            "Rules:\n"
            "  - Write for a business audience (data stewards, compliance officers, analysts)\n"
            "  - Do NOT start with 'This table...'\n"
            "  - Do NOT include greetings, markdown, or technical jargon\n"
            "  - Do NOT exceed 3 sentences\n\n"
            'Respond ONLY with valid JSON: {"description": "Your 2-3 sentence description."}'
        )
        col_summaries = [
            {
                "column": c.get("name", ""),
                "type": c.get("type", "VARCHAR"),
                "sensitivity": c.get("sensitivity", "Internal"),
                "tags": c.get("tags", [])[:6],
                "samples": c.get("samples", [])[:3],
            }
            for c in columns[:25]
        ]
        user_message = (
            f"Table: {table_name}\n"
            f"Database: {source_name}\n\n"
            f"Columns ({len(columns)} total):\n"
            f"{json.dumps(col_summaries, indent=2)}"
        )
        return await cls._call_hermes_for_description(system_prompt, user_message)

    @classmethod
    async def profile_database(
        cls,
        source_name: str,
        source_type: str,
        tables: List[Dict[str, Any]],
    ) -> str:
        """
        Calls the database_profiler agent to generate a 3-4 sentence executive description
        of an entire database from its table summaries.

        tables: list of dicts with keys: name, description, column_count,
                sensitivity_levels, key_tags
        """
        system_prompt = (
            "You are a data governance architect and data catalog specialist.\n"
            "You will receive a database name, its type, and a JSON summary of all its tables\n"
            "including their business descriptions and sensitivity profiles.\n\n"
            "Write a clear, professional 3-4 sentence executive-level description that explains:\n"
            "  - What this database represents in the organisation\n"
            "  - The types of data it stores and the business functions it supports\n"
            "  - The overall sensitivity and compliance risk profile\n"
            "  - Any key data governance considerations\n\n"
            "Rules:\n"
            "  - Write for a C-level or compliance audience\n"
            "  - Do NOT start with 'This database...'\n"
            "  - Do NOT include greetings, markdown, or bullet points\n"
            "  - Do NOT exceed 4 sentences\n\n"
            'Respond ONLY with valid JSON: {"description": "Your 3-4 sentence description."}'
        )
        table_summaries = [
            {
                "table": t.get("name", ""),
                "description": t.get("description", ""),
                "column_count": t.get("column_count", 0),
                "sensitivity_levels": t.get("sensitivity_levels", []),
                "key_tags": t.get("key_tags", [])[:6],
            }
            for t in tables
        ]
        user_message = (
            f"Database: {source_name}\n"
            f"Type: {source_type}\n\n"
            f"Tables ({len(tables)} total):\n"
            f"{json.dumps(table_summaries, indent=2)}"
        )
        return await cls._call_hermes_for_description(system_prompt, user_message)

    @classmethod
    async def classify_with_agents(
        cls,
        column_name: str,
        column_type: str,
        sample_values: List[str],
        table_name: str = "",
        llm_config: Dict[str, Any] = None,
    ) -> Dict[str, Any]:
        """
        Tries the multi-agent Hermes pipeline first.
        Falls back to classify_with_settings when Hermes is not configured or fails.
        """
        try:
            from backend.app.classification.agents.orchestrator import AgentOrchestrator
            return await AgentOrchestrator.classify(
                table_name=table_name,
                column_name=column_name,
                column_type=column_type,
                sample_values=sample_values,
                fallback_llm_config=llm_config,
            )
        except Exception as exc:
            logger.warning("classify_with_agents unexpected error: %s — falling back", exc)
            return await cls.classify_with_settings(
                column_name=column_name,
                column_type=column_type,
                sample_values=sample_values,
                table_name=table_name,
                llm_config=llm_config,
            )
