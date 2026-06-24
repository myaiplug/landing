"""
Platform API Endpoints

FastAPI routes for the platform infrastructure.
Integrates with existing backend to add e-commerce functionality.
"""

from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Request, Query
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from datetime import datetime
import os
from pathlib import Path

from platform_infrastructure import (
    PlatformInfrastructure, 
    UserTier, 
    PurchaseStatus,
    User,
    Product,
    Purchase
)

# Initialize platform
PLATFORM = PlatformInfrastructure(
    products_path=Path("../tools/product_generator/packaged_products")
)

# API Router
router = APIRouter(prefix="/platform", tags=["platform"])

# Pydantic Models for API
class UserCreateRequest(BaseModel):
    email: str
    username: str
    full_name: Optional[str] = None

class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    full_name: Optional[str]
    tier: str
    created_at: datetime
    is_active: bool

class ProductResponse(BaseModel):
    id: str
    name: str
    slug: str
    description: str
    price: float
    category: str
    file_size_mb: float
    download_count: int
    version: str
    license_type: str
    is_active: bool
    created_at: datetime

class PurchaseRequest(BaseModel):
    product_id: str
    payment_method: str = "stripe"

class PurchaseResponse(BaseModel):
    id: str
    product: ProductResponse
    amount_paid: float
    status: str
    purchase_date: datetime
    license_key: str
    download_token: Optional[str]

class SalesMetrics(BaseModel):
    total_orders: int
    total_revenue: float
    new_users: int
    product_sales: List[Dict[str, Any]]
    period_days: int

# User Management Endpoints
@router.post("/users", response_model=UserResponse)
async def create_user(user_request: UserCreateRequest):
    """Create a new user account."""
    try:
        user = PLATFORM.users.create_user(
            email=user_request.email,
            username=user_request.username,
            full_name=user_request.full_name
        )
        
        # Track user creation
        PLATFORM.analytics.track_event("user_created", user_id=user.id)
        
        return UserResponse(
            id=user.id,
            email=user.email,
            username=user.username,
            full_name=user.full_name,
            tier=user.tier.value,
            created_at=user.created_at,
            is_active=user.is_active
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: str):
    """Get user by ID."""
    user = PLATFORM.users.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return UserResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        tier=user.tier.value,
        created_at=user.created_at,
        is_active=user.is_active
    )

@router.get("/users/{user_id}/purchases", response_model=List[PurchaseResponse])
async def get_user_purchases(user_id: str):
    """Get all purchases for a user."""
    purchases = PLATFORM.purchases.get_user_purchases(user_id)
    
    responses = []
    for purchase in purchases:
        product = PLATFORM.catalog.get_product(purchase.product_id)
        if product:
            responses.append(PurchaseResponse(
                id=purchase.id,
                product=ProductResponse(
                    id=product.id,
                    name=product.name,
                    slug=product.slug,
                    description=product.description,
                    price=product.price,
                    category=product.category,
                    file_size_mb=product.file_size_mb,
                    download_count=product.download_count,
                    version=product.version,
                    license_type=product.license_type,
                    is_active=product.is_active,
                    created_at=product.created_at
                ),
                amount_paid=purchase.amount_paid,
                status=purchase.status.value,
                purchase_date=purchase.purchase_date,
                license_key=purchase.license_key,
                download_token=purchase.download_token
            ))
    
    return responses

# Product Catalog Endpoints
@router.get("/products", response_model=List[ProductResponse])
async def get_products(category: Optional[str] = Query(None), active_only: bool = True):
    """Get all products, optionally filtered by category."""
    products = PLATFORM.catalog.get_all_products(active_only=active_only)
    
    if category:
        products = [p for p in products if p.category.lower() == category.lower()]
    
    return [
        ProductResponse(
            id=product.id,
            name=product.name,
            slug=product.slug,
            description=product.description,
            price=product.price,
            category=product.category,
            file_size_mb=product.file_size_mb,
            download_count=product.download_count,
            version=product.version,
            license_type=product.license_type,
            is_active=product.is_active,
            created_at=product.created_at
        )
        for product in products
    ]

