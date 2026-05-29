import os

def generate_tree(paths):
    # Builds an ASCII tree representation of relative paths.
    tree = {}
    for p in paths:
        parts = p.split(os.sep)
        curr = tree
        for part in parts:
            if part not in curr:
                curr[part] = {}
            curr = curr[part]
            
    lines = []
    def walk(node, prefix=""):
        keys = sorted(node.keys())
        for idx, key in enumerate(keys):
            is_last = (idx == len(keys) - 1)
            connector = "└── " if is_last else "├── "
            lines.append(prefix + connector + key)
            new_prefix = prefix + ("    " if is_last else "│   ")
            walk(node[key], new_prefix)
    walk(tree)
    return "\n".join(lines)

def should_include(rel_path):
    parts = rel_path.split(os.sep)
    
    # Ignore hidden files/dirs, node_modules, dist, public, etc.
    if any(p.startswith('.') for p in parts):
        return False
    if 'node_modules' in parts or 'dist' in parts or 'public' in parts:
        return False
        
    name = os.path.basename(rel_path)
    
    # Exclude files
    if name in ['package-lock.json', '.gitignore', 'README.md', 'eslint.config.js', 'frontend_source_dump.txt', 'dump_frontend.py']:
        return False
        
    # Allowed root files
    if len(parts) == 1:
        allowed_roots = [
            'index.html', 'vite.config.ts', 'tailwind.config.js', 'postcss.config.js', 'package.json'
        ]
        if name in allowed_roots or name.startswith('tsconfig'):
            return True
        return False
        
    # Src files
    if parts[0] == 'src':
        return name.endswith(('.tsx', '.ts', '.css'))
        
    return False

def dump_project(root_dir, output_file):
    included_files = []
    for root, dirs, files in os.walk(root_dir):
        # Prune directories in place to speed up
        dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ['node_modules', 'dist', 'public']]
        
        for file in files:
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, root_dir)
            if should_include(rel_path):
                included_files.append(rel_path)
                
    included_files.sort()
    
    with open(output_file, 'w', encoding='utf-8', errors='replace') as out:
        out.write("================================================================================\n")
        out.write("PROJECT STRUCTURE:\n")
        out.write("================================================================================\n")
        out.write(generate_tree(included_files))
        out.write("\n\n")
        
        for file_path in included_files:
            out.write("================================================================================\n")
            out.write(f"FILE: {file_path}\n")
            out.write("================================================================================\n")
            
            full_path = os.path.join(root_dir, file_path)
            try:
                with open(full_path, 'r', encoding='utf-8', errors='replace') as f:
                    content = f.read()
                out.write(content)
            except Exception as e:
                out.write(f"[ERROR READING FILE: {e}]")
            out.write("\n\n")

if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(script_dir, "frontend_source_dump.txt")
    print(f"Dumping frontend source code to: {output_path}")
    dump_project(script_dir, output_path)
    print("Done!")
