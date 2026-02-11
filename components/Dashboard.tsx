import React from 'react';
import { DailyStats, NutritionGoals } from '../types';
import { Flame, Beef, Wheat, Droplet, Sprout } from 'lucide-react';

interface DashboardProps {
  stats: DailyStats;
  goals: NutritionGoals;
  language: 'en-US' | 'pt-BR';
}

const StatCard: React.FC<{
  label: string;
  value: number;
  unit: string;
  Icon: React.ElementType;
  colorClass: string;
  target?: number;
  targetLabel: string;
  progressLabel: string;
}> = ({ label, value, unit, Icon, colorClass, target, targetLabel, progressLabel }) => {
  const hasTarget = typeof target === 'number' && Number.isFinite(target) && target > 0;
  const progressPercent = hasTarget ? Math.round((value / target) * 100) : null;
  const progressWidth = hasTarget ? Math.min(100, Math.max(0, (value / target) * 100)) : 0;

  return (
    <div className="bg-white rounded-3xl p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-stone-100 flex flex-col justify-between h-40 relative overflow-hidden group hover:shadow-lg transition-shadow duration-300">
      <div className="flex justify-between items-start z-10">
        <span className="text-stone-500 font-medium text-sm tracking-wide">{label}</span>
        <div className={`p-2 rounded-full ${colorClass.replace('text-', 'bg-')} bg-opacity-10`}>
          <Icon size={18} className={colorClass} />
        </div>
      </div>
      <div className="z-10">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold text-stone-900 tracking-tight">{Math.round(value)}</span>
          <span className="text-sm text-stone-400 font-medium">{unit}</span>
        </div>
        {hasTarget && progressPercent != null && (
          <>
            <p className="text-xs text-stone-400 mt-1 font-medium">{targetLabel}: {target}{unit}</p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-stone-100">
              <div
                className={`h-full rounded-full ${progressPercent > 100 ? 'bg-amber-500' : colorClass.replace('text-', 'bg-')}`}
                style={{ width: `${progressWidth}%` }}
              />
            </div>
            <p className="mt-1 text-xs font-semibold text-stone-500">{progressPercent}% {progressLabel}</p>
          </>
        )}
      </div>
    </div>
  );
};

const Dashboard: React.FC<DashboardProps> = ({ stats, goals, language }) => {
  const isPortuguese = language === 'pt-BR';
  const copy = {
    dailySummary: isPortuguese ? 'Resumo Diario' : 'Daily Summary',
    calories: isPortuguese ? 'Calorias' : 'Calories',
    protein: isPortuguese ? 'Proteina' : 'Protein',
    carbs: isPortuguese ? 'Carboidratos' : 'Carbs',
    fat: isPortuguese ? 'Gordura' : 'Fat',
    fiber: isPortuguese ? 'Fibra' : 'Fiber',
    target: isPortuguese ? 'Meta' : 'Target',
    ofGoal: isPortuguese ? 'da meta' : 'of goal',
  };
  return (
    <div className="w-full">
      <div className="flex justify-between items-end mb-6">
        <h2 className="text-2xl font-bold text-stone-900 tracking-tight">{copy.dailySummary}</h2>
        <span className="text-stone-400 text-sm font-medium">{new Date().toLocaleDateString(language, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard 
          label={copy.calories} 
          value={stats.totalCalories} 
          unit="kcal" 
          Icon={Flame} 
          colorClass="text-orange-500" 
          target={goals.calories}
          targetLabel={copy.target}
          progressLabel={copy.ofGoal}
        />
        <StatCard 
          label={copy.protein} 
          value={stats.totalProtein} 
          unit="g" 
          Icon={Beef} 
          colorClass="text-red-500" 
          target={goals.protein}
          targetLabel={copy.target}
          progressLabel={copy.ofGoal}
        />
        <StatCard 
          label={copy.carbs} 
          value={stats.totalCarbs} 
          unit="g" 
          Icon={Wheat} 
          colorClass="text-amber-500" 
          target={goals.carbs}
          targetLabel={copy.target}
          progressLabel={copy.ofGoal}
        />
        <StatCard 
          label={copy.fat} 
          value={stats.totalFat} 
          unit="g" 
          Icon={Droplet} 
          colorClass="text-sky-500" 
          target={goals.fat}
          targetLabel={copy.target}
          progressLabel={copy.ofGoal}
        />
        <StatCard 
          label={copy.fiber} 
          value={stats.totalFiber} 
          unit="g" 
          Icon={Sprout} 
          colorClass="text-emerald-500" 
          target={goals.fiber}
          targetLabel={copy.target}
          progressLabel={copy.ofGoal}
        />
      </div>
    </div>
  );
};

export default Dashboard;