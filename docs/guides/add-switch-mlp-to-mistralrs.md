# How to Add switch_mlp Support to mistral.rs

**Date**: 2025-11-22
**Goal**: Make mistral.rs work with Qwen3 MoE MLX-quantized models
**Difficulty**: 🟡 Medium (2-4 weeks, Rust experience required)

---

## TL;DR

**Problem**: mistral.rs fails to load Qwen3 MoE MLX models because it expects:
```
model.layers.0.mlp.gate_proj.weight
```

But MLX models have:
```
model.layers.0.mlp.switch_mlp.gate_proj.weight
```

**Solution**: Modify mistral.rs's Qwen3 MoE implementation to support the `switch_mlp` tensor path structure.

---

## What We Know

### ✅ mistral.rs Already Has MoE Support!

File: `/tmp/mistral.rs/mistralrs-core/src/models/qwen3_moe.rs`

The codebase already implements:
- `FastMoeMlp` - Optimized for Metal with fused experts
- `SlowMoeMlp` - CPU/CUDA version with individual experts
- Expert routing and top-k selection
- Proper MoE forward pass

### ✅ MLX Shows Us the Pattern

File: `/tmp/mlx-lm/mlx_lm/models/qwen3_moe.py`

MLX implements `Qwen3MoeSparseMoeBlock` using:
```python
self.gate = nn.Linear(dim, num_experts, bias=False)  # Router
self.switch_mlp = SwitchGLU(dim, intermediate_size, num_experts)
```

`SwitchGLU` wraps:
```python
self.gate_proj = SwitchLinear(...)  # All experts' gate_proj stacked
self.up_proj = SwitchLinear(...)    # All experts' up_proj stacked
self.down_proj = SwitchLinear(...)  # All experts' down_proj stacked
```

---

## The Core Issue

### Current mistral.rs Tensor Loading

File: `mistralrs-core/src/models/qwen3_moe.rs:363-413`

```rust
struct FastMoeMlp {
    gate: Arc<dyn QuantMethod>,          // Router weights
    fused_gate_proj: Arc<dyn QuantMethod>,
    fused_up_proj: Arc<dyn QuantMethod>,
    fused_down_proj: Arc<dyn QuantMethod>,
    // ...
}

impl FastMoeMlp {
    fn new(cfg: &Config, vb: ShardedVarBuilder, ...) -> Result<Self> {
        let gate = linear_no_bias(..., vb.pp("gate"))?;

        let FusedExperts {
            fused_gate_proj,  // Expects vb.pp("gate_proj")
            fused_up_proj,    // Expects vb.pp("up_proj")
            fused_down_proj,  // Expects vb.pp("down_proj")
        } = FusedExperts::new(..., vb)?;
    }
}
```

**This looks for**:
- `model.layers.0.mlp.gate.weight` ✅ (found - router)
- `model.layers.0.mlp.gate_proj.weight` ❌ (not found!)
- `model.layers.0.mlp.up_proj.weight` ❌ (not found!)
- `model.layers.0.mlp.down_proj.weight` ❌ (not found!)

### What MLX Models Actually Have

```
model.layers.0.mlp.gate.weight                      ✅ Router (exists)
model.layers.0.mlp.switch_mlp.gate_proj.weight      ✅ Expert gate (exists!)
model.layers.0.mlp.switch_mlp.up_proj.weight        ✅ Expert up (exists!)
model.layers.0.mlp.switch_mlp.down_proj.weight      ✅ Expert down (exists!)
```

---

## Solution: Two Approaches

### Approach A: Add Prefix to Tensor Loading (Easy)

**Idea**: Just prepend `"switch_mlp"` to the varbuilder path when loading MLX models.

**Implementation** (~ 50 lines):

```rust
// In mistralrs-core/src/models/qwen3_moe.rs

impl FastMoeMlp {
    fn new(
        cfg: &Config,
        vb: ShardedVarBuilder,
        layer_device: Device,
        comm: &Arc<mistralrs_quant::Comm>,
        use_switch_mlp: bool,  // NEW PARAMETER
    ) -> Result<Self> {
        // ... existing code ...

        // Choose prefix based on model format
        let mlp_prefix = if use_switch_mlp {
            "switch_mlp"
        } else {
            ""
        };

        let FusedExperts {
            fused_gate_proj,
            fused_up_proj,
            fused_down_proj,
        } = FusedExperts::new(
            cfg.hidden_size,
            cfg.moe_intermediate_size,
            cfg.num_experts,
            &cfg.quantization_config,
            vb.pp(mlp_prefix),  // Add prefix here!
        )?;

        // ... rest of code ...
    }
}
```

**Then detect MLX format**:

