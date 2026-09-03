import hmac
import hashlib
import json
import base64
import time
import os
from typing import Optional, Dict, Any
from fastapi import Header, HTTPException, status
from database import db_manager

# Secret key for HMAC token signing
AUTH_SECRET_KEY = os.getenv("AUTH_SECRET_KEY", "railvoice_super_secure_production_secret_key_2026")
TOKEN_EXPIRY_SECONDS = 7 * 24 * 3600  # 7 days

def hash_password(password: str) -> str:
    """Hashes password with PBKDF2-HMAC-SHA256 and a random salt."""
    salt = os.urandom(16).hex()
    key = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    )
    return f"{salt}:{key.hex()}"

def verify_password(password: str, hashed: str) -> bool:
    """Verifies password against stored salt and key."""
    try:
        salt, key_hex = hashed.split(":")
        key = hashlib.pbkdf2_hmac(
            'sha256',
            password.encode('utf-8'),
            salt.encode('utf-8'),
            100000
        )
        return hmac.compare_digest(key.hex(), key_hex)
    except Exception:
        return False

def create_access_token(user_dict: Dict[str, Any]) -> str:
    """Generates an HMAC-SHA256 signed JSON Web Token string."""
    payload = {
        "sub": str(user_dict.get("_id", "")),
        "email": user_dict.get("email", ""),
        "name": user_dict.get("name", ""),
        "exp": int(time.time()) + TOKEN_EXPIRY_SECONDS
    }
    payload_bytes = json.dumps(payload, separators=(',', ':')).encode('utf-8')
    b64_payload = base64.urlsafe_b64encode(payload_bytes).decode('utf-8').rstrip('=')
    
    signature = hmac.new(
        AUTH_SECRET_KEY.encode('utf-8'),
        b64_payload.encode('utf-8'),
        hashlib.sha256
    ).digest()
    b64_sig = base64.urlsafe_b64encode(signature).decode('utf-8').rstrip('=')
    
    return f"{b64_payload}.{b64_sig}"

def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decodes and validates token signature and expiry."""
    try:
        parts = token.split(".")
        if len(parts) != 2:
            return None
        b64_payload, b64_sig = parts
        
        # Verify signature
        expected_sig = hmac.new(
            AUTH_SECRET_KEY.encode('utf-8'),
            b64_payload.encode('utf-8'),
            hashlib.sha256
        ).digest()
        expected_b64_sig = base64.urlsafe_b64encode(expected_sig).decode('utf-8').rstrip('=')
        
        if not hmac.compare_digest(b64_sig, expected_b64_sig):
            return None
        
        # Add padding back if necessary
        padded_payload = b64_payload + '=' * (-len(b64_payload) % 4)
        payload_bytes = base64.urlsafe_b64decode(padded_payload)
        payload = json.loads(payload_bytes.decode('utf-8'))
        
        if payload.get("exp", 0) < time.time():
            return None
            
        return payload
    except Exception:
        return None

async def get_optional_current_user(authorization: Optional[str] = Header(None)) -> Optional[Dict[str, Any]]:
    """Optional authentication dependency: returns user doc if valid Bearer token, else None."""
    if not authorization:
        return None
    token = authorization.replace("Bearer ", "").strip()
    payload = decode_access_token(token)
    if not payload:
        return None
    
    user = await db_manager.users.find_one({"email": payload["email"]})
    return user

async def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    """Strict authentication dependency: raises 401 if token is missing or invalid."""
    user = await get_optional_current_user(authorization)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
