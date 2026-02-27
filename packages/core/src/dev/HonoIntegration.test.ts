/**
 * HonoIntegration — Node.js unit tests
 *
 * Tests API route detection, building, and IIFE wrapping.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CatalystFS } from '../fs/CatalystFS.js';
import { BuildPipeline, PassthroughTranspiler } from './BuildPipeline.js';
import { HonoIntegration } from './HonoIntegration.js';

describe('HonoIntegration — Detection', () => {
  let fs: CatalystFS;
  let pipeline: BuildPipeline;

  beforeEach(async () => {
    fs = await CatalystFS.create('hono-detect');
    pipeline = new BuildPipeline(fs, new PassthroughTranspiler());
  });

  it('should detect no API routes when directory missing', () => {
    const hono = new HonoIntegration(fs, pipeline);
    expect(hono.hasApiRoutes()).toBe(false);
  });

  it('should detect API routes with index.ts', () => {
    fs.mkdirSync('/src/api', { recursive: true });
    fs.writeFileSync('/src/api/index.ts', 'app.get("/api/hello", (c) => c.json({ msg: "hi" }));');
    const hono = new HonoIntegration(fs, pipeline);
    expect(hono.hasApiRoutes()).toBe(true);
  });

  it('should detect API routes with index.js', () => {
    fs.mkdirSync('/src/api', { recursive: true });
    fs.writeFileSync('/src/api/index.js', 'app.get("/api/hello", (c) => c.json({ msg: "hi" }));');
    const hono = new HonoIntegration(fs, pipeline);
    expect(hono.hasApiRoutes()).toBe(true);
  });

  it('should find entry point', () => {
    fs.mkdirSync('/src/api', { recursive: true });
    fs.writeFileSync('/src/api/index.ts', 'code');
    const hono = new HonoIntegration(fs, pipeline);
    expect(hono.findEntryPoint()).toBe('/src/api/index.ts');
  });

  it('should return null when no entry point', () => {
    const hono = new HonoIntegration(fs, pipeline);
    expect(hono.findEntryPoint()).toBeNull();
  });

  it('should support custom API directory', () => {
    fs.mkdirSync('/routes', { recursive: true });
    fs.writeFileSync('/routes/index.ts', 'code');
    const hono = new HonoIntegration(fs, pipeline, { apiDir: '/routes' });
    expect(hono.hasApiRoutes()).toBe(true);
    expect(hono.findEntryPoint()).toBe('/routes/index.ts');
  });

  it('should support custom entry point name', () => {
    fs.mkdirSync('/src/api', { recursive: true });
    fs.writeFileSync('/src/api/routes.ts', 'code');
    const hono = new HonoIntegration(fs, pipeline, { entryPoint: 'routes' });
    expect(hono.findEntryPoint()).toBe('/src/api/routes.ts');
  });
});

describe('HonoIntegration — Building', () => {
  let fs: CatalystFS;
  let pipeline: BuildPipeline;

  beforeEach(async () => {
    fs = await CatalystFS.create('hono-build');
    pipeline = new BuildPipeline(fs, new PassthroughTranspiler());
  });

  it('should return hasApi=false when no API', async () => {
    const hono = new HonoIntegration(fs, pipeline);
    const result = await hono.build();
    expect(result.hasApi).toBe(false);
    expect(result.outputPath).toBeNull();
    expect(result.errors).toHaveLength(0);
  });

  it('should build API routes to IIFE bundle', async () => {
    fs.mkdirSync('/src/api', { recursive: true });
    fs.writeFileSync(
      '/src/api/index.ts',
      `app.get('/api/hello', function(c) { return c.json({ message: 'Hello!' }); });`,
    );

    const hono = new HonoIntegration(fs, pipeline);
    const result = await hono.build();

    expect(result.hasApi).toBe(true);
    expect(result.outputPath).toBe('/dist/api-sw.js');
    expect(result.errors).toHaveLength(0);
    expect(fs.existsSync('/dist/api-sw.js')).toBe(true);

    const content = fs.readFileSync('/dist/api-sw.js', 'utf-8') as string;
    expect(content).toContain('catalystApiHandler');
    expect(content).toContain('/api/hello');
    expect(content).toContain('Hello!');
  });

  it('should support custom output path', async () => {
    fs.mkdirSync('/src/api', { recursive: true });
    fs.writeFileSync('/src/api/index.ts', 'app.get("/api/test", function(c) { return c.text("ok"); });');

    const hono = new HonoIntegration(fs, pipeline, {
      outputPath: '/build/api.js',
    });
    const result = await hono.build();

    expect(result.outputPath).toBe('/build/api.js');
    expect(fs.existsSync('/build/api.js')).toBe(true);
  });

  it('should include IIFE wrapper with router', async () => {
    fs.mkdirSync('/src/api', { recursive: true });
    fs.writeFileSync('/src/api/index.ts', '// API routes');

    const hono = new HonoIntegration(fs, pipeline);
    const result = await hono.build();

    const content = fs.readFileSync(result.outputPath!, 'utf-8') as string;
    expect(content).toContain('(function()');
    expect(content).toContain('var routes = []');
    expect(content).toContain('matchRoute');
    expect(content).toContain('createContext');
  });

  it('should collect API files', () => {
    fs.mkdirSync('/src/api', { recursive: true });
    fs.writeFileSync('/src/api/index.ts', 'code1');
    fs.writeFileSync('/src/api/users.ts', 'code2');

    const hono = new HonoIntegration(fs, pipeline);
    const files = hono.collectApiFiles();
    expect(files.size).toBe(2);
    expect(files.has('/src/api/index.ts')).toBe(true);
    expect(files.has('/src/api/users.ts')).toBe(true);
  });
});

describe('HonoIntegration — Built API Handler', () => {
  let fs: CatalystFS;
  let pipeline: BuildPipeline;

  beforeEach(async () => {
    fs = await CatalystFS.create('hono-handler');
    pipeline = new BuildPipeline(fs, new PassthroughTranspiler());
  });

  it('should produce executable IIFE that defines catalystApiHandler', async () => {
    fs.mkdirSync('/src/api', { recursive: true });
    fs.writeFileSync(
      '/src/api/index.ts',
      `app.get('/api/hello', function(c) { return c.json({ message: 'Hello World' }); });`,
    );

    const hono = new HonoIntegration(fs, pipeline);
    await hono.build();

    const code = fs.readFileSync('/dist/api-sw.js', 'utf-8') as string;

    // Execute the IIFE in our context
    const self: any = {};
    new Function('self', code)(self);

    expect(typeof self.catalystApiHandler).toBe('function');

    // Test the handler
    const request = new Request('http://localhost/api/hello', {
      method: 'GET',
    });
    const response = await self.catalystApiHandler(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.message).toBe('Hello World');
  });

  it('should handle POST routes', async () => {
    fs.mkdirSync('/src/api', { recursive: true });
    fs.writeFileSync(
      '/src/api/index.ts',
      `app.post('/api/data', function(c) { return c.json({ received: true }); });`,
    );

    const hono = new HonoIntegration(fs, pipeline);
    await hono.build();
    const code = fs.readFileSync('/dist/api-sw.js', 'utf-8') as string;

    const self: any = {};
    new Function('self', code)(self);

    const response = await self.catalystApiHandler(
      new Request('http://localhost/api/data', { method: 'POST' }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.received).toBe(true);
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

    const self: any = {};
    new Function('self', code)(self);

    const response = await self.catalystApiHandler(
      new Request('http://localhost/api/nonexistent', { method: 'GET' }),
    );
    expect(response.status).toBe(404);
  });

  it('should handle route parameters', async () => {
    fs.mkdirSync('/src/api', { recursive: true });
    fs.writeFileSync(
      '/src/api/index.ts',
      `app.get('/api/users/:id', function(c) { return c.json({ id: c.req.param('id') }); });`,
    );

    const hono = new HonoIntegration(fs, pipeline);
    await hono.build();
    const code = fs.readFileSync('/dist/api-sw.js', 'utf-8') as string;

    const self: any = {};
    new Function('self', code)(self);

    const response = await self.catalystApiHandler(
      new Request('http://localhost/api/users/42', { method: 'GET' }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe('42');
  });

  it('should handle query parameters', async () => {
    fs.mkdirSync('/src/api', { recursive: true });
    fs.writeFileSync(
      '/src/api/index.ts',
      `app.get('/api/search', function(c) { return c.json({ q: c.req.query('q') }); });`,
    );

    const hono = new HonoIntegration(fs, pipeline);
    await hono.build();
    const code = fs.readFileSync('/dist/api-sw.js', 'utf-8') as string;

    const self: any = {};
    new Function('self', code)(self);

    const response = await self.catalystApiHandler(
      new Request('http://localhost/api/search?q=test', { method: 'GET' }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.q).toBe('test');
  });
});
