---
name: architecture-guard
description: Enforce layer boundaries between Controllers, Services, and Data Access with strict DTO validation.
---

# Architecture Guard

See full documentation at [.antigravity/skills/architecture-guard.md](file:///d:/Projects/Manga/Manga-Reviews-Management/.antigravity/skills/architecture-guard.md).

## Core Rules:
1. **Controller/Router**: Only handle HTTP request/response, parse parameters, call Service, return DTO. No database queries or heavy algorithms inside controllers.
2. **Service**: Dedicated home for all business logic, orchestration, and domain rules.
3. **Validation DTO**: Strict Pydantic v2 schemas (`BaseModel` + `Field`) for all inputs.
