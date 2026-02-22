import React, { useState, useEffect } from 'react';
import { NutritionGoals } from '../types';

interface GoalsProps {
  goals: NutritionGoals;
  onGoalsChange: React.Dispatch<React.SetStateAction<NutritionGoals>>;
  language: 'en-US' | 'pt-BR';
}

type GoalKey = keyof NutritionGoals;

const goalFields: Array<{ key: GoalKey; unit: string }> = [
  { key: 'calories', unit: 'kcal' },
  { key: 'protein', unit: 'g' },
  { key: 'carbs', unit: 'g' },
  { key: 'fat', unit: 'g' },
  { key: 'fiber', unit: 'g' },
];

const Goals: React.FC<GoalsProps> = ({ goals, onGoalsChange, language }) => {
  const isPortuguese = language === 'pt-BR';
  const copy = {
    title: isPortuguese ? 'Metas Diarias' : 'Daily Goals',
    subtitle: isPortuguese
      ? 'Defina somente as metas que desejar.'
      : 'Set only the goals you want to track.',
    clearAll: isPortuguese ? 'Limpar todas' : 'Clear all',
    clear: isPortuguese ? 'Limpar' : 'Clear',
    save: isPortuguese ? 'Salvar metas' : 'Save goals',
    saved: isPortuguese ? 'Metas salvas!' : 'Goals saved!',
    placeholder: isPortuguese ? 'Opcional' : 'Optional',
    fieldLabels: {
      calories: isPortuguese ? 'Calorias' : 'Calories',
      protein: isPortuguese ? 'Proteina' : 'Protein',
      carbs: isPortuguese ? 'Carboidratos' : 'Carbs',
      fat: isPortuguese ? 'Gordura' : 'Fat',
      fiber: isPortuguese ? 'Fibra' : 'Fiber',
    } as Record<GoalKey, string>,
  };

  const [saved, setSaved] = useState(false);

  const [draft, setDraft] = useState<Record<GoalKey, string>>(() => ({
    calories: goals.calories != null ? String(goals.calories) : '',
    protein: goals.protein != null ? String(goals.protein) : '',
    carbs: goals.carbs != null ? String(goals.carbs) : '',
    fat: goals.fat != null ? String(goals.fat) : '',
    fiber: goals.fiber != null ? String(goals.fiber) : '',
  }));

  // Sync draft when goals are reset externally (e.g. clear all)
  useEffect(() => {
    setDraft({
      calories: goals.calories != null ? String(goals.calories) : '',
      protein: goals.protein != null ? String(goals.protein) : '',
      carbs: goals.carbs != null ? String(goals.carbs) : '',
      fat: goals.fat != null ? String(goals.fat) : '',
      fiber: goals.fiber != null ? String(goals.fiber) : '',
    });
  }, [goals]);

  const handleDraftChange = (key: GoalKey, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const clearDraft = (key: GoalKey) => {
    setDraft((prev) => ({ ...prev, [key]: '' }));
  };

  const handleClearAll = () => {
    setDraft({ calories: '', protein: '', carbs: '', fat: '', fiber: '' });
    onGoalsChange({});
  };

  const handleSubmit = () => {
    const next: NutritionGoals = {};
    for (const { key } of goalFields) {
      const trimmed = draft[key].trim().replace(',', '.');
      if (!trimmed) continue;
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed) && parsed > 0) {
        next[key] = Math.round(parsed * 10) / 10;
      }
    }
    onGoalsChange(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <section className="rounded-3xl bg-white p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-stone-100">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 tracking-tight">{copy.title}</h2>
          <p className="mt-1 text-sm text-stone-500">{copy.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={handleClearAll}
          className="rounded-lg border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50"
        >
          {copy.clearAll}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {goalFields.map(({ key, unit }) => (
          <div key={key} className="rounded-xl border border-stone-200 p-4">
            <label className="mb-2 block text-sm font-semibold text-stone-700" htmlFor={`goal-${key}`}>
              {copy.fieldLabels[key]}
            </label>
            <div className="flex items-center gap-2">
              <input
                id={`goal-${key}`}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.1"
                value={draft[key]}
                onChange={(e) => handleDraftChange(key, e.target.value)}
                placeholder={copy.placeholder}
                className="h-11 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-300"
              />
              <span className="w-12 shrink-0 text-xs font-medium text-stone-500">{unit}</span>
              <button
                type="button"
                onClick={() => clearDraft(key)}
                className="rounded-lg border border-stone-200 px-2.5 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50"
              >
                {copy.clear}
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        className={`mt-6 w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white transition-colors ${saved ? 'bg-emerald-600' : 'bg-stone-900 hover:bg-stone-700 active:bg-stone-800'}`}
      >
        {saved ? copy.saved : copy.save}
      </button>
    </section>
  );
};

export default Goals;
