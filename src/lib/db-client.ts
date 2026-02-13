/**
 * Database Client Wrapper
 * Provides Supabase-like interface but uses our Vercel API
 */
import { setAccessTokenGetter } from './api-client';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

let getAccessTokenFn: (() => Promise<string | null>) | null = null;

export function setDbAccessTokenGetter(fn: () => Promise<string | null>) {
  getAccessTokenFn = fn;
  setAccessTokenGetter(fn);
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!getAccessTokenFn) return {};
  const token = await getAccessTokenFn();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

interface QueryBuilder<T = unknown> {
  select(columns?: string): QueryBuilder<T>;
  eq(column: string, value: unknown): QueryBuilder<T>;
  neq(column: string, value: unknown): QueryBuilder<T>;
  gt(column: string, value: unknown): QueryBuilder<T>;
  gte(column: string, value: unknown): QueryBuilder<T>;
  lt(column: string, value: unknown): QueryBuilder<T>;
  lte(column: string, value: unknown): QueryBuilder<T>;
  like(column: string, pattern: string): QueryBuilder<T>;
  ilike(column: string, pattern: string): QueryBuilder<T>;
  is(column: string, value: any): QueryBuilder<T>;
  in(column: string, values: any[]): QueryBuilder<T>;
  contains(column: string, value: any): QueryBuilder<T>;
  containedBy(column: string, value: any): QueryBuilder<T>;
  order(column: string, options?: { ascending?: boolean }): QueryBuilder<T>;
  limit(count: number): QueryBuilder<T>;
  offset(count: number): QueryBuilder<T>;
  single(): Promise<{ data: T | null; error: Error | null }>;
  maybeSingle(): Promise<{ data: T | null; error: Error | null }>;
  insert(data: any): QueryBuilder<T>;
  update(data: Record<string, unknown>): QueryBuilder<T>;
  delete(): QueryBuilder<T>;
  then(resolve: (result: { data: T[] | null; error: Error | null }) => void, reject?: (error: Error) => void): Promise<unknown>;
}

class DbQueryBuilder<T = any> implements QueryBuilder<T> {
  private tableName: string;
  private selectCols: string = '*';
  private filters: Array<{ type: string; column: string; value: any; operator?: string }> = [];
  private orderBy: Array<{ column: string; ascending: boolean }> = [];
  private limitCount?: number;
  private offsetCount?: number;
  private operation: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private insertData?: any;
  private updateData?: any;
  private returnSingle: boolean = false;
  private returnMaybeSingle: boolean = false;

  constructor(table: string) {
    this.tableName = table;
  }

  select(columns: string = '*'): QueryBuilder<T> {
    this.selectCols = columns;
    this.operation = 'select';
    return this;
  }

  eq(column: string, value: unknown): QueryBuilder<T> {
    this.filters.push({ type: 'eq', column, value });
    return this;
  }

  neq(column: string, value: unknown): QueryBuilder<T> {
    this.filters.push({ type: 'neq', column, value });
    return this;
  }

  gt(column: string, value: unknown): QueryBuilder<T> {
    this.filters.push({ type: 'gt', column, value });
    return this;
  }

  gte(column: string, value: unknown): QueryBuilder<T> {
    this.filters.push({ type: 'gte', column, value });
    return this;
  }

  lt(column: string, value: unknown): QueryBuilder<T> {
    this.filters.push({ type: 'lt', column, value });
    return this;
  }

  lte(column: string, value: unknown): QueryBuilder<T> {
    this.filters.push({ type: 'lte', column, value });
    return this;
  }

  like(column: string, pattern: string): QueryBuilder<T> {
    this.filters.push({ type: 'like', column, value: pattern });
    return this;
  }

  ilike(column: string, pattern: string): QueryBuilder<T> {
    this.filters.push({ type: 'ilike', column, value: pattern });
    return this;
  }

  is(column: string, value: unknown): QueryBuilder<T> {
    this.filters.push({ type: 'is', column, value });
    return this;
  }

  in(column: string, values: unknown[]): QueryBuilder<T> {
    this.filters.push({ type: 'in', column, value: values });
    return this;
  }

  contains(column: string, value: unknown): QueryBuilder<T> {
    this.filters.push({ type: 'contains', column, value });
    return this;
  }

