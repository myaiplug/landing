"""
Platform Infrastructure Module

Complete business backend for ScrewAI product distribution and monetization.
Integrates with existing FastAPI backend to add e-commerce functionality.

Features:
- Purchase Processing & Order Management
- Secure Download Service
- User Account Management
- Payment Gateway (Stripe) Integration
- Analytics & Revenue Tracking
- Product Catalog Management
- License Verification
"""

import os
import json
import uuid
import hashlib
import sqlite3
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from pathlib import Path
from dataclasses import dataclass, asdict
from enum import Enum
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class PurchaseStatus(Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"
    REFUNDED = "refunded"

class UserTier(Enum):
    FREE = "free"
    BASIC = "basic"
    PRO = "pro"
    PREMIUM = "premium"

@dataclass
class User:
    """User account information."""
    id: str
    email: str
    username: str
    full_name: Optional[str]
    tier: UserTier
    stripe_customer_id: Optional[str]
    created_at: datetime
    last_login: Optional[datetime]
    is_active: bool = True

@dataclass
class Product:
    """Product catalog entry."""
    id: str
    name: str
    slug: str
    description: str
    price: float
    category: str
    file_path: str
    file_size_mb: float
    integrity_hash: str
    download_count: int
    version: str
    compatibility: Dict[str, Any]
    license_type: str
    is_active: bool = True
    created_at: datetime = None

@dataclass
class Purchase:
    """Purchase transaction record."""
    id: str
    user_id: str
    product_id: str
    stripe_payment_id: Optional[str]
    amount_paid: float
    currency: str
    status: PurchaseStatus
    purchase_date: datetime
    license_key: str
    download_token: Optional[str] = None

@dataclass
class DownloadRecord:
    """Secure download tracking."""
    id: str
    user_id: str
    product_id: str
    purchase_id: str
    download_token: str
    download_date: datetime
    ip_address: str
    expires_at: datetime
    is_used: bool = False

class PlatformDatabase:
    """SQLite database manager for platform infrastructure."""
    
    def __init__(self, db_path: str = "platform.db"):
        self.db_path = db_path
        self.init_database()
    
    def get_connection(self):
        """Get database connection."""
        return sqlite3.connect(self.db_path)
    
    def init_database(self):
        """Initialize database tables."""
        with self.get_connection() as conn:
            # Users table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    username TEXT UNIQUE NOT NULL,
                    full_name TEXT,
                    tier TEXT NOT NULL DEFAULT 'free',
                    stripe_customer_id TEXT,
                    created_at TIMESTAMP NOT NULL,
                    last_login TIMESTAMP,
                    is_active BOOLEAN DEFAULT 1
                )
            """)
            
            # Products table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS products (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    slug TEXT UNIQUE NOT NULL,
                    description TEXT,
                    price REAL NOT NULL,
                    category TEXT,
                    file_path TEXT NOT NULL,
                    file_size_mb REAL,
                    integrity_hash TEXT,
                    download_count INTEGER DEFAULT 0,
                    version TEXT DEFAULT '1.0',
                    compatibility TEXT,
                    license_type TEXT DEFAULT 'commercial',
                    is_active BOOLEAN DEFAULT 1,
                    created_at TIMESTAMP NOT NULL
                )
            """)
            
            # Purchases table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS purchases (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    product_id TEXT NOT NULL,
                    stripe_payment_id TEXT,
                    amount_paid REAL NOT NULL,
                    currency TEXT DEFAULT 'usd',
                    status TEXT NOT NULL DEFAULT 'pending',
                    purchase_date TIMESTAMP NOT NULL,
                    license_key TEXT UNIQUE NOT NULL,
                    download_token TEXT,
                    FOREIGN KEY (user_id) REFERENCES users (id),
                    FOREIGN KEY (product_id) REFERENCES products (id)
                )
            """)
            
            # Downloads table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS downloads (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    product_id TEXT NOT NULL,
                    purchase_id TEXT NOT NULL,
                    download_token TEXT UNIQUE NOT NULL,
                    download_date TIMESTAMP NOT NULL,
                    ip_address TEXT,
                    expires_at TIMESTAMP NOT NULL,
                    is_used BOOLEAN DEFAULT 0,
                    FOREIGN KEY (user_id) REFERENCES users (id),
                    FOREIGN KEY (product_id) REFERENCES products (id),
                    FOREIGN KEY (purchase_id) REFERENCES purchases (id)
                )
            """)
            
            # Analytics table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS analytics (
                    id TEXT PRIMARY KEY,
                    event_type TEXT NOT NULL,
                    user_id TEXT,
                    product_id TEXT,
                    event_data TEXT,
                    timestamp TIMESTAMP NOT NULL,
                    session_id TEXT,
                    ip_address TEXT
                )
            """)
            
            # Create indexes
            conn.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_products_slug ON products (slug)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_purchases_user ON purchases (user_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_downloads_token ON downloads (download_token)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_analytics_event ON analytics (event_type, timestamp)")
            
            conn.commit()
            logger.info("Database initialized successfully")

class UserManager:
    """User account management."""
    
    def __init__(self, db: PlatformDatabase):
        self.db = db
    
    def create_user(self, email: str, username: str, full_name: Optional[str] = None) -> User:
        """Create a new user account."""
        user = User(
            id=str(uuid.uuid4()),
            email=email,
            username=username,
            full_name=full_name,
            tier=UserTier.FREE,
            stripe_customer_id=None,
            created_at=datetime.utcnow(),
            last_login=None
        )
        
        with self.db.get_connection() as conn:
            conn.execute("""
                INSERT INTO users (id, email, username, full_name, tier, created_at, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (user.id, user.email, user.username, user.full_name, 
                  user.tier.value, user.created_at, user.is_active))
            conn.commit()
        
        logger.info(f"Created user: {user.email}")
        return user
    
    def get_user(self, user_id: str) -> Optional[User]:
        """Get user by ID."""
        with self.db.get_connection() as conn:
            cursor = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,))
            row = cursor.fetchone()
            
            if row:
                return User(
                    id=row[0],
                    email=row[1],
                    username=row[2],
                    full_name=row[3],
                    tier=UserTier(row[4]),
                    stripe_customer_id=row[5],
                    created_at=datetime.fromisoformat(row[6]),
                    last_login=datetime.fromisoformat(row[7]) if row[7] else None,
                    is_active=bool(row[8])
                )
        return None
    
    def get_user_by_email(self, email: str) -> Optional[User]:
        """Get user by email."""
        with self.db.get_connection() as conn:
            cursor = conn.execute("SELECT * FROM users WHERE email = ?", (email,))
            row = cursor.fetchone()
            
            if row:
                return User(
                    id=row[0],
                    email=row[1],
                    username=row[2],
                    full_name=row[3],
                    tier=UserTier(row[4]),
                    stripe_customer_id=row[5],
                    created_at=datetime.fromisoformat(row[6]),
                    last_login=datetime.fromisoformat(row[7]) if row[7] else None,
                    is_active=bool(row[8])
                )
        return None
    
    def update_user_tier(self, user_id: str, tier: UserTier):
        """Update user tier/subscription level."""
        with self.db.get_connection() as conn:
            conn.execute("UPDATE users SET tier = ? WHERE id = ?", (tier.value, user_id))
            conn.commit()
        
        logger.info(f"Updated user {user_id} tier to {tier.value}")
    
    def get_all_users(self) -> List[User]:
        """Get all users."""
        with self.db.get_connection() as conn:
            cursor = conn.execute("SELECT * FROM users ORDER BY created_at DESC")
            rows = cursor.fetchall()
            
            users = []
            for row in rows:
                users.append(User(
                    id=row[0],
                    email=row[1],
                    username=row[2],
                    full_name=row[3],
                    tier=UserTier(row[4]),
                    stripe_customer_id=row[5],
                    created_at=datetime.fromisoformat(row[6]),
                    last_login=datetime.fromisoformat(row[7]) if row[7] else None,
                    is_active=bool(row[8])
                ))
            
            return users

