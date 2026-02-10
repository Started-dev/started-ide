import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tool, input, postgres_url } = await req.json();
    if (!postgres_url) return new Response(JSON.stringify({ ok: false, error: "postgres_url required" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Use Deno's postgres module
    const { Client } = await import("https://deno.land/x/postgres@v0.17.0/mod.ts");
    const client = new Client(postgres_url);
    await client.connect();

    let result: unknown;

    switch (tool) {
      case "pg_query": {
        // Read-only queries only
        const q = (input.query as string).trim();
        if (!/^(SELECT|WITH|EXPLAIN|SHOW)\s/i.test(q)) {
          await client.end();
          return new Response(JSON.stringify({ ok: false, error: "Only read-only queries (SELECT, WITH, EXPLAIN, SHOW) are allowed" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const r = await client.queryObject(q);
        result = { rows: r.rows, rowCount: r.rowCount };
        break;
      }
      case "pg_list_tables": {
        const r = await client.queryObject(`SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema, table_name`);
        result = r.rows;
        break;
      }
      case "pg_describe_table": {
        const r = await client.queryObject(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = '${input.table}' ORDER BY ordinal_position`);
        result = r.rows;
        break;
      }
      case "pg_list_schemas": {
        const r = await client.queryObject(`SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast') ORDER BY schema_name`);
        result = r.rows;
        break;
      }
      case "pg_table_sizes": {
        const r = await client.queryObject(`SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC LIMIT ${input.limit || 20}`);
        result = r.rows;
        break;
      }
      case "pg_active_connections": {
        const r = await client.queryObject(`SELECT pid, usename, application_name, client_addr, state, query_start, query FROM pg_stat_activity WHERE state IS NOT NULL ORDER BY query_start DESC LIMIT ${input.limit || 20}`);
        result = r.rows;
        break;
      }
      default:
        await client.end();
        return new Response(JSON.stringify({ ok: false, error: `Unknown tool: ${tool}` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await client.end();
    return new Response(JSON.stringify({ ok: true, result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
