"""
Simplified backend for authentication only
Run this with: uvicorn main_auth:app --reload --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from auth import router as auth_router

app = FastAPI(title="HighView Auth API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include authentication routes
app.include_router(auth_router, prefix="/api/auth", tags=["authentication"])

@app.get("/")
def root():
    return {"message": "HighView Authentication API", "status": "running"}

@app.get("/health")
def health():
    return {"status": "ok", "service": "auth"}
