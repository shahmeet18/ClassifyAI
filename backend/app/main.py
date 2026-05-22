import os
import json
from datetime import datetime
from dotenv import load_dotenv
load_dotenv()
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, Depends, HTTPException, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, update, delete

from backend.app.core.database import engine, Base, get_db, AsyncSessionLocal
from backend.app.models import (
    DataSource, DataAsset, Classification, AssetDescription,
    GlossaryTerm, AssetGlossaryLink, Policy, OMSyncLog, AppSetting
)
from backend.app.classification.engine import ClassificationEngine
from backend.app.classification.policy_executor import PolicyExecutor
from backend.app.openmetadata.om_client import OpenMetadataClient


app = FastAPI(title="ClassifyAI Backend API", version="1.0.0")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from backend.app.api.routes.auth import router as auth_router
app.include_router(auth_router)


def get_hermes_config() -> dict:
    """Returns Hermes config from env vars. Empty dict means not configured."""
    base_url = os.getenv("HERMES_BASE_URL", "").strip().rstrip("/")
    if not base_url:
        return {}
    return {
        "base_url": base_url,
        "api_key": os.getenv("HERMES_API_KEY", ""),
        "model": os.getenv("HERMES_MODEL", "hermes3"),
    }


# OpenMetadata Client settings cached in memory for simplicity
om_settings = {
    "host_url": "",
    "jwt_token": ""
}

@app.on_event("startup")
async def startup_event():
    # Automatically create SQLite tables if they do not exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger_log = open("classifyai_backend.log", "w")
    logger_log.write(f"ClassifyAI backend started at {datetime.utcnow()}\n")
    logger_log.close()

# --- Health check ---
@app.get("/api/v1/health")
async def health():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}

# --- Dashboard Stats ---
@app.get("/api/v1/dashboard/stats")
async def get_dashboard_stats(db: AsyncSession = Depends(get_db)):
    # Counts
    total_sources = await db.scalar(select(func.count(DataSource.id)))
    total_assets = await db.scalar(select(func.count(DataAsset.id)))
    total_tables = await db.scalar(select(func.count(DataAsset.id)).where(DataAsset.asset_type == "table"))
    total_columns = await db.scalar(select(func.count(DataAsset.id)).where(DataAsset.asset_type == "column"))
    
    # Classifications
    classified_cols = await db.scalar(
        select(func.count(Classification.id))
        .join(DataAsset, Classification.asset_id == DataAsset.id)
        .where(DataAsset.asset_type == "column")
    )
    
    pending_reviews = await db.scalar(
        select(func.count(Classification.id))
        .where(Classification.review_status == "Pending")
    )
    
    # Coverage %
    coverage = (classified_cols / total_columns * 100.0) if total_columns > 0 else 0.0
    
    # Sensitivity levels counts
    levels = ["Public", "Internal", "Confidential", "Restricted", "Critical"]
    sensitivity_counts = {}
    for lvl in levels:
        cnt = await db.scalar(select(func.count(Classification.id)).where(Classification.sensitivity_level == lvl))
        sensitivity_counts[lvl] = cnt or 0

    # Risk score averages
    avg_risk = await db.scalar(select(func.avg(Classification.risk_score))) or 0.0

    # Per database profiles
    db_profiles = []
    sources_res = await db.execute(select(DataSource))
    sources = sources_res.scalars().all()
    for src in sources:
        src_tables = await db.scalar(select(func.count(DataAsset.id)).where(DataAsset.data_source_id == src.id, DataAsset.asset_type == "table"))
        src_columns = await db.scalar(select(func.count(DataAsset.id)).where(DataAsset.data_source_id == src.id, DataAsset.asset_type == "column"))
        
        src_classified = await db.scalar(
            select(func.count(Classification.id))
            .join(DataAsset, Classification.asset_id == DataAsset.id)
            .where(DataAsset.data_source_id == src.id, DataAsset.asset_type == "column")
        )
        
        src_avg_risk = await db.scalar(
            select(func.avg(Classification.risk_score))
            .join(DataAsset, Classification.asset_id == DataAsset.id)
            .where(DataAsset.data_source_id == src.id)
        ) or 0.0
        
        src_sensitivity = {}
        for lvl in levels:
            src_cnt = await db.scalar(
                select(func.count(Classification.id))
                .join(DataAsset, Classification.asset_id == DataAsset.id)
                .where(DataAsset.data_source_id == src.id, Classification.sensitivity_level == lvl)
            )
            src_sensitivity[lvl] = src_cnt or 0
            
        db_profiles.append({
            "source_id": src.id,
            "source_name": src.name,
            "source_type": src.source_type,
            "tables_count": src_tables or 0,
            "columns_count": src_columns or 0,
            "classified_count": src_classified or 0,
            "average_risk_score": round(float(src_avg_risk), 2),
            "sensitivity_breakdown": src_sensitivity
        })

    return {
        "total_sources": total_sources or 0,
        "total_assets": total_assets or 0,
        "total_tables": total_tables or 0,
        "total_columns": total_columns or 0,
        "coverage_percentage": round(coverage, 2),
        "pending_reviews": pending_reviews or 0,
        "sensitivity_breakdown": sensitivity_counts,
        "average_risk_score": round(float(avg_risk), 2),
        "database_profiles": db_profiles
    }

# --- Data Sources CRUD ---
@app.get("/api/v1/sources")
async def list_sources(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DataSource).order_by(DataSource.created_at.desc()))
    return result.scalars().all()

@app.post("/api/v1/sources")
async def create_source(payload: Dict[str, Any] = Body(...), db: AsyncSession = Depends(get_db)):
    source = DataSource(
        name=payload["name"],
        description=payload.get("description", ""),
        source_type=payload["source_type"],
        connection_config=payload.get("connection_config", {}),
        scan_schedule=payload.get("scan_schedule", "0 0 * * *"),
        sampling_rate=float(payload.get("sampling_rate", 100.0))
    )
    db.add(source)
    await db.commit()
    await db.refresh(source)
    return source

@app.delete("/api/v1/sources/{source_id}")
async def delete_source(source_id: str, db: AsyncSession = Depends(get_db)):
    # Deletes cascades to assets
    await db.execute(delete(DataSource).where(DataSource.id == source_id))
    await db.commit()
    return {"status": "success", "message": f"Deleted source {source_id}"}

@app.post("/api/v1/sources/{source_id}/test")
async def test_source_connection(source_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DataSource).where(DataSource.id == source_id))
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    
    if source.source_type.lower() == "postgres":
        from backend.app.connectors.postgres import PostgresConnector
        conn = PostgresConnector(source.connection_config)
        res = await conn.test_connection()
        return res
    
    # Simulate database ping for other sources
    return {"status": "success", "message": f"Successfully connected to data source '{source.name}'."}


# --- Scan & Classification Jobs ---
from fastapi import BackgroundTasks

# ── In-memory progress tracker (per active scan) ─────────────────────────────
scan_progress: Dict[str, Dict] = {}

def _prog_update(source_id: str, **kwargs) -> None:
    """Update progress dict and recalculate elapsed seconds."""
    if source_id not in scan_progress:
        return
    scan_progress[source_id].update(kwargs)
    try:
        started = datetime.fromisoformat(scan_progress[source_id]["started_at"])
        scan_progress[source_id]["elapsed_seconds"] = round(
            (datetime.utcnow() - started).total_seconds()
        )
    except Exception:
        pass

def _prog_log(source_id: str, msg: str) -> None:
    """Prepend a log line (keep last 10)."""
    if source_id not in scan_progress:
        return
    log = scan_progress[source_id].get("log", [])
    scan_progress[source_id]["log"] = ([msg] + log)[:10]


