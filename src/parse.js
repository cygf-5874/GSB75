// csvlite 的解析实现。
//
// 对外契约见 README「对外契约」：parse 返回二维数组（行 × 字段），
// 每个字段都是字符串。方言通过可选的第二个参数给出。

import { resolveDialect } from './dialect.js';

/** CSV 解析错误。 */
export class CsvError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CsvError';
  }
}

/**
 * 把文本解析成二维数组（行 × 字段）。
 *
 * @param {string} text
 * @param {object} [dialect]
 * @returns {string[][]}
 */
export function parse(text, dialect) {
  const d = resolveDialect(dialect);
  const { delimiter, quote } = d;

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];

    if (inQuotes) {
      if (c === quote) {
        if (text[i + 1] === quote) {
          field += quote;
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c === quote && field === '') {
      inQuotes = true;
    } else {
      field += c;
    }
  }

  return rows;
}
