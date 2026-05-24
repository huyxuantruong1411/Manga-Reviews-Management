
# PROJECT DUMP

Generated: 2026-05-16 21:42:35.419624
Root: D:\TDMU\2025-2026\HKII_2025-2026\KTTKPM\coursework\manga_frontend


# PROJECT STATS

```json
{
  "total_files": 74,
  "total_dirs": 31,
  "total_size": "376.34 KB",
  "extensions": {
    ".tsx": 34,
    ".ts": 31,
    ".json": 2,
    ".md": 2,
    ".css": 2,
    ".local": 1,
    "": 1,
    ".py": 1
  }
}
```



# PROJECT TREE

```txt
D:\TDMU\2025-2026\HKII_2025-2026\KTTKPM\coursework\manga_frontend
├── .env.local
├── .gitignore
├── dump.py
├── next-env.d.ts
├── package.json
├── public/
├── ref/
│   ├── DESIGN.md
│   └── Nhom17_bai5.md
├── src/
│   ├── app/
│   │   ├── admin/
│   │   │   └── page.tsx
│   │   ├── auth/
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   └── register/
│   │   │       └── page.tsx
│   │   ├── chat/
│   │   │   └── page.tsx
│   │   ├── creator/
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   ├── explore/
│   │   │   └── page.tsx
│   │   ├── globals.css
│   │   ├── latest/
│   │   │   └── page.tsx
│   │   ├── layout.tsx
│   │   ├── lists/
│   │   │   ├── [id]/
│   │   │   │   └── page.tsx
│   │   │   └── page.tsx
│   │   ├── manga/
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   ├── page.tsx
│   │   ├── profile/
│   │   │   └── page.tsx
│   │   ├── providers.tsx
│   │   └── read/
│   │       └── [mangaId]/
│   │           └── [chapterId]/
│   │               └── page.tsx
│   ├── components/
│   │   ├── features/
│   │   │   ├── ChapterList.tsx
│   │   │   ├── CommentsSection.tsx
│   │   │   ├── ListPicker.tsx
│   │   │   ├── MangaCard.tsx
│   │   │   ├── MangaCover.tsx
│   │   │   ├── MangaGrid.tsx
│   │   │   ├── RatingPanel.tsx
│   │   │   └── TranslatedImage.tsx
│   │   ├── layout/
│   │   │   └── AppShell.tsx
│   │   └── ui/
│   │       ├── Badge.tsx
│   │       ├── Button.tsx
│   │       ├── EmptyState.tsx
│   │       ├── Input.tsx
│   │       ├── Pagination.tsx
│   │       ├── SectionHeader.tsx
│   │       ├── Select.tsx
│   │       ├── Skeleton.tsx
│   │       ├── Surface.tsx
│   │       └── Toast.tsx
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useMangaQueries.ts
│   │   └── useReader.ts
│   ├── lib/
│   │   └── utils.ts
│   ├── services/
│   │   ├── admin.service.ts
│   │   ├── analytics.service.ts
│   │   ├── api.ts
│   │   ├── auth.service.ts
│   │   ├── chapter.service.ts
│   │   ├── chat.service.ts
│   │   ├── comment.service.ts
│   │   ├── cover.service.ts
│   │   ├── creator.service.ts
│   │   ├── history.service.ts
│   │   ├── list.service.ts
│   │   ├── manga.service.ts
│   │   ├── rating.service.ts
│   │   ├── tag.service.ts
│   │   └── translate.service.ts
│   ├── store/
│   │   └── useAppStore.ts
│   ├── styles/
│   │   └── globals.css
│   └── types/
│       ├── admin.ts
│       ├── chapter.ts
│       ├── comment.ts
│       ├── common.ts
│       ├── history.ts
│       ├── list.ts
│       ├── manga.ts
│       ├── rating.ts
│       └── user.ts
├── tailwind.config.ts
└── tsconfig.json
```



# IMPORTANT FILES


## FILE: package.json

```json
{
  "name": "manga_frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --webpack --hostname 0.0.0.0",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@tanstack/react-query": "5.100.9",
    "axios": "1.16.0",
    "clsx": "2.1.1",
    "lucide-react": "1.14.0",
    "next": "16.2.6",
    "react": "19.2.6",
    "react-dom": "19.2.6",
    "react-markdown": "^10.1.0",
    "recharts": "^3.8.1",
    "remark-gfm": "^4.0.1",
    "tailwind-merge": "3.5.0",
    "zustand": "5.0.13"
  },
  "devDependencies": {
    "@types/node": "25.6.2",
    "@types/react": "19.2.14",
    "@types/react-dom": "19.2.3",
    "autoprefixer": "10.5.0",
    "postcss": "8.5.14",
    "tailwindcss": "3.4.19",
    "typescript": "6.0.3"
  }
}
```


## FILE: tailwind.config.ts

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/hooks/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        "surface-3": "var(--surface-3)",
        tx: "var(--text)",
        "tx-muted": "var(--text-muted)",
        bd: "var(--border)",
        accent: "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        "accent-active": "var(--accent-active)",
        "accent-bg": "var(--accent-bg)",
        "accent-bg-strong": "var(--accent-bg-strong)",
        brand: {
          orange: "#DA7500",
          orangeHover: "#EB8C1F",
          orangeActive: "#C56500",
          coral: "#ff6740",
        },
        pal: {
          purple: "var(--purple)",
          cyan: "var(--cyan)",
          sky: "var(--sky)",
          green: "var(--green)",
          amber: "var(--amber)",
          red: "var(--red)",
          blue: "var(--blue)",
        },
        /* legacy compat */
        neutral: {
          charcoal: "#242424",
          dark: "#222222",
          line: "var(--border)",
          altLine: "var(--border)",
          soft: "var(--surface-2)",
        },
        semantic: {
          error: "var(--red)",
          warning: "var(--amber)",
        },
      },
      fontFamily: {
        heading: ["var(--font-heading)"],
        body: ["var(--font-body)"],
      },
      boxShadow: {
        card: "var(--shadow-card)",
        "card-hover": "var(--shadow-card-hover)",
        floating: "var(--shadow-floating)",
        manga: "var(--shadow-card)",
        "manga-hover": "var(--shadow-card-hover)",
      },
      borderRadius: {
        def: "var(--radius)",
        sm: "var(--radius-sm)",
        lg: "var(--radius-lg)",
      },
      spacing: {
        18: "4.5rem",
        30: "7.5rem",
      },
      maxWidth: {
        content: "1440px",
        readable: "860px",
      },
    },
  },
  plugins: [],
};

export default config;

```


## FILE: tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": [
      "dom",
      "dom.iterable",
      "esnext"
    ],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": [
        "./src/*"
      ]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts"
  ],
  "exclude": [
    "node_modules"
  ]
}

```


# SOURCE FILES


# FILE: .env.local

- SIZE: 96.00 B
- SHA256: 51fcd71bbeee86c2063c6f8ace772fc6ae231d81a8cff15f8b6318e334a36be6

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws

```



# FILE: .gitignore

- SIZE: 56.00 B
- SHA256: 949b87d9b7c00969b89b145b8c6c85bb8ec6e44ec5d9ccf322cb8933515fa6f8

```
node_modules/
.next/
out/
dist/
build/
*.log
.env.local

```



# FILE: dump.py

- SIZE: 14.82 KB
- SHA256: ade5121479e3b9b57dc16708c5fbba4d73c50e7c7f0203ea914cf8a9e9a011aa

```python
import os
import json
import hashlib
from datetime import datetime

# =========================================================
# CONFIG
# =========================================================

# Chọn:
# "txt" hoặc "md"
OUTPUT_FORMAT = "md"

OUTPUT_FILE = f"project_dump.{OUTPUT_FORMAT}"

MAX_FILE_SIZE_MB = 2

MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024

# =========================================================
# IGNORE DIRECTORIES
# =========================================================

IGNORE_DIRS = {
    "node_modules",
    ".next",
    "dist",
    "build",
    ".git",
    ".idea",
    ".vscode",
    "__pycache__",
    ".pytest_cache",
    ".turbo",
    ".vercel",
    ".cache",
    "coverage",
    "logs",
    "tmp",
    "temp",
    "vendor",
    "bin",
    "obj",
    "out"
}

# =========================================================
# IGNORE FILES
# =========================================================

IGNORE_FILES = {
    OUTPUT_FILE.lower(),
    ".ds_store",
    "thumbs.db",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock"
}

# =========================================================
# IGNORE EXTENSIONS
# =========================================================

IGNORE_EXTENSIONS = {
    # Images
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".svg",
    ".ico",

    # Video
    ".mp4",
    ".mov",
    ".avi",
    ".mkv",

    # Audio
    ".mp3",
    ".wav",

    # Archives
    ".zip",
    ".rar",
    ".7z",
    ".tar",
    ".gz",

    # Binary
    ".exe",
    ".dll",
    ".so",
    ".bin",
    ".pyc",
    ".class",

    # Documents
    ".pdf",
    ".docx",
    ".pptx",
    ".xlsx",

    # Database
    ".db",
    ".sqlite",
    ".sqlite3",

    # Logs
    ".log"
}

# =========================================================
# ALLOWED SOURCE CODE EXTENSIONS
# =========================================================

ALLOWED_CODE_EXTENSIONS = {
    ".ts",
    ".tsx",
    ".js",
    ".jsx",

    ".json",

    ".css",
    ".scss",
    ".sass",
    ".less",

    ".html",

    ".md",

    ".py",

    ".yml",
    ".yaml",

    ".env",

    ".sql",

    ".sh",
    ".bash",

    ".toml",

    ".graphql",

    ".prisma"
}

# =========================================================
# IMPORTANT FILES
# =========================================================

IMPORTANT_FILES = {
    "package.json",
    "tsconfig.json",
    "next.config.js",
    "next.config.ts",
    "vite.config.ts",
    "vite.config.js",
    "tailwind.config.js",
    "tailwind.config.ts",
    ".env.example",
    ".env",
    "docker-compose.yml",
    "Dockerfile",
    "README.md"
}

# =========================================================
# HELPERS
# =========================================================

def should_ignore_dir(dirname: str) -> bool:
    return dirname.lower() in IGNORE_DIRS


def should_ignore_file(filename: str) -> bool:

    lower = filename.lower()

    # Ignore exact filename
    if lower in IGNORE_FILES:
        return True

    name, ext = os.path.splitext(lower)

    # Ignore binary/media extensions
    if ext in IGNORE_EXTENSIONS:
        return True

    # Nếu file KHÔNG nằm trong allowed extensions
    # thì bỏ qua
    if ext not in ALLOWED_CODE_EXTENSIONS:

        # Một số file đặc biệt không có extension
        special_files = {
            "dockerfile",
            ".env",
            ".env.local",
            ".env.example",
            ".gitignore",
            ".npmrc",
            ".prettierrc",
            ".eslintrc"
        }

        if lower not in special_files:
            return True

    return False


def get_file_hash(filepath: str) -> str:
    """
    SHA256 hash file.
    """

    sha256 = hashlib.sha256()

    try:

        with open(filepath, "rb") as f:

            for chunk in iter(lambda: f.read(8192), b""):
                sha256.update(chunk)

        return sha256.hexdigest()

    except Exception:
        return "ERROR"


def format_size(size_bytes: int) -> str:

    for unit in ["B", "KB", "MB", "GB"]:

        if size_bytes < 1024:
            return f"{size_bytes:.2f} {unit}"

        size_bytes /= 1024

    return f"{size_bytes:.2f} TB"


def write_section(out, title: str):

    if OUTPUT_FORMAT == "md":

        out.write(f"\n# {title}\n\n")

    else:

        out.write(
            f"\n{'=' * 80}\n"
        )

        out.write(title + "\n")

        out.write(
            f"{'=' * 80}\n\n"
        )


def get_markdown_language(filename: str) -> str:

    _, ext = os.path.splitext(filename)

    ext = ext.lower()

    lang_map = {
        ".py": "python",
        ".ts": "typescript",
        ".tsx": "tsx",
        ".js": "javascript",
        ".jsx": "jsx",
        ".json": "json",
        ".css": "css",
        ".scss": "scss",
        ".sass": "scss",
        ".less": "css",
        ".md": "markdown",
        ".yml": "yaml",
        ".yaml": "yaml",
        ".html": "html",
        ".sql": "sql",
        ".graphql": "graphql",
        ".sh": "bash",
        ".toml": "toml"
    }

    return lang_map.get(ext, "")

# =========================================================
# BUILD ASCII TREE
# =========================================================

def build_ascii_tree(root_dir: str, prefix: str = "") -> str:

    entries = []

    try:

        with os.scandir(root_dir) as scan:

            for entry in sorted(scan, key=lambda e: e.name.lower()):

                if entry.is_dir():

                    if should_ignore_dir(entry.name):
                        continue

                    entries.append(entry)

                elif entry.is_file():

                    if should_ignore_file(entry.name):
                        continue

                    entries.append(entry)

    except Exception:
        return ""

    lines = []

    for index, entry in enumerate(entries):

        connector = "└── " if index == len(entries) - 1 else "├── "

        name = entry.name

        if entry.is_dir():
            name += "/"

        lines.append(prefix + connector + name)

        if entry.is_dir():

            extension = (
                "    "
                if index == len(entries) - 1
                else "│   "
            )

            subtree = build_ascii_tree(
                entry.path,
                prefix + extension
            )

            if subtree:
                lines.extend(subtree.splitlines())

    return "\n".join(lines)

# =========================================================
# PROJECT STATS
# =========================================================

def collect_stats(root_dir: str):

    total_files = 0
    total_dirs = 0
    total_size = 0

    extension_map = {}

    for dirpath, dirnames, filenames in os.walk(root_dir):

        dirnames[:] = [
            d for d in dirnames
            if not should_ignore_dir(d)
        ]

        total_dirs += len(dirnames)

        for filename in filenames:

            if should_ignore_file(filename):
                continue

            total_files += 1

            filepath = os.path.join(dirpath, filename)

            try:

                size = os.path.getsize(filepath)

                total_size += size

                _, ext = os.path.splitext(filename)

                ext = ext.lower()

                extension_map[ext] = (
                    extension_map.get(ext, 0) + 1
                )

            except Exception:
                pass

    return {
        "total_files": total_files,
        "total_dirs": total_dirs,
        "total_size": format_size(total_size),
        "extensions": dict(
            sorted(
                extension_map.items(),
                key=lambda x: x[1],
                reverse=True
            )
        )
    }

# =========================================================
# READ FILE CONTENT
# =========================================================

def read_file_content(filepath: str) -> str:

    try:

        size = os.path.getsize(filepath)

        if size > MAX_FILE_SIZE:

            return (
                f"[SKIPPED: File too large "
                f"({format_size(size)})]"
            )

        with open(
            filepath,
            "r",
            encoding="utf-8"
        ) as f:

            return f.read()

    except UnicodeDecodeError:
        return "[SKIPPED: Binary or non UTF-8 file]"

    except Exception as e:
        return f"[ERROR READING FILE: {str(e)}]"

# =========================================================
# WRITE FILE CONTENT
# =========================================================

def write_file_content(out, filename: str, content: str):

    if OUTPUT_FORMAT == "md":

        lang = get_markdown_language(filename)

        out.write(f"```{lang}\n")

        out.write(content)

        out.write("\n```\n")

    else:

        out.write(content)

# =========================================================
# DUMP PROJECT
# =========================================================

def dump_project(root_dir: str):

    stats = collect_stats(root_dir)

    with open(
        OUTPUT_FILE,
        "w",
        encoding="utf-8"
    ) as out:

        # =================================================
        # HEADER
        # =================================================

        write_section(out, "PROJECT DUMP")

        out.write(f"Generated: {datetime.now()}\n")
        out.write(f"Root: {root_dir}\n\n")

        # =================================================
        # STATS
        # =================================================

        write_section(out, "PROJECT STATS")

        if OUTPUT_FORMAT == "md":

            out.write("```json\n")

            out.write(json.dumps(
                stats,
                indent=2,
                ensure_ascii=False
            ))

            out.write("\n```\n")

        else:

            out.write(json.dumps(
                stats,
                indent=2,
                ensure_ascii=False
            ))

        out.write("\n\n")

        # =================================================
        # TREE
        # =================================================

        write_section(out, "PROJECT TREE")

        if OUTPUT_FORMAT == "md":

            out.write("```txt\n")

            out.write(root_dir + "\n")

            out.write(
                build_ascii_tree(root_dir)
            )

            out.write("\n```\n")

        else:

            out.write(root_dir + "\n")

            out.write(
                build_ascii_tree(root_dir)
            )

        out.write("\n\n")

        # =================================================
        # IMPORTANT FILES
        # =================================================

        write_section(out, "IMPORTANT FILES")

        for dirpath, dirnames, filenames in os.walk(root_dir):

            dirnames[:] = [
                d for d in dirnames
                if not should_ignore_dir(d)
            ]

            for filename in filenames:

                if filename not in IMPORTANT_FILES:
                    continue

                filepath = os.path.join(
                    dirpath,
                    filename
                )

                relative_path = os.path.relpath(
                    filepath,
                    root_dir
                )

                content = read_file_content(filepath)

                if OUTPUT_FORMAT == "md":

                    out.write(
                        f"\n## FILE: {relative_path}\n\n"
                    )

                else:

                    out.write(
                        f"\n{'-' * 80}\n"
                    )

                    out.write(
                        f"FILE: {relative_path}\n"
                    )

                    out.write(
                        f"{'-' * 80}\n"
                    )

                write_file_content(
                    out,
                    filename,
                    content
                )

                out.write("\n")

        # =================================================
        # SOURCE FILES
        # =================================================

        write_section(out, "SOURCE FILES")

        for dirpath, dirnames, filenames in os.walk(root_dir):

            dirnames[:] = [
                d for d in dirnames
                if not should_ignore_dir(d)
            ]

            for filename in sorted(filenames):

                if should_ignore_file(filename):
                    continue

                filepath = os.path.join(
                    dirpath,
                    filename
                )

                try:
                    size = os.path.getsize(filepath)

                except Exception:
                    size = 0

                relative_path = os.path.relpath(
                    filepath,
                    root_dir
                )

                if OUTPUT_FORMAT == "md":

                    out.write(
                        f"\n# FILE: {relative_path}\n\n"
                    )

                    out.write(
                        f"- SIZE: {format_size(size)}\n"
                    )

                    out.write(
                        f"- SHA256: "
                        f"{get_file_hash(filepath)}\n\n"
                    )

                else:

                    out.write(
                        f"\n{'=' * 80}\n"
                    )

                    out.write(
                        f"FILE: {relative_path}\n"
                    )

                    out.write(
                        f"SIZE: {format_size(size)}\n"
                    )

                    out.write(
                        f"SHA256: "
                        f"{get_file_hash(filepath)}\n"
                    )

                    out.write(
                        f"{'=' * 80}\n\n"
                    )

                content = read_file_content(filepath)

                write_file_content(
                    out,
                    filename,
                    content
                )

                out.write("\n\n")

    print(f"\n✅ Dump completed: {OUTPUT_FILE}")

# =========================================================
# MAIN
# =========================================================

if __name__ == "__main__":

    current_dir = os.getcwd()

    dump_project(current_dir)
```



# FILE: next-env.d.ts

- SIZE: 251.00 B
- SHA256: 7ad303e40d4fddf44f156129e397511953a71481c5cfd86b1862649aaaf240cc

```typescript
/// <reference types="next" />
/// <reference types="next/image-types/global" />
import "./.next/dev/types/routes.d.ts";

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.

```



# FILE: package.json

- SIZE: 814.00 B
- SHA256: 0a6c37c903daa40a7de46877284a9a43544243f97048d284bade87e79033ca61

```json
{
  "name": "manga_frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --webpack --hostname 0.0.0.0",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@tanstack/react-query": "5.100.9",
    "axios": "1.16.0",
    "clsx": "2.1.1",
    "lucide-react": "1.14.0",
    "next": "16.2.6",
    "react": "19.2.6",
    "react-dom": "19.2.6",
    "react-markdown": "^10.1.0",
    "recharts": "^3.8.1",
    "remark-gfm": "^4.0.1",
    "tailwind-merge": "3.5.0",
    "zustand": "5.0.13"
  },
  "devDependencies": {
    "@types/node": "25.6.2",
    "@types/react": "19.2.14",
    "@types/react-dom": "19.2.3",
    "autoprefixer": "10.5.0",
    "postcss": "8.5.14",
    "tailwindcss": "3.4.19",
    "typescript": "6.0.3"
  }
}
```



# FILE: tailwind.config.ts

- SIZE: 2.09 KB
- SHA256: adda670e32b63a66fcca4cfcaac389c6d2f867049cfec9ca24c4361794e6a9c4

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/hooks/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        "surface-3": "var(--surface-3)",
        tx: "var(--text)",
        "tx-muted": "var(--text-muted)",
        bd: "var(--border)",
        accent: "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        "accent-active": "var(--accent-active)",
        "accent-bg": "var(--accent-bg)",
        "accent-bg-strong": "var(--accent-bg-strong)",
        brand: {
          orange: "#DA7500",
          orangeHover: "#EB8C1F",
          orangeActive: "#C56500",
          coral: "#ff6740",
        },
        pal: {
          purple: "var(--purple)",
          cyan: "var(--cyan)",
          sky: "var(--sky)",
          green: "var(--green)",
          amber: "var(--amber)",
          red: "var(--red)",
          blue: "var(--blue)",
        },
        /* legacy compat */
        neutral: {
          charcoal: "#242424",
          dark: "#222222",
          line: "var(--border)",
          altLine: "var(--border)",
          soft: "var(--surface-2)",
        },
        semantic: {
          error: "var(--red)",
          warning: "var(--amber)",
        },
      },
      fontFamily: {
        heading: ["var(--font-heading)"],
        body: ["var(--font-body)"],
      },
      boxShadow: {
        card: "var(--shadow-card)",
        "card-hover": "var(--shadow-card-hover)",
        floating: "var(--shadow-floating)",
        manga: "var(--shadow-card)",
        "manga-hover": "var(--shadow-card-hover)",
      },
      borderRadius: {
        def: "var(--radius)",
        sm: "var(--radius-sm)",
        lg: "var(--radius-lg)",
      },
      spacing: {
        18: "4.5rem",
        30: "7.5rem",
      },
      maxWidth: {
        content: "1440px",
        readable: "860px",
      },
    },
  },
  plugins: [],
};

export default config;

```



# FILE: tsconfig.json

- SIZE: 704.00 B
- SHA256: 032ef215e32ec422b33f4074598d6a155eaeedf26a4bfb167562ef5b417d1423

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": [
      "dom",
      "dom.iterable",
      "esnext"
    ],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": [
        "./src/*"
      ]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts"
  ],
  "exclude": [
    "node_modules"
  ]
}

```



# FILE: ref\DESIGN.md

- SIZE: 17.07 KB
- SHA256: 7fdc3592a757d4d52d90c3596cd3cfba88a2729551623eaca0a99dcacd9d2201

```markdown
# Design System Inspired by MangaDex

## 1. Visual Theme & Atmosphere

MangaDex embodies a vibrant, community-driven reading platform centered on manga and comics discovery. The design balances playful energy with professional accessibility, using warm orange accents against a clean, neutral canvas. The visual language feels approachable and modern, with generous whitespace supporting content hierarchy. Anime-inspired imagery is complemented by a calm, light interface that keeps focus on the rich manga artwork. The atmosphere is welcoming to both casual readers and dedicated fans, with deliberate use of color to guide attention to key actions and curated content collections.

**Key Characteristics**
- Warm accent colors (orange, coral) for call-to-action elements and editorial highlights
- Clean, minimal neutral palette anchoring the interface
- Generous spacing supporting scanability and visual breathing room
- Rounded, playful button treatments balancing approachability with professionalism
- Subtle shadows for depth without visual heaviness
- Vibrant secondary accent colors (purple, cyan, blue) for categorical distinction
- Manga artwork as primary visual anchor with supporting UI elements staying understated

## 2. Color Palette & Roles

### Primary
- **Brand Orange** (`#DA7500`): Primary call-to-action buttons, active navigation states, key editorial highlights
- **Coral** (`#FF6740`): Supporting accent for featured content and hover states

### Accent Colors
- **Purple** (`#C084FC`): Genre or tag distinction for supernatural/fantasy content
- **Cyan** (`#05AAF0`): Secondary accent for alternate content categories
- **Sky Blue** (`#1199FF`): Accent for complementary UI elements and interactive highlights

### Interactive
- **Amber** (`#FB923C`): Alternative action states and warning-adjacent interactions
- **Transparent Dark** (`#0009`): Overlay for modals and semi-transparent backgrounds

### Neutral Scale
- **Charcoal** (`#242424`): Primary text color for body content and headings
- **Dark Gray** (`#222222`): Alternative text for contrast-sensitive contexts
- **True Black** (`#000000`): Maximum contrast text and strong emphasis elements
- **Light Gray** (`#F0F1F2`): Secondary background tint for content sections
- **Border Gray** (`#E5E7EB`): Borders, dividers, and subtle section separation
- **Alternate Border** (`#E0E4E6`): Alternative border tone for specific contexts
- **White** (`#FFFFFF`): Primary background, card surfaces, and content areas

### Semantic / Status
- **Error Red** (`#EF4444`): Error states, validation failures, critical alerts
- **Warning Yellow** (`#FACC15`): Warning states, non-critical alerts, caution messaging

### Shadow Colors
- **Transparent Black** (`#0000`): Used frequently for overlay and shadow construction

## 3. Typography Rules

### Font Family
- **Primary:** Spartan (sans-serif)
- **Secondary:** Poppins (sans-serif)
- **Fallback stack:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif`

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|-----------------|-------|
| Display / H1 | Spartan | 32px | 700 | 40px | -0.02em | Page hero titles, large section headers |
| Heading / H2 | Spartan | 24px | 600 | 32px | 0em | Section headlines, content cards |
| Subheading / H3 | Poppins | 14px | 700 | 20px | 0em | Component headings, list titles |
| Heading Label / H6 | Poppins | 16px | 700 | 24px | 0em | Small section labels, tag headers |
| Body Text | Poppins | 12px | 600 | 16px | 0em | Main content, descriptions, card copy |
| Body Alt | Poppins | 16px | 500 | 24px | 0em | Secondary body, larger reading text |
| Link / Interactive | Poppins | 16px | 400 | 24px | 0em | Navigation links, interactive text |
| List Item | Poppins | 14px | 400 | 20px | 0em | Bulleted lists, enumerated items |
| Metadata | Poppins | 12px | 400 | 16px | 0em | Timestamps, author info, captions |

### Principles
- Typography establishes clear visual hierarchy through size and weight variation rather than color alone
- Poppins is the workhorse font for interface elements, maintaining consistency across interactive states
- Spartan headlines provide visual distinction and editorial emphasis for key content
- Line heights are generous to support readability on varied screen sizes
- Small text (12px) is reserved for secondary information; body text never drops below this threshold
- Font weights cluster at 400, 500, 600, and 700 to create distinct perceptual levels
- All interactive text maintains minimum 14px size for accessibility

## 4. Component Stylings

### Buttons

#### Primary Button
- **Background:** `#DA7500`
- **Text Color:** `#FFFFFF`
- **Font:** Poppins, 16px, weight 400
- **Padding:** `0px 12px`
- **Height:** `40px`
- **Border Radius:** `8px`
- **Border:** `0px solid transparent`
- **Box Shadow:** `none`
- **Line Height:** `24px`
- **Hover State:** Background brightens to `#EB8C1F`
- **Active State:** Background darkens to `#C56500`
- **Disabled State:** Background becomes `#D3D3D3`, text `#808080`

#### Secondary Button (Ghost)
- **Background:** `transparent`
- **Text Color:** `#242424`
- **Font:** Poppins, 16px, weight 400
- **Padding:** `4px 0px`
- **Height:** `40px`
- **Border Radius:** `9999px`
- **Border:** `0px solid transparent`
- **Box Shadow:** `none`
- **Line Height:** `24px`
- **Hover State:** Background becomes `#F0F1F2`
- **Active State:** Text color darkens to `#000000`

#### Icon Button (Light)
- **Background:** `#F0F1F2`
- **Text Color:** `#242424`
- **Font:** Poppins, 16px, weight 400
- **Padding:** `0px`
- **Height:** `40px`
- **Width:** `40px`
- **Border Radius:** `9999px`
- **Border:** `0px solid transparent`
- **Box Shadow:** `none`
- **Hover State:** Background becomes `#E5E7EB`
- **Active State:** Background becomes `#D3D3D3`

#### Icon Button (Ghost)
- **Background:** `transparent`
- **Text Color:** `#242424`
- **Font:** Poppins, 16px, weight 400
- **Padding:** `4px 0px`
- **Height:** `40px`
- **Width:** `40px`
- **Border Radius:** `9999px`
- **Border:** `0px solid transparent`
- **Box Shadow:** `none`
- **Hover State:** Background becomes `rgba(229, 231, 235, 0.5)`

### Cards & Containers

#### Content Card
- **Background:** `#FFFFFF`
- **Text Color:** `#242424`
- **Font:** Poppins, 16px, weight 400
- **Padding:** `0px`
- **Height:** `80px`
- **Width:** `532px`
- **Border Radius:** `0px`
- **Border:** `0px solid transparent`
- **Box Shadow:** `rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px -1px`
- **Line Height:** `24px`
- **Hover State:** Box shadow increases to `rgba(0, 0, 0, 0.1) 0px 10px 15px -3px`
- **Margin Bottom:** `16px`

#### Featured Section Card
- **Background:** `#F0F1F2`
- **Text Color:** `#242424`
- **Font:** Poppins, 16px, weight 400
- **Padding:** `24px`
- **Border Radius:** `0px`
- **Border:** `1px solid #E5E7EB`
- **Box Shadow:** `none`

#### Overlay Container (Dark)
- **Background:** `rgba(0, 0, 0, 0.6)`
- **Border Radius:** `0px`
- **Backdrop Filter:** `blur(4px)` (optional)

### Inputs & Forms

#### Text Input
- **Background:** `#FFFFFF`
- **Text Color:** `#242424`
- **Font:** Poppins, 16px, weight 400
- **Padding:** `0px 12px`
- **Height:** `40px`
- **Width:** `250px`
- **Border Radius:** `0px`
- **Border:** `1px solid #C1C1C1`
- **Box Shadow:** `none`
- **Line Height:** `24px`
- **Focus State:** Border color becomes `#DA7500`, box shadow `0px 0px 0px 3px rgba(218, 117, 0, 0.1)`
- **Error State:** Border becomes `#EF4444`
- **Placeholder Color:** `#999999`

#### Search Input (Large)
- **Background:** `#FFFFFF`
- **Text Color:** `#242424`
- **Font:** Poppins, 16px, weight 400
- **Padding:** `12px 16px`
- **Height:** `44px`
- **Border Radius:** `4px`
- **Border:** `1px solid #E5E7EB`
- **Box Shadow:** `rgba(0, 0, 0, 0.05) 0px 1px 2px 0px`

### Navigation

#### Primary Navigation Item
- **Background:** `transparent`
- **Text Color:** `#242424`
- **Font:** Poppins, 14px, weight 400
- **Padding:** `8px 16px`
- **Height:** `auto`
- **Border Radius:** `4px`
- **Border:** `0px solid transparent`
- **Active State:** Background `#DA7500`, text color `#FFFFFF`
- **Hover State:** Background `#F0F1F2`

#### Sidebar Navigation
- **Background:** `#FFFFFF`
- **Border Right:** `1px solid #E5E7EB`
- **Padding:** `16px 0px`

#### Navigation Badge (New)
- **Background:** `#FF6740`
- **Text Color:** `#FFFFFF`
- **Font:** Poppins, 12px, weight 700
- **Padding:** `2px 8px`
- **Border Radius:** `4px`
- **Font Size:** `10px`

### Badges & Tags

#### Genre Badge
- **Background:** `#C084FC` (purple for supernatural), `#05AAF0` (cyan for alt), `#1199FF` (blue for secondary)
- **Text Color:** `#FFFFFF`
- **Font:** Poppins, 12px, weight 600
- **Padding:** `4px 8px`
- **Border Radius:** `4px`
- **Height:** `auto`
- **Display:** `inline-block`

#### Status Tag
- **Background:** `#FACC15` (warning), `#EF4444` (error)
- **Text Color:** `#000000` (for yellow), `#FFFFFF` (for red)
- **Font:** Poppins, 12px, weight 600
- **Padding:** `2px 6px`
- **Border Radius:** `2px`

## 5. Layout Principles

### Spacing System
- **Base Unit:** `8px`
- **Scale:** `4px` (micro), `8px` (xs), `12px` (sm), `16px` (md), `24px` (lg), `32px` (xl), `48px` (2xl), `64px` (3xl), `96px` (4xl), `144px` (5xl)
- **Usage Contexts:**
  - `4px`: Icon spacing, tight component gaps
  - `8px`: Button padding, form field spacing
  - `16px`: Section margins, navigation item padding
  - `24px`: Card padding, content container padding
  - `32px`: Major section spacing
  - `96px-144px`: Hero/banner vertical rhythm

### Grid & Container
- **Max Width:** `1440px` (primary content area)
- **Sidebar Width:** `240px` (navigation sidebar)
- **Main Content Width:** `1200px` (adjusts with sidebar visibility)
- **Column Strategy:** 12-column flexible grid
- **Gutter Width:** `16px` between columns
- **Section Padding:** `32px` horizontal (desktop), `16px` (tablet), `12px` (mobile)

### Whitespace Philosophy
MangaDex prioritizes breathing room between content sections. Large vertical gaps (32px–96px) separate distinct content zones, allowing visual hierarchy to emerge naturally. Horizontal padding scales with viewport, ensuring text never feels cramped. Card-based layouts use consistent 16px gaps to create rhythm without visual monotony. Whitespace around featured content (hero images, title cards) extends to 96px to create prominence.

### Border Radius Scale
- **0px:** Cards, input fields, large containers (clean, modern aesthetic)
- **2px:** Small badges, minimal accent badges
- **4px:** Search inputs, medium containers, subtle rounding
- **8px:** Primary buttons, action containers
- **9999px:** Icon buttons, fully rounded elements, circular avatars

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| **Flat (None)** | `box-shadow: none` | Backgrounds, borders, typography |
| **Subtle (sm)** | `rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px -1px` | Cards, subtle containment |
| **Base (md)** | `rgba(0, 0, 0, 0.1) 0px 10px 15px -3px, rgba(0, 0, 0, 0.1) 0px 4px 6px -4px` | Hovered cards, floating elements |
| **Elevated (lg)** | `rgba(0, 0, 0, 0.1) 0px 4px 6px -1px, rgba(0, 0, 0, 0.1) 0px 2px 4px -2px` | Modals, popups, toasts |

**Shadow Philosophy:**
MangaDex uses restrained shadows to create subtle depth without visual noise. Shadows are minimal on initial render (subtle level) and increase on interaction (hover, focus) to provide responsive feedback. Overlays use semi-transparent black (`rgba(0, 0, 0, 0.6)`) rather than drop shadows to maintain UI clarity. This approach keeps the interface clean while layering information hierarchically.

## 7. Do's and Don'ts

### Do
- Use **warm orange** (`#DA7500`) for primary actions and calls-to-action
- Apply **generous spacing** (32px minimum) between major content sections
- Employ **rounded buttons** (`9999px` radius) for accessibility and visual warmth
- Maintain **consistent text color** (`#242424`) for body content across light backgrounds
- Use **Poppins font** consistently for all interface text below headings
- Apply **subtle shadows** only on interactive elements and hover states to signal interactivity
- Group **related navigation items** visually with consistent padding and hover states
- Display **genre tags** with distinct accent colors to aid content discovery
- Scale **padding proportionally** across breakpoints (32px desktop → 16px mobile)
- Reserve **16px minimum line height** for all body text to ensure readability

### Don't
- Mix **multiple accent colors** in a single call-to-action; reserve orange for primary actions
- Use **shadows on text** or typography elements; let color and weight define hierarchy
- Place **content without padding** against container edges; maintain 16px minimum gutters
- Apply **letter spacing** to body text; reserve tight tracking for headlines only
- Use **colors below 16px** size without sufficient contrast; test against WCAG AA
- Stack **more than two font sizes** within a single component; simplify visual hierarchy
- Exceed **1440px width** on desktop to maintain comfortable reading line lengths
- Apply **full-width layouts** on mobile below 768px; maintain readable column widths
- Mix **rounded and sharp borders** in the same interface zone; maintain visual consistency
- Use **0px letter spacing** on long-form content; add subtle tracking for legibility

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|------|-------|-------------|
| **Mobile (xs)** | 320px–479px | Single-column layout, full-width cards, 12px padding, stacked navigation |
| **Mobile (sm)** | 480px–639px | Single-column optimized, 14px body text, simplified header |
| **Tablet (md)** | 640px–1023px | Two-column layout, sidebar collapses to icon menu, 16px padding |
| **Tablet (lg)** | 1024px–1279px | Three-column optional, sidebar restored, 24px padding |
| **Desktop (xl)** | 1280px–1535px | Full layout, 240px sidebar, 32px padding, centered max-width 1440px |
| **Desktop (2xl)** | 1536px+ | Same as xl; content centers with max-width constraints |

### Touch Targets
- **Minimum interactive size:** `40px × 40px` (buttons, icon buttons)
- **Recommended touch target:** `44px × 44px` (mobile navigation, form inputs)
- **Spacing between targets:** `8px` minimum to prevent accidental activation
- **Text links:** Wrap in `44px` vertical padding minimum; increase font size to `14px+` on mobile
- **Form inputs:** Maintain `40px` height minimum; increase to `44px` on touch devices

### Collapsing Strategy
- **Sidebar:** Collapses to icon-only state at 1024px; fully hides below 768px with hamburger menu
- **Navigation:** Horizontal top nav on desktop; converts to tab-based or drawer navigation on mobile
- **Cards:** Full-width single column on mobile (< 768px); two-column grid at 768px–1200px; three-column at 1200px+
- **Typography:** Reduce h2 from `24px` to `20px` on mobile; h3 maintains `14px`; body text stays `12px` minimum
- **Padding:** Halve gutter values below 768px (32px → 16px, 24px → 12px)
- **Images:** Scale to 100% viewport width on mobile; constrain to 80% on tablet; fixed width on desktop
- **Modals:** Full-screen overlay on mobile (< 640px); centered modal (600px) on desktop

## 9. Agent Prompt Guide

### Quick Color Reference
- **Primary CTA:** Brand Orange (`#DA7500`)
- **Secondary CTA:** Coral (`#FF6740`)
- **Background (Primary):** White (`#FFFFFF`)
- **Background (Secondary):** Light Gray (`#F0F1F2`)
- **Heading Text:** Charcoal (`#242424`)
- **Body Text:** Charcoal (`#242424`)
- **Borders/Dividers:** Border Gray (`#E5E7EB`)
- **Error State:** Error Red (`#EF4444`)
- **Warning State:** Warning Yellow (`#FACC15`)
- **Interactive Overlay:** Transparent Black (`#0009`)
- **Genre Tags:** Purple (`#C084FC`), Cyan (`#05AAF0`), Sky Blue (`#1199FF`)

### Iteration Guide

1. **All buttons** should use `#DA7500` (Brand Orange) for primary actions; reserve secondary buttons for ghost style with transparent background and `#242424` text.

2. **Typography hierarchy** relies on Poppins for interface text and Spartan for editorial headlines; never drop body text below `12px` or use font weight lighter than 400.

3. **Spacing consistency:** Maintain `8px` base unit throughout; section gaps range `16px` (tight) to `96px` (hero prominence); card padding defaults to `24px`.