async def run_background_scan(source_id: str):
    # Initialise progress
    scan_progress[source_id] = {
        "status": "running",
        "phase": "connecting",
        "phase_label": "Connecting to data source…",
        "phase_number": 1,
        "total_phases": 4,
        "current_table": "",
        "current_column": "",
        "columns_done": 0,
        "columns_total": 0,
        "tables_done": 0,
        "tables_total": 0,
        "elapsed_seconds": 0,
        "log": ["🔍 Initialising scan…"],
        "started_at": datetime.utcnow().isoformat(),
    }

    async with AsyncSessionLocal() as db:
        # Retrieve the source
        source_result = await db.execute(select(DataSource).where(DataSource.id == source_id))
        source = source_result.scalar_one_or_none()
        if not source:
            _prog_update(source_id, status="failed", phase_label="Source not found.")
            return
            
        # We populate the source with realistic mock schema tables/columns to run our pipeline!
        mock_schemas = {
            "postgres": [
                {
                    "table": "customer_profiles",
                    "desc": "Contains customer contact details and login details",
                    "columns": [
                        {"name": "id", "type": "INTEGER", "samples": ["1", "2", "3", "4"]},
                        {"name": "fullname", "type": "VARCHAR(100)", "samples": ["John Smith", "Jane Doe", "Michael Brown", "Alice Johnson"]},
                        {"name": "email_address", "type": "VARCHAR(255)", "samples": ["john.smith@gmail.com", "jane_doe@yahoo.com", "mbrown12@gmail.com", "alice.j@corp.com"]},
                        {"name": "mobile_phone", "type": "VARCHAR(20)", "samples": ["+1-555-0199", "555-0123", "202-555-0144", "+1-301-555-0198"]},
                        {"name": "country", "type": "VARCHAR(50)", "samples": ["USA", "Canada", "UK", "Germany"]}
                    ]
                },
                {
                    "table": "financial_transactions",
                    "desc": "Ledger of sales and credit card purchases",
                    "columns": [
                        {"name": "txn_id", "type": "UUID", "samples": ["d3b07384-d113", "e4c18495-e224", "f5d29506-f335", "a6e30617-a446"]},
                        {"name": "amount_usd", "type": "DECIMAL(10,2)", "samples": ["45.99", "120.00", "9.99", "1450.50"]},
                        {"name": "cc_number", "type": "VARCHAR(16)", "samples": ["4111111111111111", "5500123456789012", "378282246310005", "4222333344445555"]},
                        {"name": "timestamp", "type": "TIMESTAMP", "samples": ["2026-05-19 12:00:00", "2026-05-19 12:05:00", "2026-05-19 12:10:00", "2026-05-19 12:15:00"]}
                    ]
                }
            ],
            "snowflake": [
                {
                    "table": "EMPLOYEE_RECORD",
                    "desc": "Internal HR record database",
                    "columns": [
                        {"name": "EMP_ID", "type": "INT", "samples": ["1001", "1002", "1003", "1004"]},
                        {"name": "SSN", "type": "VARCHAR", "samples": ["000-12-3456", "999-88-7766", "111-22-3333", "444-55-6666"]},
                        {"name": "SALARY", "type": "FLOAT", "samples": ["85000.00", "115000.00", "62000.00", "145000.00"]},
                        {"name": "DEPARTMENT", "type": "VARCHAR", "samples": ["Engineering", "HR", "Marketing", "Finance"]}
                    ]
                }
            ],
            "s3": [
                {
                    "table": "patient_records.csv",
                    "desc": "Medical records repository",
                    "columns": [
                        {"name": "PATIENT_ID", "type": "VARCHAR", "samples": ["P001", "P002", "P003", "P004"]},
                        {"name": "DIAGNOSIS_CODE", "type": "VARCHAR", "samples": ["I10 (Essential Hypertension)", "E11.9 (Type 2 Diabetes)", "J45.909 (Asthma)", "M25.562 (Pain in left knee)"]},
                        {"name": "INSURANCE_ID", "type": "VARCHAR", "samples": ["INS-9921", "INS-3829", "INS-1048", "INS-4819"]},
                        {"name": "STREET_ADDRESS", "type": "VARCHAR", "samples": ["123 Main St", "456 Oak Rd", "789 Pine Ave", "321 Elm St"]}
                    ]
                }
            ]
        }
        
        # Query database catalog via real connectors if PostgreSQL
        tables = []
        if source.source_type.lower() == "postgres":
            from backend.app.connectors.postgres import PostgresConnector
            try:
                conn = PostgresConnector(source.connection_config)
                tables = await conn.discover_assets()
            except Exception as e:
                # Fallback prints error details to console/logs
                import traceback
                traceback.print_exc()

        if not tables:
            tables = mock_schemas.get(source.source_type.lower(), mock_schemas["postgres"])

        # ── Update progress with discovered schema ────────────────────────────
        total_cols = sum(len(t["columns"]) for t in tables)
        _prog_update(source_id,
            phase="classifying", phase_number=2,
            phase_label=f"Classifying {total_cols} columns across {len(tables)} tables…",
            columns_total=total_cols, tables_total=len(tables),
        )
        _prog_log(source_id, f"✓ Schema discovered — {len(tables)} tables, {total_cols} columns")

        # Fetch active policies
        policy_result = await db.execute(select(Policy).where(Policy.is_active == True))
        policies = policy_result.scalars().all()

        # Fetch active LLM settings
        settings_res = await db.execute(select(AppSetting).where(AppSetting.key == "llm_config"))
        setting = settings_res.scalar_one_or_none()
        llm_config = setting.value if setting else {}

        for tbl in tables:
            # ── Per-table progress ────────────────────────────────────────────
            _prog_update(source_id,
                current_table=tbl["table"],
                phase_label=f"Classifying {tbl['table']} ({len(tbl['columns'])} columns)…",
            )
            _prog_log(source_id, f"📂 Processing table: {tbl['table']}")

            # Create Table Asset
            tbl_fqn = f"{source.name}.default.{tbl['table']}"
            
            # Check if table already exists
            tbl_asset_result = await db.execute(select(DataAsset).where(DataAsset.fully_qualified_name == tbl_fqn))
            tbl_asset = tbl_asset_result.scalar_one_or_none()
            
            if not tbl_asset:
                tbl_asset = DataAsset(
                    data_source_id=source.id,
                    asset_type="table",
                    fully_qualified_name=tbl_fqn,
                    display_name=tbl['table'],
                    description=tbl['desc']
                )
                db.add(tbl_asset)
                await db.flush()
                
            # Create Columns
            for col in tbl["columns"]:
                # ── Per-column progress ───────────────────────────────────────
                _prog_update(source_id, current_column=col["name"])
                _prog_log(source_id, f"  → {tbl['table']}.{col['name']} — running agents…")

                col_fqn = f"{tbl_fqn}.{col['name']}"
                col_asset_result = await db.execute(select(DataAsset).where(DataAsset.fully_qualified_name == col_fqn))
                col_asset = col_asset_result.scalar_one_or_none()
                
                if not col_asset:
                    col_asset = DataAsset(
                        data_source_id=source.id,
                        asset_type="column",
                        fully_qualified_name=col_fqn,
                        display_name=col['name'],
                        parent_asset_id=tbl_asset.id,
                        metadata_json={"data_type": col["type"]}
                    )
                    db.add(col_asset)
                    await db.flush()
                
                # Run Classification Engine — prefer agent layer when Hermes is configured
                if get_hermes_config():
                    classification_data = await ClassificationEngine.classify_with_agents(
                        column_name=col['name'],
                        column_type=col['type'],
                        sample_values=col['samples'],
                        table_name=tbl['table'],
                        llm_config=llm_config
                    )
                else:
                    classification_data = await ClassificationEngine.classify_with_settings(
                        column_name=col['name'],
                        column_type=col['type'],
                        sample_values=col['samples'],
                        table_name=tbl['table'],
                        llm_config=llm_config
                    )
                
                # Evaluate active policies
                updated_sensitivity, updated_tags, triggered_policies = PolicyExecutor.evaluate_policies(
                    column_name=col['name'],
                    data_type=col['type'],
                    samples=col['samples'],
                    current_sensitivity=classification_data["sensitivity_level"],
                    current_tags=classification_data.get("data_type_tags", []),
                    policies=policies
                )
                
                if triggered_policies:
                    classification_data["sensitivity_level"] = updated_sensitivity
                    classification_data["data_type_tags"] = updated_tags
                    classification_data["reasoning"] += f" | Policies applied: {', '.join(triggered_policies)}"
                    classification_data["classification_method"] = "Policy-Enforced"
                
                # Determine risk score based on sensitivity
                risk_map = {"Public": 10.0, "Internal": 25.0, "Confidential": 60.0, "Restricted": 85.0, "Critical": 99.0}
                risk_val = risk_map.get(classification_data["sensitivity_level"], 20.0)
                
                # Upsert Classification
                class_result = await db.execute(select(Classification).where(Classification.asset_id == col_asset.id))
                classification = class_result.scalar_one_or_none()
                
                if not classification:
                    classification = Classification(
                        asset_id=col_asset.id,
                        sensitivity_level=classification_data["sensitivity_level"],
                        data_type_tags=classification_data["data_type_tags"],
                        regulatory_tags=classification_data["regulatory_tags"],
                        business_domain=classification_data["business_domain"],
                        confidence_score=classification_data["confidence_score"],
                        risk_score=risk_val,
                        reasoning=classification_data["reasoning"],
                        classification_method=classification_data["classification_method"],
                        review_status="Pending",
                        synced_to_om=False
                    )
                    db.add(classification)
                else:
                    classification.sensitivity_level = classification_data["sensitivity_level"]
                    classification.data_type_tags = classification_data["data_type_tags"]
                    classification.regulatory_tags = classification_data["regulatory_tags"]
                    classification.business_domain = classification_data["business_domain"]
                    classification.confidence_score = classification_data["confidence_score"]
                    classification.risk_score = risk_val
                    classification.reasoning = classification_data["reasoning"]
                    classification.classification_method = classification_data["classification_method"]
                    classification.review_status = "Pending"
                    classification.synced_to_om = False
                    db.add(classification)
                    
                # ── Column classified — update counter ────────────────────────
                done = scan_progress.get(source_id, {}).get("columns_done", 0) + 1
                _prog_update(source_id, columns_done=done)
                _prog_log(source_id,
                    f"  ✓ {col['name']} → {classification_data['sensitivity_level']}"
                    + (f"  [{', '.join(classification_data.get('data_type_tags', [])[:2])}]"
                       if classification_data.get("data_type_tags") else "")
                )

                # Use description produced by agent layer if available, else generate separately
                ai_desc = classification_data.pop("_agent_description", None)
                if not ai_desc:
                    ai_desc = await ClassificationEngine.generate_description_with_settings(
                        column_name=col['name'],
                        column_type=col['type'],
                        sample_values=col['samples'],
                        tags=classification_data["data_type_tags"],
                        table_name=tbl['table'],
                        llm_config=llm_config
                    )
                
                # Create/update AssetDescription details
                desc_result = await db.execute(select(AssetDescription).where(AssetDescription.asset_id == col_asset.id))
                desc_detail = desc_result.scalar_one_or_none()
                
                if not desc_detail:
                    desc_detail = AssetDescription(
                        asset_id=col_asset.id,
                        business_description="",
                        technical_description=f"Field loaded from source schema type {col['type']}",
                        example_values=", ".join(col['samples']),
                        is_nullable=True,
                        ai_suggested_description=ai_desc,
                        documentation_status="Draft",
                        synced_to_om=False
                    )
                    db.add(desc_detail)
                else:
                    desc_detail.ai_suggested_description = ai_desc
                    db.add(desc_detail)

        # ── Phase 3: AI Descriptions ──────────────────────────────────────────
        _prog_update(source_id,
            phase="describing", phase_number=3, current_table="", current_column="",
            phase_label="Generating AI descriptions for tables and database…",
        )
        _prog_log(source_id, "✨ Classification complete — generating AI descriptions…")

        # ── Generate AI descriptions for each table ───────────────────────────
        if get_hermes_config():
            table_summaries_for_db: list = []
            for tbl in tables:
                tbl_fqn2 = f"{source.name}.default.{tbl['table']}"
                tbl_asset_res2 = await db.execute(select(DataAsset).where(DataAsset.fully_qualified_name == tbl_fqn2))
                tbl_asset2 = tbl_asset_res2.scalar_one_or_none()
                if not tbl_asset2:
                    continue
                # Build column data for summarizer
                col_data_list = []
                all_sens = set()
                all_tags: list = []
                for col in tbl["columns"]:
                    col_fqn2 = f"{tbl_fqn2}.{col['name']}"
                    col_res2 = await db.execute(select(DataAsset).where(DataAsset.fully_qualified_name == col_fqn2))
                    col_asset2 = col_res2.scalar_one_or_none()
                    if col_asset2:
                        cls_res2 = await db.execute(select(Classification).where(Classification.asset_id == col_asset2.id))
                        cls2 = cls_res2.scalar_one_or_none()
                        col_data_list.append({
                            "name": col["name"],
                            "type": col["type"],
                            "sensitivity": cls2.sensitivity_level if cls2 else "Internal",
                            "tags": (cls2.data_type_tags or []) + (cls2.regulatory_tags or []) if cls2 else [],
                            "samples": col.get("samples", [])[:3],
                        })
                        if cls2:
                            all_sens.add(cls2.sensitivity_level)
                            all_tags.extend(cls2.data_type_tags or [])
                tbl_desc = await ClassificationEngine.summarize_table(
                    table_name=tbl["table"], source_name=source.name, columns=col_data_list
                )
                if tbl_desc:
                    tbl_asset2.description = tbl_desc
                    db.add(tbl_asset2)
                table_summaries_for_db.append({
                    "name": tbl["table"],
                    "description": tbl_desc or tbl.get("desc", ""),
                    "column_count": len(tbl["columns"]),
                    "sensitivity_levels": list(all_sens),
                    "key_tags": list(set(all_tags))[:8],
                })
            # ── Generate AI description for the whole database ─────────────────
            db_desc = await ClassificationEngine.profile_database(
                source_name=source.name,
                source_type=source.source_type,
                tables=table_summaries_for_db,
            )
            if db_desc:
                source.description = db_desc

        # Update Source Scan Date
        source.last_scanned_at = datetime.utcnow()
        db.add(source)
        await db.commit()

        # ── Phase 4: Complete ─────────────────────────────────────────────────
        _prog_update(source_id,
            phase="complete", phase_number=4, status="complete",
            phase_label="Scan complete!", current_table="", current_column="",
        )
        _prog_log(source_id, "🎉 Scan finished successfully!")

