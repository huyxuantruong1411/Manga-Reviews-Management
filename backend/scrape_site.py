import sys
import os
import argparse
import random
import time
from urllib.parse import urlparse
import datetime

# Try imports
try:
    import requests
except ImportError:
    requests = None

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sync_playwright = None


USER_AGENTS = [
    # Chrome (Windows)
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    # Chrome (macOS)
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    # Firefox (Windows)
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
    # Firefox (macOS)
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:125.0) Gecko/20100101 Firefox/125.0",
    # Safari (macOS)
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15",
    # Edge (Windows)
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
    # Opera (macOS)
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 OPR/110.0.0.0",
    # Mobile Chrome (Android)
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 10; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    # Mobile Safari (iPhone)
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/605.1.15",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/605.1.15",
    # Mobile Safari (iPad)
    "Mozilla/5.0 (iPad; CPU OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/605.1.15",
    # Linux Chrome
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    # Linux Firefox
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/119.0",
    # Samsung Browser
    "Mozilla/5.0 (Linux; Android 11; SAMSUNG SM-A515F) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
    # Vivaldi
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Vivaldi/6.7.3329.21",
]


def check_dependencies():
    missing = []
    if not requests:
        missing.append("requests")
    if not BeautifulSoup:
        missing.append("beautifulsoup4")
    
    if missing:
        print("Warning: The following dependencies are missing:")
        for m in missing:
            print(f"  - {m}")
        print("\nYou can install them via pip:")
        print(f"  uv pip install {' '.join(missing)}")
        print()

    if not sync_playwright:
        print("Note: 'playwright' is not installed. Playwright fallback will not be available.")
        print("To enable anti-bot bypass and JavaScript execution, install playwright:")
        print("  uv pip install playwright")
        print("  python -m playwright install")
        print()


def get_random_headers():
    ua = random.choice(USER_AGENTS)
    headers = {
        "User-Agent": ua,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "DNT": "1",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "max-age=0"
    }
    return headers


def scrape_with_requests(url, timeout=15):
    if not requests:
        raise RuntimeError("requests package is not installed.")
        
    headers = get_random_headers()
    print(f"Fetching URL using requests with User-Agent: {headers['User-Agent']}")
    response = requests.get(url, headers=headers, timeout=timeout)
    response.raise_for_status()
    return response.text


def scrape_with_playwright(url, timeout=30, headful=False):
    if not sync_playwright:
        raise RuntimeError("playwright is not installed/configured.")
        
    ua = random.choice(USER_AGENTS)
    print(f"Launching Playwright (headful={headful}) with User-Agent: {ua}")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not headful)
        context = browser.new_context(
            user_agent=ua,
            viewport={"width": 1280, "height": 800},
            locale="en-US",
            timezone_id="America/New_York"
        )
        
        page = context.new_page()
        
        # Add basic anti-detection evasion
        page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        
        print(f"Navigating to {url}...")
        try:
            page.goto(url, wait_until="networkidle", timeout=timeout * 1000)
        except Exception as e:
            print(f"Warning: Playwright networkidle timed out. Fetching current content anyway... ({e})")
        
        # Wait a small random delay for page execution
        time.sleep(random.uniform(2.0, 4.0))
        
        html = page.content()
        browser.close()
        return html


def clean_html(html_content, no_clean=False):
    if not BeautifulSoup:
        return html_content
        
    soup = BeautifulSoup(html_content, "html.parser")
    
    if no_clean:
        return soup.prettify()
        
    # Tags to completely remove
    tags_to_remove = [
        "script", "style", "noscript", "link", "meta", "svg", "iframe",
        "embed", "object", "param", "source", "track", "canvas", "picture"
    ]
    for tag in soup.find_all(tags_to_remove):
        tag.decompose()
        
    # Remove HTML comments
    for comment in soup.find_all(string=lambda text: isinstance(text, Comment) if 'Comment' in globals() else False):
        comment.extract()
        
    # We can import Comment here to be safe
    from bs4 import Comment
    for comment in soup.find_all(string=lambda text: isinstance(text, Comment)):
        comment.extract()
        
    # Clean attributes, leaving only structural and content ones
    allowed_attrs = ["id", "class", "href", "src", "title", "alt"]
    for tag in soup.find_all(True):
        tag_attrs = list(tag.attrs.keys())
        for attr in tag_attrs:
            if attr not in allowed_attrs:
                del tag.attrs[attr]
                
    return soup.prettify()


