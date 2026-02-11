import React from 'react';
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
    placeholder: isPortuguese ? 'Opcional' : 'Optional',
    fieldLabels: {
      calories: isPortuguese ? 'Calorias' : 'Calories',
      protein: isPortuguese ? 'Proteina' : 'Protein',
      carbs: isPortuguese ? 'Carboidratos' : 'Carbs',
      fat: isPortuguese ? 'Gordura' : 'Fat',
      fiber: isPortuguese ? 'Fibra' : 'Fiber',
    } as Record<GoalKey, string>,
  };

  const handleGoalChange = (key: GoalKey, value: string) => {
    onGoalsChange((prev) => {
      const next = { ...prev };
      const trimmed = value.trim();
      if (!trimmed) {
        delete next[key];
        return next;
      }

      const parsed = Number(trimmed.replace(',', '.'));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return prev;
      }

      next[key] = Math.round(parsed * 10) / 10;
      return next;
    });
  };

  const clearGoal = (key: GoalKey) => {
    onGoalsChange((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
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
          onClick={() => onGoalsChange({})}
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
                value={goals[key] ?? ''}
                onChange={(e) => handleGoalChange(key, e.target.value)}
                placeholder={copy.placeholder}
                className="h-11 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-300"
              />
              <span className="w-12 shrink-0 text-xs font-medium text-stone-500">{unit}</span>
              <button
                type="button"
                onClick={() => clearGoal(key)}
                className="rounded-lg border border-stone-200 px-2.5 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50"
              >
                {copy.clear}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default Goals;