class ProductCatalog:
    """Product catalog management."""
    
    def __init__(self, db: PlatformDatabase):
        self.db = db
    
    def load_from_generator_catalog(self, catalog_path: Path):
        """Load products from the product generator catalog."""
        if not catalog_path.exists():
            logger.warning(f"Product catalog not found: {catalog_path}")
            return
        
        with open(catalog_path, 'r') as f:
            catalog = json.load(f)
        
        products_added = 0
        
        for product_data in catalog.get("products", []):
            package_info = product_data["package_info"]
            
            # Check if product already exists
            if self.get_product_by_slug(package_info["name"]):
                continue
            
            product = Product(
                id=str(uuid.uuid4()),
                name=package_info["name"],
                slug=package_info["name"],
                description=package_info["description"],
                price=self._get_product_price(package_info["name"]),
                category=self._infer_category(package_info["name"]),
                file_path=str(catalog_path.parent / product_data["download_info"]["filename"]),
                file_size_mb=package_info["file_size_mb"],
                integrity_hash=package_info["integrity_hash"],
                download_count=0,
                version=package_info["version"],
                compatibility=product_data["metadata"].get("compatibility", {}),
                license_type=product_data["metadata"]["license"],
                created_at=datetime.utcnow()
            )
            
            self.add_product(product)
            products_added += 1
        
        logger.info(f"Loaded {products_added} products from catalog")
    
    def add_product(self, product: Product):
        """Add a product to the catalog."""
        with self.db.get_connection() as conn:
            conn.execute("""
                INSERT INTO products (
                    id, name, slug, description, price, category, file_path,
                    file_size_mb, integrity_hash, download_count, version,
                    compatibility, license_type, is_active, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                product.id, product.name, product.slug, product.description,
                product.price, product.category, product.file_path,
                product.file_size_mb, product.integrity_hash, product.download_count,
                product.version, json.dumps(product.compatibility),
                product.license_type, product.is_active, product.created_at
            ))
            conn.commit()
    
    def get_product(self, product_id: str) -> Optional[Product]:
        """Get product by ID."""
        with self.db.get_connection() as conn:
            cursor = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,))
            row = cursor.fetchone()
            
            if row:
                return self._row_to_product(row)
        return None
    
    def get_product_by_slug(self, slug: str) -> Optional[Product]:
        """Get product by slug."""
        with self.db.get_connection() as conn:
            cursor = conn.execute("SELECT * FROM products WHERE slug = ?", (slug,))
            row = cursor.fetchone()
            
            if row:
                return self._row_to_product(row)
        return None
    
    def get_all_products(self, active_only: bool = True) -> List[Product]:
        """Get all products."""
        with self.db.get_connection() as conn:
            query = "SELECT * FROM products"
            if active_only:
                query += " WHERE is_active = 1"
            query += " ORDER BY created_at DESC"
            
            cursor = conn.execute(query)
            rows = cursor.fetchall()
            
            return [self._row_to_product(row) for row in rows]
    
    def _row_to_product(self, row) -> Product:
        """Convert database row to Product object."""
        return Product(
            id=row[0],
            name=row[1],
            slug=row[2],
            description=row[3],
            price=row[4],
            category=row[5],
            file_path=row[6],
            file_size_mb=row[7],
            integrity_hash=row[8],
            download_count=row[9],
            version=row[10],
            compatibility=json.loads(row[11]) if row[11] else {},
            license_type=row[12],
            is_active=bool(row[13]),
            created_at=datetime.fromisoformat(row[14])
        )
    
    def _get_product_price(self, product_name: str) -> float:
        """Get price for product based on type."""
        name_lower = product_name.lower()
        if "preset" in name_lower:
            return 14.99
        elif "mastering" in name_lower:
            return 19.99
        elif "hook" in name_lower or "vault" in name_lower:
            return 24.99
        elif "prompt" in name_lower:
            return 9.99
        elif "kit" in name_lower:
            return 12.99
        else:
            return 10.99
    
    def _infer_category(self, product_name: str) -> str:
        """Infer product category from name."""
        name_lower = product_name.lower()
        if "preset" in name_lower or "chain" in name_lower:
            return "Presets & Chains"
        elif "hook" in name_lower or "vault" in name_lower:
            return "Audio Content"
        elif "prompt" in name_lower:
            return "Creative Tools"
        elif "template" in name_lower or "kit" in name_lower:
            return "Templates & Guides"
        else:
            return "Other"

class PurchaseManager:
    """Purchase processing and order management."""
    
    def __init__(self, db: PlatformDatabase):
        self.db = db
    
    def create_purchase(self, user_id: str, product_id: str, amount_paid: float, 
                       stripe_payment_id: Optional[str] = None) -> Purchase:
        """Create a new purchase record."""
        purchase = Purchase(
            id=str(uuid.uuid4()),
            user_id=user_id,
            product_id=product_id,
            stripe_payment_id=stripe_payment_id,
            amount_paid=amount_paid,
            currency="usd",
            status=PurchaseStatus.PENDING,
            purchase_date=datetime.utcnow(),
            license_key=self._generate_license_key()
        )
        
        with self.db.get_connection() as conn:
            conn.execute("""
                INSERT INTO purchases (
                    id, user_id, product_id, stripe_payment_id, amount_paid,
                    currency, status, purchase_date, license_key
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                purchase.id, purchase.user_id, purchase.product_id,
                purchase.stripe_payment_id, purchase.amount_paid,
                purchase.currency, purchase.status.value,
                purchase.purchase_date, purchase.license_key
            ))
            conn.commit()
        
        logger.info(f"Created purchase {purchase.id} for user {user_id}")
        return purchase
    
    def complete_purchase(self, purchase_id: str) -> bool:
        """Mark purchase as completed and generate download token."""
        download_token = str(uuid.uuid4())
        
        with self.db.get_connection() as conn:
            cursor = conn.execute("""
                UPDATE purchases 
                SET status = ?, download_token = ?
                WHERE id = ?
            """, (PurchaseStatus.COMPLETED.value, download_token, purchase_id))
            
            if cursor.rowcount > 0:
                conn.commit()
                logger.info(f"Completed purchase {purchase_id}")
                return True
        
        return False
    
    def get_user_purchases(self, user_id: str) -> List[Purchase]:
        """Get all purchases for a user."""
        with self.db.get_connection() as conn:
            cursor = conn.execute("""
                SELECT * FROM purchases WHERE user_id = ?
                ORDER BY purchase_date DESC
            """, (user_id,))
            rows = cursor.fetchall()
            
            purchases = []
            for row in rows:
                purchases.append(Purchase(
                    id=row[0],
                    user_id=row[1],
                    product_id=row[2],
                    stripe_payment_id=row[3],
                    amount_paid=row[4],
                    currency=row[5],
                    status=PurchaseStatus(row[6]),
                    purchase_date=datetime.fromisoformat(row[7]),
                    license_key=row[8],
                    download_token=row[9]
                ))
            
            return purchases
    
    def _generate_license_key(self) -> str:
        """Generate a unique license key."""
        return f"SA-{uuid.uuid4().hex[:8].upper()}-{uuid.uuid4().hex[:8].upper()}"

