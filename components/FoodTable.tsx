import React, { useMemo, useState } from 'react';
import { FoodItem, MealGroup } from '../types';
import { Trash2 } from 'lucide-react';

interface FoodTableProps {
  items: FoodItem[];
  meals: MealGroup[];
  onRemove: (id: string) => void;
  onMoveItem: (itemId: string, targetMealId: string) => void;
}

const FoodTable: React.FC<FoodTableProps> = ({ items, meals, onRemove, onMoveItem }) => {
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dropMealId, setDropMealId] = useState<string | null>(null);

  const mealSections = useMemo(() => {
    const knownMeals = new Map(meals.map((meal) => [meal.id, meal]));
    const byMeal = new Map<string, FoodItem[]>();

    for (const item of items) {
      const list = byMeal.get(item.mealId);
      if (list) {
        list.push(item);
      } else {
        byMeal.set(item.mealId, [item]);
      }
    }

    const sortedMeals = [...meals].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
    const sections = sortedMeals
      .filter((meal) => byMeal.has(meal.id))
      .map((meal) => ({ meal, items: byMeal.get(meal.id) ?? [] }));

    for (const [mealId, mealItems] of byMeal.entries()) {
      if (!knownMeals.has(mealId)) {
        sections.push({
          meal: {
            id: mealId,
            label: 'Meal',
            createdAt: mealItems[0]?.timestamp ?? new Date(),
          },
          items: mealItems,
        });
      }
    }

    return sections;
  }, [items, meals]);

  if (items.length === 0) {
    return (
      <div className="mt-12 flex flex-col items-center justify-center py-20 text-stone-400 border-2 border-dashed border-stone-200 rounded-3xl bg-stone-50/50">
        <p className="text-lg font-medium text-stone-500">Your plate is empty.</p>
        <p className="text-sm mt-2 opacity-70">Tap the microphone to log a meal</p>
      </div>
    );
  }

  return (
    <div className="w-full mt-10 pb-10">
      <div className="flex items-center justify-between mb-4 px-2">
         <h2 className="text-xl font-bold text-stone-900 tracking-tight">Logged Meals</h2>
      </div>
      <div className="space-y-4">
        {mealSections.map(({ meal, items: mealItems }) => {
          const totals = mealItems.reduce(
            (acc, item) => ({
              calories: acc.calories + item.calories,
              protein: acc.protein + item.protein,
              carbs: acc.carbs + item.carbs,
              fat: acc.fat + item.fat,
              fiber: acc.fiber + item.fiber,
            }),
            { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
          );

          return (
            <div
              key={meal.id}
              className={`overflow-hidden rounded-3xl border bg-white shadow-sm transition-colors ${
                dropMealId === meal.id
                  ? 'border-orange-300 ring-2 ring-orange-100'
                  : 'border-stone-200'
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDropMealId(meal.id);
              }}
              onDragLeave={() => {
                if (dropMealId === meal.id) setDropMealId(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const itemId = e.dataTransfer.getData('text/plain') || draggedItemId;
                setDropMealId(null);
                if (!itemId) return;
                const dragged = items.find((item) => item.id === itemId);
                if (!dragged || dragged.mealId === meal.id) return;
                onMoveItem(itemId, meal.id);
              }}
            >
              <div className="border-b border-stone-100 bg-stone-50 px-5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-stone-900">{meal.label}</div>
                    <div className="text-xs text-stone-500">
                      {meal.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {meal.transcriptSnippet ? ` · "${meal.transcriptSnippet}"` : ''}
                    </div>
                  </div>
                  <div className="text-xs text-stone-600">
                    {totals.calories} kcal · P {totals.protein}g · C {totals.carbs}g · F {totals.fat}g · Fi {totals.fiber}g
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-stone-100 bg-stone-50 text-xs uppercase tracking-wider text-stone-500 font-medium">
                      <th className="p-5 font-semibold">Food</th>
                      <th className="p-5 font-semibold">Qty</th>
                      <th className="p-5 font-semibold text-right text-orange-600">Kcal</th>
                      <th className="p-5 font-semibold text-right text-red-600">Prot</th>
                      <th className="p-5 font-semibold text-right text-amber-600">Carb</th>
                      <th className="p-5 font-semibold text-right text-sky-600">Fat</th>
                      <th className="p-5 font-semibold text-right text-emerald-600">Fiber</th>
                      <th className="p-5 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-sm">
                    {mealItems.map((item) => (
                      <tr
                        key={item.id}
                        draggable
                        onDragStart={(e) => {
                          setDraggedItemId(item.id);
                          e.dataTransfer.setData('text/plain', item.id);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragEnd={() => {
                          setDraggedItemId(null);
                          setDropMealId(null);
                        }}
                        className="group cursor-grab active:cursor-grabbing hover:bg-stone-50 transition-colors"
                      >
                        <td className="p-5">
                          <div className="font-semibold text-stone-900 text-base">{item.name}</div>
                          {item.micronutrients && (
                            <div className="text-xs text-stone-400 font-normal mt-1 max-w-[260px] truncate">
                              {item.micronutrients}
                            </div>
                          )}
                        </td>
                        <td className="p-5 text-stone-500 font-medium">{item.quantity}</td>
                        <td className="p-5 text-right font-bold text-stone-800">{item.calories}</td>
                        <td className="p-5 text-right text-stone-600">{item.protein}g</td>
                        <td className="p-5 text-right text-stone-600">{item.carbs}g</td>
                        <td className="p-5 text-right text-stone-600">{item.fat}g</td>
                        <td className="p-5 text-right text-stone-600">{item.fiber}g</td>
                        <td className="p-5 text-center">
                          <button
                            onClick={() => onRemove(item.id)}
                            className="p-2 rounded-full text-stone-300 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                            title="Remove item"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
      {mealSections.length === 0 && (
        <div className="mt-3 text-sm text-stone-400 px-2">
          No meals yet.
        </div>
      )}
    </div>
  );
};

export default FoodTable;