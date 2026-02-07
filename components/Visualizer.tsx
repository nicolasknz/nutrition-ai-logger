import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  amplitude: number;
  active: boolean;
}

const Visualizer: React.FC<VisualizerProps> = ({ amplitude, active }) => {
  const barsRef = useRef<HTMLDivElement[]>([]);
  
  // Create a nice wave effect based on amplitude
  // We'll render 5 bars that pulse
  return (
    <div className="flex items-end justify-center gap-1 h-12 w-24">
      {[0, 1, 2, 3, 4].map((i) => {
        // Calculate a dynamic height. Center bar is tallest.
        // Base height + (Amplitude * factor)
        // Add some random jitter if active for liveliness
        let height = 10; // min height px
        if (active) {
            const multiplier = i === 2 ? 2.5 : (i === 1 || i === 3) ? 1.8 : 1.2;
            const jitter = Math.random() * 0.2 + 0.9;
            height = Math.min(48, Math.max(8, 10 + (amplitude * 200 * multiplier * jitter)));
        }

        return (
          <div
            key={i}
            className={`w-2 rounded-full transition-all duration-75 ease-out ${active ? 'bg-lime-400 shadow-[0_0_10px_rgba(163,230,53,0.5)]' : 'bg-slate-700'}`}
            style={{ height: `${height}px` }}
          />
        );
      })}
    </div>
  );
};

export default Visualizer;