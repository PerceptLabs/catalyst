/**
 * Node.js Compatibility Matrix — Browser test
 *
 * Runs Node.js API calls through CatalystEngine in real Chromium.
 * Reports PASS / FAIL / NOT_IMPLEMENTED per method.
 * Generates a compatibility report with percentages.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { CatalystFS } from '../fs/CatalystFS.js';
import { CatalystEngine } from '../engine/CatalystEngine.js';

interface CompatResult {
  module: string;
  method: string;
  status: 'PASS' | 'FAIL' | 'NOT_IMPLEMENTED';
}

const results: CompatResult[] = [];

function record(module: string, method: string, status: CompatResult['status']) {
  results.push({ module, method, status });
}

let engine: CatalystEngine;
let fs: CatalystFS;

// Shared engine for all compat tests
const setup = (async () => {
  fs = await CatalystFS.create('compat-node');
  fs.writeFileSync('/test.txt', 'hello world');
  fs.mkdirSync('/testdir', { recursive: true });
  fs.writeFileSync('/testdir/a.txt', 'aaa');
  fs.writeFileSync('/testdir/b.txt', 'bbb');
  engine = await CatalystEngine.create({ fs });
})();

async function evalSafe(code: string): Promise<any> {
  await setup;
  try {
    return await engine.eval(code);
  } catch {
    return undefined;
  }
}

async function testMethod(
  module: string,
  method: string,
  code: string,
  validator: (result: any) => boolean,
) {
  const result = await evalSafe(code);
  if (result === undefined) {
    record(module, method, 'NOT_IMPLEMENTED');
  } else if (validator(result)) {
    record(module, method, 'PASS');
  } else {
    record(module, method, 'FAIL');
  }
}

// ---- fs module ----

describe('Node.js Compat — fs', () => {
  it('fs.readFileSync', async () => {
    await testMethod('fs', 'readFileSync', `require('fs').readFileSync('/test.txt', 'utf-8')`, (r) => r === 'hello world');
  });
  it('fs.writeFileSync', async () => {
    await testMethod('fs', 'writeFileSync', `require('fs').writeFileSync('/compat-write.txt', 'test'); require('fs').readFileSync('/compat-write.txt', 'utf-8')`, (r) => r === 'test');
  });
  it('fs.existsSync', async () => {
    await testMethod('fs', 'existsSync', `require('fs').existsSync('/test.txt')`, (r) => r === true);
  });
  it('fs.mkdirSync', async () => {
    await testMethod('fs', 'mkdirSync', `require('fs').mkdirSync('/compat-dir', { recursive: true }); require('fs').existsSync('/compat-dir')`, (r) => r === true);
  });
  it('fs.readdirSync', async () => {
    await testMethod('fs', 'readdirSync', `JSON.stringify(require('fs').readdirSync('/testdir'))`, (r) => { try { const arr = JSON.parse(r); return Array.isArray(arr) && arr.length >= 2; } catch { return false; } });
  });
  it('fs.statSync', async () => {
    await testMethod('fs', 'statSync', `JSON.stringify(require('fs').statSync('/test.txt'))`, (r) => { try { const s = JSON.parse(r); return 'isFile' in s; } catch { return false; } });
  });
  it('fs.unlinkSync', async () => {
    await testMethod('fs', 'unlinkSync', `require('fs').writeFileSync('/compat-del.txt', 'x'); require('fs').unlinkSync('/compat-del.txt'); !require('fs').existsSync('/compat-del.txt')`, (r) => r === true);
  });
  it('fs.renameSync', async () => {
    await testMethod('fs', 'renameSync', `require('fs').writeFileSync('/compat-ren.txt', 'x'); require('fs').renameSync('/compat-ren.txt', '/compat-renamed.txt'); require('fs').existsSync('/compat-renamed.txt')`, (r) => r === true);
  });
  it('fs.copyFileSync', async () => {
    await testMethod('fs', 'copyFileSync', `require('fs').writeFileSync('/compat-cp.txt', 'copy'); require('fs').copyFileSync('/compat-cp.txt', '/compat-cp2.txt'); require('fs').readFileSync('/compat-cp2.txt', 'utf-8')`, (r) => r === 'copy');
  });
  it('fs.appendFileSync', async () => {
    await testMethod('fs', 'appendFileSync', `require('fs').writeFileSync('/compat-app.txt', 'a'); require('fs').appendFileSync('/compat-app.txt', 'b'); require('fs').readFileSync('/compat-app.txt', 'utf-8')`, (r) => r === 'ab');
  });
  it('fs.rmdirSync', async () => {
    await testMethod('fs', 'rmdirSync', `require('fs').mkdirSync('/compat-rmdir'); require('fs').rmdirSync('/compat-rmdir'); !require('fs').existsSync('/compat-rmdir')`, (r) => r === true);
  });
});

// ---- path module ----

describe('Node.js Compat — path', () => {
  it('path.join', async () => {
    await testMethod('path', 'join', `require('path').join('/foo', 'bar', 'baz')`, (r) => r === '/foo/bar/baz');
  });
  it('path.resolve', async () => {
    await testMethod('path', 'resolve', `require('path').resolve('/foo', './bar')`, (r) => r === '/foo/bar');
  });
  it('path.basename', async () => {
    await testMethod('path', 'basename', `require('path').basename('/foo/bar/baz.txt')`, (r) => r === 'baz.txt');
  });
  it('path.dirname', async () => {
    await testMethod('path', 'dirname', `require('path').dirname('/foo/bar/baz.txt')`, (r) => r === '/foo/bar');
  });
  it('path.extname', async () => {
    await testMethod('path', 'extname', `require('path').extname('file.ts')`, (r) => r === '.ts');
  });
  it('path.normalize', async () => {
    await testMethod('path', 'normalize', `require('path').normalize('/foo//bar/../baz')`, (r) => r === '/foo/baz');
  });
  it('path.isAbsolute', async () => {
    await testMethod('path', 'isAbsolute', `require('path').isAbsolute('/foo')`, (r) => r === true);
  });
  it('path.sep', async () => {
    await testMethod('path', 'sep', `require('path').sep`, (r) => r === '/');
  });
  it('path.parse', async () => {
    await testMethod('path', 'parse', `JSON.stringify(require('path').parse('/foo/bar.txt'))`, (r) => { try { const p = JSON.parse(r); return p.base === 'bar.txt'; } catch { return false; } });
  });
});

// ---- buffer module ----

describe('Node.js Compat — buffer', () => {
  it('Buffer.from string', async () => {
    await testMethod('buffer', 'Buffer.from(string)', `require('buffer').Buffer.from('hello').toString()`, (r) => r === 'hello');
  });
  it('Buffer.alloc', async () => {
    await testMethod('buffer', 'Buffer.alloc', `require('buffer').Buffer.alloc(4).length`, (r) => r === 4);
  });
  it('Buffer.isBuffer', async () => {
    await testMethod('buffer', 'Buffer.isBuffer', `var B = require('buffer').Buffer; B.isBuffer(B.from('x'))`, (r) => r === true);
  });
  it('Buffer.concat', async () => {
    await testMethod('buffer', 'Buffer.concat', `var B = require('buffer').Buffer; B.concat([B.from('a'), B.from('b')]).toString()`, (r) => r === 'ab');
  });
});

// ---- events module ----

describe('Node.js Compat — events', () => {
  it('EventEmitter on/emit', async () => {
    await testMethod('events', 'on/emit', `var EE = require('events'); var e = new EE(); var v = 0; e.on('x', function(n) { v = n; }); e.emit('x', 42); v`, (r) => r === 42);
  });
  it('EventEmitter once', async () => {
    await testMethod('events', 'once', `var EE = require('events'); var e = new EE(); var c = 0; e.once('x', function() { c++; }); e.emit('x'); e.emit('x'); c`, (r) => r === 1);
  });
  it('EventEmitter removeAllListeners', async () => {
    await testMethod('events', 'removeAllListeners', `var EE = require('events'); var e = new EE(); e.on('x', function(){}); e.removeAllListeners('x'); e.listenerCount('x')`, (r) => r === 0);
  });
  it('EventEmitter listenerCount', async () => {
    await testMethod('events', 'listenerCount', `var EE = require('events'); var e = new EE(); e.on('x', function(){}); e.on('x', function(){}); e.listenerCount('x')`, (r) => r === 2);
  });
});

// ---- process module ----

describe('Node.js Compat — process', () => {
  it('process.env', async () => {
    await testMethod('process', 'env', `typeof require('process').env`, (r) => r === 'object');
  });
  it('process.cwd', async () => {
    await testMethod('process', 'cwd()', `typeof require('process').cwd()`, (r) => r === 'string');
  });
  it('process.platform', async () => {
    await testMethod('process', 'platform', `require('process').platform`, (r) => r === 'browser');
  });
  it('process.version', async () => {
    await testMethod('process', 'version', `typeof require('process').version`, (r) => r === 'string');
  });
});

// ---- assert module ----

describe('Node.js Compat — assert', () => {
  it('assert.ok', async () => {
    await testMethod('assert', 'ok', `require('assert').ok(true); 'passed'`, (r) => r === 'passed');
  });
  it('assert.equal', async () => {
    await testMethod('assert', 'equal', `require('assert').equal(1, 1); 'passed'`, (r) => r === 'passed');
  });
  it('assert.strictEqual', async () => {
    await testMethod('assert', 'strictEqual', `require('assert').strictEqual(1, 1); 'passed'`, (r) => r === 'passed');
  });
  it('assert.deepEqual', async () => {
    await testMethod('assert', 'deepEqual', `require('assert').deepEqual({a:1}, {a:1}); 'passed'`, (r) => r === 'passed');
  });
});

// ---- crypto module ----

describe('Node.js Compat — crypto', () => {
  it('crypto.randomUUID', async () => {
    await testMethod('crypto', 'randomUUID', `require('crypto').randomUUID()`, (r) => typeof r === 'string' && r.length === 36);
  });
  it('crypto.randomBytes', async () => {
    await testMethod('crypto', 'randomBytes', `require('crypto').randomBytes(16).length`, (r) => r === 16);
  });
  it('crypto.createHash', async () => {
    await testMethod('crypto', 'createHash', `require('crypto').createHash('sha256').update('test').digest('hex')`, (r) => typeof r === 'string' && r.length === 64);
  });
});

// ---- util module ----

describe('Node.js Compat — util', () => {
  it('util.format', async () => {
    await testMethod('util', 'format', `require('util').format('hello %s', 'world')`, (r) => r === 'hello world');
  });
  it('util.inspect', async () => {
    await testMethod('util', 'inspect', `require('util').inspect({a: 1})`, (r) => typeof r === 'string' && r.includes('a'));
  });
});

// ---- url module ----

describe('Node.js Compat — url', () => {
  it('URL constructor', async () => {
    await testMethod('url', 'URL', `var u = new (require('url').URL)('https://example.com/path'); u.hostname`, (r) => r === 'example.com');
  });
  it('URLSearchParams', async () => {
    await testMethod('url', 'URLSearchParams', `var s = new (require('url').URLSearchParams)('a=1&b=2'); s.get('a')`, (r) => r === '1');
  });
});

// ---- console module ----

describe('Node.js Compat — console', () => {
  it('console.log', async () => {
    await testMethod('console', 'log', `console.log('test'); 'ok'`, (r) => r === 'ok');
  });
  it('console.error', async () => {
    await testMethod('console', 'error', `console.error('test'); 'ok'`, (r) => r === 'ok');
  });
  it('console.warn', async () => {
    await testMethod('console', 'warn', `console.warn('test'); 'ok'`, (r) => r === 'ok');
  });
});

// ---- Report ----

afterAll(async () => {
  await setup;
  engine.dispose();
  fs.destroy();

  // Generate compatibility report
  const modules = new Map<string, { pass: number; total: number }>();
  for (const r of results) {
    if (!modules.has(r.module)) modules.set(r.module, { pass: 0, total: 0 });
    const m = modules.get(r.module)!;
    m.total++;
    if (r.status === 'PASS') m.pass++;
  }

  console.log('\n=== Catalyst Node.js Compatibility Report ===');
  let totalPass = 0;
  let totalCount = 0;
  for (const [name, { pass, total }] of modules) {
    const pct = ((pass / total) * 100).toFixed(1);
    console.log(`${name.padEnd(15)} ${pass}/${total} methods (${pct}%)`);
    totalPass += pass;
    totalCount += total;
  }
  console.log('---');
  const totalPct = ((totalPass / totalCount) * 100).toFixed(1);
  console.log(`TOTAL:          ${totalPass}/${totalCount} methods (${totalPct}%)`);
  console.log('');
});
