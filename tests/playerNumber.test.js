import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizePlayerNumber } from '../src/utils/playerNumber.js';

test('normalizePlayerNumber keeps valid values (e.g., 07)', () => {
  assert.equal(normalizePlayerNumber('07'), '07');
  assert.equal(normalizePlayerNumber('  5 '), '5');
});

test('normalizePlayerNumber removes value when empty or null', () => {
  assert.equal(normalizePlayerNumber('   '), null);
  assert.equal(normalizePlayerNumber(null), null);
});

test('normalizePlayerNumber rejects letters or more than 3 digits', () => {
  assert.throws(() => normalizePlayerNumber('12a'), /digits/);
  assert.throws(() => normalizePlayerNumber('1234'), /digits/);
});
