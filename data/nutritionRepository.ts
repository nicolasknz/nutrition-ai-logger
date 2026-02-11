import { supabase } from '../lib/supabase';
import type { FoodItem, MealGroup, NutritionGoals } from '../types';
import type { Database } from '../lib/database.types';

type MealRow = Database['public']['Tables']['meal_groups']['Row'];
type FoodItemRow = Database['public']['Tables']['food_items']['Row'];
type NutritionGoalsRow = Database['public']['Tables']['nutrition_goals']['Row'];

export interface NutritionSnapshot {
  items: FoodItem[];
  meals: MealGroup[];
  goals: NutritionGoals;
}

const normalizeGoalNumber = (value: number | null | undefined): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
};

const assertNoError = (error: { message: string } | null, context: string): void => {
  if (!error) return;
  throw new Error(`${context}: ${error.message}`);
};

const mapMealRow = (row: MealRow): MealGroup => ({
  id: row.id,
  label: row.label,
  transcriptSnippet: row.transcript_snippet ?? undefined,
  createdAt: new Date(row.created_at),
});

const mapFoodRow = (row: FoodItemRow): FoodItem => ({
  id: row.id,
  mealId: row.meal_id,
  name: row.name,
  quantity: row.quantity,
  calories: row.calories,
  protein: Number(row.protein),
  carbs: Number(row.carbs),
  fat: Number(row.fat),
  fiber: Number(row.fiber),
  micronutrients: row.micronutrients ?? undefined,
  timestamp: new Date(row.timestamp),
});

const mapGoalsRow = (row: NutritionGoalsRow | null): NutritionGoals => {
  if (!row) return {};
  return {
    calories: normalizeGoalNumber(row.calories ?? undefined),
    protein: normalizeGoalNumber(row.protein ?? undefined),
    carbs: normalizeGoalNumber(row.carbs ?? undefined),
    fat: normalizeGoalNumber(row.fat ?? undefined),
    fiber: normalizeGoalNumber(row.fiber ?? undefined),
  };
};

export const nutritionRepository = {
  async loadInitialData(userId: string): Promise<NutritionSnapshot> {
    const [mealsResult, itemsResult, goalsResult] = await Promise.all([
      supabase
        .from('meal_groups')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('food_items')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false }),
      supabase
        .from('nutrition_goals')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

    assertNoError(mealsResult.error, 'Failed to load meals');
    assertNoError(itemsResult.error, 'Failed to load items');
    assertNoError(goalsResult.error, 'Failed to load goals');

    return {
      meals: (mealsResult.data ?? []).map(mapMealRow),
      items: (itemsResult.data ?? []).map(mapFoodRow),
      goals: mapGoalsRow(goalsResult.data),
    };
  },

  async hasAnyData(userId: string): Promise<boolean> {
    const [itemsResult, mealsResult] = await Promise.all([
      supabase.from('food_items').select('id', { head: true, count: 'exact' }).eq('user_id', userId),
      supabase.from('meal_groups').select('id', { head: true, count: 'exact' }).eq('user_id', userId),
    ]);
    assertNoError(itemsResult.error, 'Failed to count items');
    assertNoError(mealsResult.error, 'Failed to count meals');
    return (itemsResult.count ?? 0) > 0 || (mealsResult.count ?? 0) > 0;
  },

  async insertMeal(userId: string, meal: MealGroup): Promise<void> {
    const { error } = await supabase.from('meal_groups').insert({
      id: meal.id,
      user_id: userId,
      label: meal.label,
      transcript_snippet: meal.transcriptSnippet ?? null,
      created_at: meal.createdAt.toISOString(),
    });
    assertNoError(error, 'Failed to insert meal');
  },

  async updateMealTranscript(userId: string, mealId: string, transcriptSnippet?: string): Promise<void> {
    const { error } = await supabase
      .from('meal_groups')
      .update({ transcript_snippet: transcriptSnippet?.trim() ? transcriptSnippet.trim().slice(0, 120) : null })
      .eq('id', mealId)
      .eq('user_id', userId);
    assertNoError(error, 'Failed to update meal transcript');
  },

  async deleteMeal(userId: string, mealId: string): Promise<void> {
    const { error } = await supabase.from('meal_groups').delete().eq('id', mealId).eq('user_id', userId);
    assertNoError(error, 'Failed to delete meal');
  },

  async insertFoodItem(userId: string, item: FoodItem): Promise<void> {
    const { error } = await supabase.from('food_items').insert({
      id: item.id,
      user_id: userId,
      meal_id: item.mealId,
      name: item.name,
      quantity: item.quantity,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      fiber: item.fiber,
      micronutrients: item.micronutrients ?? null,
      timestamp: item.timestamp.toISOString(),
    });
    assertNoError(error, 'Failed to insert food item');
  },

  async updateFoodItem(
    userId: string,
    itemId: string,
    updates: Partial<Pick<FoodItem, 'mealId' | 'quantity' | 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'micronutrients'>>
  ): Promise<void> {
    const payload: Database['public']['Tables']['food_items']['Update'] = {};
    if (updates.mealId !== undefined) payload.meal_id = updates.mealId;
    if (updates.quantity !== undefined) payload.quantity = updates.quantity;
    if (updates.calories !== undefined) payload.calories = updates.calories;
    if (updates.protein !== undefined) payload.protein = updates.protein;
    if (updates.carbs !== undefined) payload.carbs = updates.carbs;
    if (updates.fat !== undefined) payload.fat = updates.fat;
    if (updates.fiber !== undefined) payload.fiber = updates.fiber;
    if (updates.micronutrients !== undefined) payload.micronutrients = updates.micronutrients ?? null;

    const { error } = await supabase
      .from('food_items')
      .update(payload)
      .eq('id', itemId)
      .eq('user_id', userId);
    assertNoError(error, 'Failed to update food item');
  },

  async deleteFoodItem(userId: string, itemId: string): Promise<void> {
    const { error } = await supabase.from('food_items').delete().eq('id', itemId).eq('user_id', userId);
    assertNoError(error, 'Failed to delete food item');
  },

  async upsertGoals(userId: string, goals: NutritionGoals): Promise<void> {
    const { error } = await supabase.from('nutrition_goals').upsert({
      user_id: userId,
      calories: goals.calories ?? null,
      protein: goals.protein ?? null,
      carbs: goals.carbs ?? null,
      fat: goals.fat ?? null,
      fiber: goals.fiber ?? null,
    });
    assertNoError(error, 'Failed to upsert goals');
  },

  async importSnapshot(userId: string, snapshot: NutritionSnapshot): Promise<void> {
    if (snapshot.meals.length > 0) {
      const { error } = await supabase.from('meal_groups').upsert(
        snapshot.meals.map((meal) => ({
          id: meal.id,
          user_id: userId,
          label: meal.label,
          transcript_snippet: meal.transcriptSnippet ?? null,
          created_at: meal.createdAt.toISOString(),
        })),
        { onConflict: 'id' }
      );
      assertNoError(error, 'Failed to import meals');
    }

    if (snapshot.items.length > 0) {
      const { error } = await supabase.from('food_items').upsert(
        snapshot.items.map((item) => ({
          id: item.id,
          user_id: userId,
          meal_id: item.mealId,
          name: item.name,
          quantity: item.quantity,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
          fiber: item.fiber,
          micronutrients: item.micronutrients ?? null,
          timestamp: item.timestamp.toISOString(),
        })),
        { onConflict: 'id' }
      );
      assertNoError(error, 'Failed to import food items');
    }

    if (Object.keys(snapshot.goals).length > 0) {
      await this.upsertGoals(userId, snapshot.goals);
    }
  },
};
