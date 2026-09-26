// csvlite 的生成实现。
//
// 对外契约见 README「对外契约」：format 接收二维数组、生成文本，行间用换行连接，
// 结尾不带换行；字段含分隔符 / 引号 / 换行时加引号包裹，引号用双写表示。

import { resolveDialect } from './dialect.js';

/**
 * 把二维数组写成 CSV 文本。
 *
 * @param {string[][]} rows
 * @param {object} [dialect]
 * @returns {string}
 */
export function format(rows, dialect) {
  const d = resolveDialect(dialect);
  return rows
    .map((row) => row.map((value) => formatField(value, d)).join(d.delimiter))
    .join('\n');
}

function formatField(value, d) {
  const s = value === undefined || value === null ? '' : String(value);
  if (!needsQuote(s, d)) return s;
  let out = '';
  for (const ch of s) {
    if (ch === d.quote) out += d.quote + d.quote;
    else out += ch;
  }
  return d.quote + out + d.quote;
}

function needsQuote(s, d) {
  return (
    s.includes(d.delimiter) ||
    s.includes(d.quote) ||
    s.includes('\n') ||
    s.includes('\r')
  );
}
