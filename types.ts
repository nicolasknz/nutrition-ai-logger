export interface FoodItem {
  id: string;
  mealId: string;
  name: string;
  quantity: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  micronutrients?: string;
  timestamp: Date;
}

export interface MealGroup {
  id: string;
  label: string;
  createdAt: Date;
  transcriptSnippet?: string;
}

export interface DailyStats {
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalFiber: number;
}

export interface NutritionGoals {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
}
