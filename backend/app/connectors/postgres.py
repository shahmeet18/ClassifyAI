import asyncpg
from typing import List, Dict, Any
from backend.app.connectors.base import BaseConnector

class PostgresConnector(BaseConnector):
    async def test_connection(self) -> Dict[str, Any]:
        try:
            conn = await asyncpg.connect(
                host=self.config.get("host", "localhost"),
                port=int(self.config.get("port", 5432)),
                user=self.config.get("user", "postgres"),
                password=self.config.get("password", ""),
                database=self.config.get("database", "postgres"),
                timeout=5
            )
            await conn.close()
            return {"status": "success", "message": "Successfully connected to PostgreSQL database."}
        except Exception as e:
            return {"status": "error", "message": f"Connection failed: {str(e)}"}

    async def discover_assets(self) -> List[Dict[str, Any]]:
        conn = None
        try:
            conn = await asyncpg.connect(
                host=self.config.get("host", "localhost"),
                port=int(self.config.get("port", 5432)),
                user=self.config.get("user", "postgres"),
                password=self.config.get("password", ""),
                database=self.config.get("database", "postgres"),
                timeout=10
            )

            # Query all user tables in public schema
            tables_query = """
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
            """
            table_rows = await conn.fetch(tables_query)
            tables_discovered = []

            for row in table_rows:
                table_name = row["table_name"]
                
                # Fetch columns for this table
                columns_query = """
                    SELECT column_name, data_type 
                    FROM information_schema.columns 
                    WHERE table_schema = 'public' AND table_name = $1
                    ORDER BY ordinal_position;
                """
                col_rows = await conn.fetch(columns_query, table_name)
                
                # Build columns and attempt data sampling
                columns_list = []
                col_names = [r["column_name"] for r in col_rows]
                
                # Query samples (limit 5)
                samples_by_column = {name: [] for name in col_names}
                if col_names:
                    cols_escaped = ", ".join([f'"{name}"' for name in col_names])
                    try:
                        sample_rows = await conn.fetch(f'SELECT {cols_escaped} FROM "{table_name}" LIMIT 5')
                        for s_row in sample_rows:
                            for name in col_names:
                                val = s_row[name]
                                if val is not None:
                                    samples_by_column[name].append(str(val))
                    except Exception:
                        pass # Ignore sampling failures, proceed with empty samples

                for col in col_rows:
                    name = col["column_name"]
                    columns_list.append({
                        "name": name,
                        "type": col["data_type"],
                        "samples": samples_by_column[name]
                    })

                tables_discovered.append({
                    "table": table_name,
                    "desc": f"PostgreSQL public table: {table_name}",
                    "columns": columns_list
                })

            return tables_discovered

        except Exception as e:
            # Propagate error or return empty array on failure
            raise RuntimeError(f"Failed to discover assets from PostgreSQL: {str(e)}")
        finally:
            if conn:
                await conn.close()
