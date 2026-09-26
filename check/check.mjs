// check.mjs 是 csvlite 的**固定验收程序**。
//
// ⚠️ 不要修改本文件。它按 README「对外契约」一节的 12 条，核对 parse / format /
// createParser 的对外行为。
//
// 12 个场景分五组：
//
//   basics   3：引号内的分隔符 / 引号内的换行 / 双写转义
//   dialect  3：自定义分隔符引号与转义 / CRLF 的识别与输出 / 空白保留
//   edge     3：空行跳过 vs "" 空字段 / 无末尾换行 / BOM 位置
//   stream   2：1 字符块与一次性逐字段相同 / 固定种子随机块边界一致
//   errors   1：未闭合引号在 parse 与流式 end() 都抛 CsvError
//
// stream 组内每条都**同时**断言「与 parse(text) 逐字段相同」与「未闭合引号必须抛」，
// 并额外要求整段一次性 write 就能返回全部行 —— 只把字节拼在缓冲里、到 end() 才
// 调用 parse 的偷懒实现会在这里暴露。
//
// 用法：
//
//   node check/check.mjs                    # 跑全部场景
//   node check/check.mjs -list              # 列出全部场景
//   node check/check.mjs --only dialect     # 只跑一组（可用逗号并列多组）
//
// 判据全程确定性：不依赖墙钟、随机源或机器速度（随机块用固定种子 PRNG）；
// **单进程**跑通，不使用 child_process / worker_threads / 网络。
// 失败不早退：一个场景失败也继续跑完其余场景，末尾统一打印「结果：通过 x/N」。

