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
          teacher_type: string;
          branch_id: string | null;
          max_weekly_hours: number | null;
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
          /** GENERAL COMMENT about the evaluation as a whole (migration 001, documented by 024). */
          custom_note: string;
          /**
           * The nine criteria, each with its own score and own optional comment
           * (migration 024). `{}` for a historical evaluation — see
           * src/lib/evaluationCriteria.ts.
           */
          criteria: Json;
          overall_score: number;
          grade: string;
          created_at: string;
        };
        /**
         * Written out rather than derived from Row, because every column on this
         * table carries a DEFAULT and a 9-criteria evaluation deliberately does not
         * write the 16 legacy criterion columns. Deriving the Insert from Row would
         * make all of them required and force the caller to invent sixteen ratings
         * it never collected.
         */
        Insert: {
          id?: string;
          teacher_id: string;
          evaluator_id?: string | null;
          evaluator_name?: string;
          session_date: string;
          tajweed_accuracy?: string;
          pronunciation?: string;
          correction_quality?: string;
          listening_skills?: string;
          punctuality?: string;
          time_management?: string;
          student_engagement?: string;
          class_flow?: string;
          professionalism?: string;
          clarity?: string;
          encouragement?: string;
          parent_communication?: string;
          lesson_preparation?: string;
          explanation_quality?: string;
          error_correction?: string;
          follow_up?: string;
          behavioral_observation?: string;
          quick_notes?: string[];
          custom_note?: string;
          criteria?: Json;
          overall_score?: number;
          grade?: string;
          created_at?: string;
        };
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
          user_id: string | null;
          color_hex: string | null;
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
      branches: {
        Row: {
          id: string;
          name: string;
          timezone: string;
          country: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['branches']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<Database['public']['Tables']['branches']['Row']>;
      };
      parents: {
        Row: {
          id: string;
          branch_id: string | null;
          full_name: string;
          phone: string;
          email: string;
          country: string;
          timezone: string;
          preferred_language: string;
          notes: string;
          is_deleted: boolean;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['parents']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<Database['public']['Tables']['parents']['Row']>;
      };
      students: {
        Row: {
          id: string;
          branch_id: string | null;
          full_name: string;
          date_of_birth: string | null;
          country: string;
          timezone: string;
          gender: string | null;
          level: string;
          status: string;
          enrollment_source: string;
          supervisor_id: string | null;
          is_returning: boolean;
          course_id: string | null;
          notes: string;
          is_deleted: boolean;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['students']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<Database['public']['Tables']['students']['Row']>;
      };
      student_parents: {
        Row: {
          id: string;
          student_id: string;
          parent_id: string;
          relationship: string;
          is_primary_contact: boolean;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['student_parents']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Database['public']['Tables']['student_parents']['Row']>;
      };
      courses: {
        Row: {
          id: string;
          branch_id: string | null;
          name_en: string;
          name_ar: string;
          category: string;
          default_duration_minutes: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['courses']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<Database['public']['Tables']['courses']['Row']>;
      };
      teacher_availability: {
        Row: {
          id: string;
          teacher_id: string;
          day_of_week: number;
          start_minute: number;
          end_minute: number;
          timezone: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['teacher_availability']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<Database['public']['Tables']['teacher_availability']['Row']>;
      };
      shift_templates: {
        Row: {
          id: string;
          branch_id: string | null;
          name: string;
          start_minute: number;
          end_minute: number;
          timezone: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['shift_templates']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<Database['public']['Tables']['shift_templates']['Row']>;
      };
      teacher_shift_assignments: {
        Row: {
          id: string;
          teacher_id: string;
          shift_template_id: string;
          day_of_week: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['teacher_shift_assignments']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<Database['public']['Tables']['teacher_shift_assignments']['Row']>;
      };
      lessons: {
        Row: {
          id: string;
          branch_id: string | null;
          teacher_id: string;
          course_id: string | null;
          day_of_week: number;
          start_minute: number;
          duration_minutes: number;
          end_minute: number;
          timezone: string;
          lifecycle_status: string;
          effective_from: string;
          effective_until: string | null;
          original_teacher_id: string | null;
          same_day_since: string;
          same_time_since: string;
          created_by: string | null;
          notes: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['lessons']['Row'], 'id' | 'end_minute' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<Database['public']['Tables']['lessons']['Row']>;
      };
      lesson_participants: {
        Row: {
          id: string;
          lesson_id: string;
          student_id: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['lesson_participants']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Database['public']['Tables']['lesson_participants']['Row']>;
      };
      lesson_exceptions: {
        Row: {
          id: string;
          lesson_id: string;
          occurrence_date: string;
          status: string;
          override_teacher_id: string | null;
          override_start_minute: number | null;
          override_duration_minutes: number | null;
          attendance_notes: string;
          reason: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['lesson_exceptions']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<Database['public']['Tables']['lesson_exceptions']['Row']>;
      };
    };
    Views: {
      v_teacher_availability_unified: {
        Row: {
          teacher_id: string;
          day_of_week: number;
          start_minute: number;
          end_minute: number;
          timezone: string;
          source: string;
        };
      };
    };
    Functions: {
      check_schedule_conflict: {
        Args: {
          p_teacher_id: string;
          p_student_ids: string[];
          p_day_of_week: number;
          p_start_minute: number;
          p_duration_minutes: number;
          p_exclude_lesson_id?: string | null;
        };
        Returns: Json;
      };
      apply_schedule_change: {
        Args: { p_action: string; p_payload: Json };
        Returns: Json;
      };
      get_teacher_preservation_score: {
        Args: { p_lesson_id: string };
        Returns: Json;
      };
      get_schedule_health_metrics: {
        Args: Record<string, never>;
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
  };
}