def build_tree_summary(element, depth=0, max_depth=15):
    if depth > max_depth:
        return "... (max depth reached)\n"
    if not hasattr(element, "name") or element.name is None:
        return ""
        
    indent = "  " * depth
    attrs = []
    for attr in ["id", "class", "href", "src"]:
        val = element.get(attr)
        if val:
            if isinstance(val, list):
                val = " ".join(val)
            attrs.append(f'{attr}="{val}"')
            
    attrs_str = " " + " ".join(attrs) if attrs else ""
    
    # Get a short snippet of text directly inside this element (not children)
    direct_text = ""
    for child in element.children:
        if isinstance(child, str):
            text_val = child.strip()
            if text_val:
                direct_text += text_val + " "
    direct_text = direct_text.strip()
    text_snippet = f' text="{direct_text[:40]}..."' if direct_text else ""
    
    line = f"{indent}<{element.name}{attrs_str}{text_snippet}>\n"
    
    child_lines = ""
    for child in element.children:
        if hasattr(child, "name") and child.name is not None:
            child_lines += build_tree_summary(child, depth + 1, max_depth)
            
    return line + child_lines


def main():
    parser = argparse.ArgumentParser(description="Clean and Restructure Web Page HTML for AI Analysis")
    parser.add_argument("url", help="Web page URL to scrape")
    parser.add_argument("-o", "--output", help="Output file path (default: scraped_<domain>_<timestamp>.txt)")
    parser.add_argument("-p", "--playwright", action="store_true", help="Force using Playwright browser scraping")
    parser.add_argument("--headful", action="store_true", help="Run Playwright in headful mode (visible browser window)")
    parser.add_argument("--timeout", type=int, default=30, help="Request timeout in seconds (default: 30)")
    parser.add_argument("--no-clean", action="store_true", help="Do not clean the HTML (keep script, style tags, etc.)")
    
    args = parser.parse_args()
    
    check_dependencies()
    
    url = args.url
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "https://" + url
        
    domain = urlparse(url).netloc.replace("www.", "")
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    
    output_path = args.output
    if not output_path:
        # Sanitize domain for filename
        safe_domain = "".join(c if c.isalnum() or c in "-_" else "_" for c in domain)
        output_path = f"scraped_{safe_domain}_{timestamp}.txt"
        
    html = None
    used_playwright = False
    
    if args.playwright:
        if not sync_playwright:
            print("Error: Playwright is requested but not installed.")
            sys.exit(1)
        try:
            html = scrape_with_playwright(url, args.timeout, args.headful)
            used_playwright = True
        except Exception as e:
            print(f"Playwright scraping failed: {e}")
            sys.exit(1)
    else:
        # Try requests first
        try:
            html = scrape_with_requests(url, args.timeout)
        except Exception as e:
            print(f"Requests-based scraping failed: {e}")
            if sync_playwright:
                print("Attempting fallback to Playwright...")
                try:
                    html = scrape_with_playwright(url, args.timeout, args.headful)
                    used_playwright = True
                except Exception as ex:
                    print(f"Playwright fallback also failed: {ex}")
                    sys.exit(1)
            else:
                print("Playwright is not available for fallback. Exiting.")
                sys.exit(1)
                
    if not html:
        print("Failed to retrieve HTML content.")
        sys.exit(1)
        
    print("Parsing and cleaning HTML...")
    cleaned_html = clean_html(html, args.no_clean)
    
    # Generate tree summary if BeautifulSoup is available
    tree_summary = ""
    if BeautifulSoup and not args.no_clean:
        soup = BeautifulSoup(cleaned_html, "html.parser")
        tree_summary = build_tree_summary(soup)
        
    print(f"Saving results to: {output_path}")
    try:
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(f"URL: {url}\n")
            f.write(f"Scraped Date: {datetime.datetime.now().isoformat()}\n")
            f.write(f"Scraper Method: {'Playwright' if used_playwright else 'Requests'}\n")
            f.write("=" * 80 + "\n")
            f.write("DOM STRUCTURAL SUMMARY\n")
            f.write("=" * 80 + "\n")
            if tree_summary:
                f.write(tree_summary)
            else:
                f.write("Tree summary not available (requires beautifulsoup4).\n")
            f.write("\n\n" + "=" * 80 + "\n")
            f.write("CLEANED HTML CONTENT\n")
            f.write("=" * 80 + "\n")
            f.write(cleaned_html)
        print("Success!")
    except Exception as e:
        print(f"Failed to write output file: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
