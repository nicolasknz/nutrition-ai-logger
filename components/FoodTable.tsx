import React, { useMemo, useState } from 'react';
import { FoodItem, MealGroup } from '../types';
import { Trash2 } from 'lucide-react';

interface FoodTableProps {
  items: FoodItem[];
  meals: MealGroup[];
  onRemove: (id: string) => void;
  onMoveItem: (itemId: string, targetMealId: string) => void;
  onEditQuantity: (itemId: string, quantity: string) => void;
  language: 'en-US' | 'pt-BR';
}

const FoodTable: React.FC<FoodTableProps> = ({ items, meals, onRemove, onMoveItem, onEditQuantity, language }) => {
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dropMealId, setDropMealId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<FoodItem | null>(null);
  const [quantityDraft, setQuantityDraft] = useState('');
  const isPortuguese = language === 'pt-BR';
  const copy = {
    meal: isPortuguese ? 'Refeicao' : 'Meal',
    emptyPlate: isPortuguese ? 'Seu prato esta vazio.' : 'Your plate is empty.',
    emptyHint: isPortuguese ? 'Toque no microfone para registrar uma refeicao' : 'Tap the microphone to log a meal',
    loggedMeals: isPortuguese ? 'Refeicoes Registradas' : 'Logged Meals',
    food: isPortuguese ? 'Alimento' : 'Food',
    qty: isPortuguese ? 'Qtd' : 'Qty',
    proteinShort: isPortuguese ? 'Pr' : 'P',
    carbsShort: isPortuguese ? 'Carb' : 'C',
    fatShort: isPortuguese ? 'Gord' : 'F',
    fiberShort: isPortuguese ? 'Fib' : 'Fi',
    removeItem: isPortuguese ? 'Remover item' : 'Remove item',
    editQuantityTitle: isPortuguese ? 'Editar quantidade' : 'Edit quantity',
    quantityPlaceholder: isPortuguese ? 'Ex.: 2 fatias, 1 xicara...' : 'E.g. 2 slices, 1 cup...',
    cancel: isPortuguese ? 'Cancelar' : 'Cancel',
    save: isPortuguese ? 'Salvar' : 'Save',
    tapToEditHint: isPortuguese ? 'Toque em um item para editar a quantidade.' : 'Tap an item to edit quantity.',
    noMealsYet: isPortuguese ? 'Nenhuma refeicao ainda.' : 'No meals yet.',
  };
  const isSaveDisabled = quantityDraft.trim().length === 0;

  const openEditModal = (item: FoodItem) => {
    setEditingItem(item);
    setQuantityDraft(item.quantity);
  };

  const closeEditModal = () => {
    setEditingItem(null);
    setQuantityDraft('');
  };

  const saveEditedQuantity = () => {
    if (!editingItem || isSaveDisabled) return;
    onEditQuantity(editingItem.id, quantityDraft.trim());
    closeEditModal();
  };

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
            label: copy.meal,
            createdAt: mealItems[0]?.timestamp ?? new Date(),
          },
          items: mealItems,
        });
      }
    }

    return sections;
  }, [copy.meal, items, meals]);

  if (items.length === 0) {
    return (
      <div className="mt-12 flex flex-col items-center justify-center py-20 text-stone-400 border-2 border-dashed border-stone-200 rounded-3xl bg-stone-50/50">
        <p className="text-lg font-medium text-stone-500">{copy.emptyPlate}</p>
        <p className="text-sm mt-2 opacity-70">{copy.emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="w-full mt-10 pb-10">
      <div className="flex items-center justify-between mb-4 px-2">
         <h2 className="text-xl font-bold text-stone-900 tracking-tight">{copy.loggedMeals}</h2>
         <span className="text-xs text-stone-500">{copy.tapToEditHint}</span>
      </div>
      <div className="space-y-4">
        {mealSections.map(({ meal, items: mealItems }, mealIndex) => {
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
          const mealTime = meal.createdAt.toLocaleTimeString(language, {
            hour: '2-digit',
            minute: '2-digit',
          });
          const mealLabel = `${copy.meal} ${mealIndex + 1} - ${mealTime}`;

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
                    <div className="text-sm font-semibold text-stone-900">{mealLabel}</div>
                    {meal.transcriptSnippet && (
                      <div className="text-xs text-stone-500">
                        {`"${meal.transcriptSnippet}"`}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-stone-600">
                    {totals.calories} kcal · {copy.proteinShort} {totals.protein}g · {copy.carbsShort} {totals.carbs}g · {copy.fatShort} {totals.fat}g · {copy.fiberShort} {totals.fiber}g
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-stone-100 bg-stone-50 text-xs uppercase tracking-wider text-stone-500 font-medium">
                      <th className="p-5 font-semibold">{copy.food}</th>
                      <th className="p-5 font-semibold">{copy.qty}</th>
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
                        onClick={() => openEditModal(item)}
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
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemove(item.id);
                            }}
                            className="p-2 rounded-full text-stone-300 hover:text-red-500 hover:bg-red-50 transition-all opacity-100"
                            title={copy.removeItem}
                            aria-label={copy.removeItem}
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
          {copy.noMealsYet}
        </div>
      )}

      {editingItem && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4"
          onClick={closeEditModal}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-stone-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-stone-900">{copy.editQuantityTitle}</h3>
            <p className="mt-1 text-sm text-stone-500">{editingItem.name}</p>
            <div className="mt-4">
              <label className="block text-sm font-medium text-stone-700 mb-2">{copy.qty}</label>
              <input
                type="text"
                value={quantityDraft}
                onChange={(e) => setQuantityDraft(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-300"
                placeholder={copy.quantityPlaceholder}
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeEditModal}
                className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50"
              >
                {copy.cancel}
              </button>
              <button
                type="button"
                onClick={saveEditedQuantity}
                disabled={isSaveDisabled}
                className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-stone-800"
              >
                {copy.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FoodTable;