import { join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const GROUPS = ['basics', 'dialect', 'edge', 'stream', 'errors'];

// ------------------------------------------------------------------ scenarios

const scenarios = [
  // ---------------- basics ----------------
  {
    group: 'basics',
    name: 'basics/引号内分隔符',
    run: (lib) => {
      const text = 'a,"b,c",d\n"x,y",z\n';
      const expect = [
        ['a', 'b,c', 'd'],
        ['x,y', 'z'],
      ];
      const got = lib.parse(text);
      if (!same(got, expect)) return `期望=${show(expect)} 实际=${show(got)}`;
      if (!same(lib.parse(text), got)) return '期望=同输入同输出 实际=两次调用结果不同';
      return '';
    },
  },
  {
    group: 'basics',
    name: 'basics/引号内换行',
    run: (lib) => {
      const text = 'a,"line1\nline2",b\n';
      const expect = [['a', 'line1\nline2', 'b']];
      const got = lib.parse(text);
      if (!same(got, expect)) return `期望=${show(expect)} 实际=${show(got)}`;
      return '';
    },
  },
  {
    group: 'basics',
    name: 'basics/双写转义',
    run: (lib) => {
      const text = '"say ""hi""",ok\n';
      const expect = [['say "hi"', 'ok']];
      const got = lib.parse(text);
      if (!same(got, expect)) return `期望=${show(expect)} 实际=${show(got)}`;
      const norm = '"say ""hi""",ok';
      const f = lib.format(lib.parse(norm + '\n'));
      if (f !== norm) return `期望=format 对规范化输入往返不变 ${JSON.stringify(norm)} 实际=${JSON.stringify(f)}`;
      return '';
    },
  },

  // ---------------- dialect ----------------
  {
    group: 'dialect',
    name: 'dialect/自定义分隔符引号与转义',
    run: (lib) => {
      const dialect = { delimiter: ';', quote: "'", escape: '\\', hasHeader: true };
      const text = "name;note\n'O\\'Brien';'she said \\\\ok'\n";
      const expect = [{ name: "O'Brien", note: 'she said \\ok' }];
      const got = lib.parse(text, dialect);
      if (!same(got, expect)) return `期望=${show(expect)} 实际=${show(got)}`;
      const f = lib.format([['a;b', 'c']], dialect);
      if (f !== "'a;b';c") return `期望=${JSON.stringify("'a;b';c")} 实际=${JSON.stringify(f)}`;
      return '';
    },
  },
  {
    group: 'dialect',
    name: 'dialect/CRLF识别与输出',
    run: (lib) => {
      const text = 'a,b\r\n"x\r\ny",z';
      const expect = [
        ['a', 'b'],
        ['x\r\ny', 'z'],
      ];
      const got = lib.parse(text);
      if (!same(got, expect)) return `期望=${show(expect)} 实际=${show(got)}`;
      const lf = lib.parse('a,b\nc,d');
      const crlf = lib.parse('a,b\r\nc,d');
      if (!same(lf, crlf)) return `期望=\\n 与 \\r\\n 都识别为行结束 实际=${show(lf)} vs ${show(crlf)}`;
      const f = lib.format(expect, { newline: '\r\n' });
      if (f !== text) return `期望=format 用 \\r\\n 连接并往返不变 ${JSON.stringify(text)} 实际=${JSON.stringify(f)}`;
      return '';
    },
  },
  {
    group: 'dialect',
    name: 'dialect/空白保留',
    run: (lib) => {
      const text = '  a , b  \n" x ",y\n';
      const expect = [
        ['  a ', ' b  '],
        [' x ', 'y'],
      ];
      const got = lib.parse(text);
      if (!same(got, expect)) return `期望=${show(expect)} 实际=${show(got)}`;
      return '';
    },
  },

  // ---------------- edge ----------------
  {
    group: 'edge',
    name: 'edge/空行与空字段',
    run: (lib) => {
      const text = 'a,b\n\n""\nc,d\n';
      const expect = [
        ['a', 'b'],
        [''],
        ['c', 'd'],
      ];
      const got = lib.parse(text);
      if (!same(got, expect)) return `期望=${show(expect)} 实际=${show(got)}`;
      const pre = lib.parse('\n\na,b\n');
      if (!same(pre, [['a', 'b']])) return `期望=开头的空行跳过 ${show([['a', 'b']])} 实际=${show(pre)}`;
      const post = lib.parse('a,b\n\n');
      if (!same(post, [['a', 'b']])) return `期望=结尾的空行跳过 ${show([['a', 'b']])} 实际=${show(post)}`;
      return '';
    },
  },
  {
    group: 'edge',
    name: 'edge/无末尾换行',
    run: (lib) => {
      const text = 'a,b\nc,d';
      const expect = [
        ['a', 'b'],
        ['c', 'd'],
      ];
      const got = lib.parse(text);
      if (!same(got, expect)) return `期望=${show(expect)} 实际=${show(got)}`;
      const f = lib.format(got);
      if (f !== text) return `期望=format 往返不变 ${JSON.stringify(text)} 实际=${JSON.stringify(f)}`;
      return '';
    },
  },
  {
    group: 'edge',
    name: 'edge/BOM位置',
    run: (lib) => {
      const text = '\uFEFFa,b\nc,\uFEFFd\n';
      const expect = [
        ['a', 'b'],
        ['c', '\uFEFFd'],
      ];
      const got = lib.parse(text);
      if (!same(got, expect)) return `期望=${show(expect)} 实际=${show(got)}`;
      return '';
    },
  },

  // ---------------- stream ----------------
  {
    group: 'stream',
    name: 'stream/单字符块一致',
    run: (lib) => {
      const mk = requireParser(lib);
      if (typeof mk === 'string') return mk;

      const text = 'a,b\r\n"x,y","he said ""hi"""\r\n"p\r\nq",r\n';
      const oneShot = lib.parse(text);

      const p0 = mk();
      const w0 = p0.write(text);
      const e0 = p0.end();
      if (!same([...w0, ...e0], oneShot)) {
        return `期望=整段 write/end 与 parse 逐字段相同 ${show(oneShot)} 实际=${show([...w0, ...e0])}`;
      }
      if (e0.length !== 0) {
        return `期望=整段 write 就把全部行返回、end() 不再补行 实际=end() 返回 ${e0.length} 行`;
      }

      const p1 = mk();
      const out = [];
      for (let i = 0; i < text.length; i += 1) out.push(...p1.write(text[i]));
      out.push(...p1.end());
      if (!same(out, oneShot)) return `期望=1 字符块与一次性逐字段相同 ${show(oneShot)} 实际=${show(out)}`;

      const p2 = mk();
      let threw = false;
      try {
        p2.write('"abc');
        p2.end();
      } catch (err) {
        threw = isCsvError(lib, err);
      }
      if (!threw) return '期望=分块喂入未闭合引号时 end() 抛 CsvError 实际=未抛或类型不对';
      return '';
    },
  },
  {
    group: 'stream',
    name: 'stream/随机块边界一致',
    run: (lib) => {
      const mk = requireParser(lib);
      if (typeof mk === 'string') return mk;

      const text = 'h1,h2\r\n"a,\r\nb",c\r\n"q""q",\r\nz\n';
      const oneShot = lib.parse(text);

      const rng = mulberry32(20240613);
      const p1 = mk();
      const out = [];
      let i = 0;
      while (i < text.length) {
        const n = 1 + Math.floor(rng() * 5);
        out.push(...p1.write(text.slice(i, i + n)));
        i += n;
      }
      out.push(...p1.end());
      if (!same(out, oneShot)) return `期望=随机块边界与一次性逐字段相同 ${show(oneShot)} 实际=${show(out)}`;

      const text2 = 'a,"b\nc';
      const rng2 = mulberry32(777);
      const p2 = mk();
      let threw = false;
      let j = 0;
      try {
        while (j < text2.length) {
          const n = 1 + Math.floor(rng2() * 3);
          p2.write(text2.slice(j, j + n));
          j += n;
        }
        p2.end();
      } catch (err) {
        threw = isCsvError(lib, err);
      }
      if (!threw) return '期望=随机块喂入未闭合引号时 end() 抛 CsvError 实际=未抛或类型不对';
      return '';
    },
  },

  // ---------------- errors ----------------
  {
    group: 'errors',
    name: 'errors/未闭合引号',
    run: (lib) => {
      let ok = false;
      try {
        lib.parse('"abc');
      } catch (err) {
        ok = isCsvError(lib, err);
      }
      if (!ok) return '期望=parse(\'"abc\') 抛 CsvError 实际=未抛或类型不对';

      let ok2 = false;
      try {
        lib.parse('a,"b\nc\n');
      } catch (err) {
        ok2 = isCsvError(lib, err);
      }
      if (!ok2) return '期望=行中间未闭合的引号也抛 CsvError 实际=未抛或类型不对';

      if (typeof lib.createParser === 'function') {
        let ok3 = false;
        try {
          const p = lib.createParser();
          p.write('"abc');
          p.end();
        } catch (err) {
          ok3 = isCsvError(lib, err);
        }
        if (!ok3) return '期望=流式 end() 抛 CsvError 实际=未抛或类型不对';
      }
      return '';
    },
  },
];

// ------------------------------------------------------------------ main

function main() {
  const argv = process.argv.slice(2);
  let only = '';
  let list = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '-list' || a === '--list') {
      list = true;
    } else if (a === '--only') {
      only = argv[i + 1] || '';
      i += 1;
    } else if (a.startsWith('--only=')) {
      only = a.slice('--only='.length);
    } else if (a === '-h' || a === '--help') {
      console.log('用法：node check/check.mjs [-list] [--only <组名>]');
      return;
    } else {
      console.log(`未知参数 ${a}（可用：-list / --only <组名>）`);
      process.exitCode = 2;
      return;
    }
  }

  if (list) {
    for (const sc of scenarios) console.log(sc.name);
    return;
  }

  const want = new Set();
  if (only.trim() !== '') {
    for (const g of only.split(',')) {
      const name = g.trim();
      if (name === '') continue;
      if (!GROUPS.includes(name)) {
        console.log(`未知分组 "${name}"（可选：${GROUPS.join(' / ')}）`);
        process.exitCode = 2;
        return;
      }
      want.add(name);
    }
  }

  const picked = scenarios.filter((sc) => want.size === 0 || want.has(sc.group));
  if (picked.length === 0) {
    console.log(`没有匹配的场景（--only ${only}）`);
    process.exitCode = 2;
    return;
  }

  runAll(picked);
}

