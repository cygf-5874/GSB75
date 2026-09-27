// csvlite 的解析实现。
//
// 对外契约见 README「对外契约」：parse 返回二维数组（行 × 字段），
// 每个字段都是字符串；createParser 返回 { write(chunk), end() } 做分块增量解析。
// parse 与 createParser 共用同一台增量状态机，保证任意块大小下结果逐字段一致。

import { resolveDialect } from './dialect.js';

/** CSV 解析错误。 */
export class CsvError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CsvError';
  }
}

// 状态机的四个状态。
const TEXT = 0; // 字段外（或字段未加引号的部分）
const IN_QUOTES = 1; // 引号内
const QUOTE_IN_QUOTES = 2; // 引号内刚看到一个 quote，等下一个字符决定是转义还是收尾
const ESCAPE_IN_QUOTES = 3; // 引号内刚看到一个 escape（escape !== quote 时）

/**
 * 增量 CSV 状态机。字符逐个喂入，完成的行通过返回值吐出。
 * 不读文件、不碰环境，同输入同输出。
 */
class Machine {
  constructor(dialect) {
    this.d = dialect;
    this.state = TEXT;
    this.field = '';
    this.row = [];
    this.rows = [];
    this.lineEmpty = true; // 当前行还没有消费过任何字符
    this.skipLf = false; // 上一行以 \r 收尾，跳过紧跟的 \n
    this.started = false; // 是否已处理过第一个字符（用于剥离开头 BOM）
  }

  // 喂入一段文本，返回本次新完成的行（数组，可为空）。
  feed(chunk) {
    this.rows = [];
    for (let i = 0; i < chunk.length; i += 1) {
      this.step(chunk[i]);
    }
    const out = this.rows;
    this.rows = [];
    return out;
  }

  step(c) {
    if (!this.started) {
      this.started = true;
      if (c === '\uFEFF') return; // 开头的 BOM 剥离；字段中间的 BOM 是普通字符
    }
    if (this.skipLf) {
      this.skipLf = false;
      if (c === '\n') return;
    }

    switch (this.state) {
      case IN_QUOTES:
        if (c === this.d.quote) {
          this.state = QUOTE_IN_QUOTES;
        } else if (c === this.d.escape && this.d.escape !== this.d.quote) {
          this.state = ESCAPE_IN_QUOTES;
        } else {
          this.field += c; // 引号内的一切（含分隔符与换行）都是内容
        }
        return;

      case ESCAPE_IN_QUOTES:
        if (c === this.d.quote || c === this.d.escape) {
          this.field += c;
          this.state = IN_QUOTES;
        } else {
          this.field += this.d.escape; // escape 只转义 quote 与自身，其余原样保留
          this.state = IN_QUOTES;
          this.step(c);
        }
        return;

      case QUOTE_IN_QUOTES:
        if (c === this.d.quote && this.d.escape === this.d.quote) {
          this.field += this.d.quote; // 双写 quote 表示一个字面 quote
          this.state = IN_QUOTES;
        } else {
          this.state = TEXT; // 引号收尾，当前字符按字段外重新处理
          this.step(c);
        }
        return;

      default: // TEXT
        if (c === this.d.delimiter) {
          this.row.push(this.field);
          this.field = '';
          this.lineEmpty = false;
        } else if (c === '\n') {
          this.endRow();
        } else if (c === '\r') {
          this.endRow();
          this.skipLf = true;
        } else if (c === this.d.quote && this.field === '') {
          this.state = IN_QUOTES;
          this.lineEmpty = false;
        } else {
          this.field += c; // 空白原样保留，不做 trim
          this.lineEmpty = false;
        }
    }
  }

  endRow() {
    if (this.lineEmpty) return; // 长度为 0 的行跳过；"" 是空字段不是空行
    this.row.push(this.field);
    this.rows.push(this.row);
    this.row = [];
    this.field = '';
    this.lineEmpty = true;
  }

  // 声明输入结束：未闭合的引号抛 CsvError，其余收尾返回剩余的行。
  finish() {
    if (this.state === IN_QUOTES || this.state === ESCAPE_IN_QUOTES) {
      throw new CsvError('未闭合的引号：文本在引号内结束');
    }
    if (this.state === QUOTE_IN_QUOTES) this.state = TEXT;
    this.rows = [];
    this.endRow();
    const out = this.rows;
    this.rows = [];
    return out;
  }
}

// 把状态机产出的行包装成 parse 的返回形状（hasHeader 时映射为对象数组）。
function makeSink(d) {
  let header = null;
  return (rows, out) => {
    for (const row of rows) {
      if (d.hasHeader) {
        if (header === null) {
          header = row;
        } else {
          const obj = {};
          for (let i = 0; i < header.length; i += 1) obj[header[i]] = row[i];
          out.push(obj);
        }
      } else {
        out.push(row);
      }
    }
  };
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
  const machine = new Machine(d);
  const sink = makeSink(d);
  const out = [];
  sink(machine.feed(String(text)), out);
  sink(machine.finish(), out);
  return out;
}

/**
 * 创建一个增量解析器：write(chunk) 返回本次新完成的完整行，
 * end() 返回剩余未能完成的行（未闭合引号时抛 CsvError）。
 *
 * @param {object} [dialect]
 * @returns {{write(chunk: string): any[], end(): any[]}}
 */
export function createParser(dialect) {
  const d = resolveDialect(dialect);
  const machine = new Machine(d);
  const sink = makeSink(d);
  return {
    write(chunk) {
      const out = [];
      sink(machine.feed(String(chunk)), out);
      return out;
    },
    end() {
      const out = [];
      sink(machine.finish(), out);
      return out;
    },
  };
}
