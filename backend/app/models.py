from datetime import datetime
import uuid
from sqlalchemy import Column, String, Float, Boolean, DateTime, ForeignKey, Integer, JSON
from sqlalchemy.orm import relationship
from backend.app.core.database import Base

def generate_uuid():
    return str(uuid.uuid4())

class DataSource(Base):
    __tablename__ = "data_sources"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)
    description = Column(String(500))
    source_type = Column(String(50), nullable=False) # e.g. postgres, mysql, snowflake, s3
    connection_config = Column(JSON) # Stored config
    openmetadata_service_id = Column(String(100))
    scan_schedule = Column(String(100)) # cron
    sampling_rate = Column(Float, default=100.0) # percentage of rows to scan
    last_scanned_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    assets = relationship("DataAsset", back_populates="source", cascade="all, delete-orphan")


class DataAsset(Base):
    __tablename__ = "data_assets"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    data_source_id = Column(String(36), ForeignKey("data_sources.id", ondelete="CASCADE"), nullable=False)
    asset_type = Column(String(50), nullable=False) # table, column, file, database, schema
    fully_qualified_name = Column(String(500), unique=True, nullable=False)
    display_name = Column(String(200))
    description = Column(String(2000))
    openmetadata_id = Column(String(100))
    openmetadata_fqn = Column(String(500))
    parent_asset_id = Column(String(36), ForeignKey("data_assets.id", ondelete="CASCADE"))
    metadata_json = Column(JSON) # e.g. column type, table row count
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    source = relationship("DataSource", back_populates="assets")
    parent = relationship("DataAsset", remote_side=[id], backref="children")
    classification = relationship("Classification", back_populates="asset", uselist=False, cascade="all, delete-orphan")
    description_details = relationship("AssetDescription", back_populates="asset", uselist=False, cascade="all, delete-orphan")
    glossary_links = relationship("AssetGlossaryLink", back_populates="asset", cascade="all, delete-orphan")


class Classification(Base):
    __tablename__ = "classifications"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    asset_id = Column(String(36), ForeignKey("data_assets.id", ondelete="CASCADE"), unique=True, nullable=False)
    sensitivity_level = Column(String(50), nullable=False) # Public, Internal, Confidential, Restricted, Critical
    data_type_tags = Column(JSON) # array of strings e.g. ["PII.Email", "PII.Name"]
    regulatory_tags = Column(JSON) # array of strings e.g. ["GDPR", "PCI-DSS"]
    business_domain = Column(String(100)) # e.g. HR, Financial, Legal
    classification_method = Column(String(50), default="Automated") # Automated, Manual, Rule-Based, LLM
    confidence_score = Column(Float, default=1.0)
    risk_score = Column(Float, default=0.0)
    reasoning = Column(String(2000)) # AI explanation
    review_status = Column(String(50), default="Pending") # Pending, Approved, Rejected, Overridden
    synced_to_om = Column(Boolean, default=False)
    synced_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    asset = relationship("DataAsset", back_populates="classification")


class AssetDescription(Base):
    __tablename__ = "asset_descriptions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    asset_id = Column(String(36), ForeignKey("data_assets.id", ondelete="CASCADE"), unique=True, nullable=False)
    business_description = Column(String(2000))
    technical_description = Column(String(2000))
    owner = Column(String(100))
    steward = Column(String(100))
    domain = Column(String(100))
    example_values = Column(String(500)) # comma separated sample values
    valid_range = Column(String(100))
    is_nullable = Column(Boolean, default=True)
    format = Column(String(100))
    transformation_rule = Column(String(1000))
    source_system = Column(String(100))
    tags = Column(JSON) # array of strings
    ai_suggested_description = Column(String(2000))
    ai_suggestion_accepted = Column(Boolean)
    documentation_status = Column(String(50), default="Draft") # Draft, In Review, Published
    synced_to_om = Column(Boolean, default=False)
    synced_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    asset = relationship("DataAsset", back_populates="description_details")


class GlossaryTerm(Base):
    __tablename__ = "glossary_terms"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), unique=True, nullable=False)
    definition = Column(String(1000), nullable=False)
    formula = Column(String(500))
    domain = Column(String(100))
    owner = Column(String(100))
    synonyms = Column(JSON) # list of synonyms
    status = Column(String(50), default="Draft") # Draft, Approved, Deprecated
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    links = relationship("AssetGlossaryLink", back_populates="term", cascade="all, delete-orphan")


class AssetGlossaryLink(Base):
    __tablename__ = "asset_glossary_links"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    asset_id = Column(String(36), ForeignKey("data_assets.id", ondelete="CASCADE"), nullable=False)
    glossary_term_id = Column(String(36), ForeignKey("glossary_terms.id", ondelete="CASCADE"), nullable=False)
    link_type = Column(String(50), default="relates_to") # defines, relates_to, derived_from
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    asset = relationship("DataAsset", back_populates="glossary_links")
    term = relationship("GlossaryTerm", back_populates="links")


class Policy(Base):
    __tablename__ = "policies"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)
    description = Column(String(500))
    policy_type = Column(String(50), default="classification") # classification, regulatory
    group_name = Column(String(100), default="Custom") # e.g. GDPR, HIPAA, PCI, Custom
    conditions = Column(JSON) # e.g. {"column_name_like": "ssn"}
    actions = Column(JSON) # e.g. {"apply_tag": "PII.SSN", "set_sensitivity": "Restricted"}
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class OMSyncLog(Base):
    __tablename__ = "om_sync_logs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    asset_fqn = Column(String(500), nullable=False)
    entity_type = Column(String(50), nullable=False) # table, column
    sync_status = Column(String(50), nullable=False) # success, failed
    sync_details = Column(String(2000))
    payload = Column(JSON)
    error_message = Column(String(1000))
    created_at = Column(DateTime, default=datetime.utcnow)


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(100), unique=True, nullable=False, index=True)
    hashed_password = Column(String(200), nullable=False)
    full_name = Column(String(100))
    role = Column(String(50), default="viewer") # admin, steward, reviewer, viewer
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AppSetting(Base):
    __tablename__ = "app_settings"

    key = Column(String(100), primary_key=True)
    value = Column(JSON, nullable=False)

