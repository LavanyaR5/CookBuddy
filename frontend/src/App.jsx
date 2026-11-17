import React, { useEffect, useState } from 'react';
import {
  Search,
  Clock3,
  Users,
  ChefHat,
  Leaf,
  ArrowRight,
  X,
  Utensils,
  Flame,
  Sparkles
} from 'lucide-react';

const API = 'http://127.0.0.1:5001/api';

const IMAGE_PLACEHOLDER =
  'https://placehold.co/600x400?text=Image+Not+Available';

const UI = {
  freeDiscovery: 'Free recipe discovery',
  explore: 'Explore recipes',
  heroEyebrow: 'FIND YOUR NEXT FAVOURITE',
  heroLine1: 'Good food starts',
  heroLine2: 'with inspiration.',
  heroDescription:
    'Your Kitchen, Your Buddy! Discover something delicious to cook today. Explore recipes, find ingredients and make every meal your own.',
  searchPlaceholder: 'Search dishes or ingredients...',
  searchButton: 'Search recipes',
  tryLabel: 'Try:',
  collection: 'THE RECIPE COLLECTION',
  collectionTitle: 'Find something delicious',
  all: 'All',
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  dessert: 'Dessert',
  vegetarian: 'Vegetarian',
  results: 'results',
  loading: 'Finding delicious recipes...',
  emptyTitle: 'No recipes to show yet',
  emptyDescription:
    'Start the backend and import your recipe dataset, or search a dish to try the online recipe source.',
  previous: 'Previous',
  next: 'Next',
  page: 'Page',
  planTime: 'Plan your time',
  planDescription:
    'Prep and cook times when the source provides them.',
  cookYourWay: 'Cook your way',
  cookDescription:
    'Adjust ingredient amounts when serving data is available.',
  stepByStep: 'Step-by-step',
  stepsDescription: 'Clear cooking instructions for your kitchen.',
  footerDescription: 'Discover, cook and enjoy. No account needed.',
  footerSource:
    'External recipe content is attributed to its source where available.',
  photoTitle: 'Made for every appetite',
  photoDescription: 'Everyday inspiration, one recipe at a time',
  recipe: 'Recipe',
  viewRecipe: 'View recipe',
  servings: 'Servings',
  adjustQuantities: 'Adjust quantities below',
  noServingInfo:
    'Serving count not provided by source; quantities cannot be scaled reliably.',
  ingredients: 'Ingredients',
  preparation: 'Preparation Steps',
  noIngredients: 'Ingredients are not available for this recipe.',
  noInstructions:
    'Preparation instructions are not available for this recipe.',
  recipeDetails: 'RECIPE DETAILS',
  prep: 'Prep:',
  cook: 'Cook:',
  total: 'Total:',
  notProvided: 'Not provided',
  servingsNA: 'Servings n/a',
  source: 'Source:',
  recipeCollection: 'Recipe collection',
  imageCredit: 'Image credit:',
  licence: 'Licence:',
  close: 'Close',
  localCollection: 'recipes in your local collection.',
  externalResults:
    'No local match — showing matching recipes from TheMealDB.',
  noSearchResults:
    'No recipes found. Try another search or import a recipe dataset.',
  emptyDatabase:
    'Your local database is empty. Import a dataset to populate it.',
  backendError:
    'Backend is not connected. Please start the Flask server.'
};

const prettyTime = value => value || UI.notProvided;

function getRecipeImage(recipe) {
  if (recipe?.image_url) return recipe.image_url;

  if (recipe?.id && !String(recipe.id).startsWith('mealdb-')) {
    return `${API}/recipes/${recipe.id}/image`;
  }

  return IMAGE_PLACEHOLDER;
}

function handleImageError(event) {
  event.currentTarget.onerror = null;
  event.currentTarget.src = IMAGE_PLACEHOLDER;
}

function getItemText(item) {
  if (typeof item === 'string') return item.trim();

  if (item && typeof item === 'object') {
    return (
      item.text ||
      item.instruction ||
      item.description ||
      [item.amount, item.unit, item.name].filter(Boolean).join(' ')
    ).trim();
  }

  return '';
}

