# 多游戏抽卡分析工具 使用说明 & 资源清单

## 一、应用简介

本工具是一个基于 Electron + React 的本地Windows抽卡记录分析工具，支持**绝区零、原神、崩坏：星穹铁道、明日方舟**四款游戏，可以自动抓取或导入抽卡记录，并对出货频率、保底进度、月度趋势等进行多维度可视化分析。

## 支持游戏

| 游戏      | 在线获取      | 导入           |
| ------- | --------- | ------------ |
| 绝区零     | ✅ authkey | ✅ JSON / CSV |
| 原神      | ✅ authkey | ✅ JSON / CSV |
| 崩坏：星穹铁道 | ✅ authkey | ✅ JSON / CSV |
| 明日方舟    | ✅ 内置浏览器登录 | ✅ JSON / CSV |

## 功能

---

## 二、主要功能

- **抽卡记录在线获取**（原神/星铁/绝区零）：自动从游戏日志或缓存中提取 `authkey`，调用官方 API 拉取全部历史记录。
- **明日方舟在线获取**：内置浏览器登录后，通过 API 模拟获取所有寻访记录。
- **导入/导出支持**：可导入 JSON / CSV 格式的抽卡数据，也可将现有记录导出为 JSON。
- **多维度分析看板**：
  - 总抽数、S/A 级出货次数、出货率、平均出货间隔
  - 月度趋势环形图（近 8 个月 S/A/B 分布）
  - 稀有度分布条形图
  - 每个卡池的独立保底进度环、平均间隔、历史最非最欧
  - 最近 S 级出货卡片视图、出货记录列表（带进度条）
  - 抽卡明细表格（可按卡池、稀有度筛选，按时间排序，关键词搜索）
- **角色/武器头像自动展示**：通过在线图源自动加载头像，加载失败时显示字母 Fallback。
- **绝区零官方情报站快捷入口**：左侧“访问情报站”按钮可打开官方百科内嵌窗口。

---

## 三、角色头像图源说明

各游戏的头像图片均来自不同的在线资源，下方按游戏列出 URL 格式及原理。

### 1. 绝区零（ZZZ）

- **图源**：Enka Network（第三方米家游戏数据站点）的 UI 图标路径。
- **映射方式**：本地 JSON 文件 `zzz-icons.json` 维护了 `itemId` 到图片路径的映射表。
- **URL 构造**：  
  `https://enka.network/${icon}`  
  其中 `icon` 取自映射表，例如 `"/ui/zzz/IconRoleCircle01.png"`。
- **示例**：  
  代理人「安比」的 `itemId` 为 `1041`，映射为 `/ui/zzz/IconRoleCircle05.png`，完整 URL：  
  `https://enka.network/ui/zzz/IconRoleCircle05.png`
- **武器同理**，映射表里存的为 `Weapon_...png` 路径。

### 2. 原神（Genshin Impact）

- **图源**：Enka Network 的 UI 图标。
- **映射方式**：本地 JSON 文件 `genshin-icons.json` 维护了**角色/武器中文名**到图标文件名的映射。
- **URL 构造**：  
  `https://enka.network/ui/${icon}`  
  `icon` 为 `UI_AvatarIcon_Side_XXX.png` 或 `UI_EquipIcon_...png`。
- **示例**：  
  角色「神里绫华」的 icon 为 `UI_AvatarIcon_Side_Ayaka.png`，完整 URL：  
  `https://enka.network/ui/UI_AvatarIcon_Side_Ayaka.png`
- 武器同理，如 5★武器「雾切之回光」的 icon 为 `UI_EquipIcon_Sword_Narukami.png`。

### 3. 崩坏：星穹铁道（Honkai: Star Rail）

- **图源**：GitHub 仓库 `Mar-7th/StarRailRes` 的 `icon` 目录。
- **URL 构造**：  
  `https://raw.githubusercontent.com/Mar-7th/StarRailRes/master/icon/${folder}/${itemId}.png`  
  - `folder`：根据 `itemType` 区分，角色用 `character`，光锥用 `light_cone`。
  - `itemId`：游戏内抽卡记录中的 `item_id` 字段（如角色 `1005`，光锥 `21001`）。
- **示例**：  
  角色「开拓者（男）」itemId 为 `1005`，头像：  
  `https://raw.githubusercontent.com/Mar-7th/StarRailRes/master/icon/character/1005.png`  
  光锥「但战斗还未结束」itemId 为 `21001`，头像：  
  `https://raw.githubusercontent.com/Mar-7th/StarRailRes/master/icon/light_cone/21001.png`

### 4. 明日方舟（Arknights）

- **图源**：GitHub 仓库 `yuanyan3060/ArknightsGameResource` 的 `avatar` 目录，并使用 jsDelivr CDN 加速。
- **URL 构造**：  
  优先 `https://cdn.jsdelivr.net/gh/yuanyan3060/ArknightsGameResource@main/avatar/${itemId}.png`  
  备用 `https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/main/avatar/${itemId}.png`
