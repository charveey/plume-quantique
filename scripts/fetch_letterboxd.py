#!/usr/bin/env python3
"""
scripts/fetch_letterboxd.py

Scans _authors for files with a letterboxd_username in the YAML front matter,
fetches https://www.letterboxd.com/{username}/rss, parses items, writes JSON
to _data/letterboxd/{author}.json
"""

import os
import re
import sys
import xml.etree.ElementTree as ET
import json
import requests
import yaml
from dateutil import parser as date_parser
from bs4 import BeautifulSoup


ROOT = os.getcwd()
AUTHORS_DIR = os.path.join(ROOT, "_authors")
OUT_DIR = os.path.join(ROOT, "_data", "letterboxd")
TIMEOUT = 30

# Ensure output dir exists
os.makedirs(OUT_DIR, exist_ok=True)

def read_front_matter(path):
    """Return dict of YAML front matter or empty dict"""
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()
    # Front matter typically between first two lines '---'
    if not text.startswith("---"):
        return {}
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}
    yaml_part = parts[1]
    try:
        data = yaml.safe_load(yaml_part)
        return data if isinstance(data, dict) else {}
    except Exception as e:
        print(f"Warning: YAML parse error in {path}: {e}", file=sys.stderr)
        return {}

def list_author_files():
    if not os.path.isdir(AUTHORS_DIR):
        print(f"No _authors directory found at {AUTHORS_DIR}", file=sys.stderr)
        return []
    files = []
    for fname in os.listdir(AUTHORS_DIR):
        if not fname.lower().endswith((".md", ".markdown")):
            continue
        files.append(os.path.join(AUTHORS_DIR, fname))
    return sorted(files)

def fetch_rss(username):
    url = f"https://www.letterboxd.com/{username}/rss"
    try:
        resp = requests.get(url, timeout=TIMEOUT, headers={"User-Agent": "github-action-letterboxd/1.0"})
        resp.raise_for_status()
        return resp.content
    except Exception as e:
        print(f"Failed fetching RSS for {username}: {e}", file=sys.stderr)
        return None

def localname(tag):
    """Return the local name of an ElementTree tag, stripping namespace"""
    if tag is None:
        return None
    if '}' in tag:
        return tag.split('}', 1)[1]
    else:
        return tag

def find_child_text(item, lname):
    """Find first child whose localname == lname and return its text (or None)"""
    for child in item:
        if localname(child.tag) == lname:
            return child.text or ""
    return None

def parse_boolean(text):
    if text is None:
        return False
    t = str(text).strip().lower()
    return t in ("true", "1", "yes")

def make_star_rating_from_numeric(num):
    try:
        f = float(num)
    except Exception:
        return ""
    full = int(f)
    half = (f - full) >= 0.5
    stars = "★" * full
    if half:
        stars += "½"
    # If rating is 0 or something unexpected and no stars, return empty string
    return stars or ""

