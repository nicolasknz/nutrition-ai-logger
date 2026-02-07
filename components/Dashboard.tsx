import React from 'react';
import { DailyStats } from '../types';
import { Flame, Beef, Wheat, Droplet, Sprout } from 'lucide-react';

interface DashboardProps {
  stats: DailyStats;
}

const StatCard: React.FC<{
  label: string;
  value: number;
  unit: string;
  Icon: React.ElementType;
  colorClass: string;
  target?: number;
}> = ({ label, value, unit, Icon, colorClass, target }) => (
  <div className="bg-white rounded-3xl p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-stone-100 flex flex-col justify-between h-32 relative overflow-hidden group hover:shadow-lg transition-shadow duration-300">
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
      {target && (
        <p className="text-xs text-stone-400 mt-1 font-medium">Target: {target}{unit}</p>
      )}
    </div>
  </div>
);

const Dashboard: React.FC<DashboardProps> = ({ stats }) => {
  return (
    <div className="w-full">
      <div className="flex justify-between items-end mb-6">
        <h2 className="text-2xl font-bold text-stone-900 tracking-tight">Daily Summary</h2>
        <span className="text-stone-400 text-sm font-medium">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard 
          label="Calories" 
          value={stats.totalCalories} 
          unit="kcal" 
          Icon={Flame} 
          colorClass="text-orange-500" 
        />
        <StatCard 
          label="Protein" 
          value={stats.totalProtein} 
          unit="g" 
          Icon={Beef} 
          colorClass="text-red-500" 
          target={150}
        />
        <StatCard 
          label="Carbs" 
          value={stats.totalCarbs} 
          unit="g" 
          Icon={Wheat} 
          colorClass="text-amber-500" 
        />
        <StatCard 
          label="Fat" 
          value={stats.totalFat} 
          unit="g" 
          Icon={Droplet} 
          colorClass="text-sky-500" 
        />
        <StatCard 
          label="Fiber" 
          value={stats.totalFiber} 
          unit="g" 
          Icon={Sprout} 
          colorClass="text-emerald-500" 
        />
      </div>
    </div>
  );
};

export default Dashboard;