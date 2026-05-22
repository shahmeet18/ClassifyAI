import logging
from typing import Dict, List, Any, Optional
import httpx
from datetime import datetime

logger = logging.getLogger("classifyai.om_client")

class OpenMetadataClient:
    def __init__(self, host_url: str = "", jwt_token: str = ""):
        self.host_url = host_url.rstrip("/") if host_url else "http://localhost:8585/api"
        self.jwt_token = jwt_token
        self.is_mock = not bool(host_url and jwt_token)
        
        self.headers = {
            "Content-Type": "application/json-patch+json",
            "Accept": "application/json"
        }
        if self.jwt_token:
            self.headers["Authorization"] = f"Bearer {self.jwt_token}"

    async def test_connection(self) -> Dict[str, Any]:
        """Tests connection to the OpenMetadata instance."""
        if self.is_mock:
            return {"status": "connected", "mode": "simulated", "message": "Simulated offline OpenMetadata connection."}
        
        url = f"{self.host_url}/v1/system/version"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                # Remove json-patch header for test GET
                headers = {"Authorization": f"Bearer {self.jwt_token}"} if self.jwt_token else {}
                response = await client.get(url, headers=headers)
                if response.status_code == 200:
                    return {"status": "connected", "mode": "live", "version": response.json().get("version", "unknown")}
                return {"status": "error", "message": f"Server returned code {response.status_code}"}
        except Exception as e:
            return {"status": "error", "message": f"Connection failed: {str(e)}"}

    async def create_classification(self, name: str, description: str) -> Dict[str, Any]:
        """Creates a classification group in OpenMetadata."""
        payload = {
            "name": name,
            "displayName": name,
            "description": description,
            "mutuallyExclusive": False
        }
        if self.is_mock:
            logger.info(f"[SIMULATED OM] Create Classification: {name}")
            return {"id": "mock-class-id", "name": name, "status": "simulated"}

        url = f"{self.host_url}/v1/classifications"
        try:
            async with httpx.AsyncClient() as client:
                headers = self.headers.copy()
                headers["Content-Type"] = "application/json"
                response = await client.post(url, json=payload, headers=headers)
                if response.status_code in [200, 201]:
                    return response.json()
                logger.error(f"Failed to create classification {name}: {response.text}")
        except Exception as e:
            logger.error(f"Error creating classification: {str(e)}")
        return {"name": name, "status": "failed"}

    async def create_tag(self, classification_name: str, name: str, description: str) -> Dict[str, Any]:
        """Creates a tag under a classification group in OpenMetadata."""
        payload = {
            "name": name,
            "displayName": name,
            "description": description
        }
        if self.is_mock:
            logger.info(f"[SIMULATED OM] Create Tag in {classification_name}: {name}")
            return {"id": "mock-tag-id", "name": name, "fqn": f"{classification_name}.{name}", "status": "simulated"}

        url = f"{self.host_url}/v1/classifications/{classification_name}/tags"
        try:
            async with httpx.AsyncClient() as client:
                headers = self.headers.copy()
                headers["Content-Type"] = "application/json"
                response = await client.post(url, json=payload, headers=headers)
                if response.status_code in [200, 201]:
                    return response.json()
                logger.error(f"Failed to create tag {name}: {response.text}")
        except Exception as e:
            logger.error(f"Error creating tag: {str(e)}")
        return {"name": name, "status": "failed"}

    async def patch_table_metadata(self, table_id_or_name: str, patch_operations: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Sends a JSON Patch request to update table/column details."""
        if self.is_mock:
            logger.info(f"[SIMULATED OM] Patch Table {table_id_or_name}: {patch_operations}")
            return {"status": "success", "mode": "simulated", "patched_ops": patch_operations}

        # Resolve Table ID if name is provided. FQN resolve: /v1/tables/name/{fqn}
        table_id = table_id_or_name
        async with httpx.AsyncClient() as client:
            if not self._is_uuid(table_id_or_name):
                # Resolve by FQN
                url_resolve = f"{self.host_url}/v1/tables/name/{table_id_or_name}"
                try:
                    resolve_resp = await client.get(url_resolve, headers={"Authorization": f"Bearer {self.jwt_token}"} if self.jwt_token else {})
                    if resolve_resp.status_code == 200:
                        table_id = resolve_resp.json().get("id")
                    else:
                        return {"status": "failed", "error": f"Could not resolve table name {table_id_or_name}"}
                except Exception as e:
                    return {"status": "failed", "error": f"Resolve error: {str(e)}"}

            url = f"{self.host_url}/v1/tables/{table_id}"
            try:
                response = await client.patch(url, json=patch_operations, headers=self.headers)
                if response.status_code == 200:
                    return {"status": "success", "data": response.json()}
                return {"status": "failed", "error": f"Patch failed with code {response.status_code}: {response.text}"}
            except Exception as e:
                return {"status": "failed", "error": str(e)}

    @staticmethod
    def _is_uuid(val: str) -> bool:
        try:
            import uuid
            uuid.UUID(val)
            return True
        except ValueError:
            return False

    def build_column_tags_patch(self, columns: List[Dict[str, Any]], target_column: str, tags: List[str], sensitivity: Optional[str] = None) -> List[Dict[str, Any]]:
        """Constructs a JSON Patch operations list for a specific column's tags."""
        col_index = -1
        current_tags = []
        
        for i, col in enumerate(columns):
            if col["name"] == target_column:
                col_index = i
                current_tags = col.get("tags", [])
                break

        if col_index == -1:
            return []

        # Create tag label structures
        new_tag_labels = []
        for tag in tags:
            new_tag_labels.append({
                "tagFQN": tag,
                "source": "Classification",
                "labelType": "Automated",
                "state": "Confirmed"
            })
            
        if sensitivity:
            new_tag_labels.append({
                "tagFQN": f"ClassifyAI_Sensitivity.{sensitivity}",
                "source": "Classification",
                "labelType": "Automated",
                "state": "Confirmed"
            })

        # Merge with existing tags that don't belong to our taxonomy to avoid overwriting other tags
        for c_tag in current_tags:
            fqn = c_tag.get("tagFQN", "")
            if not fqn.startswith("ClassifyAI_Sensitivity.") and not any(fqn.startswith(t.split('.')[0]) for t in tags):
                new_tag_labels.append(c_tag)

        return [
            {
                "op": "add",
                "path": f"/columns/{col_index}/tags",
                "value": new_tag_labels
            }
        ]

    def build_column_description_patch(self, columns: List[Dict[str, Any]], target_column: str, description: str) -> List[Dict[str, Any]]:
        """Constructs a JSON Patch operation for a specific column's description."""
        col_index = -1
        for i, col in enumerate(columns):
            if col["name"] == target_column:
                col_index = i
                break

        if col_index == -1:
            return []

        return [
            {
                "op": "add",
                "path": f"/columns/{col_index}/description",
                "value": description
            }
        ]
