导出的表格在 Excel 里串了行，客服把文件和截图一起发过来了。csvlite 是 Node.js 22 的
CSV 读写库，ESM，只用 `node:` 内置模块，`package.json` 里没有 dependencies，
测试跑 `node --test`，固定验收程序是 `scripts/check.sh`（别改）。

README「对外契约」一节列了 12 条；`test/` 下 14 个用例当前全绿，但它们只喂过
逗号分隔、双引号、字段内不含换行的样本。

任务：把 12 条补齐（方言、边界、流式增量都在里面），让既有用例与固定件全过。

验收：
- node --test 退出码 0；
- bash scripts/check.sh 退出码 0，12 个场景全过（basics 3 + dialect 3 + edge 3 + stream 2 + errors 1）。

约束：
1. 不改 `check/`、不改既有用例的断言；已公开的函数签名不变（可新增）。
2. 不引入第三方依赖，只用 `node:` 内置模块。
3. 流式结果必须与一次性解析逐字段一致，包括 1 个字符一块的情形。
4. 未闭合的引号必须报错，不许静默产出半个字段。
