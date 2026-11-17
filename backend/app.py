from flask import Flask, jsonify, request, redirect
from flask_cors import CORS
import sqlite3
import os
import requests
import re
import json
import html

BASE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(BASE, "recipes.db")

app = Flask(__name__)
CORS(app)

COMMONS_API = "https://commons.wikimedia.org/w/api.php"

HEADERS = {
    "User-Agent": "CookBuddy/1.0 (recipe discovery website)"
}


# --------------------------------------------------
# DATABASE CONNECTION
# --------------------------------------------------

def conn():
    c = sqlite3.connect(DB, timeout=30)
    c.row_factory = sqlite3.Row
    return c


# --------------------------------------------------
# INITIALIZE DATABASE
# --------------------------------------------------

def init_db():
    with conn() as db:

        db.execute("""
            CREATE TABLE IF NOT EXISTS recipes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL UNIQUE,
                ingredients TEXT,
                instructions TEXT,
                prep_time TEXT,
                cook_time TEXT,
                total_time TEXT,
                servings INTEGER,
                image_url TEXT,
                category TEXT,
                source TEXT
            )
        """)

        db.execute("""
            CREATE INDEX IF NOT EXISTS idx_recipe_title
            ON recipes(title)
        """)

        columns = {
            row["name"]
            for row in db.execute(
                "PRAGMA table_info(recipes)"
            ).fetchall()
        }

        if "image_credit" not in columns:
            db.execute("""
                ALTER TABLE recipes
                ADD COLUMN image_credit TEXT
            """)

        if "image_license" not in columns:
            db.execute("""
                ALTER TABLE recipes
                ADD COLUMN image_license TEXT
            """)


# --------------------------------------------------
# CONVERT DATABASE ROW TO JSON
# --------------------------------------------------

def row_to_dict(row):
    d = dict(row)

    for key in ("ingredients", "instructions"):
        try:
            value = json.loads(d.get(key) or "[]")
            d[key] = value
        except (TypeError, ValueError):
            d[key] = []

    return d


# --------------------------------------------------
# CLEAN IMAGE ATTRIBUTION
# --------------------------------------------------

def clean_metadata(value):
    if not value:
        return ""

    value = html.unescape(str(value))
    value = re.sub(r"<[^>]+>", "", value)

    return value.strip()


# --------------------------------------------------
# API HEALTH CHECK
# --------------------------------------------------

@app.get("/api/health")
def health():
    with conn() as db:
        count = db.execute(
            "SELECT COUNT(*) FROM recipes"
        ).fetchone()[0]

    return jsonify({
        "status": "ok",
        "local_recipe_count": count
    })


# --------------------------------------------------
# SEARCH LOCAL RECIPES
# --------------------------------------------------

@app.get("/api/recipes")
def search_recipes():
    q = request.args.get("q", "").strip()

    category = request.args.get(
        "category", ""
    ).strip()

    page = max(
        1,
        request.args.get("page", 1, type=int)
    )

    per_page = min(
        48,
        max(
            1,
            request.args.get("per_page", 12, type=int)
        )
    )

    clauses = []
    params = []

    if q:
        clauses.append(
            "(title LIKE ? OR ingredients LIKE ?)"
        )

        params.extend([
            f"%{q}%",
            f"%{q}%"
        ])

    if category and category.lower() != "all":
        clauses.append(
            "LOWER(category)=LOWER(?)"
        )

        params.append(category)

    where = (
        " WHERE " + " AND ".join(clauses)
        if clauses else ""
    )

    with conn() as db:
        total = db.execute(
            "SELECT COUNT(*) FROM recipes" + where,
            params
        ).fetchone()[0]

        rows = db.execute(
            """
            SELECT * FROM recipes
            """
            + where
            + """
            ORDER BY title
            LIMIT ? OFFSET ?
            """,
            params + [
                per_page,
                (page - 1) * per_page
            ]
        ).fetchall()

    recipes = []

    for row in rows:
        recipe = row_to_dict(row)

        if not recipe.get("image_url"):
            recipe["image_url"] = (
                f"http://127.0.0.1:5001/api/recipes/"
                f"{recipe['id']}/image"
            )

        recipes.append(recipe)

    return jsonify({
        "recipes": recipes,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page
    })