4. **Shadow application:** Apply subtle shadows (`0px 1px 3px`) only to cards and hover states; never shadow text; increase to medium shadows on interaction (hover, focus).

5. **Color usage:** Charcoal (`#242424`) is the workhorse text color; use pure black (`#000000`) only for maximum contrast; reserve accent colors for tags, badges, and CTAs.

6. **Border radius:** Cards and containers use `0px`; buttons use `8px` (primary) or `9999px` (icon); badges use `2px` (compact) or `4px` (standard).

7. **Responsive adaptation:** Reduce padding by 50% below 768px; stack two-column layouts to single column; collapse sidebar to icon menu; maintain minimum `44px` touch targets.

8. **Focus states:** Add `0px 0px 0px 3px rgba(218, 117, 0, 0.1)` ring around interactive elements on focus; use `:focus-visible` for keyboard navigation visibility.

9. **Form validation:** Error states use `#EF4444` border; warning states use `#FACC15` background; always pair color changes with icon or text label for accessibility.
```



# FILE: ref\Nhom17_bai5.md

- SIZE: 55.82 KB
- SHA256: 821f5c3ecd277cf86d73def8ab2453f3e0e2a203ebda11312c5811f388c6ad81

```markdown
_Tài liệu Kiến trúc phần mềm/ Software Architecture Document_

_Phiên bản: 1.0_

**Tên dự án:** Xây dựng Web – App Quản lý Dịch vụ đọc Truyện tranh Online (Manga)

**Nhóm thực hiện:** Nhóm 17

**Ngày phát hành:** 23/03/2026

**Lịch sử sửa đổi (Revision History)**

<div class="joplin-table-wrapper"><table><tbody><tr><td><p><strong>Ngày tháng/ Date</strong></p></td><td><p><strong>Phiên bản/ Version</strong></p></td><td><p><strong>Mô tả/ Description</strong></p></td><td><p><strong>Các tác giả/Authors</strong></p></td></tr><tr><td><p>12/01/2026</p></td><td><p>0.1</p></td><td><h2>Xác định các bên liên quan</h2><ul><li>Xác định yêu cầu cho tất cả chức năng mà hệ thống có thể có</li></ul></td><td><p>Nhóm 17</p></td></tr><tr><td><p>02/03/2026</p></td><td><p>0.2</p></td><td><ul><li>Tên của mẫu kiến trúc chính được chọn, gồm các mẫu kiến trúc hỗ trợ, bổ sung cho hệ thống.</li><li>Vẽ biểu đồ mô tả trực quan các kiến trúc đó dưới dạng hình khối.</li><li>Liệt kê đầy đủ tên các thành phần (component) trong mỗi kiến trúc đó. Mô tả rõ chức năng của mỗi thành phần (component) của mỗi kiến trúc.</li><li>Gọi tên các công nghệ được chọn (nếu có, bao gồm phần cứng và phần mềm) để sử dụng trong các thành phần trong mỗi kiến trúc.</li></ul></td><td><p>Nhóm 17</p></td></tr><tr><td><p>09/03/2026</p></td><td><p>0.3</p></td><td><ul><li>Thiết kế View kiến trúc Logic (Logical Views)</li><li>Thiết kế View kiến trúc Cài đặt (Implementation Views)</li><li>Thiết kế View kiến trúc Tiến trình (Process Views)</li><li>Thiết kế View kiến trúc triển khai/Vật lý (Deployment Views)</li></ul></td><td><p>Nhóm 17</p></td></tr><tr><td><p>18/03/2026</p></td><td><p>0.4</p></td><td><p>Xác thực kiến trúc (Validation)</p></td><td><p>Nhóm 17</p></td></tr><tr><td><p>23/03/2026</p></td><td><p>1.0</p></td><td><p>Tổng hợp, hoàn thiện và đóng gói tài liệu SAD cuối cùng.</p></td><td><p>Nhóm 17</p></td></tr></tbody></table></div>

**Tên dự án/ Project name:** _Xây dựng Web – App Quản lý Dịch vụ đọc Truyện tranh Online_

1.  **Ngữ cảnh dự án/ Project context:**

- _Nêu tình trạng tổ chức/ doanh nghiệp:_ Hiện nay, cộng đồng đọc truyện tranh (Manga/Manhwa/Comic) tại Việt Nam và quốc tế rất lớn. Tuy nhiên, các hệ thống website đọc truyện hiện tại (hệ thống cũ hoặc của các bên đối thủ) đang gặp phải nhiều vấn đề nhức nhối:
- Hiệu năng kém và gián đoạn dịch vụ: Máy chủ thường xuyên bị quá tải (Crash/Downtime) khi có một bộ truyện hot ra chapter mới. Tốc độ tải ảnh chậm, gây ức chế cho người dùng.
- Quản lý dữ liệu phân tán thủ công: Quá trình thu thập (crawl) truyện từ các nguồn khác (Mangadex, Bato...) thiếu tự động hóa, dễ bị lỗi format dữ liệu, dẫn đến rác dữ liệu trong Database.
- Thiếu kiểm duyệt nội dung: Hình ảnh nhạy cảm (NSFW), bạo lực hoặc bình luận mang tính chất toxic/spoiler không được kiểm soát tốt do dùng sức người.
- Trải nghiệm người dùng nghèo nàn: Chưa có hệ thống gợi ý truyện thông minh (Recommend system) được cá nhân hóa; thiếu các tính năng tương tác thời gian thực (Real-time chat).
- _Nêu dự án này ra đời để đáp kỳ vọng gì của tổ chức/ doanh nghiệp: C_ung cấp một nền tảng đọc truyện thế hệ mới, giải quyết triệt để các bài toán về hiệu suất và tự động hóa. Dự án đáp ứng các kỳ vọng:
- Trải nghiệm mượt mà: Tốc độ tải trang dưới 2 giây, hỗ trợ đọc offline, lật trang/cuộn dọc không độ trễ.
- Khả năng mở rộng (Scalability): Chịu tải hàng chục ngàn Concurrent Users trong giờ cao điểm mà không sập hệ thống.
- Tự động hóa vận hành: Tích hợp AI để tự động kiểm duyệt ảnh (Swin Transformer), nhận diện chữ (OCR) hỗ trợ dịch thuật, và sử dụng ETL Pipeline tự động crawl/chuẩn hóa dữ liệu.
- Tương tác thời gian thực: Trở thành một mạng xã hội thu nhỏ cho giới yêu truyện với tính năng chat, thông báo đẩy tức thì khi có chương mới.

1.  **Những yêu cầu kiến trúc/ Architechture Requirements**

**2.1. Những mục tiêu chính của dự án**

- Xây dựng nền tảng (Web/App) cho phép người dùng đọc truyện, tương tác và tải truyện ngoại tuyến.
- Xây dựng hệ thống Backend mạnh mẽ với kiến trúc Microservices để dễ dàng bảo trì, mở rộng và tích hợp AI.
- Tối ưu hóa chi phí lưu trữ ảnh thông qua Object Storage (MinIO).

**2.2. Những yêu cầu về chức năng của các bên liên quan**

**1\. Đối với Độc giả:**

- Tìm kiếm & Trải nghiệm đọc: Tìm kiếm/lọc truyện theo thể loại, tác giả, đánh giá, ngôn ngữ. Hỗ trợ chế độ đọc linh hoạt (cuộn dọc, lật trang, zoom panel cho ảnh màu/đen trắng) và dịch tự động text trực tiếp trên trang truyện.
- Quản lý cá nhân: Tạo, quản lý (CRUD) danh sách đọc truyện cá nhân (Public/Private); theo dõi (Follow/Unfollow) danh sách của user khác. Cung cấp công cụ tìm kiếm lịch sử đọc theo khoảng thời gian/metadata.
- Tương tác & Cộng đồng: Thêm/sửa/xóa, like/dislike và báo cáo bình luận; đánh giá điểm số. Tích hợp tính năng Chat real-time với các người dùng (và Admin) trong hệ thống.
- Cập nhật & Ngoại tuyến: Bookmark, theo dõi updates, nhận thông báo Push khi có chapter mới và cho phép tải chapter về đọc ngoại tuyến.
- Gợi ý truyện (Recommend): Hệ thống tự động gợi ý truyện cá nhân hóa dựa trên lịch sử đọc và gợi ý các bộ truyện tương tự với bộ đang xem.

**2\. Đối với Người Upload bản dịch (Uploaders):**

- Quản lý đăng tải: Cung cấp công cụ upload batch bản dịch các chapter với các định dạng (JPEG, PNG, WebP) một cách dễ dàng.
- Quản lý danh sách: Quản lý danh sách các bản dịch đã đăng tải và hiển thị thông tin public của uploader để độc giả có thể theo dõi.

**3\. Đối với Quản trị viên:**

- Quản lý User & Content: Dashboard theo dõi xu hướng/lịch sử của user, thực hiện block/unblock tài khoản hoặc block những user đăng nội dung vi phạm. Quản lý, duyệt hoặc xóa các chapter vi phạm bản quyền/chuẩn mực. Xử lý các comment bị báo cáo.
- Vận hành hệ thống: Quản lý toàn bộ danh sách truyện trong hệ thống, bao gồm tuỳ chọn duyệt/cập nhật trực tiếp từ API bên thứ 3 (Mangadex, Bato...). Xem Dashboard báo cáo Analytics (Traffic, User growth, Popularity).

**4\. Đối với Developers / Maintainers:**

- Bảo trì & Mở rộng: Cung cấp RESTful API cho bên thứ 3 (Mobile App) tích hợp. Quản lý cấu hình CI/CD và giám sát hệ thống.
- AI Training: Cung cấp công cụ/luồng hỗ trợ định kỳ train lại tất cả các mô hình AI trong hệ thống dựa trên tập dữ liệu mới.

**5\. Đối với Data Source bên thứ 3 (Hệ thống ETL):** Tự động crawl và thực hiện ETLdữ liệu chapter truyện và thông tin Metadata từ Mangadex API hoặc cào thủ công từ bato, truyenqq...

**2.3. Những yêu cầu về chất lượng (phi chức năng) của các bên liên quan**

**1\. Ràng buộc về Hiệu suất:**

- Tốc độ phản hồi: Thời gian tải trang hiển thị phải dưới 2 giây. Các truy xuất biểu đồ analytics phức tạp phải hoàn thành dưới 15 giây (yêu cầu tích hợp ELK Stack để tối ưu truy vấn logs/dữ liệu).
- Xử lý tài nguyên tĩnh: Ảnh trong chapter phải được load bất đồng bộ (Lazy-load/Asynchronous) để đảm bảo không gián đoạn thao tác đọc các ảnh kích thước lớn. Quá trình xử lý dịch text bằng AI phải trả về kết quả dưới 15 giây/ảnh.

**2\. Khả năng mở rộng và Chịu tải:**

- Backend phải chịu tải được hàng nghìn request cùng lúc, bắt buộc sử dụng Apache Kafka + Redis; ưu tiên khả năng mở rộng theo chiều ngang (Horizontal Scaling).
- Dữ liệu hình ảnh và phi cấu trúc phải được lưu trữ trên Object Storage giống S3 (S3-like storage: MinIO (trong quá trình development vì miễn phí) hoặc AWS S3 (trên production nếu có dư tiền, không thì lại quay về dùng MinIO tiếp)) để giảm tải băng thông cho server chính. Dữ liệu đọc offline được cache qua một DB trung gian (Redis) hoặc load trực tiếp từ MinIO Data lake.

**3\. Độ tin cậy và Tính sẵn dùng:**

- Rollback tự động: Chức năng tự động cập nhật truyện toàn hệ thống (qua Mangadex API) phải có cơ chế tự động Rollback lại toàn bộ dữ liệu sạch trước đó nếu server bị down giữa chừng.
- Backup: Hệ thống tự động lập lịch backup toàn bộ DB đẩy lên Cloud (AWS S3 nếu đến lúc đó còn đủ tiền trả cho dịch vụ, không thì dùng tạm GG Big Query) mà không cần sự can thiệp thủ công.

**4\. Ràng buộc về Bảo mật (Security & Privacy):**

- Thiết kế RESTful API với chuẩn Auth (OAuth/JWT). Hệ thống có cơ chế tự động Block hoặc tạm thời giới hạn (Rate Limiting) truy cập từ các IP spam bất thường/DDoS.
- User bị Block sẽ bị cưỡng chế đăng xuất khỏi hệ thống ngay lập tức.
- Dữ liệu lịch sử đọc cá nhân có thể được cấp quyền (Toggle) hiển thị/ẩn với người dùng khác. Bình luận có bộ lọc từ cấm tự động và tính năng toggle ẩn/hiện văn bản chứa Spoiler.

**5\. Ràng buộc Kiến trúc Công nghệ & AI (Technical & AI Constraints):**

- Cấu trúc Database: Bắt buộc sử dụng UUID v4 làm khóa chính cho mọi bảng trong CSDL để dễ dàng đồng bộ định dạng với dữ liệu cào từ Mangadex API.
- AI Kiểm duyệt: Sử dụng mô hình Swin Transformer v2 quét ảnh NSFW. Yêu cầu thời gian quét tối đa < 5 phút cho mỗi chương. Vi phạm sẽ tự đẩy ticket cho Admin.
- AI Dịch thuật: Kết hợp OCR Scan và Google AI Mode (qua thư viện Playwright nếu cần), trong quá trình dev thì dùng tạm Google Translate API, nếu thấy ổn thì khỏi xài Google AI Mode.
- AI Gợi ý: Thuật toán gợi ý cá nhân hóa dựa trên query tĩnh (lấy max 20 truyện rating cao chứa 5 tags xem gần nhất). Thuật toán gợi ý truyện tương tự dùng BERTopic để phân cụm các comment/review đã được tiền xử lý (lọc nhiễu). Model AI cần được train định kỳ 6 tháng 1 lần.
- ETL Pipeline & Automation: Chạy Job lập lịch thu thập metadata vào _"Tối chủ nhật đầu tiên của quý"_ và nội dung chapter vào _"Tối thứ 2 đầu tiên của quý"_. Áp dụng cơ chế Full Load cho quý đầu tiên và Incremental Load cho các chu kỳ sau. Push notification (Kafka/WebSocket) phải alert thời gian thực khi có update.
- Nghiệp vụ độ trễ: Admin phải đợi 5 phút giữa 2 lần thao tác Block/Unblock trên cùng một user. Báo cáo comment bị Admin ignore sẽ có thời gian chờ 24 tiếng trước khi người dùng có thể report lại comment đó.

1.  **Trình bày kiến trúc**

**3.1. Các mẫu kiến trúc được sử dụng trong dự án**

1.  **Kiến trúc chính: Microservices Architecture Pattern**

Lý do: Mỗi dịch vụ xử lý một nghiệp vụ nhỏ và sở hữu Database (hoặc bảng/schema) riêng lẻ. Đảm bảo một service lỗi không làm sập các tính năng khác.

1.  **Kiến trúc hỗ trợ 1: Client – Server Architecture Pattern**

Lý do: Trình duyệt web (Client) sẽ đóng vai trò thiết lập giao diện và trực tiếp gửi request (HTTP/REST) tới các cụm máy chủ Microservices (Server) để xin cấp phát tài nguyên (ảnh, text).

1.  **Kiến trúc hỗ trợ 2: Broker Architecture Pattern**

Lý do: Giải quyết bài toán giao tiếp giữa hàng chục service nhỏ. Sử dụng Broker để điều phối các sự kiện.

1.  **Kiến trúc hỗ trợ 3: Pipe-Filter Architecture Pattern**

Lý do: Xử lý một chuỗi transformation dữ liệu từ nơi này sang nơi khác để lưu và dùng.

**3.2. Kiến trúc tổng quan của dự án**

- Nhóm Identity (Tài khoản & Phân quyền):
- Registration Svc & Login Svc: Quản lý tạo tài khoản mới và cấp phát JWT.
- User Profile Svc: CRUD avatar, tên hiển thị, bio.
- User Sanction Svc: Lưu trữ trạng thái Block/Unblock, quản lý bộ đếm lùi 5 phút cấm thao tác, kick session.
- Role Mngt Svc: Xác định ai là Admin, ai là Uploader.
- Reading Preferences Svc: Lưu cấu hình đọc ví dụ "chế độ zoom panel" của độc giả.
- Nhóm Catalog (Thông tin truyện tĩnh):
- Manga Info Svc: CRUD thông tin cơ bản: Tên, tóm tắt.
- Author & Studio Svc / Taxonomy Svc: Chuẩn hóa tên tác giả và hệ thống Tag, Ngôn ngữ (Anh/Việt).
- Manga Search Svc & Manga Filter Svc: Chuyên trị query tìm kiếm text và lọc theo điều kiện phức tạp.
- Nhóm Reader & Media (Truyền tải ảnh & Upload):
- Chapter Metadata Svc: Lưu thông tin chap mấy, thuộc volume nào, tên chapter.
- Page Ordering Svc: Quản lý số thứ tự các trang ảnh trong một chapter để UI render không bị lộn xộn.
- Batch Upload Svc: Mở port cho uploader đẩy file hàng loạt lên RAM máy chủ.
- Image Validation Svc: Check MIME type (JPEG, PNG, WebP) và dung lượng file.
- Presigned URL Generator Svc: Sinh ra các link tạm thời từ kho ảnh MinIO cho UI load trực tiếp (không qua server Backend).
- Offline Package Builder Svc: Đóng gói các ảnh của chapter thành file nén trả về cho UI.
- Nhóm Interaction & Chat (Tương tác xã hội):
- Comment Write Svc & Comment Read Svc: Tách biệt luồng ghi và luồng đọc comment.
- Spoiler Management Svc: Xử lý cờ (flag) ẩn/hiện comment spoil nội dung truyện.
- Profanity Check Svc: Lọc từ cấm trước khi đẩy comment vào DB.
- Rating Calculation Svc & Report Ticket Svc: Tính trung bình sao; Quản lý ticket báo cáo, quản lý timer chờ 24h nếu bị ignore.
- Chat Svc (WS, Room, Message): Mở luồng WebSocket, phân luồng phòng chat, lưu tin nhắn real-time giữa users.
- Nhóm Library (Thư viện cá nhân của người dùng):
- Reading Coordinate Svc: Liên tục ghi nhận (Append-only) người dùng đang đọc tới trang nào, hình nào (Yêu cầu 12).
- List Builder Svc & List Privacy Svc: Tạo các danh sách Manga tùy chỉnh, cấu hình Private/Public.
- Follow Manga Svc & Follow List Svc: Ghi nhận đăng ký theo dõi truyện hoặc list người khác.

Công nghệ sử dụng:

- Framework: FastAPI.
- ORM: SQLAlchemy.
- WebSockets: Sử dụng FastAPI WebSockets module.

Web Browser Client Component: Render giao diện. Xử lý logic tải ảnh bất đồng bộ, xử lý chế độ đọc lật trang/cuộn dọc, lưu trữ file ảnh zip ngoại tuyến vào IndexedDB/Local storage trình duyệt.

Công nghệ sử dụng: Next.js (React framework), giao tiếp qua Fetch API và WebSocket.

Apache Kafka Broker giao tiếp sự kiện. Khi Follow Manga Svc ghi nhận user bấm theo dõi, hoặc Batch Upload Svc báo nhận ảnh xong 🡪 Tạo sự kiện đẩy vào Kafka.

Công nghệ sử dụng: Apache Kafka: Xử lý chịu tải message. Dùng thư viện aiokafka để kết nối từ FastAPI.

- Intake Filter: Nhận data thô từ luồng Crawl (Mangadex) hoặc Upload.
- OCR Filter / Translator Filter: Quét chữ trên ảnh (Tesseract) 🡪 Gọi Playwright dịch.
- Swin NSFW Filter: Quét ảnh khỏa thân/bạo lực. Trả kết quả pass/fail.
- Notification Worker: Lắng nghe Kafka, phân phát Alert thời gian thực.
- Personalized & BERTopic Worker: Tính toán offline danh sách truyện gợi ý dựa trên Lịch sử & Text.

Công nghệ sử dụng:

- Task Queue: Celery chạy cùng Redis broker.
- AI (Hình ảnh & NLP): PyTorch (cho mô hình Swin Transformer v2), BERTopic.
- ETL & Dịch thuật: BeautifulSoup4 (Cào text), Playwright (Cào tự động Google Translate, GG AI Mode), Tesseract OCR (Trích xuất chữ từ ảnh).
- DBT

- PostgreSQL Master: Nút cơ sở dữ liệu xử lý 100% các request Write (Tạo user, comment, bookmark...). Khóa chính dùng UUID v4.
- PostgreSQL Slaves: Bản sao đồng bộ từ Master. Mọi Microservices khi cần thực hiện lệnh SELECT (như load chương, tìm truyện) đều query vào Slaves.
- Mangadex Rollback Worker: Lắng nghe Kafka, nếu cào bị lỗi sẽ rollback toàn bộ ID đã lưu.
- Traffic Analytics & System Backup Worker: Xử lý vẽ biểu đồ (<15s), xuất Excel, dump DB đẩy lên S3 tự động.

Công nghệ sử dụng:

- PostgreSQL: Quản lý Master-Slave native replication.
- Redis: Phân tán cache, lưu session chat.
- MinIO: Object Storage lưu trữ ảnh tĩnh chuẩn S3.

**3.3. Thiết kế View kiến trúc Logic (Logical Views)**

**Biểu đồ usecase tổng thể**

Giải thích các Use case tổng thể:

- Đăng ký/Đăng nhập: Quản lý định danh, cấp phát token JWT, xác thực quyền hạn.
- Tìm kiếm & Lọc truyện: Truy vấn danh sách truyện theo thể loại, tác giả, trạng thái, (tối ưu hóa trên các Slave Database).
- Đọc truyện & Tải Offline: Tải metadata của chương, nhận Presigned URL từ MinIO để lấy ảnh trực tiếp, đóng gói ảnh tải ngoại tuyến thành file .zip gửi cho độc giả.
- Bình luận & Tham gia Chat: Đăng bình luận, đánh dấu spoiler, và duy trì luồng giao tiếp thời gian thực qua WebSocket.
- Lưu Bookmark & Tọa độ đọc: Đánh dấu truyện yêu thích và tự động ghi nhận vị trí trang đang xem.
- Đăng tải chương truyện (Batch): Cho phép Uploader đẩy hàng loạt hình ảnh lên server thông qua luồng upload tối ưu.
- Kiểm duyệt AI (NSFW/OCR): Hệ thống ngầm tự động quét ảnh nhạy cảm và nhận diện ký tự để dịch thuật hoặc tìm kiếm text trên ảnh.
- Quản lý Cấu hình & User: Phân quyền hệ thống, khóa tài khoản vi phạm, cấu hình banner.

**Biểu đồ lớp tổng thể**

- Package Identity Domain: Chứa các lớp User, Role, Session. Chịu trách nhiệm quản lý thông tin định danh, phân quyền và vòng đời của chuỗi mã hóa JWT.
- Package Catalog Domain: Chứa các lớp Manga, Author, Tag, Chapter. Đây là core của dịch vụ tra cứu, các bộ truyện được gắn tag và liên kết với danh sách các chương.
- Package Media & Library Domain: Chứa các lớp Page và ReadingCoordinate. Lớp Page đảm nhận ánh xạ file vật lý trên MinIO thành các Presigned URL, trong khi ReadingCoordinate lưu vết lịch sử đọc của từng độc giả.
- Package Interaction Domain: Chứa các lớp Comment, ReportTicket. Quản lý dữ liệu tương tác, che nội dung spoiler và xử lý các báo cáo vi phạm.
- Package AI Worker Domain: Chứa lớp AIModelEvaluator. Quản lý các dữ liệu đo lường chất lượng của các mô hình học máy (như mô hình gợi ý, nhận diện ảnh). Bổ sung thêm các metric để kiểm tra mô hình bên cạnh những metric cũ (F1 score, ...) ví dụ như R^2 và các metric liên quan nhằm đảm bảo độ tin cậy của AI.

**3.4. Thiết kế View kiến trúc Cài đặt (Implementation Views)**

**Biểu đồ gói**

- \[Next.js UI Pages\]: Gói mã nguồn chứa các file giao diện (.tsx/.jsx), chịu trách nhiệm hiển thị HTML tĩnh và định tuyến phía trình duyệt.
- \[React Hooks & State\]: Gói chứa các hàm logic frontend để quản lý trạng thái tải trang, dữ liệu tạm thời và bộ nhớ đệm.
- \[Nginx / Kong Routing\]: Gói cấu hình file (.conf), quy định các luật định tuyến, chặn DDoS và giới hạn băng thông cho toàn hệ thống.
- \[Identity Service\]: Mã nguồn Python (FastAPI) chuyên biệt cho việc mã hóa mật khẩu, tạo token và kiểm tra quyền truy cập.
- \[Catalog Service\]: Mã nguồn Python xử lý truy vấn tìm kiếm phức tạp, bộ lọc truyện và chuẩn hóa dữ liệu từ database.
- \[Interaction Service\]: Mã nguồn Python quản lý luồng dữ liệu WebSocket cho tính năng chat thời gian thực và ghi nhận bình luận.
- \[Media Upload Service\]: Gói mã nguồn mở cổng tiếp nhận file, kiểm tra MIME type, giải nén file zip ảnh tải lên từ Uploader.
- \[Offline Package Builder\]: Gói mã nguồn đóng gói hàng loạt file ảnh thành các cục nén để Client tải về thiết bị đọc offline.
- \[Celery Task Dispatcher\]: Gói mã nguồn quản lý hàng đợi, phân phát các tác vụ tốn thời gian từ Kafka đến các node Worker nhàn rỗi.
- \[Swin NSFW Filter\]: Gói mã nguồn PyTorch chứa trọng số mô hình Swin Transformer, làm nhiệm vụ phân tích ma trận ảnh để phát hiện nội dung độc hại.
- \[OCR Processor\]: Gói mã nguồn tích hợp Tesseract để trích xuất văn bản từ khung thoại trong ảnh truyện tranh.

**Biểu đồ thành phần**

- Web Browser (React): Thành phần thực thi chạy trên máy người dùng cuối, đóng vai trò hiển thị giao diện và trực tiếp gọi các giao thức mạng.
- API Gateway: Thành phần container độc lập, lắng nghe tại cổng 80/443, phân giải URL để trỏ chính xác vào các Service backend bên trong mạng nội bộ.
- Identity API: Thành phần container chạy uvicorn server, sở hữu DB riêng. Xử lý các endpoint bắt đầu bằng /api/v1/auth.
- Catalog API: Thành phần container chịu tải chính cho việc đọc dữ liệu truyện. Xử lý các endpoint bắt đầu bằng /api/v1/manga.
- Chat API: Thành phần container duy trì hàng nghìn kết nối TCP mở (WebSocket) cho tính năng chat. Xử lý qua /ws/chat.
- Kafka Message Broker: Thành phần cụm máy chủ trung gian (Cluster) lưu trữ các thông điệp sự kiện vào các Topic phân tán, đảm bảo không mất mát dữ liệu khi hệ thống quá tải.
- AI Worker Node: Thành phần thực thi chạy ngầm (Daemon), liên tục pull tin nhắn từ Kafka để chạy các thuật toán AI nặng mà không phản hồi trực tiếp cho HTTP request.
- MinIO Storage Server: Thành phần máy chủ lưu trữ Object Storage, thay thế cho ổ cứng cục bộ để lưu trữ và phân phối file ảnh tĩnh (JPEG, PNG) với hiệu suất cao trực tiếp cho Client.

**3.5. Thiết kế View kiến trúc Tiến trình (Process Views)**

**Biểu đồ hoạt động (Activity diagram):**

Tiến trình Đọc truyện

Giải thích Tiến trình Đọc truyện: Tiến trình này tối ưu hóa việc truyền tải. Thay vì Backend phải đọc file ảnh và gửi về (gây nghẽn băng thông), Media Service chỉ tính toán và sinh ra các **Presigned URLs** (đường dẫn có chữ ký tạm thời). Client sử dụng các đường dẫn này để kéo ảnh trực tiếp từ máy chủ lưu trữ Object Storage. Song song đó, tiến trình đọc liên tục bắn tọa độ về hệ thống để lưu lại vị trí trang hiện tại.

**Tiến trình Upload & Xử lý AI ngầm**

Áp dụng mẫu kiến trúc Pipe-Filter và Background Jobs. Khi người dùng tải ảnh lên, Backend không bắt người dùng chờ AI xử lý xong. Nó chỉ lưu file tạm thời và báo thành công, sau đó ném sự kiện vào Kafka. Các tiến trình AI ngầm sẽ lấy ảnh từ MinIO xuống để chạy mô hình Swin NSFW (kiểm duyệt) và OCR (nhận diện chữ), sau đó tự động cập nhật trạng thái hiển thị của chương truyện.

**Tiến trình Chat Real-time**

Giải thích Tiến trình Chat Real-time: Sử dụng giao thức WebSocket kết hợp Redis Pub/Sub để duy trì kết nối luồng kép. Khi một tin nhắn được gửi, nó đi qua bộ lọc từ ngữ trước. Nếu an toàn, tin nhắn được lưu xuống DB và đẩy vào Redis Pub/Sub. Cơ chế Pub/Sub của Redis sẽ chịu trách nhiệm phát sóng (Broadcast) tin nhắn đó đến toàn bộ các Server FastAPI đang giữ kết nối WebSocket với các người dùng khác trong cùng phòng.

**Tiến trình Crawl & Đồng bộ dữ liệu ETL (Pipe-Filter)**

Giải thích: Hệ thống sử dụng một bộ lập lịch (Cronjob) để kích hoạt tự động. Thay vì lưu trực tiếp dữ liệu từ nguồn ngoài vào DB chính gây rủi ro toàn vẹn, luồng xử lý áp dụng ETL (Extract – Transform – Load). Dữ liệu JSON thô đi qua màng lọc (Intake Filter) đổ vào Staging DB, sau đó qua màng lọc chuẩn hóa và dịch thuật, cuối cùng mới được Service chịu trách nhiệm ghi vào DB Master.

**Tiến trình Cấp quyền và Xác thực (Identity Workflow)**

