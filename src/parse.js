// csvlite 的解析实现。
//
// 对外契约见 README「对外契约」：parse 返回二维数组（行 × 字段），
// 每个字段都是字符串；createParser 分块增量解析，与一次性解析逐字段一致。
// 方言通过可选的第二个参数给出。

import { resolveDialect } from './dialect.js';

/** CSV 解析错误。 */
export class CsvError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CsvError';
  }
}

// 增量扫描器：逐字符消费文本，产出「行结束符已到齐」的完整行。
// 跨块边界的状态（引号、转义、\r\n 拆分）都保存在实例字段里，
// parse 与 createParser 共用它，保证流式与一次性结果逐字段相同。
class Scanner {
  constructor(d) {
    this.delimiter = d.delimiter;
    this.quote = d.quote;
    this.escape = d.escape;
    this.doubleEscape = d.escape === d.quote;
    this.field = '';
    this.row = [];
    this.lineStarted = false;
    this.inQuotes = false;
    this.pendingQuote = false; // 引号内刚看到 quote，等下一个字符判定双写还是闭合
    this.pendingEscape = false; // 引号内刚看到 escape，等下一个字符
    this.pendingCR = false; // 引号外刚看到 \r，等下一个字符判定是否 \r\n
  }

  feed(chunk) {
    const rows = [];
    for (let i = 0; i < chunk.length; i += 1) {
      const c = chunk[i];

      if (this.pendingCR) {
        this.pendingCR = false;
        this.finishLine(rows); // \r 与 \r\n 都算作行结束
        if (c === '\n') continue;
      }
      if (this.pendingQuote) {
        this.pendingQuote = false;
        if (c === this.quote) {
          this.field += this.quote; // 双写 quote 表示一个字面 quote
          continue;
        }
        this.inQuotes = false;
      }
      if (this.pendingEscape) {
        this.pendingEscape = false;
        if (c === this.quote || c === this.escape) {
          this.field += c;
          continue;
        }
        this.field += this.escape; // escape 只转义 quote 与自身，其余原样保留
      }

      if (this.inQuotes) {
        if (!this.doubleEscape && c === this.escape) {
          this.pendingEscape = true;
        } else if (c === this.quote) {
          if (this.doubleEscape) this.pendingQuote = true;
          else this.inQuotes = false;
        } else {
          this.field += c; // 引号内的分隔符与换行都是内容
        }
        continue;
      }

      if (c === this.delimiter) {
        this.row.push(this.field);
        this.field = '';
        this.lineStarted = true;
      } else if (c === '\n') {
        this.finishLine(rows);
      } else if (c === '\r') {
        this.pendingCR = true;
      } else if (c === this.quote && this.field === '') {
        this.inQuotes = true;
        this.lineStarted = true;
      } else {
        this.field += c; // 字段首尾空白原样保留
        this.lineStarted = true;
      }
    }
    return rows;
  }

  finish() {
    const rows = [];
    if (this.pendingCR) {
      this.pendingCR = false;
      this.finishLine(rows);
    }
    if (this.pendingQuote) {
      this.pendingQuote = false;
      this.inQuotes = false;
    }
    if (this.pendingEscape) {
      this.pendingEscape = false;
      this.field += this.escape;
    }
    if (this.inQuotes) {
      throw new CsvError('引号未闭合：文本在引号包裹的字段中间结束');
    }
    if (this.lineStarted) this.finishLine(rows); // 末尾无换行也能收尾
    return rows;
  }

  finishLine(rows) {
    if (!this.lineStarted) return; // 长度为 0 的行跳过
    this.row.push(this.field);
    rows.push(this.row);
    this.row = [];
    this.field = '';
    this.lineStarted = false;
  }
}

// hasHeader 为真时：首行当键，其后各行映射成对象。
function makeConverter(d) {
  if (!d.hasHeader) return (rows) => rows;
  let header = null;
  return (rows) => {
    const out = [];
    for (const row of rows) {
      if (header === null) {
        header = row;
        continue;
      }
      const obj = {};
      for (let i = 0; i < header.length && i < row.length; i += 1) {
        obj[header[i]] = row[i];
      }
      out.push(obj);
    }
    return out;
  };
}

function stripBom(text) {
  return text.length > 0 && text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * 把文本解析成二维数组（行 × 字段）；dialect.hasHeader 为真时返回对象数组。
 *
 * @param {string} text
 * @param {object} [dialect]
 * @returns {string[][] | object[]}
 */
export function parse(text, dialect) {
  const d = resolveDialect(dialect);
  const scanner = new Scanner(d);
  const rows = [...scanner.feed(stripBom(text)), ...scanner.finish()];
  return makeConverter(d)(rows);
}

/**
 * 创建一个增量解析器，返回 { write(chunk), end() }。
 * write 返回本次新完成的完整行，end 返回剩余未能完成的行；
 * 未闭合的引号在 end() 里抛 CsvError。
 *
 * @param {object} [dialect]
 * @returns {{write(chunk: string): any[], end(): any[]}}
 */
export function createParser(dialect) {
  const d = resolveDialect(dialect);
  const scanner = new Scanner(d);
  const convert = makeConverter(d);
  let started = false;
  return {
    write(chunk) {
      if (!started) {
        if (chunk.length === 0) return [];
        started = true;
        chunk = stripBom(chunk); // 只剥离文本开头的 BOM
      }
      return convert(scanner.feed(chunk));
    },
    end() {
      return convert(scanner.finish());
    },
  };
}
