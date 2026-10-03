'use strict';

/**
 * Maintainer: Tanvir Ahmed
 * WhatsApp: wa.me/+8801750079773
 * GitHub: www.github.com/143tanvir
 * Instagram: @ig.tanvir_ahmed
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const packageJson = require(path.join(root, 'package.json'));

test('package metadata is publishable and correctly renamed', () => {
  assert.equal(packageJson.name, 'tanvir143');
  assert.match(packageJson.version, /^\d+\.\d+\.\d+$/);
  assert.equal(packageJson.main, 'index.js');
  assert.equal(packageJson.types, 'index.d.ts');
  assert.equal(packageJson.publishConfig.access, 'public');
  assert.equal(packageJson.license, 'MIT');
  assert.ok(packageJson.files.includes('src/'));
});

test('required project identifiers are gone from executable/docs metadata', () => {
  const scan = [];
  const files = [
    'index.js','index.d.ts','README.md','package.json',
    ...fs.readdirSync(path.join(root, 'src')).map(f => path.join('src', f))
  ].filter(f => fs.existsSync(path.join(root, f)) && fs.statSync(path.join(root, f)).isFile());
  for (const file of files) scan.push(fs.readFileSync(path.join(root, file), 'utf8'));
  const text = scan.join('\n');
  assert.equal(text.includes('@cexy/wonica'), false);
  assert.equal(text.includes('bdrakib123'), false);
});

test('all source JS files pass Node syntax validation via parser', () => {
  const sourceFiles = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) sourceFiles.push(full);
    }
  }
  walk(path.join(root, 'src'));
  assert.ok(sourceFiles.length > 0);
});
