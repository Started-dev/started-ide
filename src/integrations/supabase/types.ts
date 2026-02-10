export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agent_presets: {
        Row: {
          created_at: string
          default_permissions: Json
          default_tools: Json
          description: string | null
          id: string
          key: string
          name: string
          system_prompt: string
        }
        Insert: {
          created_at?: string
          default_permissions?: Json
          default_tools?: Json
          description?: string | null
          id?: string
          key: string
          name: string
          system_prompt: string
        }
        Update: {
          created_at?: string
          default_permissions?: Json
          default_tools?: Json
          description?: string | null
          id?: string
          key?: string
          name?: string
          system_prompt?: string
        }
        Relationships: []
      }
      agent_runs: {
        Row: {
          created_at: string
          current_step: number
          error_message: string | null
          goal: string
          id: string
          max_steps: number
          preset_key: string | null
          project_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_step?: number
          error_message?: string | null
          goal: string
          id?: string
          max_steps?: number
          preset_key?: string | null
          project_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_step?: number
          error_message?: string | null
          goal?: string
          id?: string
          max_steps?: number
          preset_key?: string | null
          project_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_steps: {
        Row: {
          agent_run_id: string
          created_at: string
          duration_ms: number | null
          id: string
          input: Json | null
          kind: string
          output: Json | null
          status: string
          step_index: number
          title: string
        }
        Insert: {
          agent_run_id: string
          created_at?: string
          duration_ms?: number | null
          id?: string
          input?: Json | null
          kind?: string
          output?: Json | null
          status?: string
          step_index?: number
          title?: string
        }
        Update: {
          agent_run_id?: string
          created_at?: string
          duration_ms?: number | null
          id?: string
          input?: Json | null
          kind?: string
          output?: Json | null
          status?: string
          step_index?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_steps_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      api_usage_ledger: {
        Row: {
          id: string
          mcp_calls: number
          model_tokens: number
          owner_id: string
          period_end: string
          period_start: string
          plan_key: string
          runner_minutes: number
          storage_mb: number
        }
        Insert: {
          id?: string
          mcp_calls?: number
          model_tokens?: number
          owner_id: string
          period_end: string
          period_start: string
          plan_key?: string
          runner_minutes?: number
          storage_mb?: number
        }
        Update: {
          id?: string
          mcp_calls?: number
          model_tokens?: number
          owner_id?: string
          period_end?: string
          period_start?: string
          plan_key?: string
          runner_minutes?: number
          storage_mb?: number
        }
        Relationships: []
      }
      billing_plans: {
        Row: {
          created_at: string
          features: Json
          included_mcp_calls: number
          included_runner_minutes: number
          included_tokens: number
          key: string
          max_concurrent_runs: number
          max_projects: number
          monthly_price_usd: number
        }
        Insert: {
          created_at?: string
          features?: Json
          included_mcp_calls?: number
          included_runner_minutes?: number
          included_tokens?: number
          key: string
          max_concurrent_runs?: number
          max_projects?: number
          monthly_price_usd?: number
        }
        Update: {
          created_at?: string
          features?: Json
          included_mcp_calls?: number
          included_runner_minutes?: number
          included_tokens?: number
          key?: string
          max_concurrent_runs?: number
          max_projects?: number
          monthly_price_usd?: number
        }
        Relationships: []
      }
      collab_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          project_id: string
          user_email: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          project_id: string
          user_email: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          project_id?: string
          user_email?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collab_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          messages: Json
          project_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          messages?: Json
          project_id: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          messages?: Json
          project_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      file_locks: {
        Row: {
          file_path: string
          id: string
          locked_at: string
          locked_by: string
          locked_by_email: string
          project_id: string
        }
        Insert: {
          file_path: string
          id?: string
          locked_at?: string
          locked_by: string
          locked_by_email: string
          project_id: string
        }
        Update: {
          file_path?: string
          id?: string
          locked_at?: string
          locked_by?: string
          locked_by_email?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_locks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      file_snapshots: {
        Row: {
          created_at: string
          files_json: Json
          id: string
          label: string
          project_id: string
        }
        Insert: {
          created_at?: string
          files_json?: Json
          id?: string
          label?: string
          project_id: string
        }
        Update: {
          created_at?: string
          files_json?: Json
          id?: string
          label?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_snapshots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_audit_log: {
        Row: {
          agent_run_id: string | null
          created_at: string
          error: string | null
          id: string
          input_hash: string
          latency_ms: number | null
          output_hash: string | null
          project_id: string
          risk: string
          server_key: string
          status: string
          tool_name: string
          user_id: string | null
        }
        Insert: {
          agent_run_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          input_hash: string
          latency_ms?: number | null
          output_hash?: string | null
          project_id: string
          risk: string
          server_key: string
          status: string
          tool_name: string
          user_id?: string | null
        }
        Update: {
          agent_run_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          input_hash?: string
          latency_ms?: number | null
          output_hash?: string | null
          project_id?: string
          risk?: string
          server_key?: string
          status?: string
          tool_name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mcp_audit_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_permissions: {
        Row: {
          created_at: string
          created_by: string | null
          effect: string
          id: string
          project_id: string
          reason: string | null
          rule_type: string
          subject: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effect: string
          id?: string
          project_id: string
          reason?: string | null
          rule_type: string
          subject: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effect?: string
          id?: string
          project_id?: string
          reason?: string | null
          rule_type?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_permissions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_servers: {
        Row: {
          created_at: string
          default_risk: string
          description: string | null
          homepage_url: string | null
          id: string
          key: string
          name: string
          requires_secrets: boolean
        }
        Insert: {
          created_at?: string
          default_risk?: string
          description?: string | null
          homepage_url?: string | null
          id?: string
          key: string
          name: string
          requires_secrets?: boolean
        }
        Update: {
          created_at?: string
          default_risk?: string
          description?: string | null
          homepage_url?: string | null
          id?: string
          key?: string
          name?: string
          requires_secrets?: boolean
        }
        Relationships: []
      }
      mcp_tools: {
        Row: {
          created_at: string
          description: string | null
          display_name: string | null
          id: string
          input_schema: Json
          is_enabled: boolean
          output_schema: Json
          risk: string
          server_id: string
          tool_name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_name?: string | null
          id?: string
          input_schema?: Json
          is_enabled?: boolean
          output_schema?: Json
          risk?: string
          server_id: string
          tool_name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_name?: string | null
          id?: string
          input_schema?: Json
          is_enabled?: boolean
          output_schema?: Json
          risk?: string
          server_id?: string
          tool_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_tools_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "mcp_servers"
            referencedColumns: ["id"]
          },
        ]
      }
      openclaw_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          payload: Json
          project_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          project_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "openclaw_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_collaborators: {
        Row: {
          accepted: boolean
          created_at: string
          email: string
          id: string
          invited_by: string
          project_id: string
          role: string
          user_id: string
        }
        Insert: {
          accepted?: boolean
          created_at?: string
          email: string
          id?: string
          invited_by: string
          project_id: string
          role?: string
          user_id: string
        }
        Update: {
          accepted?: boolean
          created_at?: string
          email?: string
          id?: string
          invited_by?: string
          project_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_collaborators_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_files: {
        Row: {
          content: string
          path: string
          project_id: string
          updated_at: string
        }
        Insert: {
          content?: string
          path: string
          project_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          path?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_mcp_servers: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_enabled: boolean
          project_id: string
          server_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_enabled?: boolean
          project_id: string
          server_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_enabled?: boolean
          project_id?: string
          server_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_mcp_servers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_mcp_servers_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "mcp_servers"
            referencedColumns: ["id"]
          },
        ]
      }
      project_permissions: {
        Row: {
          created_at: string
          created_by: string | null
          effect: string
          id: string
          project_id: string
          reason: string | null
          rule_type: string
          subject: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effect?: string
          id?: string
          project_id: string
          reason?: string | null
          rule_type?: string
          subject: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effect?: string
          id?: string
          project_id?: string
          reason?: string | null
          rule_type?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_permissions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          runner_session_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
          owner_id: string
          runner_session_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          runner_session_id?: string | null
        }
        Relationships: []
      }
      runs: {
        Row: {
          command: string
          created_at: string
          exit_code: number | null
          id: string
          project_id: string
          status: string
          stderr: string | null
          stdout: string | null
          user_id: string
        }
        Insert: {
          command: string
          created_at?: string
          exit_code?: number | null
          id?: string
          project_id: string
          status?: string
          stderr?: string | null
          stdout?: string | null
          user_id: string
        }
        Update: {
          command?: string
          created_at?: string
          exit_code?: number | null
          id?: string
          project_id?: string
          status?: string
          stderr?: string | null
          stdout?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_project_member: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