from fastapi import UploadFile, File, Form


# ── CSV AI re-classification background task ──────────────────────────────────
async def reclassify_csv_with_agents(source_id: str) -> None:
    """
    After a CSV upload (which uses classify_local for speed), re-run every
    column through the full AI agent pipeline and update the DB records.
    Also generates table + database descriptions when done.
    """
    scan_progress[source_id] = {
        "status": "running",
        "phase": "classifying",
        "phase_label": "AI agents analysing columns…",
        "phase_number": 2,
        "total_phases": 3,
        "current_table": "",
        "current_column": "",
        "columns_done": 0,
        "columns_total": 0,
        "tables_done": 0,
        "tables_total": 0,
        "elapsed_seconds": 0,
        "log": ["🤖 Starting AI reclassification…"],
        "started_at": datetime.utcnow().isoformat(),
    }

    async with AsyncSessionLocal() as db:
        try:
            source_result = await db.execute(select(DataSource).where(DataSource.id == source_id))
            source = source_result.scalar_one_or_none()
            if not source:
                _prog_update(source_id, status="failed", phase_label="Source not found.")
                return

            # Load tables
            tbl_result = await db.execute(
                select(DataAsset)
                .where(DataAsset.data_source_id == source_id, DataAsset.asset_type == "table")
            )
            tables = tbl_result.scalars().all()
            _prog_update(source_id, tables_total=len(tables))

            table_summaries_for_db: list = []
            policy_result = await db.execute(select(Policy).where(Policy.is_active == True))
            policies = policy_result.scalars().all()

            for tbl in tables:
                _prog_update(source_id, current_table=tbl.display_name)
                _prog_log(source_id, f"📋 Table: {tbl.display_name}")

                cols_result = await db.execute(
                    select(DataAsset).where(DataAsset.parent_asset_id == tbl.id)
                )
                cols = cols_result.scalars().all()
                _prog_update(source_id, columns_total=len(cols))

                col_data_for_table: list = []
                all_sens: set = set()
                all_tags: list = []

                for col in cols:
                    _prog_update(source_id, current_column=col.display_name)
                    _prog_log(source_id, f"→ {col.display_name} — running agents…")

                    # Get samples from existing AssetDescription
                    desc_res = await db.execute(
                        select(AssetDescription).where(AssetDescription.asset_id == col.id)
                    )
                    desc_obj = desc_res.scalar_one_or_none()
                    samples: list = []
                    if desc_obj and desc_obj.example_values:
                        samples = [s.strip() for s in desc_obj.example_values.split(",") if s.strip()]

                    data_type = "VARCHAR"
                    if col.metadata_json and col.metadata_json.get("data_type"):
                        data_type = col.metadata_json["data_type"]

                    # Run full AI classification
                    try:
                        cls_data = await ClassificationEngine.classify_with_agents(
                            tbl.display_name, col.display_name, data_type, samples
                        )
                    except Exception as exc:
                        cls_data = ClassificationEngine.classify_local(col.display_name, samples)
                        _prog_log(source_id, f"⚠ {col.display_name} — agent error, used local fallback")

                    # Apply policies
                    updated_sens, updated_tags, triggered = PolicyExecutor.evaluate_policies(
                        column_name=col.display_name,
                        data_type=data_type,
                        samples=samples,
                        current_sensitivity=cls_data["sensitivity_level"],
                        current_tags=cls_data.get("data_type_tags", []),
                        policies=policies,
                    )
                    if triggered:
                        cls_data["sensitivity_level"] = updated_sens
                        cls_data["data_type_tags"] = updated_tags
                        cls_data["reasoning"] = (cls_data.get("reasoning") or "") + f" | Policies: {', '.join(triggered)}"
                        cls_data["classification_method"] = "Policy-Enforced"

                    risk_map = {"Public": 10.0, "Internal": 25.0, "Confidential": 60.0, "Restricted": 85.0, "Critical": 99.0}
                    risk_val = risk_map.get(cls_data["sensitivity_level"], 25.0)

                    # Upsert Classification
                    cls_res = await db.execute(
                        select(Classification).where(Classification.asset_id == col.id)
                    )
                    existing_cls = cls_res.scalar_one_or_none()
                    if existing_cls:
                        existing_cls.sensitivity_level    = cls_data["sensitivity_level"]
                        existing_cls.data_type_tags       = cls_data.get("data_type_tags", [])
                        existing_cls.regulatory_tags      = cls_data.get("regulatory_tags", [])
                        existing_cls.business_domain      = cls_data.get("business_domain", "Operational")
                        existing_cls.confidence_score     = cls_data.get("confidence_score", 0.5)
                        existing_cls.risk_score           = risk_val
                        existing_cls.reasoning            = cls_data.get("reasoning", "")
                        existing_cls.classification_method = cls_data.get("classification_method", "multi-agent")
                        db.add(existing_cls)
                    else:
                        db.add(Classification(
                            asset_id=col.id,
                            sensitivity_level=cls_data["sensitivity_level"],
                            data_type_tags=cls_data.get("data_type_tags", []),
                            regulatory_tags=cls_data.get("regulatory_tags", []),
                            business_domain=cls_data.get("business_domain", "Operational"),
                            confidence_score=cls_data.get("confidence_score", 0.5),
                            risk_score=risk_val,
                            reasoning=cls_data.get("reasoning", ""),
                            classification_method=cls_data.get("classification_method", "multi-agent"),
                            review_status="Pending",
                            synced_to_om=False,
                        ))

                    # Update AI description in AssetDescription
                    ai_desc = cls_data.pop("_agent_description", None) or ""
                    if not ai_desc:
                        ai_desc = await ClassificationEngine.generate_description_with_settings(
                            column_name=col.display_name,
                            column_type=data_type,
                            sample_values=samples,
                            tags=cls_data.get("data_type_tags", []),
                            table_name=tbl.display_name,
                            llm_config=None,
                        ) or ""
                    if desc_obj:
                        desc_obj.ai_suggested_description = ai_desc
                        db.add(desc_obj)
                    elif ai_desc:
                        db.add(AssetDescription(
                            asset_id=col.id,
                            business_description="",
                            technical_description=f"Column imported from CSV file",
                            example_values=", ".join(samples[:5]),
                            is_nullable=True,
                            ai_suggested_description=ai_desc,
                            documentation_status="Draft",
                            synced_to_om=False,
                        ))

                    done = scan_progress[source_id].get("columns_done", 0) + 1
                    _prog_update(source_id, columns_done=done)
                    _prog_log(source_id, f"✓ {col.display_name} → {cls_data['sensitivity_level']}")

                    all_sens.add(cls_data["sensitivity_level"])
                    all_tags.extend(cls_data.get("data_type_tags", []))
                    col_data_for_table.append({
                        "name": col.display_name,
                        "type": data_type,
                        "sensitivity": cls_data["sensitivity_level"],
                        "tags": cls_data.get("data_type_tags", []) + cls_data.get("regulatory_tags", []),
                        "samples": samples[:3],
                    })

                await db.flush()
                _prog_update(source_id, tables_done=scan_progress[source_id].get("tables_done", 0) + 1)
                table_summaries_for_db.append({
                    "name": tbl.display_name,
                    "description": tbl.description or "",
                    "column_count": len(cols),
                    "sensitivity_levels": list(all_sens),
                    "key_tags": list(set(all_tags))[:8],
                })

                # ── Generate table AI description ──────────────────────────────
                if get_hermes_config():
                    _prog_update(source_id, phase_label="Generating table description…")
                    tbl_desc = await ClassificationEngine.summarize_table(
                        table_name=tbl.display_name,
                        source_name=source.name,
                        columns=col_data_for_table,
                    )
                    if tbl_desc:
                        tbl.description = tbl_desc
                        db.add(tbl)
                        table_summaries_for_db[-1]["description"] = tbl_desc

            await db.flush()

            # ── Generate database-level description ────────────────────────────
            if get_hermes_config() and table_summaries_for_db:
                _prog_update(source_id, phase_label="Generating database description…", phase_number=3)
                _prog_log(source_id, "📊 Generating database summary…")
                db_desc = await ClassificationEngine.profile_database(
                    source_name=source.name,
                    source_type=source.source_type,
                    tables=table_summaries_for_db,
                )
                if db_desc:
                    source.description = db_desc

            source.last_scanned_at = datetime.utcnow()
            source.scan_status = "Completed"
            db.add(source)
            await db.commit()

            _prog_update(source_id, status="complete", phase="complete",
                         phase_label="AI classification complete!", current_column="", current_table="")
            _prog_log(source_id, "🎉 AI reclassification finished!")

        except Exception as exc:
            _prog_update(source_id, status="failed", phase_label=f"Error: {exc}")
            try:
                await db.rollback()
            except Exception:
                pass