async function runAll(picked) {
  let lib = null;
  let loadErr = '';
  try {
    lib = await import(pathToFileURL(join(ROOT, 'src', 'index.js')).href);
  } catch (err) {
    loadErr = err && err.message ? err.message : String(err);
  }

  let total = 0;
  let passed = 0;
  for (const sc of picked) {
    total += 1;
    let msg = '';
    if (loadErr !== '') {
      msg = `期望=src/index.js 可加载 实际=加载失败：${loadErr}`;
    } else {
      try {
        msg = sc.run(lib) || '';
      } catch (err) {
        msg = `检查过程抛异常：${err && err.message ? err.message : err}`;
      }
    }
    if (msg === '') {
      passed += 1;
      console.log(`PASS ${sc.name}`);
    } else {
      console.log(`FAIL ${sc.name}  ${msg}`);
    }
  }

  console.log(`结果：通过 ${passed}/${total}`);
  if (passed !== total) process.exitCode = 1;
}

// ------------------------------------------------------------------ util

function requireParser(lib) {
  if (typeof lib.createParser !== 'function') {
    return '期望=导出 createParser 实际=未导出或不是函数';
  }
  return () => {
    const p = lib.createParser();
    if (!p || typeof p.write !== 'function' || typeof p.end !== 'function') {
      throw new TypeError('createParser() 必须返回 { write(chunk), end() }');
    }
    return p;
  };
}

function isCsvError(lib, err) {
  if (!err) return false;
  if (err.name === 'CsvError') return true;
  return typeof lib.CsvError === 'function' && err instanceof lib.CsvError;
}

function same(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => same(x, b[i]));
  }
  if (
    a && b &&
    typeof a === 'object' && typeof b === 'object' &&
    !Array.isArray(a) && !Array.isArray(b)
  ) {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.length !== kb.length) return false;
    return ka.every((k, i) => k === kb[i] && same(a[k], b[k]));
  }
  return false;
}

function show(v) {
  return JSON.stringify(v);
}

// mulberry32：固定种子的确定性 PRNG，用于随机块边界。
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

main();
