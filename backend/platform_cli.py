#!/usr/bin/env python3
"""
Platform Infrastructure CLI

Command-line interface for managing the ScrewAI platform infrastructure.

Usage:
    python platform_cli.py init                    # Initialize platform database
    python platform_cli.py load-products          # Load products from generator
    python platform_cli.py create-user <email>    # Create user account
    python platform_cli.py stats                  # Show platform statistics
    python platform_cli.py demo-data             # Create demo data for testing
    python platform_cli.py server                # Start API server
"""

import argparse
import sys
import json
import uuid
from pathlib import Path
from datetime import datetime, timedelta
import uvicorn

from platform_infrastructure import (
    PlatformInfrastructure,
    UserTier,
    PurchaseStatus
)

class PlatformCLI:
    """Command-line interface for platform management."""
    
    def __init__(self):
        self.products_path = Path("../tools/product_generator/packaged_products")
        self.platform = None
    
    def init_platform(self):
        """Initialize platform infrastructure."""
        print("🏗️ Initializing Platform Infrastructure...")
        
        self.platform = PlatformInfrastructure(
            db_path="platform.db",
            products_path=self.products_path
        )
        
        print("✅ Platform initialized successfully")
        return self.platform
    
    def load_products(self):
        """Load products from the product generator catalog."""
        if not self.platform:
            self.platform = self.init_platform()
        
        print("📦 Loading products from generator catalog...")
        
        catalog_path = self.products_path / "master_product_catalog.json"
        if not catalog_path.exists():
            print(f"❌ Product catalog not found: {catalog_path}")
            return False
        
        # Load products
        self.platform.catalog.load_from_generator_catalog(catalog_path)
        
        # Show loaded products
        products = self.platform.catalog.get_all_products()
        print(f"✅ Loaded {len(products)} products:")
        
        for product in products:
            print(f"  - {product.name} (${product.price}) - {product.category}")
        
        return True
    
    def create_user(self, email: str, username: str = None, full_name: str = None):
        """Create a new user account."""
        if not self.platform:
            self.platform = self.init_platform()
        
        print(f"👤 Creating user: {email}")
        
        if not username:
            username = email.split('@')[0]
        
        try:
            user = self.platform.users.create_user(
                email=email,
                username=username,
                full_name=full_name
            )
            
            print(f"✅ Created user: {user.email} (ID: {user.id})")
            print(f"   Username: {user.username}")
            print(f"   Tier: {user.tier.value}")
            print(f"   Created: {user.created_at}")
            
            return user
        
        except Exception as e:
            print(f"❌ Error creating user: {e}")
            return None
    
    def show_stats(self):
        """Show platform statistics."""
        if not self.platform:
            self.platform = self.init_platform()
        
        print("📊 Platform Statistics\n")
        
        # Get dashboard stats
        stats = self.platform.get_dashboard_stats()
        
        print(f"📈 Overview:")
        print(f"  Products: {stats['product_count']}")
        print(f"  Users: {stats['user_count']}")
        
        sales = stats['sales_metrics']
        print(f"\n💰 Sales (Last 30 days):")
        print(f"  Orders: {sales['total_orders']}")
        print(f"  Revenue: ${sales['total_revenue']:.2f}")
        print(f"  New Users: {sales['new_users']}")
        
        if sales['product_sales']:
            print(f"\n🏆 Top Products:")
            for product in sales['product_sales'][:5]:
                print(f"  - {product['name']}: {product['orders']} orders (${product['revenue']:.2f})")
        
        if stats['recent_purchases']:
            print(f"\n🛒 Recent Purchases:")
            for purchase in stats['recent_purchases'][:5]:
                print(f"  - {purchase['user_email']}: {purchase['product_name']} (${purchase['amount']:.2f}) - {purchase['status']}")
        
        return stats
    
    def create_demo_data(self):
        """Create demo data for testing."""
        if not self.platform:
            self.platform = self.init_platform()
        
        print("🎭 Creating demo data...")
        
        # Create demo users
        demo_users = [
            ("demo@screwai.com", "demo_user", "Demo User"),
            ("producer1@example.com", "producer1", "Beat Producer"),
            ("musician@example.com", "musician", "Independent Musician"),
            ("label@example.com", "label_user", "Record Label Rep")
        ]
        
        created_users = []
        for email, username, full_name in demo_users:
            try:
                user = self.platform.users.create_user(email, username, full_name)
                created_users.append(user)
                print(f"  ✅ Created user: {email}")
            except Exception as e:
                # User might already exist
                user = self.platform.users.get_user_by_email(email)
                if user:
                    created_users.append(user)
                    print(f"  ℹ️  User exists: {email}")
                else:
                    print(f"  ❌ Error creating user {email}: {e}")
        
        # Create demo purchases
        products = self.platform.catalog.get_all_products()
        if not products:
            print("  ❌ No products available for demo purchases")
            return
        
        import random
        demo_purchases = []
        
        for i, user in enumerate(created_users[:3]):  # First 3 users make purchases
            # Each user buys 1-3 products
            num_purchases = random.randint(1, min(3, len(products)))
            user_products = random.sample(products, num_purchases)
            
            for product in user_products:
                try:
                    purchase = self.platform.purchases.create_purchase(
                        user_id=user.id,
                        product_id=product.id,
                        amount_paid=product.price
                    )
                    
                    # Complete the purchase
                    self.platform.purchases.complete_purchase(purchase.id)
                    demo_purchases.append(purchase)
                    
                    print(f"  ✅ Created purchase: {user.email} → {product.name}")
                    
                    # Track analytics
                    self.platform.analytics.track_event(
                        "demo_purchase",
                        user_id=user.id,
                        product_id=product.id,
                        event_data={"amount": product.price}
                    )
                    
                except Exception as e:
                    print(f"  ❌ Error creating purchase: {e}")
        
        # Create some analytics events
        events = [
            "page_view", "product_viewed", "cart_added", "checkout_started"
        ]
        
        for _ in range(20):  # 20 random events
            event_type = random.choice(events)
            user = random.choice(created_users) if created_users else None
            product = random.choice(products) if products else None
            
            self.platform.analytics.track_event(
                event_type,
                user_id=user.id if user else None,
                product_id=product.id if product else None
            )
        
        print(f"\n🎉 Demo data created:")
        print(f"  Users: {len(created_users)}")
        print(f"  Purchases: {len(demo_purchases)}")
        print(f"  Products: {len(products)}")
    
    def start_server(self, host: str = "0.0.0.0", port: int = 8001):
        """Start the platform API server.""" 
        print(f"🚀 Starting Platform API server on {host}:{port}")
        
        # Make sure platform is initialized
        if not self.platform:
            self.init_platform()
        
        try:
            import uvicorn
            print(f"   Starting uvicorn server...")
            print(f"   Available at: http://{host}:{port}")
            
            # Simple server configuration
            uvicorn.run(
                "platform_server:app",
                host=host,
                port=port,
                reload=False
            )
        except ImportError:
            print("❌ uvicorn not installed. Install with: pip install uvicorn")
        except Exception as e:
            print(f"❌ Server error: {e}")

