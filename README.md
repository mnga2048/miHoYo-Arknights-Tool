# 米+舟抽卡分析工具

本地运行的 Windows 桌面工具，用于获取、保存和分析多款游戏的抽卡记录。

## 支持游戏

| 游戏 | 在线获取 | 导入 |
|------|---------|------|
| 绝区零 | ✅ authkey | ✅ JSON / CSV |
| 原神 | ✅ authkey | ✅ JSON / CSV |
| 崩坏：星穹铁道 | ✅ authkey | ✅ JSON / CSV |
| 明日方舟 | ✅ 内置浏览器登录 | ✅ JSON / CSV |

## 功能

- 多游戏切换，数据按游戏独立存储
- 在线获取记录（米哈游系通过游戏日志自动提取 authkey，明日方舟通过内置浏览器登录）
- JSON / CSV 导入，自动去重合并
- 分池统计：每池已垫抽数、保底进度、平均出货间隔、最欧/最非记录
- S 级出货记录列表（水平条形图展示出货间隔）
- 池内出货间隔详情
- 月度趋势（近 8 个月 S/A/B 分布）
- 稀有度分布、总览统计
- 抽卡明细搜索、排序、导出
- 角色头像自动加载（Enka Network / Arknights GameResource）
- 所有数据仅保存本机，不上传任何账号信息

## 技术栈

- Electron 37 + React 19 + TypeScript + Vite 7
- electron-builder 打包 Windows NSIS 安装包

## 开发

```bash
npm install
npm run electron:dev
```

## 打包

```bash
npm run dist
```

产物位于 `release/` 目录。

## 导入数据格式

JSON 可为数组或包含 `records` / `data` / `list` 的对象：

```json
[
  {
    "id": "record-id",
    "uid": "100000001",
    "time": "2026-04-20 21:13:05",
    "name": "星见雅",
    "rankType": "S",
    "itemType": "代理人",
    "poolType": "exclusive",
    "poolName": "独家频段",
    "itemId": "1001"
  }
]
```

`poolType` 可选值：`exclusive`、`standard`、`standard-weapon`、`weapon`、`w-engine`、`bangboo`、`novice`、`chronicled`、`joint`、`festival`、`other`

`rankType` 可选值：`S`、`A`、`B`

支持多种字段命名风格（`poolType` / `pool_type` / `gacha_type` / `gachaType` 均可识别）。

## 在线获取说明

### 米哈游系（绝区零 / 原神 / 星穹铁道）

1. 打开游戏 → 进入抽卡记录页面
2. 点击底部的「查看详情」按钮
3. 回到本工具，点击「获取记录」
4. 工具自动从游戏日志 / WebCache 中提取 authkey 链接并拉取全部数据

authkey 有效期约 24 小时。工具会依次扫描以下来源：
- 剪贴板中的 authkey URL
- 游戏 WebCache（`webCaches/Cache_Data/data_2`）
- 游戏日志文件（`Player.log` / `output_log.txt`）

### 明日方舟

1. 点击「获取记录」
2. 在弹出的内置浏览器中登录明日方舟官网
3. 登录成功后自动通过 API 拉取全部寻访记录
4. 支持标准寻访、限定寻访、联合寻访、春节限定等所有卡池类别