Giải thích: Mọi yêu cầu xác thực trước tiên phải đi qua API Gateway để đếm số lần thử (Rate Limiting), ngăn chặn tấn công dò mật khẩu. Tại \`Identity Service\`, sau khi xác minh Hash mật khẩu, hệ thống sinh ra JWT để Client mang theo trong các Request tiếp theo. Phiên đăng nhập được đẩy vào Redis Cache cho phép hệ thống thu hồi token ngay lập tức nếu phát hiện bất thường mà không cần truy vấn lại DB.

**3.6. Thiết kế View kiến trúc triển khai/Vật lý (Deployment Views)**

Giải thích các Thành phần Triển khai vật lý:

- Thiết bị Khách: Điện thoại hoặc PC chạy trình duyệt web tải ứng dụng React (SPA).
- Load Balancer Node: Máy chủ vật lý hoặc VM đứng mũi chịu sào (ví dụ Nginx), nhận mọi traffic từ Internet, cung cấp SSL và phân tán tải trọng mạng.
- Application Cluster: Cụm máy chủ chạy Docker Swarm (Nếu còn dư dả thời gian build thì chuyển qua xài K8S ngon hơn). Mỗi máy chủ sẽ host nhiều Container chứa các Microservices (FastAPI). Có khả năng scale tự động.
- AI GPU Nodes: Máy chủ chuyên dụng có trang bị Card đồ họa (GPU). Cài đặt môi trường CUDA để chạy mô hình AI PyTorch (Swin/OCR) qua Celery Worker.
- Message Broker Node: Cụm máy chủ chạy Apache Kafka. Đây là trục xương sống giao tiếp bất đồng bộ, chịu tải sự kiện.
- Object Storage Node: Cụm máy chủ lưu trữ ổ cứng dung lượng cao (HDD/SSD). Chạy MinIO phân tán, chịu trách nhiệm lưu trữ và phục vụ tải ảnh trực tiếp không cần thông qua Application Cluster.
- Database Cluster: Cụm máy chủ cơ sở dữ liệu áp dụng mẫu Master – Slave. Máy chủ Master hứng chịu toàn bộ lệnh Ghi (Write). Máy chủ Slave đồng bộ liên tục từ Master và xử lý 100% các lệnh Đọc (Read - VD: Tải danh sách truyện). Redis Cluster được tách riêng để xử lý truy xuất tức thời vào RAM.

**4\. Tài liệu xác thực kiến trúc**

Trước khi giả định, em cần nhấn mạnh lại một số kiến trúc hoặc công nghệ highlight của nhóm đã chọn lựa trước đó. Vì nhóm em chọn nó để giải quyết phần nào các tình huống thực tế có thể xảy ra (nên sẽ được trích dẫn lại rất nhiều trong phản hồi của bảng bên dưới):

- Microservices
- Event – Driven với Kafka
- Master – Slave Database
- Pipe – Filter cho AI/ETL
- Redis Cluster
- Minio

**4.1. Xác thực yêu cầu về Tính sẵn dùng (Availability)**

<div class="joplin-table-wrapper"><table><tbody><tr><td><p><strong>Thuộc tính chất lượng (Quality Attribute)</strong></p></td><td><p><strong>Sự cố giả định (Stimulus)</strong></p></td><td><p><strong>Phản hồi của hệ thống (Response)</strong></p></td></tr><tr><td><p><strong>1. Tính sẵn dùng (Availability)</strong></p><p><em>(Khả năng hệ thống duy trì hoạt động hoặc phục hồi nhanh khi có lỗi)</em></p></td><td><p><strong>Sự cố 1:</strong> Máy chủ chứa Catalog đột ngột bị sập do tràn RAM (Out of Memory).</p></td><td><p>Em đặt vấn đề không phải lỗi linh tinh thông thường mà là lỗi OOM vì nó rất khó chịu trên những container chạy Linux, đặc biệt là những người mới dùng Docker.</p><p></p><p>Cần giải thích một chút là lỗi OOM trên các hệ điều hành Linux (ở đây chứa Docker) sẽ kích hoạt cơ chế OOM Killer bắn chết hết các tiến trình của container đó ngay lập tức (Exit code 137). Một số dev mới hay có thói quen để mặc định check trạng thái “UNHEALTHY” của container bất kỳ trong một cụm rồi mới xử lý lỗi. Nhưng đằng này nó chuyển hẳn sang trạng thái “EXITED” luôn. Nếu chỉ dùng Docker thông thường thì phải cài thêm policy để nó còn biết tự khởi động lại Container nếu exit đột ngột.</p><p></p><p>Nhóm em lại không thích rườm rà như vậy nên chọn một giải pháp đơn giản mà hiệu quả hơn: Cụm Application Cluster được quản lý bởi công cụ điều phối Docker Swarm. Khi máy chủ Catalog API bị tràn RAM, rõ ràng lúc đó hệ điều hành sẽ kill sạch tiến trình, làm container bị ngắt đột ngột. Trình điều phối Swarm Manager sẽ lập tức phát hiện trạng thái thực tế bị thiếu hụt so với cấu hình (desired state: Ví dụ em khai báo lúc đầu là service này luôn phải có 3 replica chạy khỏe, nếu văng mất 1 2 cái thì sẽ tự động khởi tạo container mới trên node bất kỳ để đảm bảo đúng yêu cầu cấu hình). Nó sẽ ra lệnh tự động spin up một container thay thế, đồng thời Load Balancer tự động loại bỏ node chết khỏi danh sách định tuyến, chuyển traffic sang các node còn lại. Quá trình tự phục hồi diễn ra tự động mà người dùng gần như không cảm nhận được gián đoạn.</p></td></tr><tr><td><p></p></td><td><p><strong>Sự cố 2:</strong> Cụm Database Master (PostgreSQL) bị hỏng ổ cứng, ngừng hoạt động hoàn toàn.</p></td><td><p>Cần nhắc lại rằng “ghi” là của một mình ông DB Master xử lý, còn luồng đọc là do bọn DB Slave đảm nhận 100%. Trong sự cố này thì luồng ghi bị ảnh hưởng do DB Master chết đột ngột. Cũng cần lưu ý luồng ghi sẽ gồm 2 kiểu dữ liệu ứng với 2 thao tác:</p><ol><li>Với thao tác Ghi trực tiếp (Ví dụ: Đổi mật khẩu, Viết bình luận): Hệ thống API sẽ không kết nối được tới Master, sinh ra lỗi Connection Timeout. API Gateway có thể trả về cho Frontend mã lỗi 503 Service Unavailable hoặc hiển thị thông báo "Hệ thống đang bảo trì tính năng này, vui lòng thử lại sau".</li><li>Với thao tác Upload truyện (Nhờ Kafka gánh vác): Khi uploader đẩy ảnh lên, Media Upload Service nhận file, lưu vào MinIO và sinh ra một Event ném vào Apache Kafka. Lúc này dù Master DB có chết, tin nhắn vẫn nằm an toàn trong hàng đợi của Kafka. Khi DB được sửa xong, các AI Worker sẽ từ từ lấy tin nhắn ra và ghi vào DB. =&gt; Không mất mát dữ liệu.</li></ol><p>Do đó, nhờ áp dụng mẫu kiến trúc <strong>Master – Slave</strong>, toàn bộ các lệnh "Đọc" (người dùng xem danh sách truyện, đọc chương truyện) hiển nhiên vẫn diễn ra bình thường vì chúng được query từ Slave DB và Redis Cache. Các lệnh "Ghi" (đăng truyện, bình luận) sẽ tạm thời báo lỗi hoặc được đưa vào hàng đợi. Hệ thống không thể sống mãi mà không có Master. Quá trình khắc phục diễn ra như sau:</p><ol><li>Alerting: Các hệ thống giám sát (Prometheus/Grafana) hoặc Notification Worker liên tục ping DB Master. Khi rớt kết nối, nó bắn cảnh báo khẩn cấp (qua Telegram/Email) cho Quản trị viên (DevOps/DBA).</li><li>Promotion: Quản trị viên can thiệp (hoặc dùng tool tự động như Patroni). Họ gỡ bỏ chế độ Read – Only của một node Slave khỏe nhất, promote nó lên làm Master mới.</li><li>Reconfiguration: Cập nhật lại chuỗi kết nối (Connection String / DNS) để các Microservices trỏ IP Master mới về cái máy vừa được thăng cấp.</li><li>Khôi phục hoàn toàn: Tính năng "Ghi" hoạt động trở lại bình thường. Quản trị viên có thể mua ổ cứng mới, cài lại một Node mới và gán nó làm Slave bổ sung vào cụm sau.</li></ol></td></tr></tbody></table></div>

**4.2. Xác thực yêu cầu về Khả năng cập nhật (Modifiability)**

<div class="joplin-table-wrapper"><table><tbody><tr><td><p><strong>Thuộc tính chất lượng (Quality Attribute)</strong></p></td><td><p><strong>Sự cố giả định (Stimulus)</strong></p></td><td><p><strong>Phản hồi của hệ thống (Response)</strong></p></td></tr><tr><td rowspan="2"><p><strong>2. Khả năng cập nhật (Modifiability)</strong></p><p><em>(Khả năng thay đổi, nâng cấp tính năng mà không làm ảnh hưởng hệ thống cũ)</em></p></td><td><p><strong>Sự cố 1:</strong> Đội ngũ Data Science muốn thay thế mô hình AI Swin NSFW cũ bằng một mô hình mới nặng hơn, yêu cầu thư viện Pytorch phiên bản khác.</p></td><td><p>Thông thường nếu xài kiến trúc nguyên khối, việc nâng cấp PyTorch có thể gây xung đột thư viện (dependency) với các phần khác của backend (như thư viện xử lý ảnh, database driver). Khi đó toàn bộ hệ thống buộc phải restart lại, gây gián đoạn dịch vụ</p><p>Nhưng nhờ kiến trúc <strong>Pipe-Filter &amp; Workers</strong> và việc tách rời thông qua <strong>Kafka</strong>, mấy ông DS chỉ cần tạo một AI Worker Node mới chứa mô hình mới và deploy nó. Các service khác như Upload Service hay Catalog Service hoàn toàn không can hệ gì và cũng không cần sửa một dòng code nào, cũng không cần restart luôn. Ở đây mình có thể hình dung đơn giản như sau:</p><ul><li>Pipe: Là Kafka, làm nhiệm vụ vận chuyển dữ liệu (sự kiện ảnh cần kiểm duyệt) từ trạm này sang trạm khác.</li><li>Filter: Là các AI Worker (Swin NSFW Filter, OCR Processor). Mỗi Filter là một module độc lập, chỉ làm đúng một việc: Nhận dữ liệu đầu vào từ Pipe 🡪 Xử lý (chạy AI) 🡪 Đẩy kết quả ra một Pipe khác hoặc cập nhật vào Database.</li></ul><p>🡪 Việc thay đổi mô hình AI thực chất chỉ là việc tháo một Filter cũ ra khỏi đường ống và lắp một Filter mới vào, hoàn toàn không làm vỡ cấu trúc của toàn bộ quy trình kiến trúc được setup lúc đầu.</p></td></tr><tr><td><p><strong>Sự cố 2:</strong> Nền tảng muốn tích hợp thêm cổng thanh toán (Momo/ZaloPay) để độc giả mua chương truyện Premium.</p></td><td><p>Thông thường đối với kiến trúc nguyên khối cũ, nếu muốn cập nhật một chức năng mới cho một hệ thống đã hoàn thiện, cần sửa source code thêm mới module “Payment” vào, và sửa các bảng trong DB.</p><p>Nhưng nhờ kiến trúc <strong>Microservices</strong>, hệ thống của nhóm em cho phép tạo một Payment Service hoàn toàn mới, tích hợp các cổng thanh toán và độc lập với Database riêng. Quy trình triển khai thì y hệt như những service khác:</p><p>Đóng gói Payment Service thành một Docker Image và ra lệnh cho Docker Swarm chạy nó lên thành các Container mới (ví dụ: chạy 2 replicas). Lúc này, Payment Service đã chạy ngầm trong mạng nội bộ, nhưng người dùng bên ngoài chưa hề biết đến sự tồn tại của nó. Các service đọc truyện cũ vẫn hoạt động bình thường, không hề bị ảnh hưởng.</p><p>Quản trị viên lúc này chỉ cần thêm vài dòng cấu hình để định tuyến API Gateway cho phép người dùng trỏ tới Payment Service vừa tạo. App/Web Frontend của người dùng đã có thể gọi API thanh toán.</p><p>Cuối cùng là cấu hình các giao tiếp nội bộ với các service khác. Giả sử: Khi Momo gọi Webhook báo thanh toán thành công về Payment Service. Payment Service ghi nhận vào DB của nó, sau đó ném một sự kiện PREMIUM_UNLOCKED {user_id, chapter_id} vào Kafka Message Broker. Catalog Service (đang lắng nghe Kafka) nhận được tin nhắn này, cập nhật trạng thái quyền đọc của user đối với chapter đó trong Database Slave/Redis của riêng nó. Sự liên kết lỏng lẻo này giúp 2 service không gọi trực tiếp lẫn nhau, tránh việc một bên sập kéo theo bên kia sập.</p><p>Toàn bộ các quy trình trên có thể được thực hiện ngay trong lúc các service khác đang chạy mà không lo gián đoạn dịch vụ hay phải bảo trì hệ thống.</p></td></tr></tbody></table></div>

**4.3. Xác thực yêu cầu về Tính bảo mật (Security)**

|     |     |     |
| --- | --- | --- |
| **Thuộc tính chất lượng (Quality Attribute)** | **Sự cố giả định (Stimulus)** | **Phản hồi của hệ thống (Response)** |
| **3\. Tính bảo mật (Security)**<br><br>_(Khả năng ngăn chặn, chống lại các cuộc tấn công và truy cập trái phép)_ | **Sự cố 1:** Hacker sử dụng tool tự động gửi 10,000 request/giây vào endpoint Đăng nhập (/api/v1/auth) nhằm dò rỉ mật khẩu (Brute-force). | Nhóm em đã tính toán cho hai cơ chế bảo mật dưới đây:<br><br>Cơ chế Rate Limiting: API Gateway được cấu hình để đếm số lượng request đến từ một địa chỉ IP (hoặc một dải IP) trong một khung thời gian. Cấu hình chỉ cho phép tối đa 5 request đăng nhập / 1 phút / 1 IP. Khi tool của hacker gửi đến request thứ 6, API Gateway sẽ lập tức chặn đứng request này lại. Nó không thèm forward request đó vào mạng nội bộ (nơi chứa các Microservices), mà lập tức trả thẳng về cho hacker mã lỗi HTTP 429 Too Many Requests hoặc 403 Forbidden. Kết quả, Identity Service và cơ sở dữ liệu PostgreSQL ở bên trong hoàn toàn bình yên vô sự. CPU và RAM của hệ thống không bị lãng phí để xử lý 10,000 cái request rác kia, nhờ đó hệ thống không bị đánh sập (chống được luôn cả DDoS tầng Application).<br><br>Mặc khác, đối với các hacker chuyên nghiệp có thể dùng Mạng Botnet hoặc Proxy đổi IP liên tục để qua mặt API Gateway. Giả sử kịch bản tồi tệ nhất xảy ra: Hacker dò được một số mật khẩu yếu, hoặc hệ thống bị dính lỗi SQL Injection khiến toàn bộ Database bị tải trộm ra ngoài. Lúc này, lớp phòng thủ thứ hai tại Identity Service sẽ phát huy tác dụng: Hệ thống KHÔNG BAO GIỜ lưu mật khẩu dưới dạng văn bản thô (Plain-text) như 123456 hay password.<br><br>Trước khi lưu xuống Database, Identity Service đã sử dụng thuật toán băm (Hashing) một chiều cường độ cao (Bcrypt và Argon2) kết hợp với Salt (chuỗi ngẫu nhiên sinh ra cho từng user). Mật khẩu 123456 sẽ biến thành một chuỗi vô nghĩa như $2b$12$eImiTXuWVxfM37uY4JANj...<br><br>Về lý thuyết, thuật toán Hash được thiết kế bằng toán học sao cho: Từ mật khẩu suy ra chuỗi Hash thì rất dễ, nhưng từ chuỗi Hash không thể nào dịch ngược lại ra mật khẩu gốc. Kết quả, Hacker cầm trong tay toàn bộ Database cũng đành bó tay chịu chết. Chúng không thể biết mật khẩu thật của độc giả là gì để đi đăng nhập trái phép vào hệ thống, bảo vệ an toàn tuyệt đối cho tài sản số và thông tin cá nhân của người dùng. |
| **Sự cố 2:** Kẻ tấn công cố gắng đánh sập máy chủ bằng cách liên tục request tải các hình ảnh dung lượng cao của truyện tranh. | Cần lưu ý rằng, hệ thống của nhóm tách biệt độc lập backend với nơi lưu trữ ảnh. Do đó, hệ thống Backend sẽ không bị sập. Theo tiến trình đọc truyện (đã vẽ ở Bài 3), hệ thống chỉ trả về **Presigned URLs**. Request tải ảnh thực tế được đẩy thẳng sang **MinIO Object Storage Cluster**.<br><br>Khi hacker (hoặc độc giả) request xem một chương truyện (gọi vào Catalog API), Backend FastAPI tuyệt đối không đi tìm file ảnh để trả về. Thay vào đó, Backend chỉ query Database để lấy danh sách tên file, sau đó gọi thư viện mã hóa sinh ra các Presigned URLs (Đường dẫn có chữ ký giới hạn thời gian). Chuỗi JSON Backend trả về cực kỳ nhẹ (chỉ vài Kilobyte). Quá trình này tiêu tốn cực ít CPU và RAM của Backend.<br><br>Ở trình duyệt của hacker, sau khi nhận được mảng URL trên, sẽ sử dụng các URL đó để tải ảnh. Đáng chú ý, các URL này không trỏ về Backend FastAPI, mà trỏ thẳng đến MinIO Object Storage Cluster. MinIO được thiết kế (bằng ngôn ngữ Go) chuyên biệt tốt cho việc phân phối nội dung tĩnh. Nó có khả năng mở rộng hàng chục Node và sử dụng cơ chế truyền tải Zero-copy của hệ điều hành để đẩy dữ liệu qua mạng với tốc độ tối đa của card mạng vật lý, mà không tốn CPU tính toán.<br><br>Khi hacker tung hàng chục ngàn request tải ảnh, Application Cluster Hoàn toàn bình yên vô sự. CPU rảnh rỗi, RAM trống trơn. Các API đăng nhập, chat, tìm kiếm truyện vẫn hoạt động tốt. MinIO Cluster Hứng trọn lượng traffic khổng lồ này. Nếu traffic vượt quá ngưỡng của cổng mạng, những file ảnh tải về có thể bị chậm đi, nhưng bản thân phần mềm MinIO sẽ không sập. |

**4.4. Xác thực yêu cầu về Khả năng mở rộng (Scalability)**

|     |     |     |
| --- | --- | --- |
| **Thuộc tính chất lượng (Quality Attribute)** | **Sự cố giả định (Stimulus)** | **Phản hồi của hệ thống (Response)** |
| **4\. Khả năng mở rộng (Scalability)**<br><br>_(Khả năng đáp ứng khi lượng truy cập hoặc dữ liệu tăng đột biến)_ | **Sự cố 1:** Bộ truyện "One Piece" ra chương mới, lượng người dùng truy cập vào xem cùng lúc tăng gấp 20 lần bình thường. | Có ba lớp để scale cho vấn đề:<br><br>Lớp 1: Đỡ tải Database bằng Redis Cluster (In-memory Cache)<br><br>Thay vì bắt Database đọc dữ liệu từ ổ cứng, hệ thống của nhóm dùng Redis - cơ sở dữ liệu lưu trữ hoàn toàn trên RAM. Khi Uploader vừa đăng chương mới của "One Piece", Catalog Service đã chủ động nạp sẵn (Cache Warming) các thông tin metadata (Tên truyện, số trang, danh sách URL ảnh) lên RAM của Redis. Khi luồng traffic khổng lồ x20 lần ập đến, các request chỉ đi đến RAM (tốc độ phản hồi tính bằng micro-giây) và cache hit về ngay lập tức. Cụm Database ở phía sau hầu như không cảm nhận được lượng trafic khổng lồ này, duy trì sự ổn định cho các tính năng khác.<br><br>Lớp 2: Gánh tải băng thông bằng MinIO (Object Storage)<br><br>Như đã giải thích ở kịch bản bảo mật, Catalog API chỉ trả về chuỗi text rất nhẹ (Presigned URLs). Trách nhiệm truyền tải hàng Terabyte hình ảnh được giao phó hoàn toàn cho cụm MinIO Cluster. Khác với máy chủ Backend thông thường, máy chủ MinIO được thiết kế chuyên dụng cho I/O mạng (sẵn tiện, I/O luôn là một trong những thao tác gây hao tổn performance nặng nề nhất cho bất kỳ hệ thống nào). Nếu lưu lượng quá lớn, nhóm chỉ cần gắn thêm các ổ cứng hoặc thêm các node MinIO vật lý mới vào cụm, băng thông tải ảnh sẽ được phân tán đều. Kiến trúc này cho phép scale theo chiều ngang cực kỳ thuận tiện, cho bất kỳ tình huống tải lớn nào.<br><br>Lớp 3: Co giãn CPU bằng Docker Swarm (Auto-scaling)<br><br>Dù Redis và MinIO đã gánh phần nặng nhất, bản thân Catalog API vẫn phải dùng CPU để phân tích (parse) các HTTP Request, kiểm tra JWT Token của người dùng, và định tuyến. Khi traffic x20 lần, CPU của container Catalog API hiện tại có thể chạm ngưỡng rất cao. Lúc này, cơ sở hạ tầng Docker Swarm sẽ nhận được cảnh báo từ hệ thống giám sát (Prometheus/Grafana). Cơ chế Horizontal Pod Autoscaling (HPA - Mở rộng theo chiều ngang) được kích hoạt. Thay vì chỉ có 2 container Catalog API chạy như bình thường, Swarm sẽ tự động "nhân bản" thành 5, 10, hoặc 20 container Catalog API nằm rải rác trên các máy chủ vật lý khác nhau trong Application Cluster. API Gateway lập tức chia đều 100,000 request đó cho 20 container mới này. Kết quả, tải CPU trên mỗi container giảm xuống mức an toàn. Toàn bộ quá trình này diễn ra tự động trong vài giây mà không cần kỹ sư hệ thống phải thao tác thủ công để cắm thêm RAM hay CPU.<br><br>Quá trình thu hồi tài nguyên (Scale-in): Khả năng mở rộng thực sự tốt là phải đi kèm với Tính đàn hồi (Elasticity) - tức là có nở ra được thì phải co lại được để tiết kiệm tiền server. Sau 2-3 tiếng, khi lượng người đọc truyện đã đọc xong và out ra, traffic trở về mức bình thường. Docker Swarm nhận thấy CPU của 20 container Catalog API đang rảnh rỗi. Nó sẽ tự động ra lệnh terminate bớt các container dư thừa, đưa hệ thống về lại trạng thái 2 container như ban đầu, tối ưu chi phí. |
| **Sự cố 2:** Các tool Crawl (ETL) đồng loạt đẩy 50,000 file ảnh chương truyện mới lên hệ thống vào lúc nửa đêm. | Để giải quyết bài toán này, Nhóm đã áp dụng mẫu kiến trúc Broker Architecture kết hợp với Background Jobs (Celery).<br><br>Bước 1: Fast Intake<br><br>Khi tool Crawl đẩy 50,000 ảnh lên, Media Upload Service chỉ làm đúng 2 việc rất nhẹ: Nhận file và cất tạm vào MinIO. Gửi một tin nhắn (Event/Message) có nội dung kiểu "Ê, có ảnh mới tên là ABC ở đường dẫn XYZ, cần kiểm duyệt nhé!" vào Apache Kafka. Toàn bộ quá trình này chỉ mất vài chục mili-giây. Sau đó, Service lập tức trả về phản hồi 200 OK cho tool Crawl. Kết quả, Tool Crawl đẩy xong 50,000 ảnh trong nháy mắt mà Media Upload Service không hề bị quá tải.<br><br>Bước 2: Apache Kafka đóng vai trò Buffer<br><br>Kafka là một hệ thống phân phối tin nhắn cực kỳ mạnh, được thiết kế để chịu tải hàng triệu tin nhắn mỗi giây. 50,000 sự kiện vừa được tạo ra sẽ nằm gọn gàng trong một Topic (hàng đợi) của Kafka. Kafka đóng vai trò như một hồ chứa, hứng toàn bộ tải lưu lượng này, bảo vệ các thành phần phía sau khỏi bị ngập.<br><br>Bước 3: Asynchronous Processing<br><br>Phía sau Kafka là các AI Worker Nodes (chạy Celery). Khác với API, các Worker này không bị ai hối thúc cả. Chúng đóng vai trò là "Consumer", từ từ pull từng tin nhắn từ Kafka về để xử lý (chạy mô hình AI). Nếu hệ thống chỉ có 2 AI Worker (năng lực xử lý ví dụ 10 ảnh/giây), thì 50,000 ảnh sẽ được giải quyết từ từ trong khoảng vài tiếng khá lâu, nhưng tuyệt nhiên không bao giờ sập vì lượng tải này. Vấn đề ở đây là dù có 50,000 hay 500,000 ảnh, CPU và RAM của AI Worker cũng chỉ hoạt động ở mức trần thiết kế (không bao giờ vượt quá 100%). Hệ thống không bao giờ bị nghẽn cổ chai (bottleneck) dẫn đến crash.<br><br>Mặc khác, nếu muốn xử lý ảnh nhanh hơn, quản trị viên chỉ cần cấp thêm vài máy chủ AI GPU Nodes mới vào cụm Docker Swarm. Nhờ cơ chế Consumer Group của Kafka, các tin nhắn trong hàng đợi sẽ lập tức được chia đều cho cả các Worker cũ và Worker mới. Quá trình Scale-out diễn ra tự nhiên mà không cần sửa bất kỳ dòng code nào. |

**4.5. Xác thực yêu cầu về Độ tin cậy (Reliability)**

|     |     |     |
| --- | --- | --- |
| **Thuộc tính chất lượng (Quality Attribute)** | **Sự cố giả định (Stimulus)** | **Phản hồi của hệ thống (Response)** |
| **5\. Độ tin cậy (Reliability)**<br><br>_(Khả năng hoạt động chính xác, đảm bảo toàn vẹn dữ liệu và không mất mát thông tin)_ | **Sự cố 1:** Trong lúc tiến trình ngầm (AI Worker) đang quét ảnh kiểm duyệt nội dung thì máy chủ AI Node đột nhiên bị cúp điện tắt phụp. | Về bản chất của Message và Broker, khi một file ảnh được tải lên, Media Upload Service tạo ra một sự kiện (Message) đưa vào hàng đợi của Kafka. Điểm quan trọng của Kafka là nó lưu trữ thông điệp trên ổ cứng (Persistent Storage), không phải chỉ trên RAM. Khi một tin nhắn đã vào Kafka, nó an toàn tuyệt đối. Các AI Worker chỉ đóng vai trò là Consumer (người lấy tin nhắn ra đọc và làm việc).<br><br>Đồng thời, Kafka cung cấp cơ chế Acknowledgment – ACK giúp đảm bảo độ tin cậy trong quá trình giao tiếp bất đồng bộ:<br><br>Bước 1: Worker nhận việc (Pulling): AI Worker A (Celery) kết nối đến Kafka và nói "Cho tôi xin một việc". Kafka gửi cho nó sự kiện "Hãy quét bức ảnh xyz.jpg".<br><br>Bước 2: Kafka chuyển trạng thái (Unacknowledged): Lúc này, Kafka không xóa sự kiện đó khỏi hàng đợi. Nó chỉ đánh dấu sự kiện đó là đang được xử lý (in-flight/unacknowledged) bởi Worker A và tạm thời che nó đi không cho các Worker khác thấy.<br><br>Bước 3: Worker Processing: Worker A tải ảnh từ MinIO xuống, load mô hình PyTorch Swin NSFW lên GPU và bắt đầu chạy suy luận. Lúc này sự cố xảy ra! Máy chủ AI Node chứa Worker A bị cúp điện tắt phụp.<br><br>Do bị sập, Worker A không bao giờ gửi được tín hiệu ACK (Tôi đã hoàn thành) về cho Kafka. Kafka phát hiện lỗi Timeout: Mỗi sự kiện giao cho Worker đều có một khoảng thời gian chờ (Timeout, ví dụ: 60 giây). Sau 60 giây không thấy Worker A phản hồi ACK (hoặc Kafka phát hiện Worker A đã ngắt kết nối mạng - Session Timeout), Kafka sẽ kết luận: "Worker A đã chết hoặc gặp lỗi". Ngay lập tức, Kafka gỡ bỏ trạng thái đang xử lý của sự kiện đó, và đưa nó hiển thị trở lại trong hàng đợi. Worker khác (nếu đang rảnh) sẽ đứng ra tiếp quản. Giả sử một AI Worker B (đang chạy trên một máy chủ khác vẫn có điện) sẽ lập tức nhìn thấy sự kiện này. Nó kéo sự kiện về và thực hiện quét bức ảnh xyz.jpg lại từ đầu. Khi Worker B chạy xong, update Database thành công, nó gửi tín hiệu ACK về Kafka. Lúc này, Kafka mới thực sự đánh dấu hoàn thành (Commit offset) và không giao sự kiện này cho ai nữa.<br><br>Toàn bộ quá trình trên trính là diễn giải cho nguyên lý "At-least-once delivery” của Message Broker như trong lý thuyết đã học. Mặc dù hệ thống có thể mất vài phút trễ nải (do phải đợi timeout và làm lại), nhưng quan trọng nhất là Tính toàn vẹn của dữ liệu được bảo vệ tuyệt đối. Không có bất kỳ một bức ảnh nào tải lên mà không qua màng lọc kiểm duyệt (Swin NSFW Filter) dù máy chủ chạy AI có bị sập cháy. Điều này đáp ứng hoàn hảo yêu cầu phi chức năng về quản lý chất lượng nội dung của nền tảng truyện tranh. |
| **Sự cố 2:** Trong quá trình chạy tiến trình Crawl & Đồng bộ dữ liệu (ETL) từ nguồn bên thứ 3 (Mangadex), API của họ đột nhiên trả về file JSON bị lỗi cấu trúc (corrupted). | Như đã mô tả trong Bài 3 (Tiến trình Crawl & Đồng bộ dữ liệu ETL), dữ liệu từ bên ngoài không bao giờ được phép đi thẳng vào nhà chính (Master DB). Nó bắt buộc phải đi qua một filter.<br><br>Bước 1: Extract (Trích xuất) & Intake Filter<br><br>Tiến trình Crawl (chạy định kỳ) gọi API Mangadex để lấy hàng ngàn object JSON. Dữ liệu này đi qua màng lọc đầu tiên là Intake Filter. Nó không lưu vào Master DB, mà lưu toàn bộ vào một vùng đệm gọi là Staging DB (Cơ sở dữ liệu tạm). Ví dụ: Nó tạo ra một lô (batch) dữ liệu mang mã số BATCH_1024 trong Staging DB.<br><br>Bước 2: Transform (Biến đổi & Xác thực)<br><br>Tiếp theo, dữ liệu trong BATCH_1024 đi qua các màng lọc kiểm tra tính hợp lệ (Validation Filters) và màng lọc chuẩn hóa (Translator Filter - như Bài 3 đề cập). Tại đây, màng lọc phát hiện ra JSON bị lỗi cấu trúc (corrupted) – ví dụ UUID bị sai định dạng, hoặc thiếu thông tin chương truyện. Màng lọc lập tức ném ra một Exception và đánh dấu lô BATCH_1024 này là FAILED.<br><br>Nhờ cơ chế Automated Rollback qua Kafka, khi lô dữ liệu bị đánh dấu FAILED, hệ thống không để rác nằm im đó, mà kích hoạt cơ chế tự phục hồi: Tiến trình ETL lập tức bắn một sự kiện CRAWL_BATCH_FAILED {batch_id: "1024"} vào Apache Kafka. Một con Worker chuyên dụng chạy ngầm mang tên Mangadex Rollback Worker (được nhóm thiết kế riêng ở Bài 2) đang lắng nghe trên Kafka sẽ chộp lấy sự kiện này. Worker này chạy các lệnh SQL để Rollback (Xóa sạch) toàn bộ các dòng dữ liệu, ID truyện, ID chương thuộc về BATCH_1024 khỏi Staging DB.<br><br>Cuối cung, quản trị viên được gửi một thông báo (qua Telegram/Email) về việc Mangadex API đang bị lỗi để theo dõi hoặc sửa lại code tool crawl. |

**4.6. Xác thực yêu cầu về Hiệu suất (Performance):** xác thực bằng phương pháp prototype (nếu có)

./.

Copyright©2026, &lt;Nhóm 17&gt;
```



# FILE: src\app\globals.css

- SIZE: 33.00 B
- SHA256: e50aca50fff677430c037273af847577c395704b21d787c866bdd5ed5ba108ec

```css
@import "../styles/globals.css";

```



# FILE: src\app\layout.tsx

- SIZE: 475.00 B
- SHA256: 48fcd6a6ab41bfc75fc1bd7ef7718b5d175dbb6697c563bb5de96a44d75b5ab8

```tsx
import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "MangaLibrary",
  description: "Frontend for MangaLibrary FastAPI reading platform",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

```



# FILE: src\app\page.tsx

- SIZE: 5.98 KB
- SHA256: d36a569d131d638c67da75dd75433ee0c40aceec566bc6dac82196f7a13466b7

```tsx
"use client";

import Link from "next/link";
import { ArrowRight, Compass, Sparkles, Star, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { MangaCover } from "@/components/features/MangaCover";
import { MangaGrid } from "@/components/features/MangaGrid";
import { useLatestManga, useMangaList, useRecentlyAdded } from "@/hooks/useMangaQueries";
import { formatNumber, titleCase } from "@/lib/utils";

export default function HomePage() {
  const latest = useLatestManga(1, 12);
  const recent = useRecentlyAdded(1, 12);
  const popular = useMangaList({ page: 1, limit: 6, sort: "follows_desc" });
  const featured = latest.data?.items[0] ?? popular.data?.items[0];

  return (
    <div>
      {/* ═══ HERO ═══ */}
      <section className="relative min-h-[460px] overflow-hidden bg-[#111]">
        {featured?.cover_url ? (
          <img src={featured.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30 blur-sm" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a2e] to-[#0d0d0d]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d0d] via-[#0d0d0d]/60 to-transparent" />
        <div className="page-shell relative flex min-h-[460px] items-end pb-10 pt-16">
          {featured ? (
            <div className="grid w-full gap-6 md:grid-cols-[180px_1fr] md:items-end animate-fadeIn">
              <MangaCover
                src={featured.cover_url}
                title={featured.TitleEn}
                className="hidden aspect-[2/3] w-44 rounded-lg border border-white/10 shadow-2xl md:block"
              />
              <div className="max-w-3xl">
                <div className="mb-4 flex flex-wrap gap-2">
                  <span className="rounded-def bg-accent px-3 py-1 text-xs font-bold uppercase text-white">Featured</span>
                  <span className="rounded-def bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur-sm">
                    {titleCase(featured.Status)}
                  </span>
                </div>
                <h1 className="font-heading text-4xl font-bold leading-10 text-white md:text-5xl md:leading-[56px]">
                  {featured.TitleEn ?? "Explore manga catalog"}
                </h1>
                <div className="mt-4 flex flex-wrap gap-5 text-sm text-white/80">
                  <span className="inline-flex items-center gap-2">
                    <Star className="h-4 w-4 text-accent" aria-hidden />
                    {(featured.stats?.AverageRating ?? 0).toFixed(1)} rating
                  </span>
                  <span>{formatNumber(featured.stats?.Follows)} follows</span>
                  <span>{featured.Year ?? "Unknown year"}</span>
                  <span>{titleCase(featured.PublicationDemographic)}</span>
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href={`/manga/${featured.MangaId}`}>
                    <Button>
                      Read detail
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </Button>
                  </Link>
                  <Link href="/explore">
                    <Button variant="light">
                      <Compass className="h-4 w-4" aria-hidden />
                      Explore
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-3xl">
              <Skeleton className="h-8 w-32 bg-white/10" />
              <Skeleton className="mt-5 h-16 w-full bg-white/10" />
              <Skeleton className="mt-4 h-5 w-2/3 bg-white/10" />
            </div>
          )}
        </div>
      </section>

      {/* ═══ LATEST UPDATES ═══ */}
      <section className="page-shell">
        <SectionHeader
          eyebrow="Live catalog"
          title="Latest updates"
          description="Freshly updated manga ordered by backend UpdatedAt metadata."
          href="/explore?sort=recent"
        />
        <MangaGrid items={latest.data?.items} isLoading={latest.isLoading} />
      </section>

      {/* ═══ RECENTLY ADDED ═══ */}
      <section className="section-band">
        <div className="page-shell">
          <SectionHeader
            eyebrow="Recently added"
            title="New in library"
            description="New catalog entries from the Manga Info service."
            href="/explore?sort=year_desc"
          />
          <MangaGrid items={recent.data?.items} isLoading={recent.isLoading} variant="compact" />
        </div>
      </section>

      {/* ═══ MOST FOLLOWED ═══ */}
      <section className="page-shell">
        <SectionHeader
          eyebrow="Discovery"
          title="Most followed"
          description="A quick scan of high-signal titles using the statistics table."
          href="/explore?sort=follows_desc"
        />
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <MangaGrid items={popular.data?.items} isLoading={popular.isLoading} variant="wide" />
          <aside className="card p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white">
              <TrendingUp className="h-6 w-6" aria-hidden />
            </div>
            <h2 className="mt-5 font-heading text-2xl font-semibold text-tx">Built for scale</h2>
            <p className="mt-3 text-sm leading-6 text-tx-muted">
              Reader pages use presigned URLs from MinIO, while catalog data remains light and cache-friendly through TanStack Query.
            </p>
            <div className="mt-5 flex items-center gap-2 text-sm font-bold text-accent">
              <Sparkles className="h-4 w-4" aria-hidden />
              FastAPI + MinIO ready
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

```



# FILE: src\app\providers.tsx

- SIZE: 1.36 KB
- SHA256: 4b94da102d2f95733e81bbdb8bf4d0b2b544dd9b9c7c8817be4fc8b504cc2eff

```tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { ToastProvider } from "@/components/ui/Toast";
import { useAppStore } from "@/store/useAppStore";

function ThemeApplier() {
  const theme = useAppStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 30,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  const [hydrated, setHydrated] = useState(false);

  // Rehydrate Zustand store on client (skipHydration: true)
  useEffect(() => {
    useAppStore.persist.rehydrate();
    setHydrated(true);
  }, []);

  // Don't render anything until the store is rehydrated
  // This prevents hydration mismatch (server has no theme, client does)
  if (!hydrated) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ThemeApplier />
        <AppShell>{children}</AppShell>
      </ToastProvider>
    </QueryClientProvider>
  );
}


```



# FILE: src\app\admin\page.tsx

- SIZE: 20.35 KB
- SHA256: 12094638980bbb3486e3134a063f3e19480f0d8282b88f74fc041633957a5424

```tsx
"use client";

import { useEffect, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity, Ban, BarChart3, BookOpen, CheckCircle, MessageSquare,
  Search, Shield, Trash2, Users, UserX, X,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { cn, formatDate, formatNumber } from "@/lib/utils";
import { adminService } from "@/services/admin.service";
import type { User } from "@/types/user";

type AdminTab = "overview" | "users" | "reports";

export default function AdminPage() {
  const router = useRouter();
  const { isAdmin, isLoadingUser } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");

  // Redirect non-admin users
  useEffect(() => {
    if (!isLoadingUser && !isAdmin) {
      router.replace("/");
    }
  }, [isAdmin, isLoadingUser, router]);

  if (isLoadingUser) {
    return (
      <div className="page-shell">
        <Skeleton className="h-16 mb-4" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="page-shell">
      {/* ── Header ── */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-white">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-heading text-3xl font-bold text-tx">Admin Dashboard</h1>
            <p className="text-sm text-tx-muted">Monitor platform activity, manage users, and review reported content.</p>
          </div>
        </div>
      </div>

      {/* ── Tab Navigation ── */}
      <div className="flex gap-1 rounded-lg border border-bd bg-surface p-1 mb-6">
        {([
          { id: "overview" as const, label: "Overview", icon: BarChart3 },
          { id: "users" as const, label: "Users", icon: Users },
          { id: "reports" as const, label: "Reports", icon: MessageSquare },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-all",
              activeTab === tab.id
                ? "bg-accent text-white shadow-sm"
                : "text-tx-muted hover:bg-surface-2 hover:text-tx"
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      {activeTab === "overview" && <OverviewTab />}
      {activeTab === "users" && <UsersTab />}
      {activeTab === "reports" && <ReportsTab />}
    </div>
  );
}

/* ═══════════════════════════════════════════
   OVERVIEW TAB
   ═══════════════════════════════════════════ */
function OverviewTab() {
  const { isAdmin } = useAuth();
  const dashboard = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: () => adminService.dashboard(),
    enabled: isAdmin,
  });

  return (
    <div className="space-y-6">
      {/* Metrics */}
      <section className="grid gap-4 md:grid-cols-3">
        {dashboard.isLoading ? (
          [1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)
        ) : (
          <>
            <MetricCard
              label="Total Users"
              value={dashboard.data?.totals.users ?? 0}
              icon={Users}
              color="accent"
            />
            <MetricCard
              label="Total Manga"
              value={dashboard.data?.totals.manga ?? 0}
              icon={BookOpen}
              color="sky"
            />
            <MetricCard
              label="Pending Reports"
              value={dashboard.data?.totals.pending_reports ?? 0}
              icon={MessageSquare}
              color="warning"
            />
          </>
        )}
      </section>

      {/* Charts */}
      <section className="grid gap-6 xl:grid-cols-2">
        <div className="card p-5">
          <h2 className="font-heading text-xl font-semibold text-tx">Top Manga by Readers</h2>
          <p className="mt-1 text-sm text-tx-muted">Most read manga in the last 30 days</p>
          <div className="mt-5 space-y-3">
            {dashboard.data?.top_manga?.length ? (
              dashboard.data.top_manga.map((item, index) => {
                const maxReaders = Math.max(...(dashboard.data?.top_manga?.map(m => m.readers) ?? [1]));
                return (
                  <div key={item.manga_id} className="flex items-center gap-3">
                    <span className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      index < 3 ? "bg-accent text-white" : "bg-surface-2 text-tx-muted"
                    )}>
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-tx">{item.title ?? item.manga_id}</p>
                      <div className="mt-1 h-2 rounded-full bg-surface-2 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-accent to-accent/60 transition-all duration-500"
                          style={{ width: `${Math.max((item.readers / maxReaders) * 100, 5)}%` }}
                        />
                      </div>
                    </div>
                    <span className="shrink-0 text-sm font-bold text-tx tabular-nums">{item.readers}</span>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-tx-muted">No reading activity in selected range.</p>
            )}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-heading text-xl font-semibold text-tx">Activity Window</h2>
          <p className="mt-1 text-sm text-tx-muted">Platform engagement over the last 30 days</p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <AdminChart title="New Users" data={dashboard.data?.new_users_by_date} color="var(--accent)" />
            <AdminChart title="Reading Activity" data={dashboard.data?.reading_activity_by_date} color="var(--sky)" />
          </div>
        </div>
      </section>
    </div>
  );
}

/* ═══════════════════════════════════════════
   USERS TAB
   ═══════════════════════════════════════════ */
function UsersTab() {
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const users = useQuery({
    queryKey: ["admin", "users", search, page],
    queryFn: () => adminService.users({ q: search, limit: 20, page }),
    enabled: isAdmin,
  });

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-bd p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-heading text-xl font-semibold text-tx">User Management</h2>
            <p className="text-sm text-tx-muted">
              {users.data?.total ?? 0} total users
            </p>
          </div>
          <div className="relative sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tx-muted" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search users..."
              className="w-full rounded-lg bg-surface-2 py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-accent border border-bd"
            />
          </div>
        </div>
      </div>

      {/* Table header */}
      <div className="hidden border-b border-bd bg-surface-2 px-4 py-2 text-xs font-bold text-tx-muted uppercase tracking-wider sm:grid sm:grid-cols-[1fr_140px_100px_80px_100px]">
        <span>User</span>
        <span>Email</span>
        <span>Role</span>
        <span>Status</span>
        <span className="text-right">Actions</span>
      </div>

      {users.isLoading ? (
        <div className="space-y-2 p-4">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-14" />)}
        </div>
      ) : users.data?.items?.length ? (
        <div className="divide-y divide-bd">
          {users.data.items.map((user) => (
            <AdminUserRow key={user.UserId} user={user} />
          ))}
        </div>
      ) : (
        <div className="p-8">
          <EmptyState title="No users found" description="Try a different search term." icon={Users} />
        </div>
      )}

      {/* Pagination */}
      {(users.data?.total_pages ?? 0) > 1 && (
        <div className="flex items-center justify-between border-t border-bd p-4">
          <p className="text-xs text-tx-muted">
            Page {page} of {users.data?.total_pages}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="light" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              Previous
            </Button>
            <Button size="sm" variant="light" disabled={page >= (users.data?.total_pages ?? 1)} onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   REPORTS TAB
   ═══════════════════════════════════════════ */
function ReportsTab() {
  const { isAdmin } = useAuth();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const comments = useQuery({
    queryKey: ["admin", "comments", status, page],
    queryFn: () => adminService.reportedComments({ status: status || undefined, limit: 20, page }),
    enabled: isAdmin,
  });

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-bd p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-heading text-xl font-semibold text-tx">Reported Comments</h2>
            <p className="text-sm text-tx-muted">
              {comments.data?.total ?? 0} total reports
            </p>
          </div>
          <Select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="sm:w-44"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="resolved">Resolved</option>
            <option value="ignored">Ignored</option>
          </Select>
        </div>
      </div>

      {comments.isLoading ? (
        <div className="space-y-2 p-4">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : comments.data?.items?.length ? (
        <div className="divide-y divide-bd">
          {comments.data.items.map((comment) => (
            <ReportedCommentRow key={comment.comment_id} comment={comment} />
          ))}
        </div>
      ) : (
        <div className="p-8">
          <EmptyState
            title={status ? `No ${status} reports` : "No reports yet"}
            description="Reported comments from users will appear here."
            icon={MessageSquare}
          />
        </div>
      )}

      {/* Pagination */}
      {(comments.data?.total_pages ?? 0) > 1 && (
        <div className="flex items-center justify-between border-t border-bd p-4">
          <p className="text-xs text-tx-muted">
            Page {page} of {comments.data?.total_pages}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="light" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              Previous
            </Button>
            <Button size="sm" variant="light" disabled={page >= (comments.data?.total_pages ?? 1)} onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   COMPONENTS
   ═══════════════════════════════════════════ */
function MetricCard({ label, value, icon: Icon, color }: {
  label: string; value: number; icon: React.ComponentType<{ className?: string }>;
  color: "accent" | "sky" | "warning";
}) {
  const colorMap = {
    accent: "bg-accent/10 text-accent",
    sky: "bg-sky-500/10 text-sky-500",
    warning: "bg-amber-500/10 text-amber-500",
  };
  return (
    <div className="card p-5 flex items-start gap-4">
      <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", colorMap[color])}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm font-semibold text-tx-muted">{label}</p>
        <p className="mt-1 font-heading text-3xl font-bold text-tx tabular-nums">{formatNumber(value)}</p>
      </div>
    </div>
  );
}

function AdminChart({ title, data, color }: { title: string; data?: Record<string, number>; color: string }) {
  const chartData = Object.entries(data ?? {}).slice(-14).map(([date, value]) => ({
    name: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    value,
  }));

  return (
    <div>
      <p className="mb-3 text-sm font-bold text-tx">{title}</p>
      <div className="h-40 rounded-def border border-bd bg-surface-2 p-4">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`color-${title}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Tooltip
                contentStyle={{ backgroundColor: "var(--surface)", borderColor: "var(--bd)", borderRadius: "6px" }}
                itemStyle={{ color: "var(--tx)", fontWeight: "bold" }}
                labelStyle={{ color: "var(--tx-muted)", marginBottom: "4px" }}
              />
              <Area
                type="monotone"
                dataKey="value"
                name={title}
                stroke={color}
                strokeWidth={2}
                fillOpacity={1}
                fill={`url(#color-${title})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-tx-muted">No data</p>
          </div>
        )}
      </div>
    </div>
  );
}

function AdminUserRow({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const banMutation = useMutation({
    mutationFn: () => (user.IsLocked ? adminService.unbanUser(user.UserId) : adminService.banUser(user.UserId)),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      toast(data.message ?? "User status updated", "success");
    },
    onError: () => toast("Failed to update user status", "error"),
  });

  return (
    <div className="flex items-center gap-3 p-4 hover:bg-surface-2 transition-colors">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-bg text-sm font-bold text-accent">
        {user.Username.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-bold text-tx">{user.Username}</p>
          {user.DisplayName && (
            <span className="text-xs text-tx-muted">({user.DisplayName})</span>
          )}
        </div>
        <p className="truncate text-xs text-tx-muted">{user.Email} · Joined {formatDate(user.CreatedAt)}</p>
      </div>
      <Badge tone={user.Role === "admin" ? "sky" : "default"} className="shrink-0">
        {user.Role}
      </Badge>
      <Badge tone={user.IsLocked ? "red" : "default"} className="shrink-0">
        {user.IsLocked ? "Locked" : "Active"}
      </Badge>
      {user.Role !== "admin" && (
        <Button
          size="sm"
          variant={user.IsLocked ? "light" : "danger"}
          onClick={() => banMutation.mutate()}
          isLoading={banMutation.isPending}
          className="shrink-0"
        >
          {user.IsLocked ? (
            <><CheckCircle className="h-4 w-4" aria-hidden /> Unban</>
          ) : (
            <><Ban className="h-4 w-4" aria-hidden /> Ban</>
          )}
        </Button>
      )}
    </div>
  );
}

function ReportedCommentRow({
  comment,
}: {
  comment: {
    comment_id: string;
    content?: string | null;
    username?: string | null;
    manga_title?: string | null;
    report_count: number;
    created_at?: string | null;
  };
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const deleteMutation = useMutation({
    mutationFn: () => adminService.deleteComment(comment.comment_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "comments"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      toast("Comment deleted and reports resolved", "success");
    },
  });
  const ignoreMutation = useMutation({
    mutationFn: () => adminService.ignoreComment(comment.comment_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "comments"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      toast("Reports ignored", "success");
    },
  });

  return (
    <article className="p-4 hover:bg-surface-2 transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--red)]/10 text-[var(--red)]">
          <UserX className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-tx">{comment.username ?? "Unknown"}</p>
            <Badge tone="warning">{comment.report_count} {comment.report_count === 1 ? "report" : "reports"}</Badge>
            <span className="text-xs text-tx-muted">on <span className="font-semibold">{comment.manga_title ?? "Unknown manga"}</span></span>
          </div>
          <p className="mt-1 text-xs text-tx-muted">{formatDate(comment.created_at)}</p>
          <div className="mt-2 rounded-lg border border-bd bg-surface-2 p-3">
            <p className="line-clamp-3 text-sm leading-6 text-tx-muted italic">"{comment.content}"</p>
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="danger" onClick={() => deleteMutation.mutate()} isLoading={deleteMutation.isPending}>
              <Trash2 className="h-4 w-4" aria-hidden />
              Delete Comment
            </Button>
            <Button size="sm" variant="light" onClick={() => ignoreMutation.mutate()} isLoading={ignoreMutation.isPending}>
              <X className="h-4 w-4" aria-hidden />
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

```



# FILE: src\app\auth\login\page.tsx

- SIZE: 2.87 KB
- SHA256: cd171fc677c9ffcdc1ece175f1a6bebee22e9e6513e00f23258d90001c006dc6

```tsx
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { LogIn } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/hooks/useAuth";
import { getApiErrorMessage } from "@/services/api";
import type { User } from "@/types/user";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await login.mutateAsync({ username, password });

      // After successful login, check if user is admin and redirect accordingly
      const me = queryClient.getQueryData<User>(["auth", "me"]);

      if (me?.Role === "admin") {
        router.push("/admin");
      } else {
        router.push(params.get("next") ?? "/");
      }
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }

  return (
    <main className="page-shell flex min-h-[calc(100vh-4rem)] items-center justify-center">
      <section className="w-full max-w-md rounded-def border border-bd bg-surface p-6 shadow-floating">
        <div className="mb-6">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white">
            <LogIn className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="font-heading text-3xl font-bold text-tx">Login</h1>
          <p className="mt-2 text-sm text-tx-muted">Use your backend JWT account to unlock lists, rating, comments, and reading history.</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Input label="Username" value={username} onChange={(event) => setUsername(event.target.value)} required autoComplete="username" />
          <Input label="Password" value={password} onChange={(event) => setPassword(event.target.value)} required type="password" autoComplete="current-password" />
          {error ? <p className="text-sm font-semibold text-[var(--red)]">{error}</p> : null}
          <Button type="submit" className="w-full" isLoading={login.isPending}>
            Login
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-tx-muted">
          New here?{" "}
          <Link href="/auth/register" className="font-bold text-accent hover:underline">
            Create account
          </Link>
        </p>
      </section>
    </main>
  );
}
```



# FILE: src\app\auth\register\page.tsx

- SIZE: 2.61 KB
- SHA256: 58a5df7ab442830963cd6e33b9e13fd4d2ef70ba2bbf7a286a6cbde8e6dac4ef

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/hooks/useAuth";
import { getApiErrorMessage } from "@/services/api";

export default function RegisterPage() {
  const router = useRouter();
  const { register, login } = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await register.mutateAsync({ username, email, password });
      await login.mutateAsync({ username, password });
      router.push("/");
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }

  return (
    <main className="page-shell flex min-h-[calc(100vh-4rem)] items-center justify-center">
      <section className="w-full max-w-md rounded-def border border-bd bg-surface p-6 shadow-floating">
        <div className="mb-6">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white">
            <UserPlus className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="font-heading text-3xl font-bold text-tx">Create account</h1>
          <p className="mt-2 text-sm text-tx-muted">Register through `/api/v1/auth/register`, then login automatically.</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Input label="Username" value={username} onChange={(event) => setUsername(event.target.value)} required autoComplete="username" />
          <Input label="Email" value={email} onChange={(event) => setEmail(event.target.value)} required type="email" autoComplete="email" />
          <Input label="Password" value={password} onChange={(event) => setPassword(event.target.value)} required type="password" autoComplete="new-password" />
          {error ? <p className="text-sm font-semibold text-[var(--red)]">{error}</p> : null}
          <Button type="submit" className="w-full" isLoading={register.isPending || login.isPending}>
            Create account
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-tx-muted">
          Already have an account?{" "}
          <Link href="/auth/login" className="font-bold text-accent hover:underline">
            Login
          </Link>
        </p>
      </section>
    </main>
  );
}
```



# FILE: src\app\chat\page.tsx

- SIZE: 20.34 KB
- SHA256: db221efb1f6fd0c27d751100ba74c89b09c61b443ca658984879f94bf8f23ad6

```tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Hash, ImagePlus, MessageCircle, Plus, Search,
  Send, Smile, Users, X, Circle,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { cn, formatDate } from "@/lib/utils";
