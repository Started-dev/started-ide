/**
 * Database Query API Endpoint
 * Handles select, insert, update, delete operations
 */
import type { VercelRequest, VercelResponse } from '../_lib/vercel-types';
import { handleOptions } from '../_lib/cors';
import { requireAuth } from '../_lib/auth';
import { query } from '../_lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const {
      table,
      columns,
      filters,
      orderBy,
      limit,
      offset,
      insertData,
      updateData,
      returnSingle,
      returnMaybeSingle,
    } = req.body;

    const { operation } = req.query;

    const identPattern = /^[a-zA-Z0-9_]+$/;
    const columnsPattern = /^(\*|[a-zA-Z0-9_]+(\s*,\s*[a-zA-Z0-9_]+)*)$/;

    if (!table || typeof table !== 'string' || !identPattern.test(table)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    if (columns && (typeof columns !== 'string' || !columnsPattern.test(columns))) {
      return res.status(400).json({ error: 'Invalid columns format' });
    }

    let sql = '';
    const params: unknown[] = [];
    let paramIndex = 1;

    const allowedFilterTypes = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'contains', 'containedBy']);
    if (filters && Array.isArray(filters)) {
      for (const filter of filters) {
        if (!identPattern.test(filter.column)) {
          return res.status(400).json({ error: 'Invalid filter column' });
        }
        if (!allowedFilterTypes.has(filter.type)) {
          return res.status(400).json({ error: `Invalid filter type: ${filter.type}` });
        }
      }
    }

    if (orderBy && Array.isArray(orderBy)) {
      for (const order of orderBy) {
        if (!identPattern.test(order.column)) {
          return res.status(400).json({ error: 'Invalid orderBy column' });
        }
      }
    }

    if (operation === 'select') {
      sql = `SELECT ${columns || '*'} FROM "${table}"`;
      
      // Build WHERE clause
      if (filters && filters.length > 0) {
        const whereClauses: string[] = [];
        for (const filter of filters) {
          switch (filter.type) {
            case 'eq':
              whereClauses.push(`"${filter.column}" = $${paramIndex++}`);
              params.push(filter.value);
              break;
            case 'neq':
              whereClauses.push(`"${filter.column}" != $${paramIndex++}`);
              params.push(filter.value);
              break;
            case 'gt':
              whereClauses.push(`"${filter.column}" > $${paramIndex++}`);
              params.push(filter.value);
              break;
            case 'gte':
              whereClauses.push(`"${filter.column}" >= $${paramIndex++}`);
              params.push(filter.value);
              break;
            case 'lt':
              whereClauses.push(`"${filter.column}" < $${paramIndex++}`);
              params.push(filter.value);
              break;
            case 'lte':
              whereClauses.push(`"${filter.column}" <= $${paramIndex++}`);
              params.push(filter.value);
              break;
            case 'like':
              whereClauses.push(`"${filter.column}" LIKE $${paramIndex++}`);
              params.push(filter.value);
              break;
            case 'ilike':
              whereClauses.push(`"${filter.column}" ILIKE $${paramIndex++}`);
              params.push(filter.value);
              break;
            case 'is':
              whereClauses.push(`"${filter.column}" IS $${paramIndex++}`);
              params.push(filter.value);
              break;
            case 'in':
              whereClauses.push(`"${filter.column}" = ANY($${paramIndex++})`);
              params.push(filter.value);
              break;
            case 'contains':
              whereClauses.push(`"${filter.column}" @> $${paramIndex++}`);
              params.push(filter.value);
              break;
            case 'containedBy':
              whereClauses.push(`"${filter.column}" <@ $${paramIndex++}`);
              params.push(filter.value);
              break;
          }
        }
        if (whereClauses.length > 0) {
          sql += ' WHERE ' + whereClauses.join(' AND ');
        }
      }

      // Build ORDER BY
      if (orderBy && orderBy.length > 0) {
        const orderClauses = orderBy.map((o: { column: string; ascending?: boolean }) => 
          `"${o.column}" ${o.ascending ? 'ASC' : 'DESC'}`
        );
        sql += ' ORDER BY ' + orderClauses.join(', ');
      }

      // Add LIMIT and OFFSET
      if (limit) {
        sql += ` LIMIT ${limit}`;
      }
      if (offset) {
        sql += ` OFFSET ${offset}`;
      }

      const result = await query(sql, params);

      if (returnSingle) {
        if (result.rows.length === 0) {
          return res.status(404).json({ data: null, error: 'No rows found' });
        }
        return res.status(200).json({ data: result.rows[0] });
      }

      if (returnMaybeSingle) {
        return res.status(200).json({ data: result.rows[0] || null });
      }

      return res.status(200).json({ data: result.rows });

    } else if (operation === 'insert') {
      const keys = Object.keys(insertData);
      const cols = keys.map(k => `"${k}"`).join(', ');
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const values = keys.map(k => insertData[k]);

      sql = `INSERT INTO "${table}" (${cols}) VALUES (${placeholders}) RETURNING *`;
      const result = await query(sql, values);

      if (returnSingle || returnMaybeSingle) {
        return res.status(200).json({ data: result.rows[0] || null });
      }
      return res.status(200).json({ data: result.rows });

    } else if (operation === 'update') {
      const dataKeys = Object.keys(updateData);
      const setClauses = dataKeys.map((k, i) => `"${k}" = $${i + 1}`);
      const values = dataKeys.map(k => updateData[k]);

      sql = `UPDATE "${table}" SET ${setClauses.join(', ')}`;

      // Build WHERE clause
      if (filters && filters.length > 0) {
        const whereClauses: string[] = [];
        for (const filter of filters) {
          if (filter.type !== 'eq') {
            return res.status(400).json({ error: 'Only eq filters are supported for update' });
          }
          whereClauses.push(`"${filter.column}" = $${paramIndex++}`);
          values.push(filter.value);
        }
        if (whereClauses.length > 0) {
          sql += ' WHERE ' + whereClauses.join(' AND ');
        }
      }

      sql += ' RETURNING *';
      const result = await query(sql, values);

      if (returnSingle || returnMaybeSingle) {
        return res.status(200).json({ data: result.rows[0] || null });
      }
      return res.status(200).json({ data: result.rows });

    } else if (operation === 'delete') {
      sql = `DELETE FROM "${table}"`;

      // Build WHERE clause
      if (filters && filters.length > 0) {
        const whereClauses: string[] = [];
        for (const filter of filters) {
          if (filter.type !== 'eq') {
            return res.status(400).json({ error: 'Only eq filters are supported for delete' });
          }
          whereClauses.push(`"${filter.column}" = $${paramIndex++}`);
          params.push(filter.value);
        }
        if (whereClauses.length > 0) {
          sql += ' WHERE ' + whereClauses.join(' AND ');
        }
      }

      const result = await query(sql, params);
      return res.status(200).json({ data: { count: result.rowCount } });
    }

    return res.status(400).json({ error: 'Invalid operation' });

  } catch (error) {
    console.error('Database query error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
