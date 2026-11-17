"""Import RecipeNLG-style CSV into SQLite. Never invent missing time/serving data."""
import argparse, csv, json, os, re, sqlite3, ast

COLUMN_ALIASES = {
    "title": ["title", "name", "recipe", "recipename"],
    "ingredients": ["ingredients", "ingredient"],
    "directions": ["directions", "instructions", "steps", "method"],
    "prep_time": ["preptime", "prep_time", "preparationtime"],
    "cook_time": ["cooktime", "cook_time"],
    "total_time": ["totaltime", "total_time"],
    "servings": ["servings", "yield", "serves"],
    "image_url": ["image", "image_url", "photo"],
    "category": ["category", "course"],
}
BASE=os.path.dirname(os.path.abspath(__file__))
DB=os.path.join(BASE,"recipes.db")

def find_col(headers, aliases):
    normalized={re.sub(r"[^a-z]", "", h.lower()):h for h in headers}
    for a in aliases:
        if a in normalized: return normalized[a]
    return None

def parse_list(value):
    if value is None: return []
    s=str(value).strip()
    if not s: return []
    for parser in (json.loads, ast.literal_eval):
        try:
            x=parser(s)
            if isinstance(x,(list,tuple)): return [str(v).strip() for v in x if str(v).strip()]
        except Exception: pass
    # CSVs that store semicolon/newline-delimited text
    parts=re.split(r"\s*;\s*|\r?\n+", s)
    return [p.strip(" []'\"") for p in parts if p.strip(" []'\"")]

def clean_time(value):
    s=str(value or "").strip()
    return s or None

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("csv_path")
    ap.add_argument("--limit",type=int,default=0,help="0 means all rows")
    args=ap.parse_args()
    if not os.path.isfile(args.csv_path): raise SystemExit("CSV file not found: "+args.csv_path)
    inserted=skipped=seen=0
    db=sqlite3.connect(DB)
    db.execute("""CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL UNIQUE,
      ingredients TEXT, instructions TEXT, prep_time TEXT, cook_time TEXT,
      total_time TEXT, servings INTEGER, image_url TEXT, category TEXT, source TEXT)""")
    with open(args.csv_path,encoding="utf-8-sig",newline="") as f:
        reader=csv.DictReader(f)
        if not reader.fieldnames: raise SystemExit("CSV has no header row.")
        cols={k:find_col(reader.fieldnames,v) for k,v in COLUMN_ALIASES.items()}
        if not cols["title"] or not cols["ingredients"] or not cols["directions"]:
            raise SystemExit("Required columns not found. Need title, ingredients, directions. Found: "+str(reader.fieldnames))
        for row in reader:
            if args.limit and seen>=args.limit: break
            seen+=1
            title=(row.get(cols["title"]) or "").strip()
            ingredients=parse_list(row.get(cols["ingredients"]))
            directions=parse_list(row.get(cols["directions"]))
            if not title or not ingredients or not directions:
                skipped+=1; continue
            servings=None
            if cols["servings"]:
                match=re.search(r"\d+",str(row.get(cols["servings"]) or ""))
                if match: servings=int(match.group())
            values=(title,json.dumps(ingredients,ensure_ascii=False),json.dumps(directions,ensure_ascii=False),
                clean_time(row.get(cols["prep_time"])) if cols["prep_time"] else None,
                clean_time(row.get(cols["cook_time"])) if cols["cook_time"] else None,
                clean_time(row.get(cols["total_time"])) if cols["total_time"] else None,
                servings,(row.get(cols["image_url"]) or "").strip() if cols["image_url"] else None,
                (row.get(cols["category"]) or "").strip() if cols["category"] else None,
                "Imported CSV")
            try:
                db.execute("""INSERT INTO recipes(title,ingredients,instructions,prep_time,cook_time,total_time,
                    servings,image_url,category,source) VALUES(?,?,?,?,?,?,?,?,?,?)""",values)
                inserted+=1
            except sqlite3.IntegrityError: skipped+=1
            if seen%5000==0:
                db.commit(); print(f"Processed {seen:,}; inserted {inserted:,}; skipped {skipped:,}")
    db.commit()
    total=db.execute("SELECT COUNT(*) FROM recipes").fetchone()[0]
    db.close()
    print(f"\nFinished. Rows read: {seen:,}; inserted: {inserted:,}; skipped/duplicate: {skipped:,}")
    print(f"Total unique recipes in local database: {total:,}")
    if total<8000: print("NOTE: Local database currently has fewer than 8,000 recipes. Import more valid rows to meet the target.")

if __name__=="__main__": main()
