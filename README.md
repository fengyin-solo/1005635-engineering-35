# 城市集中供热管网与换热站运行管理平台

面向一次二次管网台账、换热站运行、水力平衡调节、热计量抄表、抢修处置、停暖通知与热费结算的一体化城市集中供热运行管理工作台。

这是一个**纯前端**管理平台：Vue 3 + Vite + TypeScript，仓库里没有后端服务。业务数据由
`frontend/src/data/` 下的本地数据层提供：首次打开用示例数据播种，之后的登记、筛选与状态流转
结果都持久化在浏览器 `localStorage` 里，刷新或重开浏览器都还在。dev server 已关掉自动打开页面，
启动后按终端打印的地址手工打开。

## 快速起步（新同事看这里）

克隆后**只需要一条命令**，在仓库根目录执行：

```bash
./setup.sh
```

它会按顺序做完两件事，两件事都是幂等的：

1. **拉依赖**：检查 `node_modules` 是否完整，缺什么（含跨平台遗留、`package.json` 新增的包）
   先自动退回 `npm install` 补录，补完再校验一遍。
2. **灌种子**：用 `frontend/src/data/seed.ts` 这同一份种子生成
   `frontend/src/data/seed-manifest.json`（含种子版本、各模块登记/待处理/异常计数）。
   进度记在 `frontend/.setup-state.json`，**跑到一半断了直接重跑**，已完成的步骤会跳过。

然后即可启动：

```bash
cd frontend && npm run dev
```

> 也可以用 `make setup`，或在 `frontend/` 下 `npm run setup`。
> 种子清单带版本号（由种子内容算出）。种子更新后，页面打开时会发现浏览器里是「上一轮」旧数据，
> 自动整体换播并补/删模块键，因此运营概览的登记总量永远等于各模块明细之和，不用自己翻
> 浏览器存储。

## 本地复位（回收入口，仅本地环境）

想把所有模块一起回到种子状态，在仓库根目录执行：

```bash
./reset-local.sh          # 或 make reset-local / cd frontend && npm run reset:local
```

它只生成一份本地复位清单（`seed-manifest.local.json`，已 gitignore），换一个复位令牌；
**刷新或重开页面**时数据层识别到令牌变化，就用同一份 `seed.ts` 整体重播——各模块的待处理
清单随之归位（当前种子：18 个模块、登记 54 条、待处理 36 条、异常 18 条）。

- 生产 / CI 环境会拒绝执行（靠 `NODE_ENV` / `CI` 识别）。
- 复位记录落在浏览器里，同一份结果**重复提交只记一次**；dev 环境的「运营概览」页还有一个
  「复位本地数据」按钮，生产构建里不渲染。



## 目录结构

```text
.
├── setup.sh                 一条命令起步：拉依赖 + 灌种子（幂等、可续跑）
├── reset-local.sh           回收入口：仅本地环境复位用
├── frontend/                Vue 3 + Vite + TypeScript 前端（唯一运行单元）
│   ├── scripts/             setup/reset 的 CLI 实现（tsx 直跑，与页面同读 seed.ts）
│   ├── src/views/           每个业务模块一个页面
│   ├── src/api/local-service.ts   本地数据服务：列表、筛选、动作流转、导出
│   ├── src/data/            模块元数据 / 种子数据 / 种子清单 / localStorage 持久化
│   ├── src/stores/          会话与筛选状态
│   └── vite.config.ts       dev server 配置（open: false，无 /api 代理）
├── .gitignore
└── docker-compose.yml
```

## 启动

先执行过一次 `./setup.sh`（见上方「快速起步」），然后：

```bash
cd frontend
npm run dev
```

前端默认监听 `http://127.0.0.1:5173/`，dev server 不会自动打开浏览器，需要自己访问。

生产构建：

```bash
cd frontend
npm run build
```

## 业务模块

| 模块 | 目录 | 业务对象 | 主要字段 |
| --- | --- | --- | --- |
| 换热站台账 | `heatstation` | 换热站 | 站名、所属片区、供热面积 |
| 一次管网 | `primarynet` | 一次管网管段 | 管段编号、起点、终点 |
| 二次管网 | `secondarynet` | 二次管网管段 | 管段编号、所属片区、公称管径 |
| 站点巡检 | `stationpatrol` | 巡检记录 | 巡检编号、巡检站点、巡检路线 |
| 室温监测 | `roomtemp` | 室温监测点 | 监测编号、住户地址、所属片区 |
| 水力平衡 | `hydraulic` | 平衡调节记录 | 调节编号、换热站、调节回路 |
| 热计量抄表 | `heatmeter` | 热计量抄表记录 | 抄表编号、计量表号、用户名称 |
| 抢修处置 | `emergencyrepair` | 抢修记录 | 抢修编号、故障管段、故障类型 |
| 阀门井维护 | `valvewell` | 阀门井 | 井编号、所属管段、井盖状况 |
| 循环泵运维 | `circpump` | 循环泵 | 泵编号、所属换热站、泵型号 |
| 补水定压 | `makeupwater` | 补水定压记录 | 记录编号、换热站、补水量 |
| 换热器清洗 | `hxclean` | 清洗记录 | 清洗编号、换热器编号、所属站点 |
| 锅炉房运行 | `boilerroom` | 锅炉运行记录 | 锅炉编号、锅炉吨位、燃烧方式 |
| 管网探漏 | `leakdetect` | 探漏记录 | 探漏编号、探测管段、探测方法 |
| 补偿器检查 | `compensator` | 补偿器检查记录 | 检查编号、所属管段、补偿器型号 |
| 停暖通知 | `heatnotice` | 停暖通知单 | 通知编号、影响片区、停暖原因 |
| 热费结算 | `heatbilling` | 热费结算单 | 结算编号、用户名称、用热面积 |
| 入户服务 | `householdservice` | 入户服务单 | 服务单号、报修用户、服务内容 |

## 约定

- 每个模块的页面在 `frontend/src/views/<模块>/index.vue`，页面只负责渲染，读写统一走
  `frontend/src/api/local-service.ts`。
- 字段、状态、动作与流转目标集中在 `frontend/src/data/modules.ts`；示例数据在
  `frontend/src/data/seed.ts`。
- 状态流转只允许在 `local-service.ts` 里改，页面组件不做业务判断。
- 种子数据只有一处：`frontend/src/data/seed.ts`；CLI 脚本（`frontend/scripts/`）和页面数据层
  都从这里读。改完种子重跑 `./setup.sh`，种子版本会自动变化并驱动浏览器端换播。
- 想回到初始数据：仓库根目录执行 `./reset-local.sh` 后刷新页面（全部模块一起复位）；
  只复位单个模块仍可调用 `resetModule(模块)`；也可以手工清掉浏览器里
  `district-heating:entries` 这一项。