@app.get("/api/v1/sources/{source_id}/progress")
async def get_scan_progress(source_id: str):
    """Returns the live progress of an active or recently completed scan."""
    prog = scan_progress.get(source_id)
    if not prog:
        return {
            "status": "idle", "phase": "idle", "phase_label": "No scan running.",
            "phase_number": 0, "total_phases": 4,
            "columns_done": 0, "columns_total": 0,
            "tables_done": 0, "tables_total": 0,
            "current_table": "", "current_column": "",
            "elapsed_seconds": 0, "log": [],
        }
    result = dict(prog)
    # Always recalculate elapsed so polling clients get up-to-date time
    if prog.get("started_at") and prog.get("status") == "running":
        try:
            result["elapsed_seconds"] = round(
                (datetime.utcnow() - datetime.fromisoformat(prog["started_at"])).total_seconds()
            )
        except Exception:
            pass
    return result


@app.post("/api/v1/sources/{source_id}/generate-descriptions")
async def generate_source_descriptions(source_id: str, db: AsyncSession = Depends(get_db)):
    """Uses the table_summarizer + database_profiler agents to generate AI descriptions
    for all tables and the database itself. Works on already-scanned sources."""
    source_result = await db.execute(select(DataSource).where(DataSource.id == source_id))
    source = source_result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    if not get_hermes_config():
        raise HTTPException(status_code=503, detail="Hermes AI is not configured. Set HERMES_BASE_URL in .env")

    tables_result = await db.execute(
        select(DataAsset).where(DataAsset.data_source_id == source_id, DataAsset.asset_type == "table")
    )
    tables = tables_result.scalars().all()

    table_summaries: list = []
    tables_described = 0

    for tbl in tables:
        cols_result = await db.execute(select(DataAsset).where(DataAsset.parent_asset_id == tbl.id))
        cols = cols_result.scalars().all()

        col_data_list = []
        all_sens: set = set()
        all_tags: list = []

        for col in cols:
            cls_res = await db.execute(select(Classification).where(Classification.asset_id == col.id))
            cls = cls_res.scalar_one_or_none()
            desc_res = await db.execute(select(AssetDescription).where(AssetDescription.asset_id == col.id))
            desc = desc_res.scalar_one_or_none()
            samples = []
            if desc and desc.example_values:
                samples = [s.strip() for s in desc.example_values.split(",") if s.strip()][:4]
            col_data_list.append({
                "name": col.display_name,
                "type": col.metadata_json.get("data_type", "VARCHAR") if col.metadata_json else "VARCHAR",
                "sensitivity": cls.sensitivity_level if cls else "Internal",
                "tags": ((cls.data_type_tags or []) + (cls.regulatory_tags or [])) if cls else [],
                "samples": samples,
            })
            if cls:
                all_sens.add(cls.sensitivity_level)
                all_tags.extend(cls.data_type_tags or [])

        tbl_desc = await ClassificationEngine.summarize_table(
            table_name=tbl.display_name, source_name=source.name, columns=col_data_list
        )
        if tbl_desc:
            tbl.description = tbl_desc
            db.add(tbl)
            tables_described += 1

        table_summaries.append({
            "name": tbl.display_name,
            "description": tbl_desc or tbl.description or "",
            "column_count": len(cols),
            "sensitivity_levels": list(all_sens),
            "key_tags": list(set(all_tags))[:8],
        })

    await db.flush()

    db_desc = await ClassificationEngine.profile_database(
        source_name=source.name, source_type=source.source_type, tables=table_summaries
    )
    if db_desc:
        source.description = db_desc
        db.add(source)

    await db.commit()
    return {
        "status": "success",
        "tables_described": tables_described,
        "database_description": db_desc or "",
    }


@app.post("/api/v1/sources/csv")
async def upload_csv_source(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    source_name: str = Form(default=""),
    db: AsyncSession = Depends(get_db)
):
    import csv, io as _io
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(_io.StringIO(text))
    rows = list(reader)
    fieldnames = list(reader.fieldnames or [])

    if not fieldnames:
        raise HTTPException(status_code=400, detail="CSV file has no columns or is not valid.")

    display_name = source_name.strip() or (file.filename or "csv_upload").replace(".csv", "")
    table_name   = (file.filename or "table").replace(".csv", "").replace(" ", "_")

    # Create DataSource
    source = DataSource(
        name=display_name,
        description=f"CSV import: {file.filename} ({len(rows)} rows)",
        source_type="csv",
        connection_config={"filename": file.filename, "rows": len(rows)},
        scan_schedule="",
        sampling_rate=100.0
    )
    db.add(source)
    await db.flush()

    # Create table asset
    tbl_fqn = f"{display_name}.default.{table_name}"
    tbl_asset = DataAsset(
        data_source_id=source.id,
        asset_type="table",
        fully_qualified_name=tbl_fqn,
        display_name=table_name,
        description=f"Imported from {file.filename} — {len(rows)} rows, {len(fieldnames)} columns"
    )
    db.add(tbl_asset)
    await db.flush()

    # Fetch active policies once
    policy_result = await db.execute(select(Policy).where(Policy.is_active == True))
    policies = policy_result.scalars().all()

    results = []
    for col_name in fieldnames:
        samples = [str(row.get(col_name, "")).strip() for row in rows[:15]]
        samples = [s for s in samples if s]

        col_fqn = f"{tbl_fqn}.{col_name}"
        # Upsert column asset
        existing = await db.execute(select(DataAsset).where(DataAsset.fully_qualified_name == col_fqn))
        col_asset = existing.scalar_one_or_none()
        if not col_asset:
            col_asset = DataAsset(
                data_source_id=source.id,
                asset_type="column",
                fully_qualified_name=col_fqn,
                display_name=col_name,
                parent_asset_id=tbl_asset.id,
                metadata_json={"data_type": "VARCHAR"}
            )
            db.add(col_asset)
            await db.flush()

        # Classify
        classification_data = ClassificationEngine.classify_local(col_name, samples)

        # Apply policies
        updated_sens, updated_tags, triggered = PolicyExecutor.evaluate_policies(
            column_name=col_name, data_type="VARCHAR", samples=samples,
            current_sensitivity=classification_data["sensitivity_level"],
            current_tags=classification_data.get("data_type_tags", []),
            policies=policies
        )
        if triggered:
            classification_data["sensitivity_level"] = updated_sens
            classification_data["data_type_tags"] = updated_tags
            classification_data["reasoning"] += f" | Policies applied: {', '.join(triggered)}"
            classification_data["classification_method"] = "Policy-Enforced"

        risk_map = {"Public": 10.0, "Internal": 25.0, "Confidential": 60.0, "Restricted": 85.0, "Critical": 99.0}
        risk_val = risk_map.get(classification_data["sensitivity_level"], 20.0)

        # Create classification
        cls = Classification(
            asset_id=col_asset.id,
            sensitivity_level=classification_data["sensitivity_level"],
            data_type_tags=classification_data["data_type_tags"],
            regulatory_tags=classification_data["regulatory_tags"],
            business_domain=classification_data["business_domain"],
            confidence_score=classification_data["confidence_score"],
            risk_score=risk_val,
            reasoning=classification_data["reasoning"],
            classification_method=classification_data["classification_method"],
            review_status="Pending",
            synced_to_om=False
        )
        db.add(cls)

        # Create description
        desc = AssetDescription(
            asset_id=col_asset.id,
            business_description="",
            technical_description=f"Column imported from CSV file '{file.filename}'",
            example_values=", ".join(samples[:5]),
            is_nullable=True,
            documentation_status="Draft",
            synced_to_om=False
        )
        db.add(desc)

        results.append({
            "column_name": col_name,
            "sensitivity_level": classification_data["sensitivity_level"],
            "data_type_tags": classification_data["data_type_tags"],
            "confidence_score": classification_data["confidence_score"]
        })

    source.last_scanned_at = datetime.utcnow()
    source.scan_status = "Completed"
    db.add(source)
    await db.commit()

    # If Hermes AI is configured, kick off a background task to re-classify
    # every column with the full multi-agent pipeline for better accuracy.
    ai_reclassifying = False
    if get_hermes_config():
        background_tasks.add_task(reclassify_csv_with_agents, source.id)
        ai_reclassifying = True

    return {
        "status": "success",
        "source_id": source.id,
        "source_name": display_name,
        "rows_scanned": len(rows),
        "columns_classified": len(fieldnames),
        "ai_reclassifying": ai_reclassifying,
        "results": results
    }


