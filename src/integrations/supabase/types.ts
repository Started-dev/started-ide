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
      build_attestations: {
        Row: {
          artifacts_hashes: Json
          attestation_hash: string
          build_run_id: string
          command_hash: string
          created_at: string
          id: string
          logs_hashes: Json
          runner_fingerprint: Json
          snapshot_hash: string
        }
        Insert: {
          artifacts_hashes?: Json
          attestation_hash: string
          build_run_id: string
          command_hash: string
          created_at?: string
          id?: string
          logs_hashes?: Json
          runner_fingerprint?: Json
          snapshot_hash: string
        }
        Update: {
          artifacts_hashes?: Json
          attestation_hash?: string
          build_run_id?: string
          command_hash?: string
          created_at?: string
          id?: string
          logs_hashes?: Json
          runner_fingerprint?: Json
          snapshot_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "build_attestations_build_run_id_fkey"
            columns: ["build_run_id"]
            isOneToOne: true
            referencedRelation: "build_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      build_runs: {
        Row: {
          command: string
          created_at: string
          duration_ms: number | null
          exit_code: number | null
          finished_at: string | null
          id: string
          input_snapshot_id: string | null
          output_snapshot_id: string | null
          project_id: string
          runner_node_id: string | null
          started_at: string | null
          status: string
          stderr_trunc: string | null
          stdout_trunc: string | null
          user_id: string | null
        }
        Insert: {
          command: string
          created_at?: string
          duration_ms?: number | null
          exit_code?: number | null
          finished_at?: string | null
          id?: string
          input_snapshot_id?: string | null
          output_snapshot_id?: string | null
          project_id: string
          runner_node_id?: string | null
          started_at?: string | null
          status?: string
          stderr_trunc?: string | null
          stdout_trunc?: string | null
          user_id?: string | null
        }
        Update: {
          command?: string
          created_at?: string
          duration_ms?: number | null
          exit_code?: number | null
          finished_at?: string | null
          id?: string
          input_snapshot_id?: string | null
          output_snapshot_id?: string | null
          project_id?: string
          runner_node_id?: string | null
          started_at?: string | null
          status?: string
          stderr_trunc?: string | null
          stdout_trunc?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "build_runs_input_snapshot_id_fkey"
            columns: ["input_snapshot_id"]
            isOneToOne: false
            referencedRelation: "ca_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "build_runs_output_snapshot_id_fkey"
            columns: ["output_snapshot_id"]
            isOneToOne: false
            referencedRelation: "ca_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "build_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_blobs: {
        Row: {
          byte_size: number
          content: string
          created_at: string
          hash: string
        }
        Insert: {
          byte_size: number
          content: string
          created_at?: string
          hash: string
        }
        Update: {
          byte_size?: number
          content?: string
          created_at?: string
          hash?: string
        }
        Relationships: []
      }
      ca_path_index: {
        Row: {
          blob_hash: string
          path: string
          project_id: string
          snapshot_id: string
        }
        Insert: {
          blob_hash: string
          path: string
          project_id: string
          snapshot_id: string
        }
        Update: {
          blob_hash?: string
          path?: string
          project_id?: string
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ca_path_index_blob_hash_fkey"
            columns: ["blob_hash"]
            isOneToOne: false
            referencedRelation: "ca_blobs"
            referencedColumns: ["hash"]
          },
          {
            foreignKeyName: "ca_path_index_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_path_index_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "ca_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_refs: {
        Row: {
          id: string
          project_id: string
          ref_name: string
          snapshot_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          project_id: string
          ref_name: string
          snapshot_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          project_id?: string
          ref_name?: string
          snapshot_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ca_refs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_refs_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "ca_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          parent_snapshot_id: string | null
          project_id: string
          root_tree_hash: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          parent_snapshot_id?: string | null
          project_id: string
          root_tree_hash: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          parent_snapshot_id?: string | null
          project_id?: string
          root_tree_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "ca_snapshots_parent_snapshot_id_fkey"
            columns: ["parent_snapshot_id"]
            isOneToOne: false
            referencedRelation: "ca_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_snapshots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_snapshots_root_tree_hash_fkey"
            columns: ["root_tree_hash"]
            isOneToOne: false
            referencedRelation: "ca_trees"
            referencedColumns: ["hash"]
          },
        ]
      }
      ca_trees: {
        Row: {
          created_at: string
          entries: Json
          hash: string
        }
        Insert: {
          created_at?: string
          entries?: Json
          hash: string
        }
        Update: {
          created_at?: string
          entries?: Json
          hash?: string
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
      hook_execution_log: {
        Row: {
          created_at: string
          duration_ms: number | null
          event: string
          hook_id: string | null
          id: string
          input_payload: Json | null
          output_payload: Json | null
          project_id: string
          status: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          event: string
          hook_id?: string | null
          id?: string
          input_payload?: Json | null
          output_payload?: Json | null
          project_id: string
          status?: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          event?: string
          hook_id?: string | null
          id?: string
          input_payload?: Json | null
          output_payload?: Json | null
          project_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "hook_execution_log_hook_id_fkey"
            columns: ["hook_id"]
            isOneToOne: false
            referencedRelation: "project_hooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hook_execution_log_project_id_fkey"
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
      openclaw_installations: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          instance_url: string | null
          logs: string | null
          project_id: string
          slug: string
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          instance_url?: string | null
          logs?: string | null
          project_id: string
          slug: string
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          instance_url?: string | null
          logs?: string | null
          project_id?: string
          slug?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "openclaw_installations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
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
      project_events: {
        Row: {
          actor_id: string | null
          actor_type: string
          created_at: string
          event_type: string
          id: string
          payload: Json
          project_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_type: string
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          project_id: string
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_events_project_id_fkey"
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
      project_hooks: {
        Row: {
          action: string
          command_pattern: string | null
          created_at: string
          enabled: boolean
          event: string
          id: string
          label: string
          project_id: string
          tool_pattern: string
          webhook_url: string | null
        }
        Insert: {
          action?: string
          command_pattern?: string | null
          created_at?: string
          enabled?: boolean
          event?: string
          id?: string
          label: string
          project_id: string
          tool_pattern?: string
          webhook_url?: string | null
        }
        Update: {
          action?: string
          command_pattern?: string | null
          created_at?: string
          enabled?: boolean
          event?: string
          id?: string
          label?: string
          project_id?: string
          tool_pattern?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_hooks_project_id_fkey"
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
      project_webhook_secrets: {
        Row: {
          created_at: string
          id: string
          label: string
          project_id: string
          token: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string
          project_id: string
          token?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          project_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_webhook_secrets_project_id_fkey"
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
      runner_nodes: {
        Row: {
          base_url: string
          capabilities: Json
          created_at: string
          id: string
          last_heartbeat: string | null
          name: string
          pricing: Json
          region: string | null
          status: string
          trust_tier: string
        }
        Insert: {
          base_url: string
          capabilities?: Json
          created_at?: string
          id?: string
          last_heartbeat?: string | null
          name: string
          pricing?: Json
          region?: string | null
          status?: string
          trust_tier?: string
        }
        Update: {
          base_url?: string
          capabilities?: Json
          created_at?: string
          id?: string
          last_heartbeat?: string | null
          name?: string
          pricing?: Json
          region?: string | null
          status?: string
          trust_tier?: string
        }
        Relationships: []
      }
      runner_sessions: {
        Row: {
          created_at: string
          cwd: string | null
          id: string
          project_id: string
          remote_session_id: string
          runner_node_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          cwd?: string | null
          id?: string
          project_id: string
          remote_session_id: string
          runner_node_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          cwd?: string | null
          id?: string
          project_id?: string
          remote_session_id?: string
          runner_node_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "runner_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runner_sessions_runner_node_id_fkey"
            columns: ["runner_node_id"]
            isOneToOne: false
            referencedRelation: "runner_nodes"
            referencedColumns: ["id"]
          },
        ]
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
      increment_usage: {
        Args: {
          _owner_id: string
          _period_end: string
          _period_start: string
          _tokens: number
        }
        Returns: undefined
      }
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
