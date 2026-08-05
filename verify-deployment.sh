#!/bin/bash
# Pre-Deployment Verification Script
# Run this to ensure everything is ready for Render deployment

echo "🔍 JanPukar Pre-Deployment Verification"
echo "========================================"
echo ""

# Track errors
ERRORS=0

# Check git status
echo "📝 Checking Git status..."
if ! git status > /dev/null 2>&1; then
    echo "❌ Not in a git repository"
    ((ERRORS++))
else
    echo "✅ Git repository detected"
fi

# Check frontend files
echo ""
echo "🖥️  Checking frontend files..."
if [ ! -f "frontend/package.json" ]; then
    echo "❌ frontend/package.json not found"
    ((ERRORS++))
else
    echo "✅ frontend/package.json exists"
fi

if [ ! -f "frontend/next.config.mjs" ]; then
    echo "❌ frontend/next.config.mjs not found"
    ((ERRORS++))
else
    echo "✅ frontend/next.config.mjs exists"
fi

if [ ! -d "frontend/app" ]; then
    echo "❌ frontend/app directory not found"
    ((ERRORS++))
else
    echo "✅ frontend/app directory exists"
fi

# Check backend files
echo ""
echo "🔧 Checking backend files..."
if [ ! -f "backend/requirements.txt" ]; then
    echo "❌ backend/requirements.txt not found"
    ((ERRORS++))
else
    echo "✅ backend/requirements.txt exists"
    # Check for pinned versions (we want >= not ==)
    if grep -q "==" backend/requirements.txt; then
        echo "⚠️  Warning: Found pinned versions (==) in requirements.txt - consider using >= for Render"
    else
        echo "✅ Using flexible version constraints (>=)"
    fi
fi

if [ ! -f "backend/runtime.txt" ]; then
    echo "❌ backend/runtime.txt not found"
    ((ERRORS++))
else
    echo "✅ backend/runtime.txt exists"
    PYTHON_VERSION=$(cat backend/runtime.txt)
    echo "   Python version: $PYTHON_VERSION"
fi

if [ ! -f "backend/main.py" ]; then
    echo "❌ backend/main.py not found"
    ((ERRORS++))
else
    echo "✅ backend/main.py exists"
fi

if [ ! -f "backend/bot.py" ]; then
    echo "❌ backend/bot.py not found"
    ((ERRORS++))
else
    echo "✅ backend/bot.py exists"
fi

# Check .env.example files
echo ""
echo "🔐 Checking environment configuration..."
if [ ! -f "frontend/.env.example" ]; then
    echo "❌ frontend/.env.example not found"
    ((ERRORS++))
else
    echo "✅ frontend/.env.example exists"
fi

if [ ! -f "backend/.env.example" ]; then
    echo "❌ backend/.env.example not found"
    ((ERRORS++))
else
    echo "✅ backend/.env.example exists"
fi

# Check .gitignore
echo ""
echo "🚫 Checking .gitignore..."
if [ ! -f ".gitignore" ]; then
    echo "⚠️  .gitignore not found at root"
else
    echo "✅ .gitignore exists"
    if grep -q "node_modules" .gitignore && grep -q "__pycache__" .gitignore; then
        echo "✅ Common artifacts ignored"
    fi
fi

# Check for node_modules and __pycache__ in git (bad)
echo ""
echo "📦 Checking for tracked artifacts..."
if git ls-files | grep -q "^node_modules/"; then
    echo "❌ node_modules is tracked in git"
    echo "   Run: git rm -r --cached node_modules && git commit -m 'Remove node_modules'"
    ((ERRORS++))
else
    echo "✅ node_modules not tracked"
fi

if git ls-files | grep -q "^backend/__pycache__/"; then
    echo "❌ __pycache__ is tracked in git"
    echo "   Run: git rm -r --cached backend/__pycache__ && git commit -m 'Remove __pycache__'"
    ((ERRORS++))
else
    echo "✅ __pycache__ not tracked"
fi

# Check documentation
echo ""
echo "📚 Checking documentation..."
if [ ! -f "README.md" ]; then
    echo "⚠️  README.md not found at root"
else
    echo "✅ README.md exists"
fi

if [ ! -f "RENDER_DEPLOYMENT.md" ]; then
    echo "⚠️  RENDER_DEPLOYMENT.md not found"
else
    echo "✅ RENDER_DEPLOYMENT.md exists"
fi

# Summary
echo ""
echo "========================================"
if [ $ERRORS -eq 0 ]; then
    echo "✅ All checks passed! Ready for deployment."
else
    echo "❌ Found $ERRORS error(s). Please fix before deploying."
fi
echo ""
