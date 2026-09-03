import json
import os
import asyncio
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

logger = logging.getLogger("railvoice.database")

# Check if motor is available
try:
    from motor.motor_asyncio import AsyncIOMotorClient
    HAS_MOTOR = True
except ImportError:
    HAS_MOTOR = False

class JSONCollectionFallback:
    """Async fallback document store matching Motor collection interface."""
    def __init__(self, file_path: str, collection_name: str):
        self.file_path = file_path
        self.collection_name = collection_name
        self._lock = asyncio.Lock()
        self._ensure_file()

    def _ensure_file(self):
        os.makedirs(os.path.dirname(self.file_path), exist_ok=True)
        if not os.path.exists(self.file_path):
            with open(self.file_path, "w") as f:
                json.dump({self.collection_name: []}, f, indent=2)
        else:
            try:
                with open(self.file_path, "r") as f:
                    data = json.load(f)
                    if self.collection_name not in data:
                        data[self.collection_name] = []
                with open(self.file_path, "w") as f:
                    json.dump(data, f, indent=2)
            except Exception:
                with open(self.file_path, "w") as f:
                    json.dump({self.collection_name: []}, f, indent=2)

    async def _read_all(self) -> List[Dict[str, Any]]:
        async with self._lock:
            try:
                with open(self.file_path, "r") as f:
                    data = json.load(f)
                    return data.get(self.collection_name, [])
            except Exception as e:
                logger.error(f"Error reading {self.file_path}: {e}")
                return []

    async def _write_all(self, docs: List[Dict[str, Any]]):
        async with self._lock:
            try:
                data = {}
                if os.path.exists(self.file_path):
                    try:
                        with open(self.file_path, "r") as f:
                            data = json.load(f)
                    except Exception:
                        data = {}
                data[self.collection_name] = docs
                with open(self.file_path, "w") as f:
                    json.dump(data, f, indent=2, default=str)
            except Exception as e:
                logger.error(f"Error writing {self.file_path}: {e}")

    async def insert_one(self, doc: Dict[str, Any]):
        docs = await self._read_all()
        doc_copy = dict(doc)
        if "_id" not in doc_copy:
            doc_copy["_id"] = str(len(docs) + 1)
        docs.append(doc_copy)
        await self._write_all(docs)
        class InsertResult:
            inserted_id = doc_copy["_id"]
        return InsertResult()

    async def find_one(self, query: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        docs = await self._read_all()
        for doc in reversed(docs):
            matches = True
            for k, v in query.items():
                if doc.get(k) != v:
                    matches = False
                    break
            if matches:
                return dict(doc)
        return None

    def find(self, query: Dict[str, Any] = None):
        if query is None:
            query = {}
        class Cursor:
            def __init__(self, parent, q):
                self.parent = parent
                self.q = q
                self._sort_field = None
                self._sort_direction = 1

            def sort(self, field: str, direction: int = 1):
                self._sort_field = field
                self._sort_direction = direction
                return self

            async def to_list(self, length: Optional[int] = 100) -> List[Dict[str, Any]]:
                docs = await self.parent._read_all()
                filtered = []
                for doc in docs:
                    matches = True
                    for k, v in self.q.items():
                        if doc.get(k) != v:
                            matches = False
                            break
                    if matches:
                        filtered.append(dict(doc))
                if self._sort_field:
                    filtered.sort(
                        key=lambda x: x.get(self._sort_field, ""),
                        reverse=(self._sort_direction == -1)
                    )
                if length is not None:
                    return filtered[:length]
                return filtered
        return Cursor(self, query)

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any]):
        docs = await self._read_all()
        modified = 0
        set_data = update.get("$set", {})
        for doc in docs:
            matches = True
            for k, v in query.items():
                if doc.get(k) != v:
                    matches = False
                    break
            if matches:
                doc.update(set_data)
                modified = 1
                break
        if modified:
            await self._write_all(docs)
        class UpdateResult:
            modified_count = modified
        return UpdateResult()

    async def count_documents(self, query: Dict[str, Any] = None) -> int:
        if query is None:
            query = {}
        docs = await self._read_all()
        count = 0
        for doc in docs:
            matches = True
            for k, v in query.items():
                if doc.get(k) != v:
                    matches = False
                    break
            if matches:
                count += 1
        return count


class DatabaseManager:
    def __init__(self):
        self.is_connected_to_mongo = False
        self.client = None
        self.db = None
        self.fallback_file = os.path.join(os.path.dirname(__file__), "data", "railvoice_db.json")
        self.bookings = JSONCollectionFallback(self.fallback_file, "bookings")
        self.sessions = JSONCollectionFallback(self.fallback_file, "sessions")
        self.users = JSONCollectionFallback(self.fallback_file, "users")

    async def initialize(self, mongo_uri: str, db_name: str):
        if HAS_MOTOR and mongo_uri:
            try:
                # Attempt to ping MongoDB with a short timeout
                client = AsyncIOMotorClient(mongo_uri, serverSelectionTimeoutMS=2000)
                await client.admin.command('ping')
                self.client = client
                self.db = client[db_name]
                self.bookings = self.db.bookings
                self.sessions = self.db.sessions
                self.users = self.db.users
                self.is_connected_to_mongo = True
                logger.info("Successfully connected to live MongoDB!")
                return
            except Exception as e:
                logger.warning(f"MongoDB not available at {mongo_uri} ({e}). Falling back to JSON document database.")
        
        # Fallback to local async JSON document store
        self.is_connected_to_mongo = False
        self.bookings = JSONCollectionFallback(self.fallback_file, "bookings")
        self.sessions = JSONCollectionFallback(self.fallback_file, "sessions")
        self.users = JSONCollectionFallback(self.fallback_file, "users")
        logger.info(f"Using persistent JSON Document Store at {self.fallback_file}")

db_manager = DatabaseManager()
