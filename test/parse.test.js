import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parse, format } from '../src/index.js';

// 既有用例：只覆盖逗号分隔、双引号、字段内不含换行的样本。

test('parse：两行两列', () => {
  assert.deepEqual(parse('a,b\nc,d\n'), [
    ['a', 'b'],
    ['c', 'd'],
  ]);
});

test('parse：单行单列', () => {
  assert.deepEqual(parse('x\n'), [['x']]);
});

test('parse：空字段保留为 3 个字段', () => {
  assert.deepEqual(parse('a,,b\n'), [['a', '', 'b']]);
});

test('parse：引号内的分隔符属于字段内容', () => {
  assert.deepEqual(parse('"a,b",c\n'), [['a,b', 'c']]);
});

test('parse：双写引号表示一个字面引号', () => {
  assert.deepEqual(parse('"a""b"\n'), [['a"b']]);
});

test('parse：引号包裹的普通字段去掉外层引号', () => {
  assert.deepEqual(parse('"a",b\n'), [['a', 'b']]);
});

test('parse：末尾换行不多出一行', () => {
  const rows = parse('a,b\n');
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], ['a', 'b']);
});

test('parse：引号包起来的空字段是一个空字段', () => {
  assert.deepEqual(parse('"",x\n'), [['', 'x']]);
});

test('format：多行用换行连接且结尾不带换行', () => {
  assert.equal(format([['a', 'b'], ['c', 'd']]), 'a,b\nc,d');
});

test('format：含分隔符与引号的字段加引号并双写', () => {
  assert.equal(format([['a,b', 'c"d']]), '"a,b","c""d"');
});

test('format：字段首尾空白原样保留', () => {
  assert.equal(format([[' a ', 'b']]), ' a ,b');
});

test('parse + format：往返后字段一致', () => {
  const rows = [['a', 'b,c', 'd"e']];
  assert.deepEqual(parse(format(rows) + '\n'), rows);
});

test('parse：字段个数与顺序稳定', () => {
  const rows = parse('one\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].length, 1);
  assert.equal(rows[0][0], 'one');
});

test('format：单个字段单行', () => {
  assert.equal(format([['x']]), 'x');
});
