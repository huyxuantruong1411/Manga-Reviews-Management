"""Deterministic AST-based API Routes Generator.

Inspects backend/main.py and all backend/routers/*.py without importing
or starting the application runtime, producing docs/reference/api-routes.md.
"""

from __future__ import annotations

import argparse
import ast
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional


@dataclass
class RouteEntry:
    method: str
    path: str
    handler: str
    file_path: str
    line: int
    tags: str
    in_schema: bool


def extract_string_literal(node: ast.AST) -> Optional[str]:
    """Extract string value from an AST Constant."""
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def extract_router_meta(tree: ast.Module) -> tuple[str, list[str]]:
    """Extract prefix and tags from APIRouter(...) instantiation."""
    prefix = ""
    tags: list[str] = []

    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            if isinstance(node.value, ast.Call):
                call = node.value
                func_name = ""
                if isinstance(call.func, ast.Name):
                    func_name = call.func.id
                elif isinstance(call.func, ast.Attribute):
                    func_name = call.func.attr

                if func_name == "APIRouter":
                    for kw in call.keywords:
                        if kw.arg == "prefix" and isinstance(kw.value, ast.Constant):
                            prefix = str(kw.value.value).rstrip("/")
                        elif kw.arg == "tags" and isinstance(kw.value, (ast.List, ast.Tuple)):
                            tags = [str(elt.value) for elt in kw.value.elts if isinstance(elt, ast.Constant)]

    return prefix, tags


def inspect_router_file(file_path: Path, base_dir: Path) -> List[RouteEntry]:
    """Parse a single router file and extract all route handlers via AST."""
    routes: List[RouteEntry] = []
    source = file_path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(file_path))

    prefix, default_tags = extract_router_meta(tree)
    rel_path = file_path.relative_to(base_dir).as_posix()

    http_methods = {"get", "post", "put", "delete", "patch", "options", "head"}

    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for decorator in node.decorator_list:
                # Target: @router.get(...) or @app.get(...)
                if isinstance(decorator, ast.Call) and isinstance(decorator.func, ast.Attribute):
                    obj_name = getattr(decorator.func.value, "id", None)
                    attr_name = decorator.func.attr.lower()

                    if obj_name in ("router", "app") and attr_name in http_methods:
                        method = attr_name.upper()

                        # Extract route path
                        route_path = "/"
                        if decorator.args:
                            first_arg = extract_string_literal(decorator.args[0])
                            if first_arg is not None:
                                route_path = first_arg

                        # Combine with prefix
                        if prefix:
                            full_path = f"{prefix}/{route_path.lstrip('/')}".rstrip("/")
                            if not full_path:
                                full_path = "/"
                        else:
                            full_path = route_path if route_path else "/"

                        # Extract tags keyword
                        route_tags = list(default_tags)
                        in_schema = True

                        for kw in decorator.keywords:
                            if kw.arg == "tags" and isinstance(kw.value, (ast.List, ast.Tuple)):
                                route_tags = [str(elt.value) for elt in kw.value.elts if isinstance(elt, ast.Constant)]
                            elif kw.arg == "include_in_schema" and isinstance(kw.value, ast.Constant):
                                in_schema = bool(kw.value.value)

                        routes.append(
                            RouteEntry(
                                method=method,
                                path=full_path,
                                handler=node.name,
                                file_path=rel_path,
                                line=node.lineno,
                                tags=", ".join(route_tags) if route_tags else "-",
                                in_schema=in_schema,
                            )
                        )

    return routes


def collect_all_routes(repo_root: Path) -> List[RouteEntry]:
    """Scan backend/main.py and backend/routers/*.py for all routes."""
    backend_dir = repo_root / "backend"
    routers_dir = backend_dir / "routers"

    all_routes: List[RouteEntry] = []

    # 1. Main app direct endpoints (e.g. /health)
    main_file = backend_dir / "main.py"
    if main_file.exists():
        all_routes.extend(inspect_router_file(main_file, repo_root))

    # 2. All routers in backend/routers/
    if routers_dir.exists():
        for py_file in sorted(routers_dir.glob("*.py")):
            if py_file.name == "__init__.py":
                continue
            all_routes.extend(inspect_router_file(py_file, repo_root))

    # Stable deterministic sorting: Path first, then Method
    all_routes.sort(key=lambda r: (r.path, r.method, r.handler))
    return all_routes


def render_markdown(routes: List[RouteEntry]) -> str:
    """Render routes table to GitHub-flavored Markdown."""
    lines: List[str] = [
        "# API Routes Reference",
        "",
        "> **Generated Statically**: Do not edit manually.",
        "> Run `python scripts/generate_api_routes.py` to regenerate.",
        "",
        f"Total Endpoints Discovered: **{len(routes)}**",
        "",
        "| Method | Path | Handler | Tags | Source File | In Schema |",
        "|:---|:---|:---|:---|:---|:---:|",
    ]

    for r in routes:
        file_link = f"[`{Path(r.file_path).name}:{r.line}`](../../{r.file_path}#L{r.line})"
        schema_badge = "Yes" if r.in_schema else "No (Alias)"
        lines.append(f"| `{r.method}` | `{r.path}` | `{r.handler}` | {r.tags} | {file_link} | {schema_badge} |")

    lines.append("")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Generate API routes reference markdown")
    parser.add_argument(
        "--check",
        action="store_true",
        help="Check whether docs/reference/api-routes.md is up to date without modifying",
    )
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    target_file = repo_root / "docs" / "reference" / "api-routes.md"

    routes = collect_all_routes(repo_root)
    generated_content = render_markdown(routes)

    if args.check:
        if not target_file.exists():
            print(f"Error: {target_file} does not exist. Run without --check to generate.", file=sys.stderr)
            sys.exit(1)

        existing_content = target_file.read_text(encoding="utf-8")
        if existing_content.strip() != generated_content.strip():
            print("Error: docs/reference/api-routes.md is out of sync with backend routes!", file=sys.stderr)
            print("Run 'python scripts/generate_api_routes.py' to update it.", file=sys.stderr)
            sys.exit(1)

        print(f"OK: {target_file} is up to date ({len(routes)} routes).")
        sys.exit(0)

    # Write target file
    target_file.parent.mkdir(parents=True, exist_ok=True)
    target_file.write_text(generated_content, encoding="utf-8")
    print(f"Generated {target_file} with {len(routes)} endpoints.")


if __name__ == "__main__":
    main()
