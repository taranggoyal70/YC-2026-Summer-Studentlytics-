import html
import json
import logging
import os
import re
import time
from collections import defaultdict, deque
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Deque, Dict, List, Literal, Optional

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

logger = logging.getLogger("studentlytics.security")
security = HTTPBearer(auto_error=False)

BASE_DIR = Path(__file__).parent
AUDIT_LOG_PATH = BASE_DIR / "data" / "security_events.log"

Role = Literal["student", "teacher", "admin"]
ALLOWED_ROLES = {"student", "teacher", "admin"}
STAFF_ROLES = {"teacher", "admin"}
ID_PATTERN = re.compile(r"^[A-Za-z0-9_.:#-]{1,80}$")

CLERK_ISSUER = os.getenv("CLERK_ISSUER", "").strip()
CLERK_JWKS_URL = os.getenv("CLERK_JWKS_URL", "").strip()
CLERK_AUDIENCE = os.getenv("CLERK_AUDIENCE", "").strip() or None
CLERK_AUTHORIZED_PARTIES = [
    origin.strip()
    for origin in os.getenv("CLERK_AUTHORIZED_PARTIES", os.getenv("FRONTEND_ORIGINS", "")).split(",")
    if origin.strip()
]

_jwks_client: Optional[jwt.PyJWKClient] = None
_rate_limit_events: Dict[str, Deque[float]] = defaultdict(deque)


class SecurityError(Exception):
    pass


class AuthContext(BaseModel):
    user_id: str
    role: Role
    email: Optional[EmailStr] = None


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class StudentPayload(StrictModel):
    student_id: str = Field(min_length=1, max_length=80)
    student_name: str = Field(min_length=1, max_length=120)
    student_email: Optional[EmailStr] = None
    major: Optional[str] = Field(default=None, max_length=120)
    department: Optional[str] = Field(default=None, max_length=120)
    cohort: Optional[str] = Field(default=None, max_length=120)
    topic: Optional[str] = Field(default=None, max_length=120)

    @field_validator("student_id")
    @classmethod
    def validate_student_id(cls, value: str) -> str:
        if not ID_PATTERN.match(value):
            raise ValueError("Invalid student_id")
        return value


class StudentUpdatePayload(StrictModel):
    student_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    student_email: Optional[EmailStr] = None
    major: Optional[str] = Field(default=None, max_length=120)
    department: Optional[str] = Field(default=None, max_length=120)
    cohort: Optional[str] = Field(default=None, max_length=120)
    topic: Optional[str] = Field(default=None, max_length=120)


class OpportunityPayload(StrictModel):
    title: str = Field(min_length=1, max_length=160)
    company: str = Field(min_length=1, max_length=160)
    type: Literal["Job shadows", "Micro-internships", "Networking", "Mentorship", "Hackathons"]
    tags: List[str] = Field(default_factory=list, max_length=10)
    location: str = Field(min_length=1, max_length=160)
    pay: Optional[str] = Field(default=None, max_length=80)
    duration: Optional[str] = Field(default=None, max_length=80)
    spots: Optional[int] = Field(default=None, ge=0, le=100000)
    students: Optional[int] = Field(default=None, ge=0, le=100000)
    deadline: Optional[str] = Field(default=None, max_length=80)
    status: Optional[Literal["New", "Closes Soon"]] = None
    isPaid: Optional[bool] = None
    description: Optional[str] = Field(default=None, max_length=4000)

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, value: List[str]) -> List[str]:
        return [tag[:40] for tag in value if tag.strip()]


