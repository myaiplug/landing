"""
Platform API Server

Standalone server for the ScrewAI Platform Infrastructure API.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Import platform API routes
try:
    import platform_api
    platform_router = platform_api.router
    print("✅ Platform API module loaded successfully")
except ImportError as e:
    print(f"⚠️  Platform API module not available: {e}")
    platform_router = None

# Create FastAPI app
app = FastAPI(
    title="ScrewAI Platform API",
    description="E-commerce infrastructure for digital music products",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include platform routes if available
if platform_router:
    app.include_router(platform_router)

@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "ScrewAI Platform API",
        "status": "operational",
        "version": "1.0.0",
        "endpoints": {
            "platform": "/platform/*",
            "health": "/health",
            "docs": "/docs"
        }
    }

@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "platform-api",
        "platform_routes": platform_router is not None
    }

if __name__ == "__main__":
    print("🚀 Starting ScrewAI Platform API Server...")
    uvicorn.run(
        "platform_server:app",
        host="0.0.0.0", 
        port=8001,
        reload=True
    )