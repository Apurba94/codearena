import assert from 'node:assert/strict';
import { test } from 'node:test';
import { check } from '../server/judge/checker.js';

test('tokens: whitespace-insensitive', () => {
  assert.ok(check('tokens', '1 2\n3\n', '1   2 3').ok);
  assert.ok(check('tokens', '7\n', '7\r\n\r\n').ok);
  assert.equal(check('tokens', '1 2 3', '1 2 4').ok, false);
  assert.match(check('tokens', '1 2 3', '1 2 4').message, /3rd token/);
  assert.match(check('tokens', '1 2 3', '1 2').message, /too short/);
  assert.match(check('tokens', '1', '1 2').message, /extra output/);
});

test('tokens-ci: case-insensitive', () => {
  assert.ok(check('tokens-ci', 'YES\nNO', 'yes No').ok);
  assert.equal(check('tokens', 'YES', 'yes').ok, false);
});

test('float: absolute or relative error', () => {
  assert.ok(check('float:1e-6', '3.0000000', '3.0000004').ok);
  assert.ok(check('float:1e-6', '1000000000', '1000000500').ok); // relative 5e-7
  assert.equal(check('float:1e-6', '1.0', '1.00001').ok, false);
  assert.equal(check('float:1e-6', 'abc 1.0', 'abd 1.0').ok, false);
});

test('lines: trailing spaces and blank lines ignored, inner spacing kept', () => {
  assert.ok(check('lines', 'a b\nc\n', 'a b  \nc\n\n\n').ok);
  assert.equal(check('lines', 'a b', 'a  b').ok, false);
});

test('exact: only CRLF and final newline are normalised', () => {
  assert.ok(check('exact', 'x\ny\n', 'x\r\ny').ok);
  assert.equal(check('exact', 'x y', 'x  y').ok, false);
});
