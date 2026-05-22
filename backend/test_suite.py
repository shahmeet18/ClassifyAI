import asyncio
import sys
from unittest.mock import AsyncMock, patch
from backend.app.classification.engine import ClassificationEngine
from backend.app.core.security import get_password_hash, verify_password, create_access_token, verify_access_token
from backend.app.classification.policy_executor import PolicyExecutor
from backend.app.models import Policy
from backend.app.connectors.postgres import PostgresConnector

def test_pattern_detection():
    print("Running Pattern Detection Tests...")
    
    # Test Email
    email_res = ClassificationEngine.classify_local("user_email", ["test@example.com", "admin@domain.co"])
    assert "PII.Email" in email_res["data_type_tags"]
    assert email_res["sensitivity_level"] == "Confidential"
    print("✓ Email pattern detection: PASS")

    # Test Credit Card
    cc_res = ClassificationEngine.classify_local("billing_card", ["4111111111111111", "5500123456789012"])
    assert "PCI.CardNumber" in cc_res["data_type_tags"]
    assert cc_res["sensitivity_level"] == "Restricted"
    print("✓ Credit Card pattern detection: PASS")

    # Test SSN
    ssn_res = ClassificationEngine.classify_local("ssn_field", ["000-12-3456", "999-88-7766"])
    assert "PII.SSN" in ssn_res["data_type_tags"]
    assert ssn_res["sensitivity_level"] == "Restricted"
    print("✓ SSN pattern detection: PASS")

    # Test default
    default_res = ClassificationEngine.classify_local("random_field", ["val1", "val2"])
    assert "BusinessDomain.Operational" in default_res["data_type_tags"]
    assert default_res["sensitivity_level"] == "Internal"
    print("✓ Default field logic: PASS")

def test_security_helpers():
    print("\nRunning Security Helpers Tests...")
    raw_pw = "my-secure-password"
    hashed = get_password_hash(raw_pw)
    assert hashed != raw_pw
    assert verify_password(raw_pw, hashed) is True
    assert verify_password("wrong-password", hashed) is False
    print("✓ Password hashing & verification: PASS")

    token_data = {"sub": "user_123", "role": "admin"}
    token = create_access_token(token_data)
    assert token is not None
    payload = verify_access_token(token)
    assert payload is not None
    assert payload["sub"] == "user_123"
    assert payload["role"] == "admin"
    print("✓ JWT token creation & validation: PASS")

def test_policy_engine():
    print("\nRunning Policy Engine Tests...")
    # Mock some policies
    policy1 = Policy(
        id="policy-1",
        name="Secrets policy",
        conditions={"column_name_like": "secret"},
        actions={"set_sensitivity": "Critical", "apply_tag": "PII.SecretKey"},
        is_active=True
    )
    policy2 = Policy(
        id="policy-2",
        name="Sensitive float policy",
        conditions={"data_type": "decimal"},
        actions={"set_sensitivity": "Confidential", "apply_tag": "Financial.Decimal"},
        is_active=True
    )
    
    # 1. Test column name policy match
    sens, tags, triggered = PolicyExecutor.evaluate_policies(
        column_name="db_client_secret_key",
        data_type="VARCHAR",
        samples=["abc", "def"],
        current_sensitivity="Internal",
        current_tags=[],
        policies=[policy1, policy2]
    )
    assert sens == "Critical"
    assert "PII.SecretKey" in tags
    assert "Secrets policy" in triggered
    print("✓ Column Name policy overrides: PASS")

    # 2. Test data type policy match
    sens_dt, tags_dt, triggered_dt = PolicyExecutor.evaluate_policies(
        column_name="balance",
        data_type="DECIMAL(10,2)",
        samples=["10.50", "20.00"],
        current_sensitivity="Internal",
        current_tags=[],
        policies=[policy1, policy2]
    )
    assert sens_dt == "Confidential"
    assert "Financial.Decimal" in tags_dt
    assert "Sensitive float policy" in triggered_dt
    print("✓ Data Type policy overrides: PASS")

def test_postgres_connector_mock():
    print("\nRunning Postgres Connector Mock Tests...")
    
    mock_table_rows = [{"table_name": "users"}]
    mock_col_rows = [
        {"column_name": "id", "data_type": "integer"},
        {"column_name": "email", "data_type": "character varying"}
    ]
    mock_sample_rows = [{"id": 1, "email": "test@example.com"}]
    
    async def mock_discover():
        conn = AsyncMock()
        conn.fetch.side_effect = [
            mock_table_rows,  # First query: list of tables
            mock_col_rows,     # Second query: columns for 'users'
            mock_sample_rows   # Third query: samples for columns in 'users'
        ]
        conn.close = AsyncMock()
        
        with patch("asyncpg.connect", return_value=conn):
            connector = PostgresConnector({"host": "localhost", "user": "postgres"})
            assets = await connector.discover_assets()
            
            assert len(assets) == 1
            assert assets[0]["table"] == "users"
            assert len(assets[0]["columns"]) == 2
            assert assets[0]["columns"][0]["name"] == "id"
            assert assets[0]["columns"][0]["type"] == "integer"
            assert assets[0]["columns"][1]["name"] == "email"
            assert assets[0]["columns"][1]["samples"] == ["test@example.com"]
            
        print("✓ Postgres connector mock discovery: PASS")
        
    asyncio.run(mock_discover())

if __name__ == "__main__":
    try:
        test_pattern_detection()
        test_security_helpers()
        test_policy_engine()
        test_postgres_connector_mock()
        print("\nAll unit tests passed successfully! 🎉")
    except AssertionError as e:
        print(f"\nAssertion Error: Test failed! Details: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\nUnexpected error during tests: {e}")
        sys.exit(1)