def parse_item(item):
    # Helper: tag local names we want
    filmTitle = find_child_text(item, "filmTitle") or ""
    filmYear_text = find_child_text(item, "filmYear")
    watchedDate_text = find_child_text(item, "watchedDate")
    rating_text = find_child_text(item, "memberRating") or find_child_text(item, "rating")
    star_text = find_child_text(item, "starRating") or None
    rewatch_text = find_child_text(item, "rewatch")
    tmdb_text = find_child_text(item, "movieId") or find_child_text(item, "tmdbId") or find_child_text(item, "movieid")
    link_text = find_child_text(item, "link") or ""  # sometimes <link> is present
    description_html = find_child_text(item, "description") or ""

    # filmYear -> int if possible
    filmYear = None
    if filmYear_text:
        try:
            filmYear = int(re.sub(r"[^\d-]", "", filmYear_text))
        except Exception:
            filmYear = None

    # watchedDate -> YYYY-MM-DD
    watchedDate = None
    if watchedDate_text:
        # Try to find YYYY-MM-DD first
        m = re.search(r"\d{4}-\d{2}-\d{2}", watchedDate_text)
        if m:
            watchedDate = m.group(0)
        else:
            # try parse with dateutil
            try:
                dt = date_parser.parse(watchedDate_text)
                watchedDate = dt.date().isoformat()
            except Exception:
                watchedDate = None

    # rating -> float
    rating = None
    if rating_text:
        try:
            rating = float(rating_text)
        except Exception:
            # maybe in star form? try extract number
            m = re.search(r"(\d+(\.\d+)?)", rating_text)
            if m:
                rating = float(m.group(1))

    # starRating -> string or derived from numeric rating
    if star_text:
        starRating = star_text.strip()
    else:
        starRating = make_star_rating_from_numeric(rating) if rating is not None else ""

    # rewatch -> boolean
    rewatch = parse_boolean(rewatch_text)

    # tmdbId -> int if possible
    tmdbId = None
    if tmdb_text:
        try:
            tmdbId = int(re.sub(r"[^\d]", "", tmdb_text))
        except Exception:
            tmdbId = None

    # Poster & review from description (HTML inside CDATA)
    poster = None
    review = ""
    if description_html:
        # some RSS wrap CDATA with HTML; use BeautifulSoup
        try:
            soup = BeautifulSoup(description_html, "html.parser")
            # Poster: find first <img>
            img = soup.find("img")
            if img and img.get("src"):
                poster = img.get("src").strip()
            # Extract textual content and remove "Watched on" line
            # The "Watched on ..." is sometimes an element or text at end; remove lines starting with "Watched on"
            text = soup.get_text(separator="\n").strip()
            # Remove lines like "Watched on 24 Sep 2025" or "Watched on 2025-09-24"
            lines = [line.strip() for line in text.splitlines() if line.strip() != ""]
            # Remove any line that starts with "Watched on"
            filtered = [ln for ln in lines if not re.match(r"(?i)^Watched on\b", ln)]
            # Rebuild review string
            review = "\n".join(filtered).strip()
            # If review equals empty or is only a date or only "Watched on" then treat as empty
            if not review or re.match(r"^\d{4}-\d{2}-\d{2}$", review):
                review = ""
        except Exception as e:
            print(f"Warning parsing description: {e}", file=sys.stderr)

    # Link: if link_text empty, try find <guid> or enclosure link
    if not link_text:
        guid = find_child_text(item, "guid")
        if guid:
            link_text = guid

    return {
        "filmTitle": filmTitle or "",
        "filmYear": filmYear if filmYear is not None else None,
        "watchedDate": watchedDate if watchedDate is not None else None,
        "rating": rating if rating is not None else None,
        "starRating": starRating or "",
        "rewatch": bool(rewatch),
        "tmdbId": tmdbId if tmdbId is not None else None,
        "link": link_text or "",
        "poster": poster or "",
        "review": review or "",
    }

def parse_feed(xml_bytes):
    items_data = []
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as e:
        print(f"XML parse error: {e}", file=sys.stderr)
        return items_data
    # Find all item elements under channel
    for item in root.findall('.//item'):
        parsed = parse_item(item)
        items_data.append(parsed)
    return items_data

def slug_from_filename(path):
    # take filename without extension as author name
    base = os.path.basename(path)
    name = os.path.splitext(base)[0]
    return name


def load_existing_json(author_slug):
    """Load existing JSON file if it exists, return list of dicts"""
    out_path = os.path.join(OUT_DIR, f"{author_slug}.json")
    if os.path.exists(out_path):
        try:
            with open(out_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Warning: could not read existing {out_path}: {e}", file=sys.stderr)
    return []


def merge_items(existing, new_items):
    """Merge new_items into existing, keyed by 'link'"""
    merged = {item.get("link"): item for item in existing if item.get("link")}

    for item in new_items:
        link = item.get("link")
        if not link:
            continue

        if link in merged:
            # Merge fields — preserve old review/poster if new one is empty
            old = merged[link]
            for key, val in item.items():
                if val not in (None, "", []):
                    old[key] = val
            merged[link] = old
        else:
            merged[link] = item

    # Return as list, sorted by watchedDate desc
    def sort_key(it):
        return it.get("watchedDate") or ""
    return sorted(merged.values(), key=sort_key, reverse=True)


def write_json_for_author(author_slug, data):
    out_path = os.path.join(OUT_DIR, f"{author_slug}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"Wrote {out_path}")


def main():
    author_files = list_author_files()
    if not author_files:
        print("No author files found. Exiting.")
        return 0

    for af in author_files:
        fm = read_front_matter(af)
        username = fm.get("letterboxd_username") or fm.get("letterboxd", {}).get("username")
        if not username:
            continue

        author_slug = slug_from_filename(af)
        print(f"Fetching Letterboxd for {author_slug} -> {username}")
        rss = fetch_rss(username)
        if not rss:
            print(f"Skipping {username} due to fetch failure", file=sys.stderr)
            continue

        new_items = parse_feed(rss)
        existing_items = load_existing_json(author_slug)
        merged = merge_items(existing_items, new_items)
        write_json_for_author(author_slug, merged)

    return 0


if __name__ == "__main__":
    sys.exit(main())