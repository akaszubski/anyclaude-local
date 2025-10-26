#!/bin/bash
# Quick diagnostic for anyclaude + LMStudio setup

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 anyclaude Diagnostic"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Check LMStudio
echo "1️⃣  Checking LMStudio..."
if curl -s -m 5 http://localhost:1234/v1/models > /dev/null 2>&1; then
    echo "   ✅ LMStudio responding on :1234"
    MODELS=$(curl -s http://localhost:1234/v1/models | jq -r '.data[].id' 2>/dev/null)
    if [ -n "$MODELS" ]; then
        echo "   📦 Loaded models:"
        echo "$MODELS" | while read model; do
            echo "      - $model"
        done
    else
        echo "   ⚠️  No models loaded (or jq not installed)"
    fi
else
    echo "   ❌ LMStudio NOT responding"
    echo "      Start LMStudio and load a model"
fi
echo ""

# 2. Check anyclaude build
echo "2️⃣  Checking anyclaude..."
if [ -f "dist/main.js" ]; then
    echo "   ✅ Built: dist/main.js"
    SIZE=$(ls -lh dist/main.js | awk '{print $5}')
    echo "      Size: $SIZE"
else
    echo "   ❌ Not built - run: bun run build"
fi
echo ""

# 3. Check Node.js
echo "3️⃣  Checking Node.js..."
if command -v node > /dev/null; then
    NODE_VERSION=$(node --version)
    echo "   ✅ Node.js: $NODE_VERSION"
else
    echo "   ❌ Node.js not found"
fi
echo ""

# 4. Test direct LMStudio request
echo "4️⃣  Testing LMStudio directly..."
RESPONSE=$(curl -s -m 10 -X POST http://localhost:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "current-model",
    "messages": [{"role": "user", "content": "Say test"}],
    "max_tokens": 5
  }' 2>&1)

if echo "$RESPONSE" | grep -q "choices"; then
    echo "   ✅ LMStudio responding to chat completions"
    TEXT=$(echo "$RESPONSE" | jq -r '.choices[0].message.content' 2>/dev/null)
    echo "      Response: \"$TEXT\""
else
    echo "   ❌ LMStudio request failed"
    echo "      Error: $RESPONSE"
fi
echo ""

# 5. Check ports
echo "5️⃣  Checking ports..."
if lsof -i :1234 > /dev/null 2>&1; then
    echo "   ✅ Port 1234 in use (LMStudio)"
else
    echo "   ❌ Port 1234 not in use"
fi

if lsof -i :3000-65535 | grep node > /dev/null 2>&1; then
    echo "   ⚠️  Node process using ports (anyclaude may be running)"
else
    echo "   ✅ No anyclaude proxy running"
fi
echo ""

# 6. Environment variables
echo "6️⃣  Environment variables..."
echo "   LMSTUDIO_URL: ${LMSTUDIO_URL:-not set (using default)}"
echo "   LMSTUDIO_MODEL: ${LMSTUDIO_MODEL:-not set (using default)}"
echo "   ANYCLAUDE_DEBUG: ${ANYCLAUDE_DEBUG:-not set}"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Overall status
ALL_GOOD=true

if ! curl -s -m 5 http://localhost:1234/v1/models > /dev/null 2>&1; then
    echo "❌ LMStudio not ready"
    ALL_GOOD=false
fi

if [ ! -f "dist/main.js" ]; then
    echo "❌ anyclaude not built"
    ALL_GOOD=false
fi

if $ALL_GOOD; then
    echo "✅ All checks passed! Ready to run anyclaude"
    echo ""
    echo "To start with debug logging:"
    echo "  ./scripts/debug-session.sh"
    echo ""
    echo "Or run normally:"
    echo "  anyclaude"
else
    echo "⚠️  Some checks failed - see above for details"
fi
echo ""
