import os
import re


def clean_filename(filename: str, max_length: int = 120) -> str:
    """
    Sanitize a string for use as a Windows file or folder name.
    - Remove characters invalid on Windows: \\ / : * ? " < > |
    - Collapse consecutive whitespace
    - Strip trailing dots and spaces (Windows silently removes them, causing path mismatches)
    - Truncate to max_length to avoid Windows MAX_PATH (260 char) violations
    """
    if not filename:
        return "Unknown"
    # Replace invalid chars with empty string
    cleaned = re.sub(r'[\\/*?:"<>|]', "", filename)
    # Collapse consecutive whitespace and strip
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    # Strip trailing dots and spaces — Windows silently removes these from
    # folder names, causing os.path.exists() mismatches and WinError 3.
    cleaned = cleaned.rstrip(". ")
    # Truncate to avoid MAX_PATH issues (base_dir + title + chapter + filename)
    if len(cleaned) > max_length:
        cleaned = cleaned[:max_length].rstrip(". ")
    return cleaned if cleaned else "Unknown"


def normalize_windows_path(path: str) -> str:
    """
    Normalize a full filesystem path for Windows compatibility.
    Strips trailing dots and spaces from every path component, because Windows
    silently removes them when creating directories — causing os.makedirs()
    to create 'FolderName' but Python to reference 'FolderName...' → WinError 3.

    Preserves the drive letter / UNC prefix and uses os.path.abspath for cleanup.
    """
    if not path:
        return path
    # Resolve to absolute first
    path = os.path.abspath(path)
    # Split into drive/root and the rest
    drive, tail = os.path.splitdrive(path)
    # Split into individual components
    parts = tail.replace("/", os.sep).split(os.sep)
    # Strip trailing dots and spaces from each component
    cleaned_parts = []
    for part in parts:
        stripped = part.rstrip(". ")
        cleaned_parts.append(stripped if stripped else part)
    return drive + os.sep.join(cleaned_parts)