class DownloadService:
    """Secure download service with token-based authentication."""
    
    def __init__(self, db: PlatformDatabase):
        self.db = db
    
    def create_download_link(self, purchase_id: str, ip_address: str, 
                           expires_hours: int = 24) -> Optional[str]:
        """Create a secure download link for a completed purchase."""
        # Get purchase information
        with self.db.get_connection() as conn:
            cursor = conn.execute("""
                SELECT user_id, product_id, status, download_token
                FROM purchases WHERE id = ?
            """, (purchase_id,))
            row = cursor.fetchone()
            
            if not row or row[2] != PurchaseStatus.COMPLETED.value:
                return None
            
            user_id, product_id, status, download_token = row
            
            # Create download record
            download_record = DownloadRecord(
                id=str(uuid.uuid4()),
                user_id=user_id,
                product_id=product_id,
                purchase_id=purchase_id,
                download_token=str(uuid.uuid4()),
                download_date=datetime.utcnow(),
                ip_address=ip_address,
                expires_at=datetime.utcnow() + timedelta(hours=expires_hours)
            )
            
            conn.execute("""
                INSERT INTO downloads (
                    id, user_id, product_id, purchase_id, download_token,
                    download_date, ip_address, expires_at, is_used
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                download_record.id, download_record.user_id,
                download_record.product_id, download_record.purchase_id,
                download_record.download_token, download_record.download_date,
                download_record.ip_address, download_record.expires_at,
                download_record.is_used
            ))
            conn.commit()
            
            return download_record.download_token
    
    def verify_download_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Verify download token and return download info."""
        with self.db.get_connection() as conn:
            cursor = conn.execute("""
                SELECT d.*, p.file_path, p.name
                FROM downloads d
                JOIN products p ON d.product_id = p.id
                WHERE d.download_token = ? AND d.is_used = 0 AND d.expires_at > ?
            """, (token, datetime.utcnow()))
            row = cursor.fetchone()
            
            if row:
                # Mark as used
                conn.execute("""
                    UPDATE downloads SET is_used = 1 WHERE download_token = ?
                """, (token,))
                conn.commit()
                
                return {
                    "file_path": row[10],
                    "product_name": row[11],
                    "user_id": row[1],
                    "product_id": row[2]
                }
        
        return None

class AnalyticsTracker:
    """Analytics and metrics tracking."""
    
    def __init__(self, db: PlatformDatabase):
        self.db = db
    
    def track_event(self, event_type: str, user_id: Optional[str] = None,
                   product_id: Optional[str] = None, event_data: Optional[Dict] = None,
                   session_id: Optional[str] = None, ip_address: Optional[str] = None):
        """Track an analytics event."""
        with self.db.get_connection() as conn:
            conn.execute("""
                INSERT INTO analytics (
                    id, event_type, user_id, product_id, event_data,
                    timestamp, session_id, ip_address
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                str(uuid.uuid4()), event_type, user_id, product_id,
                json.dumps(event_data) if event_data else None,
                datetime.utcnow(), session_id, ip_address
            ))
            conn.commit()
    
    def get_sales_metrics(self, days: int = 30) -> Dict[str, Any]:
        """Get sales metrics for the last N days."""
        start_date = datetime.utcnow() - timedelta(days=days)
        
        with self.db.get_connection() as conn:
            # Total sales
            cursor = conn.execute("""
                SELECT COUNT(*), SUM(amount_paid)
                FROM purchases
                WHERE purchase_date >= ? AND status = 'completed'
            """, (start_date,))
            total_orders, total_revenue = cursor.fetchone()
            
            # Sales by product
            cursor = conn.execute("""
                SELECT p.name, COUNT(*), SUM(pu.amount_paid)
                FROM purchases pu
                JOIN products p ON pu.product_id = p.id
                WHERE pu.purchase_date >= ? AND pu.status = 'completed'
                GROUP BY p.id, p.name
                ORDER BY COUNT(*) DESC
            """, (start_date,))
            product_sales = cursor.fetchall()
            
            # New users
            cursor = conn.execute("""
                SELECT COUNT(*) FROM users WHERE created_at >= ?
            """, (start_date,))
            new_users = cursor.fetchone()[0]
            
            return {
                "total_orders": total_orders or 0,
                "total_revenue": total_revenue or 0.0,
                "new_users": new_users,
                "product_sales": [
                    {"name": row[0], "orders": row[1], "revenue": row[2]}
                    for row in product_sales
                ],
                "period_days": days
            }

class PlatformInfrastructure:
    """Main platform infrastructure coordinator."""
    
    def __init__(self, db_path: str = "platform.db", products_path: Optional[Path] = None):
        self.db = PlatformDatabase(db_path)
        self.users = UserManager(self.db)
        self.catalog = ProductCatalog(self.db)
        self.purchases = PurchaseManager(self.db)
        self.downloads = DownloadService(self.db)
        self.analytics = AnalyticsTracker(self.db)
        
        # Load products from generator if path provided
        if products_path:
            catalog_path = products_path / "master_product_catalog.json"
            self.catalog.load_from_generator_catalog(catalog_path)
        
        logger.info("Platform Infrastructure initialized")
    
    def get_dashboard_stats(self) -> Dict[str, Any]:
        """Get comprehensive dashboard statistics."""
        return {
            "sales_metrics": self.analytics.get_sales_metrics(30),
            "user_count": len(self.users.get_all_users()),
            "product_count": len(self.catalog.get_all_products()),
            "recent_purchases": self.get_recent_purchases(10)
        }
    
    def get_recent_purchases(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get recent purchases with product and user info."""
        with self.db.get_connection() as conn:
            cursor = conn.execute("""
                SELECT p.id, u.email, pr.name, p.amount_paid, p.purchase_date, p.status
                FROM purchases p
                JOIN users u ON p.user_id = u.id
                JOIN products pr ON p.product_id = pr.id
                ORDER BY p.purchase_date DESC
                LIMIT ?
            """, (limit,))
            rows = cursor.fetchall()
            
            return [
                {
                    "id": row[0],
                    "user_email": row[1],
                    "product_name": row[2],
                    "amount": row[3],
                    "date": row[4],
                    "status": row[5]
                }
                for row in rows
            ]

def main():
    """Initialize platform infrastructure."""
    print("🏗️ Initializing ScrewAI Platform Infrastructure...")
    
    # Initialize with products from generator
    products_path = Path("../tools/product_generator/packaged_products")
    platform = PlatformInfrastructure(products_path=products_path)
    
    # Create sample user for testing
    try:
        sample_user = platform.users.create_user(
            email="demo@screwai.com",
            username="demo_user",
            full_name="Demo User"
        )
        print(f"✅ Created sample user: {sample_user.email}")
    except Exception as e:
        print(f"Sample user may already exist: {e}")
    
    # Display stats
    stats = platform.get_dashboard_stats()
    print(f"\n📊 Platform Status:")
    print(f"  Products: {stats['product_count']}")
    print(f"  Users: {stats['user_count']}")
    print(f"  Recent Revenue (30d): ${stats['sales_metrics']['total_revenue']:.2f}")
    print(f"  Recent Orders (30d): {stats['sales_metrics']['total_orders']}")
    
    print("\n🎉 Platform Infrastructure ready!")
    return platform

if __name__ == "__main__":
    platform = main()