export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string;
          email: string;
          phone: string | null;
          position: string | null;
          department: string | null;
          role: string;
          permissions: string[];
          locked_permissions: string[];
          is_active: boolean;
          last_login: string | null;
          last_password_change: string | null;
          avatar_initials: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at'> & { created_at?: string };
        Update: Partial<Database['public']['Tables']['profiles']['Row']>;
      };
      teachers: {
        Row: {
          id: string;
          full_name: string;
          phone: string;
          email: string;
          nationality: string;
          joining_date: string | null;
          monthly_salary: number;
          salary_currency: string;
          salary_type: string;
          teaching_market: string;
          specializations: string[];
          status: string;
          level: string;
          notes: string;
          is_deleted: boolean;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['teachers']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<Database['public']['Tables']['teachers']['Row']>;
      };
      session_evaluations: {
        Row: {
          id: string;
          teacher_id: string;
          evaluator_id: string | null;
          evaluator_name: string;
          session_date: string;
          tajweed_accuracy: string;
          pronunciation: string;
          correction_quality: string;
          listening_skills: string;
          punctuality: string;
          time_management: string;
          student_engagement: string;
          class_flow: string;
          professionalism: string;
          clarity: string;
          encouragement: string;
          parent_communication: string;
          lesson_preparation: string;
          explanation_quality: string;
          error_correction: string;
          follow_up: string;
          behavioral_observation: string;
          quick_notes: string[];
          custom_note: string;
          overall_score: number;
          grade: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['session_evaluations']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Database['public']['Tables']['session_evaluations']['Row']>;
      };
      complaints: {
        Row: {
          id: string;
          teacher_id: string;
          reported_by: string;
          description: string;
          status: string;
          priority: string;
          assigned_supervisor: string | null;
          resolution_notes: string | null;
          resolution_date: string | null;
          created_at: string;
          resolved_at: string | null;
          closed_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['complaints']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Database['public']['Tables']['complaints']['Row']>;
      };
      complaint_actions: {
        Row: {
          id: string;
          complaint_id: string;
          status: string;
          note: string;
          by_user: string;
          timestamp: string;
        };
        Insert: Omit<Database['public']['Tables']['complaint_actions']['Row'], 'id' | 'timestamp'> & { id?: string; timestamp?: string };
        Update: Partial<Database['public']['Tables']['complaint_actions']['Row']>;
      };
      improvement_plans: {
        Row: {
          id: string;
          teacher_id: string;
          created_by: string;
          issue: string;
          goal: string;
          action_steps: string;
          target_date: string | null;
          follow_up_date: string | null;
          follow_up_percentage: number;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['improvement_plans']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<Database['public']['Tables']['improvement_plans']['Row']>;
      };
      deductions: {
        Row: {
          id: string;
          teacher_id: string;
          date: string;
          category: string;
          currency: string;
          amount: number;
          percentage: number;
          reason: string;
          supervisor_name: string;
          notes: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['deductions']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Database['public']['Tables']['deductions']['Row']>;
      };
      bonuses: {
        Row: {
          id: string;
          teacher_id: string;
          date: string;
          category: string;
          currency: string;
          amount: number;
          percentage: number;
          reason: string;
          supervisor_name: string;
          notes: string;
          approval_status: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['bonuses']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Database['public']['Tables']['bonuses']['Row']>;
      };
      admin_recommendations: {
        Row: {
          id: string;
          teacher_id: string;
          created_by: string;
          category: string;
          content: string;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['admin_recommendations']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<Database['public']['Tables']['admin_recommendations']['Row']>;
      };
      admin_notes: {
        Row: {
          id: string;
          teacher_id: string;
          created_by: string;
          content: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['admin_notes']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Database['public']['Tables']['admin_notes']['Row']>;
      };
      supervisors: {
        Row: {
          id: string;
          name: string;
          email: string;
          phone: string;
          department: string;
          status: string;
          permissions: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['supervisors']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<Database['public']['Tables']['supervisors']['Row']>;
      };
      activity_logs: {
        Row: {
          id: string;
          user_id: string;
          user_name: string;
          user_role: string;
          action: string;
          target: string;
          details: string;
          before_value: string | null;
          after_value: string | null;
          table_name: string | null;
          record_id: string | null;
          ip: string;
          browser: string;
          device: string;
          timestamp: string;
        };
        Insert: Omit<Database['public']['Tables']['activity_logs']['Row'], 'id' | 'timestamp'> & { id?: string; timestamp?: string };
        Update: Partial<Database['public']['Tables']['activity_logs']['Row']>;
      };
      branding_settings: {
        Row: {
          id: number;
          logo_data_url: string;
          name_ar: string;
          name_en: string;
          tagline: string;
          email: string;
          phone: string;
          whatsapp: string;
          website: string;
          address: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['branding_settings']['Row']>;
        Update: Partial<Database['public']['Tables']['branding_settings']['Row']>;
      };
      salary_records: {
        Row: {
          id: string;
          teacher_id: string;
          month: string;
          base_salary: number;
          currency: string;
          bonus: number;
          deduction: number;
          commission: number;
          net: number;
          notes: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['salary_records']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Database['public']['Tables']['salary_records']['Row']>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