- **itemId**：游戏内角色的 `charId`，例如 `char_1028_texas2`。
- **示例**：  
  德克萨斯（2星）头像：  
  `https://cdn.jsdelivr.net/gh/yuanyan3060/ArknightsGameResource@main/avatar/char_1028_texas2.png`

> 所有图片加载失败时，会自动显示该角色/武器名称的首字母作为占位符。

---

## 四、数据获取原理

### 米哈游游戏（原神/星铁/绝区零）

1. 玩家在游戏内打开 **抽卡记录详情页** 时，游戏日志中会记录含 `authkey` 的 URL。
2. 工具自动扫描日志文件或浏览器缓存，提取该 URL。
3. 使用 `authkey` 调用官方 `getGachaLog` API，分页拉取所有抽卡记录。
4. 每条记录包含 `item_id`、名称、星级、时间等，存入本地 JSON 文件。

### 明日方舟

1. 点击“获取记录”后弹出内置浏览器，跳转到官网登录页。
2. 用户登录后，工具从 Cookies 中提取 `HgToken`。
3. 通过 OAuth2 换取 `U8 Token`，再获取角色 UID。
4. 使用 UID 和 Token 调用游戏 API，分页抓取所有寻访记录（自动去重）。
5. 记录中的 `charId` 作为 `itemId` 用于头像加载。

---

## 五、使用方法

1. **启动应用**：在终端执行 `npm run dev`（开发模式）或直接启动打包后的程序。
2. **切换游戏**：左侧顶部游戏选择器，点击对应图标即可切换绝区零/原神/星铁/明日方舟。
3. **获取记录**：
   - 米哈游游戏：先在游戏内打开抽卡记录详情页，再点击工具中的“获取记录”按钮，会自动拉取。
   - 明日方舟：点击“获取记录”，在弹出的窗口中登录官网，登录后自动抓取（约 1-2 分钟）。
4. **导入数据**：点击“导入”按钮，选择 `.json` 或 `.csv` 文件。
5. **查看分析**：
   - 总览：总抽数、稀有度分布、月度趋势、各卡池保底、出货记录。
   - 点击侧边栏卡池名称可查看单独卡池详情。
   - 明细：表格展示所有抽卡记录，支持按卡池/稀有度筛选、搜索和时间排序。
6. **导出/清空**：点击“导出”保存当前记录为 JSON；在设置页面可清空数据。
7. **绝区零情报站**（仅绝区零可见）：左侧按钮可内嵌打开官方百科页面，方便查询角色资料。

---

## 六、文件结构

```
├── src/
│   ├── main.ts                          # Electron 主进程（API 抓取、窗口管理）
│   ├── preload.ts                       # 预加载脚本（IPC 桥接）
│   ├── shared/
│   │   ├── games.ts                     # 游戏配置（API 地址、卡池类型、rankMap 等）
│   │   ├── types.ts                     # TypeScript 类型定义
│   │   ├── genshin-icons.json          # 原神图标映射（115 角色 + 231 武器）
│   │   └── zzz-icons.json              # 绝区零图标映射（51 角色 + 87 武器）
│   └── renderer/
│       ├── App.tsx                      # React 主组件（UI 渲染、状态管理）
│       ├── global.d.ts                  # 全局类型声明
│       └── styles.css                   # 样式表
├── index.html                           # 入口 HTML
├── package.json                         # 项目配置与脚本
├── package-lock.json                    # 依赖版本锁定
├── tsconfig.json                        # TypeScript 配置（渲染进程）
├── tsconfig.electron.json               # TypeScript 配置（Electron 主进程）
├── vite.config.ts                       # Vite 构建配置
├── installer.nsh                        # NSIS 安装脚本定制
├── launch.vbs                           # Windows 启动脚本
├── start.vbs                            # Windows 启动脚本
├── .gitignore                           # Git 忽略规则
├── .npmrc                               # npm 镜像配置
├── samples/                             # 示例数据
└── README.md                            # 本文件
```

---

## 七、编译方式

技术栈

- Electron 37 + React 19 + TypeScript + Vite 7
- electron-builder 打包 Windows NSIS 安装包

### 开发

```bash
npm install
npm run build
npm run electron:dev
```

### 打包

```bash
npm run dist
```

产物位于 `release/` 目录。

## 八、注意事项

- 所有数据仅存储在本地（`userData` 目录下），不上传任何账号信息。
- `authkey` 有效期约 24 小时，过期后需重新在游戏内打开抽卡记录页面刷新。
- 在线头像可能因网络原因加载较慢，失败后会自动显示字母占位符。
- 本工具仅供个人学习与统计使用，请勿用于商业用途。
