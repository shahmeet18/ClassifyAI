from abc import ABC, abstractmethod
from typing import List, Dict, Any

class BaseConnector(ABC):
    def __init__(self, connection_config: Dict[str, Any]):
        self.config = connection_config or {}

    @abstractmethod
    async def test_connection(self) -> Dict[str, Any]:
        """
        Tests connection to the database/storage source.
        Returns {"status": "success"/"error", "message": "..."}
        """
        pass

    @abstractmethod
    async def discover_assets(self) -> List[Dict[str, Any]]:
        """
        Queries metadata from database catalog schema.
        Returns list of tables with columns:
        [
            {
                "table": "table_name",
                "desc": "...",
                "columns": [
                    {"name": "...", "type": "...", "samples": [...]},
                    ...
                ]
            }
        ]
        """
        pass
