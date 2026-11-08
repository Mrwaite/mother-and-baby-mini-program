# mother-and-baby-mini-program

母婴家庭记录微信小程序：日常护理一键记录、宝宝成长记录、耗材库存管理、全家同步。

技术栈：原生微信小程序 + TypeScript（开发者工具内置编译），后端为微信云托管上的 [mother-and-baby-backgroud](https://github.com/Mrwaite/mother-and-baby-backgroud)。

## 功能（一期）

| Tab | 内容 |
|---|---|
| 首页 | 问候 + 宝宝信息、进行中计时条（亲喂/睡眠）、上次喂养 / 今日睡眠概览、低库存提示、8 类快速记录、今天最近 5 条 |
| 时间线 | 类型筛选、按天分组（标题吸顶 + 当天汇总）、相邻记录间隔 / 重叠、每次加载 3 天、跳到指定日期 |
| 成长 | 生长测量（最新值 + WHO 百分位区间、历史、曲线）、里程碑（时间轴 + 最多 9 张照片） |
| 库存 | 低库存区、按分类分组、入库 / 出库 / 盘点、流水 |

记录类型：亲喂（计时，左右侧）、瓶喂、换尿布、睡眠（计时）、吸奶、体温、用药、洗澡。所有新增 / 编辑都在半屏弹层 `components/record-sheet` 里完成。

## 本地开发

1. 安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)，导入本目录。
2. 在 `project.config.json` 中把 `appid` 从 `touristappid` 换成自己的小程序 AppID。
3. 启动后端（见后端仓库 README），并把本地用户加入白名单：
   ```bash
   npm run cli -- user:add --openid dev-openid --name 妈妈
   ```
4. 开发者工具「详情 → 本地设置」勾选「不校验合法域名」。开发版默认用 `wx.request` 请求 `config/env.ts` 里的 `DEV_API_BASE`（默认 `http://localhost:3000`），并手动带上 `X-WX-OPENID: dev-openid`。真机调试时把地址改成电脑的局域网 IP。
5. 类型检查：`npm install && npm run typecheck`。

## 环境配置（`miniprogram/config/env.ts`）

| 常量 | 说明 |
|---|---|
| `CLOUD_ENV` | 云托管环境 ID（上线前必须改成真实值） |
| `CLOUD_SERVICE` | 云托管服务名，默认 `api` |
| `DEV_API_BASE` / `DEV_OPENID` | 本地开发的服务地址和模拟 openid |
| `DEVELOP_USE_CLOUD` | 开发版也走云托管（灰度自测时打开） |

体验版 / 正式版一律走 `wx.cloud.callContainer`，openid 由微信网关注入，不需要登录和 token。里程碑照片通过 `wx.cloud.uploadFile` 直传云托管对象存储，再调用 `POST /files` 登记。

## 目录

```
miniprogram/
├── app.ts / app.json / app.wxss
├── custom-tab-bar/      # 自定义 TabBar（悬浮胶囊、低库存角标）
├── components/          # nav-bar / bottom-sheet / record-sheet / record-card / chip-group /
│                        # segmented / stepper / datetime-picker / timer-text / empty
├── pages/               # 主包：home / timeline / growth / inventory / unauthorized
├── pkg-growth/          # 分包：measure-edit / curve（Canvas 2D 自绘）/ milestone-edit
├── pkg-inventory/       # 分包：item-edit / item-detail
├── pkg-profile/         # 分包：profile / baby-edit（首次使用引导）
├── services/            # request（callContainer / wx.request）、api、cloud（上传）、session
├── store/               # 当前用户、宝宝、服务端时间偏移、跨页面变更事件
├── config/              # env、record-types（类型元数据和常用值）
├── utils/               # time / format / growth-percentile / layout / tab-bar / uuid
├── data/who.ts          # WHO 0–5 岁 LMS 参数（scripts/gen-who.mjs 生成）
└── shared/              # 前后端共享的类型和常量（以这里为准，后端用 sync-shared 复制）
```

## 约定

- 时间一律是 UTC 毫秒时间戳，「天」按北京时间（UTC+8）切分，与服务端一致（`shared/time.ts`）。
- 修改 `miniprogram/shared/` 后，到后端仓库执行 `npm run sync-shared`，部署前 `npm run check-shared` 会校验是否一致。
- 为兼容开发者工具内置的 TS 编译：不使用 `import { type X }` 行内修饰符、`satisfies`、`override`。
- 组件统一 `styleIsolation: 'apply-shared'`，可以直接使用 `app.wxss` 中的通用类。
- WHO 数据更新：`node scripts/gen-who.mjs`（从 GitHub 上 WHO 官方的 anthro R 包拉取按天的 LMS 表，按月龄 0–60 取样生成 `data/who.ts`）。
