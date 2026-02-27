/**
 * HonoIntegration — Browser tests
 *
 * Tests Hono API route building and handler execution in real Chromium.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CatalystFS } from '../fs/CatalystFS.js';
import { BuildPipeline, PassthroughTranspiler } from './BuildPipeline.js';
import { HonoIntegration } from './HonoIntegration.js';

describe('HonoIntegration — API Detection (Browser)', () => {
  let fs: CatalystFS;
  let pipeline: BuildPipeline;

  beforeEach(async () => {
    fs = await CatalystFS.create('hono-detect-' + Date.now());
    pipeline = new BuildPipeline(fs, new PassthroughTranspiler());
  });

  it('should detect no API when directory missing', () => {
    const hono = new HonoIntegration(fs, pipeline);
    expect(hono.hasApiRoutes()).toBe(false);
    fs.destroy();
  });

  it('should detect API routes', () => {
    fs.mkdirSync('/src/api', { recursive: true });
    fs.writeFileSync(
      '/src/api/index.ts',
      `app.get('/api/test', function(c) { return c.json({ ok: true }); });`,
    );
    const hono = new HonoIntegration(fs, pipeline);
    expect(hono.hasApiRoutes()).toBe(true);
    fs.destroy();
  });

  it('should find entry point', () => {
    fs.mkdirSync('/src/api', { recursive: true });
    fs.writeFileSync('/src/api/index.js', 'code');
    const hono = new HonoIntegration(fs, pipeline);
    expect(hono.findEntryPoint()).toBe('/src/api/index.js');
    fs.destroy();
  });
});

describe('HonoIntegration — Build (Browser)', () => {
  let fs: CatalystFS;
  let pipeline: BuildPipeline;

  beforeEach(async () => {
    fs = await CatalystFS.create('hono-build-' + Date.now());
    pipeline = new BuildPipeline(fs, new PassthroughTranspiler());
  });

  it('should build API routes to /dist/api-sw.js', async () => {
    fs.mkdirSync('/src/api', { recursive: true });
    fs.writeFileSync(
      '/src/api/index.ts',
      `app.get('/api/hello', function(c) { return c.json({ message: 'Hello from Catalyst!' }); });`,
    );

    const hono = new HonoIntegration(fs, pipeline);
    const result = await hono.build();

    expect(result.hasApi).toBe(true);
    expect(result.outputPath).toBe('/dist/api-sw.js');
    expect(result.errors).toHaveLength(0);
    expect(fs.existsSync('/dist/api-sw.js')).toBe(true);
    fs.destroy();
  });

  it('should return hasApi=false when no API', async () => {
    const hono = new HonoIntegration(fs, pipeline);
    const result = await hono.build();
    expect(result.hasApi).toBe(false);
    fs.destroy();
  });
});

describe('HonoIntegration — API Handler Execution (Browser)', () => {
  let fs: CatalystFS;
  let pipeline: BuildPipeline;

  beforeEach(async () => {
    fs = await CatalystFS.create('hono-exec-' + Date.now());
    pipeline = new BuildPipeline(fs, new PassthroughTranspiler());
  });

  it('should handle GET /api/hello', async () => {
    fs.mkdirSync('/src/api', { recursive: true });
    fs.writeFileSync(
      '/src/api/index.ts',
      `app.get('/api/hello', function(c) { return c.json({ message: 'Hello World' }); });`,
    );

    const hono = new HonoIntegration(fs, pipeline);
    await hono.build();

    const code = fs.readFileSync('/dist/api-sw.js', 'utf-8') as string;
    const scope: any = {};
    new Function('self', code)(scope);

    const response = await scope.catalystApiHandler(
      new Request('http://localhost/api/hello'),
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.message).toBe('Hello World');
    fs.destroy();
  });

  it('should handle POST requests', async () => {
    fs.mkdirSync('/src/api', { recursive: true });
    fs.writeFileSync(
      '/src/api/index.ts',
      `app.post('/api/items', function(c) { return c.json({ created: true }, 201); });`,
    );

    const hono = new HonoIntegration(fs, pipeline);
    await hono.build();

    const code = fs.readFileSync('/dist/api-sw.js', 'utf-8') as string;
    const scope: any = {};
    new Function('self', code)(scope);

    const response = await scope.catalystApiHandler(
      new Request('http://localhost/api/items', { method: 'POST' }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.created).toBe(true);
    fs.destroy();
  });

  it('should handle route parameters', async () => {
    fs.mkdirSync('/src/api', { recursive: true });
    fs.writeFileSync(
      '/src/api/index.ts',
      `app.get('/api/users/:id', function(c) {
        return c.json({ userId: c.req.param('id') });
      });`,
    );

    const hono = new HonoIntegration(fs, pipeline);
    await hono.build();

    const code = fs.readFileSync('/dist/api-sw.js', 'utf-8') as string;
    const scope: any = {};
    new Function('self', code)(scope);

    const response = await scope.catalystApiHandler(
      new Request('http://localhost/api/users/123'),
    );
    const body = await response.json();
    expect(body.userId).toBe('123');
    fs.destroy();
  });

  it('should handle query parameters', async () => {
    fs.mkdirSync('/src/api', { recursive: true });
    fs.writeFileSync(
      '/src/api/index.ts',
      `app.get('/api/search', function(c) {
        return c.json({ query: c.req.query('q') });
      });`,
    );

    const hono = new HonoIntegration(fs, pipeline);
    await hono.build();

    const code = fs.readFileSync('/dist/api-sw.js', 'utf-8') as string;
    const scope: any = {};
    new Function('self', code)(scope);

    const response = await scope.catalystApiHandler(
      new Request('http://localhost/api/search?q=catalyst'),
    );
    const body = await response.json();
    expect(body.query).toBe('catalyst');
    fs.destroy();
  });

  it('should return 404 for unmatched routes', async () => {
    fs.mkdirSync('/src/api', { recursive: true });
    fs.writeFileSync(
      '/src/api/index.ts',
      `app.get('/api/hello', function(c) { return c.json({ ok: true }); });`,
    );

    const hono = new HonoIntegration(fs, pipeline);
    await hono.build();

    const code = fs.readFileSync('/dist/api-sw.js', 'utf-8') as string;
    const scope: any = {};
    new Function('self', code)(scope);

    const response = await scope.catalystApiHandler(
      new Request('http://localhost/api/missing'),
    );
    expect(response.status).toBe(404);
    fs.destroy();
  });

  it('should include CORS headers', async () => {
    fs.mkdirSync('/src/api', { recursive: true });
    fs.writeFileSync(
      '/src/api/index.ts',
      `app.get('/api/data', function(c) { return c.json({ data: 1 }); });`,
    );

    const hono = new HonoIntegration(fs, pipeline);
    await hono.build();

    const code = fs.readFileSync('/dist/api-sw.js', 'utf-8') as string;
    const scope: any = {};
    new Function('self', code)(scope);

    const response = await scope.catalystApiHandler(
      new Request('http://localhost/api/data'),
    );
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    fs.destroy();
  });

  it('should handle text responses', async () => {
    fs.mkdirSync('/src/api', { recursive: true });
    fs.writeFileSync(
      '/src/api/index.ts',
      `app.get('/api/health', function(c) { return c.text('ok'); });`,
    );

    const hono = new HonoIntegration(fs, pipeline);
    await hono.build();

    const code = fs.readFileSync('/dist/api-sw.js', 'utf-8') as string;
    const scope: any = {};
    new Function('self', code)(scope);

    const response = await scope.catalystApiHandler(
      new Request('http://localhost/api/health'),
    );
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toBe('ok');
    fs.destroy();
  });

  it('should handle multiple routes', async () => {
    fs.mkdirSync('/src/api', { recursive: true });
    fs.writeFileSync(
      '/src/api/index.ts',
      `
      app.get('/api/users', function(c) { return c.json({ users: [] }); });
      app.post('/api/users', function(c) { return c.json({ created: true }, 201); });
      app.get('/api/health', function(c) { return c.text('ok'); });
      `,
    );

    const hono = new HonoIntegration(fs, pipeline);
    await hono.build();

    const code = fs.readFileSync('/dist/api-sw.js', 'utf-8') as string;
    const scope: any = {};
    new Function('self', code)(scope);

    // GET /api/users
    const r1 = await scope.catalystApiHandler(
      new Request('http://localhost/api/users'),
    );
    expect((await r1.json()).users).toEqual([]);

    // POST /api/users
    const r2 = await scope.catalystApiHandler(
      new Request('http://localhost/api/users', { method: 'POST' }),
    );
    expect(r2.status).toBe(201);

    // GET /api/health
    const r3 = await scope.catalystApiHandler(
      new Request('http://localhost/api/health'),
    );
    expect(await r3.text()).toBe('ok');
    fs.destroy();
  });
});
