# Model Compatibility Testing

## Quick Start

Test any model's compatibility with anyclaude:

```bash
# Load your model in LMStudio first, then run:
anyclaude --test-model
```

or

```bash
./test-model-compatibility.sh
```

This will generate a complete compatibility report with a score out of 100.

---

## What Gets Tested

### 1. **Speed to First Token (TTFT)** - 20 points

**What**: Time from request to first response token
**Why**: Affects perceived responsiveness
**Good**: < 2 seconds
**Acceptable**: 2-5 seconds
**Slow**: > 5 seconds

### 2. **Tokens Per Second (TPS)** - 20 points

**What**: Generation speed
**Why**: Affects overall response time
**Excellent**: > 20 tokens/sec
**Good**: 10-20 tokens/sec
**Slow**: < 10 tokens/sec

### 3. **Context Size** - 20 points

**What**: Maximum tokens model can handle
**Why**: Affects how much code/conversation history you can work with
**Excellent**: >= 32K tokens
**Good**: 8K-32K tokens
**Limited**: < 8K tokens

### 4. **Tool Calling** - 40 points (most important!)

**What**: Can the model call tools correctly?
**Tests**:

- Basic tool calling (simple schema)
- Complex tool calling (via anyclaude proxy)

**Scoring**:

- Both working: 40 points
- Basic only: 25 points
- Neither: 0 points

### 5. **System Resources**

**What**: RAM available on your machine
**Why**: Helps understand if you have enough resources
**Note**: Informational only, doesn't affect score

---

## Sample Output

```
╔══════════════════════════════════════════════════════════════╗
║          anyclaude Model Compatibility Test                 ║
╚══════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1️⃣  DETECTING MODEL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Model ID: qwen3-coder-30b-a3b-instruct-mlx
Loaded at: Sat Oct 26 10:30:15 PDT 2025

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2️⃣  TESTING SPEED TO FIRST TOKEN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⏱️  Time to First Token: 1850ms

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3️⃣  TESTING TOKENS PER SECOND
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Generated: 45 tokens in 2100ms
🚀 Speed: 21.43 tokens/second

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4️⃣  TESTING CONTEXT SIZE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📏 Max Context: ~32768 tokens

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5️⃣  TESTING TOOL CALLING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Tool calling: SUPPORTED
   Called: calculator

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
6️⃣  TESTING COMPLEX TOOL CALLING (via anyclaude)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Proxy running at: http://localhost:59123
✅ Complex tool calling: WORKING

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
7️⃣  CHECKING SYSTEM RESOURCES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💾 Total RAM: 128GB
💾 Available RAM: 96GB

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
8️⃣  COMPATIBILITY ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Speed to First Token: Excellent (20/20)
✅ Tokens/Second: Excellent (20/20)
✅ Context Size: Excellent (20/20)
✅ Tool Calling: Fully Compatible (40/40)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 OVERALL COMPATIBILITY SCORE: 100/100
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 Grade: A
💡 Recommendation: Excellent - Highly recommended for production use

📄 Reports saved:
   - JSON: model-compatibility-report.json
   - Markdown: model-compatibility-report.md
```

---

## Score Interpretation

### Grade A (85-100)

**Verdict**: ✅ **Production Ready**

- Use immediately with confidence
- No optimizations needed
- Suitable for complex Claude Code workflows

### Grade B (70-84)

**Verdict**: ⚠️ **Good for Most Cases**

- Works well for typical use
- May need minor optimizations for heavy workloads
- Consider model adapters for edge cases

### Grade C (50-69)

**Verdict**: ⚠️ **Usable with Limitations**

- Basic functionality works
- May struggle with complex tool calling
- Consider:
  - Adding model adapter config
  - Reducing context expectations
  - Monitoring performance

### Grade D (< 50)

**Verdict**: ❌ **Not Recommended**

- Significant compatibility issues
- Consider:
  - Different model
  - Hardware upgrade
  - Quantized version

---

## Generated Reports

### JSON Report (`model-compatibility-report.json`)

Machine-readable format for:

- Programmatic analysis
- Tracking over time
- Comparing models

**Structure**:

```json
{
  "model_id": "qwen3-coder-30b-a3b-instruct-mlx",
  "test_date": "2025-10-26T17:30:00Z",
  "tests": {
    "ttft": { "time_ms": 1850, "status": "excellent" },
    "tps": { "tokens_per_second": 21.43, "status": "excellent" },
    "context": { "max_tokens": 32768, "status": "excellent" },
    "tool_calling": { "supported": true, "status": "supported" },
    "complex_tool_calling": { "status": "working", "calls_made": 1 }
  },
  "system": {
    "total_memory_gb": 128,
    "available_memory_gb": 96
  },
  "compatibility": {
    "score": 100,
    "grade": "A",
    "recommendation": "Excellent - Highly recommended for production use"
  }
}
```

