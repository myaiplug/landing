#!/usr/bin/env python3
"""
Test script for Platform API

Tests the basic functionality of the platform API server.
"""

import requests
import json

def test_api():
    """Test basic API functionality."""
    base_url = "http://localhost:8002"
    
    print("🧪 Testing Platform API...")
    print(f"   Base URL: {base_url}")
    
    try:
        # Test health endpoint
        print("\n1. Testing health endpoint...")
        response = requests.get(f"{base_url}/health")
        print(f"   Status: {response.status_code}")
        if response.status_code == 200:
            print(f"   Response: {response.json()}")
        
        # Test root endpoint  
        print("\n2. Testing root endpoint...")
        response = requests.get(f"{base_url}/")
        print(f"   Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"   Service: {data.get('message', 'N/A')}")
            print(f"   Version: {data.get('version', 'N/A')}")
        
        # Test platform stats
        print("\n3. Testing platform stats...")
        response = requests.get(f"{base_url}/platform/stats")
        print(f"   Status: {response.status_code}")
        if response.status_code == 200:
            stats = response.json()
            print(f"   Users: {stats.get('users', 0)}")
            print(f"   Products: {stats.get('products', 0)}")
            print(f"   Revenue: ${stats.get('total_revenue', 0)}")
        
        # Test platform info
        print("\n4. Testing platform info...")
        response = requests.get(f"{base_url}/platform/info")
        print(f"   Status: {response.status_code}")
        if response.status_code == 200:
            info = response.json()
            print(f"   Platform: {info.get('name', 'N/A')}")
            print(f"   Status: {info.get('status', 'N/A')}")
        
        print("\n✅ API Testing Complete!")
        
    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to server. Make sure it's running on port 8002")
    except Exception as e:
        print(f"❌ Error testing API: {e}")

if __name__ == "__main__":
    test_api()