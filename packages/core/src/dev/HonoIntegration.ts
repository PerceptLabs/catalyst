/**
 * HonoIntegration — Backend API routes via Hono in Service Worker
 *
 * Detects if /src/api/ directory exists, builds it to /dist/api-sw.js (IIFE format),
 * and enables API route handling in the preview Service Worker.
 *
 * In browser-only mode, Hono runs in the SW.
 * With Deno server, the same code runs on real Deno.
 */
import type { CatalystFS } from '../fs/CatalystFS.js';
import type { BuildPipeline, Transpiler } from './BuildPipeline.js';

export interface HonoIntegrationConfig {
  /** Source directory for API routes (default: /src/api) */
  apiDir?: string;
  /** Entry point within apiDir (default: index.ts or index.js) */
  entryPoint?: string;
  /** Output path for the built API bundle (default: /dist/api-sw.js) */
  outputPath?: string;
}

export interface HonoBuildResult {
  /** Whether API routes were detected and built */
  hasApi: boolean;
  /** Path to built API bundle (null if no API) */
  outputPath: string | null;
  /** Build errors */
  errors: string[];
}

export class HonoIntegration {
  private readonly fs: CatalystFS;
  private readonly pipeline: BuildPipeline;
  private readonly apiDir: string;
  private readonly entryPoint: string;
  private readonly outputPath: string;

  constructor(
    fs: CatalystFS,
    pipeline: BuildPipeline,
    config: HonoIntegrationConfig = {},
  ) {
    this.fs = fs;
    this.pipeline = pipeline;
    this.apiDir = config.apiDir ?? '/src/api';
    this.entryPoint = config.entryPoint ?? 'index';
    this.outputPath = config.outputPath ?? '/dist/api-sw.js';
  }

  /**
   * Detect if API routes exist.
   */
  hasApiRoutes(): boolean {
    const extensions = ['.ts', '.js', '.tsx', '.jsx'];
    for (const ext of extensions) {
      const path = `${this.apiDir}/${this.entryPoint}${ext}`;
      if (this.fs.existsSync(path)) return true;
    }
    return false;
  }

  /**
   * Find the API entry point file.
   */
  findEntryPoint(): string | null {
    const extensions = ['.ts', '.js', '.tsx', '.jsx'];
    for (const ext of extensions) {
      const path = `${this.apiDir}/${this.entryPoint}${ext}`;
      if (this.fs.existsSync(path)) return path;
    }
    return null;
  }

  /**
   * Build API routes to IIFE format for Service Worker.
   */
  async build(): Promise<HonoBuildResult> {
    if (!this.hasApiRoutes()) {
      return { hasApi: false, outputPath: null, errors: [] };
    }

    const entryPath = this.findEntryPoint();
    if (!entryPath) {
      return {
        hasApi: false,
        outputPath: null,
        errors: ['No API entry point found'],
      };
    }

    const errors: string[] = [];

    try {
      // Read the API source
      const source = this.fs.readFileSync(entryPath, 'utf-8') as string;

      // Wrap the API code in IIFE format for SW injection
      // The wrapper exposes a global `handleApiRequest` function
      const wrapped = this.wrapForServiceWorker(source, entryPath);

      // Ensure output directory exists
      const outputDir = this.outputPath.substring(
        0,
        this.outputPath.lastIndexOf('/'),
      );
      try {
        this.fs.mkdirSync(outputDir, { recursive: true });
      } catch {
        // May already exist
      }

      // Write the built bundle
      this.fs.writeFileSync(this.outputPath, wrapped);

      return {
        hasApi: true,
        outputPath: this.outputPath,
        errors: [],
      };
    } catch (err: any) {
      errors.push(err?.message ?? String(err));
      return { hasApi: true, outputPath: null, errors };
    }
  }

