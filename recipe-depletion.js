const QUANTITY_PATTERN = /^\s*([0-9]+(?:[.,][0-9]+)?)\s*([a-zа-яё]+)?\s*$/i;

function formatQuantity(value) {
  return Number(value.toFixed(6)).toString();
}

/**
 * Scale a recipe card's full-batch ingredient quantities to the requested
 * number of sold portions. Ingredient quantities and units are kept in the
 * same textual format so existing unit conversion can run after scaling.
 */
function scaleBatchRecipeIngredients(ingredients, orderQuantity, portionCount) {
  const sold = Number(orderQuantity);
  const portions = Number(portionCount);
  if (!Array.isArray(ingredients)) throw new TypeError('recipe_ingredients_must_be_array');
  if (!Number.isFinite(sold) || sold <= 0) throw new RangeError('recipe_order_quantity_invalid');
  if (!Number.isInteger(portions) || portions < 1) throw new RangeError('recipe_portion_count_invalid');

  const ratio = sold / portions;
  return ingredients.map((ingredient) => {
    const raw = String(ingredient?.quantity ?? '').trim();
    const match = raw.match(QUANTITY_PATTERN);
    if (!match || Number(match[1].replace(',', '.')) <= 0) {
      throw new RangeError('recipe_ingredient_quantity_invalid');
    }
    const amount = Number(match[1].replace(',', '.')) * ratio;
    if (!Number.isFinite(amount) || amount <= 0) throw new RangeError('recipe_ingredient_quantity_invalid');
    return {
      ...ingredient,
      quantity: `${formatQuantity(amount)}${match[2] ? ` ${match[2]}` : ''}`,
    };
  });
}

module.exports = { scaleBatchRecipeIngredients };