# --------------------------------------------------
# GET SINGLE RECIPE DETAILS
# --------------------------------------------------

@app.get("/api/recipes/<int:recipe_id>")
def recipe_detail(recipe_id):
    with conn() as db:
        row = db.execute(
            "SELECT * FROM recipes WHERE id=?",
            (recipe_id,)
        ).fetchone()

    if not row:
        return jsonify({
            "error": "Recipe not found"
        }), 404

    recipe = row_to_dict(row)

    if not recipe.get("image_url"):
        recipe["image_url"] = (
            f"http://127.0.0.1:5001/api/recipes/"
            f"{recipe_id}/image"
        )

    return jsonify(recipe)


# --------------------------------------------------
# GET INDIVIDUAL RECIPE IMAGE
# --------------------------------------------------

@app.get("/api/recipes/<int:recipe_id>/image")
def recipe_image(recipe_id):
    with conn() as db:
        row = db.execute(
            """
            SELECT title, image_url
            FROM recipes
            WHERE id=?
            """,
            (recipe_id,)
        ).fetchone()

    if not row:
        return jsonify({
            "error": "Recipe not found"
        }), 404

    if row["image_url"]:
        return redirect(
            row["image_url"],
            code=302
        )

    result = find_commons_image(row["title"])

    if not result:
        return jsonify({
            "error": "No matching image found",
            "recipe": row["title"]
        }), 404

    with conn() as db:
        db.execute(
            """
            UPDATE recipes
            SET image_url=?,
                image_credit=?,
                image_license=?
            WHERE id=?
            """,
            (
                result["image_url"],
                result["image_credit"],
                result["image_license"],
                recipe_id
            )
        )

    return redirect(
        result["image_url"],
        code=302
    )


# --------------------------------------------------
# SEARCH RECIPE IMAGE FROM WIKIMEDIA COMMONS
# --------------------------------------------------

def find_commons_image(recipe_title):
    if not recipe_title:
        return None

    clean_title = re.split(
        r"\brecipe\b|\(",
        recipe_title,
        maxsplit=1,
        flags=re.IGNORECASE
    )[0].strip()

    words = re.findall(
        r"[a-zA-Z]+",
        clean_title
    )

    stop_words = {
        "and", "the", "with", "for", "style",
        "indian", "food", "recipe", "a", "of"
    }

    words = [
        word for word in words
        if word.lower() not in stop_words
        and len(word) > 2
    ]

    if not words:
        return None

    main_dish = words[-1]

    searches = [
        main_dish + " food"
    ]

    if len(words) >= 2:
        searches.append(
            " ".join(words[-2:]) + " food"
        )

    searches.append(" ".join(words))
    searches.append(main_dish)

    searches = list(dict.fromkeys(searches))

    for search_term in searches:
        try:
            response = requests.get(
                COMMONS_API,
                params={
                    "action": "query",
                    "format": "json",
                    "generator": "search",
                    "gsrsearch": search_term,
                    "gsrnamespace": 6,
                    "gsrlimit": 20,
                    "prop": "imageinfo",
                    "iiprop": "url|extmetadata",
                    "iiurlwidth": 800
                },
                headers=HEADERS,
                timeout=20
            )

            response.raise_for_status()

            data = response.json()

            pages = data.get(
                "query", {}
            ).get("pages", {})

            if not pages:
                continue

            title_words = {
                word.lower()
                for word in words
            }

            candidates = []

            for page in pages.values():
                image_info = page.get(
                    "imageinfo", []
                )

                if not image_info:
                    continue

                info = image_info[0]
                filename = page.get("title", "")

                image_url = (
                    info.get("thumburl")
                    or info.get("url")
                )

                if not image_url:
                    continue

                mime = info.get("mime", "")

                if mime and not mime.startswith("image/"):
                    continue

                if mime == "image/svg+xml":
                    continue

                if not re.search(
                    r"\.(jpg|jpeg|png|gif|webp|tif|tiff)$",
                    filename,
                    re.IGNORECASE
                ):
                    continue

                filename_words = {
                    word.lower()
                    for word in re.findall(
                        r"[a-zA-Z0-9]+",
                        filename
                    )
                }

                score = len(
                    title_words.intersection(filename_words)
                )

                if main_dish.lower() in filename_words:
                    score += 5

                if score > 0:
                    candidates.append(
                        (score, info, filename, image_url)
                    )

            if not candidates:
                continue

            candidates.sort(
                key=lambda item: item[0],
                reverse=True
            )

            best_score, best_info, filename, image_url = (
                candidates[0]
            )

            metadata = best_info.get(
                "extmetadata", {}
            )

            artist = clean_metadata(
                metadata.get(
                    "Artist", {}
                ).get("value", "")
            )

            license_name = clean_metadata(
                metadata.get(
                    "LicenseShortName", {}
                ).get("value", "")
            )

            app.logger.info(
                "Image found for %s: %s",
                recipe_title,
                filename
            )

            return {
                "image_url": image_url,
                "image_credit": artist or filename,
                "image_license": (
                    license_name
                    or "See Wikimedia Commons file page"
                )
            }

        except (
            requests.RequestException,
            ValueError,
            KeyError
        ) as error:
            app.logger.warning(
                "Wikimedia search failed for %s: %s",
                search_term,
                error
            )

    app.logger.warning(
        "No matching Wikimedia image found for %s",
        recipe_title
    )

    return None