  /**
   * Collect all API source files from the API directory.
   */
  collectApiFiles(): Map<string, string> {
    const files = new Map<string, string>();

    try {
      const entries = this.fs.readdirSync(this.apiDir);
      for (const entry of entries) {
        const entryName = typeof entry === 'string' ? entry : (entry as any).name;
        const fullPath = `${this.apiDir}/${entryName}`;
        try {
          const stat = this.fs.statSync(fullPath);
          if (!stat.isDirectory()) {
            const content = this.fs.readFileSync(fullPath, 'utf-8') as string;
            files.set(fullPath, content);
          }
        } catch {
          // Skip unreadable files
        }
      }
    } catch {
      // API dir may not exist
    }

    return files;
  }

  /**
   * Wrap API code in IIFE format for Service Worker injection.
   * Exposes a global `catalystApiHandler` function.
   */
  private wrapForServiceWorker(source: string, _filePath: string): string {
    return `// Catalyst API Bundle — Auto-generated
// Source: ${_filePath}
(function() {
  'use strict';

  // Simple Hono-compatible router for Service Worker
  var routes = [];
  var middleware = [];

  var app = {
    get: function(path, handler) { routes.push({ method: 'GET', path: path, handler: handler }); },
    post: function(path, handler) { routes.push({ method: 'POST', path: path, handler: handler }); },
    put: function(path, handler) { routes.push({ method: 'PUT', path: path, handler: handler }); },
    delete: function(path, handler) { routes.push({ method: 'DELETE', path: path, handler: handler }); },
    patch: function(path, handler) { routes.push({ method: 'PATCH', path: path, handler: handler }); },
    all: function(path, handler) { routes.push({ method: '*', path: path, handler: handler }); },
    use: function(handler) { middleware.push(handler); },
  };

  // Context helper
  function createContext(request, params) {
    return {
      req: {
        method: request.method,
        url: request.url,
        path: new URL(request.url).pathname,
        param: function(name) { return params[name]; },
        query: function(name) { return new URL(request.url).searchParams.get(name); },
        header: function(name) { return request.headers.get(name); },
        json: function() { return request.json(); },
        text: function() { return request.text(); },
      },
      json: function(data, status) {
        return new Response(JSON.stringify(data), {
          status: status || 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      },
      text: function(data, status) {
        return new Response(data, {
          status: status || 200,
          headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' },
        });
      },
      html: function(data, status) {
        return new Response(data, {
          status: status || 200,
          headers: { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' },
        });
      },
      status: function(code) {
        return {
          json: function(data) {
            return new Response(JSON.stringify(data), {
              status: code,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
          },
          text: function(data) {
            return new Response(data, { status: code, headers: { 'Access-Control-Allow-Origin': '*' } });
          },
        };
      },
      env: typeof self !== 'undefined' ? self.__catalystEnv || {} : {},
    };
  }

  // Match a route pattern to a path
  function matchRoute(pattern, path) {
    if (pattern === path) return {};
    var patternParts = pattern.split('/');
    var pathParts = path.split('/');
    if (patternParts.length !== pathParts.length) return null;
    var params = {};
    for (var i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        params[patternParts[i].substring(1)] = pathParts[i];
      } else if (patternParts[i] !== pathParts[i]) {
        return null;
      }
    }
    return params;
  }

  // --- User API code ---
${source}
  // --- End user API code ---

  // Global handler for the Service Worker
  self.catalystApiHandler = async function(request) {
    var url = new URL(request.url);
    var pathname = url.pathname;

    // Run middleware
    for (var i = 0; i < middleware.length; i++) {
      try {
        var mwResult = await middleware[i](createContext(request, {}), function() {});
        if (mwResult instanceof Response) return mwResult;
      } catch (e) {}
    }

    // Match routes
    for (var j = 0; j < routes.length; j++) {
      var route = routes[j];
      if (route.method !== '*' && route.method !== request.method) continue;
      var params = matchRoute(route.path, pathname);
      if (params !== null) {
        try {
          return await route.handler(createContext(request, params));
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message || 'Internal Error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  };
})();
`;
  }
}