### Markdown Report (`model-compatibility-report.md`)

Human-readable format with:

- Tables and formatting
- Detailed recommendations
- Next steps

---

## Use Cases

### 1. Before Switching Models

**Question**: "Will this new model work well?"

```bash
# Load new model in LMStudio
# Then test it:
anyclaude --test-model

# Check score:
# - Score >= 85: Safe to switch
# - Score 70-84: Will work, minor tweaks
# - Score < 70: Needs investigation
```

### 2. Troubleshooting Performance

**Question**: "Why is anyclaude slow?"

```bash
anyclaude --test-model

# Check the results:
# - TTFT high? Model loading/processing slow
# - TPS low? GPU/CPU bottleneck
# - Tool calling issues? May need adapter
```

### 3. Hardware Verification

**Question**: "Can my machine handle this model?"

```bash
anyclaude --test-model

# Check system resources:
# - Available RAM < 8GB: May struggle
# - Available RAM >= 16GB: Should be fine
# - Consider quantized models if RAM limited
```

### 4. Model Comparison

**Question**: "Which model is better?"

```bash
# Test Model A
# Load model A in LMStudio
anyclaude --test-model
mv model-compatibility-report.json model-a-report.json

# Test Model B
# Load model B in LMStudio
anyclaude --test-model
mv model-compatibility-report.json model-b-report.json

# Compare scores
jq '.compatibility.score' model-a-report.json
jq '.compatibility.score' model-b-report.json
```

---

## Integration with anyclaude

The compatibility test is built into anyclaude as a CLI flag:

```bash
# Option 1: Via anyclaude
anyclaude --test-model

# Option 2: Direct script
./test-model-compatibility.sh
```

Both do the same thing - test the currently loaded LMStudio model.

---

## CI/CD Integration

Track model performance over time:

```bash
#!/bin/bash
# ci/test-models.sh

MODELS=(
  "qwen3-coder-30b"
  "llama-3-70b"
  "mistral-large"
)

mkdir -p reports/

for model in "${MODELS[@]}"; do
  echo "Testing $model..."

  # Load model in LMStudio (manual or via API)
  # ...

  # Run test
  ./test-model-compatibility.sh

  # Save report
  mv model-compatibility-report.json reports/${model}-$(date +%Y%m%d).json

  # Extract score
  SCORE=$(jq '.compatibility.score' reports/${model}-$(date +%Y%m%d).json)

  # Fail if score too low
  if [ $SCORE -lt 70 ]; then
    echo "❌ $model scored $SCORE - below threshold"
    exit 1
  fi

  echo "✅ $model scored $SCORE"
done

echo "All models passed compatibility tests"
```

---

## Troubleshooting

### "LMStudio is not running"

```bash
# Start LMStudio
# Enable server on port 1234
# Load a model
# Try again
```

### "Proxy failed to start"

```bash
# Check if anyclaude is built:
npm run build

# Check if script is executable:
chmod +x test-model-compatibility.sh

# Try running directly:
./test-model-compatibility.sh
```

### "Tool calling shows 0 calls"

This could mean:

1. Model doesn't support tool calling
2. Model needs special prompting
3. Test timed out

**Check the full report**:

```bash
cat model-compatibility-report.md
```

Look for errors or timeouts.

---

## Advanced Usage

### Custom Test Prompts

Edit `test-model-compatibility.sh` to add custom tests:

```bash
# Around line 150, add:
CUSTOM_TEST=$(curl -s -X POST http://localhost:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "'"$MODEL_ID"'",
    "messages": [{"role": "user", "content": "YOUR CUSTOM PROMPT"}],
    "max_tokens": 100
  }')

# Analyze result
# ...
```

### Automated Reporting

Send reports to a dashboard:

```bash
# After test completes:
curl -X POST https://your-dashboard.com/api/reports \
  -H "Content-Type: application/json" \
  -d @model-compatibility-report.json
```

### Benchmarking Suite

Create a benchmarking loop:

```bash
for i in {1..10}; do
  echo "Run $i/10..."
  anyclaude --test-model
  mv model-compatibility-report.json reports/run-$i.json
  sleep 60  # Cool down
done

# Calculate average scores
jq -s 'map(.compatibility.score) | add / length' reports/run-*.json
```

---

## Summary

**Quick Command**:

```bash
anyclaude --test-model
```

**What You Get**:

- 🎯 Compatibility score (0-100)
- 📊 Speed metrics (TTFT, TPS)
- 🔧 Tool calling validation
- 💾 Resource availability
- 📝 Detailed recommendations

**When to Use**:

- ✅ Before switching models
- ✅ Troubleshooting performance
- ✅ Comparing model options
- ✅ Validating hardware compatibility

**Next Steps**:

1. Run the test
2. Check the score
3. Read recommendations
4. Implement suggested fixes (if any)

**That's it!** One command tells you everything you need to know about model compatibility. 🚀