@router.get("/products/{product_id}", response_model=ProductResponse)
async def get_product(product_id: str):
    """Get product by ID."""
    product = PLATFORM.catalog.get_product(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Track product view
    PLATFORM.analytics.track_event("product_viewed", product_id=product_id)
    
    return ProductResponse(
        id=product.id,
        name=product.name,
        slug=product.slug,
        description=product.description,
        price=product.price,
        category=product.category,
        file_size_mb=product.file_size_mb,
        download_count=product.download_count,
        version=product.version,
        license_type=product.license_type,
        is_active=product.is_active,
        created_at=product.created_at
    )

# Purchase & Payment Endpoints
@router.post("/purchases", response_model=PurchaseResponse)
async def create_purchase(purchase_request: PurchaseRequest, user_id: str = Query(...)):
    """Create a new purchase (simplified - would integrate with Stripe in production)."""
    # Verify product exists
    product = PLATFORM.catalog.get_product(purchase_request.product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Verify user exists
    user = PLATFORM.users.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Create purchase
    purchase = PLATFORM.purchases.create_purchase(
        user_id=user_id,
        product_id=product.id,
        amount_paid=product.price,
        stripe_payment_id=None  # Would be set by Stripe webhook
    )
    
    # For demo purposes, immediately complete the purchase
    PLATFORM.purchases.complete_purchase(purchase.id)
    
    # Track purchase
    PLATFORM.analytics.track_event(
        "purchase_completed",
        user_id=user_id,
        product_id=product.id,
        event_data={"amount": product.price}
    )
    
    # Get updated purchase
    updated_purchases = PLATFORM.purchases.get_user_purchases(user_id)
    updated_purchase = next(p for p in updated_purchases if p.id == purchase.id)
    
    return PurchaseResponse(
        id=updated_purchase.id,
        product=ProductResponse(
            id=product.id,
            name=product.name,
            slug=product.slug,
            description=product.description,
            price=product.price,
            category=product.category,
            file_size_mb=product.file_size_mb,
            download_count=product.download_count,
            version=product.version,
            license_type=product.license_type,
            is_active=product.is_active,
            created_at=product.created_at
        ),
        amount_paid=updated_purchase.amount_paid,
        status=updated_purchase.status.value,
        purchase_date=updated_purchase.purchase_date,
        license_key=updated_purchase.license_key,
        download_token=updated_purchase.download_token
    )

# Download Service Endpoints
@router.post("/downloads/{purchase_id}")
async def create_download_link(purchase_id: str, request: Request):
    """Create a secure download link for a purchase."""
    ip_address = request.client.host
    
    token = PLATFORM.downloads.create_download_link(
        purchase_id=purchase_id,
        ip_address=ip_address,
        expires_hours=24
    )
    
    if not token:
        raise HTTPException(status_code=400, detail="Cannot create download link")
    
    return {"download_token": token, "expires_hours": 24}

@router.get("/downloads/{token}")
async def download_file(token: str, request: Request):
    """Download a file using a secure token."""
    download_info = PLATFORM.downloads.verify_download_token(token)
    
    if not download_info:
        raise HTTPException(status_code=400, detail="Invalid or expired download token")
    
    file_path = Path(download_info["file_path"])
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    # Track download
    PLATFORM.analytics.track_event(
        "file_downloaded",
        user_id=download_info["user_id"],
        product_id=download_info["product_id"],
        event_data={"token": token}
    )
    
    return FileResponse(
        path=file_path,
        filename=f"{download_info['product_name']}.zip",
        media_type="application/zip"
    )

# Analytics & Reporting Endpoints
@router.get("/analytics/sales", response_model=SalesMetrics)
async def get_sales_metrics(days: int = Query(30, ge=1, le=365)):
    """Get sales metrics for the specified number of days."""
    metrics = PLATFORM.analytics.get_sales_metrics(days=days)
    
    return SalesMetrics(
        total_orders=metrics["total_orders"],
        total_revenue=metrics["total_revenue"],
        new_users=metrics["new_users"],
        product_sales=metrics["product_sales"],
        period_days=metrics["period_days"]
    )

@router.get("/analytics/dashboard")
async def get_dashboard_stats():
    """Get comprehensive dashboard statistics."""
    return PLATFORM.get_dashboard_stats()

@router.get("/analytics/events")
async def track_event(
    event_type: str,
    user_id: Optional[str] = None,
    product_id: Optional[str] = None,
    session_id: Optional[str] = None,
    request: Request = None
):
    """Track an analytics event."""
    ip_address = request.client.host if request else None
    
    PLATFORM.analytics.track_event(
        event_type=event_type,
        user_id=user_id,
        product_id=product_id,
        session_id=session_id,
        ip_address=ip_address
    )
    
    return {"status": "tracked", "event_type": event_type}

# Health Check
@router.get("/health")
async def platform_health():
    """Platform infrastructure health check."""
    try:
        # Test database connection
        products = PLATFORM.catalog.get_all_products(active_only=True)
        
        return {
            "status": "healthy",
            "database": "connected",
            "products_loaded": len(products),
            "timestamp": datetime.utcnow()
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.utcnow()
        }

# Admin Endpoints (would require admin authentication in production)
@router.get("/admin/stats")
async def get_admin_stats():
    """Get detailed admin statistics."""
    with PLATFORM.db.get_connection() as conn:
        # User stats
        cursor = conn.execute("SELECT tier, COUNT(*) FROM users GROUP BY tier")
        user_tiers = dict(cursor.fetchall())
        
        # Purchase stats by status
        cursor = conn.execute("SELECT status, COUNT(*) FROM purchases GROUP BY status")
        purchase_statuses = dict(cursor.fetchall())
        
        # Top products
        cursor = conn.execute("""
            SELECT p.name, COUNT(*) as purchases, SUM(pu.amount_paid) as revenue
            FROM purchases pu
            JOIN products p ON pu.product_id = p.id
            WHERE pu.status = 'completed'
            GROUP BY p.id, p.name
            ORDER BY purchases DESC
            LIMIT 10
        """)
        top_products = [
            {"name": row[0], "purchases": row[1], "revenue": row[2]}
            for row in cursor.fetchall()
        ]
        
        return {
            "user_tiers": user_tiers,
            "purchase_statuses": purchase_statuses,
            "top_products": top_products,
            "timestamp": datetime.utcnow()
        }