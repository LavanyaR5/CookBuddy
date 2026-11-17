# Recipe Finder — New Project

A separate public recipe-search website. No login or registration is required.

## Stack
- React + Vite frontend
- Flask REST API backend
- SQLite database
- TheMealDB API fallback
- CSV importer for a licensed English recipe dataset

## Important data note
The app does **not** pretend that a small API contains 8,000 recipes. To reach 8,000+ locally searchable recipes, import a dataset with at least 8,000 usable rows. The included importer accepts RecipeNLG-style CSV files (`title`, `ingredients`, `directions`). RecipeNLG's official download page requires accepting its terms; those terms restrict use to non-commercial research and educational purposes. Check the terms yourself before downloading/using it:
https://recipenlg.cs.put.poznan.pl/dataset

RecipeNLG has been described by its project repository as containing over 2.2 million recipes, but its records do not reliably provide prep time, cook time, or serving counts. This app displays those fields as "Not provided" rather than inventing values.
Sources:
- https://recipenlg.cs.put.poznan.pl/dataset
- https://github.com/drnsmith/OfficialRecipeNLG

TheMealDB is used as an online fallback for recipes with ingredient measures, instructions, and images. Its free test key is intended for development/education; check the current API terms before public/commercial deployment:
https://www.themealdb.com/docs_api_guide.php
https://www.themealdb.com/terms_of_use.php

## 1. Requirements
- Python 3.10+
- Node.js 18+
- npm

## 2. Start backend (Windows PowerShell)
```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```
Backend: http://127.0.0.1:5000

## 3. Start frontend (new terminal)
```powershell
cd frontend
npm install
npm run dev
```
Frontend: http://localhost:5173

## 4. Import 8,000+ dataset rows
1. Download the dataset from its official page and accept its terms.
2. Extract `full_dataset.csv` (or the supplied CSV).
3. Copy it to `backend/data/recipes.csv`.
4. From the `backend` folder run:
```powershell
python import_recipes.py data/recipes.csv --limit 0
```
`--limit 0` imports all usable rows. To test first:
```powershell
python import_recipes.py data/recipes.csv --limit 10000
```
5. Check the import summary. It reports inserted and skipped rows. Use the website search to test imported recipes.

CSV parser supports JSON-array strings or simple delimited ingredient/direction strings. Duplicate titles are skipped. Dataset fields without source values remain blank.

## 5. Serving calculator
- The calculator scales ingredient quantities only when it can parse a numeric amount and unit.
- Ingredients such as "salt to taste", "1 large onion", or ambiguous text are shown unchanged with a note.
- The base serving count defaults to 4 only for recipes that explicitly include a serving value; otherwise serving adjustment is disabled and the UI explains why.
- Do not treat approximate scaling as nutrition or medical advice.

## 6. API endpoints
- `GET /api/health`
- `GET /api/recipes?q=chicken&page=1&per_page=12`
- `GET /api/recipes/<id>`
- `GET /api/categories`
- `GET /api/search/external?q=chicken`

## 7. Troubleshooting
- If frontend cannot reach backend, ensure Flask is running on port 5000.
- If PowerShell blocks activation, run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`.
- If the dataset uses different column names, edit `COLUMN_ALIASES` in `import_recipes.py`.