function getRecipeList(value, type = 'ingredients') {
  if (!value) return [];

  let items = value;

  if (typeof items === 'string') {
    const trimmed = items.trim();

    if (
      (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
      (trimmed.startsWith('{') && trimmed.endsWith('}'))
    ) {
      try {
        items = JSON.parse(trimmed);
      } catch {
        items = trimmed;
      }
    }
  }

  if (!Array.isArray(items)) items = [items];

  const result = [];

  items.forEach(item => {
    const text = getItemText(item);
    if (!text) return;

    let parts = text
      .split(/\r?\n|•|(?:^|\s)[-]\s+/)
      .map(part => part.trim())
      .filter(Boolean);

    if (
      type === 'ingredients' &&
      parts.length === 1 &&
      parts[0].includes(',')
    ) {
      const original = parts[0];

      const quantityParts = original.split(
        /,\s*(?=(?:\d|½|¼|¾|⅓|⅔|one\b|two\b|three\b))/i
      );

      parts = quantityParts.length > 1
        ? quantityParts
        : original.split(',');

      parts = parts.map(part => part.trim()).filter(Boolean);
    }

    if (type === 'instructions' && parts.length === 1) {
      const original = parts[0];

      const numberedParts = original
        .split(/(?:^|\s)(?=\d+[.)]\s)/)
        .map(part => part.replace(/^\d+[.)]\s*/, '').trim())
        .filter(Boolean);

      if (numberedParts.length > 1) {
        parts = numberedParts;
      } else {
        const sentences = original
          .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
          .map(part => part.trim())
          .filter(Boolean);

        if (sentences.length > 1) parts = sentences;
      }
    }

    result.push(...parts);
  });

  return result.filter(Boolean);
}