  containedBy(column: string, value: unknown): QueryBuilder<T> {
    this.filters.push({ type: 'containedBy', column, value });
    return this;
  }

  order(column: string, options: { ascending?: boolean } = {}): QueryBuilder<T> {
    this.orderBy.push({ column, ascending: options.ascending !== false });
    return this;
  }

  limit(count: number): QueryBuilder<T> {
    this.limitCount = count;
    return this;
  }

  offset(count: number): QueryBuilder<T> {
    this.offsetCount = count;
    return this;
  }

  insert(data: Record<string, unknown>): QueryBuilder<T> {
    this.operation = 'insert';
    this.insertData = data;
    return this;
  }

  update(data: Record<string, unknown>): QueryBuilder<T> {
    this.operation = 'update';
    this.updateData = data;
    return this;
  }

  delete(): QueryBuilder<T> {
    this.operation = 'delete';
    return this;
  }

  single(): Promise<{ data: T | null; error: Error | null }> {
    this.returnSingle = true;
    return this.execute() as any;
  }

  maybeSingle(): Promise<{ data: T | null; error: Error | null }> {
    this.returnMaybeSingle = true;
    return this.execute() as any;
  }

  then(resolve: (result: { data: T[] | null; error: Error | null }) => void, reject?: (error: Error) => void): Promise<any> {
    return this.execute().then(resolve, reject);
  }

  private async execute(): Promise<{ data: T[] | T | null; error: Error | null }> {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_BASE}/db/${this.operation}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          table: this.tableName,
          columns: this.selectCols,
          filters: this.filters,
          orderBy: this.orderBy,
          limit: this.limitCount,
          offset: this.offsetCount,
          insertData: this.insertData,
          updateData: this.updateData,
          returnSingle: this.returnSingle,
          returnMaybeSingle: this.returnMaybeSingle,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Unknown error' }));
        return { data: null, error: new Error(error.message || error.error) };
      }

      const result = await response.json();
      return { data: result.data, error: null };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  }
}

// Stub supabase client
export const supabase = {
  from<T = unknown>(table: string): QueryBuilder<T> {
    return new DbQueryBuilder<T>(table);
  },
  auth: {
    getUser: async () => {
      console.warn('supabase.auth.getUser() is deprecated - use Privy useAuth() instead');
      return { data: { user: null }, error: new Error('Use Privy auth') };
    },
    getSession: async () => {
      console.warn('supabase.auth.getSession() is deprecated - use Privy useAuth() instead');
      return { data: { session: null }, error: new Error('Use Privy auth') };
    },
    onAuthStateChange: () => {
      console.warn('supabase.auth.onAuthStateChange() is deprecated - use Privy useAuth() instead');
      return { data: { subscription: { unsubscribe: () => {} } }, error: null };
    },
    signUp: async () => {
      console.warn('supabase.auth.signUp() is deprecated - use Privy login() instead');
      return { data: { user: null, session: null }, error: new Error('Use Privy auth') };
    },
    signInWithPassword: async () => {
      console.warn('supabase.auth.signInWithPassword() is deprecated - use Privy login() instead');
      return { data: { user: null, session: null }, error: new Error('Use Privy auth') };
    },
    signOut: async () => {
      console.warn('supabase.auth.signOut() is deprecated - use Privy logout() instead');
      return { error: null };
    },
  },
  functions: {
    invoke: async (name: string, options?: any) => {
      console.warn(`supabase.functions.invoke('${name}') is deprecated - use direct API calls instead`);
      return { data: null, error: new Error('Use direct API calls') };
    },
  },
  storage: {
    from: (bucket: string) => {
      console.warn(`supabase.storage.from('${bucket}') is deprecated - use direct storage API instead`);
      return {
        upload: async () => ({ data: null, error: new Error('Use direct storage API') }),
        download: async () => ({ data: null, error: new Error('Use direct storage API') }),
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
      };
    },
  },
  channel: (name: string) => {
    console.warn(`supabase.channel('${name}') is deprecated - use WebSocket API instead`);
    return {
      on: () => ({ subscribe: () => ({}) }),
      subscribe: () => ({}),
      unsubscribe: () => ({}),
    };
  },
};