class OpportunityUpdatePayload(StrictModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=160)
    company: Optional[str] = Field(default=None, min_length=1, max_length=160)
    type: Optional[Literal["Job shadows", "Micro-internships", "Networking", "Mentorship", "Hackathons"]] = None
    tags: Optional[List[str]] = Field(default=None, max_length=10)
    location: Optional[str] = Field(default=None, min_length=1, max_length=160)
    pay: Optional[str] = Field(default=None, max_length=80)
    duration: Optional[str] = Field(default=None, max_length=80)
    spots: Optional[int] = Field(default=None, ge=0, le=100000)
    students: Optional[int] = Field(default=None, ge=0, le=100000)
    deadline: Optional[str] = Field(default=None, max_length=80)
    status: Optional[Literal["New", "Closes Soon"]] = None
    isPaid: Optional[bool] = None
    description: Optional[str] = Field(default=None, max_length=4000)


def sanitize_value(value: Any) -> Any:
    if isinstance(value, str):
        return html.escape(value, quote=True)
    if isinstance(value, list):
        return [sanitize_value(item) for item in value]
    if isinstance(value, dict):
        return {key: sanitize_value(item) for key, item in value.items()}
    return value


def sanitize_payload(payload: BaseModel) -> Dict[str, Any]:
    return sanitize_value(payload.model_dump(exclude_none=True))


def audit_event(event: str, actor_id: Optional[str], metadata: Optional[Dict[str, Any]] = None) -> None:
    AUDIT_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    record = {
        "timestamp": datetime.utcnow().isoformat(),
        "event": event,
        "actor_id": actor_id,
        "metadata": metadata or {},
    }
    with open(AUDIT_LOG_PATH, "a") as f:
        f.write(json.dumps(record, separators=(",", ":")) + "\n")


def _get_jwks_client() -> jwt.PyJWKClient:
    global _jwks_client
    jwks_url = CLERK_JWKS_URL or (f"{CLERK_ISSUER.rstrip('/')}/.well-known/jwks.json" if CLERK_ISSUER else "")
    if not jwks_url:
        raise SecurityError("Clerk JWT verification is not configured")
    if _jwks_client is None:
        _jwks_client = jwt.PyJWKClient(jwks_url)
    return _jwks_client


def _extract_role(payload: Dict[str, Any]) -> Role:
    role = (
        payload.get("role")
        or payload.get("public_metadata", {}).get("role")
        or payload.get("metadata", {}).get("role")
        or "student"
    )
    return role if role in ALLOWED_ROLES else "student"


async def require_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> AuthContext:
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    try:
        token = credentials.credentials
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
        decode_kwargs = {
            "algorithms": ["RS256"],
            "options": {"verify_aud": bool(CLERK_AUDIENCE)},
        }
        if CLERK_ISSUER:
            decode_kwargs["issuer"] = CLERK_ISSUER
        if CLERK_AUDIENCE:
            decode_kwargs["audience"] = CLERK_AUDIENCE

        payload = jwt.decode(token, signing_key.key, **decode_kwargs)
        azp = payload.get("azp")
        if CLERK_AUTHORIZED_PARTIES and azp and azp not in CLERK_AUTHORIZED_PARTIES:
            raise SecurityError("Token authorized party is not allowed")

        user_id = payload.get("sub")
        if not user_id:
            raise SecurityError("Token missing subject")

        request.state.user = AuthContext(
            user_id=user_id,
            role=_extract_role(payload),
            email=payload.get("email"),
        )
        return request.state.user
    except SecurityError:
        logger.warning("Authentication rejected")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    except Exception:
        logger.warning("Authentication token verification failed")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")


def require_roles(*roles: Role) -> Callable[[AuthContext], AuthContext]:
    def dependency(user: AuthContext = Depends(require_user)) -> AuthContext:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        return user

    return dependency


def is_admin(user: AuthContext) -> bool:
    return user.role == "admin"


def owns_resource(resource: Dict[str, Any], user: AuthContext) -> bool:
    return is_admin(user) or resource.get("owner_id") == user.user_id


def check_rate_limit(key: str, *, limit: int, window_seconds: int) -> bool:
    now = time.monotonic()
    events = _rate_limit_events[key]
    while events and now - events[0] > window_seconds:
        events.popleft()
    if len(events) >= limit:
        return False
    events.append(now)
    return True
