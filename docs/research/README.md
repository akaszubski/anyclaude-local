# Research Documentation

This directory contains research documents that support the anyclaude project's architecture, debugging, and optimization efforts.

## Research Areas

### Performance & Optimization

- **claude-api-performance-analysis.md** - Analysis of Claude API performance patterns and comparison with local backends
- **m3-ultra-performance-potential.md** - M3 Ultra hardware capabilities and performance optimization potential
- **performance-baseline-before-mlx-textgen.md** - Baseline performance metrics before MLX-Textgen optimization

### Architecture & Design

- **STREAMING_BEST_PRACTICES.md** - Best practices for implementing streaming responses and backpressure handling
- **IMPLEMENTATION_RISKS.md** - Risk analysis for architectural decisions and implementation approaches
- **PERFORMANCE-DEBUG.md** - Debugging techniques for performance issues

## Document Index

| Document                                   | Purpose                                        | Status   |
| ------------------------------------------ | ---------------------------------------------- | -------- |
| claude-api-performance-analysis.md         | Analyze Claude API performance characteristics | Complete |
| IMPLEMENTATION_RISKS.md                    | Document architectural risks and mitigation    | Complete |
| STREAMING_BEST_PRACTICES.md                | Best practices for streaming implementation    | Complete |
| m3-ultra-performance-potential.md          | Hardware optimization potential analysis       | Complete |
| PERFORMANCE-DEBUG.md                       | Performance debugging methodology              | Complete |
| performance-baseline-before-mlx-textgen.md | Historical baseline metrics                    | Complete |

## Archived Research

See `docs/archive/` for historical research documents and deprecated migration guides:

- **mlx-tool-calling-research.md** - Original MLX tool calling investigation
- **mlx-integration-findings.md** - MLX integration work findings
- **deprecated-mlx-server/** - Legacy MLX server migration documents
- And many others for reference

## How to Use

1. **For Performance Analysis**: Start with `claude-api-performance-analysis.md`
2. **For Debugging**: Reference `PERFORMANCE-DEBUG.md`
3. **For Implementation**: Review `STREAMING_BEST_PRACTICES.md` and `IMPLEMENTATION_RISKS.md`
4. **For Hardware**: See `m3-ultra-performance-potential.md`

## Contributing

When adding new research documents:

1. Use SCREAMING_SNAKE_CASE naming (e.g., `JWT_AUTHENTICATION_RESEARCH.md`)
2. Include frontmatter with Issue Reference, Research Date, Status
3. Add entries to this README.md
4. Ensure substantial research (2+ best practices or findings)
5. Include actionable implementation notes

See `docs/reference/research-doc-standards.md` for complete standards.

---

**Last Updated**: 2026-01-17
**Maintained by**: doc-master agent
