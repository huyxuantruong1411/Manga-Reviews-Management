---
trigger: always_on
description: Code Knowledge Graph lookup and Impact Analysis governance rules
---

# Code Knowledge Graph & Refactoring Governance

This repository utilizes an AST-based Code Knowledge Graph (**CodeGraph**) to maintain high code intelligence across both Python FastAPI backend and TypeScript/React frontend.

All agent interactions must adhere to the following governance directives:

1. **Graph-First Exploration**:
   - Always query the Code Knowledge Graph / Dependency Tree (`codegraph_explore` MCP tool, or `codegraph explore`/`node`) before performing broad `grep` searches or hypothesizing context.
   - Use the graph to pinpoint exact symbol declarations, callers, callees, and dependencies.

2. **Mandatory Impact Analysis Before Refactoring**:
   - Before renaming any function, refactoring modules, or modifying any interface/Pydantic schema, you **MUST** run an impact analysis using `codegraph impact <symbol>` or callers/callees tracing.
   - Verify every affected Router, Service, Model, and Test file before making code changes.

3. **Restrained Indexing**:
   - Only execute a full project re-index (`codegraph index`) during major architectural overhauls or structural reorganizations.
   - For routine small edits, use incremental sync (`codegraph sync`) rather than rebuilding the full graph.