```rust
// In model loading code
let use_switch_mlp = {
    // Check if model has switch_mlp tensors
    let test_key = "model.layers.0.mlp.switch_mlp.gate_proj.weight";
    vb.contains_tensor(test_key)  // Implement this check
};
```

**Pros**:
- ✅ Minimal code changes (~50 lines)
- ✅ No architectural changes
- ✅ Backward compatible

**Cons**:
- ⚠️ Hacky detection logic
- ⚠️ Might break with different quantization formats

### Approach B: Proper Abstraction (Better)

**Idea**: Create a `SwitchMLP` struct that mirrors MLX's structure.

**Implementation** (~200-300 lines):

```rust
// Add new struct
struct SwitchMoeMlp {
    gate: Arc<dyn QuantMethod>,  // Router
    switch_mlp: SwitchMlpExperts,
    norm_topk_prob: bool,
    num_experts_per_tok: usize,
}

struct SwitchMlpExperts {
    gate_proj: Arc<dyn QuantMethod>,  // Fused experts
    up_proj: Arc<dyn QuantMethod>,
    down_proj: Arc<dyn QuantMethod>,
}

impl SwitchMoeMlp {
    fn new(cfg: &Config, vb: ShardedVarBuilder, ...) -> Result<Self> {
        // Load router
        let gate = linear_no_bias(..., vb.pp("gate"))?;

        // Load switch_mlp experts
        let switch_vb = vb.pp("switch_mlp");
        let gate_proj = ...load from switch_vb.pp("gate_proj");
        let up_proj = ...load from switch_vb.pp("up_proj");
        let down_proj = ...load from switch_vb.pp("down_proj");

        Ok(Self {
            gate,
            switch_mlp: SwitchMlpExperts {
                gate_proj,
                up_proj,
                down_proj,
            },
            // ...
        })
    }

    fn forward(&self, xs: &Tensor) -> Result<Tensor> {
        // Same MoE logic as FastMoeMlp
        let router_logits = self.gate.forward_autocast(xs)?;
        // ... routing ...

        // Use switch_mlp experts
        let gate = self.switch_mlp.gate_proj.gather_forward_autocast(...)?;
        let up = self.switch_mlp.up_proj.gather_forward_autocast(...)?;
        let down = self.switch_mlp.down_proj.gather_forward_autocast(...)?;

        // ... combine and return ...
    }
}
```

**Pros**:
- ✅ Clean architecture
- ✅ Mirrors MLX implementation
- ✅ Easier to maintain
- ✅ Can support both formats explicitly

**Cons**:
- ⚠️ More code to write (~200-300 lines)
- ⚠️ Need to update model selection logic

---

## Step-by-Step Implementation (Approach B - Recommended)

### Phase 1: Understanding the Codebase (1-2 days)

**Files to study**:
1. `/tmp/mistral.rs/mistralrs-core/src/models/qwen3_moe.rs` (current implementation)
2. `/tmp/mistral.rs/mistralrs-quant/src/lib.rs` (quantization methods)
3. `/tmp/mlx-lm/mlx_lm/models/qwen3_moe.py` (reference implementation)

**Key concepts to understand**:
- How `FusedExperts` works
- How `ShardedVarBuilder` loads tensors
- How `gather_forward_autocast` routes to experts
- How AFQ (Apple Framework Quantization) works

### Phase 2: Add Detection Logic (1 day)

**File**: `mistralrs-core/src/models/qwen3_moe.rs`

Add function to detect model format:

```rust
fn detect_mlx_switch_mlp(vb: &ShardedVarBuilder) -> bool {
    // Check if first layer has switch_mlp structure
    let switch_path = "model.layers.0.mlp.switch_mlp.gate_proj";
    let direct_path = "model.layers.0.mlp.gate_proj";

    // Implementation depends on VarBuilder API
    // You'll need to add a method to check tensor existence
    vb.contains_tensor(switch_path) && !vb.contains_tensor(direct_path)
}
```

### Phase 3: Implement SwitchMoeMlp Struct (2-3 days)

**File**: `mistralrs-core/src/models/qwen3_moe.rs`