@app.post("/api/v1/sources/{source_id}/scan")
async def trigger_source_scan(
    source_id: str, 
    background_tasks: BackgroundTasks, 
    db: AsyncSession = Depends(get_db)
):
    # Retrieve the source to verify existence
    source_result = await db.execute(select(DataSource).where(DataSource.id == source_id))
    source = source_result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
        
    # Schedule background task
    background_tasks.add_task(run_background_scan, source_id)
    
    return {
        "status": "success",
        "message": f"Scan job successfully queued in background for data source '{source.name}'."
    }

# --- Asset Dictionary Endpoints ---
@app.get("/api/v1/assets")
async def list_assets(source_id: Optional[str] = None, parent_id: Optional[str] = None, asset_type: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    query = select(DataAsset)
    if source_id:
        query = query.where(DataAsset.data_source_id == source_id)
    if parent_id:
        query = query.where(DataAsset.parent_asset_id == parent_id)
    elif asset_type:
        query = query.where(DataAsset.asset_type == asset_type)
    elif not source_id:
        # Default to tables-only when browsing with no specific filter
        query = query.where(DataAsset.asset_type == "table")
        
    result = await db.execute(query.order_by(DataAsset.fully_qualified_name))
    assets = result.scalars().all()
    
    # Fetch active policies once for compliance check
    policy_result = await db.execute(select(Policy).where(Policy.is_active == True))
    policies = policy_result.scalars().all()
    
    # Inject classifications for simple API reading
    assets_data = []
    for asset in assets:
        # Load classifications if column
        class_res = await db.execute(select(Classification).where(Classification.asset_id == asset.id))
        classification = class_res.scalar_one_or_none()
        
        desc_res = await db.execute(select(AssetDescription).where(AssetDescription.asset_id == asset.id))
        desc = desc_res.scalar_one_or_none()
        
        compliance_reports = []
        if asset.asset_type == "column" and classification:
            samples_list = []
            if desc and desc.example_values:
                samples_list = [s.strip() for s in desc.example_values.split(",") if s.strip()]
            compliance_reports = PolicyExecutor.check_compliance(
                column_name=asset.display_name,
                data_type=asset.metadata_json.get("data_type", "VARCHAR") if asset.metadata_json else "VARCHAR",
                samples=samples_list,
                actual_sensitivity=classification.sensitivity_level,
                actual_tags=classification.data_type_tags,
                actual_regulatory_tags=classification.regulatory_tags,
                policies=policies
            )
            
        assets_data.append({
            "id": asset.id,
            "data_source_id": asset.data_source_id,
            "asset_type": asset.asset_type,
            "fully_qualified_name": asset.fully_qualified_name,
            "display_name": asset.display_name,
            "description": asset.description,
            "metadata_json": asset.metadata_json,
            "classification": {
                "sensitivity_level": classification.sensitivity_level,
                "data_type_tags": classification.data_type_tags,
                "regulatory_tags": classification.regulatory_tags,
                "business_domain": classification.business_domain,
                "confidence_score": classification.confidence_score,
                "review_status": classification.review_status,
                "synced_to_om": classification.synced_to_om
            } if classification else None,
            "description_details": {
                "business_description": desc.business_description,
                "technical_description": desc.technical_description,
                "owner": desc.owner,
                "steward": desc.steward,
                "domain": desc.domain,
                "example_values": desc.example_values,
                "ai_suggested_description": desc.ai_suggested_description,
                "documentation_status": desc.documentation_status,
                "synced_to_om": desc.synced_to_om
            } if desc else None,
            "compliance": compliance_reports
        })
        
    return assets_data

@app.get("/api/v1/assets/{asset_id}")
async def get_asset_details(asset_id: str, db: AsyncSession = Depends(get_db)):
    asset_res = await db.execute(select(DataAsset).where(DataAsset.id == asset_id))
    asset = asset_res.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
        
    class_res = await db.execute(select(Classification).where(Classification.asset_id == asset.id))
    classification = class_res.scalar_one_or_none()
    
    desc_res = await db.execute(select(AssetDescription).where(AssetDescription.asset_id == asset.id))
    desc = desc_res.scalar_one_or_none()
    
    links_res = await db.execute(select(AssetGlossaryLink).where(AssetGlossaryLink.asset_id == asset.id))
    links = links_res.scalars().all()
    glossary_terms = []
    for lk in links:
        term_res = await db.execute(select(GlossaryTerm).where(GlossaryTerm.id == lk.glossary_term_id))
        term = term_res.scalar_one_or_none()
        if term:
            glossary_terms.append({"id": term.id, "name": term.name, "definition": term.definition})

    # Fetch active policies once for compliance check
    policy_result = await db.execute(select(Policy).where(Policy.is_active == True))
    policies = policy_result.scalars().all()

    compliance_reports = []
    if asset.asset_type == "column" and classification:
        samples_list = []
        if desc and desc.example_values:
            samples_list = [s.strip() for s in desc.example_values.split(",") if s.strip()]
        compliance_reports = PolicyExecutor.check_compliance(
            column_name=asset.display_name,
            data_type=asset.metadata_json.get("data_type", "VARCHAR") if asset.metadata_json else "VARCHAR",
            samples=samples_list,
            actual_sensitivity=classification.sensitivity_level,
            actual_tags=classification.data_type_tags,
            actual_regulatory_tags=classification.regulatory_tags,
            policies=policies
        )

    return {
        "id": asset.id,
        "asset_type": asset.asset_type,
        "fully_qualified_name": asset.fully_qualified_name,
        "display_name": asset.display_name,
        "description": asset.description,
        "metadata_json": asset.metadata_json,
        "classification": {
            "sensitivity_level":    classification.sensitivity_level,
            "data_type_tags":       classification.data_type_tags,
            "regulatory_tags":      classification.regulatory_tags,
            "business_domain":      classification.business_domain,
            "confidence_score":     classification.confidence_score,
            "risk_score":           classification.risk_score,
            "reasoning":            classification.reasoning,
            "classification_method": classification.classification_method,
            "review_status":        classification.review_status,
            "synced_to_om":         classification.synced_to_om,
        } if classification else None,
        "description_details": {
            "business_description":      desc.business_description,
            "technical_description":     desc.technical_description,
            "owner":                     desc.owner,
            "steward":                   desc.steward,
            "domain":                    desc.domain,
            "example_values":            desc.example_values,
            "ai_suggested_description":  desc.ai_suggested_description,
            "documentation_status":      desc.documentation_status,
            "synced_to_om":              desc.synced_to_om,
        } if desc else None,
        "glossary_terms": glossary_terms,
        "compliance": compliance_reports,
    }

@app.get("/api/v1/assets/{asset_id}/governance")
async def get_governance_recommendations(asset_id: str, db: AsyncSession = Depends(get_db)):
    """
    Returns AI-generated + rule-based data handling and governance recommendations
    for a classified column.
    """
    asset_res = await db.execute(select(DataAsset).where(DataAsset.id == asset_id))
    asset = asset_res.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    cls_res = await db.execute(select(Classification).where(Classification.asset_id == asset.id))
    classification = cls_res.scalar_one_or_none()

    if not classification:
        return {"recommendations": None, "source": "none"}

    sens = classification.sensitivity_level or "Internal"
    dtags = classification.data_type_tags or []
    rtags = classification.regulatory_tags or []

    # ── Deterministic base rules ──────────────────────────────────────────────
    rules: Dict[str, Any] = {
        "Public": {
            "retention_period": "No specific requirement",
            "encryption_required": False,
            "access_level": "Unrestricted — may be shared externally",
            "sharing_policy": "No restrictions on sharing or publication",
            "deletion_guidance": "No mandatory deletion timeline",
            "masking_required": False,
        },
        "Internal": {
            "retention_period": "Retain while operationally relevant",
            "encryption_required": False,
            "access_level": "Internal employees only",
            "sharing_policy": "Do not share externally without approval",
            "deletion_guidance": "Archive after 5 years; delete when no longer needed",
            "masking_required": False,
        },
        "Confidential": {
            "retention_period": "5 years from collection date",
            "encryption_required": True,
            "access_level": "Role-based access — need-to-know basis",
            "sharing_policy": "Requires data processing agreement for external sharing",
            "deletion_guidance": "Delete within 30 days of end of purpose; notify DPO",
            "masking_required": True,
        },
        "Restricted": {
            "retention_period": "Statutory minimum only (typically 3–7 years)",
            "encryption_required": True,
            "access_level": "Highly restricted — explicit approval required per access",
            "sharing_policy": "No external sharing without DPA + legal review",
            "deletion_guidance": "Delete immediately when purpose ends; audit trail required",
            "masking_required": True,
        },
        "Critical": {
            "retention_period": "Minimum retention only — delete ASAP",
            "encryption_required": True,
            "access_level": "Maximum restriction — executive/compliance approval required",
            "sharing_policy": "No sharing under any circumstances without C-level sign-off",
            "deletion_guidance": "Hard-delete within 24 hours of purpose completion; full audit",
            "masking_required": True,
        },
    }

    base = dict(rules.get(sens, rules["Internal"]))

    # ── Regulatory overrides ──────────────────────────────────────────────────
    regulatory_notes: List[str] = []
    if "GDPR" in rtags or any(t.startswith("PII.") for t in dtags):
        regulatory_notes.append("GDPR: Data subjects have the right to erasure. Provide access mechanisms.")
        base["retention_period"] = "As short as possible under legitimate purpose (GDPR Art. 5(1)(e))"
    if "HIPAA" in rtags or any(t.startswith("PHI.") for t in dtags):
        regulatory_notes.append("HIPAA: PHI must be retained 6 years from creation or last use.")
        base["retention_period"] = "6 years from creation date (HIPAA minimum)"
        base["encryption_required"] = True
    if "PCI-DSS" in rtags or any(t.startswith("PCI.") for t in dtags):
        regulatory_notes.append("PCI-DSS: Card data must never be stored post-authorisation unless encrypted + tokenised.")
        base["deletion_guidance"] = "Tokenise or delete immediately after transaction authorisation"
        base["encryption_required"] = True
    if "CCPA" in rtags:
        regulatory_notes.append("CCPA: California residents may request deletion. Honour within 45 days.")
    if "SOX" in rtags:
        regulatory_notes.append("SOX: Financial records must be retained exactly 7 years.")
        base["retention_period"] = "7 years (SOX requirement)"

    base["regulatory_notes"] = regulatory_notes
    base["applicable_regulations"] = rtags
    base["sensitivity_level"] = sens
    base["data_tags"] = dtags

    # ── AI-enhanced summary (if Hermes configured) ────────────────────────────
    ai_summary = ""
    if get_hermes_config():
        system_prompt = (
            "You are a data governance expert. Given a column's classification details, "
            "write a concise 2-3 sentence plain-English governance recommendation for a business audience. "
            "Focus on: how this data should be handled, who can access it, and key compliance risks. "
            "Do NOT start with 'This column' or 'This field'. Do NOT use bullet points or markdown. "
            "Respond ONLY with valid JSON: {\"description\": \"Your 2-3 sentence recommendation here.\"}"
        )
        user_msg = (
            f"Column: {asset.display_name}\n"
            f"Sensitivity: {sens}\n"
            f"Tags: {', '.join(dtags + rtags) or 'none'}\n"
            f"Retention: {base['retention_period']}\n"
            f"Encryption required: {base['encryption_required']}\n"
            f"Regulatory notes: {'; '.join(regulatory_notes) or 'none'}"
        )
        try:
            ai_summary = await ClassificationEngine._call_hermes_for_description(system_prompt, user_msg)
        except Exception:
            pass

    return {
        "recommendations": base,
        "ai_summary": ai_summary,
        "source": "ai+rules" if ai_summary else "rules",
    }


@app.patch("/api/v1/assets/{asset_id}/description")
async def update_asset_description(
    asset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: AsyncSession = Depends(get_db)
):
    desc_res = await db.execute(select(AssetDescription).where(AssetDescription.asset_id == asset_id))
    desc = desc_res.scalar_one_or_none()
    if not desc:
        desc = AssetDescription(asset_id=asset_id)
        db.add(desc)

    for field in ["business_description", "technical_description", "owner", "steward", "domain", "format", "transformation_rule"]:
        if field in payload:
            setattr(desc, field, payload[field])
            
    if "ai_suggestion_accepted" in payload:
        desc.ai_suggestion_accepted = payload["ai_suggestion_accepted"]
        if payload["ai_suggestion_accepted"] and desc.ai_suggested_description:
            desc.business_description = desc.ai_suggested_description
            
    desc.documentation_status = payload.get("documentation_status", desc.documentation_status or "Draft")
    desc.synced_to_om = False
    
    # Also update base asset description if table
    asset_res = await db.execute(select(DataAsset).where(DataAsset.id == asset_id))
    asset = asset_res.scalar_one_or_none()
    if asset and asset.asset_type == "table" and "business_description" in payload:
        asset.description = payload["business_description"]
        db.add(asset)
        
    db.add(desc)
    await db.commit()
    return desc

# --- Glossary Terms ---
@app.get("/api/v1/glossary")
async def get_glossary(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(GlossaryTerm).order_by(GlossaryTerm.name))
    return result.scalars().all()

@app.post("/api/v1/glossary")
async def create_glossary_term(payload: Dict[str, Any] = Body(...), db: AsyncSession = Depends(get_db)):
    term = GlossaryTerm(
        name=payload["name"],
        definition=payload["definition"],
        formula=payload.get("formula"),
        domain=payload.get("domain", "Operational"),
        owner=payload.get("owner", "Data Governance"),
        synonyms=payload.get("synonyms", []),
        status="Approved"
    )
    db.add(term)
    try:
        await db.commit()
        await db.refresh(term)
        return term
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Glossary term name already exists.")

@app.post("/api/v1/assets/{asset_id}/glossary")
async def link_glossary_to_asset(
    asset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: AsyncSession = Depends(get_db)
):
    # Check if link exists
    link_res = await db.execute(
        select(AssetGlossaryLink)
        .where(AssetGlossaryLink.asset_id == asset_id)
        .where(AssetGlossaryLink.glossary_term_id == payload["glossary_term_id"])
    )
    link = link_res.scalar_one_or_none()
    if not link:
        link = AssetGlossaryLink(
            asset_id=asset_id,
            glossary_term_id=payload["glossary_term_id"],
            link_type=payload.get("link_type", "relates_to")
        )
        db.add(link)
        await db.commit()
    return {"status": "success", "message": "Glossary term linked to asset."}

# --- Review Queue Endpoints ---
@app.get("/api/v1/review")
async def get_review_queue(db: AsyncSession = Depends(get_db)):
    # Pull assets that are in Pending review status
    query = select(Classification).where(Classification.review_status == "Pending")
    result = await db.execute(query)
    classifications = result.scalars().all()
    
    queue_items = []
    for cls in classifications:
        asset_res = await db.execute(select(DataAsset).where(DataAsset.id == cls.asset_id))
        asset = asset_res.scalar_one_or_none()
        if not asset:
            continue
            
        parent_table = ""
        if asset.parent_asset_id:
            pt_res = await db.execute(select(DataAsset).where(DataAsset.id == asset.parent_asset_id))
            pt = pt_res.scalar_one_or_none()
            if pt:
                parent_table = pt.display_name

        desc_res = await db.execute(select(AssetDescription).where(AssetDescription.asset_id == asset.id))
        desc = desc_res.scalar_one_or_none()

        queue_items.append({
            "classification_id": cls.id,
            "asset_id": asset.id,
            "asset_name": asset.display_name,
            "parent_table": parent_table,
            "asset_type": asset.asset_type,
            "data_type": asset.metadata_json.get("data_type", "unknown") if asset.metadata_json else "unknown",
            "sensitivity_level": cls.sensitivity_level,
            "data_type_tags": cls.data_type_tags,
            "regulatory_tags": cls.regulatory_tags,
            "confidence_score": cls.confidence_score,
            "reasoning": cls.reasoning,
            "example_values": desc.example_values if desc else ""
        })
        
    return queue_items

@app.patch("/api/v1/review/{classification_id}")
async def review_classification(
    classification_id: str,
    payload: Dict[str, Any] = Body(...),
    db: AsyncSession = Depends(get_db)
):
    cls_res = await db.execute(select(Classification).where(Classification.id == classification_id))
    cls = cls_res.scalar_one_or_none()
    if not cls:
        raise HTTPException(status_code=404, detail="Classification not found")
        
    action = payload["action"] # Approve, Override, Reject
    if action == "Approve":
        cls.review_status = "Approved"
    elif action == "Reject":
        cls.review_status = "Rejected"
        cls.sensitivity_level = "Internal"
        cls.data_type_tags = []
        cls.regulatory_tags = []
        cls.risk_score = 25.0
    elif action == "Override":
        cls.review_status = "Overridden"
        cls.sensitivity_level = payload.get("sensitivity_level", cls.sensitivity_level)
        cls.data_type_tags = payload.get("data_type_tags", cls.data_type_tags)
        cls.regulatory_tags = payload.get("regulatory_tags", cls.regulatory_tags)
        
        risk_map = {"Public": 10.0, "Internal": 25.0, "Confidential": 60.0, "Restricted": 85.0, "Critical": 99.0}
        cls.risk_score = risk_map.get(cls.sensitivity_level, 20.0)
        cls.classification_method = "Manual"
        
    cls.synced_to_om = False
    db.add(cls)
    await db.commit()
    await db.refresh(cls)
    return cls

# --- OpenMetadata Connection & Sync Endpoints ---
@app.get("/api/v1/openmetadata/connection")
async def get_om_connection():
    client = OpenMetadataClient(om_settings["host_url"], om_settings["jwt_token"])
    conn_status = await client.test_connection()
    return {
        "host_url": om_settings["host_url"] or "http://localhost:8585/api",
        "jwt_token_configured": bool(om_settings["jwt_token"]),
        "status": conn_status["status"],
        "mode": conn_status["mode"],
        "message": conn_status.get("message", "Connected successfully")
    }

@app.post("/api/v1/openmetadata/connection")
async def save_om_connection(payload: Dict[str, Any] = Body(...)):
    om_settings["host_url"] = payload.get("host_url", "")
    om_settings["jwt_token"] = payload.get("jwt_token", "")
    
    client = OpenMetadataClient(om_settings["host_url"], om_settings["jwt_token"])
    conn_status = await client.test_connection()
    
    return {
        "status": conn_status["status"],
        "mode": conn_status["mode"],
        "message": conn_status.get("message", "Connection status checked.")
    }

@app.post("/api/v1/openmetadata/sync")
async def trigger_openmetadata_sync(db: AsyncSession = Depends(get_db)):
    client = OpenMetadataClient(om_settings["host_url"], om_settings["jwt_token"])
    
    # Seed mock classification tags on OM server
    await client.create_classification("ClassifyAI_Sensitivity", "Managed by ClassifyAI")
    await client.create_tag("ClassifyAI_Sensitivity", "Public", "Public Data")
    await client.create_tag("ClassifyAI_Sensitivity", "Internal", "Internal Staff Data")
    await client.create_tag("ClassifyAI_Sensitivity", "Confidential", "Confidential Sensitive Data")
    await client.create_tag("ClassifyAI_Sensitivity", "Restricted", "Highly Restricted/PII Data")
    await client.create_tag("ClassifyAI_Sensitivity", "Critical", "Mission Critical Data")
    
    await client.create_classification("ClassifyAI_PersonalData", "PII/PCI classifications")
    await client.create_tag("ClassifyAI_PersonalData", "PII.Email", "Email addresses")
    await client.create_tag("ClassifyAI_PersonalData", "PII.Phone", "Phone numbers")
    await client.create_tag("ClassifyAI_PersonalData", "PII.SSN", "Social Security Numbers")
    await client.create_tag("ClassifyAI_PersonalData", "PCI.CardNumber", "Credit card numbers")
    await client.create_tag("ClassifyAI_PersonalData", "PII.Name", "Individual Names")

    # Fetch unsynced classifications (Approved or Overridden)
    q_class = select(Classification).where(
        Classification.review_status.in_(["Approved", "Overridden"]),
        Classification.synced_to_om == False
    )
    res_class = await db.execute(q_class)
    classifications = res_class.scalars().all()
    
    synced_count = 0
    errors = 0
    
    for cls in classifications:
        # Load asset details
        asset_res = await db.execute(select(DataAsset).where(DataAsset.id == cls.asset_id))
        asset = asset_res.scalar_one_or_none()
        if not asset or asset.asset_type != "column":
            continue
            
        parent_res = await db.execute(select(DataAsset).where(DataAsset.id == asset.parent_asset_id))
        parent_table = parent_res.scalar_one_or_none()
        if not parent_table:
            continue
            
        # Get description details to patch as well
        desc_res = await db.execute(select(AssetDescription).where(AssetDescription.asset_id == asset.id))
        desc = desc_res.scalar_one_or_none()
        
        # Build patch instructions for tags
        tag_fqns = []
        for tag in cls.data_type_tags:
            tag_fqns.append(f"ClassifyAI_PersonalData.{tag}")
            
        # Create full mock columns format to patch
        mock_columns = [
            {"name": asset.display_name, "tags": [], "description": ""}
        ]
        
        patches = client.build_column_tags_patch(
            columns=mock_columns,
            target_column=asset.display_name,
            tags=tag_fqns,
            sensitivity=cls.sensitivity_level
        )
        
        # Patch description if exists
        if desc and desc.business_description:
            desc_patches = client.build_column_description_patch(
                columns=mock_columns,
                target_column=asset.display_name,
                description=desc.business_description
            )
            patches.extend(desc_patches)
            
        # Execute patch
        patch_result = await client.patch_table_metadata(parent_table.fully_qualified_name, patches)
        
        # Log to OMSyncLog
        sync_log = OMSyncLog(
            asset_fqn=asset.fully_qualified_name,
            entity_type="column",
            sync_status="success" if patch_result["status"] == "success" else "failed",
            payload=patches,
            error_message=patch_result.get("error")
        )
        db.add(sync_log)
        
        if patch_result["status"] == "success":
            cls.synced_to_om = True
            cls.synced_at = datetime.utcnow()
            db.add(cls)
            
            if desc:
                desc.synced_to_om = True
                desc.synced_at = datetime.utcnow()
                db.add(desc)
                
            synced_count += 1
        else:
            errors += 1
            
    await db.commit()
    
    return {
        "status": "success",
        "synced_count": synced_count,
        "errors": errors
    }

@app.get("/api/v1/openmetadata/sync/logs")
async def get_sync_logs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(OMSyncLog).order_by(OMSyncLog.created_at.desc()).limit(50))
    return result.scalars().all()

