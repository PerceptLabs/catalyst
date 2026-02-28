/**
 * Pure Workers code — no framework.
 * Uses env.MY_KV and env.MY_DB from wrangler.toml bindings.
 * Demonstrates raw Workers compatibility without any build tool.
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/') {
      return new Response('Raw Worker on Catalyst', {
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    if (url.pathname === '/kv/set') {
      const key = url.searchParams.get('key');
      const value = url.searchParams.get('value');
      await env.MY_KV.put(key, value);
      return new Response(JSON.stringify({ stored: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/kv/get') {
      const key = url.searchParams.get('key');
      const value = await env.MY_KV.get(key);
      return new Response(JSON.stringify({ key, value }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/db/init') {
      await env.MY_DB.exec(
        'CREATE TABLE IF NOT EXISTS data (id INTEGER PRIMARY KEY, value TEXT)',
      );
      return new Response(JSON.stringify({ initialized: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/db/insert') {
      const value = url.searchParams.get('value');
      await env.MY_DB.prepare('INSERT INTO data (value) VALUES (?)')
        .bind(value)
        .run();
      return new Response(JSON.stringify({ inserted: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/db/list') {
      const result = await env.MY_DB.prepare('SELECT * FROM data').all();
      return new Response(JSON.stringify(result.results), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/env') {
      return new Response(
        JSON.stringify({
          hasKV: !!env.MY_KV,
          hasDB: !!env.MY_DB,
          appName: env.APP_NAME,
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response('Not Found', { status: 404 });
  },
};
