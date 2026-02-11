import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Mic, Info, Sparkles, Home, List, User } from 'lucide-react';
import { ProcessAudioService, type ApiDebugInfo } from './services/processAudioService';
import Visualizer from './components/Visualizer';
import FoodTable from './components/FoodTable';
import Dashboard from './components/Dashboard';
import { FoodItem, DailyStats, MealGroup } from './types';

const isTestingMode = import.meta.env.VITE_TESTING_MODE === 'true';
const ITEMS_STORAGE_KEY = 'nutrivoice-items';
const MEALS_STORAGE_KEY = 'nutrivoice-meals';

type StoredFoodItem = Omit<FoodItem, 'timestamp'> & {
  timestamp: string | Date;
  mealId?: string;
};
type StoredMealGroup = Omit<MealGroup, 'createdAt'> & { createdAt: string | Date };

const formatMealLabel = (date: Date): string => {
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `Meal ${time}`;
};

const loadPersistedData = (): { items: FoodItem[]; meals: MealGroup[] } => {
  try {
    const rawItems = localStorage.getItem(ITEMS_STORAGE_KEY);
    const parsedItems: StoredFoodItem[] = rawItems ? JSON.parse(rawItems) : [];

    const rawMeals = localStorage.getItem(MEALS_STORAGE_KEY);
    const parsedMeals: StoredMealGroup[] = rawMeals ? JSON.parse(rawMeals) : [];

    const meals: MealGroup[] = parsedMeals.map((meal) => ({
      ...meal,
      createdAt: new Date(meal.createdAt),
    }));

    let legacyMealId: string | null = null;
    const items: FoodItem[] = parsedItems.map((item) => {
      if (!item.mealId) {
        if (!legacyMealId) legacyMealId = crypto.randomUUID();
        return {
          ...item,
          mealId: legacyMealId,
          timestamp: new Date(item.timestamp),
        };
      }

      return {
        ...item,
        mealId: item.mealId,
        timestamp: new Date(item.timestamp),
      };
    });

    if (legacyMealId) {
      meals.push({
        id: legacyMealId,
        label: 'Imported Meal',
        createdAt: new Date(),
      });
    }

    const existingMealIds = new Set(meals.map((meal) => meal.id));
    for (const item of items) {
      if (!existingMealIds.has(item.mealId)) {
        meals.push({
          id: item.mealId,
          label: formatMealLabel(item.timestamp),
          createdAt: item.timestamp,
        });
        existingMealIds.add(item.mealId);
      }
    }

    meals.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return { items, meals };
  } catch (e) {
    console.error('Failed to load items from local storage', e);
    return { items: [], meals: [] };
  }
};