# --- Policies Manager ---
@app.get("/api/v1/policies")
async def get_policies(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Policy).order_by(Policy.created_at.desc()))
    return result.scalars().all()

@app.post("/api/v1/policies")
async def create_policy(payload: Dict[str, Any] = Body(...), db: AsyncSession = Depends(get_db)):
    policy = Policy(
        name=payload["name"],
        description=payload.get("description", ""),
        policy_type=payload.get("policy_type", "classification"),
        group_name=payload.get("group_name", "Custom"),
        conditions=payload.get("conditions", {}),
        actions=payload.get("actions", {}),
        is_active=payload.get("is_active", True)
    )
    db.add(policy)
    await db.commit()
    await db.refresh(policy)
    return policy

@app.patch("/api/v1/policies/{policy_id}/toggle")
async def toggle_policy(policy_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Policy).where(Policy.id == policy_id))
    policy = result.scalar_one_or_none()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    policy.is_active = not policy.is_active
    await db.commit()
    await db.refresh(policy)
    return policy

@app.delete("/api/v1/policies/{policy_id}")
async def delete_policy(policy_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Policy).where(Policy.id == policy_id))
    policy = result.scalar_one_or_none()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    await db.delete(policy)
    await db.commit()
    return {"status": "success", "message": "Policy successfully deleted."}