def main():
    """Main CLI function."""
    parser = argparse.ArgumentParser(
        description="ScrewAI Platform Infrastructure CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""Examples:
  python platform_cli.py init                           # Initialize platform
  python platform_cli.py load-products                 # Load products from generator
  python platform_cli.py create-user demo@screwai.com  # Create user account  
  python platform_cli.py stats                         # Show statistics
  python platform_cli.py demo-data                     # Create demo data
  python platform_cli.py server                        # Start API server
"""
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Init command
    subparsers.add_parser('init', help='Initialize platform database')
    
    # Load products command
    subparsers.add_parser('load-products', help='Load products from generator catalog')
    
    # Create user command
    create_user_parser = subparsers.add_parser('create-user', help='Create user account')
    create_user_parser.add_argument('email', help='User email address')
    create_user_parser.add_argument('--username', help='Username (defaults to email prefix)')
    create_user_parser.add_argument('--full-name', help='Full name')
    
    # Stats command
    subparsers.add_parser('stats', help='Show platform statistics')
    
    # Demo data command
    subparsers.add_parser('demo-data', help='Create demo data for testing')
    
    # Server command
    server_parser = subparsers.add_parser('server', help='Start API server')
    server_parser.add_argument('--host', default='0.0.0.0', help='Server host')
    server_parser.add_argument('--port', type=int, default=8001, help='Server port')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    cli = PlatformCLI()
    
    try:
        if args.command == 'init':
            cli.init_platform()
            
        elif args.command == 'load-products':
            cli.load_products()
            
        elif args.command == 'create-user':
            cli.create_user(
                email=args.email,
                username=args.username,
                full_name=args.full_name
            )
            
        elif args.command == 'stats':
            cli.show_stats()
            
        elif args.command == 'demo-data':
            cli.create_demo_data()
            
        elif args.command == 'server':
            cli.start_server(host=args.host, port=args.port)
            
    except KeyboardInterrupt:
        print("\n❌ Operation cancelled by user.")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()