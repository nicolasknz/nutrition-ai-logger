export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      meal_groups: {
        Row: {
          id: string;
          user_id: string;
          label: string;
          transcript_snippet: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          label: string;
          transcript_snippet?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          label?: string;
          transcript_snippet?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'meal_groups_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      food_items: {
        Row: {
          id: string;
          user_id: string;
          meal_id: string;
          name: string;
          quantity: string;
          calories: number;
          protein: number;
          carbs: number;
          fat: number;
          fiber: number;
          micronutrients: string | null;
          timestamp: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          meal_id: string;
          name: string;
          quantity: string;
          calories: number;
          protein: number;
          carbs: number;
          fat: number;
          fiber: number;
          micronutrients?: string | null;
          timestamp?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          meal_id?: string;
          name?: string;
          quantity?: string;
          calories?: number;
          protein?: number;
          carbs?: number;
          fat?: number;
          fiber?: number;
          micronutrients?: string | null;
          timestamp?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'food_items_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'food_items_user_meal_fk';
            columns: ['user_id', 'meal_id'];
            referencedRelation: 'meal_groups';
            referencedColumns: ['user_id', 'id'];
          },
        ];
      };
      nutrition_goals: {
        Row: {
          user_id: string;
          calories: number | null;
          protein: number | null;
          carbs: number | null;
          fat: number | null;
          fiber: number | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          calories?: number | null;
          protein?: number | null;
          carbs?: number | null;
          fat?: number | null;
          fiber?: number | null;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          calories?: number | null;
          protein?: number | null;
          carbs?: number | null;
          fat?: number | null;
          fiber?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'nutrition_goals_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
