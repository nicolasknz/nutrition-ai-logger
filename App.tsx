import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Mic, Info, Home, List, Target } from 'lucide-react';
import { ProcessAudioService, type ApiDebugInfo } from './services/processAudioService';
import Visualizer from './components/Visualizer';
import FoodTable from './components/FoodTable';
import Dashboard from './components/Dashboard';
import Goals from './components/Goals.tsx';
import AuthScreen from './components/AuthScreen';
import { FoodItem, DailyStats, MealGroup, NutritionGoals } from './types';
import { supabase } from './lib/supabase';
import { nutritionRepository, type NutritionSnapshot } from './data/nutritionRepository';

const isTestingMode = import.meta.env.VITE_TESTING_MODE === 'true';
const ITEMS_STORAGE_KEY = 'nutrivoice-items';
const MEALS_STORAGE_KEY = 'nutrivoice-meals';
const LANGUAGE_STORAGE_KEY = 'nutrivoice-language';
const GOALS_STORAGE_KEY = 'nutrivoice-goals';
const SUPABASE_IMPORT_DONE_KEY = 'nutrivoice-supabase-import-done';
const LANGUAGE_OPTIONS = [
  { code: 'en-US', label: 'English' },
  { code: 'pt-BR', label: 'Portuguese (BR)' },
] as const;
type SupportedLanguageCode = (typeof LANGUAGE_OPTIONS)[number]['code'];
const UI_TEXT = {
  'en-US': {
    languageLabel: 'Language',
    selectLanguageAria: 'Select language',
    startFailed: 'Failed to start service',
    processing: 'Processing...',
    debug: 'Debug:',
    testingModeNoApi: 'Testing mode - no API call (Web Speech only)',
    api: 'API:',
    foods: 'foods',
    testingBadge: 'Testing',
    testingLogTitle: 'Log (what you said - not sent to LLM)',
    testingEmpty: 'Tap mic to start, tap again to stop. Entries appear here.',
    events: 'Events',
    eventsEmpty: 'No events yet. Start and stop recording to see speech lifecycle events.',
    statusStarting: 'Starting',
    statusProcessing: 'Processing',
    statusListening: 'Listening',
    preparingMicrophone: 'Preparing microphone...',
    finalizing: 'Finalizing...',
    speakNow: 'Speak now...',
    today: 'Today',
    history: 'History',
    goals: 'Goals',
    previousDay: 'Previous day',
    nextDay: 'Next day',
    jumpToToday: 'Today',
    noMealsForDate: 'No meals logged for this date.',
    stopVoiceRecording: 'Stop voice recording',
    startVoiceRecording: 'Start voice recording',
  },
  'pt-BR': {
    languageLabel: 'Idioma',
    selectLanguageAria: 'Selecionar idioma',
    startFailed: 'Falha ao iniciar o servico',
    processing: 'Processando...',
    debug: 'Depuracao:',
    testingModeNoApi: 'Modo de teste - sem chamada de API (apenas Web Speech)',
    api: 'API:',
    foods: 'alimentos',
    testingBadge: 'Teste',
    testingLogTitle: 'Log (o que voce disse - nao enviado ao LLM)',
    testingEmpty: 'Toque no microfone para iniciar e toque novamente para parar. As entradas aparecem aqui.',
    events: 'Eventos',
    eventsEmpty: 'Sem eventos ainda. Inicie e pare a gravacao para ver os eventos de fala.',
    statusStarting: 'Iniciando',
    statusProcessing: 'Processando',
    statusListening: 'Ouvindo',
    preparingMicrophone: 'Preparando microfone...',
    finalizing: 'Finalizando...',
    speakNow: 'Fale agora...',
    today: 'Hoje',
    history: 'Historico',
    goals: 'Metas',
    previousDay: 'Dia anterior',
    nextDay: 'Proximo dia',
    jumpToToday: 'Hoje',
    noMealsForDate: 'Nenhuma refeicao registrada nesta data.',
    stopVoiceRecording: 'Parar gravacao de voz',
    startVoiceRecording: 'Iniciar gravacao de voz',
  },
} as const;

