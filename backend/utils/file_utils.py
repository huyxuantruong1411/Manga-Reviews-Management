import re

def clean_filename(filename: str) -> str:
    """
    Remove characters invalid for Windows OS file and folder names.
    Invalid characters: \\ / : * ? \" < > |
    """
    if not filename:
        return "Unknown"
    # Replace invalid chars with empty string or space
    cleaned = re.sub(r'[\\/*?:"<>|]', "", filename)
    # Strip whitespace and collapse consecutive spaces
    cleaned = re.sub(r'\s+', " ", cleaned).strip()
    return cleaned if cleaned else "Unknown"