import { chatApi, chatService } from "@/services/chat.service";
import { api } from "@/services/api";
import type { ChatMessage, ChatRoom, WsEvent } from "@/services/chat.service";

export default function ChatPage() {
  const { user, isAuthenticated, token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // ── Rooms query ──
  const roomsQuery = useQuery({
    queryKey: ["chat", "rooms"],
    queryFn: () => chatApi.getRooms(),
    enabled: isAuthenticated,
    refetchInterval: 15000, // Refresh every 15s
  });

  const rooms = roomsQuery.data ?? [];
  const selectedRoom = rooms.find((r) => r.room_id === selectedRoomId) ?? null;

  if (!isAuthenticated) {
    return (
      <div className="page-shell">
        <EmptyState title="Login required" description="Sign in to access chat." icon={MessageCircle} />
      </div>
    );
  }

  return (
    <div className="page-shell !p-0 flex h-[calc(100vh-64px)] overflow-hidden">
      {/* ── Sidebar: Room List ── */}
      <aside
        className={cn(
          "flex w-80 shrink-0 flex-col border-r border-bd bg-surface transition-all",
          selectedRoomId ? "hidden md:flex" : "flex w-full md:w-80",
        )}
      >
        <div className="flex items-center justify-between border-b border-bd p-4">
          <h2 className="font-heading text-xl font-bold">Messages</h2>
          <Button size="icon" variant="ghost" onClick={() => setShowNewChat(true)} aria-label="New chat">
            <Plus className="h-5 w-5" />
          </Button>
        </div>

        {/* Search */}
        <div className="border-b border-bd p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tx-muted" />
            <input
              type="text"
              placeholder="Search conversations..."
              className="w-full rounded-lg bg-surface-2 py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-accent"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Room List */}
        <div className="flex-1 overflow-y-auto">
          {roomsQuery.isLoading ? (
            <div className="space-y-2 p-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : rooms.length ? (
            rooms
              .filter((r) => !searchQuery || r.name?.toLowerCase().includes(searchQuery.toLowerCase()))
              .map((room) => (
                <RoomItem
                  key={room.room_id}
                  room={room}
                  isSelected={room.room_id === selectedRoomId}
                  currentUserId={user?.UserId ?? ""}
                  onClick={() => setSelectedRoomId(room.room_id)}
                />
              ))
          ) : (
            <div className="p-6 text-center text-sm text-tx-muted">
              No conversations yet. Start one!
            </div>
          )}
        </div>
      </aside>

      {/* ── Main: Chat Thread ── */}
      <main className={cn("flex flex-1 flex-col", !selectedRoomId && "hidden md:flex")}>
        {selectedRoomId && selectedRoom ? (
          <ChatThread
            room={selectedRoom}
            userId={user?.UserId ?? ""}
            token={token}
            onBack={() => setSelectedRoomId(null)}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <MessageCircle className="mx-auto h-12 w-12 text-tx-muted/30" />
              <p className="mt-4 text-sm text-tx-muted">Select a conversation or start a new one</p>
            </div>
          </div>
        )}
      </main>

      {/* ── New Chat Modal ── */}
      {showNewChat && (
        <NewChatModal
          onClose={() => setShowNewChat(false)}
          onCreated={(roomId) => {
            setSelectedRoomId(roomId);
            setShowNewChat(false);
            queryClient.invalidateQueries({ queryKey: ["chat", "rooms"] });
          }}
        />
      )}
    </div>
  );
}