type StoredFoodItem = Omit<FoodItem, 'timestamp'> & {
  timestamp: string | Date;
  mealId?: string;
};
type StoredMealGroup = Omit<MealGroup, 'createdAt'> & { createdAt: string | Date };
type AuthMode = 'signIn' | 'signUp';
type AuthAction = AuthMode | 'google' | null;

const formatMealLabel = (date: Date, language: SupportedLanguageCode = 'en-US'): string => {
  const time = date.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' });
  return language === 'pt-BR' ? `Refeicao ${time}` : `Meal ${time}`;
};

const startOfLocalDay = (date: Date): Date => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

const isSameCalendarDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear()
  && a.getMonth() === b.getMonth()
  && a.getDate() === b.getDate();

const parseQuantityAmount = (quantity: string): number | null => {
  const normalized = quantity.trim().toLowerCase();
  if (!normalized) return null;

  const mixedFractionMatch = normalized.match(/(\d+)\s+(\d+)\/(\d+)/);
  if (mixedFractionMatch) {
    const whole = Number(mixedFractionMatch[1]);
    const numerator = Number(mixedFractionMatch[2]);
    const denominator = Number(mixedFractionMatch[3]);
    if (denominator > 0) return whole + numerator / denominator;
  }

  const fractionMatch = normalized.match(/(\d+)\/(\d+)/);
  if (fractionMatch) {
    const numerator = Number(fractionMatch[1]);
    const denominator = Number(fractionMatch[2]);
    if (denominator > 0) return numerator / denominator;
  }

  const decimalMatch = normalized.match(/(\d+(?:[.,]\d+)?)/);
  if (!decimalMatch) return null;

  const value = Number(decimalMatch[1].replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
};

const formatScaledNumber = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(Math.trunc(rounded)) : String(rounded);
};

const scaleMicronutrientsText = (micronutrients: string | undefined, factor: number): string | undefined => {
  if (!micronutrients) return micronutrients;
  return micronutrients.replace(/\d+(?:[.,]\d+)?/g, (raw) => {
    const parsed = Number(raw.replace(',', '.'));
    if (!Number.isFinite(parsed)) return raw;
    return formatScaledNumber(parsed * factor);
  });
};

const scaleFoodNutrition = (item: FoodItem, factor: number): FoodItem => {
  const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
  return {
    ...item,
    calories: Math.max(0, Math.round(item.calories * safeFactor)),
    protein: Math.max(0, Number(formatScaledNumber(item.protein * safeFactor))),
    carbs: Math.max(0, Number(formatScaledNumber(item.carbs * safeFactor))),
    fat: Math.max(0, Number(formatScaledNumber(item.fat * safeFactor))),
    fiber: Math.max(0, Number(formatScaledNumber(item.fiber * safeFactor))),
    micronutrients: scaleMicronutrientsText(item.micronutrients, safeFactor),
  };
};

const loadLocalPersistedData = (): { items: FoodItem[]; meals: MealGroup[] } => {
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
    console.error('Failed to load local items', e);
    return { items: [], meals: [] };
  }
};

const loadLocalPersistedGoals = (): NutritionGoals => {
  try {
    const rawGoals = localStorage.getItem(GOALS_STORAGE_KEY);
    if (!rawGoals) return {};
    const parsed = JSON.parse(rawGoals) as Partial<Record<keyof NutritionGoals, unknown>>;
    const toOptionalNumber = (value: unknown): number | undefined => {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
      return value;
    };

    return {
      calories: toOptionalNumber(parsed.calories),
      protein: toOptionalNumber(parsed.protein),
      carbs: toOptionalNumber(parsed.carbs),
      fat: toOptionalNumber(parsed.fat),
      fiber: toOptionalNumber(parsed.fiber),
    };
  } catch (e) {
    console.error('Failed to load local goals', e);
    return {};
  }
};

const getOAuthRedirectUrl = (): string => {
  const explicitRedirect = import.meta.env.VITE_AUTH_REDIRECT_URL?.trim();
  if (explicitRedirect) return explicitRedirect;
  return `${window.location.origin}/`;
};

