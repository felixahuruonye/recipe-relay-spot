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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      admin_commands: {
        Row: {
          command: string
          executed_at: string
          id: string
          parameters: Json | null
          result: string | null
          status: string | null
        }
        Insert: {
          command: string
          executed_at?: string
          id?: string
          parameters?: Json | null
          result?: string | null
          status?: string | null
        }
        Update: {
          command?: string
          executed_at?: string
          id?: string
          parameters?: Json | null
          result?: string | null
          status?: string | null
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          created_at: string
          data: Json | null
          id: string
          message: string
          priority: string | null
          status: string | null
          title: string
          type: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: string
          message: string
          priority?: string | null
          status?: string | null
          title: string
          type: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: string
          message?: string
          priority?: string | null
          status?: string | null
          title?: string
          type?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      admin_private_messages: {
        Row: {
          admin_id: string | null
          created_at: string | null
          emoji_reactions: Json | null
          id: string
          is_encrypted: boolean | null
          is_from_admin: boolean | null
          message_content: string
          message_type: string | null
          read_at: string | null
          user_id: string | null
        }
        Insert: {
          admin_id?: string | null
          created_at?: string | null
          emoji_reactions?: Json | null
          id?: string
          is_encrypted?: boolean | null
          is_from_admin?: boolean | null
          message_content: string
          message_type?: string | null
          read_at?: string | null
          user_id?: string | null
        }
        Update: {
          admin_id?: string | null
          created_at?: string | null
          emoji_reactions?: Json | null
          id?: string
          is_encrypted?: boolean | null
          is_from_admin?: boolean | null
          message_content?: string
          message_type?: string | null
          read_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      admin_questions: {
        Row: {
          admin_response: string | null
          answered_at: string | null
          asked_at: string
          id: string
          question: string
          status: string
          user_email: string
          user_id: string
          user_uuid: string | null
        }
        Insert: {
          admin_response?: string | null
          answered_at?: string | null
          asked_at?: string
          id?: string
          question: string
          status?: string
          user_email: string
          user_id: string
          user_uuid?: string | null
        }
        Update: {
          admin_response?: string | null
          answered_at?: string | null
          asked_at?: string
          id?: string
          question?: string
          status?: string
          user_email?: string
          user_id?: string
          user_uuid?: string | null
        }
        Relationships: []
      }
      admin_settings: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          setting_key: string
          setting_type: string | null
          setting_value: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          setting_key: string
          setting_type?: string | null
          setting_value?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          setting_key?: string
          setting_type?: string | null
          setting_value?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      admin_user_messages: {
        Row: {
          created_at: string | null
          id: string
          is_from_admin: boolean | null
          message: string
          reaction: string | null
          read_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_from_admin?: boolean | null
          message: string
          reaction?: string | null
          read_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_from_admin?: boolean | null
          message?: string
          reaction?: string | null
          read_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ads_attachments: {
        Row: {
          ad_id: string | null
          attached_at: string | null
          id: string
          post_id: string
          revenue_generated: number | null
        }
        Insert: {
          ad_id?: string | null
          attached_at?: string | null
          id?: string
          post_id: string
          revenue_generated?: number | null
        }
        Update: {
          ad_id?: string | null
          attached_at?: string | null
          id?: string
          post_id?: string
          revenue_generated?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ads_attachments_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "ads_table"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_table: {
        Row: {
          ad_type: string
          ad_unit_id: string | null
          code_snippet: string | null
          created_at: string | null
          id: string
          media_url: string | null
          status: string | null
        }
        Insert: {
          ad_type: string
          ad_unit_id?: string | null
          code_snippet?: string | null
          created_at?: string | null
          id?: string
          media_url?: string | null
          status?: string | null
        }
        Update: {
          ad_type?: string
          ad_unit_id?: string | null
          code_snippet?: string | null
          created_at?: string | null
          id?: string
          media_url?: string | null
          status?: string | null
        }
        Relationships: []
      }
      balance_history: {
        Row: {
          amount: number
          balance_type: string
          change_type: string
          created_at: string
          description: string | null
          id: string
          previous_amount: number
          reference_id: string | null
          reference_type: string | null
          user_id: string
        }
        Insert: {
          amount: number
          balance_type: string
          change_type: string
          created_at?: string
          description?: string | null
          id?: string
          previous_amount?: number
          reference_id?: string | null
          reference_type?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          balance_type?: string
          change_type?: string
          created_at?: string
          description?: string | null
          id?: string
          previous_amount?: number
          reference_id?: string | null
          reference_type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      challenges: {
        Row: {
          description: string
          ends_at: string
          entries_count: number | null
          entry_fee_ngn: number | null
          id: string
          starts_at: string
          title: string
          winner_id: string | null
        }
        Insert: {
          description: string
          ends_at: string
          entries_count?: number | null
          entry_fee_ngn?: number | null
          id?: string
          starts_at: string
          title: string
          winner_id?: string | null
        }
        Update: {
          description?: string
          ends_at?: string
          entries_count?: number | null
          entry_fee_ngn?: number | null
          id?: string
          starts_at?: string
          title?: string
          winner_id?: string | null
        }
        Relationships: []
      }
      chat_responses: {
        Row: {
          answer: string
          created_at: string
          id: string
          question: string
          source: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          answer: string
          created_at?: string
          id?: string
          question: string
          source: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          answer?: string
          created_at?: string
          id?: string
          question?: string
          source?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      comment_reactions: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_replies: {
        Row: {
          comment_id: string
          content: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          comment_id: string
          content: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          content?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_replies_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_reports: {
        Row: {
          admin_action: string | null
          admin_notes: string | null
          comment_id: string
          created_at: string
          id: string
          reason: string
          reporter_user_id: string
          status: string | null
        }
        Insert: {
          admin_action?: string | null
          admin_notes?: string | null
          comment_id: string
          created_at?: string
          id?: string
          reason: string
          reporter_user_id: string
          status?: string | null
        }
        Update: {
          admin_action?: string | null
          admin_notes?: string | null
          comment_id?: string
          created_at?: string
          id?: string
          reason?: string
          reporter_user_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comment_reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          body: string
          created_at: string
          id: string
          post_id: string
          status: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          post_id: string
          status?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          post_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      crawled_pages: {
        Row: {
          content: string
          crawled_at: string | null
          id: string
          title: string
          url: string
        }
        Insert: {
          content: string
          crawled_at?: string | null
          id?: string
          title: string
          url: string
        }
        Update: {
          content?: string
          crawled_at?: string | null
          id?: string
          title?: string
          url?: string
        }
        Relationships: []
      }
      disputes: {
        Row: {
          admin_response: string | null
          created_at: string
          description: string
          dispute_type: string
          id: string
          resolved_at: string | null
          status: string | null
          user_email: string
          user_id: string | null
        }
        Insert: {
          admin_response?: string | null
          created_at?: string
          description: string
          dispute_type: string
          id?: string
          resolved_at?: string | null
          status?: string | null
          user_email: string
          user_id?: string | null
        }
        Update: {
          admin_response?: string | null
          created_at?: string
          description?: string
          dispute_type?: string
          id?: string
          resolved_at?: string | null
          status?: string | null
          user_email?: string
          user_id?: string | null
        }
        Relationships: []
      }
      followers: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: []
      }
      general_messages: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          message: string
          title: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          message: string
          title: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          message?: string
          title?: string
        }
        Relationships: []
      }
      group_members: {
        Row: {
          group_id: string
          id: string
          joined_at: string
          role: string
          status: string
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string
          role?: string
          status?: string
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_messages: {
        Row: {
          created_at: string
          group_id: string
          id: string
          media_url: string | null
          message: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          media_url?: string | null
          message: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          media_url?: string | null
          message?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          avatar_url: string | null
          created_at: string
          description: string | null
          entry_fee_stars: number | null
          group_type: string
          id: string
          indexable: boolean | null
          is_suspended: boolean | null
          member_count: number | null
          name: string
          owner_id: string
          slug: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          description?: string | null
          entry_fee_stars?: number | null
          group_type?: string
          id?: string
          indexable?: boolean | null
          is_suspended?: boolean | null
          member_count?: number | null
          name: string
          owner_id: string
          slug?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          description?: string | null
          entry_fee_stars?: number | null
          group_type?: string
          id?: string
          indexable?: boolean | null
          is_suspended?: boolean | null
          member_count?: number | null
          name?: string
          owner_id?: string
          slug?: string | null
        }
        Relationships: []
      }
      hidden_posts: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: []
      }
      hot_topics: {
        Row: {
          id: string
          marked_at: string | null
          post_id: string
          reactions_count: number | null
          views_count: number | null
        }
        Insert: {
          id?: string
          marked_at?: string | null
          post_id: string
          reactions_count?: number | null
          views_count?: number | null
        }
        Update: {
          id?: string
          marked_at?: string | null
          post_id?: string
          reactions_count?: number | null
          views_count?: number | null
        }
        Relationships: []
      }
      live_chat_sessions: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          session_data: Json | null
          user_email: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          session_data?: Json | null
          user_email: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          session_data?: Json | null
          user_email?: string
          user_id?: string | null
        }
        Relationships: []
      }
      marketplace_offers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          completion_requirements: string
          created_at: string
          id: string
          offer_description: string
          offer_title: string
          offer_url: string
          reward_amount: number
          status: string
          total_cost: number
          user_id: string
          worker_count: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          completion_requirements: string
          created_at?: string
          id?: string
          offer_description: string
          offer_title: string
          offer_url: string
          reward_amount?: number
          status?: string
          total_cost?: number
          user_id: string
          worker_count?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          completion_requirements?: string
          created_at?: string
          id?: string
          offer_description?: string
          offer_title?: string
          offer_url?: string
          reward_amount?: number
          status?: string
          total_cost?: number
          user_id?: string
          worker_count?: number
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          channel: string
          created_at: string
          delivered: boolean | null
          from_user_id: string
          id: string
          media_url: string | null
          to_user_id: string | null
        }
        Insert: {
          body: string
          channel?: string
          created_at?: string
          delivered?: boolean | null
          from_user_id: string
          id?: string
          media_url?: string | null
          to_user_id?: string | null
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          delivered?: boolean | null
          from_user_id?: string
          id?: string
          media_url?: string | null
          to_user_id?: string | null
        }
        Relationships: []
      }
      music_offers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          artist_name: string
          created_at: string
          id: string
          listen_duration: number
          music_title: string
          music_url: string
          reward_amount: number
          status: string
          total_cost: number
          user_id: string
          worker_count: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          artist_name: string
          created_at?: string
          id?: string
          listen_duration?: number
          music_title: string
          music_url: string
          reward_amount?: number
          status?: string
          total_cost?: number
          user_id: string
          worker_count?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          artist_name?: string
          created_at?: string
          id?: string
          listen_duration?: number
          music_title?: string
          music_url?: string
          reward_amount?: number
          status?: string
          total_cost?: number
          user_id?: string
          worker_count?: number
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          data: Json | null
          id: string
          is_read: boolean | null
          message: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean | null
          message: string
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean | null
          message?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          amount_ngn: number
          buyer_user_id: string
          created_at: string
          id: string
          product_id: string
          seller_user_id: string
          shipping_address: string | null
          status: string
          txn_id: string | null
        }
        Insert: {
          amount_ngn: number
          buyer_user_id: string
          created_at?: string
          id?: string
          product_id: string
          seller_user_id: string
          shipping_address?: string | null
          status?: string
          txn_id?: string | null
        }
        Update: {
          amount_ngn?: number
          buyer_user_id?: string
          created_at?: string
          id?: string
          product_id?: string
          seller_user_id?: string
          shipping_address?: string | null
          status?: string
          txn_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_txn_id_fkey"
            columns: ["txn_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_requests: {
        Row: {
          account_info: Json
          admin_notes: string | null
          amount: number
          countdown_end: string | null
          created_at: string | null
          currency_symbol: string | null
          id: string
          payment_method: string
          processed_at: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          account_info: Json
          admin_notes?: string | null
          amount: number
          countdown_end?: string | null
          created_at?: string | null
          currency_symbol?: string | null
          id?: string
          payment_method: string
          processed_at?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          account_info?: Json
          admin_notes?: string | null
          amount?: number
          countdown_end?: string | null
          created_at?: string | null
          currency_symbol?: string | null
          id?: string
          payment_method?: string
          processed_at?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          payment_type: string
          paystack_reference: string | null
          processed_at: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          payment_type: string
          paystack_reference?: string | null
          processed_at?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          payment_type?: string
          paystack_reference?: string | null
          processed_at?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      post_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          is_edited: boolean | null
          is_hidden: boolean | null
          post_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_edited?: boolean | null
          is_hidden?: boolean | null
          post_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_edited?: boolean | null
          is_hidden?: boolean | null
          post_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reports: {
        Row: {
          admin_action: string | null
          admin_notes: string | null
          created_at: string
          id: string
          post_id: string
          reason: string
          reporter_user_id: string
          status: string | null
        }
        Insert: {
          admin_action?: string | null
          admin_notes?: string | null
          created_at?: string
          id?: string
          post_id: string
          reason: string
          reporter_user_id: string
          status?: string | null
        }
        Update: {
          admin_action?: string | null
          admin_notes?: string | null
          created_at?: string
          id?: string
          post_id?: string
          reason?: string
          reporter_user_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_shares: {
        Row: {
          created_at: string
          id: string
          post_id: string
          share_type: string
          target_group_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          share_type: string
          target_group_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          share_type?: string
          target_group_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_shares_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_shares_target_group_id_fkey"
            columns: ["target_group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      post_views: {
        Row: {
          id: string
          post_id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          id?: string
          post_id: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          id?: string
          post_id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_views_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          ad_attached: boolean | null
          admin_action: string | null
          body: string
          boost_until: string | null
          boosted: boolean | null
          category: string
          comments_count: number | null
          created_at: string
          disabled: boolean | null
          featured_rank: number | null
          group_id: string | null
          id: string
          likes_count: number | null
          media_type: string | null
          media_urls: string[] | null
          post_status: string | null
          rating: number | null
          reports_count: number | null
          requires_approval: boolean | null
          star_price: number | null
          star_price_paid: number | null
          status: string
          thumbnail_url: string | null
          title: string
          uploader_id: string | null
          user_id: string
          view_count: number | null
        }
        Insert: {
          ad_attached?: boolean | null
          admin_action?: string | null
          body: string
          boost_until?: string | null
          boosted?: boolean | null
          category?: string
          comments_count?: number | null
          created_at?: string
          disabled?: boolean | null
          featured_rank?: number | null
          group_id?: string | null
          id?: string
          likes_count?: number | null
          media_type?: string | null
          media_urls?: string[] | null
          post_status?: string | null
          rating?: number | null
          reports_count?: number | null
          requires_approval?: boolean | null
          star_price?: number | null
          star_price_paid?: number | null
          status?: string
          thumbnail_url?: string | null
          title: string
          uploader_id?: string | null
          user_id: string
          view_count?: number | null
        }
        Update: {
          ad_attached?: boolean | null
          admin_action?: string | null
          body?: string
          boost_until?: string | null
          boosted?: boolean | null
          category?: string
          comments_count?: number | null
          created_at?: string
          disabled?: boolean | null
          featured_rank?: number | null
          group_id?: string | null
          id?: string
          likes_count?: number | null
          media_type?: string | null
          media_urls?: string[] | null
          post_status?: string | null
          rating?: number | null
          reports_count?: number | null
          requires_approval?: boolean | null
          star_price?: number | null
          star_price_paid?: number | null
          status?: string
          thumbnail_url?: string | null
          title?: string
          uploader_id?: string | null
          user_id?: string
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      private_messages: {
        Row: {
          created_at: string
          from_user_id: string
          id: string
          is_deleted: boolean | null
          media_url: string | null
          message: string
          read_at: string | null
          to_user_id: string
        }
        Insert: {
          created_at?: string
          from_user_id: string
          id?: string
          is_deleted?: boolean | null
          media_url?: string | null
          message: string
          read_at?: string | null
          to_user_id: string
        }
        Update: {
          created_at?: string
          from_user_id?: string
          id?: string
          is_deleted?: boolean | null
          media_url?: string | null
          message?: string
          read_at?: string | null
          to_user_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          created_at: string
          delivery_options: string | null
          description: string
          featured: boolean | null
          id: string
          images: string[] | null
          price_ngn: number
          seller_contact: string | null
          seller_user_id: string
          status: string
          stock: number | null
          title: string
        }
        Insert: {
          created_at?: string
          delivery_options?: string | null
          description: string
          featured?: boolean | null
          id?: string
          images?: string[] | null
          price_ngn: number
          seller_contact?: string | null
          seller_user_id: string
          status?: string
          stock?: number | null
          title: string
        }
        Update: {
          created_at?: string
          delivery_options?: string | null
          description?: string
          featured?: boolean | null
          id?: string
          images?: string[] | null
          price_ngn?: number
          seller_contact?: string | null
          seller_user_id?: string
          status?: string
          stock?: number | null
          title?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          referral_code: string
          referred_email: string
          referrer_email: string
          referrer_id: string | null
          reward_amount: number | null
          status: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          referral_code: string
          referred_email: string
          referrer_email: string
          referrer_id?: string | null
          reward_amount?: number | null
          status?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          referral_code?: string
          referred_email?: string
          referrer_email?: string
          referrer_id?: string | null
          reward_amount?: number | null
          status?: string | null
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          handled_by: string | null
          id: string
          outcome: string | null
          reason: string
          reporter_user_id: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          handled_by?: string | null
          id?: string
          outcome?: string | null
          reason: string
          reporter_user_id: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          handled_by?: string | null
          id?: string
          outcome?: string | null
          reason?: string
          reporter_user_id?: string
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      review_requests: {
        Row: {
          admin_notes: string | null
          created_at: string | null
          id: string
          message: string | null
          request_type: string
          resolved_at: string | null
          status: string | null
          story_id: string | null
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string | null
          id?: string
          message?: string | null
          request_type: string
          resolved_at?: string | null
          status?: string | null
          story_id?: string | null
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          created_at?: string | null
          id?: string
          message?: string | null
          request_type?: string
          resolved_at?: string | null
          status?: string | null
          story_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_requests_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "user_storylines"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_searches: {
        Row: {
          created_at: string | null
          id: string
          query: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          query: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          query?: string
          user_id?: string | null
        }
        Relationships: []
      }
      search_trends: {
        Row: {
          created_at: string | null
          daily_count: number | null
          hourly_count: number | null
          id: string
          keyword: string
          last_search_at: string | null
          monthly_count: number | null
          search_count: number | null
          search_date: string | null
          weekly_count: number | null
        }
        Insert: {
          created_at?: string | null
          daily_count?: number | null
          hourly_count?: number | null
          id?: string
          keyword: string
          last_search_at?: string | null
          monthly_count?: number | null
          search_count?: number | null
          search_date?: string | null
          weekly_count?: number | null
        }
        Update: {
          created_at?: string | null
          daily_count?: number | null
          hourly_count?: number | null
          id?: string
          keyword?: string
          last_search_at?: string | null
          monthly_count?: number | null
          search_count?: number | null
          search_date?: string | null
          weekly_count?: number | null
        }
        Relationships: []
      }
      star_market: {
        Row: {
          created_at: string | null
          id: string
          note: string | null
          price_naira: number
          price_usd: number
          purchase_url: string | null
          stars: number
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          note?: string | null
          price_naira: number
          price_usd: number
          purchase_url?: string | null
          stars: number
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          note?: string | null
          price_naira?: number
          price_usd?: number
          purchase_url?: string | null
          stars?: number
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      star_packages: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          price_naira: number
          purchase_url: string | null
          stars: number
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          price_naira: number
          purchase_url?: string | null
          stars: number
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          price_naira?: number
          purchase_url?: string | null
          stars?: number
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      star_rates: {
        Row: {
          created_at: string | null
          id: string
          price_naira: number
          price_usd: number
          stars: number
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          price_naira: number
          price_usd: number
          stars: number
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          price_naira?: number
          price_usd?: number
          stars?: number
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      sticker_usage: {
        Row: {
          created_at: string | null
          id: string
          sticker_id: string | null
          story_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          sticker_id?: string | null
          story_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          sticker_id?: string | null
          story_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sticker_usage_sticker_id_fkey"
            columns: ["sticker_id"]
            isOneToOne: false
            referencedRelation: "stickers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sticker_usage_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "user_storylines"
            referencedColumns: ["id"]
          },
        ]
      }
      stickers: {
        Row: {
          created_at: string | null
          creator_id: string | null
          id: string
          image_url: string
          is_featured: boolean | null
          star_price: number | null
          status: string | null
          tags: string[] | null
          title: string
          usage_count: number | null
        }
        Insert: {
          created_at?: string | null
          creator_id?: string | null
          id?: string
          image_url: string
          is_featured?: boolean | null
          star_price?: number | null
          status?: string | null
          tags?: string[] | null
          title: string
          usage_count?: number | null
        }
        Update: {
          created_at?: string | null
          creator_id?: string | null
          id?: string
          image_url?: string
          is_featured?: boolean | null
          star_price?: number | null
          status?: string | null
          tags?: string[] | null
          title?: string
          usage_count?: number | null
        }
        Relationships: []
      }
      story_transactions: {
        Row: {
          created_at: string | null
          id: string
          platform_earn: number
          stars_spent: number
          story_id: string | null
          uploader_earn: number
          uploader_id: string | null
          viewer_earn: number
          viewer_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          platform_earn: number
          stars_spent: number
          story_id?: string | null
          uploader_earn: number
          uploader_id?: string | null
          viewer_earn: number
          viewer_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          platform_earn?: number
          stars_spent?: number
          story_id?: string | null
          uploader_earn?: number
          uploader_id?: string | null
          viewer_earn?: number
          viewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "story_transactions_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "user_storylines"
            referencedColumns: ["id"]
          },
        ]
      }
      story_views: {
        Row: {
          id: string
          stars_spent: number | null
          story_id: string | null
          viewed_at: string | null
          viewer_id: string | null
        }
        Insert: {
          id?: string
          stars_spent?: number | null
          story_id?: string | null
          viewed_at?: string | null
          viewer_id?: string | null
        }
        Update: {
          id?: string
          stars_spent?: number | null
          story_id?: string | null
          viewed_at?: string | null
          viewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "story_views_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "user_storylines"
            referencedColumns: ["id"]
          },
        ]
      }
      storyline_comments: {
        Row: {
          comment: string
          created_at: string
          id: string
          storyline_id: string
          user_id: string
        }
        Insert: {
          comment: string
          created_at?: string
          id?: string
          storyline_id: string
          user_id: string
        }
        Update: {
          comment?: string
          created_at?: string
          id?: string
          storyline_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "storyline_comments_storyline_id_fkey"
            columns: ["storyline_id"]
            isOneToOne: false
            referencedRelation: "user_storylines"
            referencedColumns: ["id"]
          },
        ]
      }
      storyline_reactions: {
        Row: {
          created_at: string
          id: string
          reaction_type: string
          storyline_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reaction_type?: string
          storyline_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reaction_type?: string
          storyline_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "storyline_reactions_storyline_id_fkey"
            columns: ["storyline_id"]
            isOneToOne: false
            referencedRelation: "user_storylines"
            referencedColumns: ["id"]
          },
        ]
      }
      system_errors: {
        Row: {
          created_at: string | null
          error_data: Json | null
          error_message: string
          error_type: string
          id: string
          ip_address: string | null
          resolved_at: string | null
          severity: string | null
          stack_trace: string | null
          status: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          error_data?: Json | null
          error_message: string
          error_type: string
          id?: string
          ip_address?: string | null
          resolved_at?: string | null
          severity?: string | null
          stack_trace?: string | null
          status?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          error_data?: Json | null
          error_message?: string
          error_type?: string
          id?: string
          ip_address?: string | null
          resolved_at?: string | null
          severity?: string | null
          stack_trace?: string | null
          status?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      task_completions: {
        Row: {
          amount_earned: number
          completed_at: string
          declined_reason: string | null
          id: string
          status: string
          task_id: string | null
          task_reference_id: string | null
          task_title: string
          task_type: string
          user_id: string
        }
        Insert: {
          amount_earned?: number
          completed_at?: string
          declined_reason?: string | null
          id?: string
          status?: string
          task_id?: string | null
          task_reference_id?: string | null
          task_title: string
          task_type?: string
          user_id: string
        }
        Update: {
          amount_earned?: number
          completed_at?: string
          declined_reason?: string | null
          id?: string
          status?: string
          task_id?: string | null
          task_reference_id?: string | null
          task_title?: string
          task_type?: string
          user_id?: string
        }
        Relationships: []
      }
      task_submissions: {
        Row: {
          approval_type: string | null
          approved_at: string | null
          currency_symbol: string
          id: string
          reward_amount: number
          status: string
          submitted_at: string
          task_id: string | null
          user_email: string | null
          user_id: string
        }
        Insert: {
          approval_type?: string | null
          approved_at?: string | null
          currency_symbol?: string
          id?: string
          reward_amount?: number
          status?: string
          submitted_at?: string
          task_id?: string | null
          user_email?: string | null
          user_id: string
        }
        Update: {
          approval_type?: string | null
          approved_at?: string | null
          currency_symbol?: string
          id?: string
          reward_amount?: number
          status?: string
          submitted_at?: string
          task_id?: string | null
          user_email?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          category: string
          created_at: string
          id: string
          instructions: string
          review_time: number
          reward_amount: number
          status: string
          task_description: string
          task_link: string
          task_name: string
          total_cost: number
          user_id: string
          worker_count: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          category: string
          created_at?: string
          id?: string
          instructions: string
          review_time?: number
          reward_amount?: number
          status?: string
          task_description: string
          task_link: string
          task_name: string
          total_cost?: number
          user_id: string
          worker_count?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          category?: string
          created_at?: string
          id?: string
          instructions?: string
          review_time?: number
          reward_amount?: number
          status?: string
          task_description?: string
          task_link?: string
          task_name?: string
          total_cost?: number
          user_id?: string
          worker_count?: number
        }
        Relationships: []
      }
      telegram_messages: {
        Row: {
          chat_id: string
          created_at: string
          id: string
          message_text: string
          message_type: string | null
          processed: boolean | null
          user_id: string | null
        }
        Insert: {
          chat_id: string
          created_at?: string
          id?: string
          message_text: string
          message_type?: string | null
          processed?: boolean | null
          user_id?: string | null
        }
        Update: {
          chat_id?: string
          created_at?: string
          id?: string
          message_text?: string
          message_type?: string | null
          processed?: boolean | null
          user_id?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount_ngn: number
          created_at: string
          id: string
          metadata: Json | null
          paystack_ref: string | null
          status: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_ngn: number
          created_at?: string
          id?: string
          metadata?: Json | null
          paystack_ref?: string | null
          status?: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_ngn?: number
          created_at?: string
          id?: string
          metadata?: Json | null
          paystack_ref?: string | null
          status?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_activity_logs: {
        Row: {
          activity_data: Json | null
          activity_type: string
          created_at: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          activity_data?: Json | null
          activity_type: string
          created_at?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          activity_data?: Json | null
          activity_type?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_balances: {
        Row: {
          available_balance: number
          checkin_balance: number
          created_at: string
          currency_code: string
          deposit_balance: number
          id: string
          total_balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          available_balance?: number
          checkin_balance?: number
          created_at?: string
          currency_code?: string
          deposit_balance?: number
          id?: string
          total_balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          available_balance?: number
          checkin_balance?: number
          created_at?: string
          currency_code?: string
          deposit_balance?: number
          id?: string
          total_balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_bank_details: {
        Row: {
          bank_account_name: string
          bank_account_number: string
          bank_name: string
          created_at: string
          email: string
          id: string
          updated_at: string
          user_id: string
          user_uuid: string | null
        }
        Insert: {
          bank_account_name: string
          bank_account_number: string
          bank_name: string
          created_at?: string
          email: string
          id?: string
          updated_at?: string
          user_id: string
          user_uuid?: string | null
        }
        Update: {
          bank_account_name?: string
          bank_account_number?: string
          bank_name?: string
          created_at?: string
          email?: string
          id?: string
          updated_at?: string
          user_id?: string
          user_uuid?: string | null
        }
        Relationships: []
      }
      user_checkins: {
        Row: {
          checkin_date: string
          created_at: string
          id: string
          reward_amount: number | null
          user_id: string | null
        }
        Insert: {
          checkin_date?: string
          created_at?: string
          id?: string
          reward_amount?: number | null
          user_id?: string | null
        }
        Update: {
          checkin_date?: string
          created_at?: string
          id?: string
          reward_amount?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_feedback: {
        Row: {
          feedback_text: string
          id: string
          submitted_at: string
          user_email: string
          user_id: string
          user_uuid: string | null
        }
        Insert: {
          feedback_text: string
          id?: string
          submitted_at?: string
          user_email: string
          user_id: string
          user_uuid?: string | null
        }
        Update: {
          feedback_text?: string
          id?: string
          submitted_at?: string
          user_email?: string
          user_id?: string
          user_uuid?: string | null
        }
        Relationships: []
      }
      user_login_history: {
        Row: {
          device_info: Json | null
          id: string
          ip_address: string | null
          location_info: Json | null
          login_timestamp: string | null
          session_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          device_info?: Json | null
          id?: string
          ip_address?: string | null
          location_info?: Json | null
          login_timestamp?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          device_info?: Json | null
          id?: string
          ip_address?: string | null
          location_info?: Json | null
          login_timestamp?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_notifications: {
        Row: {
          action_data: Json | null
          created_at: string
          emoji_reactions: Json | null
          expires_at: string | null
          id: string
          is_read_receipt: boolean | null
          message: string
          notification_category: string | null
          related_id: string | null
          status: string | null
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          action_data?: Json | null
          created_at?: string
          emoji_reactions?: Json | null
          expires_at?: string | null
          id?: string
          is_read_receipt?: boolean | null
          message: string
          notification_category?: string | null
          related_id?: string | null
          status?: string | null
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          action_data?: Json | null
          created_at?: string
          emoji_reactions?: Json | null
          expires_at?: string | null
          id?: string
          is_read_receipt?: boolean | null
          message?: string
          notification_category?: string | null
          related_id?: string | null
          status?: string | null
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          age: number | null
          ai_credits: number | null
          analytics_last_seen: string | null
          avatar_url: string | null
          bio: string | null
          created_at: string
          device_id: string | null
          follower_count: number | null
          following_count: number | null
          full_name: string | null
          id: string
          is_online: boolean | null
          is_suspended: boolean | null
          is_vip: boolean | null
          last_seen: string | null
          post_count: number | null
          post_count_free: number | null
          saved_searches: Json | null
          star_balance: number | null
          story_settings: Json | null
          suspended_at: string | null
          suspension_reason: string | null
          total_earned: number | null
          total_reactions: number | null
          updated_at: string
          username: string
          vip: boolean | null
          vip_days: number | null
          vip_expires_at: string | null
          vip_post_count: number | null
          vip_started_at: string | null
          voice_credits: number | null
          wallet_balance: number | null
        }
        Insert: {
          age?: number | null
          ai_credits?: number | null
          analytics_last_seen?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          device_id?: string | null
          follower_count?: number | null
          following_count?: number | null
          full_name?: string | null
          id: string
          is_online?: boolean | null
          is_suspended?: boolean | null
          is_vip?: boolean | null
          last_seen?: string | null
          post_count?: number | null
          post_count_free?: number | null
          saved_searches?: Json | null
          star_balance?: number | null
          story_settings?: Json | null
          suspended_at?: string | null
          suspension_reason?: string | null
          total_earned?: number | null
          total_reactions?: number | null
          updated_at?: string
          username: string
          vip?: boolean | null
          vip_days?: number | null
          vip_expires_at?: string | null
          vip_post_count?: number | null
          vip_started_at?: string | null
          voice_credits?: number | null
          wallet_balance?: number | null
        }
        Update: {
          age?: number | null
          ai_credits?: number | null
          analytics_last_seen?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          device_id?: string | null
          follower_count?: number | null
          following_count?: number | null
          full_name?: string | null
          id?: string
          is_online?: boolean | null
          is_suspended?: boolean | null
          is_vip?: boolean | null
          last_seen?: string | null
          post_count?: number | null
          post_count_free?: number | null
          saved_searches?: Json | null
          star_balance?: number | null
          story_settings?: Json | null
          suspended_at?: string | null
          suspension_reason?: string | null
          total_earned?: number | null
          total_reactions?: number | null
          updated_at?: string
          username?: string
          vip?: boolean | null
          vip_days?: number | null
          vip_expires_at?: string | null
          vip_post_count?: number | null
          vip_started_at?: string | null
          voice_credits?: number | null
          wallet_balance?: number | null
        }
        Relationships: []
      }
      user_reports: {
        Row: {
          admin_action: string | null
          admin_notes: string | null
          created_at: string | null
          id: string
          reason: string
          reported_user_id: string | null
          reporter_id: string | null
          resolved_at: string | null
          status: string | null
        }
        Insert: {
          admin_action?: string | null
          admin_notes?: string | null
          created_at?: string | null
          id?: string
          reason: string
          reported_user_id?: string | null
          reporter_id?: string | null
          resolved_at?: string | null
          status?: string | null
        }
        Update: {
          admin_action?: string | null
          admin_notes?: string | null
          created_at?: string | null
          id?: string
          reason?: string
          reported_user_id?: string | null
          reporter_id?: string | null
          resolved_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          ip_address: string | null
          session_token: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          ip_address?: string | null
          session_token: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          ip_address?: string | null
          session_token?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_storylines: {
        Row: {
          caption: string | null
          created_at: string
          expires_at: string
          id: string
          media_type: string | null
          media_url: string
          music_url: string | null
          preview_url: string | null
          star_price: number | null
          status: string | null
          suspended_at: string | null
          suspension_reason: string | null
          user_id: string
          view_count: number | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          media_type?: string | null
          media_url: string
          music_url?: string | null
          preview_url?: string | null
          star_price?: number | null
          status?: string | null
          suspended_at?: string | null
          suspension_reason?: string | null
          user_id: string
          view_count?: number | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          media_type?: string | null
          media_url?: string
          music_url?: string | null
          preview_url?: string | null
          star_price?: number | null
          status?: string | null
          suspended_at?: string | null
          suspension_reason?: string | null
          user_id?: string
          view_count?: number | null
        }
        Relationships: []
      }
      user_suspensions: {
        Row: {
          expires_at: string | null
          id: string
          is_active: boolean | null
          reason: string
          suspended_at: string
          suspended_by: string | null
          suspension_type: string
          user_id: string
        }
        Insert: {
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          reason: string
          suspended_at?: string
          suspended_by?: string | null
          suspension_type: string
          user_id: string
        }
        Update: {
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          reason?: string
          suspended_at?: string
          suspended_by?: string | null
          suspension_type?: string
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          analytics_last_seen: string | null
          avatar_url: string | null
          country: string | null
          country_code: string | null
          created_at: string
          currency_code: string | null
          currency_symbol: string | null
          device_id: string | null
          email: string
          full_name: string
          gender: string | null
          ip_address: string | null
          is_active: boolean | null
          last_login: string | null
          mobile: string | null
          payment_method: string | null
          postal_code: string | null
          state: string | null
          telegram_chat_id: string | null
          updated_at: string
          username: string | null
          vip: boolean | null
          vip_expires_at: string | null
          vip_started_at: string | null
          wallet_balance: number | null
          welcome_bonus: number | null
        }
        Insert: {
          analytics_last_seen?: string | null
          avatar_url?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          currency_code?: string | null
          currency_symbol?: string | null
          device_id?: string | null
          email: string
          full_name: string
          gender?: string | null
          ip_address?: string | null
          is_active?: boolean | null
          last_login?: string | null
          mobile?: string | null
          payment_method?: string | null
          postal_code?: string | null
          state?: string | null
          telegram_chat_id?: string | null
          updated_at?: string
          username?: string | null
          vip?: boolean | null
          vip_expires_at?: string | null
          vip_started_at?: string | null
          wallet_balance?: number | null
          welcome_bonus?: number | null
        }
        Update: {
          analytics_last_seen?: string | null
          avatar_url?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          currency_code?: string | null
          currency_symbol?: string | null
          device_id?: string | null
          email?: string
          full_name?: string
          gender?: string | null
          ip_address?: string | null
          is_active?: boolean | null
          last_login?: string | null
          mobile?: string | null
          payment_method?: string | null
          postal_code?: string | null
          state?: string | null
          telegram_chat_id?: string | null
          updated_at?: string
          username?: string | null
          vip?: boolean | null
          vip_expires_at?: string | null
          vip_started_at?: string | null
          wallet_balance?: number | null
          welcome_bonus?: number | null
        }
        Relationships: []
      }
      verification_documents: {
        Row: {
          document_type: string
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          mime_type: string | null
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          uploaded_at: string
          user_email: string
          user_id: string | null
          verification_status: string | null
        }
        Insert: {
          document_type: string
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          uploaded_at?: string
          user_email: string
          user_id?: string | null
          verification_status?: string | null
        }
        Update: {
          document_type?: string
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          uploaded_at?: string
          user_email?: string
          user_id?: string | null
          verification_status?: string | null
        }
        Relationships: []
      }
      video_jobs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          reward_amount: number
          status: string
          total_cost: number
          user_id: string
          video_description: string
          video_title: string
          video_url: string
          watch_duration: number
          worker_count: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          reward_amount?: number
          status?: string
          total_cost?: number
          user_id: string
          video_description: string
          video_title: string
          video_url: string
          watch_duration?: number
          worker_count?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          reward_amount?: number
          status?: string
          total_cost?: number
          user_id?: string
          video_description?: string
          video_title?: string
          video_url?: string
          watch_duration?: number
          worker_count?: number
        }
        Relationships: []
      }
      view_transactions: {
        Row: {
          created_at: string | null
          id: number
          platform_share: number
          post_id: string | null
          star_price: number
          story_id: string | null
          uploader_id: string | null
          uploader_share: number
          viewer_id: string | null
          viewer_share: number
        }
        Insert: {
          created_at?: string | null
          id?: number
          platform_share: number
          post_id?: string | null
          star_price: number
          story_id?: string | null
          uploader_id?: string | null
          uploader_share: number
          viewer_id?: string | null
          viewer_share: number
        }
        Update: {
          created_at?: string | null
          id?: number
          platform_share?: number
          post_id?: string | null
          star_price?: number
          story_id?: string | null
          uploader_id?: string | null
          uploader_share?: number
          viewer_id?: string | null
          viewer_share?: number
        }
        Relationships: [
          {
            foreignKeyName: "view_transactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "view_transactions_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "user_storylines"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_history: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          id: number
          meta: Json | null
          type: string
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          id?: number
          meta?: Json | null
          type: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          id?: number
          meta?: Json | null
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      website_content: {
        Row: {
          content: string
          crawled_at: string
          id: string
          last_updated: string
          metadata: Json | null
          page_type: string | null
          title: string | null
          url: string
        }
        Insert: {
          content: string
          crawled_at?: string
          id?: string
          last_updated?: string
          metadata?: Json | null
          page_type?: string | null
          title?: string | null
          url: string
        }
        Update: {
          content?: string
          crawled_at?: string
          id?: string
          last_updated?: string
          metadata?: Json | null
          page_type?: string | null
          title?: string | null
          url?: string
        }
        Relationships: []
      }
      withdrawal_history: {
        Row: {
          amount: number
          bank_account_name: string
          bank_account_number: string
          bank_name: string
          id: string
          net_amount: number
          paystack_reference: string | null
          platform_fee: number
          status: string
          user_available_balance_after: number
          user_available_balance_before: number
          user_id: string
          user_uuid: string | null
          withdrawal_date: string
        }
        Insert: {
          amount: number
          bank_account_name: string
          bank_account_number: string
          bank_name: string
          id?: string
          net_amount: number
          paystack_reference?: string | null
          platform_fee?: number
          status?: string
          user_available_balance_after: number
          user_available_balance_before: number
          user_id: string
          user_uuid?: string | null
          withdrawal_date?: string
        }
        Update: {
          amount?: number
          bank_account_name?: string
          bank_account_number?: string
          bank_name?: string
          id?: string
          net_amount?: number
          paystack_reference?: string | null
          platform_fee?: number
          status?: string
          user_available_balance_after?: number
          user_available_balance_before?: number
          user_id?: string
          user_uuid?: string | null
          withdrawal_date?: string
        }
        Relationships: []
      }
      withdrawal_requests: {
        Row: {
          account_number: string
          admin_notes: string | null
          amount: number
          bank_name: string
          countdown_end: string
          created_at: string
          full_name: string
          id: string
          phone_number: string | null
          processed_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_number: string
          admin_notes?: string | null
          amount: number
          bank_name: string
          countdown_end?: string
          created_at?: string
          full_name: string
          id?: string
          phone_number?: string | null
          processed_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_number?: string
          admin_notes?: string | null
          amount?: number
          bank_name?: string
          countdown_end?: string
          created_at?: string
          full_name?: string
          id?: string
          phone_number?: string | null
          processed_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_delete_user: { Args: { p_target_user_id: string }; Returns: Json }
      admin_send_broadcast: {
        Args: { p_message: string; p_title: string; p_type?: string }
        Returns: Json
      }
      admin_set_user_balances: {
        Args: {
          p_reason?: string
          p_star_balance?: number
          p_user_id: string
          p_wallet_balance?: number
        }
        Returns: Json
      }
      admin_update_payment_request: {
        Args: { p_admin_notes?: string; p_request_id: string; p_status: string }
        Returns: Json
      }
      archive_old_posts: { Args: never; Returns: undefined }
      auto_archive_old_posts: { Args: never; Returns: undefined }
      deduct_voice_credits: { Args: { p_user_id: string }; Returns: Json }
      delete_own_group: { Args: { p_group_id: string }; Returns: Json }
      execute_admin_sql: { Args: { query: string }; Returns: Json }
      get_user_device_info: {
        Args: { user_agent_string: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_checkin_balance: {
        Args: { amount_param: number; user_id_param: string }
        Returns: undefined
      }
      join_group_with_fee: {
        Args: { p_entry_fee: number; p_group_id: string; p_user_id: string }
        Returns: Json
      }
      process_paid_view: {
        Args: {
          p_content_id: string
          p_content_type: string
          p_star_price: number
          p_uploader_id: string
          p_viewer_id: string
        }
        Returns: Json
      }
      process_post_view: {
        Args: { p_post_id: string; p_viewer_id: string }
        Returns: Json
      }
      process_story_view: {
        Args: { p_story_id: string; p_viewer_id: string }
        Returns: Json
      }
      spend_stars: {
        Args: { p_amount: number; p_meta?: Json; p_type: string }
        Returns: Json
      }
      track_search: { Args: { search_keyword: string }; Returns: undefined }
      update_post_status: { Args: never; Returns: undefined }
      use_ai_credit: { Args: { p_user_id: string }; Returns: Json }
      use_voice_credit: { Args: { p_user_id: string }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