# --------------------------------------------------
# GET RECIPE CATEGORIES
# --------------------------------------------------

@app.get("/api/categories")
def categories():
    with conn() as db:
        rows = db.execute("""
            SELECT DISTINCT category
            FROM recipes
            WHERE category IS NOT NULL
            AND category <> ''
            ORDER BY category
        """).fetchall()

    return jsonify([
        row[0] for row in rows
    ])


# --------------------------------------------------
# CONVERT THEMEALDB RECIPE FORMAT
# --------------------------------------------------

def mealdb_meal(m):
    ingredients = []

    for i in range(1, 21):
        name = (
            m.get(f"strIngredient{i}") or ""
        ).strip()

        measure = (
            m.get(f"strMeasure{i}") or ""
        ).strip()

        if name:
            ingredients.append({
                "text": (
                    measure + " " + name
                ).strip(),
                "scalable": False
            })

    instructions = [
        part.strip()
        for part in re.split(
            r"\r\n|\n|\r",
            m.get("strInstructions") or ""
        )
        if part.strip()
    ]

    return {
        "id": "mealdb-" + str(m.get("idMeal")),
        "title": m.get("strMeal"),
        "ingredients": ingredients,
        "instructions": instructions,
        "prep_time": None,
        "cook_time": None,
        "total_time": None,
        "servings": None,
        "image_url": m.get("strMealThumb"),
        "category": m.get("strCategory"),
        "source": "TheMealDB"
    }


# --------------------------------------------------
# SEARCH EXTERNAL RECIPES FROM THEMEALDB
# --------------------------------------------------

@app.get("/api/search/external")
def external_search():
    q = request.args.get("q", "").strip()

    if not q:
        return jsonify({
            "recipes": []
        })

    try:
        response = requests.get(
            "https://www.themealdb.com/api/json/v1/1/search.php",
            params={"s": q},
            timeout=12
        )

        response.raise_for_status()

        meals = (
            response.json() or {}
        ).get("meals") or []

        return jsonify({
            "recipes": [
                mealdb_meal(m)
                for m in meals
            ],
            "source": "TheMealDB"
        })

    except requests.RequestException as error:
        app.logger.warning(
            "TheMealDB search failed: %s",
            error
        )

        return jsonify({
            "recipes": [],
            "error": (
                "External recipe service is temporarily unavailable."
            )
        }), 502


# --------------------------------------------------
# START APPLICATION
# --------------------------------------------------

init_db()

if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5001,
        debug=True
    )