const toFriendlyAuthMessage = (rawMessage: string): string => {
  const normalized = rawMessage.toLowerCase();
  if (normalized.includes('invalid login credentials')) return 'Email or password is incorrect.';
  if (normalized.includes('email not confirmed')) return 'Please confirm your email address before signing in.';
  if (normalized.includes('user already registered')) return 'This email is already registered. Try signing in instead.';
  if (normalized.includes('password should be at least')) return 'Your password does not meet the minimum requirements.';
  return rawMessage;
};

const App: React.FC = () => {
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authPendingAction, setAuthPendingAction] = useState<AuthAction>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [amplitude, setAmplitude] = useState(0);
  const [transcript, setTranscript] = useState("");
  /** In testing mode: log of what the user said (no LLM); last entry is most recent. */
  const [testingLog, setTestingLog] = useState<string[]>([]);
  /** In testing mode: low-level speech lifecycle events (start/result/error/end). */
  const [testingEvents, setTestingEvents] = useState<string[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguageCode>(() => {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === 'pt-BR' || stored === 'en-US') return stored;
    return 'en-US';
  });

  const [items, setItems] = useState<FoodItem[]>([]);
  const [meals, setMeals] = useState<MealGroup[]>([]);
  const [goals, setGoals] = useState<NutritionGoals>({});
  const [activeTab, setActiveTab] = useState<'today' | 'history' | 'goals'>('today');
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<Date>(() => startOfLocalDay(new Date()));

  const [liveService, setLiveService] = useState<ProcessAudioService | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Last API result for production debugging (visible on mobile). */
  const [lastDebug, setLastDebug] = useState<ApiDebugInfo | null>(null);
  const serviceRef = useRef<ProcessAudioService | null>(null);
  const isTransitioningRef = useRef(false);
  const lastTranscriptRef = useRef('');
  const activeRecordingMealIdRef = useRef<string | null>(null);
  const recordingFoodsCountRef = useRef(0);
  const t = UI_TEXT[selectedLanguage];

  useEffect(() => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, selectedLanguage);
  }, [selectedLanguage]);

  useEffect(() => {
    let isMounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSessionUserId(data.session?.user.id ?? null);
      setIsAuthLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSessionUserId(nextSession?.user.id ?? null);
      setIsAuthLoading(false);
      if (nextSession?.user) {
        setAuthError(null);
        setAuthNotice(null);
        setAuthPendingAction(null);
      }
    });
    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!sessionUserId) {
      setItems([]);
      setMeals([]);
      setGoals({});
      setIsDataLoading(false);
      return;
    }

    let isMounted = true;
    const loadData = async () => {
      setIsDataLoading(true);
      try {
        let snapshot = await nutritionRepository.loadInitialData(sessionUserId);
        const hasRemoteData = snapshot.items.length > 0 || snapshot.meals.length > 0 || Object.keys(snapshot.goals).length > 0;
        const hasImportedLocally = localStorage.getItem(SUPABASE_IMPORT_DONE_KEY) === 'true';
        if (!hasRemoteData && !hasImportedLocally) {
          const localData = loadLocalPersistedData();
          const localGoals = loadLocalPersistedGoals();
          const localSnapshot: NutritionSnapshot = { items: localData.items, meals: localData.meals, goals: localGoals };
          const hasLocalData =
            localSnapshot.items.length > 0 || localSnapshot.meals.length > 0 || Object.keys(localSnapshot.goals).length > 0;
          if (hasLocalData) {
            await nutritionRepository.importSnapshot(sessionUserId, localSnapshot);
          }
          localStorage.setItem(SUPABASE_IMPORT_DONE_KEY, 'true');
          snapshot = await nutritionRepository.loadInitialData(sessionUserId);
        }
        if (!isMounted) return;
        setItems(snapshot.items);
        setMeals(snapshot.meals);
        setGoals(snapshot.goals);
      } catch (e) {
        console.error(e);
        if (!isMounted) return;
        const message = e instanceof Error ? e.message : 'Failed to load data from Supabase';
        setError(message);
      } finally {
        if (isMounted) setIsDataLoading(false);
      }
    };
    loadData();
    return () => {
      isMounted = false;
    };
  }, [sessionUserId]);

  useEffect(() => {
    setMeals((prevMeals) => {
      const usedMealIds = new Set(items.map((item) => item.mealId));
      const activeMealId = activeRecordingMealIdRef.current;
      const removedMealIds = prevMeals
        .filter((meal) => !usedMealIds.has(meal.id) && meal.id !== activeMealId)
        .map((meal) => meal.id);
      if (sessionUserId && removedMealIds.length > 0) {
        for (const mealId of removedMealIds) {
          void nutritionRepository.deleteMeal(sessionUserId, mealId).catch((e) => {
            console.error(e);
            const message = e instanceof Error ? e.message : 'Failed to clean up empty meal';
            setError(message);
          });
        }
      }
      const nextMeals = prevMeals.filter((meal) => usedMealIds.has(meal.id) || meal.id === activeMealId);
      return nextMeals.length === prevMeals.length ? prevMeals : nextMeals;
    });
  }, [items, sessionUserId]);

  const todayItems = useMemo(() => {
    const today = new Date();
    return items.filter((item) => isSameCalendarDay(item.timestamp, today));
  }, [items]);

  const todayMealIds = useMemo(() => new Set(todayItems.map((item) => item.mealId)), [todayItems]);

  const todayMeals = useMemo(
    () => meals.filter((meal) => todayMealIds.has(meal.id) || meal.isLoading),
    [meals, todayMealIds]
  );

  const historyItems = useMemo(
    () => items.filter((item) => isSameCalendarDay(item.timestamp, selectedHistoryDate)),
    [items, selectedHistoryDate]
  );

  const historyMealIds = useMemo(() => new Set(historyItems.map((item) => item.mealId)), [historyItems]);

  const historyMeals = useMemo(
    () => meals.filter((meal) => historyMealIds.has(meal.id)),
    [meals, historyMealIds]
  );

  const isHistoryDateToday = useMemo(
    () => isSameCalendarDay(selectedHistoryDate, new Date()),
    [selectedHistoryDate]
  );

  const historyDateLabel = useMemo(
    () => selectedHistoryDate.toLocaleDateString(selectedLanguage, { weekday: 'long', month: 'short', day: 'numeric' }),
    [selectedHistoryDate, selectedLanguage]
  );

  const goToPreviousHistoryDay = useCallback(() => {
    setSelectedHistoryDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() - 1);
      return startOfLocalDay(next);
    });
  }, []);

  const goToNextHistoryDay = useCallback(() => {
    setSelectedHistoryDate((prev) => {
      const today = startOfLocalDay(new Date());
      const next = new Date(prev);
      next.setDate(next.getDate() + 1);
      return next > today ? today : startOfLocalDay(next);
    });
  }, []);

  const jumpHistoryToToday = useCallback(() => {
    setSelectedHistoryDate(startOfLocalDay(new Date()));
  }, []);

  // Calculate today's stats
  const stats: DailyStats = useMemo(() => {
    return todayItems.reduce((acc, item) => ({
      totalCalories: acc.totalCalories + item.calories,
      totalProtein: acc.totalProtein + item.protein,
      totalCarbs: acc.totalCarbs + item.carbs,
      totalFat: acc.totalFat + item.fat,
      totalFiber: acc.totalFiber + (item.fiber || 0),
    }), { totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0, totalFiber: 0 });
  }, [todayItems]);

  const createMealGroup = useCallback((createdAt = new Date()): MealGroup => {
    const meal: MealGroup = {
      id: crypto.randomUUID(),
      label: formatMealLabel(createdAt, selectedLanguage),
      createdAt,
    };
    setMeals((prev) => [meal, ...prev]);
    return meal;
  }, [selectedLanguage]);

  const handleFoodLogged = useCallback((foodData: Omit<FoodItem, 'id' | 'timestamp' | 'mealId'>) => {
    let mealId = activeRecordingMealIdRef.current;
    let newlyCreatedMeal: MealGroup | null = null;
    if (!mealId) {
      newlyCreatedMeal = createMealGroup();
      mealId = newlyCreatedMeal.id;
    }
    const newItem: FoodItem = {
      ...foodData,
      id: crypto.randomUUID(),
      mealId,
      timestamp: new Date(),
    };
    recordingFoodsCountRef.current += 1;
    setItems((prev) => [newItem, ...prev]);
    if (!sessionUserId) return;
    void (async () => {
      try {
        if (newlyCreatedMeal) {
          await nutritionRepository.insertMeal(sessionUserId, newlyCreatedMeal);
        }
        await nutritionRepository.insertFoodItem(sessionUserId, newItem);
      } catch (e) {
        console.error(e);
        const message = e instanceof Error ? e.message : 'Failed to save logged food';
        setError(message);
        setItems((prev) => prev.filter((item) => item.id !== newItem.id));
        if (newlyCreatedMeal) {
          setMeals((prev) => prev.filter((meal) => meal.id !== newlyCreatedMeal.id));
        }
      }
    })();
  }, [createMealGroup, sessionUserId]);

  const removeItem = useCallback((id: string) => {
    const previousItems = items;
    const exists = previousItems.some((item) => item.id === id);
    if (!exists) return;
    setItems((prev) => prev.filter((item) => item.id !== id));
    if (!sessionUserId) return;
    void (async () => {
      try {
        await nutritionRepository.deleteFoodItem(sessionUserId, id);
      } catch (e) {
        console.error(e);
        const message = e instanceof Error ? e.message : 'Failed to delete food item';
        setError(message);
        setItems(previousItems);
      }
    })();
  }, [items, sessionUserId]);

  const moveItemToMeal = useCallback((itemId: string, targetMealId: string) => {
    const previousItems = items;
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, mealId: targetMealId }
          : item
      )
    );
    if (!sessionUserId) return;
    void (async () => {
      try {
        await nutritionRepository.updateFoodItem(sessionUserId, itemId, { mealId: targetMealId });
      } catch (e) {
        console.error(e);
        const message = e instanceof Error ? e.message : 'Failed to move food item';
        setError(message);
        setItems(previousItems);
      }
    })();
  }, [items, sessionUserId]);

  const editItemQuantity = useCallback((itemId: string, quantity: string) => {
    const previousItems = items;
    let persistedPatch: Parameters<typeof nutritionRepository.updateFoodItem>[2] | null = null;
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? (() => {
              const previousAmount = parseQuantityAmount(item.quantity);
              const nextAmount = parseQuantityAmount(quantity);
              if (!previousAmount || !nextAmount) {
                persistedPatch = {
                  quantity,
                };
                return { ...item, quantity };
              }
              const factor = nextAmount / previousAmount;
              const scaled = scaleFoodNutrition(item, factor);
              persistedPatch = {
                quantity,
                calories: scaled.calories,
                protein: scaled.protein,
                carbs: scaled.carbs,
                fat: scaled.fat,
                fiber: scaled.fiber,
                micronutrients: scaled.micronutrients,
              };
              return { ...scaled, quantity };
            })()
          : item
      )
    );
    if (!sessionUserId || !persistedPatch) return;
    void (async () => {
      try {
        await nutritionRepository.updateFoodItem(sessionUserId, itemId, persistedPatch ?? { quantity });
      } catch (e) {
        console.error(e);
        const message = e instanceof Error ? e.message : 'Failed to update item quantity';
        setError(message);
        setItems(previousItems);
      }
    })();
  }, [items, sessionUserId]);

  const startRecording = useCallback(async () => {
    if (isTransitioningRef.current || isRecording || isStarting || isProcessing) return;
    if (!sessionUserId) {
      setError('Please sign in before recording.');
      return;
    }
    isTransitioningRef.current = true;
    setError(null);
    setTranscript("");
    setIsStarting(true);
    const recordingMeal = createMealGroup();
    activeRecordingMealIdRef.current = recordingMeal.id;
    recordingFoodsCountRef.current = 0;
    try {
      await nutritionRepository.insertMeal(sessionUserId, recordingMeal);
    } catch (e) {
      console.error(e);
      const message = e instanceof Error ? e.message : 'Failed to create meal';
      setError(message);
      setMeals((prev) => prev.filter((meal) => meal.id !== recordingMeal.id));
      activeRecordingMealIdRef.current = null;
      recordingFoodsCountRef.current = 0;
      setIsStarting(false);
      isTransitioningRef.current = false;
      return;
    }

    const service = new ProcessAudioService({
      testingMode: isTestingMode,
      language: selectedLanguage,
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
          void nutritionRepository
            .updateMealTranscript(sessionUserId, activeMealId, text)
            .catch((updateError) => console.error(updateError));
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
          void nutritionRepository.deleteMeal(sessionUserId, activeMealId).catch((deleteError) => {
            console.error(deleteError);
            const message = deleteError instanceof Error ? deleteError.message : 'Failed to delete empty meal';
            setError(message);
          });
        } else if (activeMealId) {
          setMeals((prev) => prev.map((m) => m.id === activeMealId ? { ...m, isLoading: false } : m));
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
      setError(t.startFailed);
      setIsStarting(false);
      setIsProcessing(false);
      serviceRef.current = null;
      setLiveService(null);
      setMeals((prev) => prev.filter((meal) => meal.id !== recordingMeal.id));
      void nutritionRepository.deleteMeal(sessionUserId, recordingMeal.id).catch((deleteError) => {
        console.error(deleteError);
      });
      activeRecordingMealIdRef.current = null;
      recordingFoodsCountRef.current = 0;
      isTransitioningRef.current = false;
      return;
    } finally {
      setIsStarting(false);
      isTransitioningRef.current = false;
    }
  }, [createMealGroup, handleFoodLogged, isRecording, isStarting, isProcessing, selectedLanguage, sessionUserId, t.startFailed]);

  const stopRecording = useCallback(() => {
    if (isTransitioningRef.current || !serviceRef.current || !isRecording) return;
    isTransitioningRef.current = true;
    setIsRecording(false);
    setIsProcessing(true);
    const activeMealId = activeRecordingMealIdRef.current;
    if (activeMealId) {
      setMeals((prev) => prev.map((m) => m.id === activeMealId ? { ...m, isLoading: true } : m));
    }
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

  const handleGoalsChange = useCallback<React.Dispatch<React.SetStateAction<NutritionGoals>>>((update) => {
    const previousGoals = goals;
    let nextGoals = previousGoals;
    setGoals((prev) => {
      const computed = typeof update === 'function' ? update(prev) : update;
      nextGoals = computed;
      return computed;
    });
    if (!sessionUserId) return;
    void (async () => {
      try {
        await nutritionRepository.upsertGoals(sessionUserId, nextGoals);
      } catch (e) {
        console.error(e);
        const message = e instanceof Error ? e.message : 'Failed to save goals';
        setError(message);
        setGoals(previousGoals);
      }
    })();
  }, [goals, sessionUserId]);

  const handleEmailPasswordAuth = useCallback(async (mode: AuthMode, email: string, password: string) => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) return;
    setAuthPendingAction(mode);
    setAuthError(null);
    setAuthNotice(null);

    if (mode === 'signIn') {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (signInError) {
        setAuthError(toFriendlyAuthMessage(signInError.message));
      }
      setAuthPendingAction(null);
      return;
    }

    const { error: signUpError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
    });
    if (signUpError) {
      setAuthError(toFriendlyAuthMessage(signUpError.message));
      setAuthPendingAction(null);
      return;
    }
    setAuthNotice('Account created. Check your email for a confirmation link before signing in.');
    setAuthPendingAction(null);
  }, []);

  const handleGoogleSignIn = useCallback(async () => {
    setAuthPendingAction('google');
    setAuthError(null);
    setAuthNotice(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getOAuthRedirectUrl(),
      },
    });
    if (oauthError) {
      setAuthError(toFriendlyAuthMessage(oauthError.message));
      setAuthPendingAction(null);
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
    }
  }, []);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-stone-50 text-stone-900 pb-32">
        <div className="max-w-4xl mx-auto px-4 py-12 text-sm text-stone-500">Loading session...</div>
      </div>
    );
  }

  if (!sessionUserId) {
    return (
      <AuthScreen
        onEmailPasswordAuth={handleEmailPasswordAuth}
        onGoogleSignIn={handleGoogleSignIn}
        authError={authError}
        authNotice={authNotice}
        pendingAction={authPendingAction}
      />
    );
  }

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
              {new Date().toLocaleDateString(selectedLanguage, { weekday: 'long', day: 'numeric', month: 'long'})}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="language-select" className="sr-only">
              {t.languageLabel}
            </label>
            <select
              id="language-select"
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value as SupportedLanguageCode)}
              className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300"
              aria-label={t.selectLanguageAria}
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleSignOut}
              className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-600 hover:bg-stone-50"
            >
              Sign out
            </button>
          </div>
        </header>

        {isDataLoading && (
          <div className="mb-4 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-600">
            Syncing your data...
          </div>
        )}

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
              <span><span className="font-semibold">{t.debug}</span> {t.testingModeNoApi}</span>
            ) : lastDebug ? (
              <>
                <span className="font-semibold">{t.api}</span>{' '}
                {lastDebug.status || '—'} {lastDebug.ok ? 'OK' : 'ERR'}
                {' · '}{t.foods}{': '}{lastDebug.foodsCount}
                {lastDebug.payloadBytes != null && ` · payload: ${(lastDebug.payloadBytes / 1024).toFixed(1)} KB`}
                {lastDebug.errorMsg && ` · ${lastDebug.errorMsg}`}
                {(lastDebug.wavMs != null || lastDebug.fetchMs != null) && (
                  <span className="block mt-0.5 text-slate-500">
                    {lastDebug.serverTiming != null && `total: ${lastDebug.serverTiming.totalMs}ms`}
                    {lastDebug.wavMs != null && ` | wav: ${lastDebug.wavMs}ms`}
                    {lastDebug.fetchMs != null && ` | fetch: ${lastDebug.fetchMs}ms`}
                    {lastDebug.parseMs != null && ` | json: ${lastDebug.parseMs}ms`}
                    {lastDebug.serverTiming != null &&
                      ` | gemini: ${lastDebug.serverTiming.geminiMs}ms body: ${lastDebug.serverTiming.bodyMs}ms`}
                  </span>
                )}
              </>
            ) : null}
          </div>
        )}

        {/* Testing mode: log what was said (no LLM) */}
        {isTestingMode && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/80 p-4">
            <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm mb-2">
              <span className="rounded bg-amber-200 px-2 py-0.5">{t.testingBadge}</span>
              {t.testingLogTitle}
            </div>
            <div className="min-h-[4rem] max-h-48 overflow-y-auto rounded-lg bg-white/80 border border-amber-100 p-3 text-sm text-stone-700 font-mono">
              {testingLog.length === 0 ? (
                <span className="text-stone-400">{t.testingEmpty}</span>
              ) : (
                <ul className="space-y-2 list-decimal list-inside">
                  {testingLog.filter(Boolean).map((entry, i) => (
                    <li key={i}>{entry}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mt-3 text-amber-800 font-semibold text-sm">{t.events}</div>
            <div className="mt-2 min-h-[4rem] max-h-52 overflow-y-auto rounded-lg bg-white/80 border border-amber-100 p-3 text-xs text-stone-700 font-mono">
              {testingEvents.length === 0 ? (
                <span className="text-stone-400">{t.eventsEmpty}</span>
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

        {/* Page Content */}
        <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both">
          {activeTab === 'today' && (
            <>
              <Dashboard stats={stats} goals={goals} language={selectedLanguage} />
              <FoodTable
                items={todayItems}
                meals={todayMeals}
                onMoveItem={moveItemToMeal}
                onRemove={removeItem}
                onEditQuantity={editItemQuantity}
                language={selectedLanguage}
              />
            </>
          )}

          {activeTab === 'history' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-stone-800">{historyDateLabel}</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={goToPreviousHistoryDay}
                      className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                    >
                      {t.previousDay}
                    </button>
                    <button
                      type="button"
                      onClick={jumpHistoryToToday}
                      disabled={isHistoryDateToday}
                      className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t.jumpToToday}
                    </button>
                    <button
                      type="button"
                      onClick={goToNextHistoryDay}
                      disabled={isHistoryDateToday}
                      className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t.nextDay}
                    </button>
                  </div>
                </div>
              </div>

              {historyItems.length === 0 && (
                <div className="rounded-2xl border border-stone-200 bg-white px-6 py-4 text-sm text-stone-500">
                  {t.noMealsForDate}
                </div>
              )}

              {historyItems.length > 0 && (
                <FoodTable
                  items={historyItems}
                  meals={historyMeals}
                  onMoveItem={moveItemToMeal}
                  onRemove={removeItem}
                  onEditQuantity={editItemQuantity}
                  language={selectedLanguage}
                />
              )}
            </div>
          )}

          {activeTab === 'goals' && (
            <Goals
              goals={goals}
              onGoalsChange={handleGoalsChange}
              language={selectedLanguage}
            />
          )}
        </div>
      </div>

      {/* Voice status overlay */}
      {(isRecording || isStarting) && (
        <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] flex flex-col justify-end pb-32 items-center pointer-events-none">
           <div className="bg-white/90 backdrop-blur-md shadow-2xl rounded-3xl p-6 w-11/12 max-w-sm mb-4 border border-white/50 animate-in slide-in-from-bottom-10 fade-in zoom-in-95">
              <div className="flex flex-col items-center gap-4 text-center">
                 <div className="flex items-center gap-2 text-orange-600 font-semibold text-sm uppercase tracking-wider">
                    <span className="relative flex h-3 w-3">
                      <span className={`absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75 ${isRecording ? 'animate-ping' : ''}`}></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
                    </span>
                    {isStarting ? t.statusStarting : isProcessing ? t.statusProcessing : t.statusListening}
                 </div>
                 
                 <Visualizer amplitude={amplitude} active={isRecording} />
                 
                 <p className="text-lg font-medium text-stone-800 min-h-[1.5em]">
                  {transcript || (isStarting ? t.preparingMicrophone : isProcessing ? t.finalizing : t.speakNow)}
                 </p>
              </div>
           </div>
        </div>
      )}

      {/* Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 h-20 px-4 z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.03)] pb-safe md:left-1/2 md:right-auto md:w-[560px] md:-translate-x-1/2 md:rounded-t-2xl md:border md:border-stone-200">
        <div className="relative h-full">
          <div className="grid h-full grid-cols-3 items-center">
            <div className="flex items-center justify-start gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('today')}
                className={`flex flex-col items-center gap-1 transition-colors w-16 ${
                  activeTab === 'today'
                    ? 'text-stone-900'
                    : 'text-stone-400 hover:text-stone-900'
                }`}
              >
                <Home size={24} strokeWidth={2.5} className={activeTab === 'today' ? 'text-stone-900' : undefined} />
                <span className={`text-[10px] ${activeTab === 'today' ? 'font-bold text-stone-900' : 'font-medium'}`}>{t.today}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`flex flex-col items-center gap-1 transition-colors w-16 ${
                  activeTab === 'history'
                    ? 'text-stone-900'
                    : 'text-stone-400 hover:text-stone-900'
                }`}
              >
                <List size={24} strokeWidth={2.5} />
                <span className={`text-[10px] ${activeTab === 'history' ? 'font-bold text-stone-900' : 'font-medium'}`}>{t.history}</span>
              </button>
            </div>

            <div />

            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => setActiveTab('goals')}
                className={`flex flex-col items-center gap-1 transition-colors w-16 ${
                  activeTab === 'goals'
                    ? 'text-stone-900'
                    : 'text-stone-400 hover:text-stone-900'
                }`}
              >
                <Target size={24} strokeWidth={2.5} />
                <span className={`text-[10px] ${activeTab === 'goals' ? 'font-bold text-stone-900' : 'font-medium'}`}>{t.goals}</span>
              </button>
            </div>
          </div>

          {/* Central Voice Button */}
          <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-6">
            <div className="relative">
              {isRecording && (
                <div className="absolute inset-0 bg-orange-500 rounded-full animate-ping opacity-20"></div>
              )}
              <button
                type="button"
                onClick={handleVoiceButtonClick}
                onContextMenu={(e) => e.preventDefault()}
                disabled={isStarting || isProcessing}
                aria-label={isRecording ? t.stopVoiceRecording : t.startVoiceRecording}
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;