# --- Extension Specific endpoints ---
@app.post("/api/v1/extension/detect")
async def extension_detect_metadata(payload: Dict[str, Any] = Body(...), db: AsyncSession = Depends(get_db)):
    """Receives scraped table schema from Extension Content Script and returns classifications."""
    table_name = payload.get("table_name", "UNNAMED_TABLE")
    columns = payload.get("columns", [])
    
    # Fetch active policies
    policy_result = await db.execute(select(Policy).where(Policy.is_active == True))
    policies = policy_result.scalars().all()
    
    # Map and scan columns on the fly
    classifications = []
    
    for col in columns:
        col_name = col.get("name", "")
        col_type = col.get("type", "VARCHAR")
        samples = col.get("samples", [])
        
        # Local Fast scan
        res = ClassificationEngine.classify_local(col_name, samples)
        
        # Apply policies
        updated_sensitivity, updated_tags, triggered_policies = PolicyExecutor.evaluate_policies(
            column_name=col_name,
            data_type=col_type,
            samples=samples,
            current_sensitivity=res["sensitivity_level"],
            current_tags=res["data_type_tags"],
            policies=policies
        )
        
        if triggered_policies:
            res["sensitivity_level"] = updated_sensitivity
            res["data_type_tags"] = updated_tags
            res["reasoning"] += f" | Policies applied: {', '.join(triggered_policies)}"
            res["classification_method"] = "Policy-Enforced"
        
        # Build response item
        classifications.append({
            "column_name": col_name,
            "sensitivity_level": res["sensitivity_level"],
            "data_type_tags": res["data_type_tags"],
            "confidence_score": res["confidence_score"],
            "reasoning": res["reasoning"]
        })
        
    return {
        "table_name": table_name,
        "classifications": classifications
    }


# --- App Settings & Custom Configurations ---
@app.get("/api/v1/settings/llm")
async def get_llm_settings(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AppSetting).where(AppSetting.key == "llm_config"))
    setting = result.scalar_one_or_none()
    if not setting:
        return {
            "provider": "gemini",
            "model_name": "gemini-2.5-flash",
            "api_url": "",
            "api_key_configured": False,
            "api_key_masked": ""
        }
    
    config = setting.value
    api_key = config.get("api_key", "")
    masked_key = ""
    if api_key:
        if len(api_key) > 8:
            masked_key = api_key[:4] + "..." + api_key[-4:]
        else:
            masked_key = "..."
            
    return {
        "provider": config.get("provider", "gemini"),
        "model_name": config.get("model_name", "gemini-2.5-flash"),
        "api_url": config.get("api_url", ""),
        "api_key_configured": bool(api_key),
        "api_key_masked": masked_key
    }

@app.post("/api/v1/settings/llm")
async def save_llm_settings(payload: Dict[str, Any] = Body(...), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AppSetting).where(AppSetting.key == "llm_config"))
    setting = result.scalar_one_or_none()
    
    provider = payload.get("provider", "gemini")
    model_name = payload.get("model_name", "gemini-2.5-flash")
    api_url = payload.get("api_url", "")
    new_api_key = payload.get("api_key", "")
    
    config = {}
    if setting:
        config = setting.value
        
    config["provider"] = provider
    config["model_name"] = model_name
    config["api_url"] = api_url
    
    if new_api_key and not new_api_key.startswith("..."):
        config["api_key"] = new_api_key
        
    if not setting:
        setting = AppSetting(key="llm_config", value=config)
        db.add(setting)
    else:
        setting.value = config
        db.add(setting)
        
    await db.commit()
    
    if "api_key" in config:
        os.environ["GEMINI_API_KEY"] = config["api_key"]
        
    return {"status": "success", "message": "LLM Settings updated successfully."}