```rust
struct SwitchMoeMlp {
    gate: Arc<dyn QuantMethod>,
    gate_proj: Arc<dyn QuantMethod>,
    up_proj: Arc<dyn QuantMethod>,
    down_proj: Arc<dyn QuantMethod>,
    act: Activation,
    norm_topk_prob: bool,
    num_experts_per_tok: usize,
}

impl SwitchMoeMlp {
    fn new(
        cfg: &Config,
        vb: ShardedVarBuilder,
        layer_device: Device,
        comm: &Arc<mistralrs_quant::Comm>,
    ) -> Result<Self> {
        // Router gate (same as before)
        let gate = mistralrs_quant::linear_no_bias(
            cfg.hidden_size,
            cfg.num_experts,
            &cfg.quantization_config,
            vb.pp("gate").set_device(layer_device),
        )?;

        // Load switch_mlp experts
        let switch_vb = vb.pp("switch_mlp");

        // Load fused expert tensors
        let gate_proj = mistralrs_quant::linear_no_bias(
            cfg.hidden_size,
            cfg.moe_intermediate_size * cfg.num_experts,
            &cfg.quantization_config,
            switch_vb.pp("gate_proj"),
        )?;

        let up_proj = mistralrs_quant::linear_no_bias(
            cfg.hidden_size,
            cfg.moe_intermediate_size * cfg.num_experts,
            &cfg.quantization_config,
            switch_vb.pp("up_proj"),
        )?;

        let down_proj = mistralrs_quant::linear_no_bias(
            cfg.moe_intermediate_size,
            cfg.hidden_size * cfg.num_experts,
            &cfg.quantization_config,
            switch_vb.pp("down_proj"),
        )?;

        Ok(Self {
            gate,
            gate_proj,
            up_proj,
            down_proj,
            act: cfg.hidden_act,
            norm_topk_prob: cfg.norm_topk_prob,
            num_experts_per_tok: cfg.num_experts_per_tok,
        })
    }

    fn forward(&self, xs: &Tensor) -> Result<Tensor> {
        // Copy the forward logic from FastMoeMlp
        // But use self.gate_proj instead of fused_gate_proj

        let original_dtype = xs.dtype();
        let (b_size, seq_len, hidden_dim) = xs.dims3()?;

        // Router logic (same as before)
        let router_logits = self.gate.forward_autocast(xs)?;
        let routing_weights =
            candle_nn::ops::softmax_last_dim(&router_logits.to_dtype(DType::F32)?)?;

        let indices = routing_weights.arg_sort_last_dim(false)?.narrow(
            D::Minus1,
            0,
            self.num_experts_per_tok,
        )?;
        let mut scores = routing_weights.gather(&indices.contiguous()?, D::Minus1)?;

        if self.norm_topk_prob {
            scores = scores.broadcast_div(&scores.sum_keepdim(D::Minus1)?)?;
        }

        // Expert computation using switch_mlp tensors
        let ys = {
            let xs = xs.reshape((b_size, seq_len, 1, 1, hidden_dim))?;

            // Use the switch_mlp projections
            let gate = self.gate_proj.gather_forward_autocast(&xs, &indices)?;
            let up = self.up_proj.gather_forward_autocast(&xs, &indices)?;
            let down = self.down_proj.gather_forward_autocast(
                &(up * gate.apply(&self.act)?)?,
                &indices
            )?;

            down.squeeze(D::Minus2)?
        };

        ys.to_dtype(DType::F32)?
            .broadcast_mul(&scores.unsqueeze(D::Minus1)?)?
            .sum(D::Minus2)?
            .reshape((b_size, seq_len, hidden_dim))?
            .to_dtype(original_dtype)
    }
}
```

### Phase 4: Update DecoderLayer (1 day)

**File**: `mistralrs-core/src/models/qwen3_moe.rs`

Modify the layer enum to support both formats:

```rust
enum MlpType {
    Standard(FastMoeMlp),
    Switch(SwitchMoeMlp),
}

struct Qwen3MoeDecoderLayer {
    self_attn: Attention,
    mlp: MlpType,  // Changed from FastMoeMlp
    input_layernorm: RmsNorm,
    post_attention_layernorm: RmsNorm,
}

impl Qwen3MoeDecoderLayer {
    fn new(
        rotary_emb: Arc<RotaryEmbedding>,
        cfg: &Config,
        vb: ShardedVarBuilder,
        mapper: &dyn DeviceMapper,
        layer_idx: usize,
        loading_isq: bool,
        use_switch_mlp: bool,  // NEW PARAMETER
    ) -> Result<Self> {
        let self_attn = Attention::new(...)?;

        // Choose MLP type based on detection
        let mlp = if use_switch_mlp {
            MlpType::Switch(SwitchMoeMlp::new(cfg, vb.pp("mlp"), layer_device, comm)?)
        } else {
            MlpType::Standard(FastMoeMlp::new(cfg, vb.pp("mlp"), layer_device, comm)?)
        };

        // ... rest of code ...
    }

    fn forward(&mut self, xs: &Tensor, ...) -> Result<Tensor> {
        let residual = xs;
        let xs = self.input_layernorm.forward(xs)?;
        let xs = self.self_attn.forward(&xs, ...)?;
        let xs = (xs + residual)?;

        let residual = &xs;
        let xs = self.post_attention_layernorm.forward(&xs)?;

        // Handle both MLP types
        let xs = match &mut self.mlp {
            MlpType::Standard(mlp) => mlp.forward(&xs)?,
            MlpType::Switch(mlp) => mlp.forward(&xs)?,
        };

        xs + residual
    }
}
```