/* ─── Room List Item ──────────────────────────────────── */
function RoomItem({
  room, isSelected, currentUserId, onClick,
}: {
  room: ChatRoom; isSelected: boolean; currentUserId: string; onClick: () => void;
}) {
  const otherUser = room.type === "direct"
    ? room.members.find((m) => m.user_id !== currentUserId)
    : null;
  const avatarLetter = (otherUser?.display_name || otherUser?.username || room.name || "?").charAt(0).toUpperCase();

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-surface-2",
        isSelected && "bg-accent-bg border-l-2 border-accent",
      )}
    >
      <div className="relative h-10 w-10 shrink-0">
        {otherUser?.avatar ? (
          <img src={otherUser.avatar} alt="" className="h-full w-full rounded-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-sm font-bold text-white">
            {room.type === "group" ? <Users className="h-4 w-4" /> : avatarLetter}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <p className="truncate text-sm font-semibold text-tx">{room.name ?? "Chat"}</p>
          {room.last_message?.created_at && (
            <span className="text-xs text-tx-muted">{formatDate(room.last_message.created_at)}</span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-tx-muted">
          {room.last_message?.content ?? "No messages yet"}
        </p>
      </div>
      {room.unread_count > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-bold text-white">
          {room.unread_count}
        </span>
      )}
    </button>
  );
}

/* ─── Chat Thread ─────────────────────────────────────── */
function ChatThread({
  room, userId, token, onBack,
}: {
  room: ChatRoom; userId: string; token: string | null; onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Load message history
  const historyQuery = useQuery({
    queryKey: ["chat", "messages", room.room_id],
    queryFn: () => chatApi.getMessages(room.room_id, 1, 100),
  });

  useEffect(() => {
    if (historyQuery.data?.messages) {
      setMessages(historyQuery.data.messages);
      void chatApi.markRoomRead(room.room_id);
    }
  }, [historyQuery.data, queryClient, room.room_id]);

  // Connect WebSocket
  useEffect(() => {
    chatService.connect(room.room_id, token);

    const unsub = chatService.onMessage((event: WsEvent) => {
      if (event.type === "message") {
        const msg = event as unknown as ChatMessage;
        setMessages((prev) => {
          if (msg.message_id && prev.some((m) => m.message_id === msg.message_id)) return prev;
          return [...prev, {
            ...msg,
            message_type: msg.message_type || "text",
            status: msg.status || "sent",
            is_own: msg.sender_id === userId,
          }];
        });
        void chatApi.markRoomRead(room.room_id);
        void queryClient.invalidateQueries({ queryKey: ["chat", "rooms"] });
      } else if (event.type === "typing") {
        const uid = event.user_id as string;
        const isTyping = event.is_typing as boolean;
        setTypingUsers((prev) => {
          const next = new Set(prev);
          if (isTyping) next.add(uid);
          else next.delete(uid);
          return next;
        });
      }
    });

    return () => {
      unsub();
      chatService.disconnect();
    };
  }, [queryClient, room.room_id, token, userId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Send message
  async function handleSend() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    chatService.sendTyping(false);
    if (chatService.isConnected) {
      chatService.sendMessage(text);
      return;
    }
    const result = await chatApi.sendMessage(room.room_id, text);
    const localMsg: ChatMessage = {
      message_id: result.message_id,
      room_id: room.room_id,
      sender_id: userId,
      content: text,
      message_type: "text",
      status: "sent",
      created_at: result.created_at ?? new Date().toISOString(),
      is_own: true,
    };
    setMessages((prev) => [...prev, localMsg]);
    void queryClient.invalidateQueries({ queryKey: ["chat", "rooms"] });
  }

  // Handle typing indicator
  function handleInputChange(value: string) {
    setInput(value);
    chatService.sendTyping(true);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => chatService.sendTyping(false), 2000);
  }

  // Handle image upload
  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !room) return;

    // Reset input để có thể chọn lại cùng file
    if (fileRef.current) fileRef.current.value = "";

    try {
      const result = await chatApi.uploadMedia(room.room_id, file);

      // Tạo optimistic message để hiển thị ngay lập tức
      const optimisticMsg: ChatMessage = {
        message_id: result.message_id,
        room_id: room.room_id,
        sender_id: userId,
        message_type: "image",
        media_url: result.media_url,
        content: "[Image]",
        status: "sent",
        created_at: new Date().toISOString(),
        is_own: true,
      };
      setMessages((prev) => {
        if (prev.some((m) => m.message_id === optimisticMsg.message_id)) return prev;
        return [...prev, optimisticMsg];
      });
      void queryClient.invalidateQueries({ queryKey: ["chat", "rooms"] });
    } catch (err) {
      console.error("Image upload failed:", err);
    }
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-bd px-4 py-3">
        <button onClick={onBack} className="md:hidden" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-sm font-bold text-white">
          {room.type === "group" ? <Users className="h-4 w-4" /> : (room.name || "?").charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-tx">{room.name ?? "Chat"}</p>
          <p className="text-xs text-tx-muted">
            {room.members.length} member{room.members.length > 1 ? "s" : ""}
            {typingUsers.size > 0 && " · typing..."}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {historyQuery.isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-tx-muted">Start the conversation!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg, idx) => (
              <MessageBubble key={msg.message_id || idx} message={msg} isOwn={msg.sender_id === userId} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-bd p-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="shrink-0 rounded-lg p-2 text-tx-muted hover:bg-surface-2 hover:text-accent transition-colors"
            aria-label="Attach image"
          >
            <ImagePlus className="h-5 w-5" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          <input
            type="text"
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type a message..."
            className="flex-1 rounded-lg bg-surface-2 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent"
          />
          <Button onClick={handleSend} disabled={!input.trim()} size="icon" className="shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );
}

/* ─── Message Bubble ──────────────────────────────────── */
function MessageBubble({ message, isOwn }: { message: ChatMessage; isOwn: boolean }) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const renderContent = (text: string) => {
    if (!text) return null;
    const regex = /([@/][0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/g;
    const parts = text.split(regex);
    return parts.map((part, i) => {
      if (part.match(/^[@/][0-9a-fA-F]{8}-/)) {
        const uuid = part.slice(1);
        return (
          <Link
            key={i}
            href={`/manga/${uuid}`}
            target="_blank"
            className="font-bold underline decoration-accent/50 underline-offset-2 transition-colors hover:text-white"
          >
            {part}
          </Link>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className={cn("flex gap-2", isOwn && "flex-row-reverse")}>
      {!isOwn && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-bold">
          {(message.sender_display_name || message.sender_username || "U").charAt(0).toUpperCase()}
        </div>
      )}
      <div className={cn("max-w-[70%]", isOwn && "text-right")}>
        {!isOwn && (
          <p className="mb-1 text-xs font-semibold text-tx-muted">
            {message.sender_display_name || message.sender_username}
          </p>
        )}
        <div
          className={cn(
            "inline-block rounded-2xl px-4 py-2 text-sm leading-relaxed",
            isOwn
              ? "rounded-br-md bg-accent text-white"
              : "rounded-bl-md bg-surface-2 text-tx",
          )}
        >
          {message.message_type === "image" && message.media_url ? (
            <>
              <img
                src={message.media_url}
                alt=""
                className="max-w-60 cursor-pointer rounded-lg transition-opacity hover:opacity-90"
                onClick={() => setIsPreviewOpen(true)}
              />
              {isPreviewOpen && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
                  onClick={() => setIsPreviewOpen(false)}
                >
                  <div className="relative">
                    <img
                      src={message.media_url!}
                      alt="Preview"
                      className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      className="absolute -right-12 top-0 rounded-full bg-surface/20 p-2 text-white hover:bg-surface/50"
                      onClick={() => setIsPreviewOpen(false)}
                    >
                      <X className="h-6 w-6" />
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            renderContent(message.content ?? "")
          )}
        </div>
        {message.created_at && (
          <p className="mt-1 text-[10px] text-tx-muted/60">
            {new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── New Chat Modal ──────────────────────────────────── */
function NewChatModal({ onClose, onCreated }: { onClose: () => void; onCreated: (roomId: string) => void }) {
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ user_id: string; username: string; display_name?: string | null; avatar?: string | null }>>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function handleSearch() {
    if (!search.trim()) return;
    setLoading(true);
    try {
      const { data } = await api.get<{ users: typeof searchResults }>("/friends/search", {
        params: { q: search },
      });
      setSearchResults(data.users);
    } catch {
      toast("Search failed", "error");
    }
    setLoading(false);
  }

  async function startChat(userId: string) {
    try {
      const result = await chatApi.createRoom("direct", [userId]);
      onCreated(result.room_id);
    } catch {
      toast("Failed to create chat", "error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="card w-full max-w-md p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-xl font-bold">New Conversation</h2>
          <button onClick={onClose} className="text-tx-muted hover:text-tx">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 flex gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search users..."
          />
          <Button onClick={handleSearch} isLoading={loading}>
            <Search className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-4 max-h-60 divide-y divide-bd overflow-y-auto">
          {searchResults.map((u) => (
            <button
              key={u.user_id}
              onClick={() => startChat(u.user_id)}
              className="flex w-full items-center gap-3 p-3 text-left hover:bg-surface-2"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-bg text-sm font-bold text-accent">
                {(u.display_name || u.username || "U").charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold">{u.display_name || u.username}</p>
                <p className="text-xs text-tx-muted">@{u.username}</p>
              </div>
            </button>
          ))}
          {searchResults.length === 0 && search && !loading && (
            <p className="p-4 text-center text-sm text-tx-muted">No users found</p>
          )}
        </div>
      </div>
    </div>
  );
}

```



# FILE: src\app\creator\[id]\page.tsx

- SIZE: 3.45 KB
- SHA256: c659a7cf0a2ea5d74a111a310420e4c4615c196f320111d5c55d50a2f04148b0

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { MangaCard } from "@/components/features/MangaCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { creatorService } from "@/services/creator.service";
import { User } from "lucide-react";
import Image from "next/image";

export default function CreatorPage() {
  const { id } = useParams() as { id: string };

  const { data, isLoading, isError } = useQuery({
    queryKey: ["creator", id],
    queryFn: () => creatorService.getCreator(id),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 md:flex-row">
          <Skeleton className="h-48 w-48 shrink-0 rounded-full" />
          <div className="flex-1 space-y-4 pt-4">
            <Skeleton className="h-10 w-1/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
        <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="aspect-[2/3] w-full rounded-def" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <EmptyState title="Creator not found" description="The creator you are looking for does not exist." />
      </div>
    );
  }

  const { creator, mangas } = data;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* ── Profile Header ── */}
      <section className="flex flex-col items-center gap-6 rounded-def bg-surface-2 p-8 md:flex-row md:items-start">
        <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-bd bg-surface shadow-md md:h-40 md:w-40">
          {creator.image_url ? (
            <Image
              src={creator.image_url}
              alt={creator.name}
              width={160}
              height={160}
              className="h-full w-full object-cover"
            />
          ) : (
            <User className="h-16 w-16 text-tx-muted" />
          )}
        </div>
        
        <div className="flex-1 text-center md:text-left">
          <h1 className="font-heading text-3xl font-bold text-tx">{creator.name}</h1>
          {creator.biography ? (
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-tx-muted">
              {creator.biography}
            </p>
          ) : (
            <p className="mt-4 text-sm italic text-tx-muted/60">No biography available.</p>
          )}
        </div>
      </section>

      {/* ── Manga List ── */}
      <section className="mt-12">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-heading text-2xl font-bold">Works ({mangas.total})</h2>
        </div>

        {mangas.items.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {mangas.items.map((manga) => (
              <MangaCard key={manga.MangaId} manga={manga} />
            ))}
          </div>
        ) : (
          <EmptyState title="No works found" description="This creator hasn't published any manga yet." />
        )}
      </section>
    </main>
  );
}

```



# FILE: src\app\explore\page.tsx

- SIZE: 17.73 KB
- SHA256: 9a12addea74dd0fbe7daddb33bf4a09b681c306d4420abfd04b3b9168919d4cb

```tsx
"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Filter, Grid3X3, LayoutList, List, RotateCcw, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Pagination } from "@/components/ui/Pagination";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Select } from "@/components/ui/Select";
import { MangaGrid } from "@/components/features/MangaGrid";
import { useAdvancedSearch, useTagGroups } from "@/hooks/useMangaQueries";
import { cn } from "@/lib/utils";
import type { AdvancedSearchParams, TagBrief } from "@/types/manga";

const statuses = ["ongoing", "completed", "hiatus", "cancelled"];
const ratings = ["safe", "suggestive", "erotica", "pornographic"];
const demographics = ["shounen", "shoujo", "josei", "seinen"];
const languages = [
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
  { code: "en", label: "English" },
  { code: "vi", label: "Vietnamese" },
];

type TagState = "none" | "include" | "exclude";
type ViewMode = "grid" | "compact" | "wide";

export default function ExplorePage() {
  return (
    <Suspense>
      <ExploreContent />
    </Suspense>
  );
}

function ExploreContent() {
  const searchParams = useSearchParams();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [sort, setSort] = useState(searchParams.get("sort") ?? "follows_desc");
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedRatings, setSelectedRatings] = useState<string[]>([]);
  const [selectedDemographics, setSelectedDemographics] = useState<string[]>([]);
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [originalLang, setOriginalLang] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  // 3-state tag management: none → include → exclude → none
  const [tagStates, setTagStates] = useState<Record<string, TagState>>({});
  const [activeTagGroup, setActiveTagGroup] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(true);

  const includedTags = useMemo(
    () => Object.entries(tagStates).filter(([, s]) => s === "include").map(([id]) => id),
    [tagStates],
  );
  const excludedTags = useMemo(
    () => Object.entries(tagStates).filter(([, s]) => s === "exclude").map(([id]) => id),
    [tagStates],
  );

  const params = useMemo<AdvancedSearchParams>(
    () => ({
      q: q || undefined,
      page,
      limit: 24,
      sort,
      status: selectedStatuses.length ? selectedStatuses.join(",") : undefined,
      content_rating: selectedRatings.length ? selectedRatings.join(",") : undefined,
      demographic: selectedDemographics.length ? selectedDemographics.join(",") : undefined,
      year_from: yearFrom ? Number(yearFrom) : undefined,
      year_to: yearTo ? Number(yearTo) : undefined,
      include_tags: includedTags.length ? includedTags.join(",") : undefined,
      exclude_tags: excludedTags.length ? excludedTags.join(",") : undefined,
      original_lang: originalLang || undefined,
    }),
    [q, page, sort, selectedStatuses, selectedRatings, selectedDemographics, yearFrom, yearTo, includedTags, excludedTags, originalLang],
  );

  const results = useAdvancedSearch(params);
  const tagGroups = useTagGroups();

  const activeFilterCount =
    selectedStatuses.length +
    selectedRatings.length +
    selectedDemographics.length +
    includedTags.length +
    excludedTags.length +
    (yearFrom ? 1 : 0) +
    (yearTo ? 1 : 0) +
    (originalLang ? 1 : 0);

  function cycleTag(tagId: string) {
    setPage(1);
    setTagStates((prev) => {
      const current = prev[tagId] ?? "none";
      const next: TagState = current === "none" ? "include" : current === "include" ? "exclude" : "none";
      if (next === "none") {
        const { [tagId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [tagId]: next };
    });
  }

  function toggleMultiSelect(list: string[], item: string, setter: (v: string[]) => void) {
    setPage(1);
    setter(list.includes(item) ? list.filter((v) => v !== item) : [...list, item]);
  }

  function resetAll() {
    setPage(1);
    setQ("");
    setSort("follows_desc");
    setSelectedStatuses([]);
    setSelectedRatings([]);
    setSelectedDemographics([]);
    setYearFrom("");
    setYearTo("");
    setOriginalLang("");
    setTagStates({});
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPage(1);
  }

  return (
    <div className="page-shell">
      <SectionHeader
        eyebrow="Explore"
        title="Search & filter manga"
        description="Advanced search with include/exclude tags, multi-select filters, and full sorting."
      />

      <form onSubmit={submit} className="card overflow-hidden">
        {/* ═══ SEARCH BAR + VIEW TOGGLE ═══ */}
        <div className="flex flex-wrap items-center gap-3 border-b border-bd p-4">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-def border border-bd bg-surface-2 px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-bg">
            <Search className="h-4 w-4 shrink-0 text-tx-muted" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Title or alt title..."
              className="h-10 min-w-0 flex-1 bg-transparent text-sm text-tx outline-none placeholder:text-tx-muted/60"
            />
          </div>

          <Button
            type="button"
            variant={filtersOpen ? "primary" : "light"}
            size="sm"
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <Filter className="h-4 w-4" aria-hidden />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </Button>

          {/* View mode toggle */}
          <div className="hidden items-center gap-1 rounded-def border border-bd bg-surface-2 p-1 sm:flex">
            {([
              { mode: "grid" as ViewMode, icon: Grid3X3 },
              { mode: "compact" as ViewMode, icon: LayoutList },
              { mode: "wide" as ViewMode, icon: List },
            ]).map(({ mode, icon: Icon }) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={cn(
                  "rounded-sm p-1.5 transition-colors",
                  viewMode === mode ? "bg-accent text-white" : "text-tx-muted hover:text-accent",
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>

        {/* ═══ FILTER PANEL ═══ */}
        {filtersOpen && (
          <div className="border-b border-bd p-4 animate-fadeIn">
            <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
              {/* Left: classic filters */}
              <div className="space-y-4 border-bd lg:border-r lg:pr-4">
                <Select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} label="Sort by">
                  <option value="follows_desc">Most followed</option>
                  <option value="rating_desc">Highest rating</option>
                  <option value="recent">Recently updated</option>
                  <option value="year_desc">Newest year</option>
                  <option value="year_asc">Oldest year</option>
                  <option value="title_asc">Title A→Z</option>
                  <option value="title_desc">Title Z→A</option>
                </Select>

                <div className="grid grid-cols-2 gap-2">
                  <Input value={yearFrom} onChange={(e) => setYearFrom(e.target.value)} placeholder="2000" label="Year from" type="number" />
                  <Input value={yearTo} onChange={(e) => setYearTo(e.target.value)} placeholder="2026" label="Year to" type="number" />
                </div>

                <Select value={originalLang} onChange={(e) => { setOriginalLang(e.target.value); setPage(1); }} label="Original language">
                  <option value="">All languages</option>
                  {languages.map((lang) => (
                    <option key={lang.code} value={lang.code}>{lang.label}</option>
                  ))}
                </Select>

                <MultiToggle
                  title="Status"
                  items={statuses}
                  selected={selectedStatuses}
                  onToggle={(item) => toggleMultiSelect(selectedStatuses, item, setSelectedStatuses)}
                />
                <MultiToggle
                  title="Content rating"
                  items={ratings}
                  selected={selectedRatings}
                  onToggle={(item) => toggleMultiSelect(selectedRatings, item, setSelectedRatings)}
                />
                <MultiToggle
                  title="Demographic"
                  items={demographics}
                  selected={selectedDemographics}
                  onToggle={(item) => toggleMultiSelect(selectedDemographics, item, setSelectedDemographics)}
                />

                <div className="flex gap-2 pt-2">
                  <Button type="submit" className="flex-1">
                    <Search className="h-4 w-4" aria-hidden />
                    Apply
                  </Button>
                  <Button type="button" variant="ghost" onClick={resetAll}>
                    <RotateCcw className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </div>

              {/* Right: Tag selector */}
              <div className="min-w-0">
                <p className="mb-2 text-xs font-bold uppercase text-tx-muted tracking-wide">
                  Tags — click to include (✓), again to exclude (✕)
                </p>

                {/* Tag group tabs */}
                {tagGroups.data && tagGroups.data.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setActiveTagGroup(null)}
                      className={cn(
                        "rounded-def px-2.5 py-1 text-xs font-semibold transition-colors",
                        activeTagGroup === null
                          ? "bg-accent text-white"
                          : "bg-surface-2 text-tx-muted hover:text-accent",
                      )}
                    >
                      All
                    </button>
                    {tagGroups.data.map((group) => (
                      <button
                        key={group.group_name}
                        type="button"
                        onClick={() => setActiveTagGroup(group.group_name)}
                        className={cn(
                          "rounded-def px-2.5 py-1 text-xs font-semibold transition-colors",
                          activeTagGroup === group.group_name
                            ? "bg-accent text-white"
                            : "bg-surface-2 text-tx-muted hover:text-accent",
                        )}
                      >
                        {group.group_name}
                      </button>
                    ))}
                  </div>
                )}

                {/* Tag buttons */}
                <div className="max-h-64 overflow-y-auto rounded-def border border-bd bg-surface-2 p-3">
                  {tagGroups.data
                    ?.filter((g) => !activeTagGroup || g.group_name === activeTagGroup)
                    .map((group) => (
                      <div key={group.group_name} className="mb-3 last:mb-0">
                        <p className="mb-2 text-[10px] font-bold uppercase text-tx-muted tracking-wider">
                          {group.group_name}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {group.tags.map((tag) => (
                            <TagButton
                              key={tag.TagId}
                              tag={tag}
                              state={tagStates[tag.TagId] ?? "none"}
                              onCycle={() => cycleTag(tag.TagId)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  {!tagGroups.data?.length && (
                    <p className="text-sm text-tx-muted">Tags will appear when backend returns taxonomy data.</p>
                  )}
                </div>

                {/* Active tag summary */}
                {(includedTags.length > 0 || excludedTags.length > 0) && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {includedTags.map((id) => {
                      const tag = findTag(tagGroups.data, id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => cycleTag(id)}
                          className="tag-include badge gap-1"
                        >
                          <Check className="h-3 w-3" />
                          {tag?.NameEn ?? id.slice(0, 8)}
                        </button>
                      );
                    })}
                    {excludedTags.map((id) => {
                      const tag = findTag(tagGroups.data, id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => cycleTag(id)}
                          className="tag-exclude badge gap-1"
                        >
                          <X className="h-3 w-3" />
                          {tag?.NameEn ?? id.slice(0, 8)}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setTagStates({})}
                      className="badge text-tx-muted hover:text-accent transition-colors"
                    >
                      Clear all tags
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ RESULTS ═══ */}
        <div className="p-4">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-tx-muted">
              {results.data?.total ?? 0} results · page {results.data?.page ?? page}
            </p>
          </div>
          <MangaGrid items={results.data?.items} isLoading={results.isLoading} variant={viewMode} />
          <Pagination page={page} totalPages={results.data?.total_pages ?? 1} onPageChange={setPage} />
        </div>
      </form>
    </div>
  );
}

/* ═══════════════════════════════════════════
   MULTI-TOGGLE (multi-select filter group)
   ═══════════════════════════════════════════ */
function MultiToggle({
  title,
  items,
  selected,
  onToggle,
}: {
  title: string;
  items: string[];
  selected: string[];
  onToggle: (item: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold text-tx-muted">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onToggle(item)}
            className={cn(
              "rounded-def px-2.5 py-1 text-xs font-semibold transition-colors",
              selected.includes(item)
                ? "bg-accent text-white"
                : "bg-surface-2 text-tx-muted hover:text-accent hover:bg-accent-bg",
            )}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   TAG BUTTON (3-state: none → include → exclude)
   ═══════════════════════════════════════════ */
function TagButton({
  tag,
  state,
  onCycle,
}: {
  tag: TagBrief;
  state: TagState;
  onCycle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onCycle}
      className={cn(
        "badge cursor-pointer transition-all duration-150",
        state === "include" && "tag-include",
        state === "exclude" && "tag-exclude",
        state === "none" && "tag-none hover:border-accent/40 hover:text-accent",
      )}
    >
      {state === "include" && <Check className="h-3 w-3" />}
      {state === "exclude" && <X className="h-3 w-3" />}
      {tag.NameEn}
    </button>
  );
}

/* ═══════════════════════════════════════════
   HELPER
   ═══════════════════════════════════════════ */
function findTag(
  groups: { group_name: string; tags: TagBrief[] }[] | undefined,
  tagId: string,
): TagBrief | undefined {
  if (!groups) return undefined;
  for (const g of groups) {
    const found = g.tags.find((t) => t.TagId === tagId);
    if (found) return found;
  }
  return undefined;
}

```



# FILE: src\app\latest\page.tsx

- SIZE: 3.65 KB
- SHA256: 53517925cb4e35d3d8d5d83ff66b0b7440f77ce3d4abeea9e7f3fd6b01677c68

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LayoutGrid, List as ListIcon, Filter } from "lucide-react";
import { MangaCard } from "@/components/features/MangaCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/hooks/useAuth";
import { mangaService } from "@/services/manga.service";
import { cn } from "@/lib/utils";

export default function LatestUpdatesPage() {
  const { isAuthenticated } = useAuth();
  const [inMyLists, setInMyLists] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["manga", "latest", 1, 40, inMyLists],
    queryFn: () => mangaService.latestUpdates(1, 40, inMyLists),
  });

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 border-b border-bd pb-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold">Latest Updates</h1>
            <p className="mt-2 text-sm text-tx-muted">Manga that have been recently updated with new chapters.</p>
          </div>
          
          <div className="flex items-center gap-4">
            {isAuthenticated && (
              <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-tx-muted hover:text-tx transition-colors">
                <input 
                  type="checkbox" 
                  checked={inMyLists}
                  onChange={(e) => setInMyLists(e.target.checked)}
                  className="rounded border-bd bg-surface text-brand-orange focus:ring-brand-orange"
                />
                <Filter className="h-4 w-4" />
                In my lists
              </label>
            )}
            
            <div className="flex items-center gap-1 rounded-md border border-bd bg-surface p-1">
              <button
                onClick={() => setViewMode("grid")}
                className={cn("rounded px-2 py-1 transition-colors", viewMode === "grid" ? "bg-surface-2 text-tx" : "text-tx-muted hover:text-tx")}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={cn("rounded px-2 py-1 transition-colors", viewMode === "list" ? "bg-surface-2 text-tx" : "text-tx-muted hover:text-tx")}
              >
                <ListIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className={cn("grid gap-4", viewMode === "grid" ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6" : "sm:grid-cols-2 lg:grid-cols-3")}>
          {[...Array(18)].map((_, i) => (
            <Skeleton key={i} className={cn("w-full rounded-def", viewMode === "grid" ? "aspect-[2/3]" : "h-36")} />
          ))}
        </div>
      ) : isError || !data?.items.length ? (
        <EmptyState title="No updates found" description={inMyLists ? "None of the manga in your lists have been updated recently." : "Check back later for new chapters."} />
      ) : (
        <div className={cn("grid gap-4", viewMode === "grid" ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6" : "sm:grid-cols-2 lg:grid-cols-3")}>
          {data.items.map((manga) => (
            <MangaCard key={manga.MangaId} manga={manga} variant={viewMode === "grid" ? "grid" : "wide"} />
          ))}
        </div>
      )}
    </main>
  );
}

```



# FILE: src\app\lists\page.tsx

- SIZE: 10.45 KB
- SHA256: eac25b26c1341942e837fa6699970dcad52d7c534bdfccc99a0f9e7f6249ed50

```tsx
"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { Eye, EyeOff, Library, Pencil, Plus, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { formatDate } from "@/lib/utils";
import { listService } from "@/services/list.service";
import type { MangaListBrief } from "@/types/list";

export default function ListsPage() {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [publicSearch, setPublicSearch] = useState("");

  const mine = useQuery({
    queryKey: ["lists", "mine"],
    queryFn: () => listService.mine(),
    enabled: isAuthenticated,
  });

  const publicLists = useQuery({
    queryKey: ["lists", "public", publicSearch],
    queryFn: () => listService.publicLists({ q: publicSearch, limit: 12, sort: "followers_desc" }),
    enabled: isAuthenticated,
  });

  const createMutation = useMutation({
    mutationFn: () => listService.create({ Name: name, Description: description, Visibility: visibility }),
    onSuccess: () => {
      setName("");
      setDescription("");
      queryClient.invalidateQueries({ queryKey: ["lists"] });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim()) createMutation.mutate();
  }

  if (!isAuthenticated) {
    return (
      <div className="page-shell">
        <EmptyState title="Login required" description="MDLists are private user resources, so the backend requires a JWT token." icon={Library} />
      </div>
    );
  }

  return (
    <div className="page-shell">
      <SectionHeader
        eyebrow="Library"
        title="MDLists"
        description="Create private/public lists, manage items from manga detail, and follow community lists."
      />
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <aside className="card p-4">
          <h2 className="font-heading text-2xl font-semibold">Create list</h2>
          <form onSubmit={submit} className="mt-4 space-y-3">
            <Input label="Name" value={name} onChange={(event) => setName(event.target.value)} required />
            <Input label="Description" value={description} onChange={(event) => setDescription(event.target.value)} />
            <Select label="Visibility" value={visibility} onChange={(event) => setVisibility(event.target.value)}>
              <option value="private">Private</option>
              <option value="public">Public</option>
            </Select>
            <Button type="submit" className="w-full" isLoading={createMutation.isPending}>
              <Plus className="h-4 w-4" aria-hidden />
              Create
            </Button>
          </form>
        </aside>

        <main className="space-y-6">
          <section>
            <h2 className="mb-3 font-heading text-2xl font-semibold">My lists</h2>
            {mine.isLoading ? (
              <div className="grid gap-3 md:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-36" />
                ))}
              </div>
            ) : mine.data?.my_lists.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {mine.data.my_lists.map((list) => (
                  <EditableListCard key={list.ListId} list={list} />
                ))}
              </div>
            ) : (
              <EmptyState title="No personal lists yet" description="Create your first reading list from the form." />
            )}
          </section>

          <section>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="font-heading text-2xl font-semibold">Public lists</h2>
              <Input value={publicSearch} onChange={(event) => setPublicSearch(event.target.value)} placeholder="Search public lists" className="sm:w-72" />
            </div>
            {publicLists.isLoading ? (
              <div className="grid gap-3 md:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-32" />
                ))}
              </div>
            ) : publicLists.data?.items.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {publicLists.data.items.map((list) => (
                  <PublicListCard key={list.ListId} list={list} />
                ))}
              </div>
            ) : (
              <EmptyState title="No public lists found" description="Try another keyword or publish one of your lists." />
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

function EditableListCard({ list }: { list: MangaListBrief }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(list.Name ?? "");
  const [description, setDescription] = useState(list.Description ?? "");
  const [visibility, setVisibility] = useState(list.Visibility);

  const updateMutation = useMutation({
    mutationFn: () => listService.update(list.ListId, { Name: name, Description: description, Visibility: visibility }),
    onSuccess: () => {
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      toast("List updated!", "success");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => listService.remove(list.ListId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      toast("List deleted", "success");
    },
  });

  return (
    <article className="card flex overflow-hidden">
      {/* Cover thumbnail */}
      <Link href={`/lists/${list.ListId}`} className="w-20 shrink-0 bg-surface-2">
        {list.cover_url ? (
          <img src={list.cover_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full min-h-[120px] w-full items-center justify-center">
            <Library className="h-6 w-6 text-tx-muted/40" />
          </div>
        )}
      </Link>
      <div className="flex-1 p-4">
        {editing ? (
          <div className="space-y-2">
            <Input value={name} onChange={(event) => setName(event.target.value)} />
            <Input value={description} onChange={(event) => setDescription(event.target.value)} />
            <Select value={visibility} onChange={(event) => setVisibility(event.target.value)}>
              <option value="private">Private</option>
              <option value="public">Public</option>
            </Select>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => updateMutation.mutate()} isLoading={updateMutation.isPending}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <Link href={`/lists/${list.ListId}`} className="min-w-0">
                <h3 className="truncate font-heading text-xl font-semibold hover:text-brand-orange">{list.Name ?? "Untitled list"}</h3>
              </Link>
              <Badge tone={list.Visibility === "public" ? "sky" : "default"}>
                {list.Visibility === "public" ? <Eye className="mr-1 h-3.5 w-3.5" aria-hidden /> : <EyeOff className="mr-1 h-3.5 w-3.5" aria-hidden />}
                {list.Visibility}
              </Badge>
            </div>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-tx-muted">{list.Description || "No description."}</p>
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-tx-muted">
              <span>{list.ItemCount} items</span>
              <span>{list.FollowerCount} followers</span>
              <span>{formatDate(list.UpdatedAt)}</span>
            </div>
            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="light" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" aria-hidden />
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate()} isLoading={deleteMutation.isPending}>
                <Trash2 className="h-4 w-4" aria-hidden />
                Delete
              </Button>
            </div>
          </>
        )}
      </div>
    </article>
  );
}

function PublicListCard({ list }: { list: MangaListBrief & { owner_username?: string | null; is_following?: boolean } }) {
  const queryClient = useQueryClient();
  const followMutation = useMutation({
    mutationFn: () => (list.is_following ? listService.unfollow(list.ListId) : listService.follow(list.ListId)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lists"] }),
  });

  return (
    <article className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/lists/${list.ListId}`} className="min-w-0">
          <h3 className="truncate font-heading text-xl font-semibold hover:text-brand-orange">{list.Name ?? "Untitled list"}</h3>
          <p className="mt-1 text-xs text-tx-muted">by {list.owner_username ?? "unknown"}</p>
        </Link>
        <Badge tone="sky">public</Badge>
      </div>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-tx-muted">{list.Description || "No description."}</p>
      <div className="mt-4 flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-sm text-tx-muted">
          <Users className="h-4 w-4" aria-hidden />
          {list.FollowerCount}
        </span>
        <Button size="sm" onClick={() => followMutation.mutate()} isLoading={followMutation.isPending} variant={list.is_following ? "light" : "primary"}>
          {list.is_following ? "Unfollow" : "Follow"}
        </Button>
      </div>
    </article>
  );
}

```



# FILE: src\app\lists\[id]\page.tsx

- SIZE: 9.45 KB
- SHA256: ec0163785b0edb754c857b8d689da10e0b9ea7573715f57d238ba57c86085d35

```tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, BookmarkCheck, BookOpen, Trash2, Star, Calendar, Shield, LayoutGrid, List as ListIcon } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { cn, titleCase } from "@/lib/utils";
import { listService } from "@/services/list.service";

export default function ListDetailPage() {
  const params = useParams<{ id: string }>();
  const listId = params.id;
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");

  const detail = useQuery({
    queryKey: ["lists", "detail", listId],
    queryFn: () => listService.detail(listId),
  });

  const followMutation = useMutation({
    mutationFn: () => listService.follow(listId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      toast("Followed list!", "success");
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: (mangaId: string) => listService.removeItem(listId, mangaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lists", "detail", listId] });
      toast("Manga removed from list", "success");
    },
  });

  if (detail.isLoading) {
    return (
      <div className="page-shell">
        <Skeleton className="h-52" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      </div>
    );
  }

  if (!detail.data) {
    return (
      <div className="page-shell">
        <EmptyState title="List not found" description="The backend could not find this MDList." />
      </div>
    );
  }

  const list = detail.data;
  const isOwner = user?.UserId === list.owner_id;

  return (
    <div className="page-shell">
      <Link href="/lists" className="focus-ring mb-4 inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold hover:bg-surface-2">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Lists
      </Link>

      {/* ── List Header with Cover ── */}
      <section className="card overflow-hidden">
        <div className="relative">
          {/* Cover background */}
          {list.cover_url ? (
            <div className="relative h-40 overflow-hidden">
              <img src={list.cover_url} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--surface)] via-[var(--surface)]/60 to-transparent" />
            </div>
          ) : (
            <div className="h-24 bg-gradient-to-r from-[var(--accent)]/20 to-[var(--accent-2)]/20" />
          )}
          <div className={cn("px-5 pb-5", list.cover_url ? "-mt-12 relative" : "pt-5")}>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <Badge tone={list.Visibility === "public" ? "sky" : "default"}>{list.Visibility}</Badge>
                <h1 className="mt-3 font-heading text-4xl font-bold">{list.Name ?? "Untitled list"}</h1>
                <p className="mt-2 text-sm text-tx-muted">
                  by {list.owner_username ?? "unknown"} · {list.ItemCount} items · {list.FollowerCount} followers
                </p>
                {list.Description ? (
                  <p className="mt-4 max-w-3xl text-sm leading-6 text-tx-muted">{list.Description}</p>
                ) : null}
              </div>
              {isAuthenticated && !isOwner ? (
                <Button onClick={() => followMutation.mutate()} isLoading={followMutation.isPending}>
                  <BookmarkCheck className="h-4 w-4" aria-hidden />
                  Follow
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* ── Items Grid ── */}
      <section className="mt-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="font-heading text-2xl font-semibold">Manga in this list</h2>
            <Badge tone="default">{list.items.length} items</Badge>
          </div>
          <div className="flex items-center gap-1 rounded-md border border-bd bg-surface p-1">
            <button
              onClick={() => setViewMode("grid")}
              className={cn("rounded px-2 py-1 transition-colors", viewMode === "grid" ? "bg-surface-2 text-tx" : "text-tx-muted hover:text-tx")}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn("rounded px-2 py-1 transition-colors", viewMode === "list" ? "bg-surface-2 text-tx" : "text-tx-muted hover:text-tx")}
            >
              <ListIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
        {list.items.length ? (
          <div className={cn("grid gap-4", viewMode === "grid" ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6" : "sm:grid-cols-2 lg:grid-cols-3")}>
            {list.items.map((item) => (
              <Link
                href={`/manga/${item.manga_id}`}
                key={item.manga_id}
                className={cn("card group relative flex overflow-hidden p-0 transition-all hover:shadow-lg", viewMode === "grid" ? "flex-col aspect-[2/3]" : "gap-3")}
              >
                {/* Cover */}
                <div className={cn("shrink-0 overflow-hidden bg-surface-2 relative", viewMode === "grid" ? "h-full w-full" : "h-full w-24")}>
                  {item.cover_url ? (
                    <img src={item.cover_url} alt={item.title ?? ""} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full min-h-[120px] w-full items-center justify-center text-tx-muted">
                      <BookOpen className="h-8 w-8" />
                    </div>
                  )}
                </div>
                {/* Info */}
                <div className={cn("flex flex-1 flex-col justify-between py-3 pr-3", viewMode === "grid" ? "hidden" : "flex")}>
                  <div>
                    <p className="line-clamp-2 font-bold text-tx transition-colors hover:text-accent">
                      {item.title ?? "Unknown manga"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.status && (
                        <Badge tone="orange">{titleCase(item.status)}</Badge>
                      )}
                      {item.content_rating && (
                        <Badge tone="warning">{titleCase(item.content_rating)}</Badge>
                      )}
                      {item.year && (
                        <span className="inline-flex items-center gap-1 text-xs text-tx-muted">
                          <Calendar className="h-3 w-3" aria-hidden />
                          {item.year}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-xs font-bold text-tx-muted">
                      {item.position}
                    </span>
                    {isOwner && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItemMutation.mutate(item.manga_id)}
                        aria-label="Remove manga"
                        className="h-8 w-8 text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Grid Mode Info */}
                {viewMode === "grid" && (
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100 flex flex-col justify-end p-2">
                    <p className="line-clamp-2 text-xs font-bold text-white">{item.title}</p>
                    {isOwner && (
                       <button
                         onClick={(e) => { e.preventDefault(); removeItemMutation.mutate(item.manga_id); }}
                         className="absolute top-2 right-2 rounded-full bg-black/50 p-1.5 text-red-400 hover:bg-red-500 hover:text-white transition-colors"
                       >
                         <Trash2 className="h-3 w-3" />
                       </button>
                    )}
                  </div>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <div className="card p-6">
            <EmptyState title="No items yet" description="Add manga to this list from a manga detail page." />
          </div>
        )}
      </section>
    </div>
  );
}

```



# FILE: src\app\manga\[id]\page.tsx

- SIZE: 20.31 KB
- SHA256: 83defe545273c3a8f0a679be0444d39b4cf4cc9da8b218408af9658e0e8bdf7c

```tsx
"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, ExternalLink, Languages, Palette, Sparkles, Star, Users } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { MangaCover } from "@/components/features/MangaCover";
import { ChapterList } from "@/components/features/ChapterList";
import { CommentsSection } from "@/components/features/CommentsSection";
import { ListPicker } from "@/components/features/ListPicker";
import { MangaGrid } from "@/components/features/MangaGrid";
import { RatingPanel } from "@/components/features/RatingPanel";
import {
  useChapterLanguages,
  useChapters,
  useMangaDetail,
  useRelatedManga,
  useMangaRecommendations,
} from "@/hooks/useMangaQueries";
import { useAuth } from "@/hooks/useAuth";
import { cn, formatNumber, pickDescription, titleCase } from "@/lib/utils";
import { historyService } from "@/services/history.service";
import { coverService } from "@/services/cover.service";
import type { SimilarMangaItem } from "@/services/analytics.service";

type DetailTab = "chapters" | "art" | "recommendations";

export default function MangaDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const mangaId = params.id;
  const [lang, setLang] = useState("");
  const [sort, setSort] = useState<"asc" | "desc">("asc");
  const [isSynopsisExpanded, setIsSynopsisExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>("chapters");
  const { isAuthenticated } = useAuth();

  const manga = useMangaDetail(mangaId);
  const chapters = useChapters(mangaId, { lang, sort });
  const languages = useChapterLanguages(mangaId);
  const related = useRelatedManga(mangaId);
  const recommendations = useMangaRecommendations(mangaId);

  // Art covers – lazy-loaded only when the Art tab is active
  const artQuery = useQuery({
    queryKey: ["covers", "all", mangaId],
    queryFn: () => coverService.all(mangaId),
    enabled: activeTab === "art" && Boolean(mangaId),
  });

  const continueMutation = useMutation({
    mutationFn: () => historyService.continueReading(mangaId),
    onSuccess: (data) => {
      const chapterId = data.chapter_id ?? chapters.data?.[0]?.ChapterId;
      if (chapterId) {
        router.push(`/read/${mangaId}/${chapterId}${data.last_page ? `?page=${data.last_page}` : ""}`);
      }
    },
    onError: () => {
      const chapterId = chapters.data?.[0]?.ChapterId;
      if (chapterId) router.push(`/read/${mangaId}/${chapterId}`);
    },
  });

  if (manga.isLoading) {
    return (
      <div className="page-shell">
        <Skeleton className="h-[360px]" />
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_340px]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!manga.data) {
    return (
      <div className="page-shell">
        <EmptyState title="Manga not found" description="The backend did not return this manga id." />
      </div>
    );
  }

  const detail = manga.data;
  const description = pickDescription(detail.descriptions);
  const authors = detail.creators.filter(c => c.role?.toLowerCase() === "author");
  const artists = detail.creators.filter(c => c.role?.toLowerCase() === "artist");
  const firstChapter = chapters.data?.[0];

  // Filter related: only show manga-type items with at least a title or cover
  const filteredRelated = (related.data ?? []).filter(
    (item) => item.title !== "Unknown Manga" || item.cover_url
  );

  return (
    <div>
      {/* ── Hero Banner ── */}
      <section className="relative overflow-hidden bg-neutral-dark text-white">
        {detail.cover_url ? <img src={detail.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" /> : null}
        <div className="absolute inset-0 bg-black/65" />
        <div className="page-shell relative grid gap-6 py-10 md:grid-cols-[220px_1fr] md:items-end">
          <MangaCover src={detail.cover_url} title={detail.TitleEn} className="aspect-[2/3] w-48 border border-white/20 shadow-floating md:w-full" />
          <div className="max-w-4xl">
            <div className="mb-4 flex flex-wrap gap-2">
              {detail.Status ? <Badge tone="orange">{titleCase(detail.Status)}</Badge> : null}
              {detail.ContentRating ? <Badge tone="warning">{titleCase(detail.ContentRating)}</Badge> : null}
              {detail.PublicationDemographic ? <Badge tone="sky">{titleCase(detail.PublicationDemographic)}</Badge> : null}
            </div>
            <h1 className="font-heading text-4xl font-bold leading-10 md:text-5xl md:leading-[56px]">{detail.TitleEn ?? "Untitled"}</h1>
            <div className="mt-3 flex flex-col gap-1">
              {authors.length > 0 ? (
                <p className="text-sm text-white/80">
                  {authors.map((a, i) => (
                    <span key={a.id || i}>
                      {a.id ? <Link href={`/creator/${a.id}`} className="hover:text-brand-orange hover:underline">{a.name}</Link> : a.name}
                      {i < authors.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </p>
              ) : null}
              {artists.length > 0 && JSON.stringify(artists) !== JSON.stringify(authors) ? (
                <p className="text-xs text-white/60">
                  🎨 {artists.map((a, i) => (
                    <span key={a.id || i}>
                      {a.id ? <Link href={`/creator/${a.id}`} className="hover:text-brand-orange hover:underline">{a.name}</Link> : a.name}
                      {i < artists.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </p>
              ) : null}
            </div>
            <div className="mt-5 flex flex-wrap gap-5 text-sm text-white/85">
              <span className="inline-flex items-center gap-2">
                <Star className="h-4 w-4 text-brand-orange" aria-hidden />
                {(detail.stats?.AverageRating ?? 0).toFixed(1)}
              </span>
              <span className="inline-flex items-center gap-2">
                <Users className="h-4 w-4" aria-hidden />
                {formatNumber(detail.stats?.Follows)} follows
              </span>
              <span>{detail.Year ?? "Unknown year"}</span>
              <span className="inline-flex items-center gap-2">
                <Languages className="h-4 w-4" aria-hidden />
                {detail.available_languages?.length || 0} languages
              </span>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                onClick={() => (isAuthenticated ? continueMutation.mutate() : firstChapter && router.push(`/read/${mangaId}/${firstChapter.ChapterId}`))}
                isLoading={continueMutation.isPending}
                disabled={!firstChapter && !chapters.isLoading}
              >
                <BookOpen className="h-4 w-4" aria-hidden />
                Continue reading
              </Button>
              {firstChapter ? (
                <Link href={`/read/${mangaId}/${firstChapter.ChapterId}`}>
                  <Button variant="light">
                    First chapter
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Button>
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* ── Main Content Grid ── */}
      <div className="page-shell grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <main className="space-y-6">
          {/* Synopsis */}
          <section className="card p-5">
            <h2 className="font-heading text-2xl font-semibold">Synopsis</h2>
            <div className="relative mt-3">
              <div className={cn("overflow-hidden transition-[max-height] duration-300 ease-in-out prose prose-sm prose-invert max-w-none text-tx-muted", isSynopsisExpanded ? "max-h-[5000px]" : "max-h-32")}>
                {description ? (
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={{
                      hr: ({node, ...props}) => <hr className="my-4 border-bd" {...props} />,
                      a: ({node, ...props}) => <a className="text-brand-orange hover:underline" {...props} />
                    }}
                  >
                    {description}
                  </ReactMarkdown>
                ) : (
                  <p>No description available from backend metadata.</p>
                )}
              </div>
              {!isSynopsisExpanded && description && description.length > 300 && (
                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-surface to-transparent" />
              )}
            </div>
            {description && description.length > 300 && (
              <div className="mt-2 text-center">
                <button
                  onClick={() => setIsSynopsisExpanded(!isSynopsisExpanded)}
                  className="text-xs font-semibold text-brand-orange hover:underline"
                >
                  {isSynopsisExpanded ? "Show less ▲" : "Show more ▼"}
                </button>
              </div>
            )}
            
            {detail.tags?.length ? (
              <div className="mt-6 space-y-4 border-t border-bd pt-4">
                {Object.entries(
                  detail.tags.reduce<Record<string, typeof detail.tags>>((acc, tag) => {
                    const group = tag.GroupName ? titleCase(tag.GroupName) : "Other";
                    if (!acc[group]) acc[group] = [];
                    acc[group].push(tag);
                    return acc;
                  }, {})
                ).map(([group, tags]) => {
                  const groupLower = group.toLowerCase();
                  let tone: "orange" | "sky" | "purple" | "cyan" | "default" = "default";
                  if (groupLower.includes("genre")) tone = "orange";
                  else if (groupLower.includes("theme")) tone = "sky";
                  else if (groupLower.includes("format")) tone = "purple";
                  else if (groupLower.includes("content")) tone = "cyan";

                  return (
                    <div key={group}>
                      <h3 className="mb-2 text-sm font-semibold text-tx">{group}</h3>
                      <div className="flex flex-wrap gap-2">
                        {tags?.map((tag) => (
                          <Badge key={tag.TagId} tone={tone}>
                            {tag.NameEn}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>

          {/* ── Tab Navigation ── */}
          <div className="flex gap-1 rounded-lg border border-bd bg-surface p-1">
            {([
              { id: "chapters" as const, label: "Chapters", icon: BookOpen },
              { id: "art" as const, label: "Art", icon: Palette },
              { id: "recommendations" as const, label: "Recommendations", icon: Sparkles },
            ]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-all",
                  activeTab === tab.id
                    ? "bg-accent text-white shadow-sm"
                    : "text-tx-muted hover:bg-surface-2 hover:text-tx"
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Tab Content ── */}
          {activeTab === "chapters" && (
            <>
              <ChapterList
                mangaId={mangaId}
                chapters={chapters.data}
                languages={languages.data}
                isLoading={chapters.isLoading}
                selectedLang={lang}
                sort={sort}
                onLangChange={setLang}
                onSortChange={setSort}
              />
              <CommentsSection mangaId={mangaId} />
            </>
          )}

          {activeTab === "art" && (
            <section className="card p-5">
              <h2 className="mb-4 font-heading text-2xl font-semibold">Cover Art Gallery</h2>
              {artQuery.isLoading ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                  {[...Array(8)].map((_, i) => (
                    <Skeleton key={i} className="aspect-[2/3] w-full rounded-def" />
                  ))}
                </div>
              ) : artQuery.data?.length ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                  {artQuery.data.map((cover) => (
                    <a
                      key={cover.cover_id}
                      href={cover.cover_url ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="group relative aspect-[2/3] overflow-hidden rounded-def border border-bd bg-surface-2"
                    >
                      <img
                        src={cover.cover_url ?? ""}
                        alt={`Volume ${cover.volume || "?"}`}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <p className="text-xs font-bold text-white">
                          {cover.volume ? `Vol. ${cover.volume}` : "Cover"}
                        </p>
                        {cover.locale && (
                          <p className="text-[10px] text-white/70">{cover.locale}</p>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <EmptyState title="No cover art found" description="This manga has no additional cover art in our database." />
              )}
            </section>
          )}

          {activeTab === "recommendations" && (
            <section className="card p-5">
              <h2 className="mb-4 font-heading text-2xl font-semibold">Recommended For You</h2>
              <p className="mb-6 text-sm text-tx-muted">Similar manga recommended by the MangaDex community.</p>
              {recommendations.isLoading ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {[...Array(10)].map((_, i) => (
                    <Skeleton key={i} className="aspect-[2/3] w-full rounded-def" />
                  ))}
                </div>
              ) : recommendations.data?.recommendations?.length ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {recommendations.data.recommendations.map((item: SimilarMangaItem) => (
                    <Link
                      key={item.MangaId}
                      href={`/manga/${item.MangaId}`}
                      className="group relative flex flex-col overflow-hidden rounded-def border border-bd bg-surface-2 transition-all hover:shadow-lg hover:border-accent/30"
                    >
                      <div className="relative aspect-[2/3] overflow-hidden bg-surface">
                        {item.cover_url ? (
                          <img
                            src={item.cover_url}
                            alt={item.TitleEn ?? ""}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-tx-muted">
                            <BookOpen className="h-8 w-8" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 p-2">
                        <h3 className="line-clamp-2 text-xs font-bold text-tx group-hover:text-accent transition-colors">
                          {item.TitleEn ?? "Unknown"}
                        </h3>
                        {item.Status && (
                          <p className="mt-1 text-[10px] text-tx-muted">{titleCase(item.Status)}</p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No recommendations available"
                  description="This manga doesn't have community recommendations yet."
                  icon={Sparkles}
                />
              )}
            </section>
          )}
        </main>

        {/* ── Sidebar ── */}
        <aside className="space-y-6">
          <RatingPanel mangaId={mangaId} stats={detail.stats} />
          <ListPicker mangaId={mangaId} />
          <section className="card p-4">
            <h2 className="font-heading text-2xl font-semibold">Metadata</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <Meta label="Type" value={detail.Type} />
              <Meta label="Original language" value={detail.OriginalLanguage} />
              <Meta label="Last chapter" value={detail.LastChapter} />
              <Meta label="Last volume" value={detail.LastVolume} />
              <Meta label="Demographic" value={titleCase(detail.PublicationDemographic)} />
              <Meta label="Content rating" value={titleCase(detail.ContentRating)} />
            </dl>
            {detail.alt_titles?.length ? (
              <div className="mt-5 border-t border-bd pt-4">
                <h3 className="mb-2 text-sm font-semibold text-tx">Alternative titles</h3>
                <ul className="space-y-1 text-xs text-tx-muted">
                  {detail.alt_titles.slice(0, 8).map((alt, i) => (
                    <li key={i}>• {alt.AltTitle}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {detail.links?.length ? (
              <div className="mt-5 space-y-2 border-t border-bd pt-4">
                <h3 className="mb-2 text-sm font-semibold text-tx">External links</h3>
                {detail.links.map((link, i) => (
                  <a
                    key={i}
                    href={link.Url ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between border border-bd px-3 py-2 text-sm font-semibold hover:bg-surface-2"
                  >
                    {link.Provider ?? "Link"}
                    <ExternalLink className="h-4 w-4" aria-hidden />
                  </a>
                ))}
              </div>
            ) : null}
          </section>
        </aside>
      </div>

      {/* ── Related Titles ── */}
      {filteredRelated.length > 0 && (
        <section className="section-band">
          <div className="page-shell">
            <h2 className="mb-4 font-heading text-2xl font-semibold">Related titles</h2>
            <MangaGrid
              variant="compact"
              items={filteredRelated.map((item) => ({
                MangaId: item.RelatedId,
                TitleEn: item.title,
                Status: item.related_label,
                cover_url: item.cover_url,
              })) as any}
            />
          </div>
        </section>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-bd pb-2 last:border-b-0">
      <dt className="text-tx-muted">{label}</dt>
      <dd className="text-right font-semibold">{value ?? "Unknown"}</dd>
    </div>
  );
}

```



# FILE: src\app\profile\page.tsx

- SIZE: 27.02 KB
- SHA256: a210efc7f18d3e11dffdc9de3838a2cf58e6638c2c4a729ccf530aba1c51eba3

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3, BookOpen, Camera, ChevronRight, Clock, Edit3, History,
  Lock, LogOut, Mail, Save, Sparkles, User as UserIcon, X,
  Activity, Hash, Star, LayoutGrid, Award, Shield,
} from "lucide-react";
import { FormEvent, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { cn, formatDate } from "@/lib/utils";
import { authService } from "@/services/auth.service";
import { historyService } from "@/services/history.service";
import { getApiErrorMessage } from "@/services/api";
import { analyticsService } from "@/services/analytics.service";
import { recommendationService } from "@/services/analytics.service";
import type { HistoryEntry, HistoryGroup } from "@/types/history";

const TABS = [
  { id: "profile", label: "Profile", icon: UserIcon },
  { id: "history", label: "History", icon: History },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "recommendations", label: "For You", icon: Sparkles },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function ProfilePage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoadingUser, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("profile");

  if (!isAuthenticated && !isLoadingUser) {
    return (
      <div className="page-shell">
        <EmptyState title="Not logged in" description="Login to view your profile." />
      </div>
    );
  }

  if (isLoadingUser || !user) {
    return (
      <div className="page-shell">
        <Skeleton className="h-60" />
        <div className="mt-6 space-y-4">
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      {/* ── Header ── */}
      <section className="card overflow-hidden">
        <div className="relative h-32 bg-gradient-to-r from-[var(--accent)] via-[#ff8c5a] to-[var(--accent-2)]">
          <div className="absolute inset-0 bg-black/20" />
        </div>
        <div className="relative px-5 pb-5">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end">
            <div className="relative -mt-12 h-24 w-24 shrink-0 rounded-full border-4 border-[var(--surface)] bg-[var(--surface-2)] shadow-lg">
              {user.Avatar ? (
                <img src={user.Avatar} alt="Avatar" className="h-full w-full rounded-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-3xl font-bold text-white">
                  {(user.DisplayName || user.Username || "U").charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex-1 py-2">
              <h1 className="font-heading text-2xl font-bold text-tx">
                {user.DisplayName || user.Username}
              </h1>
              <p className="text-sm text-tx-muted">@{user.Username}</p>
              {user.Bio && <p className="mt-1 text-sm text-tx-muted">{user.Bio}</p>}
            </div>
            <div className="flex gap-2">
              <Badge tone={user.Role === "admin" ? "orange" : "sky"}>{user.Role}</Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  logout();
                  router.push("/");
                }}
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Tab Bar ── */}
      <nav className="mt-6 flex gap-1 overflow-x-auto rounded-lg border border-bd bg-surface p-1" role="tablist">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-md px-4 py-2.5 text-sm font-semibold transition-all",
                activeTab === tab.id
                  ? "bg-accent-bg text-accent shadow-sm"
                  : "text-tx-muted hover:bg-surface-2 hover:text-tx",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* ── Tab Content ── */}
      <div className="mt-6 animate-fadeIn">
        {activeTab === "profile" && <ProfileTab />}
        {activeTab === "history" && <HistoryTab />}
        {activeTab === "analytics" && <AnalyticsTab />}
        {activeTab === "recommendations" && <RecommendationsTab />}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   PROFILE TAB
   ═══════════════════════════════════════════ */
function ProfileTab() {
  const { user, updateProfile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    username: user?.Username ?? "",
    email: user?.Email ?? "",
    display_name: user?.DisplayName ?? "",
    bio: user?.Bio ?? "",
  });
  const [passwordForm, setPasswordForm] = useState({ current: "", new: "", confirm: "" });

  const avatarMutation = useMutation({
    mutationFn: (file: File) => authService.uploadAvatar(file),
    onSuccess: () => {
      toast("Avatar updated!", "success");
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
    onError: (e) => toast(getApiErrorMessage(e), "error"),
  });

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) avatarMutation.mutate(file);
  }

  function handleSave(e: FormEvent) {
    e.preventDefault();
    const payload: Record<string, string> = {};
    if (form.username !== user?.Username) payload.username = form.username;
    if (form.email !== user?.Email) payload.email = form.email;
    if (form.display_name !== (user?.DisplayName ?? "")) payload.display_name = form.display_name;
    if (form.bio !== (user?.Bio ?? "")) payload.bio = form.bio;

    if (passwordForm.new) {
      if (passwordForm.new !== passwordForm.confirm) {
        toast("Passwords don't match", "error");
        return;
      }
      payload.current_password = passwordForm.current;
      payload.new_password = passwordForm.new;
    }

    if (Object.keys(payload).length === 0) {
      toast("No changes to save", "info");
      return;
    }

    updateProfile.mutate(payload, {
      onSuccess: () => {
        toast("Profile updated!", "success");
        setEditing(false);
        setPasswordForm({ current: "", new: "", confirm: "" });
      },
      onError: (e) => toast(getApiErrorMessage(e), "error"),
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      {/* Avatar */}
      <div className="card flex flex-col items-center gap-4 p-6">
        <div className="group relative h-36 w-36">
          <div className="h-full w-full overflow-hidden rounded-full border-2 border-bd bg-surface-2">
            {user?.Avatar ? (
              <img src={user.Avatar} alt="Avatar" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-5xl font-bold text-white">
                {(user?.DisplayName || user?.Username || "U").charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            className="absolute bottom-1 right-1 flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white shadow-lg transition hover:scale-110"
            aria-label="Change avatar"
          >
            <Camera className="h-5 w-5" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>
        <div className="text-center">
          <p className="font-heading text-lg font-bold">{user?.DisplayName || user?.Username}</p>
          <p className="text-sm text-tx-muted">@{user?.Username}</p>
        </div>
        <div className="w-full space-y-2 text-sm text-tx-muted">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4" aria-hidden />
            <span className="truncate">{user?.Email}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" aria-hidden />
            <span>Joined {user?.CreatedAt ? formatDate(user.CreatedAt) : "Unknown"}</span>
          </div>
        </div>
      </div>

      {/* Profile Form */}
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-xl font-semibold">Profile Information</h2>
          {!editing && (
            <Button variant="light" size="sm" onClick={() => setEditing(true)}>
              <Edit3 className="h-4 w-4" aria-hidden />
              Edit
            </Button>
          )}
        </div>
        {editing ? (
          <form onSubmit={handleSave} className="mt-6 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-semibold text-tx">Username</label>
                <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-tx">Display Name</label>
                <Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="Optional display name" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-tx">Email</label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-tx">Bio</label>
              <textarea
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                maxLength={500}
                placeholder="Tell us about yourself..."
                className="focus-ring min-h-20 w-full resize-y rounded-def border border-bd bg-surface-2 p-3 text-sm leading-6 text-tx outline-none placeholder:text-tx-muted/60"
              />
              <p className="mt-1 text-right text-xs text-tx-muted">{form.bio.length}/500</p>
            </div>

            {/* Password Change */}
            <div className="border-t border-bd pt-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-tx">
                <Lock className="h-4 w-4" aria-hidden />
                Change Password
              </h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <Input type="password" placeholder="Current password" value={passwordForm.current} onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })} />
                <Input type="password" placeholder="New password" value={passwordForm.new} onChange={(e) => setPasswordForm({ ...passwordForm, new: e.target.value })} />
                <Input type="password" placeholder="Confirm new" value={passwordForm.confirm} onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })} />
              </div>
            </div>

            <div className="flex gap-3">
              <Button type="submit" isLoading={updateProfile.isPending}>
                <Save className="h-4 w-4" aria-hidden />
                Save Changes
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                <X className="h-4 w-4" aria-hidden />
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <dl className="mt-6 space-y-4">
            <ProfileField label="Username" value={user?.Username} />
            <ProfileField label="Display Name" value={user?.DisplayName || "Not set"} />
            <ProfileField label="Email" value={user?.Email} />
            <ProfileField label="Bio" value={user?.Bio || "No bio yet"} />
            <ProfileField label="Role" value={user?.Role} />
            <ProfileField label="Member Since" value={user?.CreatedAt ? formatDate(user.CreatedAt) : "Unknown"} />
          </dl>
        )}
      </div>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-bd pb-3 last:border-b-0">
      <dt className="text-sm text-tx-muted">{label}</dt>
      <dd className="text-sm font-semibold text-tx">{value ?? "—"}</dd>
    </div>
  );
}

/* ═══════════════════════════════════════════
   HISTORY TAB (Grouped by Date)
   ═══════════════════════════════════════════ */
function HistoryTab() {
  const groupedQuery = useQuery({
    queryKey: ["history", "grouped"],
    queryFn: () => historyService.grouped(200),
  });

  if (groupedQuery.isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  const groups = groupedQuery.data?.groups ?? [];

  if (!groups.length) {
    return <EmptyState title="No reading history" description="Start reading manga to build your history." />;
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.label} className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-bd bg-surface-2/50 px-4 py-3">
            <Clock className="h-4 w-4 text-accent" aria-hidden />
            <h3 className="text-sm font-bold text-tx">{group.label}</h3>
            <Badge tone="default">{group.items.length}</Badge>
          </div>
          <div className="divide-y divide-bd">
            {group.items.map((entry: HistoryEntry) => (
              <Link
                key={entry.HistoryId}
                href={`/read/${entry.MangaId}/${entry.ChapterId}${entry.LastPageRead ? `?page=${entry.LastPageRead}` : ""}`}
                className="flex items-center gap-3 p-3 transition-colors hover:bg-surface-2"
              >
                {/* Cover thumbnail */}
                <div className="h-16 w-11 shrink-0 overflow-hidden rounded-md bg-surface-2">
                  {entry.cover_url ? (
                    <img src={entry.cover_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-tx-muted">
                      <BookOpen className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-tx">{entry.manga_title ?? "Unknown"}</p>
                  <p className="text-xs text-tx-muted">
                    Ch. {entry.chapter_number ?? "?"} · Page {entry.LastPageRead ?? "—"}
                  </p>
                  {entry.ReadAt && (
                    <p className="text-xs text-tx-muted/60">{formatDate(entry.ReadAt)}</p>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-tx-muted" aria-hidden />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════
   ANALYTICS TAB
   ═══════════════════════════════════════════ */
function AnalyticsTab() {
  const statsQuery = useQuery({
    queryKey: ["analytics", "user-stats"],
    queryFn: () => analyticsService.getUserStats(),
  });

  if (statsQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const stats = statsQuery.data;
  if (!stats) return <EmptyState title="No data" description="Start reading to see your analytics." />;

  return (
    <div className="space-y-6">
      {/* ── Top Stats ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Manga" value={stats.total_manga} icon={BookOpen} />
        <StatCard title="Chapters Read" value={stats.total_chapters} icon={Hash} />
        <StatCard title="Reading Sessions" value={stats.total_sessions} icon={Activity} />
        <StatCard title="Total Ratings" value={stats.total_ratings} icon={Star} />
      </div>

      {/* ── Distributions ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h3 className="mb-4 font-heading text-lg font-bold">Top Genres</h3>
          {stats.genre_distribution.length ? (
            <div className="space-y-3">
              {stats.genre_distribution.map((g) => (
                <div key={g.name} className="flex items-center justify-between">
                  <span className="text-sm font-medium text-tx">{g.name}</span>
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-32 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full bg-accent"
                        style={{ width: `${(g.count / stats.genre_distribution[0].count) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-tx-muted">{g.count}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-tx-muted">No genre data available.</p>
          )}
        </section>

        <section className="card p-5">
          <h3 className="mb-4 font-heading text-lg font-bold">Top Themes</h3>
          {stats.theme_distribution.length ? (
            <div className="flex flex-wrap gap-2">
              {stats.theme_distribution.map((t) => (
                <Badge key={t.name} tone="default">
                  {t.name} ({t.count})
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-tx-muted">No theme data available.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon }: { title: string; value: number; icon: any }) {
  return (
    <div className="card p-5 transition-transform hover:-translate-y-1 hover:shadow-lg">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-tx-muted">{title}</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-bg text-accent">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 font-heading text-3xl font-bold">{value.toLocaleString()}</p>
    </div>
  );
}

/* ═══════════════════════════════════════════
   RECOMMENDATIONS TAB (Phase 3)
   ═══════════════════════════════════════════ */
function RecommendationsTab() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const recsQuery = useQuery({
    queryKey: ["recommendations", "for-me"],
    queryFn: () => recommendationService.getForMe(18),
  });

  if (recsQuery.isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => <Skeleton key={i} className="aspect-[2/3]" />)}
      </div>
    );
  }

  const recs = recsQuery.data?.recommendations ?? [];

  if (!recs.length) {
    return (
      <EmptyState
        title="No recommendations yet"
        description="Read and rate more manga to get personalized suggestions."
        icon={Sparkles}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 rounded-lg border border-accent/20 bg-accent-bg px-4 py-3 text-accent">
          <Sparkles className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">
            Personalized using collaborative filtering based on users with similar reading patterns.
          </p>
        </div>
        <div className="ml-4 flex shrink-0 gap-1 rounded-lg border border-bd bg-surface p-1">
          <button
            onClick={() => setViewMode("grid")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${viewMode === "grid" ? "bg-accent text-white" : "text-tx-muted hover:bg-surface-2"}`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${viewMode === "list" ? "bg-accent text-white" : "text-tx-muted hover:bg-surface-2"}`}
          >
            <Activity className="h-4 w-4" />
          </button>
        </div>
      </div>

      {viewMode === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {recs.map((manga) => (
            <RecCard key={manga.manga_id} manga={manga} />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {recs.map((manga) => (
            <Link
              key={manga.manga_id}
              href={`/manga/${manga.manga_id}`}
              className="card flex gap-4 p-4 transition-colors hover:bg-surface-2"
            >
              <RecCover mangaId={manga.manga_id} />
              <div className="min-w-0 flex-1 py-1">
                <p className="truncate text-lg font-bold text-tx">{manga.title ?? "Unknown Manga"}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-tx-muted">
                  {manga.predicted_score > 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-brand-orange/10 px-2 py-0.5 font-bold text-brand-orange">
                      <Star className="h-3 w-3 fill-current" />
                      {manga.predicted_score.toFixed(1)} match
                    </span>
                  )}
                  {manga.year && <span>{manga.year}</span>}
                  {manga.status && <span className="capitalize">{manga.status}</span>}
                  {manga.content_rating && (
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase">{manga.content_rating}</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-tx-muted">
                  Source: {manga.source === "collaborative_filtering" ? "Collaborative Filtering" : "Popular"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Card component for grid view recommendations */
function RecCard({ manga }: { manga: import("@/services/analytics.service").RecommendationItem }) {
  return (
    <Link
      href={`/manga/${manga.manga_id}`}
      className="group relative flex flex-col overflow-hidden rounded-def border border-bd bg-surface-2 transition-all hover:shadow-lg hover:border-accent/30"
    >
      <div className="relative aspect-[2/3] overflow-hidden bg-surface">
        <RecCoverImage mangaId={manga.manga_id} />
        {manga.predicted_score > 0 && (
          <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-brand-orange backdrop-blur-sm">
            <Star className="h-3 w-3 fill-current" />
            {manga.predicted_score.toFixed(1)}
          </div>
        )}
      </div>
      <div className="flex-1 p-2">
        <p className="line-clamp-2 text-xs font-bold text-tx group-hover:text-accent transition-colors">
          {manga.title ?? "Unknown Manga"}
        </p>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-tx-muted">
          {manga.year && <span>{manga.year}</span>}
          {manga.status && <span className="capitalize">· {manga.status}</span>}
        </div>
      </div>
    </Link>
  );
}

/** Lazy cover image for recommendation items */
function RecCoverImage({ mangaId }: { mangaId: string }) {
  const coverQuery = useQuery({
    queryKey: ["cover", mangaId],
    queryFn: async () => {
      try {
        const cover = await import("@/services/cover.service").then(m => m.coverService.primary(mangaId));
        return cover?.cover_url ?? null;
      } catch { return null; }
    },
    staleTime: 5 * 60 * 1000,
  });

  if (coverQuery.data) {
    return (
      <img
        src={coverQuery.data}
        alt=""
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        loading="lazy"
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center text-tx-muted">
      <BookOpen className="h-8 w-8" />
    </div>
  );
}

/** Compact cover thumbnail for list view */
function RecCover({ mangaId }: { mangaId: string }) {
  const coverQuery = useQuery({
    queryKey: ["cover", mangaId],
    queryFn: async () => {
      try {
        const cover = await import("@/services/cover.service").then(m => m.coverService.primary(mangaId));
        return cover?.cover_url ?? null;
      } catch { return null; }
    },
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="flex h-20 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-2">
      {coverQuery.data ? (
        <img src={coverQuery.data} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <BookOpen className="h-5 w-5 text-tx-muted" />
      )}
    </div>
  );
}


```



# FILE: src\app\read\[mangaId]\[chapterId]\page.tsx

- SIZE: 18.75 KB
- SHA256: 62df61a6bde29bad9e3a82cef3498f20128bf0eabd41c8be59cf75c44a73f4fd

```tsx
"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Home,
  Languages,
  Loader2,
  Maximize2,
  Minimize2,
  PanelsTopLeft,
  RefreshCw,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useReader } from "@/hooks/useReader";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import { TRANSLATE_LANGS } from "@/services/translate.service";

export default function ReaderPage() {
  const params = useParams<{ mangaId: string; chapterId: string }>();
  const router = useRouter();
  const mangaId = params.mangaId;
  const chapterId = params.chapterId;

  const {
    chapterQuery,
    chapter,
    currentPage,
    totalPages,
    progress,
    goToPage,
    setCurrentPage,
    translateStates,
    translateLang,
    translatePage,
    translateAllPages,
    resetAllTranslations,
    changeTranslateLang,
  } = useReader(mangaId, chapterId);

  const reader = useAppStore((state) => state.reader);
  const updateReader = useAppStore((state) => state.updateReader);

  // Whether the translate lang picker is open
  const [showLangPicker, setShowLangPicker] = useState(false);
  // Whether bulk-translate is in progress
  const [isBulkTranslating, setIsBulkTranslating] = useState(false);

  useEffect(() => {
    const page = Number(new URLSearchParams(window.location.search).get("page"));
    if (page > 0) goToPage(page);
  }, [goToPage]);

  useEffect(() => {
    if (!chapter?.page_urls.length || reader.direction !== "vertical") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) {
          const next = Number(visible.target.id.replace("reader-page-", ""));
          if (next) setCurrentPage(next);
        }
      },
      { threshold: [0.35, 0.6, 0.85] },
    );
    chapter.page_urls.forEach((_, index) => {
      const element = document.getElementById(`reader-page-${index + 1}`);
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, [chapter?.page_urls, reader.direction, setCurrentPage]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "ArrowRight") goToPage(currentPage + 1);
      if (event.key === "ArrowLeft") goToPage(currentPage - 1);
      if (event.key === "Escape") updateReader({ showToolbar: !reader.showToolbar });
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [currentPage, goToPage, reader.showToolbar, updateReader]);

  const current = chapter?.current;
  const currentImage = chapter?.page_urls[currentPage - 1];

  /** Resolve what URL to show for a given page (translated or original). */
  function resolvePageUrl(originalUrl: string, pageIndex: number): string {
    const state = translateStates[pageIndex];
    if (state?.status === "done") return state.url;
    return originalUrl;
  }

  /** Translate button for a single page. */
  function TranslatePageButton({ pageIndex }: { pageIndex: number }) {
    const state = translateStates[pageIndex];
    const isLoading = state?.status === "loading";
    const isDone = state?.status === "done";
    const isError = state?.status === "error";

    return (
      <div className="flex items-center gap-1.5">
        {isDone ? (
          // Show "revert" button when page is translated
          <button
            onClick={() => {
              // Reset to original by removing state
              resetAllTranslations();
            }}
            className="flex items-center gap-1 rounded-full bg-brand-orange/20 px-2.5 py-1 text-xs font-medium text-brand-orange hover:bg-brand-orange/30 transition"
            title="Xem bản gốc"
          >
            <RefreshCw className="h-3 w-3" aria-hidden />
            Gốc
          </button>
        ) : (
          <button
            disabled={isLoading}
            onClick={() => translatePage(pageIndex)}
            className={cn(
              "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition",
              isLoading
                ? "bg-white/10 text-white/50 cursor-not-allowed"
                : isError
                  ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                  : "bg-white/10 text-white/80 hover:bg-white/20",
            )}
            title={isError ? (translateStates[pageIndex] as { status: "error"; message: string }).message : `Dịch sang ${translateLang}`}
          >
            {isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            ) : (
              <Languages className="h-3 w-3" aria-hidden />
            )}
            {isLoading ? "Đang dịch..." : isError ? "Thử lại" : "Dịch"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#111] text-white">
      {/* ── Top toolbar ── */}
      <div
        className={cn(
          "fixed left-0 right-0 top-0 z-40 border-b border-white/10 bg-[#171717]/95 backdrop-blur transition",
          reader.showToolbar ? "translate-y-0" : "-translate-y-full",
        )}
      >
        <div className="flex min-h-16 items-center gap-2 px-3">
          <Link href={`/manga/${mangaId}`}>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" aria-label="Back to manga">
              <ArrowLeft className="h-5 w-5" aria-hidden />
            </Button>
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">
              Ch. {current?.ChapterNumber ?? "?"}
              {current?.Title ? ` - ${current.Title}` : ""}
            </p>
            <p className="text-xs text-white/60">
              Page {currentPage} / {Math.max(totalPages, 1)}
            </p>
          </div>

          {/* ── Language picker trigger ── */}
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "text-white hover:bg-white/10",
                showLangPicker && "bg-white/10",
              )}
              onClick={() => setShowLangPicker((v) => !v)}
              aria-label="Translate language"
              title={`Ngôn ngữ dịch: ${translateLang}`}
            >
              <Languages className="h-5 w-5" aria-hidden />
            </Button>

            {/* Dropdown */}
            {showLangPicker && (
              <div className="absolute right-0 top-12 z-50 w-48 rounded-xl border border-white/10 bg-[#222] py-1 shadow-xl">
                <p className="px-3 py-1.5 text-xs font-semibold text-white/50 uppercase tracking-wide">
                  Dịch sang
                </p>
                {TRANSLATE_LANGS.map((lang) => (
                  <button
                    key={lang.code}
                    className={cn(
                      "w-full px-3 py-2 text-left text-sm hover:bg-white/10 transition",
                      translateLang === lang.code ? "text-brand-orange font-semibold" : "text-white",
                    )}
                    onClick={() => {
                      changeTranslateLang(lang.code);
                      setShowLangPicker(false);
                    }}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Translate all pages button ── */}
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10"
            disabled={isBulkTranslating || !chapter?.page_urls.length}
            onClick={async () => {
              setIsBulkTranslating(true);
              await translateAllPages();
              setIsBulkTranslating(false);
            }}
            aria-label="Translate all pages"
            title="Dịch tất cả trang"
          >
            {isBulkTranslating ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-5 w-5" aria-hidden />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10"
            onClick={() => updateReader({ direction: reader.direction === "vertical" ? "paged" : "vertical" })}
            aria-label="Toggle reading mode"
          >
            <PanelsTopLeft className="h-5 w-5" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10"
            onClick={() => updateReader({ fit: reader.fit === "width" ? "height" : "width" })}
            aria-label="Toggle fit"
          >
            {reader.fit === "width" ? <Maximize2 className="h-5 w-5" aria-hidden /> : <Minimize2 className="h-5 w-5" aria-hidden />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10"
            onClick={() => updateReader({ showToolbar: false })}
            aria-label="Hide toolbar"
          >
            <Settings2 className="h-5 w-5" aria-hidden />
          </Button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-white/10">
          <div className="h-full bg-brand-orange transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Show toolbar FAB */}
      <button
        className={cn("fixed right-4 top-4 z-50 rounded-full bg-white/10 p-3 backdrop-blur transition", reader.showToolbar && "opacity-0")}
        onClick={() => updateReader({ showToolbar: true })}
        aria-label="Show toolbar"
      >
        <Settings2 className="h-5 w-5" aria-hidden />
      </button>

      {/* ── Main content ── */}
      <main className="mx-auto min-h-screen max-w-6xl px-2 py-20">
        {chapterQuery.isLoading ? (
          <div className="mx-auto max-w-3xl space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-[80vh] bg-white/10" />
            ))}
          </div>
        ) : chapter?.page_urls.length ? (
          reader.direction === "paged" ? (
            /* ── PAGED MODE ── */
            <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center">
              <button
                className="fixed left-3 top-1/2 z-20 rounded-full bg-white/10 p-3"
                onClick={() => goToPage(currentPage - 1)}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-6 w-6" aria-hidden />
              </button>

              {currentImage ? (
                <div className="relative flex flex-col items-center gap-2">
                  {/* Translate button above the current paged image */}
                  <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5">
                    <span className="text-xs text-white/60">Trang {currentPage}</span>
                    <TranslatePageButton pageIndex={currentPage} />
                  </div>

                  {/* Image – show translated URL if available */}
                  {translateStates[currentPage]?.status === "loading" ? (
                    <div
                      className={cn(
                        "mx-auto bg-black flex items-center justify-center",
                        reader.fit === "height"
                          ? "max-h-[calc(100vh-9rem)] w-auto min-w-[300px]"
                          : "h-auto w-full max-w-4xl min-h-[400px]",
                      )}
                    >
                      <div className="flex flex-col items-center gap-3 text-white/50">
                        <Loader2 className="h-8 w-8 animate-spin" />
                        <p className="text-sm">Đang dịch trang {currentPage}...</p>
                        <p className="text-xs text-white/30">Có thể mất 10–20 giây</p>
                      </div>
                    </div>
                  ) : (
                    <img
                      src={resolvePageUrl(currentImage, currentPage)}
                      alt={`Page ${currentPage}`}
                      className={cn(
                        "mx-auto bg-black object-contain",
                        reader.fit === "height" ? "max-h-[calc(100vh-9rem)] w-auto" : "h-auto w-full max-w-4xl",
                      )}
                    />
                  )}
                </div>
              ) : null}

              <button
                className="fixed right-3 top-1/2 z-20 rounded-full bg-white/10 p-3"
                onClick={() => goToPage(currentPage + 1)}
                aria-label="Next page"
              >
                <ChevronRight className="h-6 w-6" aria-hidden />
              </button>
            </div>
          ) : (
            /* ── VERTICAL SCROLL MODE ── */
            <div className="mx-auto max-w-4xl space-y-1">
              {chapter.page_urls.map((url, index) => {
                const pageIndex = index + 1;
                const state = translateStates[pageIndex];
                const displayUrl = state?.status === "done" ? state.url : url;

                return (
                  <div
                    key={`${pageIndex}-${url}`}
                    id={`reader-page-${pageIndex}`}
                    className="relative group"
                  >
                    {/* Per-page translate button (visible on hover) */}
                    <div
                      className={cn(
                        "absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1.5 backdrop-blur transition",
                        "opacity-0 group-hover:opacity-100",
                        state?.status === "loading" && "opacity-100",
                        state?.status === "done" && "opacity-100",
                        state?.status === "error" && "opacity-100",
                      )}
                    >
                      <span className="text-xs text-white/50">T.{pageIndex}</span>
                      <TranslatePageButton pageIndex={pageIndex} />
                    </div>

                    {/* Loading overlay */}
                    {state?.status === "loading" && (
                      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/70 gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-brand-orange" />
                        <p className="text-sm text-white/70">Đang dịch trang {pageIndex}...</p>
                        <p className="text-xs text-white/40">Có thể mất 10–20 giây</p>
                      </div>
                    )}

                    <img
                      src={displayUrl}
                      alt={`Page ${pageIndex}`}
                      loading={index < 3 ? "eager" : "lazy"}
                      className={cn(
                        "mx-auto bg-black object-contain",
                        reader.fit === "height" ? "max-h-screen w-auto" : "h-auto w-full",
                        state?.status === "loading" && "opacity-20",
                      )}
                    />
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <div className="mx-auto flex max-w-xl flex-col items-center justify-center gap-6 pt-20 px-4 text-center">
            <img
              src="https://placehold.co/600x900/111111/FFFFFF?text=Pages+Unavailable"
              alt="Pages unavailable"
              className="w-full max-w-sm rounded-2xl border border-white/10"
            />

            <EmptyState
              title="Pages temporarily unavailable"
              description="MinIO hoặc MangaDex hiện không trả về image pages. Hệ thống đã chuyển sang chế độ fallback để tránh crash demo."
              className="border-white/10 bg-white/5 text-white"
            />

            <div className="flex items-center gap-3">
              <Button
                onClick={() => window.location.reload()}
                className="bg-brand-orange hover:bg-brand-orangeHover"
              >
                Retry
              </Button>

              <Button
                variant="ghost"
                onClick={() => router.push(`/manga/${mangaId}`)}
              >
                Back to manga
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* ── Bottom toolbar ── */}
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#171717]/95 px-3 py-3 backdrop-blur transition",
          reader.showToolbar ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2">
          {chapter?.prev_chapter ? (
            <Link href={`/read/${mangaId}/${chapter.prev_chapter.ChapterId}`}>
              <Button variant="light">
                <ChevronLeft className="h-4 w-4" aria-hidden />
                Prev
              </Button>
            </Link>
          ) : (
            <Button variant="light" disabled>
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Prev
            </Button>
          )}
          <div className="flex items-center gap-2">
            <Link href="/">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" aria-label="Home">
                <Home className="h-5 w-5" aria-hidden />
              </Button>
            </Link>
            <Link href={`/manga/${mangaId}`}>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" aria-label="Manga detail">
                <BookOpen className="h-5 w-5" aria-hidden />
              </Button>
            </Link>
          </div>
          {chapter?.next_chapter ? (
            <Link href={`/read/${mangaId}/${chapter.next_chapter.ChapterId}`}>
              <Button>
                Next
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </Link>
          ) : (
            <Button disabled>
              Next
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          )}
        </div>
      </div>

      {/* Close lang picker when clicking outside */}
      {showLangPicker && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setShowLangPicker(false)}
        />
      )}
    </div>
  );
}
```



# FILE: src\components\features\ChapterList.tsx

- SIZE: 4.36 KB
- SHA256: 55350b0c8ed201936174910814711185e5476113a2e6b5fed174899715064648

```tsx
"use client";

import Link from "next/link";
import { BookOpen, ChevronDown, Clock, Languages } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatDate } from "@/lib/utils";
import type { Chapter } from "@/types/chapter";
import type { UUID } from "@/types/common";

interface ChapterListProps {
  mangaId: UUID;
  chapters?: Chapter[];
  languages?: string[];
  isLoading?: boolean;
  selectedLang?: string;
  sort?: "asc" | "desc";
  onLangChange?: (lang: string) => void;
  onSortChange?: (sort: "asc" | "desc") => void;
}

export function ChapterList({
  mangaId,
  chapters = [],
  languages = [],
  isLoading,
  selectedLang = "",
  sort = "asc",
  onLangChange,
  onSortChange,
}: ChapterListProps) {
  const [visibleCount, setVisibleCount] = useState(30);
  const visible = useMemo(() => chapters.slice(0, visibleCount), [chapters, visibleCount]);

  return (
    <section className="card">
      <div className="flex flex-col gap-3 border-b border-bd p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-heading text-2xl font-semibold">Chapters</h2>
          <p className="text-sm text-tx-muted">{chapters.length} readable entries</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 md:w-[360px]">
          <Select value={selectedLang} onChange={(event) => onLangChange?.(event.target.value)} aria-label="Language">
            <option value="">All languages</option>
            {languages.map((lang) => (
              <option key={lang} value={lang}>
                {lang.toUpperCase()}
              </option>
            ))}
          </Select>
          <Select value={sort} onChange={(event) => onSortChange?.(event.target.value as "asc" | "desc")} aria-label="Sort chapters">
            <option value="asc">Oldest first</option>
            <option value="desc">Newest first</option>
          </Select>
        </div>
      </div>
      {isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-14" />
          ))}
        </div>
      ) : visible.length ? (
        <div className="divide-y divide-bd">
          {visible.map((chapter) => (
            <Link
              key={chapter.ChapterId}
              href={`/read/${mangaId}/${chapter.ChapterId}`}
              className="flex min-h-16 items-center gap-3 px-4 py-3 transition hover:bg-surface-2"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-tx">
                <BookOpen className="h-4 w-4" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  Ch. {chapter.ChapterNumber ?? "?"}
                  {chapter.Title ? ` - ${chapter.Title}` : ""}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-tx-muted">
                  <span className="inline-flex items-center gap-1">
                    <Languages className="h-3.5 w-3.5" aria-hidden />
                    {chapter.TranslatedLang?.toUpperCase() ?? "N/A"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                    {formatDate(chapter.PublishAt ?? chapter.CreatedAt)}
                  </span>
                  {chapter.Pages ? <Badge>{chapter.Pages} pages</Badge> : null}
                </div>
              </div>
            </Link>
          ))}
          {visibleCount < chapters.length ? (
            <div className="p-4 text-center">
              <Button variant="light" onClick={() => setVisibleCount((count) => count + 30)}>
                Load more <ChevronDown className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="p-4">
          <EmptyState title="No chapters yet" description="This manga does not have readable chapter metadata from the backend." />
        </div>
      )}
    </section>
  );
}

```



# FILE: src\components\features\CommentsSection.tsx

- SIZE: 12.87 KB
- SHA256: c6c80fe7cae48bf284c358bdba7a254da6a55ef06a0a7e5351f513503f93c241

```tsx
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Flag, MessageSquare, Pencil, Send, ThumbsDown, ThumbsUp, Trash2, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { formatDate } from "@/lib/utils";
import { commentService } from "@/services/comment.service";
import { getApiErrorMessage } from "@/services/api";
import type { Comment } from "@/types/comment";
import type { UUID } from "@/types/common";

interface CommentsSectionProps {
  mangaId: UUID;
  chapterId?: UUID;
}

export function CommentsSection({ mangaId, chapterId }: CommentsSectionProps) {
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();
  const [content, setContent] = useState("");
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [error, setError] = useState("");

  const commentsQuery = useQuery({
    queryKey: ["comments", mangaId],
    queryFn: () => commentService.list(mangaId, 1, 50),
  });

  const createMutation = useMutation({
    mutationFn: () => commentService.create(mangaId, { Content: content, ChapterId: chapterId, IsSpoiler: isSpoiler }),
    onSuccess: () => {
      setContent("");
      setIsSpoiler(false);
      setError("");
      queryClient.invalidateQueries({ queryKey: ["comments", mangaId] });
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAuthenticated) {
      setError("Login de binh luan.");
      return;
    }
    if (content.trim().length < 5) {
      setError("Comment needs at least 5 characters.");
      return;
    }
    createMutation.mutate();
  }

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-bd p-4">
        <h2 className="flex items-center gap-2 font-heading text-2xl font-semibold text-tx">
          <MessageSquare className="h-5 w-5 text-accent" aria-hidden />
          Comments
        </h2>
        <p className="mt-1 text-sm text-tx-muted">Spoiler controls, reactions, reports, edit and delete are wired to backend.</p>
      </div>
      <form onSubmit={submit} className="border-b border-bd p-4">
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder={isAuthenticated ? "Share your thought..." : "Login to comment"}
          disabled={!isAuthenticated}
          className="focus-ring min-h-24 w-full resize-y rounded-def border border-bd bg-surface-2 p-3 text-sm leading-6 text-tx outline-none disabled:opacity-50 placeholder:text-tx-muted/60"
        />
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-2 text-sm font-semibold text-tx">
            <input
              type="checkbox"
              checked={isSpoiler}
              onChange={(event) => setIsSpoiler(event.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            Mark as spoiler
          </label>
          <Button type="submit" isLoading={createMutation.isPending} disabled={!isAuthenticated}>
            <Send className="h-4 w-4" aria-hidden />
            Post
          </Button>
        </div>
        {error && <p className="mt-2 text-sm font-semibold text-[var(--red)]">{error}</p>}
      </form>
      <div className="divide-y divide-bd">
        {commentsQuery.isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-24" />
            ))}
          </div>
        ) : commentsQuery.data?.items.length ? (
          commentsQuery.data.items.map((comment) => (
            <CommentItem
              key={comment.CommentId}
              comment={comment}
              mangaId={mangaId}
              canManage={comment.UserId === user?.UserId}
            />
          ))
        ) : (
          <div className="p-4">
            <EmptyState title="No comments yet" description="Start the discussion after reading a chapter." />
          </div>
        )}
      </div>
    </section>
  );
}

const REPORT_REASONS = [
  "Spam or advertising",
  "Harassment or hate speech",
  "Unmarked spoilers",
  "Inappropriate content",
  "Misinformation",
  "Other",
];

function CommentItem({ comment, mangaId, canManage }: { comment: Comment; mangaId: UUID; canManage: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [revealed, setRevealed] = useState(!comment.IsSpoiler);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.Content ?? "");
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [customReason, setCustomReason] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["comments", mangaId] });

  const likeMutation = useMutation({ mutationFn: () => commentService.like(comment.CommentId), onSuccess: invalidate });
  const dislikeMutation = useMutation({ mutationFn: () => commentService.dislike(comment.CommentId), onSuccess: invalidate });
  const deleteMutation = useMutation({
    mutationFn: () => commentService.remove(comment.CommentId),
    onSuccess: () => {
      invalidate();
      toast("Comment deleted", "success");
    },
  });
  const updateMutation = useMutation({
    mutationFn: () => commentService.update(comment.CommentId, { Content: draft }),
    onSuccess: () => {
      setEditing(false);
      invalidate();
      toast("Comment updated", "success");
    },
  });
  const reportMutation = useMutation({
    mutationFn: () => {
      const reason = reportReason === "Other" ? customReason : reportReason;
      return commentService.report(comment.CommentId, { Reason: reason });
    },
    onSuccess: () => {
      setShowReportModal(false);
      setReportReason("");
      setCustomReason("");
      toast("Report submitted successfully. Thank you for helping keep the community safe!", "success");
    },
    onError: (err) => {
      toast(getApiErrorMessage(err), "error");
    },
  });

  const handleReport = () => {
    const reason = reportReason === "Other" ? customReason : reportReason;
    if (!reason.trim()) {
      toast("Please select or enter a reason for reporting.", "error");
      return;
    }
    reportMutation.mutate();
  };

  return (
    <article className="p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-bg text-sm font-bold text-accent">
          {(comment.Username ?? "U").charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-tx">{comment.Username ?? "Unknown user"}</p>
            <span className="text-xs text-tx-muted">{formatDate(comment.CreatedAt)}</span>
            {comment.IsSpoiler && <Badge tone="warning">Spoiler</Badge>}
          </div>
          {editing ? (
            <div className="mt-3">
              <Input value={draft} onChange={(event) => setDraft(event.target.value)} />
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => updateMutation.mutate()} isLoading={updateMutation.isPending}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm leading-6 text-tx-muted">
              {comment.IsSpoiler && !revealed ? (
                <button className="font-bold text-accent" onClick={() => setRevealed(true)}>
                  Show spoiler
                </button>
              ) : (
                comment.Content
              )}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => likeMutation.mutate()}>
              <ThumbsUp className="h-4 w-4" aria-hidden />
              {comment.LikeCount}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => dislikeMutation.mutate()}>
              <ThumbsDown className="h-4 w-4" aria-hidden />
              {comment.DislikeCount}
            </Button>
            {canManage && (
              <>
                <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4" aria-hidden />
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate()} isLoading={deleteMutation.isPending}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                  Delete
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowReportModal(true)}
              className="ml-auto text-tx-muted hover:text-[var(--red)]"
            >
              <Flag className="h-4 w-4" aria-hidden />
              Report
            </Button>
          </div>
        </div>
      </div>

      {/* ── Report Modal ── */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowReportModal(false)}>
          <div
            className="mx-4 w-full max-w-md rounded-xl border border-bd bg-surface p-6 shadow-floating animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--red)]/10">
                  <AlertTriangle className="h-5 w-5 text-[var(--red)]" />
                </div>
                <div>
                  <h3 className="font-heading text-lg font-bold text-tx">Report Comment</h3>
                  <p className="text-xs text-tx-muted">by {comment.Username}</p>
                </div>
              </div>
              <button onClick={() => setShowReportModal(false)} className="rounded-full p-1 text-tx-muted hover:bg-surface-2">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 rounded-lg border border-bd bg-surface-2 p-3">
              <p className="line-clamp-3 text-sm text-tx-muted italic">&ldquo;{comment.Content}&rdquo;</p>
            </div>

            <div className="mt-4">
              <p className="mb-3 text-sm font-semibold text-tx">Select a reason:</p>
              <div className="grid gap-2">
                {REPORT_REASONS.map((reason) => (
                  <button
                    key={reason}
                    onClick={() => setReportReason(reason)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm font-medium transition-all ${
                      reportReason === reason
                        ? "border-accent bg-accent-bg text-accent"
                        : "border-bd text-tx-muted hover:border-accent/30 hover:bg-surface-2"
                    }`}
                  >
                    {reason}
                  </button>
                ))}
              </div>
            </div>

            {reportReason === "Other" && (
              <div className="mt-3">
                <textarea
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="Please describe the issue..."
                  className="focus-ring min-h-20 w-full resize-y rounded-def border border-bd bg-surface-2 p-3 text-sm leading-6 text-tx outline-none placeholder:text-tx-muted/60"
                />
              </div>
            )}

            <div className="mt-5 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setShowReportModal(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleReport}
                isLoading={reportMutation.isPending}
                disabled={!reportReason || (reportReason === "Other" && !customReason.trim())}
              >
                <Flag className="h-4 w-4" aria-hidden />
                Submit Report
              </Button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

```



# FILE: src\components\features\ListPicker.tsx

- SIZE: 4.96 KB
- SHA256: 8e51f790718379fbb175aa6d4fc105be6d60e5dffc816c5ed1a7457ac94ad6b5

```tsx
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookmarkPlus, Check, Plus, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { listService } from "@/services/list.service";
import type { UUID } from "@/types/common";

interface ListPickerProps {
  mangaId: UUID;
}

export function ListPicker({ mangaId }: ListPickerProps) {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState("private");

  const listsQuery = useQuery({
    queryKey: ["lists", "mine", mangaId],
    queryFn: () => listService.mine(mangaId),
    enabled: isAuthenticated,
  });

  const createMutation = useMutation({
    mutationFn: () => listService.create({ Name: name, Visibility: visibility, Description: "" }),
    onSuccess: () => {
      setName("");
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      toast("Đã tạo danh sách mới!", "success");
    },
  });

  const addMutation = useMutation({
    mutationFn: (listId: UUID) => listService.addItem(listId, mangaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      toast("Đã thêm vào danh sách!", "success");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (listId: UUID) => listService.removeItem(listId, mangaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      toast("Đã xóa khỏi danh sách!", "success");
    },
  });

  function createList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate();
  }

  if (!isAuthenticated) {
    return (
      <section className="card p-4">
        <h2 className="font-heading text-2xl font-semibold">Library</h2>
        <p className="mt-2 text-sm text-tx-muted">Login to add this manga to private or public MDLists.</p>
      </section>
    );
  }

  const lists = listsQuery.data?.my_lists ?? [];

  return (
    <section className="card p-4">
      <h2 className="flex items-center gap-2 font-heading text-2xl font-semibold">
        <BookmarkPlus className="h-5 w-5 text-brand-orange" aria-hidden />
        Library
      </h2>
      <div className="mt-4 space-y-2">
        {lists.map((list) => (
          <div key={list.ListId} className="flex items-center gap-3 border border-bd p-2 rounded-md">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{list.Name}</p>
              <p className="text-xs text-tx-muted">{list.ItemCount} items - {list.Visibility}</p>
            </div>

            {/* Logic Toggle Thêm/Xóa bằng Button Group Hover */}
            {list.contains ? (
              <Button
                size="sm"
                className="group relative min-w-[90px] bg-brand-orange/10 text-brand-orange hover:bg-[var(--red)] hover:text-white border border-brand-orange/30 hover:border-[var(--red)]"
                onClick={() => removeMutation.mutate(list.ListId)}
                isLoading={removeMutation.isPending && removeMutation.variables === list.ListId}
              >
                <span className="flex items-center justify-center group-hover:hidden">
                  <Check className="mr-1 h-3.5 w-3.5" aria-hidden />
                  Added
                </span>
                <span className="hidden items-center justify-center group-hover:flex">
                  <X className="mr-1 h-3.5 w-3.5" aria-hidden />
                  Remove
                </span>
              </Button>
            ) : (
              <Button
                size="sm"
                variant="light"
                className="min-w-[90px]"
                onClick={() => addMutation.mutate(list.ListId)}
                isLoading={addMutation.isPending && addMutation.variables === list.ListId}
              >
                Add
              </Button>
            )}

          </div>
        ))}
      </div>
      <form onSubmit={createList} className="mt-4 grid gap-2">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="New list name" />
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Select value={visibility} onChange={(event) => setVisibility(event.target.value)} aria-label="List visibility">
            <option value="private">Private</option>
            <option value="public">Public</option>
          </Select>
          <Button type="submit" isLoading={createMutation.isPending}>
            <Plus className="h-4 w-4" aria-hidden />
            Create
          </Button>
        </div>
      </form>
    </section>
  );
}
```



# FILE: src\components\features\MangaCard.tsx

- SIZE: 3.63 KB
- SHA256: 970f565ac04e07e86444979e925d0c2ac5b8c78059431258f84e11eb4011f8ff

```tsx
import Link from "next/link";
import { Star, Users } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { formatNumber, titleCase } from "@/lib/utils";
import type { MangaListItem } from "@/types/manga";
import { MangaCover } from "./MangaCover";

interface MangaCardProps {
  manga: MangaListItem;
  variant?: "grid" | "compact" | "wide";
}

export function MangaCard({ manga, variant = "grid" }: MangaCardProps) {
  if (variant === "compact") {
    return (
      <Link
        href={`/manga/${manga.MangaId}`}
        className="card group flex gap-3 p-2 transition-transform duration-200 hover:scale-[1.01]"
      >
        <MangaCover src={manga.cover_url} title={manga.TitleEn} className="h-24 w-16 shrink-0" />
        <div className="min-w-0 py-1">
          <h3 className="line-clamp-2 text-sm font-bold leading-5 text-tx group-hover:text-accent transition-colors">
            {manga.TitleEn ?? "Untitled"}
          </h3>
          <p className="mt-1 text-xs text-tx-muted">{manga.Year ?? "Unknown"} · {titleCase(manga.Status)}</p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-tx-muted">
            <span className="inline-flex items-center gap-1">
              <Star className="h-3.5 w-3.5 text-accent" aria-hidden />
              {(manga.stats?.AverageRating ?? 0).toFixed(1)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" aria-hidden />
              {formatNumber(manga.stats?.Follows)}
            </span>
          </div>
        </div>
      </Link>
    );
  }

  if (variant === "wide") {
    return (
      <Link
        href={`/manga/${manga.MangaId}`}
        className="card group flex min-h-32 gap-4 p-3 transition-transform duration-200 hover:scale-[1.005]"
      >
        <MangaCover src={manga.cover_url} title={manga.TitleEn} className="h-32 w-24 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap gap-2">
            {manga.Status && <Badge tone="orange">{titleCase(manga.Status)}</Badge>}
            {manga.ContentRating && <Badge>{titleCase(manga.ContentRating)}</Badge>}
          </div>
          <h3 className="mt-3 line-clamp-2 font-heading text-xl font-semibold leading-6 text-tx group-hover:text-accent transition-colors">
            {manga.TitleEn ?? "Untitled"}
          </h3>
          <div className="mt-auto flex flex-wrap gap-4 pt-3 text-sm text-tx-muted">
            <span>{manga.Year ?? "Unknown year"}</span>
            <span>{titleCase(manga.PublicationDemographic)}</span>
            <span>{(manga.stats?.AverageRating ?? 0).toFixed(1)} rating</span>
            <span>{formatNumber(manga.stats?.Follows)} follows</span>
          </div>
        </div>
      </Link>
    );
  }

  /* default: grid card */
  return (
    <Link
      href={`/manga/${manga.MangaId}`}
      className="card group block overflow-hidden transition-transform duration-200 hover:scale-[1.03]"
    >
      <MangaCover src={manga.cover_url} title={manga.TitleEn} className="aspect-[2/3] w-full" />
      <div className="p-3">
        <h3 className="line-clamp-2 min-h-10 text-sm font-bold leading-5 text-tx group-hover:text-accent transition-colors">
          {manga.TitleEn ?? "Untitled"}
        </h3>
        <div className="mt-3 flex items-center justify-between text-xs text-tx-muted">
          <span>{manga.Year ?? "N/A"}</span>
          <span className="inline-flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-accent text-accent" aria-hidden />
            {(manga.stats?.AverageRating ?? 0).toFixed(1)}
          </span>
        </div>
      </div>
    </Link>
  );
}

```



# FILE: src\components\features\MangaCover.tsx

- SIZE: 816.00 B
- SHA256: 094dacbbce2ab7e3b661f4f18c166cc1a92452054eaf6ed0b4260130c17bf9d6

```tsx
import { cn } from "@/lib/utils";

interface MangaCoverProps {
  src?: string | null;
  title?: string | null;
  className?: string;
}

export function MangaCover({ src, title, className }: MangaCoverProps) {
  return (
    <div className={cn("overflow-hidden rounded-sm bg-surface-2", className)}>
      {src ? (
        <img
          src={src}
          alt={title ?? "Cover"}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-surface-2 p-4 text-center">
          <span className="text-xs font-bold leading-relaxed text-tx-muted/80">
            {title ? title : "No Cover"}
          </span>
        </div>
      )}
    </div>
  );
}

```



# FILE: src\components\features\MangaGrid.tsx

- SIZE: 1.67 KB
- SHA256: d874b2355eb68409822cda98c0e7f1165e33111258b9d56c581451ce777801df

```tsx
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import type { MangaListItem } from "@/types/manga";
import { MangaCard } from "./MangaCard";

interface MangaGridProps {
  items?: MangaListItem[];
  isLoading?: boolean;
  variant?: "grid" | "compact" | "wide";
}

export function MangaGrid({ items = [], isLoading, variant = "grid" }: MangaGridProps) {
  if (isLoading) {
    return (
      <div className={variant === "wide" ? "grid gap-3" : "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6"}>
        {Array.from({ length: variant === "wide" ? 6 : 12 }).map((_, index) => (
          <Skeleton key={index} className={variant === "wide" ? "h-40" : "aspect-[2/3] w-full"} />
        ))}
      </div>
    );
  }

  if (!items.length) {
    return <EmptyState title="No manga found" description="Try another keyword, filter, or make sure the backend has catalog data." />;
  }

  if (variant === "wide") {
    return (
      <div className="grid gap-3">
        {items.map((manga, index) => (
          <MangaCard key={`${manga.MangaId}-${index}`} manga={manga} variant="wide" />
        ))}
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((manga, index) => (
          <MangaCard key={`${manga.MangaId}-${index}`} manga={manga} variant="compact" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
      {items.map((manga, index) => (
        <MangaCard key={`${manga.MangaId}-${index}`} manga={manga} />
      ))}
    </div>
  );
}

```



# FILE: src\components\features\RatingPanel.tsx

- SIZE: 3.07 KB
- SHA256: 2ef20d1f7d07515e8ad79584f23d21715c1e4d6ffe4696b77fd9b0269f034629

```tsx
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { cn, formatNumber } from "@/lib/utils";
import { ratingService } from "@/services/rating.service";
import type { UUID } from "@/types/common";
import type { Statistics } from "@/types/manga";

interface RatingPanelProps {
  mangaId: UUID;
  stats?: Statistics | null;
}

export function RatingPanel({ mangaId, stats }: RatingPanelProps) {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const [hoverScore, setHoverScore] = useState<number | null>(null);

  const myRating = useQuery({
    queryKey: ["rating", mangaId, "me"],
    queryFn: () => ratingService.myRating(mangaId),
    enabled: isAuthenticated,
    retry: false,
  });

  const rateMutation = useMutation({
    mutationFn: (Score: number) => ratingService.rate(mangaId, { Score }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rating", mangaId, "me"] });
      queryClient.invalidateQueries({ queryKey: ["manga", "detail", mangaId] });
    },
  });

  const activeScore = hoverScore ?? myRating.data?.Score ?? myRating.data?.score ?? 0;

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-2xl font-semibold">Rating</h2>
          <p className="mt-1 text-sm text-tx-muted">
            Average {(stats?.AverageRating ?? 0).toFixed(1)} - {formatNumber(stats?.Follows)} follows
          </p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-orange text-lg font-bold text-white">
          {(stats?.AverageRating ?? 0).toFixed(1)}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-1">
        {Array.from({ length: 10 }).map((_, index) => {
          const score = index + 1;
          return (
            <button
              key={score}
              disabled={!isAuthenticated || rateMutation.isPending}
              onClick={() => rateMutation.mutate(score)}
              onMouseEnter={() => setHoverScore(score)}
              onMouseLeave={() => setHoverScore(null)}
              className={cn(
                "focus-ring flex h-9 w-9 items-center justify-center rounded-full border border-bd text-xs font-bold transition text-tx",
                score <= activeScore ? "border-brand-orange bg-brand-orange text-white" : "bg-surface-2 hover:border-brand-orange",
                !isAuthenticated && "cursor-not-allowed opacity-50",
              )}
              aria-label={`Rate ${score}`}
            >
              {score}
            </button>
          );
        })}
      </div>
      <p className="mt-3 flex items-center gap-2 text-xs text-tx-muted">
        <Star className="h-4 w-4 text-brand-orange" aria-hidden />
        {isAuthenticated ? "Pick a score from 1 to 10." : "Login to save your rating."}
      </p>
    </section>
  );
}

```



# FILE: src\components\features\TranslatedImage.tsx

- SIZE: 2.60 KB
- SHA256: 531be12ed0c5baf9a0a40fe8fbd1afc4d45a40095714e1084fb8d7b73e59afa5

```tsx
"use client";

import React, { useState } from 'react';
import { Loader2, Languages } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface TranslatedImageProps {
    imageUrl: string;
    className?: string;
    alt?: string;
}

export function TranslatedImage({ imageUrl, className, alt = "Manga Page" }: TranslatedImageProps) {
    const [imgSrc, setImgSrc] = useState<string>(imageUrl);
    const [isTranslating, setIsTranslating] = useState<boolean>(false);

    const handleTranslate = async () => {
        setIsTranslating(true);
        try {
            // Gọi API Backend vừa tạo
            const response = await fetch('/api/v1/translate/page', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image_url: imageUrl, target_lang: 'vi' })
            });

            if (!response.ok) throw new Error("Translation failed");

            // Nhận blob hình ảnh đã được vẽ chữ tiếng việt
            const blob = await response.blob();
            const translatedUrl = URL.createObjectURL(blob);
            setImgSrc(translatedUrl); // Đổi src của ảnh hiện tại thành ảnh đã dịch
        } catch (error) {
            console.error(error);
            // Hiển thị thông báo lỗi (có thể dùng react-hot-toast của bạn)
            alert("Có lỗi xảy ra khi dịch trang này.");
        } finally {
            setIsTranslating(false);
        }
    };

    return (
        <div className={`relative group inline-block w-full ${className || ''}`}>
            {/* Ảnh truyện */}
            <img src={imgSrc} alt={alt} className="w-full h-auto object-contain transition-all" loading="lazy" />

            {/* Nút Dịch nổi lên khi rê chuột (Hover) */}
            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <Button
                    onClick={handleTranslate}
                    disabled={isTranslating}
                    className="bg-black/70 hover:bg-black text-white shadow-lg backdrop-blur-sm"
                    size="sm"
                >
                    {isTranslating ? (
                        <Loader2 className="animate-spin w-4 h-4 mr-2" />
                    ) : (
                        <Languages className="w-4 h-4 mr-2" />
                    )}
                    {isTranslating ? "Đang dịch..." : "Dịch trang"}
                </Button>
            </div>
        </div>
    );
}
```



# FILE: src\components\layout\AppShell.tsx

- SIZE: 15.13 KB
- SHA256: 6f17925d6e9e9f825e2d50dbb6133f007792ee743c41cb6bbb60524f9ed9f981

```tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useMemo, useState } from "react";
import {
  BookOpen,
  Compass,
  Clock,
  History,
  Home,
  Library,
  LogIn,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Shield,
  Shuffle,
  Sun,
  UserCircle,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMangaSearch } from "@/hooks/useMangaQueries";
import { cn } from "@/lib/utils";
import { mangaService } from "@/services/manga.service";
import { useAppStore } from "@/store/useAppStore";
import { Button } from "@/components/ui/Button";


const navigation = [
  { href: "/", label: "Home", icon: Home },
  { href: "/latest", label: "Latest", icon: Clock },
  { href: "/explore", label: "Explore", icon: Compass },
  { href: "/lists", label: "Lists", icon: Library },
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/profile", label: "Profile", icon: UserCircle },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);

  if (pathname.startsWith("/read/")) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-bg text-tx transition-colors duration-300">
      <DesktopSidebar pathname={pathname} />
      <MobileDrawer pathname={pathname} />
      <div
        className={cn(
          "min-h-screen transition-all duration-300 lg:pl-[68px]",
          sidebarOpen ? "xl:pl-60" : "xl:pl-[68px]"
        )}
      >
        <TopBar />
        <main className="pb-20 lg:pb-0">{children}</main>
      </div>
      <BottomNav pathname={pathname} />
    </div>
  );
}

/* ═══════════════════════════════════════════
   DESKTOP SIDEBAR
   ═══════════════════════════════════════════ */
function DesktopSidebar({ pathname }: { pathname: string }) {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const theme = useAppStore((s) => s.theme);
  const { isAdmin } = useAuth();

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 hidden border-r border-bd bg-surface transition-all duration-300 lg:flex lg:flex-col",
        sidebarOpen ? "w-60" : "w-[68px]",
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center px-4">
        <Link href="/" className="focus-ring flex items-center gap-3 rounded-def px-1">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-white">
            <BookOpen className="h-5 w-5" aria-hidden />
          </span>
          {sidebarOpen && <span className="font-heading text-xl font-bold">MangaLib</span>}
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-3">
        {navigation.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            className={cn(
              "focus-ring flex min-h-10 items-center gap-3 rounded-def px-3 py-2 text-sm font-medium transition-colors duration-150",
              sidebarOpen ? "justify-start" : "justify-center",
              isActive(pathname, item.href)
                ? "bg-accent text-white shadow-sm"
                : "text-tx-muted hover:bg-accent-bg hover:text-accent",
            )}
          >
            <item.icon className="h-5 w-5 shrink-0" aria-hidden />
            {sidebarOpen && <span>{item.label}</span>}
          </Link>
        ))}
        {isAdmin && (
          <Link
            href="/admin"
            title="Admin"
            className={cn(
              "focus-ring flex min-h-10 items-center gap-3 rounded-def px-3 py-2 text-sm font-medium transition-colors duration-150",
              sidebarOpen ? "justify-start" : "justify-center",
              isActive(pathname, "/admin")
                ? "bg-accent text-white shadow-sm"
                : "text-tx-muted hover:bg-accent-bg hover:text-accent",
            )}
          >
            <Shield className="h-5 w-5 shrink-0" aria-hidden />
            {sidebarOpen && <span>Admin</span>}
          </Link>
        )}
      </nav>

      {/* Bottom actions */}
      <div className="space-y-1 border-t border-bd px-3 py-3">

        <button
          onClick={toggleTheme}
          title={theme === "dark" ? "Light mode" : "Dark mode"}
          className={cn(
            "flex min-h-10 w-full items-center gap-3 rounded-def px-3 py-2 text-sm font-medium text-tx-muted transition-colors duration-150 hover:bg-accent-bg hover:text-accent",
            sidebarOpen ? "justify-start" : "justify-center",
          )}
        >
          {theme === "dark" ? <Sun className="h-5 w-5 shrink-0" aria-hidden /> : <Moon className="h-5 w-5 shrink-0" aria-hidden />}
          {sidebarOpen && <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>}
        </button>
        <Button variant="ghost" className={cn("w-full", sidebarOpen ? "justify-start" : "justify-center")} onClick={toggleSidebar}>
          {sidebarOpen ? <PanelLeftClose className="h-5 w-5" aria-hidden /> : <PanelLeftOpen className="h-5 w-5" aria-hidden />}
          {sidebarOpen && <span>Collapse</span>}
        </Button>
      </div>
    </aside>
  );
}

/* ═══════════════════════════════════════════
   MOBILE DRAWER
   ═══════════════════════════════════════════ */
function MobileDrawer({ pathname }: { pathname: string }) {
  const mobileNavOpen = useAppStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useAppStore((s) => s.setMobileNavOpen);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const theme = useAppStore((s) => s.theme);
  const { isAdmin } = useAuth();

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300 lg:hidden",
          mobileNavOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setMobileNavOpen(false)}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 border-r border-bd bg-surface p-4 transition-transform duration-300 lg:hidden",
          mobileNavOpen ? "translate-x-0 animate-slideInLeft" : "-translate-x-full",
        )}
      >
        <div className="mb-5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3" onClick={() => setMobileNavOpen(false)}>
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-white">
              <BookOpen className="h-5 w-5" aria-hidden />
            </span>
            <span className="font-heading text-xl font-bold">MangaLib</span>
          </Link>
          <Button variant="ghost" size="icon" onClick={() => setMobileNavOpen(false)} aria-label="Close menu">
            <X className="h-5 w-5" aria-hidden />
          </Button>
        </div>
        <nav className="space-y-1">
          {[...navigation, ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: Shield }] : [])].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileNavOpen(false)}
              className={cn(
                "focus-ring flex min-h-11 items-center gap-3 rounded-def px-3 py-2 text-sm font-medium transition-colors",
                isActive(pathname, item.href)
                  ? "bg-accent text-white"
                  : "text-tx-muted hover:bg-accent-bg hover:text-accent",
              )}
            >
              <item.icon className="h-5 w-5" aria-hidden />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-bd pt-3 mt-6">
          <button
            onClick={toggleTheme}
            className="flex min-h-11 w-full items-center gap-3 rounded-def px-3 py-2 text-sm font-medium text-tx-muted hover:bg-accent-bg hover:text-accent"
          >
            {theme === "dark" ? <Sun className="h-5 w-5" aria-hidden /> : <Moon className="h-5 w-5" aria-hidden />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
        </div>
      </aside>
    </>
  );
}

/* ═══════════════════════════════════════════
   TOP BAR
   ═══════════════════════════════════════════ */
function TopBar() {
  const setMobileNavOpen = useAppStore((s) => s.setMobileNavOpen);
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b border-bd bg-surface/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-content items-center gap-3 px-3 sm:px-4 md:px-6 xl:px-8">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileNavOpen(true)} aria-label="Open menu">
          <Menu className="h-5 w-5" aria-hidden />
        </Button>
        <SearchBox />
        <RandomButton />
        <div className="ml-auto hidden items-center gap-2 sm:flex">
          {isAuthenticated ? (
            <>
              <Link
                href="/profile"
                className="focus-ring inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold text-tx-muted hover:bg-accent-bg hover:text-accent transition-colors"
              >
                <UserCircle className="h-5 w-5" aria-hidden />
                <span className="max-w-28 truncate">{user?.Username ?? "Account"}</span>
              </Link>
              <Button variant="ghost" size="icon" onClick={logout} aria-label="Logout">
                <LogOut className="h-5 w-5" aria-hidden />
              </Button>
            </>
          ) : (
            <Link
              href="/auth/login"
              className="focus-ring inline-flex h-10 items-center gap-2 rounded-def bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
            >
              <LogIn className="h-5 w-5" aria-hidden />
              Login
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

/* ═══════════════════════════════════════════
   SEARCH BOX
   ═══════════════════════════════════════════ */
function SearchBox() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const trimmed = query.trim();
  const searchQuery = useMangaSearch(trimmed, 5);
  const suggestions = searchQuery.data ?? [];

  function submitSearch() {
    if (!trimmed) return;
    router.push(`/explore?q=${encodeURIComponent(trimmed)}`);
    setQuery("");
  }

  return (
    <div className="relative min-w-0 flex-1">
      <div
        className={cn(
          "flex h-11 items-center rounded-def border bg-surface-2 px-3 transition-all duration-200",
          focused ? "border-accent ring-2 ring-accent-bg" : "border-bd",
        )}
      >
        <Search className="mr-2 h-5 w-5 shrink-0 text-tx-muted" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitSearch()}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          placeholder="Search manga, author, alt title..."
          className="h-full min-w-0 flex-1 bg-transparent text-sm font-medium text-tx outline-none placeholder:text-tx-muted/60"
        />
      </div>
      {trimmed && suggestions.length > 0 && focused && (
        <div className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-def border border-bd bg-surface shadow-floating animate-fadeIn">
          {suggestions.map((item) => (
            <Link
              key={item.MangaId}
              href={`/manga/${item.MangaId}`}
              onClick={() => setQuery("")}
              className="flex items-center gap-3 border-b border-bd px-3 py-2.5 last:border-b-0 hover:bg-accent-bg transition-colors"
            >
              <div className="h-12 w-9 overflow-hidden rounded-sm bg-surface-2">
                {item.cover_url ? <img src={item.cover_url} alt="" className="h-full w-full object-cover" /> : null}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-tx">{item.TitleEn ?? "Untitled"}</p>
                <p className="text-xs text-tx-muted">{item.Year ?? "Unknown"} · {item.Status ?? "status"}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   RANDOM BUTTON
   ═══════════════════════════════════════════ */
function RandomButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function goRandom() {
    setLoading(true);
    try {
      const result = await mangaService.random();
      if ("MangaId" in result) {
        router.push(`/manga/${result.MangaId}`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="ghost" size="icon" onClick={goRandom} isLoading={loading} aria-label="Random manga">
      {!loading && <Shuffle className="h-5 w-5" aria-hidden />}
    </Button>
  );
}

/* ═══════════════════════════════════════════
   BOTTOM NAV
   ═══════════════════════════════════════════ */
function BottomNav({ pathname }: { pathname: string }) {
  const { isAdmin } = useAuth();
  const items = useMemo(
    () => [...navigation.slice(0, 4), ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: Shield }] : [])],
    [isAdmin],
  );

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-6 border-t border-bd bg-surface/95 backdrop-blur-sm lg:hidden">
      {items.slice(0, 6).map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors",
            isActive(pathname, item.href) ? "text-accent" : "text-tx-muted",
          )}
        >
          <item.icon className="h-5 w-5" aria-hidden />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

```



# FILE: src\components\ui\Badge.tsx

- SIZE: 1.27 KB
- SHA256: b3c76f88e38aa291e5741a2c60039f955db5a481e6555180dc1a8c494b8a1762

```tsx
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface BadgeProps {
  tone?: "default" | "orange" | "purple" | "cyan" | "sky" | "warning" | "green" | "red" | "neutral" | "error";
  className?: string;
  children: ReactNode;
}

const toneClasses: Record<string, string> = {
  default: "bg-surface-2 text-tx-muted border border-bd",
  neutral: "bg-surface-2 text-tx-muted border border-bd",
  orange: "bg-[rgba(255,103,64,0.12)] text-accent border border-accent/30",
  purple: "bg-[rgba(192,132,252,0.12)] text-[var(--purple)] border border-[var(--purple)]/30",
  cyan: "bg-[rgba(5,170,240,0.12)] text-[var(--cyan)] border border-[var(--cyan)]/30",
  sky: "bg-[rgba(17,153,255,0.12)] text-[var(--sky)] border border-[var(--sky)]/30",
  warning: "bg-[rgba(245,158,11,0.12)] text-[var(--amber)] border border-[var(--amber)]/30",
  green: "bg-[rgba(34,197,94,0.12)] text-[var(--green)] border border-[var(--green)]/30",
  red: "bg-[rgba(239,68,68,0.12)] text-[var(--red)] border border-[var(--red)]/30",
  error: "bg-[rgba(239,68,68,0.12)] text-[var(--red)] border border-[var(--red)]/30",
};

export function Badge({ tone = "default", className, children }: BadgeProps) {
  return (
    <span className={cn("badge", toneClasses[tone], className)}>
      {children}
    </span>
  );
}

```



# FILE: src\components\ui\Button.tsx

- SIZE: 1.65 KB
- SHA256: 643a1cd5642ba09adf725719852eb7b282a824719462f06355266449a489f810

```tsx
import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "light" | "ghost" | "danger";
  size?: "sm" | "md" | "icon";
  isLoading?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  isLoading,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "focus-ring inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150 rounded-def",
        /* sizes */
        size === "sm" && "h-8 px-3 text-xs",
        size === "md" && "h-10 px-4 text-sm",
        size === "icon" && "h-10 w-10 p-0",
        /* variants */
        variant === "primary" && "bg-accent text-white hover:bg-accent-hover active:bg-accent-active shadow-sm",
        variant === "light" && "bg-surface-2 text-tx hover:bg-surface-3 border border-bd",
        variant === "ghost" && "text-tx-muted hover:bg-accent-bg hover:text-accent",
        variant === "danger" && "bg-[var(--red)] text-white hover:opacity-90",
        (disabled || isLoading) && "opacity-50 pointer-events-none",
        className,
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      ) : null}
      {children}
    </button>
  );
}

```



# FILE: src\components\ui\EmptyState.tsx

- SIZE: 844.00 B
- SHA256: b20f96fd49ceae32137850496b6449bcb672fd8f3d3b994eab7eb297aae89041

```tsx
import { cn } from "@/lib/utils";
import { InboxIcon, type LucideIcon } from "lucide-react";

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  className?: string;
}

export function EmptyState({ title = "Nothing here", description, icon: Icon, className }: EmptyStateProps) {
  const IconComponent = Icon ?? InboxIcon;
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 text-center", className)}>
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-tx-muted">
        <IconComponent className="h-7 w-7" aria-hidden />
      </div>
      <h3 className="mt-4 font-heading text-lg font-semibold text-tx">{title}</h3>
      {description && <p className="mt-2 max-w-sm text-sm text-tx-muted">{description}</p>}
    </div>
  );
}

```



# FILE: src\components\ui\Input.tsx

- SIZE: 815.00 B
- SHA256: dcecb3cb6f1583aaf0405fdca713bbc426f132773470a8c0027cd966d2ff9dc8

```tsx
import { cn } from "@/lib/utils";
import { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, className, id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s/g, "-");
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-xs font-bold text-tx-muted">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          "focus-ring h-10 w-full rounded-def border border-bd bg-surface-2 px-3 text-sm text-tx outline-none transition-colors placeholder:text-tx-muted/60 focus:border-accent",
          className,
        )}
        {...props}
      />
    </div>
  );
}

```



# FILE: src\components\ui\Pagination.tsx

- SIZE: 925.00 B
- SHA256: 90cf7a7c116a36932b1a7f2503e56a64adaa62e9e49149ed7d4d1169f57688d1

```tsx
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="mt-6 flex items-center justify-center gap-2">
      <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Prev
      </Button>
      <span className="min-w-20 text-center text-sm font-semibold text-tx-muted">
        {page} / {totalPages}
      </span>
      <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        Next
        <ChevronRight className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}

```



# FILE: src\components\ui\SectionHeader.tsx

- SIZE: 1.13 KB
- SHA256: b75f7429859b1e0cea1b3420746eb4532ec9d05e765ee544287718a211cf98fe

```tsx
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  href?: string;
  className?: string;
}

export function SectionHeader({ eyebrow, title, description, href, className }: SectionHeaderProps) {
  return (
    <div className={cn("mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div>
        {eyebrow && (
          <span className="mb-1 inline-block text-xs font-bold uppercase tracking-wide text-accent">
            {eyebrow}
          </span>
        )}
        <h2 className="font-heading text-2xl font-bold text-tx md:text-3xl">{title}</h2>
        {description && <p className="mt-1 max-w-xl text-sm text-tx-muted">{description}</p>}
      </div>
      {href && (
        <Link href={href} className="group inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
          View all
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
        </Link>
      )}
    </div>
  );
}

```



# FILE: src\components\ui\Select.tsx

- SIZE: 840.00 B
- SHA256: 28ab5c49942cd5633beae673d873947d8e1344283c0b71c094fc9a15482e641a

```tsx
import { cn } from "@/lib/utils";
import { SelectHTMLAttributes } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export function Select({ label, className, id, children, ...props }: SelectProps) {
  const selectId = id ?? label?.toLowerCase().replace(/\s/g, "-");
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="mb-1.5 block text-xs font-bold text-tx-muted">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={cn(
          "focus-ring h-10 w-full rounded-def border border-bd bg-surface-2 px-3 text-sm text-tx outline-none transition-colors focus:border-accent",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

```



# FILE: src\components\ui\Skeleton.tsx

- SIZE: 196.00 B
- SHA256: ccf759618afabe12bcd595a96b2abb7518b557da9a7c57e111bbf0f3693be79c

```tsx
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("rounded-def bg-surface-3 animate-pulse-gentle", className)} />;
}

```



# FILE: src\components\ui\Surface.tsx

- SIZE: 273.00 B
- SHA256: 23bcf2db1983043999777aa67c8f098cde3e4da55ccdf88f6d1fd0bc8f748f88

```tsx
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

export function Surface({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-def border border-bd bg-surface p-4", className)}>{children}</div>;
}

```



# FILE: src\components\ui\Toast.tsx

- SIZE: 3.22 KB
- SHA256: 435b654beb1856e278a0d2856d2028f0901df16b1bf809437ae9269c75960263

```tsx
"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle, Info, X, XCircle } from "lucide-react";

/* ─── Types ───────────────────────────────────────────── */
type ToastVariant = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

/* ─── Context ─────────────────────────────────────────── */
const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let _nextId = 0;

/* ─── Provider ────────────────────────────────────────── */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, variant: ToastVariant = "info") => {
    const id = ++_nextId;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container – bottom-right */}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <ToastCard key={t.id} item={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ─── Single Toast Card ───────────────────────────────── */
const variantStyles: Record<ToastVariant, string> = {
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  error: "border-red-500/40 bg-red-500/10 text-red-400",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  info: "border-sky-500/40 bg-sky-500/10 text-sky-400",
};

const variantIcons: Record<ToastVariant, React.ElementType> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertCircle,
  info: Info,
};

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const Icon = variantIcons[item.variant];
  return (
    <div
      className={cn(
        "pointer-events-auto flex min-w-72 max-w-sm items-start gap-3 rounded-lg border px-4 py-3 shadow-lg backdrop-blur-xl transition-all",
        "animate-[slideUp_0.3s_ease-out]",
        variantStyles[item.variant],
      )}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <p className="flex-1 text-sm font-medium leading-5">{item.message}</p>
      <button onClick={onClose} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity" aria-label="Close">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

```



# FILE: src\hooks\useAuth.ts

- SIZE: 2.18 KB
- SHA256: 549f2631bb54fb94b5ba4f71bb6e607896982b282f6672f7b700fc53147180ed

```typescript
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authService } from "@/services/auth.service";
import { API_TOKEN_STORAGE_KEY } from "@/services/api";
import { useAppStore } from "@/store/useAppStore";
import type { LoginPayload, RegisterPayload, UserUpdatePayload } from "@/types/user";

export function useAuth() {
  const queryClient = useQueryClient();
  const token = useAppStore((state) => state.token);
  const user = useAppStore((state) => state.user);
  const setAuth = useAppStore((state) => state.setAuth);
  const setUser = useAppStore((state) => state.setUser);
  const clearAuth = useAppStore((state) => state.clearAuth);

  useEffect(() => {
    if (token && typeof window !== "undefined") {
      window.localStorage.setItem(API_TOKEN_STORAGE_KEY, token);
    }
  }, [token]);

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: authService.me,
    enabled: Boolean(token),
    retry: false,
  });

  useEffect(() => {
    if (meQuery.data) {
      setUser(meQuery.data);
    }
  }, [meQuery.data, setUser]);

  const loginMutation = useMutation({
    mutationFn: (payload: LoginPayload) => authService.login(payload),
    onSuccess: async (data) => {
      setAuth(data.access_token);
      const me = await queryClient.fetchQuery({
        queryKey: ["auth", "me"],
        queryFn: authService.me,
      });
      setUser(me);
    },
  });

  const registerMutation = useMutation({
    mutationFn: (payload: RegisterPayload) => authService.register(payload),
  });

  const updateProfileMutation = useMutation({
    mutationFn: (payload: UserUpdatePayload) => authService.updateMe(payload),
    onSuccess: (nextUser) => {
      setUser(nextUser);
      queryClient.setQueryData(["auth", "me"], nextUser);
    },
  });

  function logout() {
    clearAuth();
    queryClient.removeQueries({ queryKey: ["auth"] });
  }

  return {
    token,
    user: meQuery.data ?? user,
    isAuthenticated: Boolean(token),
    isAdmin: (meQuery.data ?? user)?.Role === "admin",
    isLoadingUser: meQuery.isLoading,
    login: loginMutation,
    register: registerMutation,
    updateProfile: updateProfileMutation,
    logout,
  };
}

```



# FILE: src\hooks\useMangaQueries.ts

- SIZE: 3.69 KB
- SHA256: 2452ada0b7cc6eb58c3ebffd8781bcff06a75bb3d8d4ca781963d3afe0e0f391

```typescript
import { useQuery } from "@tanstack/react-query";
import { chapterService } from "@/services/chapter.service";
import { mangaService } from "@/services/manga.service";
import { tagService } from "@/services/tag.service";
import { recommendationService } from "@/services/analytics.service";
import type { UUID } from "@/types/common";
import type { AdvancedSearchParams, MangaListParams } from "@/types/manga";
import type { ChapterListParams } from "@/types/chapter";

export const mangaKeys = {
  all: ["manga"] as const,
  list: (params?: MangaListParams) => [...mangaKeys.all, "list", params] as const,
  latest: (page: number, limit: number, inMyLists: boolean) => [...mangaKeys.all, "latest", page, limit, inMyLists] as const,
  recent: (page: number, limit: number) => [...mangaKeys.all, "recent", page, limit] as const,
  search: (q: string, limit: number) => [...mangaKeys.all, "search", q, limit] as const,
  advanced: (params?: AdvancedSearchParams) => [...mangaKeys.all, "advanced", params] as const,
  detail: (mangaId?: UUID) => [...mangaKeys.all, "detail", mangaId] as const,
  related: (mangaId?: UUID) => [...mangaKeys.all, "related", mangaId] as const,
  chapters: (mangaId?: UUID, params?: ChapterListParams) => [...mangaKeys.all, "chapters", mangaId, params] as const,
  languages: (mangaId?: UUID) => [...mangaKeys.all, "languages", mangaId] as const,
  recommendations: (mangaId?: UUID) => [...mangaKeys.all, "recommendations", mangaId] as const,
  tags: ["tags"] as const,
};

export function useMangaList(params?: MangaListParams) {
  return useQuery({
    queryKey: mangaKeys.list(params),
    queryFn: () => mangaService.list(params),
  });
}

export function useLatestManga(page = 1, limit = 12, inMyLists = false) {
  return useQuery({
    queryKey: mangaKeys.latest(page, limit, inMyLists),
    queryFn: () => mangaService.latestUpdates(page, limit, inMyLists),
  });
}

export function useRecentlyAdded(page = 1, limit = 12) {
  return useQuery({
    queryKey: mangaKeys.recent(page, limit),
    queryFn: () => mangaService.recentlyAdded(page, limit),
  });
}

export function useMangaSearch(q: string, limit = 8) {
  return useQuery({
    queryKey: mangaKeys.search(q, limit),
    queryFn: () => mangaService.search(q, limit),
    enabled: q.trim().length > 0,
  });
}

export function useAdvancedSearch(params?: AdvancedSearchParams) {
  return useQuery({
    queryKey: mangaKeys.advanced(params),
    queryFn: () => mangaService.advancedSearch(params),
  });
}

export function useMangaDetail(mangaId?: UUID) {
  return useQuery({
    queryKey: mangaKeys.detail(mangaId),
    queryFn: () => mangaService.detail(mangaId as UUID),
    enabled: Boolean(mangaId),
  });
}

export function useRelatedManga(mangaId?: UUID) {
  return useQuery({
    queryKey: mangaKeys.related(mangaId),
    queryFn: () => mangaService.related(mangaId as UUID),
    enabled: Boolean(mangaId),
  });
}

export function useMangaRecommendations(mangaId?: UUID) {
  return useQuery({
    queryKey: mangaKeys.recommendations(mangaId),
    queryFn: () => recommendationService.getSimilar(mangaId as string),
    enabled: Boolean(mangaId),
  });
}

export function useChapters(mangaId?: UUID, params?: ChapterListParams) {
  return useQuery({
    queryKey: mangaKeys.chapters(mangaId, params),
    queryFn: () => chapterService.list(mangaId as UUID, params),
    enabled: Boolean(mangaId),
  });
}

export function useChapterLanguages(mangaId?: UUID) {
  return useQuery({
    queryKey: mangaKeys.languages(mangaId),
    queryFn: () => chapterService.languages(mangaId as UUID),
    enabled: Boolean(mangaId),
  });
}

export function useTagGroups() {
  return useQuery({
    queryKey: mangaKeys.tags,
    queryFn: tagService.list,
    staleTime: 1000 * 60 * 15,
  });
}

```



# FILE: src\hooks\useReader.ts

- SIZE: 5.34 KB
- SHA256: 680f88e5f05f2c9cf8895473d1ad1ea94f27dd0edd28b1381bfbe38cc68d59c6

```typescript
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { chapterService } from "@/services/chapter.service";
import { historyService } from "@/services/history.service";
import { translateService } from "@/services/translate.service";
import type { UUID } from "@/types/common";

export type TranslateState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; url: string }
  | { status: "error"; message: string };

export function useReader(mangaId?: UUID, chapterId?: UUID) {
  const [currentPage, setCurrentPage] = useState(1);

  // ── Per-page translation state: pageIndex (1-based) → TranslateState ──
  const [translateStates, setTranslateStates] = useState<Record<number, TranslateState>>({});

  // ── Target language for translation ──────────────────────────────────────
  const [translateLang, setTranslateLang] = useState<string>("vi");

  const chapterQuery = useQuery({
    queryKey: ["reader", mangaId, chapterId],
    queryFn: () => chapterService.detail(mangaId as UUID, chapterId as UUID),
    enabled: Boolean(mangaId && chapterId),
  });

  const recordHistoryMutation = useMutation({
    mutationFn: (lastPage: number) =>
      historyService.record({
        MangaId: mangaId as UUID,
        ChapterId: chapterId as UUID,
        LastPageRead: lastPage,
      }),
  });

  const totalPages = chapterQuery.data?.page_urls.length ?? 0;

  const progress = useMemo(() => {
    if (!totalPages) return 0;
    return Math.round((currentPage / totalPages) * 100);
  }, [currentPage, totalPages]);

  // Reset per-page translation states when chapter changes
  useEffect(() => {
    setCurrentPage(1);
    setTranslateStates({});
  }, [chapterId]);

  useEffect(() => {
    const urls = chapterQuery.data?.page_urls.slice(0, 4) ?? [];
    urls.forEach((url) => {
      const image = new Image();
      image.src = url;
    });
  }, [chapterQuery.data?.page_urls]);

  useEffect(() => {
    if (!mangaId || !chapterId || !totalPages) return;
    const timeout = window.setTimeout(() => {
      recordHistoryMutation.mutate(currentPage);
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [chapterId, currentPage, mangaId, totalPages]);

  const goToPage = useCallback(
    (page: number) => {
      const bounded = Math.min(Math.max(page, 1), Math.max(totalPages, 1));
      setCurrentPage(bounded);
      const element = document.getElementById(`reader-page-${bounded}`);
      element?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [totalPages],
  );

  /**
   * Translate a single page (1-based index).
   * If already translated with the same language, does nothing.
   */
  const translatePage = useCallback(
    async (pageIndex: number) => {
      const pageUrls = chapterQuery.data?.page_urls;
      if (!pageUrls || pageIndex < 1 || pageIndex > pageUrls.length) return;

      const currentState = translateStates[pageIndex];
      // Skip if already loading or successfully translated in the same language
      if (currentState?.status === "loading") return;
      if (currentState?.status === "done") return;

      const imageUrl = pageUrls[pageIndex - 1];

      setTranslateStates((prev) => ({
        ...prev,
        [pageIndex]: { status: "loading" },
      }));

      try {
        const result = await translateService.translatePage({
          image_url: imageUrl,
          target_lang: translateLang,
          source_lang: "auto",
        });
        setTranslateStates((prev) => ({
          ...prev,
          [pageIndex]: { status: "done", url: result.translated_url },
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Translation failed";
        setTranslateStates((prev) => ({
          ...prev,
          [pageIndex]: { status: "error", message },
        }));
      }
    },
    [chapterQuery.data?.page_urls, translateLang, translateStates],
  );

  /**
   * Translate all pages of the current chapter sequentially.
   */
  const translateAllPages = useCallback(async () => {
    const pageUrls = chapterQuery.data?.page_urls ?? [];
    for (let i = 1; i <= pageUrls.length; i++) {
      await translatePage(i);
    }
  }, [chapterQuery.data?.page_urls, translatePage]);

  /**
   * Reset translation for a page (revert to original).
   */
  const resetPageTranslation = useCallback((pageIndex: number) => {
    setTranslateStates((prev) => {
      const next = { ...prev };
      delete next[pageIndex];
      return next;
    });
  }, []);

  /**
   * Reset all translations for the current chapter.
   */
  const resetAllTranslations = useCallback(() => {
    setTranslateStates({});
  }, []);

  /**
   * Change target language and clear existing translations so they
   * are re-requested with the new language on next translate call.
   */
  const changeTranslateLang = useCallback((lang: string) => {
    setTranslateLang(lang);
    setTranslateStates({});
  }, []);

  return {
    chapterQuery,
    chapter: chapterQuery.data,
    currentPage,
    totalPages,
    progress,
    setCurrentPage,
    goToPage,
    recordHistory: recordHistoryMutation,
    // Translation
    translateStates,
    translateLang,
    translatePage,
    translateAllPages,
    resetPageTranslation,
    resetAllTranslations,
    changeTranslateLang,
  };
}
```



# FILE: src\lib\utils.ts

- SIZE: 1.32 KB
- SHA256: aebf5cae9c169865174df3c630623670c8b0fe6d2b7615c4afd0336155477cd0

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(value?: number | null) {
  if (value === undefined || value === null) return "0";
  return new Intl.NumberFormat("en", { notation: value > 9999 ? "compact" : "standard" }).format(value);
}

export function formatDate(value?: string | null) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function pickDescription<T extends { LangCode?: string | null; Description?: string | null }>(items?: T[]) {
  if (!items?.length) return "";
  return (
    items.find((item) => item.LangCode === "en")?.Description ??
    items.find((item) => item.LangCode === "vi")?.Description ??
    items[0]?.Description ??
    ""
  );
}

export function titleCase(value?: string | null) {
  if (!value) return "Unknown";
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function shortId(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 8);
}

```



# FILE: src\services\admin.service.ts

- SIZE: 1.48 KB
- SHA256: 8b7237df86a869c35f2208c8e068cdda03096261ee0e6beb6bcf9627262145e1

```typescript
import { api, compactParams } from "./api";
import type { UUID } from "@/types/common";
import type { AdminDashboard, AdminUserPage, ReportedCommentPage } from "@/types/admin";

export const adminService = {
  async dashboard(params?: { start_date?: string; end_date?: string }) {
    const { data } = await api.get<AdminDashboard>("/admin/dashboard", {
      params: compactParams(params),
    });
    return data;
  },

  async users(params?: { page?: number; limit?: number; q?: string }) {
    const { data } = await api.get<AdminUserPage>("/admin/users", {
      params: compactParams(params),
    });
    return data;
  },

  async banUser(userId: UUID) {
    const { data } = await api.post<{ success: boolean; message: string }>(`/admin/users/${userId}/ban`);
    return data;
  },

  async unbanUser(userId: UUID) {
    const { data } = await api.post<{ success: boolean; message: string }>(`/admin/users/${userId}/unban`);
    return data;
  },

  async reportedComments(params?: { page?: number; limit?: number; status?: string }) {
    const { data } = await api.get<ReportedCommentPage>("/admin/comments", {
      params: compactParams(params),
    });
    return data;
  },

  async deleteComment(commentId: UUID) {
    const { data } = await api.post<{ success: boolean }>(`/admin/comments/${commentId}/delete`);
    return data;
  },

  async ignoreComment(commentId: UUID) {
    const { data } = await api.post<{ success: boolean }>(`/admin/comments/${commentId}/ignore`);
    return data;
  },
};

```



# FILE: src\services\analytics.service.ts

- SIZE: 8.17 KB
- SHA256: 4392ecfa906f19fc2a34b4af2d4d36545e00ad3d96779195d21da906790887a7

```typescript
import { api } from "./api";
import type { MangaListItem } from "@/types/manga";

export interface UserStats {
  total_manga: number;
  total_chapters: number;
  total_sessions: number;
  total_pages: number;
  total_ratings: number;
  avg_rating: number | null;
  daily_activity: Array<{ date: string; count: number }>;
  genre_distribution: Array<{ name: string; count: number }>;
  theme_distribution: Array<{ name: string; count: number }>;
  recent_manga: Array<{ manga_id: string; title: string | null }>;
}

export interface RecommendationItem {
  manga_id: string;
  title: string | null;
  status: string | null;
  year: number | null;
  content_rating: string | null;
  predicted_score: number;
  source: "collaborative_filtering" | "popularity";
}

export interface SimilarMangaItem extends MangaListItem {
  score: number;
  relation_type: string;
}

// ─── Helpers ────────────────────────────────────────────────────

/** Pick the best English-ish title from a MangaDex title map. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickMdTitle(titleObj: any): string {
  if (!titleObj) return "Unknown";
  return (
    titleObj["en"] ??
    titleObj["ja-ro"] ??
    titleObj["ja"] ??
    (Object.values(titleObj)[0] as string | undefined) ??
    "Unknown"
  );
}

/**
 * Fetch manga details (title + cover) for a list of IDs straight from
 * the public MangaDex API. Returns a map of id → partial SimilarMangaItem.
 */
async function fetchMdDetails(
  ids: string[],
): Promise<Map<string, Partial<SimilarMangaItem>>> {
  const map = new Map<string, Partial<SimilarMangaItem>>();
  if (!ids.length) return map;

  try {
    const query = ids.map((id) => `ids[]=${id}`).join("&");
    const res = await fetch(
      `https://api.mangadex.org/manga?includes[]=cover_art&limit=${ids.length}&${query}`,
      { headers: { accept: "application/json" } },
    );
    if (!res.ok) return map;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const m of json.data ?? [] as any[]) {
      const attrs = m.attributes ?? {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const coverRel = (m.relationships ?? []).find((r: any) => r.type === "cover_art");
      const coverUrl = coverRel?.attributes?.fileName
        ? `https://uploads.mangadex.org/covers/${m.id}/${coverRel.attributes.fileName}.256.jpg`
        : undefined;

      map.set(m.id, {
        TitleEn: pickMdTitle(attrs.title),
        Status: attrs.status ?? undefined,
        Year: attrs.year ?? undefined,
        ContentRating: attrs.contentRating ?? undefined,
        cover_url: coverUrl,
      });
    }
  } catch (e) {
    console.error("[analytics] fetchMdDetails failed", e);
  }
  return map;
}

// ─── Services ───────────────────────────────────────────────────

export const analyticsService = {
  async getUserStats() {
    const { data } = await api.get<UserStats>("/analytics/user-stats");
    return data;
  },
};

export const recommendationService = {
  async getForMe(topN = 20) {
    const { data } = await api.get<{ recommendations: RecommendationItem[]; count: number }>(
      "/recommendations/for-me",
      { params: { top_n: topN } },
    );
    return data;
  },

  async getSimilar(mangaId: string): Promise<{ recommendations: SimilarMangaItem[]; source: string }> {
    // ── Step 1: Try backend endpoint first ────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let backendData: any = { recommendations: [] };
    try {
      const { data } = await api.get<any>(`/recommendations/manga/${mangaId}/similar`);
      backendData = data;
    } catch (e) {
      // Backend may 404 or error — we will fall through to the MangaDex fallback below.
      console.warn("[analytics] Backend /recommendations/manga similar failed, falling back to MangaDex", e);
    }

    let valid: SimilarMangaItem[] = [];

    if (Array.isArray(backendData.recommendations) && backendData.recommendations.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      valid = backendData.recommendations.map((r: any) => ({
        MangaId: r.manga_id,
        TitleEn: r.title ?? null,
        cover_url: r.cover_url ?? null,
        Status: r.status ?? null,
        Year: r.year ?? null,
        ContentRating: r.content_rating ?? null,
        score: r.score ?? 0,
        relation_type: r.relation_type ?? "similar",
      }));
    }

    // ── Step 2: Fallback — call MangaDex recommendation API directly ──
    // Triggered when the backend returns nothing (empty DB, endpoint not
    // implemented, or request failed). We call MangaDex from the browser.
    if (valid.length === 0) {
      try {
        const mdRes = await fetch(
          `https://api.mangadex.org/manga/${mangaId}/recommendation` +
          `?order[score]=desc` +
          `&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica`,
          { headers: { accept: "application/json" } },
        );

        if (mdRes.ok) {
          const mdJson = await mdRes.json();

          // Each recommendation entry has two relationships:
          //   [0] = source manga (same as mangaId)
          //   [1] = the recommended manga
          // We want the ID that is NOT mangaId.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const scoreMap = new Map<string, number>();
          const recIds: string[] = [];

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const entry of mdJson.data ?? [] as any[]) {
            const score: number = entry.attributes?.score ?? 0;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const otherRel = (entry.relationships ?? [] as any[]).find(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (r: any) => r.type === "manga" && r.id !== mangaId,
            );
            if (otherRel?.id) {
              recIds.push(otherRel.id);
              scoreMap.set(otherRel.id, score);
            }
          }

          if (recIds.length > 0) {
            // Fetch full details (title + cover) for all recommended IDs.
            const detailMap = await fetchMdDetails(recIds.slice(0, 20));

            valid = recIds
              .slice(0, 20)
              .map((id) => {
                const detail = detailMap.get(id) ?? {};
                return {
                  MangaId: id,
                  TitleEn: detail.TitleEn ?? null,
                  cover_url: detail.cover_url ?? null,
                  Status: detail.Status ?? null,
                  Year: detail.Year ?? null,
                  ContentRating: detail.ContentRating ?? null,
                  score: scoreMap.get(id) ?? 0,
                  relation_type: "similar",
                } as SimilarMangaItem;
              })
              .filter((item) => item.TitleEn); // drop items we couldn't resolve
          }
        }
      } catch (e) {
        console.error("[analytics] MangaDex recommendation fallback failed", e);
      }
    }

    // ── Step 3: Enrich any backend items still missing title / cover ──
    // (Only needed when the backend returned items but with incomplete data.)
    const missingIds = valid
      .filter((v) => !v.TitleEn || !v.cover_url)
      .map((v) => v.MangaId);

    if (missingIds.length > 0) {
      const detailMap = await fetchMdDetails(missingIds);
      for (const item of valid) {
        if ((!item.TitleEn || !item.cover_url) && detailMap.has(item.MangaId)) {
          const detail = detailMap.get(item.MangaId)!;
          item.TitleEn = item.TitleEn || detail.TitleEn || null;
          item.cover_url = item.cover_url || detail.cover_url || null;
          item.Status = item.Status || detail.Status || null;
        }
      }
    }

    return {
      recommendations: valid,
      source: backendData.source ?? "mangadex",
    };
  },
};
```



# FILE: src\services\api.ts

- SIZE: 1.59 KB
- SHA256: 58346cedd926afa853acd91c203c49d89745bd0c3a7ab543027c53abb745095f

```typescript
import axios, { AxiosError } from "axios";

export const API_TOKEN_STORAGE_KEY = "manga_auth_token";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
  "http://localhost:8000/api/v1";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem(API_TOKEN_STORAGE_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }

  // Khi body là FormData, xóa Content-Type để browser tự set
  // multipart/form-data; boundary=<auto-generated>
  if (config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }

  return config;
});

export function compactParams<T extends object>(params?: T) {
  if (!params) return undefined;

  return Object.fromEntries(
    Object.entries(params as Record<string, unknown>).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ detail?: string; message?: string }>;
    const detail = axiosError.response?.data?.detail ?? axiosError.response?.data?.message;
    if (detail) return detail;
    if (axiosError.code === "ECONNABORTED") return "Request timed out. Backend co the dang ban.";
    return axiosError.message;
  }

  if (error instanceof Error) return error.message;
  return "Co loi khong xac dinh xay ra.";
}

```



# FILE: src\services\auth.service.ts

- SIZE: 1.08 KB
- SHA256: 44ed2c443cc7eeffff01b9508d219a9a4839c38e1c5a5c4715f3c412c23e5007

```typescript
import { api } from "./api";
import type { LoginPayload, RegisterPayload, TokenResponse, User, UserUpdatePayload } from "@/types/user";

export const authService = {
  async register(payload: RegisterPayload) {
    const { data } = await api.post<User>("/auth/register", payload);
    return data;
  },

  async login(payload: LoginPayload) {
    const body = new URLSearchParams();
    body.set("username", payload.username);
    body.set("password", payload.password);

    const { data } = await api.post<TokenResponse>("/auth/login", body, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    return data;
  },

  async me() {
    const { data } = await api.get<User>("/auth/me");
    return data;
  },

  async updateMe(payload: UserUpdatePayload) {
    const { data } = await api.put<User>("/auth/me", payload);
    return data;
  },

  async uploadAvatar(file: File) {
    const form = new FormData();
    form.append("file", file);
    const { data } = await api.post<{ success: boolean; avatar_url: string }>("/auth/me/avatar", form);
    return data;
  },
};

```



# FILE: src\services\chapter.service.ts

- SIZE: 704.00 B
- SHA256: 50682698a757f73f54ec83bb7c989be62a0783cf0be8583f47c8bed68360b48f

```typescript
import { api, compactParams } from "./api";
import type { UUID } from "@/types/common";
import type { Chapter, ChapterListParams, ChapterNav } from "@/types/chapter";

export const chapterService = {
  async list(mangaId: UUID, params?: ChapterListParams) {
    const { data } = await api.get<Chapter[]>(`/manga/${mangaId}/chapters`, {
      params: compactParams(params),
    });
    return data;
  },

  async languages(mangaId: UUID) {
    const { data } = await api.get<string[]>(`/manga/${mangaId}/languages`);
    return data;
  },

  async detail(mangaId: UUID, chapterId: UUID) {
    const { data } = await api.get<ChapterNav>(`/manga/${mangaId}/chapters/${chapterId}`);
    return data;
  },
};

```



# FILE: src\services\chat.service.ts

- SIZE: 8.09 KB
- SHA256: 1d4c20fbd701cc8e2fd83e94946690c1eabd30eb95148164bdecf1a20c55ae1b

```typescript
/**
 * Chat service – room-based WebSocket chat with REST API for history.
 * Supports: direct & group chats, typing indicators, message status, image sharing.
 */
import { api } from "./api";
import { API_TOKEN_STORAGE_KEY } from "./api";

/* ─── Types ───────────────────────────────────────────── */
export interface ChatMessage {
  message_id: string;
  room_id: string;
  sender_id: string;
  sender_username?: string | null;
  sender_avatar?: string | null;
  sender_display_name?: string | null;
  content?: string | null;
  message_type: string;
  media_url?: string | null;
  reply_to_id?: string | null;
  status: string;
  created_at?: string | null;
  edited_at?: string | null;
  is_own?: boolean;
}

export interface ChatRoomMember {
  user_id: string;
  username: string;
  avatar?: string | null;
  display_name?: string | null;
}

export interface ChatRoom {
  room_id: string;
  type: "direct" | "group";
  name?: string | null;
  avatar_url?: string | null;
  members: ChatRoomMember[];
  last_message?: {
    content?: string | null;
    sender_id?: string | null;
    created_at?: string | null;
    type?: string | null;
  } | null;
  unread_count: number;
  updated_at?: string | null;
}

export interface WsEvent {
  type: "message" | "typing" | "read" | "error";
  [key: string]: unknown;
}

type MessageHandler = (event: WsEvent) => void;
type ConnectionHandler = (connected: boolean) => void;

/* ─── REST API ────────────────────────────────────────── */
export const chatApi = {
  async getRooms(page = 1, limit = 50) {
    const { data } = await api.get<{ rooms: ChatRoom[] }>("/chat/rooms", {
      params: { page, limit },
    });
    return data.rooms;
  },

  async createRoom(type: "direct" | "group", userIds: string[], name?: string) {
    const { data } = await api.post<{ room_id: string; existing: boolean }>("/chat/rooms", {
      type,
      user_ids: userIds,
      name,
    });
    return data;
  },

  async getMessages(roomId: string, page = 1, limit = 50) {
    const { data } = await api.get<{
      messages: ChatMessage[];
      page: number;
      total: number;
      total_pages: number;
    }>(`/chat/rooms/${roomId}/messages`, { params: { page, limit } });
    return data;
  },

  async sendMessage(roomId: string, content: string, replyToId?: string) {
    const { data } = await api.post<{ message_id: string; created_at: string }>(
      `/chat/rooms/${roomId}/messages`,
      { content, reply_to_id: replyToId },
    );
    return data;
  },

  async uploadMedia(roomId: string, file: File) {
    const form = new FormData();
    form.append("file", file);
    const { data } = await api.post<{ message_id: string; media_url: string }>(
      `/chat/rooms/${roomId}/media`,
      form,
    );
    return data;
  },

  async markRead(messageId: string) {
    await api.put(`/chat/messages/${messageId}/read`);
  },

  async markRoomRead(roomId: string) {
    await api.post(`/chat/rooms/${roomId}/read`);
  },

  async renameRoom(roomId: string, name: string) {
    await api.put(`/chat/rooms/${roomId}`, { name });
  },

  async leaveRoom(roomId: string) {
    await api.delete(`/chat/rooms/${roomId}/members/me`);
  },

  async getMembers(roomId: string) {
    const { data } = await api.get<{ members: ChatRoomMember[] }>(`/chat/rooms/${roomId}/members`);
    return data.members;
  },

  async addMember(roomId: string, userId: string) {
    await api.post(`/chat/rooms/${roomId}/members`, { user_id: userId });
  },

  async removeMember(roomId: string, userId: string) {
    await api.delete(`/chat/rooms/${roomId}/members/${userId}`);
  },
};

/* ─── WebSocket Service ───────────────────────────────── */
class ChatWebSocketService {
  private ws: WebSocket | null = null;
  private messageHandlers: MessageHandler[] = [];
  private connectionHandlers: ConnectionHandler[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _currentRoomId: string | null = null;
  private _isConnected = false;
  private _token: string | null = null;
  private _reconnectAttempts = 0;

  get isConnected() {
    return this._isConnected;
  }

  get currentRoomId() {
    return this._currentRoomId;
  }

  /**
   * Connect to a specific chat room via WebSocket.
   */
  connect(roomId: string, token?: string | null) {
    // Disconnect from previous room if different
    if (this._currentRoomId && this._currentRoomId !== roomId) {
      this.disconnect();
    }

    this._token = token || (typeof window !== "undefined" ? localStorage.getItem(API_TOKEN_STORAGE_KEY) : null);
    this._currentRoomId = roomId;

    // Don't attempt connection without a valid token
    if (!this._token) {
      console.warn("[ChatWS] No auth token available, skipping connection");
      return;
    }

    if (this.ws?.readyState === WebSocket.OPEN && this._currentRoomId === roomId) return;

    if (this.ws) {
      this.ws.onclose = null; // tắt auto-reconnect của WS cũ
      this.ws.close();
      this.ws = null;
    }

    const defaultWsHost = typeof window !== "undefined"
      ? `ws://${window.location.hostname}:8000/ws`
      : "ws://localhost:8000/ws";
    const rawWsHost = (process.env.NEXT_PUBLIC_WS_URL ?? defaultWsHost).replace(/\/$/, "");
    const wsHost = rawWsHost.endsWith("/ws") ? rawWsHost : `${rawWsHost}/ws`;
    const url = `${wsHost}/chat/${roomId}?token=${encodeURIComponent(this._token)}`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this._isConnected = true;
        this._reconnectAttempts = 0;
        this.notifyConnectionHandlers(true);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WsEvent;
          this.messageHandlers.forEach((h) => h(data));
        } catch {
          // ignore non-JSON
        }
      };

      this.ws.onclose = () => {
        this._isConnected = false;
        this.notifyConnectionHandlers(false);
        // Auto-reconnect with backoff (max 5 attempts)
        if (this._currentRoomId && (this._reconnectAttempts ?? 0) < 5) {
          this._reconnectAttempts = (this._reconnectAttempts ?? 0) + 1;
          const delay = Math.min(1000 * Math.pow(2, this._reconnectAttempts ?? 0), 30000);
          this.reconnectTimer = setTimeout(() => this.connect(roomId, this._token), delay);
        }
      };

      this.ws.onerror = () => {
        // onerror is always followed by onclose, no need to log scary errors
      };
    } catch (err) {
      console.error("[ChatWS] Failed to connect", err);
    }
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this._currentRoomId = null;
    this.ws?.close();
    this.ws = null;
    this._isConnected = false;
    this.notifyConnectionHandlers(false);
  }

  /** Send a text message via WebSocket (real-time). */
  sendMessage(content: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "message", content }));
  }

  /** Send typing indicator. */
  sendTyping(isTyping: boolean) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "typing", is_typing: isTyping }));
  }

  /** Send read receipt. */
  sendRead(messageId: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "read", message_id: messageId }));
  }

  onMessage(handler: MessageHandler) {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter((h) => h !== handler);
    };
  }

  onConnection(handler: ConnectionHandler) {
    this.connectionHandlers.push(handler);
    return () => {
      this.connectionHandlers = this.connectionHandlers.filter((h) => h !== handler);
    };
  }

  private notifyConnectionHandlers(connected: boolean) {
    this.connectionHandlers.forEach((h) => h(connected));
  }
}

// Singleton
export const chatService = new ChatWebSocketService();

```



# FILE: src\services\comment.service.ts

- SIZE: 1.56 KB
- SHA256: 1cda706b75d4b768c65a36a134506e51290cf8a8d24cee53c1e48979937b08ec

```typescript
import { api } from "./api";
import type { PaginatedResponse, UUID } from "@/types/common";
import type {
  Comment,
  CommentCreatePayload,
  CommentReactionResponse,
  CommentUpdatePayload,
  ReportCreatePayload,
} from "@/types/comment";

export const commentService = {
  async list(mangaId: UUID, page = 1, limit = 20) {
    const { data } = await api.get<PaginatedResponse<Comment>>(`/comments/manga/${mangaId}/comments`, {
      params: { page, limit },
    });
    return data;
  },

  async create(mangaId: UUID, payload: CommentCreatePayload) {
    const { data } = await api.post<{ success: boolean; comment: Comment }>(
      `/comments/manga/${mangaId}/comments`,
      payload,
    );
    return data;
  },

  async update(commentId: UUID, payload: CommentUpdatePayload) {
    const { data } = await api.put<{ success: boolean; content: string; updated_at: string }>(
      `/comments/${commentId}`,
      payload,
    );
    return data;
  },

  async remove(commentId: UUID) {
    const { data } = await api.delete<{ success: boolean }>(`/comments/${commentId}`);
    return data;
  },

  async like(commentId: UUID) {
    const { data } = await api.post<CommentReactionResponse>(`/comments/${commentId}/like`);
    return data;
  },

  async dislike(commentId: UUID) {
    const { data } = await api.post<CommentReactionResponse>(`/comments/${commentId}/dislike`);
    return data;
  },

  async report(commentId: UUID, payload: ReportCreatePayload) {
    const { data } = await api.post<{ success: boolean }>(`/comments/${commentId}/report`, payload);
    return data;
  },
};

```



# FILE: src\services\cover.service.ts

- SIZE: 420.00 B
- SHA256: 763f77671bf1ea241a5dc2783030348ce42007eceefa95fb2a9a0588c1b404ce

```typescript
import { api } from "./api";
import type { UUID } from "@/types/common";
import type { Cover } from "@/types/manga";

export const coverService = {
  async primary(mangaId: UUID) {
    const { data } = await api.get<Cover>(`/covers/manga/${mangaId}`);
    return data ?? null;
  },

  async all(mangaId: UUID) {
    const { data } = await api.get<Cover[]>(`/covers/manga/${mangaId}/all`);
    return data ?? [];
  },
};

```



# FILE: src\services\creator.service.ts

- SIZE: 664.00 B
- SHA256: ae1372693fd5a909fa95d17a8f4f91b20e8a02f8b2d4c8be264fb929444df6bf

```typescript
import { api } from "./api";
import type { MangaListItem } from "@/types/manga";

export interface CreatorProfile {
  id: string;
  name: string;
  image_url: string | null;
  biography: string | null;
  created_at: string | null;
}

export interface CreatorDetailResponse {
  creator: CreatorProfile;
  mangas: {
    items: MangaListItem[];
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

export const creatorService = {
  async getCreator(id: string, page = 1, limit = 20) {
    const { data } = await api.get<CreatorDetailResponse>(`/creators/${id}`, {
      params: { page, limit },
    });
    return data;
  },
};

```



# FILE: src\services\history.service.ts

- SIZE: 916.00 B
- SHA256: 608bdea8a89517b420cd2f777a513660e07f8970b39206f691fccba46d4dd61a

```typescript
import { api } from "./api";
import type { PaginatedResponse, UUID } from "@/types/common";
import type { ContinueReadingResponse, GroupedHistoryResponse, HistoryCreatePayload, HistoryEntry } from "@/types/history";

export const historyService = {
  async record(payload: HistoryCreatePayload) {
    const { data } = await api.post<{ success: boolean }>("/history/", payload);
    return data;
  },

  async list(page = 1, limit = 20) {
    const { data } = await api.get<PaginatedResponse<HistoryEntry>>("/history/", {
      params: { page, limit },
    });
    return data;
  },

  async grouped(limit = 100) {
    const { data } = await api.get<GroupedHistoryResponse>("/history/grouped", {
      params: { limit },
    });
    return data;
  },

  async continueReading(mangaId: UUID) {
    const { data } = await api.get<ContinueReadingResponse>(`/history/manga/${mangaId}/continue`);
    return data;
  },
};

```



# FILE: src\services\list.service.ts

- SIZE: 2.05 KB
- SHA256: 659692a8f8696c41f62e6fe2c6a4212975c1cfdf0bad9165ace328b4222b662f

```typescript
import { api, compactParams } from "./api";
import type { PaginatedResponse, UUID } from "@/types/common";
import type {
  ListCreatePayload,
  ListUpdatePayload,
  MangaListCollection,
  MangaListDetail,
  PublicListItem,
} from "@/types/list";

export const listService = {
  async mine(mangaId?: UUID) {
    const { data } = await api.get<MangaListCollection>("/lists/", {
      params: compactParams({ manga_id: mangaId }),
    });
    return data;
  },

  async create(payload: ListCreatePayload) {
    const { data } = await api.post<{ id: UUID; slug: string }>("/lists/", payload);
    return data;
  },

  async publicLists(params?: { page?: number; limit?: number; sort?: string; q?: string }) {
    const { data } = await api.get<PaginatedResponse<PublicListItem>>("/lists/public", {
      params: compactParams(params),
    });
    return data;
  },

  async detail(listId: UUID) {
    const { data } = await api.get<MangaListDetail>(`/lists/${listId}`);
    return data;
  },

  async update(listId: UUID, payload: ListUpdatePayload) {
    const { data } = await api.put<{ success: boolean }>(`/lists/${listId}`, payload);
    return data;
  },

  async remove(listId: UUID) {
    await api.delete(`/lists/${listId}`);
  },

  async addItem(listId: UUID, mangaId: UUID) {
    const { data } = await api.post<{ success?: boolean; message?: string; item_count: number }>(
      `/lists/${listId}/items`,
      null,
      { params: { manga_id: mangaId } },
    );
    return data;
  },

  async removeItem(listId: UUID, mangaId: UUID) {
    const { data } = await api.delete<{ success: boolean; item_count: number }>(
      `/lists/${listId}/items/${mangaId}`,
    );
    return data;
  },

  async follow(listId: UUID) {
    const { data } = await api.post<{ success?: boolean; message?: string; follower_count?: number }>(
      `/lists/${listId}/follow`,
    );
    return data;
  },

  async unfollow(listId: UUID) {
    const { data } = await api.delete<{ success?: boolean; message?: string; follower_count?: number }>(
      `/lists/${listId}/follow`,
    );
    return data;
  },
};

```



# FILE: src\services\manga.service.ts

- SIZE: 1.76 KB
- SHA256: 912054a803c8cee3643701eb5525cc7e4fd30ae74bb94dd8c53d67ec6b408be4

```typescript
import { api, compactParams } from "./api";
import type { PaginatedResponse, UUID } from "@/types/common";
import type {
  AdvancedSearchParams,
  MangaDetail,
  MangaListItem,
  MangaListParams,
  RelatedManga,
} from "@/types/manga";

export const mangaService = {
  async list(params?: MangaListParams) {
    const { data } = await api.get<PaginatedResponse<MangaListItem>>("/mangas/", {
      params: compactParams(params),
    });
    return data;
  },

  async search(q: string, limit = 10) {
    const { data } = await api.get<MangaListItem[]>("/mangas/search", {
      params: { q, limit },
    });
    return data;
  },

  async advancedSearch(params?: AdvancedSearchParams) {
    const { data } = await api.get<PaginatedResponse<MangaListItem>>("/mangas/advanced-search", {
      params: compactParams(params),
    });
    return data;
  },

  async random() {
    const { data } = await api.get<MangaListItem | { message: string }>("/mangas/random");
    return data;
  },

  async recentlyAdded(page = 1, limit = 12) {
    const { data } = await api.get<PaginatedResponse<MangaListItem>>("/mangas/recently-added", {
      params: { page, limit },
    });
    return data;
  },

  async latestUpdates(page = 1, limit = 12, inMyLists = false) {
    const { data } = await api.get<{
      items: MangaListItem[];
      page: number;
      per_page: number;
      total: number;
      total_pages: number;
    }>("/mangas/latest-updates", {
      params: { page, limit, in_my_lists: inMyLists },
    });
    return data;
  },

  async detail(mangaId: UUID) {
    const { data } = await api.get<MangaDetail>(`/mangas/${mangaId}`);
    return data;
  },

  async related(mangaId: UUID) {
    const { data } = await api.get<RelatedManga[]>(`/mangas/${mangaId}/related`);
    return data;
  },
};

```



# FILE: src\services\rating.service.ts

- SIZE: 485.00 B
- SHA256: 6154c0e5633793f3c36369f2024b61b8ac5e6d1cd990f62055a031e93287d9e7

```typescript
import { api } from "./api";
import type { UUID } from "@/types/common";
import type { Rating, RatingCreatePayload } from "@/types/rating";

export const ratingService = {
  async rate(mangaId: UUID, payload: RatingCreatePayload) {
    const { data } = await api.post<Rating>(`/ratings/manga/${mangaId}/rate`, payload);
    return data;
  },

  async myRating(mangaId: UUID) {
    const { data } = await api.get<Rating>(`/ratings/manga/${mangaId}/my-rating`);
    return data;
  },
};

```



# FILE: src\services\tag.service.ts

- SIZE: 205.00 B
- SHA256: 27d639bd4011841aff7c99e419c1160bb95b9aa902db6c04756d8d26a025f016

```typescript
import { api } from "./api";
import type { TagGroup } from "@/types/manga";

export const tagService = {
  async list() {
    const { data } = await api.get<TagGroup[]>("/tags/");
    return data;
  },
};

```



# FILE: src\services\translate.service.ts

- SIZE: 1.33 KB
- SHA256: eab2fdfd9363ad6427ce4b28bdd037f0340e5321e2f18755db6e695692768296

```typescript
import { api } from "./api";

export interface TranslatePageRequest {
    image_url: string;
    target_lang?: string;  // default "vi"
    source_lang?: string;  // default "auto"
}

export interface TranslatePageResponse {
    translated_url: string;
}

export const translateService = {
    async translatePage(payload: TranslatePageRequest): Promise<TranslatePageResponse> {
        const { data } = await api.post<TranslatePageResponse>("/translate/page", {
            image_url: payload.image_url,
            target_lang: payload.target_lang ?? "vi",
            source_lang: payload.source_lang ?? "auto",
        });
        return data;
    },
};

/** Map of ISO 639-1 codes to display names (for the language picker). */
export const TRANSLATE_LANGS: { code: string; label: string }[] = [
    { code: "vi", label: "Tiếng Việt" },
    { code: "en", label: "English" },
    { code: "zh-CN", label: "中文 (简体)" },
    { code: "zh-TW", label: "中文 (繁體)" },
    { code: "ko", label: "한국어" },
    { code: "ja", label: "日本語" },
    { code: "fr", label: "Français" },
    { code: "de", label: "Deutsch" },
    { code: "es", label: "Español" },
    { code: "pt", label: "Português" },
    { code: "th", label: "ภาษาไทย" },
    { code: "id", label: "Bahasa Indonesia" },
];
```



# FILE: src\store\useAppStore.ts

- SIZE: 2.52 KB
- SHA256: 3318ef6b80348cc118565c7da1aa1af082a8b9a769ee08c33dc658f2a7a455fb

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { API_TOKEN_STORAGE_KEY } from "@/services/api";
import type { User } from "@/types/user";

type ReaderDirection = "vertical" | "paged";
type ReaderFit = "width" | "height" | "original";
type Theme = "light" | "dark";

interface ReaderPreferences {
  direction: ReaderDirection;
  fit: ReaderFit;
  showToolbar: boolean;
}

interface AppState {
  sidebarOpen: boolean;
  mobileNavOpen: boolean;
  token: string | null;
  user: User | null;
  theme: Theme;
  chatOpen: boolean;
  reader: ReaderPreferences;
  setSidebarOpen: (open: boolean) => void;
  setMobileNavOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setAuth: (token: string, user?: User | null) => void;
  setUser: (user: User | null) => void;
  clearAuth: () => void;
  updateReader: (reader: Partial<ReaderPreferences>) => void;
  toggleTheme: () => void;
  setChatOpen: (open: boolean) => void;
  toggleChat: () => void;
}

const defaultReader: ReaderPreferences = {
  direction: "vertical",
  fit: "width",
  showToolbar: true,
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      sidebarOpen: true,
      mobileNavOpen: false,
      token: null,
      user: null,
      theme: "dark",
      chatOpen: false,
      reader: defaultReader,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
      toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
      setAuth: (token, user = null) => {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(API_TOKEN_STORAGE_KEY, token);
        }
        set({ token, user });
      },
      setUser: (user) => set({ user }),
      clearAuth: () => {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(API_TOKEN_STORAGE_KEY);
        }
        set({ token: null, user: null });
      },
      updateReader: (reader) => set({ reader: { ...get().reader, ...reader } }),
      toggleTheme: () => {
        const next = get().theme === "dark" ? "light" : "dark";
        set({ theme: next });
      },
      setChatOpen: (open) => set({ chatOpen: open }),
      toggleChat: () => set({ chatOpen: !get().chatOpen }),
    }),
    {
      name: "manga-app-store",
      skipHydration: true,
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        reader: state.reader,
        sidebarOpen: state.sidebarOpen,
        theme: state.theme,
      }),
    },
  ),
);

```



# FILE: src\styles\globals.css

- SIZE: 6.73 KB
- SHA256: a4414f3f821f1ddee5ffc1f69165a47a05f5cd44d1bbe134e37d0a2e46350235

```css
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=League+Spartan:wght@600;700;800&display=swap");

@tailwind base;
@tailwind components;
@tailwind utilities;

/* ═══════════════════════════════════════════
   LIGHT THEME (default)
   ═══════════════════════════════════════════ */
:root {
  --font-heading: "League Spartan", "Inter", -apple-system, sans-serif;
  --font-body: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;

  --bg: #f8f7f4;
  --surface: #ffffff;
  --surface-2: #f3f2ef;
  --surface-3: #e8e7e3;
  --text: #1a1a1a;
  --text-muted: #666666;
  --border: #e0deda;

  --accent: #ff6740;
  --accent-hover: #ff7e5a;
  --accent-active: #e55a35;
  --accent-bg: rgba(255, 103, 64, 0.08);
  --accent-bg-strong: rgba(255, 103, 64, 0.15);

  --accent-2: #DA7500;
  --purple: #C084FC;
  --cyan: #05AAF0;
  --sky: #1199FF;
  --green: #22c55e;
  --amber: #f59e0b;
  --red: #ef4444;
  --blue: #3b82f6;

  --shadow-card: rgba(0, 0, 0, 0.06) 0px 1px 3px 0px, rgba(0, 0, 0, 0.04) 0px 1px 2px -1px;
  --shadow-card-hover: rgba(0, 0, 0, 0.08) 0px 10px 15px -3px, rgba(0, 0, 0, 0.05) 0px 4px 6px -4px;
  --shadow-floating: rgba(0, 0, 0, 0.1) 0px 4px 12px -1px, rgba(0, 0, 0, 0.06) 0px 2px 4px -2px;

  --radius: 10px;
  --radius-sm: 6px;
  --radius-lg: 14px;
}

/* ═══════════════════════════════════════════
   DARK THEME
   ═══════════════════════════════════════════ */
[data-theme="dark"] {
  --bg: #0d0d0d;
  --surface: #161616;
  --surface-2: #1e1e1e;
  --surface-3: #2a2a2a;
  --text: #e8e8e8;
  --text-muted: #888888;
  --border: #2c2c2c;

  --accent: #ff6740;
  --accent-hover: #ff7e5a;
  --accent-active: #e55a35;
  --accent-bg: rgba(255, 103, 64, 0.12);
  --accent-bg-strong: rgba(255, 103, 64, 0.2);

  --shadow-card: rgba(0, 0, 0, 0.3) 0px 1px 3px 0px;
  --shadow-card-hover: rgba(0, 0, 0, 0.5) 0px 10px 15px -3px;
  --shadow-floating: rgba(0, 0, 0, 0.5) 0px 4px 12px -1px;
}

/* ═══════════════════════════════════════════
   BASE RESETS
   ═══════════════════════════════════════════ */
* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
  color-scheme: light;
}

[data-theme="dark"] {
  color-scheme: dark;
}

body {
  min-height: 100vh;
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-body);
  letter-spacing: -0.01em;
  transition: background 0.3s ease, color 0.3s ease;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

button, input, select, textarea {
  font: inherit;
}
button { cursor: pointer; }
button:disabled { cursor: not-allowed; opacity: 0.5; }
img { max-width: 100%; }

::selection {
  background: var(--accent-bg-strong);
  color: var(--accent);
}

/* ═══════════════════════════════════════════
   SCROLLBAR
   ═══════════════════════════════════════════ */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

/* ═══════════════════════════════════════════
   BASE LAYER
   ═══════════════════════════════════════════ */
@layer base {
  h1, h2, h3, h4 {
    font-family: var(--font-heading);
    letter-spacing: -0.02em;
  }
  a {
    color: inherit;
    text-decoration: none;
  }
}

/* ═══════════════════════════════════════════
   COMPONENT LAYER
   ═══════════════════════════════════════════ */
@layer components {
  .focus-ring {
    @apply focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2;
    --tw-ring-offset-color: var(--surface);
  }

  .page-shell {
    @apply mx-auto w-full max-w-content px-3 py-5 sm:px-4 md:px-6 xl:px-8;
  }

  .section-band {
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    background: var(--surface-2);
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-card);
    transition: box-shadow 0.2s ease, transform 0.2s ease;
  }
  .card:hover {
    box-shadow: var(--shadow-card-hover);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.5;
    white-space: nowrap;
  }

  .tag-include {
    border: 1px solid var(--green);
    background: rgba(34, 197, 94, 0.12);
    color: var(--green);
  }
  .tag-exclude {
    border: 1px solid var(--red);
    background: rgba(239, 68, 68, 0.12);
    color: var(--red);
  }
  .tag-none {
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-muted);
  }
}

/* ═══════════════════════════════════════════
   ANIMATIONS
   ═══════════════════════════════════════════ */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes slideInRight {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
@keyframes slideInLeft {
  from { transform: translateX(-100%); }
  to { transform: translateX(0); }
}
@keyframes pulse-gentle {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.animate-fadeIn { animation: fadeIn 0.3s ease-out; }
.animate-slideInRight { animation: slideInRight 0.25s ease-out; }
.animate-slideInLeft { animation: slideInLeft 0.25s ease-out; }
.animate-pulse-gentle { animation: pulse-gentle 2s ease-in-out infinite; }

@keyframes slideUp {
  from { opacity: 0; transform: translateY(16px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}


```



# FILE: src\types\admin.ts

- SIZE: 854.00 B
- SHA256: 4ae0dc82a5d73b889f1fde4f371d4453b8410813a01cf6c67ccddc99d2c52134

```typescript
import type { PaginatedResponse, UUID } from "./common";
import type { User } from "./user";

export interface AdminTotals {
  users: number;
  manga: number;
  pending_reports: number;
}

export interface TopMangaReport {
  manga_id: UUID;
  title?: string | null;
  readers: number;
}

export interface AdminDashboard {
  new_users_by_date: Record<string, number>;
  reading_activity_by_date: Record<string, number>;
  top_manga: TopMangaReport[];
  totals: AdminTotals;
  date_range: {
    start: string;
    end: string;
  };
}

export interface ReportedComment {
  comment_id: UUID;
  content?: string | null;
  username?: string | null;
  manga_title?: string | null;
  report_count: number;
  created_at?: string | null;
}

export type AdminUserPage = PaginatedResponse<User>;
export type ReportedCommentPage = PaginatedResponse<ReportedComment>;

```



# FILE: src\types\chapter.ts

- SIZE: 553.00 B
- SHA256: 74ef7af3ae3a22cc9cc9ebb6868d6abb604cd9206e16a89fb04d25eeb14b09d1

```typescript
import type { UUID } from "./common";

export interface Chapter {
  ChapterId: UUID;
  MangaId: UUID;
  Type?: string | null;
  Volume?: string | null;
  ChapterNumber?: string | null;
  Title?: string | null;
  TranslatedLang?: string | null;
  Pages?: number | null;
  PublishAt?: string | null;
  CreatedAt?: string | null;
}

export interface ChapterNav {
  current: Chapter;
  prev_chapter?: Chapter | null;
  next_chapter?: Chapter | null;
  page_urls: string[];
}

export interface ChapterListParams {
  lang?: string;
  sort?: "asc" | "desc";
}

```



# FILE: src\types\comment.ts

- SIZE: 703.00 B
- SHA256: e4527ffdeb84ec185ee7c6f392a78149663ddf9b13faeff663d77bfc3f9a691d

```typescript
import type { UUID } from "./common";

export interface Comment {
  CommentId: UUID;
  UserId: UUID;
  MangaId: UUID;
  Username?: string | null;
  Avatar?: string | null;
  Content?: string | null;
  IsSpoiler: boolean;
  LikeCount: number;
  DislikeCount: number;
  IsDeleted?: boolean | null;
  CreatedAt?: string | null;
  UpdatedAt?: string | null;
}

export interface CommentCreatePayload {
  Content: string;
  ChapterId?: UUID | null;
  IsSpoiler?: boolean;
}

export interface CommentUpdatePayload {
  Content: string;
}

export interface CommentReactionResponse {
  success: boolean;
  like_count: number;
  dislike_count: number;
}

export interface ReportCreatePayload {
  Reason: string;
}

```



# FILE: src\types\common.ts

- SIZE: 378.00 B
- SHA256: f4467be87999fa541eaf8ffdc41a1168abb6ad4a38cf9921bca4e0127b87c3af

```typescript
export type UUID = string;

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface MessageResponse<T = unknown> {
  message?: string;
  data?: T;
  success?: boolean;
}

export interface SelectOption {
  label: string;
  value: string;
}

export type SortDirection = "asc" | "desc";

```



# FILE: src\types\history.ts

- SIZE: 642.00 B
- SHA256: 057e399a53b7f582a3b14df52836405ac1a58de0c4f7392301bc2541333c0bac

```typescript
import type { UUID } from "./common";

export interface HistoryEntry {
  HistoryId: UUID;
  MangaId: UUID;
  ChapterId: UUID;
  LastPageRead?: number | null;
  ReadAt?: string | null;
  manga_title?: string | null;
  chapter_number?: string | null;
  cover_url?: string | null;
}

export interface HistoryGroup {
  label: string;
  items: HistoryEntry[];
}

export interface GroupedHistoryResponse {
  groups: HistoryGroup[];
}

export interface HistoryCreatePayload {
  MangaId: UUID;
  ChapterId: UUID;
  LastPageRead?: number | null;
}

export interface ContinueReadingResponse {
  chapter_id?: UUID | null;
  last_page?: number | null;
}

```



# FILE: src\types\list.ts

- SIZE: 1.39 KB
- SHA256: bfb3dfa3c7a2db75705403f868e984ee7077a2e3ca833b826de410ba2eb32817

```typescript
import type { UUID } from "./common";

export type ListVisibility = "private" | "public" | string;

export interface MangaListBrief {
  ListId: UUID;
  Name?: string | null;
  Slug?: string | null;
  Description?: string | null;
  Visibility: ListVisibility;
  ItemCount: number;
  FollowerCount: number;
  UpdatedAt?: string | null;
  contains?: boolean | null;
  cover_url?: string | null;
}

export interface MangaListCollection {
  my_lists: MangaListBrief[];
  followed_lists: MangaListBrief[];
}

export interface ListMangaItem {
  manga_id: UUID;
  title?: string | null;
  position: number;
  cover_url?: string | null;
  status?: string | null;
  year?: number | null;
  content_rating?: string | null;
}

export interface MangaListDetail {
  ListId: UUID;
  Name?: string | null;
  Description?: string | null;
  Slug?: string | null;
  Visibility: ListVisibility;
  owner_id: UUID;
  owner_username?: string | null;
  ItemCount: number;
  FollowerCount: number;
  items: ListMangaItem[];
  is_following: boolean;
  cover_url?: string | null;
}

export interface PublicListItem extends MangaListBrief {
  owner_username?: string | null;
  owner_id?: UUID | null;
  is_following: boolean;
}

export interface ListCreatePayload {
  Name: string;
  Description?: string;
  Visibility: ListVisibility;
}

export interface ListUpdatePayload {
  Name?: string;
  Description?: string;
  Visibility?: ListVisibility;
}

```



# FILE: src\types\manga.ts

- SIZE: 2.02 KB
- SHA256: 1800b157404ba91c4d6bd72f8e09aa668d5b56386f966cf8e5bd1112384f5bff

```typescript
import type { UUID } from "./common";

export interface Statistics {
  Follows?: number | null;
  AverageRating?: number | null;
  BayesianRating?: number | null;
}

export interface TagBrief {
  TagId: UUID;
  GroupName?: string | null;
  NameEn?: string | null;
}

export interface AltTitle {
  LangCode?: string | null;
  AltTitle?: string | null;
}

export interface Description {
  LangCode?: string | null;
  Description?: string | null;
}

export interface LinkOut {
  Provider?: string | null;
  Url?: string | null;
}

export interface CreatorOut {
  id?: UUID;
  name?: string | null;
  role?: string | null;
}

export interface MangaListItem {
  MangaId: UUID;
  TitleEn?: string | null;
  Status?: string | null;
  Year?: number | null;
  ContentRating?: string | null;
  PublicationDemographic?: string | null;
  cover_url?: string | null;
  stats?: Statistics | null;
}

export interface MangaDetail extends MangaListItem {
  Type?: string | null;
  OriginalLanguage?: string | null;
  LastChapter?: string | null;
  LastVolume?: string | null;
  CreatedAt?: string | null;
  UpdatedAt?: string | null;
  tags: TagBrief[];
  alt_titles: AltTitle[];
  descriptions: Description[];
  links: LinkOut[];
  creators: CreatorOut[];
  available_languages: string[];
}

export interface RelatedManga {
  RelatedId: UUID;
  relation_type?: string | null;
  related_label?: string | null;
  title?: string | null;
  cover_url?: string | null;
}

export interface MangaListParams {
  page?: number;
  limit?: number;
  sort?: string;
  status?: string;
  content_rating?: string;
  demographic?: string;
  year?: number;
}

export interface AdvancedSearchParams extends MangaListParams {
  q?: string;
  include_tags?: string;
  exclude_tags?: string;
  year_from?: number;
  year_to?: number;
  original_lang?: string;
}

export interface TagGroup {
  group_name: string;
  tags: TagBrief[];
}

export interface Cover {
  cover_id?: UUID;
  manga_id?: UUID;
  volume?: string | null;
  locale?: string | null;
  fileName?: string | null;
  cover_url?: string | null;
}

```



# FILE: src\types\rating.ts

- SIZE: 230.00 B
- SHA256: 207f8da8fb5d1078974f816385cfbcf7eca17d31a40cdd353e50719809154f3b

```typescript
import type { UUID } from "./common";

export interface Rating {
  RatingId?: UUID;
  UserId?: UUID;
  MangaId?: UUID;
  Score?: number | null;
  score?: number | null;
}

export interface RatingCreatePayload {
  Score: number;
}

```



# FILE: src\types\user.ts

- SIZE: 824.00 B
- SHA256: 3eac5b86de7c8ac369a5e2a846e5c194c1933ce8ca4b811178c911dec0d68f1f

```typescript
import type { UUID } from "./common";

export interface TokenResponse {
  access_token: string;
  token_type: "bearer" | string;
}

export interface User {
  UserId: UUID;
  Username: string;
  Email: string;
  Avatar?: string | null;
  Role: "user" | "admin" | "uploader" | string;
  IsLocked?: boolean | null;
  CreatedAt?: string | null;
  Bio?: string | null;
  DisplayName?: string | null;
  AvatarObjectKey?: string | null;
  UpdatedAt?: string | null;
}

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface UserUpdatePayload {
  username?: string;
  avatar?: string;
  email?: string;
  bio?: string;
  display_name?: string;
  current_password?: string;
  new_password?: string;
}

```


