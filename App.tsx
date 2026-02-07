import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Mic, Info, Sparkles, Home, List, User } from 'lucide-react';
import { GeminiLiveService } from './services/geminiLiveService';
import Visualizer from './components/Visualizer';
import FoodTable from './components/FoodTable';
import Dashboard from './components/Dashboard';
import { FoodItem, DailyStats } from './types';

const App: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [amplitude, setAmplitude] = useState(0);
  const [transcript, setTranscript] = useState("");
  
  // Initialize items from localStorage
  const [items, setItems] = useState<FoodItem[]>(() => {
    try {
      const saved = localStorage.getItem('nutrivoice-items');
      if (saved) {
        return JSON.parse(saved).map((item: any) => ({
          ...item,
          timestamp: new Date(item.timestamp)
        }));
      }
    } catch (e) {
      console.error("Failed to load items from local storage", e);
    }
    return [];
  });

  const [liveService, setLiveService] = useState<GeminiLiveService | null>(null);
  const [error, setError] = useState<string | null>(null);
  const serviceRef = useRef<GeminiLiveService | null>(null);
  const isPointerDownRef = useRef(false);

  // Persist items to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('nutrivoice-items', JSON.stringify(items));
  }, [items]);

  // Calculate stats
  const stats: DailyStats = useMemo(() => {
    return items.reduce((acc, item) => ({
      totalCalories: acc.totalCalories + item.calories,
      totalProtein: acc.totalProtein + item.protein,
      totalCarbs: acc.totalCarbs + item.carbs,
      totalFat: acc.totalFat + item.fat,
      totalFiber: acc.totalFiber + (item.fiber || 0),
    }), { totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0, totalFiber: 0 });
  }, [items]);

  const handleFoodLogged = useCallback((foodData: Omit<FoodItem, 'id' | 'timestamp'>) => {
    setItems(prev => [
      {
        ...foodData,
        id: crypto.randomUUID(),
        timestamp: new Date()
      },
      ...prev
    ]);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const handlePointerDown = useCallback(async (e: React.PointerEvent) => {
    e.preventDefault(); // Prevent text selection etc
    isPointerDownRef.current = true;
    setError(null);
    setTranscript(""); // Clear previous transcript
    
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      setError("API Key not found.");
      return;
    }

    // Initialize Service if needed
    const service = new GeminiLiveService({
      onFoodLogged: handleFoodLogged,
      onAudioData: (amp) => setAmplitude(amp),
      onTranscription: (text) => setTranscript(prev => prev + text),
      onError: (err) => {
        console.error(err);
        setError(err.message);
        setIsRecording(false);
      },
      onClose: () => {
        setIsRecording(false);
        setAmplitude(0);
        serviceRef.current = null;
        setLiveService(null);
      }
    });

    serviceRef.current = service;
    setLiveService(service);
    
    try {
      await service.start();
      
      // Check if user released button while connecting
      if (!isPointerDownRef.current) {
         service.stop();
         return;
      }
      
      setIsRecording(true);
    } catch (e) {
      console.error(e);
      setError("Failed to start service");
    }
  }, [handleFoodLogged]);

  const handlePointerUp = useCallback(() => {
    isPointerDownRef.current = false;
    if (serviceRef.current && isRecording) {
      // Don't kill it immediately, call stopInput to wait for response
      serviceRef.current.stopInput();
    }
  }, [isRecording]);

  // Handle pointer leave in case they drag off the button
  const handlePointerLeave = useCallback(() => {
    if (isPointerDownRef.current) {
       handlePointerUp();
    }
  }, [handlePointerUp]);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 pb-32">
      <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        
        {/* Simple Header */}
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-stone-900">
              NutriVoice
            </h1>
            <p className="text-stone-500 text-sm mt-1">
              {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long'})}
            </p>
          </div>
          <div className="h-10 w-10 bg-stone-200 rounded-full flex items-center justify-center text-stone-500">
             <User size={20} />
          </div>
        </header>

        {/* Error Banner */}
        {error && (
          <div className="mb-6 bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2 border border-red-100 animate-in fade-in slide-in-from-top-2">
            <Info size={16} />
            {error}
          </div>
        )}

        {/* Dashboard & Table Container */}
        <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both">
          <Dashboard stats={stats} />
          <FoodTable items={items} onRemove={removeItem} />
        </div>
      </div>

      {/* Recording Overlay - Shows when holding the mic */}
      {isRecording && (
        <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] flex flex-col justify-end pb-32 items-center pointer-events-none">
           <div className="bg-white/90 backdrop-blur-md shadow-2xl rounded-3xl p-6 w-11/12 max-w-sm mb-4 border border-white/50 animate-in slide-in-from-bottom-10 fade-in zoom-in-95">
              <div className="flex flex-col items-center gap-4 text-center">
                 <div className="flex items-center gap-2 text-orange-600 font-semibold text-sm uppercase tracking-wider">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
                    </span>
                    Listening
                 </div>
                 
                 <Visualizer amplitude={amplitude} active={true} />
                 
                 <p className="text-lg font-medium text-stone-800 min-h-[1.5em]">
                   {transcript || "Speak now..."}
                 </p>
              </div>
           </div>
        </div>
      )}

      {/* Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 h-20 px-6 z-50 flex items-center justify-between shadow-[0_-4px_20px_rgba(0,0,0,0.03)] pb-safe">
        <button className="flex flex-col items-center gap-1 text-stone-400 hover:text-stone-900 transition-colors w-16">
          <Home size={24} strokeWidth={2.5} className="text-stone-900" />
          <span className="text-[10px] font-bold text-stone-900">Today</span>
        </button>

        {/* Central Voice Button */}
        <div className="relative -top-6">
           {isRecording && (
             <div className="absolute inset-0 bg-orange-500 rounded-full animate-ping opacity-20"></div>
           )}
           <button
             onPointerDown={handlePointerDown}
             onPointerUp={handlePointerUp}
             onPointerLeave={handlePointerLeave}
             onContextMenu={(e) => e.preventDefault()}
             className={`
               h-20 w-20 rounded-full flex items-center justify-center transition-all duration-200 shadow-xl border-4 border-stone-50
               ${isRecording 
                 ? 'bg-orange-500 text-white scale-110 shadow-orange-500/30' 
                 : 'bg-stone-900 text-white hover:bg-stone-800 hover:scale-105 active:scale-95'}
             `}
           >
             <Mic size={32} />
           </button>
        </div>

        <button className="flex flex-col items-center gap-1 text-stone-400 hover:text-stone-900 transition-colors w-16">
          <List size={24} strokeWidth={2.5} />
          <span className="text-[10px] font-medium">History</span>
        </button>
      </div>
    </div>
  );
};

export default App;