### Phase 5: Test (2-3 days)

**Test file**: Create `tests/test_qwen3_moe_mlx.rs`

```rust
#[test]
fn test_load_qwen3_30b_mlx() {
    let model_path = "/Users/andrewkaszubski/Models/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit";

    // This should now work!
    let model = Qwen3MoeModel::load(model_path, qwen3_arch)?;

    // Test simple forward pass
    let input = Tensor::zeros((1, 10, 2048), DType::F32, &Device::Metal(0))?;
    let output = model.forward(&input)?;

    assert_eq!(output.shape(), &[1, 10, 2048]);
}

#[test]
fn test_qwen3_moe_inference() {
    // Test actual inference
    let prompt = "Hello, how are you?";
    let response = model.generate(prompt, max_tokens=50)?;

    assert!(!response.is_empty());
}
```

### Phase 6: Submit PR (1 day)

1. Clean up code
2. Add documentation
3. Write commit message:
   ```
   feat: add MLX switch_mlp support for Qwen3 MoE models

   - Add SwitchMoeMlp struct to handle MLX-quantized models
   - Implement switch_mlp tensor path loading
   - Add auto-detection of model format
   - Maintain backward compatibility with standard format

   Fixes loading of Qwen3-30B-A3B MLX-quantized models
   ```
4. Submit PR to `EricLBuehler/mistral.rs`

---

## Testing Your Changes

### Quick Test (Local)

```bash
# Build with your changes
cd /tmp/mistral.rs
cargo build --release --features metal

# Test with your MLX model
./target/release/mistralrs-server \
  --port 8082 \
  plain \
  -m "/Users/andrewkaszubski/Models/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit" \
  -a qwen3

# Should load without "cannot find tensor" error!
```

### Verify It Works

```bash
curl http://localhost:8082/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "default",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 50
  }'
```

---

## Alternative: Quick Hack (If You Just Want It Working)

If you don't want to write clean code and just want it working NOW:

**Edit**: `mistralrs-core/src/models/qwen3_moe.rs:392-402`

Change:
```rust
let FusedExperts {
    fused_gate_proj,
    fused_up_proj,
    fused_down_proj,
} = FusedExperts::new(
    cfg.hidden_size,
    cfg.moe_intermediate_size,
    cfg.num_experts,
    &cfg.quantization_config,
    vb,  // <-- Change this line
)?;
```

To:
```rust
let FusedExperts {
    fused_gate_proj,
    fused_up_proj,
    fused_down_proj,
} = FusedExperts::new(
    cfg.hidden_size,
    cfg.moe_intermediate_size,
    cfg.num_experts,
    &cfg.quantization_config,
    vb.pp("switch_mlp"),  // <-- Add switch_mlp prefix
)?;
```

Rebuild and test. This is a **5-minute hack** but won't work for non-MLX models!

---

## Resources

### Code References

- **mistral.rs Qwen3 MoE**: `/tmp/mistral.rs/mistralrs-core/src/models/qwen3_moe.rs`
- **MLX Qwen3 MoE**: `/tmp/mlx-lm/mlx_lm/models/qwen3_moe.py`
- **MLX SwitchGLU**: `/tmp/mlx-lm/mlx_lm/models/switch_layers.py`
- **Candle Qwen3 MoE PR**: https://github.com/huggingface/candle/pull/2934

### Learning Rust for This

If you're new to Rust:
- [The Rust Book](https://doc.rust-lang.org/book/) - Chapters 1-10
- [Rust by Example](https://doc.rust-lang.org/rust-by-example/) - Pattern matching, traits
- Focus on: structs, traits, Result/Option, pattern matching

### Getting Help

- **mistral.rs Discord**: Ask in #dev-help
- **mistral.rs GitHub Issues**: Search for "Qwen3" or "MoE"
- **Rust subreddit**: r/rust for Rust-specific questions

---

## Conclusion

**Can you add switch_mlp support?** YES!

**Is it hard?** Medium - requires Rust knowledge but the architecture is there.

**Time estimate**:
- **Quick hack**: 5 minutes (just add `pp("switch_mlp")`)
- **Proper implementation**: 1-2 weeks part-time
- **With tests + PR**: 2-4 weeks

**Recommendation**:
1. Try the quick hack first to verify it works
2. If successful, implement the proper solution
3. Submit a PR to help the community!

Your Qwen3-30B MLX model will then work perfectly with mistral.rs! 🎉