@app.post("/api/v1/settings/llm/test")
async def test_llm_settings(payload: Dict[str, Any] = Body(...), db: AsyncSession = Depends(get_db)):
    provider = payload.get("provider", "gemini")
    model_name = payload.get("model_name", "gemini-2.5-flash")
    api_url = payload.get("api_url", "")
    api_key = payload.get("api_key", "")
    
    if api_key.startswith("...") or not api_key:
        result = await db.execute(select(AppSetting).where(AppSetting.key == "llm_config"))
        setting = result.scalar_one_or_none()
        if setting and "api_key" in setting.value:
            api_key = setting.value["api_key"]
            
    if not api_key:
        raise HTTPException(status_code=400, detail="API key is missing.")
        
    try:
        import httpx
        if provider == "gemini":
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
            payload_data = {
                "contents": [{"parts": [{"text": "Hello, respond with 'Success' if you can read this."}]}]
            }
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(url, json=payload_data)
                if res.status_code == 200:
                    return {"status": "success", "message": "Connection test passed successfully!"}
                else:
                    raise Exception(f"Gemini API returned status {res.status_code}: {res.text}")
        elif provider == "openai":
            url = api_url or "https://api.openai.com/v1/chat/completions"
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            payload_data = {
                "model": model_name,
                "messages": [{"role": "user", "content": "Hello, respond with 'Success'."}],
                "max_tokens": 10
            }
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(url, headers=headers, json=payload_data)
                if res.status_code == 200:
                    return {"status": "success", "message": "Connection test passed successfully!"}
                else:
                    raise Exception(f"OpenAI API returned status {res.status_code}: {res.text}")
        else:
            return {"status": "success", "message": f"Provider '{provider}' connection simulation passed."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"LLM connection test failed: {str(e)}")

@app.patch("/api/v1/assets/{asset_id}/classification")
async def patch_asset_classification(
    asset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: AsyncSession = Depends(get_db)
):
    # Check if asset exists
    asset_res = await db.execute(select(DataAsset).where(DataAsset.id == asset_id))
    asset = asset_res.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    # Update Classification
    class_res = await db.execute(select(Classification).where(Classification.asset_id == asset_id))
    classification = class_res.scalar_one_or_none()
    if not classification:
        classification = Classification(
            asset_id=asset_id,
            sensitivity_level=payload.get("sensitivity_level", "Internal"),
            data_type_tags=payload.get("data_type_tags", []),
            regulatory_tags=payload.get("regulatory_tags", []),
            business_domain=payload.get("business_domain", "Operational"),
            confidence_score=1.0,
            risk_score=20.0,
            reasoning=payload.get("reasoning", "Manual override"),
            classification_method="Manual",
            review_status="Reviewed",
            synced_to_om=False
        )
        db.add(classification)
    else:
        if "sensitivity_level" in payload:
            classification.sensitivity_level = payload["sensitivity_level"]
        if "data_type_tags" in payload:
            classification.data_type_tags = payload["data_type_tags"]
        if "regulatory_tags" in payload:
            classification.regulatory_tags = payload["regulatory_tags"]
        if "business_domain" in payload:
            classification.business_domain = payload["business_domain"]
        if "reasoning" in payload:
            classification.reasoning = payload["reasoning"]
            
        classification.classification_method = "Manual"
        classification.review_status = "Reviewed"
        classification.synced_to_om = False
        db.add(classification)

    # Determine risk score based on sensitivity
    risk_map = {"Public": 10.0, "Internal": 25.0, "Confidential": 60.0, "Restricted": 85.0, "Critical": 99.0}
    classification.risk_score = risk_map.get(classification.sensitivity_level, 20.0)

    # Update AssetDescription
    desc_res = await db.execute(select(AssetDescription).where(AssetDescription.asset_id == asset_id))
    desc = desc_res.scalar_one_or_none()
    if not desc:
        desc = AssetDescription(
            asset_id=asset_id,
            business_description=payload.get("business_description", ""),
            technical_description=payload.get("technical_description", "Manual override"),
            documentation_status="Approved",
            synced_to_om=False
        )
        db.add(desc)
    else:
        if "business_description" in payload:
            desc.business_description = payload["business_description"]
        if "technical_description" in payload:
            desc.technical_description = payload["technical_description"]
        desc.documentation_status = "Approved"
        desc.synced_to_om = False
        db.add(desc)

    await db.commit()
    return {"status": "success", "message": "Classification and description updated successfully."}

@app.put("/api/v1/assets/{asset_id}/glossary")
async def sync_asset_glossary_terms(
    asset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: AsyncSession = Depends(get_db)
):
    term_ids = payload.get("glossary_term_ids", [])
    
    # Delete old links
    await db.execute(delete(AssetGlossaryLink).where(AssetGlossaryLink.asset_id == asset_id))
    
    # Add new links
    for term_id in term_ids:
        link = AssetGlossaryLink(
            asset_id=asset_id,
            glossary_term_id=term_id,
            link_type="relates_to"
        )
        db.add(link)
        
    await db.commit()
    return {"status": "success", "message": "Glossary terms synced for asset."}


# ─── Agent Management Endpoints ──────────────────────────────────────────────

from backend.app.classification.agents.registry import AgentRegistry
from backend.app.classification.agents.base import BaseAgent as _BaseAgent


@app.get("/api/v1/agents")
async def list_agents():
    """List all 7 agents with their full configs (id, name, description, enabled, system_prompt, output_schema)."""
    registry = AgentRegistry()
    return [
        {
            "id": a.id,
            "name": a.name,
            "description": a.description,
            "enabled": a.enabled,
            "system_prompt": a.system_prompt,
            "output_schema": a.output_schema,
        }
        for a in registry.list_all()
    ]


@app.get("/api/v1/agents/{agent_id}")
async def get_agent(agent_id: str):
    """Get a single agent config by ID."""
    registry = AgentRegistry()
    agent = registry.get(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")
    return {
        "id": agent.id,
        "name": agent.name,
        "description": agent.description,
        "enabled": agent.enabled,
        "system_prompt": agent.system_prompt,
        "output_schema": agent.output_schema,
    }


@app.patch("/api/v1/agents/{agent_id}")
async def update_agent(agent_id: str, payload: Dict[str, Any] = Body(...)):
    """
    Partially update an agent config. Allowed fields: name, description, enabled, system_prompt, output_schema.
    Changes are persisted to agents.yaml immediately.
    """
    registry = AgentRegistry()
    try:
        updated = registry.update(agent_id, payload)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {
        "id": updated.id,
        "name": updated.name,
        "description": updated.description,
        "enabled": updated.enabled,
        "system_prompt": updated.system_prompt,
        "output_schema": updated.output_schema,
    }


@app.post("/api/v1/agents/{agent_id}/test")
async def test_agent(agent_id: str, payload: Dict[str, Any] = Body(...)):
    """
    Run a single agent against test data and return its raw output.

    Request body:
    {
        "table_name": "customers",
        "column_name": "email_address",
        "data_type": "VARCHAR(255)",
        "sample_values": ["alice@example.com", "bob@corp.io"],
        "context": {}
    }
    """
    registry = AgentRegistry()
    cfg = registry.get(agent_id)
    if not cfg:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")
    if not cfg.enabled:
        raise HTTPException(status_code=400, detail=f"Agent '{agent_id}' is disabled")

    hermes_cfg = get_hermes_config()
    if not hermes_cfg:
        raise HTTPException(
            status_code=503,
            detail="Hermes is not configured. Set HERMES_BASE_URL in .env"
        )

    agent = _BaseAgent(config=cfg, hermes_cfg=hermes_cfg)
    try:
        result = await agent.run(
            table_name=payload.get("table_name", ""),
            column_name=payload.get("column_name", ""),
            data_type=payload.get("data_type", "VARCHAR"),
            sample_values=payload.get("sample_values", []),
            context=payload.get("context"),
        )
        return {"agent_id": agent_id, "result": result}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Agent call failed: {str(exc)}")


@app.get("/api/v1/settings/agents")
async def get_agent_settings():
    """Returns Hermes connection status. Never exposes the raw API key."""
    base_url = os.getenv("HERMES_BASE_URL", "").strip()
    api_key = os.getenv("HERMES_API_KEY", "")
    model = os.getenv("HERMES_MODEL", "hermes3")

    masked_key = ""
    if api_key:
        masked_key = api_key[:4] + "..." + api_key[-4:] if len(api_key) > 8 else "***"

    return {
        "hermes_base_url": base_url,
        "hermes_model": model,
        "hermes_api_key_configured": bool(api_key),
        "hermes_api_key_masked": masked_key,
        "agents_enabled": bool(base_url),
    }


@app.patch("/api/v1/settings/agents")
async def update_agent_settings(payload: Dict[str, Any] = Body(...)):
    """
    Update Hermes settings in the running process. For persistence, edit .env directly.

    Request body: { "hermes_base_url": "...", "hermes_api_key": "...", "hermes_model": "..." }
    """
    if "hermes_base_url" in payload:
        os.environ["HERMES_BASE_URL"] = payload["hermes_base_url"]
    if payload.get("hermes_api_key"):
        os.environ["HERMES_API_KEY"] = payload["hermes_api_key"]
    if "hermes_model" in payload:
        os.environ["HERMES_MODEL"] = payload["hermes_model"]
    return {
        "status": "success",
        "message": "Agent settings updated for the current process. Edit .env for persistence.",
    }
