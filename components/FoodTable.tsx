import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { FoodItem, MealGroup } from '../types';
import { Trash2, ChevronDown, ArrowRightLeft } from 'lucide-react';

interface FoodTableProps {
  items: FoodItem[];
  meals: MealGroup[];
  onRemove: (id: string) => void;
  onMoveItem: (itemId: string, targetMealId: string) => void;
  onEditQuantity: (itemId: string, quantity: string) => void;
  language: 'en-US' | 'pt-BR';
}

const FoodTable: React.FC<FoodTableProps> = ({ items, meals, onRemove, onMoveItem, onEditQuantity, language }) => {
  const [editingItem, setEditingItem] = useState<FoodItem | null>(null);
  const [quantityNum, setQuantityNum] = useState('');
  const [quantityUnit, setQuantityUnit] = useState('');
  const [swipingItemId, setSwipingItemId] = useState<string | null>(null);
  const [wasDragging, setWasDragging] = useState(false);
  const [collapsedMeals, setCollapsedMeals] = useState<Set<string>>(new Set());

  const toggleCollapse = (mealId: string) => {
    setCollapsedMeals((prev) => {
      const next = new Set(prev);
      if (next.has(mealId)) next.delete(mealId);
      else next.add(mealId);
      return next;
    });
  };
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
    protein: isPortuguese ? 'Proteina' : 'Protein',
    carbs: isPortuguese ? 'Carboidratos' : 'Carbs',
    fat: isPortuguese ? 'Gordura' : 'Fat',
    fiber: isPortuguese ? 'Fibra' : 'Fiber',
    calories: isPortuguese ? 'Calorias' : 'Calories',
    removeItem: isPortuguese ? 'Remover item' : 'Remove item',
    delete: isPortuguese ? 'Deletar' : 'Delete',
    foodDetails: isPortuguese ? 'Detalhes do Alimento' : 'Food Details',
    editQuantityTitle: isPortuguese ? 'Editar quantidade' : 'Edit quantity',
    quantityPlaceholder: isPortuguese ? 'Ex.: 2 fatias, 1 xicara...' : 'E.g. 2 slices, 1 cup...',
    cancel: isPortuguese ? 'Cancelar' : 'Cancel',
    save: isPortuguese ? 'Salvar' : 'Save',
    moveTo: isPortuguese ? 'Mover para' : 'Move to',
    tapToViewDetails: isPortuguese ? 'Toque para editar · Deslize para deletar' : 'Tap to edit · Swipe to delete',
    noMealsYet: isPortuguese ? 'Nenhuma refeicao ainda.' : 'No meals yet.',
  };
  const isSaveDisabled = quantityNum.trim().length === 0 || Number(quantityNum.replace(',', '.')) <= 0;

  const openEditModal = (item: FoodItem) => {
    setEditingItem(item);
    const match = item.quantity.match(/^([0-9.,]+)\s*(.*)$/);
    if (match) {
      setQuantityNum(match[1]);
      setQuantityUnit(match[2].trim());
    } else {
      setQuantityNum(item.quantity);
      setQuantityUnit('');
    }
  };

  const closeEditModal = () => {
    setEditingItem(null);
    setQuantityNum('');
    setQuantityUnit('');
  };

  const saveEditedQuantity = () => {
    if (!editingItem || isSaveDisabled) return;
    const combined = quantityUnit ? `${quantityNum.trim()} ${quantityUnit}` : quantityNum.trim();
    onEditQuantity(editingItem.id, combined);
    closeEditModal();
  };

  const deleteEditingItem = () => {
    if (!editingItem) return;
    onRemove(editingItem.id);
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
      .filter((meal) => byMeal.has(meal.id) || meal.isLoading)
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

  if (items.length === 0 && !meals.some((m) => m.isLoading)) {
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
         <span className="text-xs text-stone-500">{copy.tapToViewDetails}</span>
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

          const isCollapsed = collapsedMeals.has(meal.id);

          return (
            <div
              key={meal.id}
              className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm"
            >
              <button
                type="button"
                onClick={() => toggleCollapse(meal.id)}
                className="w-full text-left border-b border-stone-100 bg-stone-50 px-5 py-3 hover:bg-stone-100 transition-colors"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ChevronDown
                      size={16}
                      className={`text-stone-400 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}
                    />
                    <div>
                      <div className="text-sm font-semibold text-stone-900">{mealLabel}</div>
                      {meal.transcriptSnippet && (
                        <div className="text-xs text-stone-500">
                          {`"${meal.transcriptSnippet}"`}
                        </div>
                      )}
                    </div>
                  </div>
                  {meal.isLoading && mealItems.length === 0 ? (
                    <div className="text-xs text-stone-400 italic">
                      {isPortuguese ? 'Aguardando resultado...' : 'Waiting for result...'}
                    </div>
                  ) : (
                    <div className="text-xs text-stone-600">
                      {Math.round(totals.calories)} kcal · {copy.proteinShort} {+totals.protein.toFixed(1)}g · {copy.carbsShort} {+totals.carbs.toFixed(1)}g · {copy.fatShort} {+totals.fat.toFixed(1)}g · {copy.fiberShort} {+totals.fiber.toFixed(1)}g
                    </div>
                  )}
                </div>
              </button>
              <motion.div
                animate={isCollapsed ? { height: 0, opacity: 0 } : { height: 'auto', opacity: 1 }}
                initial={false}
                transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                className="overflow-hidden"
              >
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-stone-100 bg-stone-50 text-xs uppercase tracking-wider text-stone-500 font-medium">
                      <th className="p-4 font-semibold">{copy.food}</th>
                      <th className="p-4 font-semibold text-right">{copy.qty}</th>
                      <th className="p-4 font-semibold text-right text-orange-600">Kcal</th>
                      <th className="p-4 font-semibold text-right text-red-600">Prot</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-sm">
                    {meal.isLoading && mealItems.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-5 py-6 text-center">
                          <div className="flex items-center justify-center gap-2 text-stone-400 text-sm">
                            <div className="h-4 w-4 rounded-full border-2 border-stone-300 border-t-stone-600 animate-spin" />
                            {isPortuguese ? 'Analisando...' : 'Analyzing...'}
                          </div>
                        </td>
                      </tr>
                    )}
                    <AnimatePresence initial={true}>
                    {mealItems.map((item, itemIndex) => {
                      const isSwipingThis = swipingItemId === item.id;

                      return (
                      <motion.tr
                        key={item.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0, x: 0 }}
                        exit={{ x: -300, opacity: 0, transition: { duration: 0.3 } }}
                        transition={{ duration: 0.22, delay: itemIndex * 0.06, ease: [0.25, 0.46, 0.45, 0.94] }}
                        drag="x"
                        dragConstraints={{ left: -200, right: 0 }}
                        dragElastic={0.1}
                        dragDirectionLock
                        onDragStart={() => {
                          setSwipingItemId(item.id);
                          setWasDragging(false);
                        }}
                        onDrag={(event, info: PanInfo) => {
                          // Mark as dragging if moved more than 5px
                          if (Math.abs(info.offset.x) > 5) {
                            setWasDragging(true);
                          }
                        }}
                        onDragEnd={(event, info: PanInfo) => {
                          setSwipingItemId(null);

                          // If swiped more than 120px to the left, delete the item
                          if (info.offset.x < -120) {
                            onRemove(item.id);
                          }

                          // Reset dragging flag after a short delay
                          setTimeout(() => setWasDragging(false), 100);
                        }}
                        onClick={() => {
                          // Don't open modal if user was dragging
                          if (!wasDragging && !isSwipingThis) {
                            openEditModal(item);
                          }
                        }}
                        className="cursor-pointer hover:bg-stone-50 transition-colors relative"
                        style={{
                          backgroundColor: isSwipingThis ? '#fee2e2' : 'white',
                          backgroundImage: isSwipingThis
                            ? 'linear-gradient(to left, #ef4444 0%, transparent 200px)'
                            : undefined,
                        }}
                      >
                        <td className="p-4">
                          <div className="font-semibold text-stone-900 text-base">{item.name}</div>
                          {item.micronutrients && (
                            <div className="text-xs text-stone-400 font-normal mt-1 truncate">
                              {item.micronutrients}
                            </div>
                          )}
                        </td>
                        <td className="p-4 text-right text-stone-500 font-medium">{item.quantity}</td>
                        <td className="p-4 text-right font-bold text-stone-800">{Math.round(item.calories)}</td>
                        <td className="p-4 text-right text-stone-600 font-semibold">{+item.protein.toFixed(1)}g</td>
                      </motion.tr>
                      );
                    })}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
              </motion.div>
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
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-stone-200 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-stone-900">{copy.foodDetails}</h3>
            <p className="mt-2 text-base font-semibold text-stone-700">{editingItem.name}</p>

            {/* Quantity Editor */}
            <div className="mt-5">
              <label className="block text-sm font-medium text-stone-700 mb-2">{copy.qty}</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={quantityNum}
                  onChange={(e) => setQuantityNum(e.target.value)}
                  className="w-24 rounded-xl border border-stone-300 px-3 py-2.5 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-300"
                />
                {quantityUnit && (
                  <span className="text-sm text-stone-600 font-medium">{quantityUnit}</span>
                )}
              </div>
            </div>

            {/* Move to Meal */}
            {mealSections.length > 1 && (
              <div className="mt-5 pt-5 border-t border-stone-100">
                <p className="text-sm font-medium text-stone-700 mb-2 flex items-center gap-1.5">
                  <ArrowRightLeft size={14} className="text-stone-400" />
                  {copy.moveTo}
                </p>
                <div className="flex flex-wrap gap-2">
                  {mealSections
                    .filter(({ meal }) => meal.id !== editingItem.mealId)
                    .map(({ meal }) => {
                      const globalIdx = mealSections.findIndex((s) => s.meal.id === meal.id);
                      return (
                        <button
                          key={meal.id}
                          type="button"
                          onClick={() => {
                            onMoveItem(editingItem.id, meal.id);
                            closeEditModal();
                          }}
                          className="rounded-xl border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100 transition-colors"
                        >
                          {`${copy.meal} ${globalIdx + 1} · ${meal.createdAt.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' })}`}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Macros Grid */}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
                <div className="text-xs font-medium text-orange-700 uppercase tracking-wide">{copy.calories}</div>
                <div className="mt-1 text-2xl font-bold text-orange-900">{editingItem.calories}</div>
                <div className="text-xs text-orange-600 mt-0.5">kcal</div>
              </div>

              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <div className="text-xs font-medium text-red-700 uppercase tracking-wide">{copy.protein}</div>
                <div className="mt-1 text-2xl font-bold text-red-900">{editingItem.protein}</div>
                <div className="text-xs text-red-600 mt-0.5">g</div>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="text-xs font-medium text-amber-700 uppercase tracking-wide">{copy.carbs}</div>
                <div className="mt-1 text-2xl font-bold text-amber-900">{editingItem.carbs}</div>
                <div className="text-xs text-amber-600 mt-0.5">g</div>
              </div>

              <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
                <div className="text-xs font-medium text-sky-700 uppercase tracking-wide">{copy.fat}</div>
                <div className="mt-1 text-2xl font-bold text-sky-900">{editingItem.fat}</div>
                <div className="text-xs text-sky-600 mt-0.5">g</div>
              </div>

              {editingItem.fiber > 0 && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 col-span-2">
                  <div className="text-xs font-medium text-emerald-700 uppercase tracking-wide">{copy.fiber}</div>
                  <div className="mt-1 text-2xl font-bold text-emerald-900">{editingItem.fiber}</div>
                  <div className="text-xs text-emerald-600 mt-0.5">g</div>
                </div>
              )}
            </div>

            {/* Micronutrients */}
            {editingItem.micronutrients && (
              <div className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-4">
                <div className="text-xs font-medium text-stone-700 uppercase tracking-wide mb-2">Micronutrients</div>
                <div className="text-sm text-stone-600">{editingItem.micronutrients}</div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-6 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={deleteEditingItem}
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-100 hover:border-red-300 flex items-center gap-2 transition-colors"
              >
                <Trash2 size={16} />
                {copy.delete}
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-semibold text-stone-600 hover:bg-stone-50 transition-colors"
                >
                  {copy.cancel}
                </button>
                <button
                  type="button"
                  onClick={saveEditedQuantity}
                  disabled={isSaveDisabled}
                  className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-stone-800 transition-colors"
                >
                  {copy.save}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FoodTable;