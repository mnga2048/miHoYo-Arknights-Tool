# 绝区零抽卡分析工具

一个本地运行的 Windows 桌面工具原型，用于导入、保存和分析《绝区零》抽卡记录。

## 功能

- Electron 桌面应用，可打包为 Windows 安装版 exe
- 支持 JSON / CSV 抽卡记录导入
- 本地保存数据，不上传账号信息
- 自动去重
- 总览统计：总抽数、S 级、A 级、平均 S 间隔
- 分频段统计：独家频段、音擎频段、邦布频段、常驻频段
- 保底进度、S 级出货间隔、月度趋势、抽卡明细搜索
- JSON 导出和本地清空

## 运行

```bash
npm install
npm run electron:dev
```

## 打包 exe

```bash
npm run dist
```

打包产物会生成在 `release` 目录。

## 推荐导入格式

JSON 可以是数组，也可以是包含 `records`、`data` 或 `list` 数组的对象。

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
    "poolName": "独家频段"
  }
]
```

`poolType` 可选：

- `exclusive`：独家频段
- `w-engine`：音擎频段
- `bangboo`：邦布频段
- `standard`：常驻频段
- `other`：其他频段

`rankType` 可选：`S`、`A`、`B`。

## 后续可扩展

- 从游戏缓存中自动提取抽卡记录 URL
- 通过 authkey 分页拉取官方记录
- SQLite 存储
- 多 UID 管理
- UP 命中率、歪卡率、版本卡池元数据
- Excel 导出
