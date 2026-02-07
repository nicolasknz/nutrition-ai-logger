import React from 'react';
import { FoodItem } from '../types';
import { Trash2 } from 'lucide-react';

interface FoodTableProps {
  items: FoodItem[];
  onRemove: (id: string) => void;
}

const FoodTable: React.FC<FoodTableProps> = ({ items, onRemove }) => {
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
      <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
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
              {items.map((item) => (
                <tr key={item.id} className="group hover:bg-stone-50 transition-colors">
                  <td className="p-5">
                    <div className="font-semibold text-stone-900 text-base">{item.name}</div>
                    {item.micronutrients && (
                      <div className="text-xs text-stone-400 font-normal mt-1 max-w-[200px] truncate">
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
    </div>
  );
};

export default FoodTable;