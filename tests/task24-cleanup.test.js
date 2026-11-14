// Task 24 checks: performance and cleanup. Static checks on source files, plus one import of the
// real frontend ui modules (they touch the DOM only inside functions, so Node can load them).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const FRONTEND_JS = path.join(ROOT, 'frontend', 'js');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

function walkJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkJs(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

// Returns top-level CSS blocks as {prelude, body}. Comments are skipped, and nested blocks stay in body.
function topLevelBlocks(css) {
  const blocks = [];
  let depth = 0;
  let start = 0;
  let prelude = '';
  for (let i = 0; i < css.length; i += 1) {
    if (css[i] === '/' && css[i + 1] === '*') {
      i = css.indexOf('*/', i + 2) + 1;
      continue;
    }
    if (css[i] === '{') {
      if (depth === 0) {
        prelude = css.slice(start, i).replace(/\/\*[\s\S]*?\*\//g, '').trim();
        start = i + 1;
      }
      depth += 1;
    } else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        blocks.push({ prelude, body: css.slice(start, i) });
        start = i + 1;
      }
    }
  }
  return blocks;
}

test('every @keyframes in animations.css animates only transform and opacity', () => {
  const keyframes = topLevelBlocks(read('frontend', 'css', 'animations.css'))
    .filter((block) => block.prelude.startsWith('@keyframes'));
  assert.ok(keyframes.length >= 5, 'expected the zombie, reveal, defeat, dirt, and fade keyframes');

  const offenders = [];
  for (const block of keyframes) {
    const properties = [...block.body.matchAll(/([a-zA-Z-]+)\s*:/g)].map((m) => m[1]);
    for (const property of properties) {
      if (property !== 'transform' && property !== 'opacity') {
        offenders.push(`${block.prelude}: ${property}`);
      }
    }
  }
  assert.deepEqual(offenders, [], 'keyframes must not animate layout properties (design 3.2 and 9)');
});

test('frontend JavaScript has no console.log calls', () => {
  const offenders = [];
  for (const file of walkJs(FRONTEND_JS)) {
    const code = stripComments(fs.readFileSync(file, 'utf8'));
    if (/console\.log\s*\(/.test(code)) offenders.push(path.relative(ROOT, file));
  }
  assert.deepEqual(offenders, [], 'remove console.log from these files');
});

test('backend request and controller code has no console.log, and keeps console.error', () => {
  const requestCode = [
    'backend/controllers/lookupController.js',
    'backend/controllers/collegeController.js',
    'backend/controllers/deadlineController.js',
    'backend/controllers/applicationController.js',
    'backend/controllers/lookupController.js',
    'backend/middleware/errorHandler.js',
    'backend/routes/colleges.js',
    'backend/routes/lookup.js',
    'backend/routes/deadlines.js',
    'backend/routes/applications.js',
  ];
  for (const file of new Set(requestCode)) {
    assert.doesNotMatch(stripComments(read(file)), /console\.log\s*\(/, `${file} still has console.log`);
  }

  // design 8.3: database and server errors are logged server-side, so these must stay.
  assert.match(read('backend/middleware/errorHandler.js'), /console\.error\(/);
  assert.match(read('backend/controllers/lookupController.js'), /console\.error\(/);
});

test('every exported function in frontend/js has a JSDoc block directly above it', () => {
  const exportPattern = /^export (?:async )?(?:function\*? \w+\(|class \w+|const \w+ = (?:async )?\()/;
  const missing = [];
  let checked = 0;
  for (const file of walkJs(FRONTEND_JS)) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!exportPattern.test(line)) return;
      checked += 1;
      let above = index - 1;
      while (above >= 0 && lines[above].trim() === '') above -= 1;
      if (above < 0 || !lines[above].trim().endsWith('*/')) {
        missing.push(`${path.relative(ROOT, file)}:${index + 1} ${line.trim()}`);
      }
    });
  }
  assert.ok(checked >= 30, `expected to check at least 30 exports, checked ${checked}`);
  assert.deepEqual(missing, [], 'add a brief JSDoc block to these exports');
});

test('index.html and deadlines.html declare a device-width viewport for the 375px layout', () => {
  for (const page of ['index.html', 'deadlines.html']) {
    assert.match(
      read('frontend', page),
      /<meta name="viewport" content="width=device-width, initial-scale=1\.0">/,
      `${page} is missing the responsive viewport meta tag`,
    );
  }
});

test('style.css uses only the single 768px breakpoint (requirements section 4)', () => {
  const css = read('frontend', 'css', 'style.css');
  const breakpoints = [...css.matchAll(/@media\s*\(([^)]*)\)/g)].map((m) => m[1].replace(/\s+/g, ' ').trim());
  assert.ok(breakpoints.length >= 1, 'expected at least one media query');
  for (const query of breakpoints) {
    assert.equal(query, 'max-width: 768px', `unexpected media query: ${query}`);
  }
});

test('the search debounce is 300 ms and the form module loads without a DOM', async () => {
  const form = await import(pathToFileURL(path.join(FRONTEND_JS, 'ui', 'form.js')).href);
  assert.equal(form.SEARCH_DEBOUNCE_MS, 300);
  assert.equal(typeof form.setupSearchInput, 'function');
});
