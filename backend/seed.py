import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from backend.app.core.database import AsyncSessionLocal, engine, Base
from backend.app.models import DataSource, GlossaryTerm, Policy

async def seed_data():
    # Ensure tables are created
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    async with AsyncSessionLocal() as db:
        # Check if sources exist
        source_check = await db.execute(select(DataSource))
        if not source_check.scalars().first():
            # Add sources
            sources = [
                DataSource(
                    name="Production Customer Database",
                    description="Primary transactional store containing sensitive customer account profiles",
                    source_type="postgres",
                    connection_config={"host": "prod-db.internal", "port": 5432, "database": "customers"},
                    scan_schedule="0 0 * * *",
                    sampling_rate=10.0
                ),
                DataSource(
                    name="HR Snowflake DW",
                    description="Warehouse storage containing employee payroll data and contracts",
                    source_type="snowflake",
                    connection_config={"account": "xy12345", "warehouse": "COMPUTE_WH"},
                    scan_schedule="0 12 * * *",
                    sampling_rate=100.0
                ),
                DataSource(
                    name="Clinical Records Bucket",
                    description="AWS S3 bucket storing patient diagnostic summaries and insurance invoices",
                    source_type="s3",
                    connection_config={"bucket": "clinical-data-prod", "region": "us-east-1"},
                    scan_schedule="0 6 * * *",
                    sampling_rate=5.0
                )
            ]
            db.add_all(sources)
            print("Seeded data sources!")

        # Check if glossary terms exist
        glossary_check = await db.execute(select(GlossaryTerm))
        if not glossary_check.scalars().first():
            # Add terms
            terms = [
                GlossaryTerm(
                    name="Customer Lifetime Value",
                    definition="The total predicted revenue a business can expect from a customer over the entire relationship.",
                    formula="SUM(sales.amount) * margin - acquisition_cost",
                    domain="Customer",
                    owner="Marketing Analytics",
                    synonyms=["CLV", "LTV"],
                    status="Approved"
                ),
                GlossaryTerm(
                    name="Protected Health Information",
                    definition="Any information about health status, provision of health care, or payment for health care that can be linked to a specific individual.",
                    domain="Legal & Compliance",
                    owner="Compliance Officer",
                    synonyms=["PHI", "Patient Data"],
                    status="Approved"
                ),
                GlossaryTerm(
                    name="Annual Recurring Revenue",
                    definition="A metric of predictable and recurring revenue components of a subscription business, normalized to a one-year period.",
                    formula="Monthly Recurring Revenue (MRR) * 12",
                    domain="Financial",
                    owner="Finance Operations",
                    synonyms=["ARR", "Yearly Revenue"],
                    status="Approved"
                )
            ]
            db.add_all(terms)
            print("Seeded business glossary!")

        # Check if policies exist (or clear and re-seed to update groups)
        from sqlalchemy import delete
        await db.execute(delete(Policy))
        
        # Add standard regulatory policies grouped by standards
        policies = [
            Policy(
                name="GDPR Email Protection Policy",
                description="Flags email columns, enforces Confidential sensitivity level and applies the PII.Email tag for GDPR compliance.",
                policy_type="regulatory",
                group_name="GDPR",
                conditions={"column_name_like": "email"},
                actions={"apply_tag": "PII.Email", "set_sensitivity": "Confidential", "apply_tags": ["GDPR"]},
                is_active=True
            ),
            Policy(
                name="GDPR Customer Contact Info Policy",
                description="Flags phone number and street address fields, enforcing Confidential sensitivity level.",
                policy_type="regulatory",
                group_name="GDPR",
                conditions={"column_name_like": "phone"},
                actions={"apply_tag": "PII.Phone", "set_sensitivity": "Confidential", "apply_tags": ["GDPR"]},
                is_active=True
            ),
            Policy(
                name="HIPAA Medical Record Policy",
                description="Scans for patient health records, diagnostic details, and clinical data, applying PHI.MedicalRecord and Restricted status.",
                policy_type="regulatory",
                group_name="HIPAA",
                conditions={"column_name_like": "diagnosis"},
                actions={"apply_tag": "PHI.MedicalRecord", "set_sensitivity": "Restricted", "apply_tags": ["HIPAA"]},
                is_active=True
            ),
            Policy(
                name="PCI Cardholder Data Policy",
                description="Detects credit card numbers, card verification values, and billing information, enforcing Critical sensitivity level.",
                policy_type="regulatory",
                group_name="PCI",
                conditions={"column_name_like": "card"},
                actions={"apply_tag": "PCI.CardNumber", "set_sensitivity": "Critical", "apply_tags": ["PCI-DSS"]},
                is_active=True
            ),
            Policy(
                name="Custom API Key Leak Prevention",
                description="Secures secret API tokens, access credentials, and security codes under Critical sensitivity level.",
                policy_type="classification",
                group_name="Custom",
                conditions={"column_name_like": "key"},
                actions={"apply_tag": "AIReadiness.TrainingRestricted", "set_sensitivity": "Critical"},
                is_active=True
            )
        ]
        db.add_all(policies)
        print("Seeded grouped policy engine rules!")

        await db.commit()

if __name__ == "__main__":
    asyncio.run(seed_data())