const App: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [amplitude, setAmplitude] = useState(0);
  const [transcript, setTranscript] = useState("");
  /** In testing mode: log of what the user said (no LLM); last entry is most recent. */
  const [testingLog, setTestingLog] = useState<string[]>([]);
  /** In testing mode: low-level speech lifecycle events (start/result/error/end). */
  const [testingEvents, setTestingEvents] = useState<string[]>([]);
  
  const initialData = useMemo(loadPersistedData, []);
  const [items, setItems] = useState<FoodItem[]>(initialData.items);
  const [meals, setMeals] = useState<MealGroup[]>(initialData.meals);

  const [liveService, setLiveService] = useState<ProcessAudioService | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Last API result for production debugging (visible on mobile). */
  const [lastDebug, setLastDebug] = useState<ApiDebugInfo | null>(null);
  const serviceRef = useRef<ProcessAudioService | null>(null);
  const isTransitioningRef = useRef(false);
  const lastTranscriptRef = useRef('');
  const activeRecordingMealIdRef = useRef<string | null>(null);
  const recordingFoodsCountRef = useRef(0);

  // Persist items/meals to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(ITEMS_STORAGE_KEY, JSON.stringify(items));
  }, [items]);
  useEffect(() => {
    localStorage.setItem(MEALS_STORAGE_KEY, JSON.stringify(meals));
  }, [meals]);

  useEffect(() => {
    setMeals((prevMeals) => {
      const usedMealIds = new Set(items.map((item) => item.mealId));
      const activeMealId = activeRecordingMealIdRef.current;
      const nextMeals = prevMeals.filter(
        (meal) => usedMealIds.has(meal.id) || meal.id === activeMealId
      );
      return nextMeals.length === prevMeals.length ? prevMeals : nextMeals;
    });
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

  const createMealGroup = useCallback((createdAt = new Date()): string => {
    const meal: MealGroup = {
      id: crypto.randomUUID(),
      label: formatMealLabel(createdAt),
      createdAt,
    };
    setMeals((prev) => [meal, ...prev]);
    return meal.id;
  }, []);

  const handleFoodLogged = useCallback((foodData: Omit<FoodItem, 'id' | 'timestamp' | 'mealId'>) => {
    const mealId = activeRecordingMealIdRef.current ?? createMealGroup();
    recordingFoodsCountRef.current += 1;
    setItems(prev => [
      {
        ...foodData,
        id: crypto.randomUUID(),
        mealId,
        timestamp: new Date()
      },
      ...prev
    ]);
  }, [createMealGroup]);

  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const moveItemToMeal = useCallback((itemId: string, targetMealId: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, mealId: targetMealId }
          : item
      )
    );
  }, []);

  const startRecording = useCallback(async () => {
    if (isTransitioningRef.current || isRecording || isStarting || isProcessing) return;
    isTransitioningRef.current = true;
    setError(null);
    setTranscript("");
    setIsStarting(true);
    const recordingMealId = createMealGroup();
    activeRecordingMealIdRef.current = recordingMealId;
    recordingFoodsCountRef.current = 0;

    const service = new ProcessAudioService({
      testingMode: isTestingMode,
      onFoodLogged: handleFoodLogged,
      onAudioData: (amp) => setAmplitude(amp),
      onTranscription: (text) => {
        lastTranscriptRef.current = text;
        setTranscript(text);
        const activeMealId = activeRecordingMealIdRef.current;
        if (activeMealId && text.trim()) {
          setMeals((prev) =>
            prev.map((meal) =>
              meal.id === activeMealId
                ? { ...meal, transcriptSnippet: text.trim().slice(0, 120) }
                : meal
            )
          );
        }
      },
      onTestingComplete: (transcript) => {
        setTestingLog(prev => [...prev, transcript].slice(-20));
      },
      onTestingEvent: (event) => {
        const ts = new Date().toLocaleTimeString();
        setTestingEvents(prev => [...prev, `${ts} · ${event}`].slice(-60));
      },
      onError: (err) => {
        console.error(err);
        setError(err.message);
        setIsRecording(false);
        setIsStarting(false);
        setIsProcessing(false);
        isTransitioningRef.current = false;
      },
      onClose: () => {
        const activeMealId = activeRecordingMealIdRef.current;
        if (activeMealId && recordingFoodsCountRef.current === 0) {
          setMeals((prev) => prev.filter((meal) => meal.id !== activeMealId));
        }
        activeRecordingMealIdRef.current = null;
        recordingFoodsCountRef.current = 0;
        lastTranscriptRef.current = '';
        setIsRecording(false);
        setIsStarting(false);
        setIsProcessing(false);
        setAmplitude(0);
        serviceRef.current = null;
        setLiveService(null);
        isTransitioningRef.current = false;
      },
      onDebug: setLastDebug,
    });

    serviceRef.current = service;
    setLiveService(service);
    
    try {
      await service.start();
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(10);
      }
      setIsRecording(true);
    } catch (e) {
      console.error(e);
      setError("Failed to start service");
      setIsStarting(false);
      setIsProcessing(false);
      serviceRef.current = null;
      setLiveService(null);
      setMeals((prev) => prev.filter((meal) => meal.id !== recordingMealId));
      activeRecordingMealIdRef.current = null;
      recordingFoodsCountRef.current = 0;
      isTransitioningRef.current = false;
      return;
    } finally {
      setIsStarting(false);
      isTransitioningRef.current = false;
    }
  }, [createMealGroup, handleFoodLogged, isRecording, isStarting, isProcessing]);

  const stopRecording = useCallback(() => {
    if (isTransitioningRef.current || !serviceRef.current || !isRecording) return;
    isTransitioningRef.current = true;
    setIsRecording(false);
    setIsProcessing(true);
    setTranscript('Processing...');
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(10);
    }
    serviceRef.current.stopInput();
  }, [isRecording]);

  const handleVoiceButtonClick = useCallback(() => {
    if (isRecording) {
      stopRecording();
      return;
    }
    startRecording();
  }, [isRecording, startRecording, stopRecording]);

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

        {/* Debug: last API result (for production mobile testing). In testing mode no API is called. */}
        {(lastDebug || isTestingMode) && (
          <div className="mb-4 rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-xs font-mono text-slate-700">
            {isTestingMode ? (
              <span><span className="font-semibold">Debug:</span> Testing mode — no API call (Web Speech only)</span>
            ) : lastDebug ? (
              <>
                <span className="font-semibold">API:</span>{' '}
                {lastDebug.status || '—'} {lastDebug.ok ? 'OK' : 'ERR'}
                {' · foods: '}{lastDebug.foodsCount}
                {lastDebug.payloadBytes != null && ` · payload: ${(lastDebug.payloadBytes / 1024).toFixed(1)} KB`}
                {lastDebug.errorMsg && ` · ${lastDebug.errorMsg}`}
              </>
            ) : null}
          </div>
        )}

        {/* Testing mode: log what was said (no LLM) */}
        {isTestingMode && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/80 p-4">
            <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm mb-2">
              <span className="rounded bg-amber-200 px-2 py-0.5">Testing</span>
              Log (what you said — not sent to LLM)
            </div>
            <div className="min-h-[4rem] max-h-48 overflow-y-auto rounded-lg bg-white/80 border border-amber-100 p-3 text-sm text-stone-700 font-mono">
              {testingLog.length === 0 ? (
                <span className="text-stone-400">Tap mic to start, tap again to stop. Entries appear here.</span>
              ) : (
                <ul className="space-y-2 list-decimal list-inside">
                  {testingLog.filter(Boolean).map((entry, i) => (
                    <li key={i}>{entry}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mt-3 text-amber-800 font-semibold text-sm">Events</div>
            <div className="mt-2 min-h-[4rem] max-h-52 overflow-y-auto rounded-lg bg-white/80 border border-amber-100 p-3 text-xs text-stone-700 font-mono">
              {testingEvents.length === 0 ? (
                <span className="text-stone-400">No events yet. Start and stop recording to see speech lifecycle events.</span>
              ) : (
                <ul className="space-y-1">
                  {testingEvents.map((entry, i) => (
                    <li key={i}>{entry}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Dashboard & Table Container */}
        <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both">
          <Dashboard stats={stats} />
          <FoodTable items={items} meals={meals} onMoveItem={moveItemToMeal} onRemove={removeItem} />
        </div>
      </div>

      {/* Voice status overlay */}
      {(isRecording || isStarting || isProcessing) && (
        <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] flex flex-col justify-end pb-32 items-center pointer-events-none">
           <div className="bg-white/90 backdrop-blur-md shadow-2xl rounded-3xl p-6 w-11/12 max-w-sm mb-4 border border-white/50 animate-in slide-in-from-bottom-10 fade-in zoom-in-95">
              <div className="flex flex-col items-center gap-4 text-center">
                 <div className="flex items-center gap-2 text-orange-600 font-semibold text-sm uppercase tracking-wider">
                    <span className="relative flex h-3 w-3">
                      <span className={`absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75 ${isRecording ? 'animate-ping' : ''}`}></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
                    </span>
                    {isStarting ? 'Starting' : isProcessing ? 'Processing' : 'Listening'}
                 </div>
                 
                 <Visualizer amplitude={amplitude} active={isRecording} />
                 
                 <p className="text-lg font-medium text-stone-800 min-h-[1.5em]">
                   {transcript || (isStarting ? "Preparing microphone..." : isProcessing ? "Finalizing..." : "Speak now...")}
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
             type="button"
             onClick={handleVoiceButtonClick}
             onContextMenu={(e) => e.preventDefault()}
             disabled={isStarting || isProcessing}
             aria-label={isRecording ? "Stop voice recording" : "Start voice recording"}
             className={`
               h-20 w-20 rounded-full flex items-center justify-center transition-all duration-200 shadow-xl border-4 border-stone-50 touch-manipulation
               ${isRecording 
                 ? 'bg-orange-500 text-white scale-110 shadow-orange-500/30' 
                 : isStarting || isProcessing
                   ? 'bg-stone-500 text-white cursor-not-allowed'
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