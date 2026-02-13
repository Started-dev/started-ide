/**
 * Database client for PostgreSQL
 * Replaces Supabase client with direct PostgreSQL connection
 */
import { Pool, PoolClient } from 'pg';

// Connection pool for efficient database access
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Export types for convenience
export type { PoolClient };

/**
 * Execute a query with parameters
 */
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<{ rows: T[]; rowCount: number }> {
  const result = await pool.query(text, params);
  return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
}

/**
 * Get a client from the pool for transactions
 */
export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

/**
 * Execute a transaction
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Helper to build WHERE clauses with proper escaping
 */
export function whereClause(conditions: Record<string, any>): {
  text: string;
  values: any[];
} {
  const keys = Object.keys(conditions).filter(k => conditions[k] !== undefined);
  if (keys.length === 0) {
    return { text: '', values: [] };
  }

  const clauses = keys.map((key, i) => `"${key}" = $${i + 1}`);
  const values = keys.map(k => conditions[k]);

  return {
    text: 'WHERE ' + clauses.join(' AND '),
    values,
  };
}

/**
 * Simple ORM-like helpers for common operations
 */
export const db = {
  /**
   * Select rows from a table
   */
  async select<T = any>(
    table: string,
    options: {
      columns?: string[];
      where?: Record<string, any>;
      orderBy?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<T[]> {
    const cols = options.columns?.map(c => `"${c}"`).join(', ') || '*';
    const { text: whereText, values } = whereClause(options.where || {});
    
    let sql = `SELECT ${cols} FROM "${table}" ${whereText}`;
    
    if (options.orderBy) {
      sql += ` ORDER BY ${options.orderBy}`;
    }
    if (options.limit) {
      sql += ` LIMIT ${options.limit}`;
    }
    if (options.offset) {
      sql += ` OFFSET ${options.offset}`;
    }

    const result = await query<T>(sql, values);
    return result.rows;
  },

  /**
   * Insert a row into a table
   */
  async insert<T = any>(
    table: string,
    data: Record<string, any>,
    returning: string[] = ['*']
  ): Promise<T> {
    const keys = Object.keys(data);
    const cols = keys.map(k => `"${k}"`).join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const values = keys.map(k => data[k]);
    const returningCols = returning.map(c => c === '*' ? '*' : `"${c}"`).join(', ');

    const sql = `INSERT INTO "${table}" (${cols}) VALUES (${placeholders}) RETURNING ${returningCols}`;
    const result = await query<T>(sql, values);
    return result.rows[0];
  },

  /**
   * Update rows in a table
   */
  async update<T = any>(
    table: string,
    data: Record<string, any>,
    where: Record<string, any>,
    returning: string[] = ['*']
  ): Promise<T[]> {
    const dataKeys = Object.keys(data);
    const whereKeys = Object.keys(where);
    
    const setClauses = dataKeys.map((k, i) => `"${k}" = $${i + 1}`);
    const whereClauses = whereKeys.map((k, i) => `"${k}" = $${dataKeys.length + i + 1}`);
    
    const values = [...dataKeys.map(k => data[k]), ...whereKeys.map(k => where[k])];
    const returningCols = returning.map(c => c === '*' ? '*' : `"${c}"`).join(', ');

    const sql = `UPDATE "${table}" SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')} RETURNING ${returningCols}`;
    const result = await query<T>(sql, values);
    return result.rows;
  },

  /**
   * Delete rows from a table
   */
  async delete(
    table: string,
    where: Record<string, any>
  ): Promise<number> {
    const { text: whereText, values } = whereClause(where);
    const sql = `DELETE FROM "${table}" ${whereText}`;
    const result = await query(sql, values);
    return result.rowCount;
  },

  /**
   * Check if a user is a project member (replaces RLS is_project_member function)
   */
  async isProjectMember(userId: string, projectId: string): Promise<boolean> {
    const result = await query(
      `SELECT 1 FROM projects WHERE id = $1 AND owner_id = $2
       UNION
       SELECT 1 FROM project_collaborators WHERE project_id = $1 AND user_id = $2 AND accepted = true`,
      [projectId, userId]
    );
    return result.rowCount > 0;
  },

  /**
   * Check if user owns a project
   */
  async isProjectOwner(userId: string, projectId: string): Promise<boolean> {
    const result = await query(
      `SELECT 1 FROM projects WHERE id = $1 AND owner_id = $2`,
      [projectId, userId]
    );
    return result.rowCount > 0;
  },
};

export default db;
