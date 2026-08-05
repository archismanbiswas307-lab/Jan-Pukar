#!/bin/bash
# Final Git Preparation Before Render Deployment

echo "🔖 JanPukar - Git Preparation Script"
echo "======================================"
echo ""

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "❌ Not in a git repository!"
    exit 1
fi

echo "✅ In git repository"
echo ""

# Show current status
echo "📊 Current Git Status:"
echo ""
git status --short
echo ""

# Check for uncommitted changes
UNCOMMITTED=$(git status --porcelain)
if [ -n "$UNCOMMITTED" ]; then
    echo "📝 Files with changes:"
    git status --short
    echo ""
    
    read -p "Would you like to stage and commit these changes? (y/n) " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo ""
        echo "Staging all changes..."
        git add .
        
        echo ""
        echo "📝 Recommended commit message:"
        echo "  'Complete Render deployment setup'"
        echo ""
        echo "Full message should include:"
        echo "  - Backend dependency fixes for Python 3.13.12"
        echo "  - Comprehensive deployment documentation"
        echo "  - Verification scripts"
        echo "  - Environment templates"
        echo ""
        
        read -p "Enter commit message (or press Enter for default): " COMMIT_MSG
        
        if [ -z "$COMMIT_MSG" ]; then
            COMMIT_MSG="Complete Render deployment setup

- Fix all backend dependencies with flexible version ranges
- Pin Python runtime to 3.13.12
- Add comprehensive deployment documentation
- Create .env.example templates
- Add verification and reference scripts
- Update .gitignore for secrets and artifacts"
        fi
        
        git commit -m "$COMMIT_MSG"
        
        echo ""
        echo "✅ Committed!"
        echo ""
        echo "📤 Ready to push to GitHub?"
        echo ""
        read -p "Push to origin main? (y/n) " -n 1 -r
        echo ""
        
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "Pushing..."
            git push origin main
            echo ""
            echo "✅ Pushed to GitHub!"
            echo ""
            echo "🎉 Your code is now ready for Render deployment!"
            echo ""
            echo "Next steps:"
            echo "1. Go to https://render.com/dashboard"
            echo "2. Create three services (follow RENDER_DEPLOYMENT.md)"
            echo "3. Monitor Render logs during build"
            echo "4. Verify health endpoints"
            echo "5. Test Telegram bot integration"
        else
            echo "Skipped push. Remember to push when ready!"
        fi
    else
        echo "Skipped staging and committing."
    fi
else
    echo "✅ No uncommitted changes"
    echo ""
    
    # Check if we're ahead of origin
    AHEAD=$(git rev-list --count origin/main..HEAD 2>/dev/null)
    if [ "$AHEAD" -gt 0 ]; then
        echo "📤 You have $AHEAD commits ready to push"
        echo ""
        read -p "Push to origin main? (y/n) " -n 1 -r
        echo ""
        
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            git push origin main
            echo ""
            echo "✅ Pushed to GitHub!"
            echo ""
            echo "🎉 Your code is now ready for Render deployment!"
        fi
    else
        echo "✅ Already in sync with origin/main"
        echo "🎉 Your code is ready for deployment!"
    fi
fi

echo ""
echo "======================================"
echo ""
echo "📚 Next: Follow RENDER_DEPLOYMENT.md to create services on Render"
echo ""
