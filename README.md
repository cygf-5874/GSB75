# csvlite

一个零依赖的 **CSV 读写库**：`parse` 把文本读成二维数组（行 × 字段），`format` 把行写回文本，
`createParser` 支持把同一份文本按任意块大小分块增量喂入。方言（分隔符、引号、转义、换行风格、
表头）通过一个可选的 `dialect` 对象配置。

```js
import { parse, format, createParser, CsvError } from './src/index.js';

parse('a,"b,c",d\n');                       // [['a', 'b,c', 'd']]
format([['a', 'b,c', 'd']]);                // 'a,"b,c",d'

const p = createParser();
const rows = [...p.write('a,"b'), ...p.write(',c",d\n'), ...p.end()];
```

## 目录

```
package.json        ESM 包描述，无 dependencies
README.md           本文件（「对外契约」一节的唯一出处）
src/index.js        公开入口：re-export parse / format / createParser / CsvError / DEFAULT_DIALECT
src/parse.js        解析：parse 与 createParser
src/format.js       生成：format
src/dialect.js      方言默认值与归一化
test/parse.test.js  既有用例（14 个）
check/check.mjs     固定验收程序（勿改）
scripts/check.sh    固定验收入口（勿改）
```

## 语言版本前提

- Node.js 22（`node` v22.22.2 已验证）。
- ESM（`package.json` 里 `"type": "module"`）。
- **只用 `node:` 内置模块**，`package.json` 不含 `dependencies`。

## 怎么跑

```bash
node --test                      # 既有用例（自动发现 test/ 下的 *.test.js）
node --test test/parse.test.js   # 只跑这个文件
bash scripts/check.sh            # 固定验收；支持 -list 与 --only <组名>
```

> Windows 上 `node --test <目录>`（如 `node --test test/`）**不会展开目录**，
> 要跑全部用例请用**无参数**的 `node --test`，或直接把文件路径给它。

退出码：全部场景通过 `0`，否则 `1`。

## 公开 API

| 符号 | 语义 |
| --- | --- |
| `parse(text, dialect?)` | 把 `text` 解析成二维数组（行 × 字段）；`dialect.hasHeader` 为真时返回对象数组 |
| `format(rows, dialect?)` | 把二维数组写成文本；行间用 `dialect.newline` 连接，**结尾不带换行** |
| `createParser(dialect?)` | 返回 `{ write(chunk), end() }`，分块增量解析 |
| `CsvError` | CSV 错误类型（如引号未闭合） |
| `DEFAULT_DIALECT` | 方言默认值（冻结对象） |

## 对外契约

下面 12 条是 `csvlite` 的**对外契约**，实现必须全部守住；它们是本题验收点的唯一出处。

1. **读写入口**。`parse(text, dialect?)` 返回**二维数组**（行 × 字段），每个字段都是字符串；
   `format(rows, dialect?)` 接收二维数组、生成文本（字符之间不插入多余空白）。
2. **方言选项**。`dialect` 的字段：
   - `delimiter`（单字符，默认 `,`）——字段分隔符；
   - `quote`（单字符，默认 `"`）——引号字符；
   - `escape`（单字符，默认**等于** `quote`，即用**双写**表示一个字面 `quote`）；
   - `newline`（`\n` 或 `\r\n`，默认 `\n`）——`format` 生成时使用；
   - `hasHeader`（布尔，默认 `false`）——为真时 `parse` 把**首行当键**，返回**对象数组**，
     每个对象把首行第 i 个字段映射到其后各行第 i 个字段；`hasHeader` 为假的 `text` 只剩首行时，
     对象数组长度为 0。
   未显式给出的选项取默认值。
3. **引号内的一切都是内容**。被 `quote` 包裹的字段里，`delimiter`、`newline`、
   以及**成对写出的 `quote`**（或 `escape` + `quote`）全部属于字段内容，不当作分隔或行结束。
4. **换行风格**。解析时 `\r\n` 与 `\n` **都**识别为行结束；生成时按 `dialect.newline` 输出。
   引号内的 `\r` / `\n` 原样保留。
5. **空白保留**。字段首尾空白**原样保留**，不做 `trim`。
6. **空行与空字段**。**长度为 0 的行**（连续换行、开头换行、结尾换行造成的空行）**跳过**；
   而只有一对引号的 `""` 是**一个空字段**（一行里的一个空字段），**不是**空行。`a,,b` 是 3 个字段
   （中间为空）。
7. **末尾收尾**。文本末尾没有换行也能正确收尾：最后一个字段照常产出（不丢行）。
8. **增量解析**。`createParser(dialect?)` 返回 `{ write(chunk), end() }`：
   - `write(chunk)` 接收一段文本，返回**本次新完成的、行结束符已到齐的完整行**（数组，可为空）；
     引号内的换行不算行结束；
   - `end()` 声明输入结束，返回**剩余未能完成的行**（数组，可为空）；
   - 把同一份文本按**任意块大小**喂进去（含 1 个字符一块），`write` 与 `end` 依次返回的行
     **首尾相接**，必须与 `parse(text)` **逐字段相同** —— 引号、转义、`\r\n` 都可能跨块边界。
9. **未闭合引号必须报错**。文本以未闭合的引号结尾（如 `"abc`）时：`parse` **抛 `CsvError`**；
   流式解析在 `end()` 里抛 `CsvError`（分块喂入也要抛，不许静默产出半个字段）。
10. **BOM 位置**。文本**开头**的 BOM（`\uFEFF`）剥离；出现在字段中间的 BOM 按普通字符保留。
11. **纯函数**。同输入同输出：不读文件、不发网络、不碰环境变量，不依赖 `Date` / `Math.random` /
    `localeCompare`。
12. **规范化往返**。对**规范化输入**（引号与换行都已是 `format` 的输出形式、且末尾无换行）成立
    `format(parse(t)) === t`。

## 验收

`scripts/check.sh`（`check/check.mjs`）是固定验收程序，**不要修改**。它按 5 组、共 12 个场景核对上面的契约：

| 组 | 场景 | 侧重 |
| --- | --- | --- |
| `basics` | 引号内分隔符 / 引号内换行 / 双写转义 | 3 |
| `dialect` | 自定义分隔符引号与转义 / CRLF 识别与输出 / 空白保留 | 2、5 |
| `edge` | 空行与空字段 / 无末尾换行 / BOM 位置 | 6、7、10 |
| `stream` | 单字符块一致 / 固定种子随机块边界一致 | 8、9 |
| `errors` | 未闭合引号 | 9 |

每个场景独立记分；**一个场景失败不会让其余场景跳过**。结尾打印 `结果：通过 x/N`。

## 约束

1. 不改 `check/`，不改 `test/` 里既有用例的断言；已公开的函数签名不变（可新增导出）。
2. 不引入第三方依赖，只用 `node:` 内置模块。
3. 流式结果必须与一次性解析逐字段一致，包括 1 个字符一块的情形。
4. 未闭合的引号必须报错，不许静默产出半个字段。
5. 判据全程确定性：不依赖墙钟、随机源与机器速度。