function App() {
  const [query, setQuery] = useState('');
  const [recipes, setRecipes] = useState([]);
  const [selected, setSelected] = useState(null);

  const [servings, setServings] = useState(2);
  const [loading, setLoading] = useState(false);

  const [notice, setNotice] = useState(
    'Loading your recipe collection...'
  );

  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  // Search recipes in English.
  async function search(q = query, p = 1) {
    setLoading(true);
    setSelected(null);
    setPage(p);

    try {
      const local = await fetch(
        `${API}/recipes?q=${encodeURIComponent(q)}&page=${p}&per_page=12`
      );

      if (!local.ok) throw new Error('Backend unavailable');

      const data = await local.json();

      if (data.total > 0) {
        setRecipes(data.recipes || []);
        setTotal(data.total);

        setNotice(
          `${data.total.toLocaleString()} ${UI.localCollection}`
        );
      } else if (q.trim()) {
        const ext = await fetch(
          `${API}/search/external?q=${encodeURIComponent(q)}`
        );

        if (!ext.ok) throw new Error('External search unavailable');

        const externalData = await ext.json();
        const externalRecipes = externalData.recipes || [];

        setRecipes(externalRecipes);
        setTotal(externalRecipes.length);

        setNotice(
          externalRecipes.length
            ? UI.externalResults
            : UI.noSearchResults
        );
      } else {
        setRecipes([]);
        setTotal(0);
        setNotice(UI.emptyDatabase);
      }
    } catch (error) {
      console.error(error);

      setRecipes([]);
      setTotal(0);
      setNotice(UI.backendError);
    }

    setLoading(false);
  }

  // Load recipes when the page opens.
  useEffect(() => {
    search('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openRecipe(recipe) {
    setSelected(recipe);
    setServings(recipe.servings || 2);
  }

  function scaledIngredient(ingredient) {
    const raw = getItemText(ingredient);

    if (!selected?.servings) return raw;

    if (
      typeof ingredient === 'object' &&
      ingredient?.scalable &&
      ingredient?.amount
    ) {
      const n =
        ingredient.amount * servings / selected.servings;

      const value = Number.isInteger(n)
        ? n
        : Number(n.toFixed(2));

      return `${value} ${ingredient.unit || ''} ${ingredient.name || ''}`
        .replace(/\s+/g, ' ')
        .trim();
    }

    const match = raw.match(
      /^\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*(.*)$/
    );

    if (!match) return raw;

    const token = match[1].trim();
    let amount;

    if (token.includes(' ')) {
      const [whole, frac] = token.split(/\s+/);
      const [a, b] = frac.split('/').map(Number);
      amount = Number(whole) + a / b;
    } else if (token.includes('/')) {
      const [a, b] = token.split('/').map(Number);
      amount = a / b;
    } else {
      amount = Number(token);
    }

    const scaled = amount * servings / selected.servings;

    const value = Number.isInteger(scaled)
      ? scaled
      : Number(scaled.toFixed(2));

    return `${value} ${match[2]}`.trim();
  }

  const ingredientList = selected
    ? getRecipeList(selected.ingredients, 'ingredients')
    : [];

  const instructionList = selected
    ? getRecipeList(selected.instructions, 'instructions')
    : [];

  const categories = [
    { key: 'all', search: '' },
    { key: 'breakfast', search: 'Breakfast' },
    { key: 'lunch', search: 'Lunch' },
    { key: 'dinner', search: 'Dinner' },
    { key: 'dessert', search: 'Dessert' },
    { key: 'vegetarian', search: 'Vegetarian' }
  ];

  return (
    <div className="app">
      <header className="nav">
        <a className="brand" href="#">
          <span className="brandmark">
            <ChefHat size={22} />
          </span>
          Cook<span>Buddy</span>
        </a>

        <div className="navright">
          <span className="public">
            <span /> {UI.freeDiscovery}
          </span>

          <a href="#browse">{UI.explore}</a>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <Sparkles size={15} />
              {UI.heroEyebrow}
            </div>

            <h1>
              {UI.heroLine1}
              <br />
              <em>{UI.heroLine2}</em>
            </h1>

            <p>{UI.heroDescription}</p>

            <form
              className="searchbar"
              onSubmit={e => {
                e.preventDefault();
                search(query);
              }}
            >
              <Search size={21} />

              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={UI.searchPlaceholder}
                aria-label={UI.searchPlaceholder}
              />

              <button type="submit">
                {UI.searchButton} <ArrowRight size={17} />
              </button>
            </form>

            <div className="hero-tags">
              <span>{UI.tryLabel}</span>

              {['chicken', 'pasta', 'potato', 'dessert'].map(term => (
                <button
                  key={term}
                  type="button"
                  onClick={() => {
                    setQuery(term);
                    search(term);
                  }}
                >
                  {term}
                </button>
              ))}
            </div>
          </div>

          <div className="hero-photo">
            <img
              src="https://images.unsplash.com/photo-1547592180-85f173990554?w=1200"
              alt="Freshly prepared food"
            />

            <div className="photo-note">
              <span className="note-icon">
                <Leaf size={18} />
              </span>

              <div>
                <b>{UI.photoTitle}</b>
                <small>{UI.photoDescription}</small>
              </div>
            </div>
          </div>
        </section>

        <section className="browse" id="browse">
          <div className="section-head">
            <div>
              <div className="eyebrow">{UI.collection}</div>
              <h2>{UI.collectionTitle}</h2>
              <p className="notice">{notice}</p>
            </div>

            <div className="collection-count">
              <Utensils size={17} />
              <span>
                {total.toLocaleString()} {UI.results}
              </span>
            </div>
          </div>

          <div className="category-row">
            {categories.map(category => (
              <button
                className={
                  (category.search === '' && !query) ||
                  query.toLowerCase() === category.search.toLowerCase()
                    ? 'active'
                    : ''
                }
                key={category.key}
                type="button"
                onClick={() => {
                  setQuery(category.search);
                  search(category.search);
                }}
              >
                {UI[category.key]}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="loading">{UI.loading}</div>
          ) : (
            <div className="grid">
              {recipes.map((recipe, index) => (
                <button
                  className="recipe-card"
                  key={recipe.id || index}
                  type="button"
                  onClick={() => openRecipe(recipe)}
                >
                  <div className="card-image">
                    <img
                      src={getRecipeImage(recipe)}
                      alt={recipe.title}
                      loading="lazy"
                      onError={handleImageError}
                    />

                    <span className="card-category">
                      {recipe.category || UI.recipe}
                    </span>
                  </div>

                  <div className="card-content">
                    <h3>{recipe.title}</h3>

                    <div className="meta">
                      <span>
                        <Clock3 size={15} />
                        {prettyTime(recipe.total_time)}
                      </span>

                      <span>
                        <Users size={15} />
                        {recipe.servings
                          ? `${recipe.servings} ${UI.servings.toLowerCase()}`
                          : UI.servingsNA}
                      </span>
                    </div>

                    <span className="view-recipe">
                      {UI.viewRecipe} <ArrowRight size={15} />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {!loading && recipes.length === 0 && (
            <div className="empty">
              <ChefHat size={32} />
              <h3>{UI.emptyTitle}</h3>
              <p>{UI.emptyDescription}</p>
            </div>
          )}

          {!loading && total > 12 && (
            <div className="pagination">
              <button
                disabled={page <= 1}
                onClick={() => search(query, page - 1)}
              >
                {UI.previous}
              </button>

              <span>{UI.page} {page}</span>

              <button
                disabled={page * 12 >= total}
                onClick={() => search(query, page + 1)}
              >
                {UI.next}
              </button>
            </div>
          )}
        </section>

        <section className="feature-strip">
          <div>
            <span className="feature-icon"><Clock3 /></span>
            <b>{UI.planTime}</b>
            <small>{UI.planDescription}</small>
          </div>

          <div>
            <span className="feature-icon"><Users /></span>
            <b>{UI.cookYourWay}</b>
            <small>{UI.cookDescription}</small>
          </div>

          <div>
            <span className="feature-icon"><Flame /></span>
            <b>{UI.stepByStep}</b>
            <small>{UI.stepsDescription}</small>
          </div>
        </section>
      </main>

      <footer>
        <a className="brand" href="#">
          <span className="brandmark">
            <ChefHat size={20} />
          </span>
          Cook<span>Buddy</span>
        </a>

        <p>{UI.footerDescription}</p>
        <small>{UI.footerSource}</small>
      </footer>

      {selected && (
        <div
          className="modal-backdrop"
          onClick={() => setSelected(null)}
        >
          <section
            className="recipe-modal"
            onClick={e => e.stopPropagation()}
          >
            <button
              className="close"
              onClick={() => setSelected(null)}
              aria-label={UI.close}
            >
              <X />
            </button>

            <div className="modal-photo">
              <img
                src={getRecipeImage(selected)}
                alt={selected.title}
                onError={handleImageError}
              />
            </div>

            <div className="modal-body">
              <div className="eyebrow">
                {selected.category || UI.recipeDetails}
              </div>

              <h2>{selected.title}</h2>

              <div className="detail-meta">
                <span>
                  <Clock3 />
                  {UI.prep} {prettyTime(selected.prep_time)}
                </span>

                <span>
                  <Flame />
                  {UI.cook} {prettyTime(selected.cook_time)}
                </span>

                <span>
                  <Clock3 />
                  {UI.total} {prettyTime(selected.total_time)}
                </span>
              </div>

              <div className="serving-control">
                <div>
                  <b>
                    <Users size={17} /> {UI.servings}
                  </b>

                  <small>
                    {selected.servings
                      ? UI.adjustQuantities
                      : UI.noServingInfo}
                  </small>
                </div>

                <div className="stepper">
                  <button
                    disabled={!selected.servings}
                    onClick={() => setServings(s => Math.max(1, s - 1))}
                  >
                    −
                  </button>

                  <strong>{servings}</strong>

                  <button
                    disabled={!selected.servings}
                    onClick={() => setServings(s => Math.min(30, s + 1))}
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="detail-columns">
                <div className="detail-section">
                  <h3>{UI.ingredients}</h3>

                  {ingredientList.length > 0 ? (
                    <ul className="ingredients">
                      {ingredientList.map((ingredient, index) => (
                        <li key={index}>
                          {scaledIngredient(ingredient)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="no-details">{UI.noIngredients}</p>
                  )}
                </div>

                <div className="detail-section">
                  <h3>{UI.preparation}</h3>

                  {instructionList.length > 0 ? (
                    <ol className="instructions">
                      {instructionList.map((step, index) => (
                        <li key={index}>{step}</li>
                      ))}
                    </ol>
                  ) : (
                    <p className="no-details">{UI.noInstructions}</p>
                  )}
                </div>
              </div>

              <small className="source">
                {UI.source} {selected.source || UI.recipeCollection}
              </small>

              {selected.image_credit && (
                <small className="source">
                  {UI.imageCredit} {selected.image_credit}

                  {selected.image_license
                    ? ` | ${UI.licence} ${selected.image_license}`
                    : ''}
                </small>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;