// csvlite 的方言定义与归一化。
//
// 方言决定字段怎么切分、引号怎么写、行怎么断。对外契约见 README「对外契约」第 2 条。

export const DEFAULT_DIALECT = Object.freeze({
  delimiter: ',',
  quote: '"',
  escape: '"',
  newline: '\n',
  hasHeader: false,
});

/**
 * 把用户传入的方言与默认值合并，返回一个字段齐全的方言对象。
 * 未显式给出的选项取默认值。
 *
 * @param {object} [dialect]
 * @returns {{delimiter: string, quote: string, escape: string, newline: string, hasHeader: boolean}}
 */
export function resolveDialect(dialect) {
  const d = { ...DEFAULT_DIALECT, ...(dialect ?? {}) };
  return d;
}
