import { app, BrowserWindow, clipboard, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import https from 'node:https';
import type { IncomingMessage } from 'node:http';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import type { GachaRecord, StoredData, PoolType, RankType } from './shared/types.js';
import { getGameConfig } from './shared/games.js';
import type { GameConfig } from './shared/games.js';

const isDev = !app.isPackaged;

function dataFilePath(gameId: string) {
  const game = getGameConfig(gameId);
  return path.join(app.getPath('userData'), game.dataFileName);
}

async function readStoredData(gameId: string): Promise<StoredData> {
  const filePath = dataFilePath(gameId);
  if (!existsSync(filePath)) {
    return { records: [], updatedAt: new Date().toISOString() };
  }
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as StoredData;
}

async function writeStoredData(gameId: string, records: GachaRecord[]): Promise<StoredData> {
  const data: StoredData = { records, updatedAt: new Date().toISOString() };
  await fs.writeFile(dataFilePath(gameId), JSON.stringify(data, null, 2), 'utf8');
  return data;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1080,
    minHeight: 720,
    title: '多游戏抽卡分析工具',
    backgroundColor: '#101114',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.webContents.on('did-fail-load', (_event, errorCode, errorDesc) => {
    console.error('Failed to load:', errorCode, errorDesc);
  });
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer process gone:', details);
  });
  win.webContents.on('did-finish-load', () => {
    console.log('Renderer finished loading');
  });

  
  if (isDev) {
    void win.loadURL('http://127.0.0.1:5173');
  } else {
    void win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('data:load', async (_e, gameId: string) => readStoredData(gameId));
ipcMain.handle('data:save', async (_e, gameId: string, records: GachaRecord[]) => writeStoredData(gameId, records));

ipcMain.handle('data:showInput', async (_e, message: string) => {
  const focused = BrowserWindow.getFocusedWindow();
  if (!focused) return null;
  const { dialog } = await import('electron');
  await dialog.showMessageBox(focused, {
    type: 'info',
    buttons: ['已复制，继续'],
    title: '手动输入URL',
    message: message + '\n\n请先复制URL到剪贴板，然后点击"已复制，继续"。'
  });
  return clipboard.readText();
});

ipcMain.handle('data:chooseImport', async () => {
  const { dialog } = await import('electron');
  const result = await dialog.showOpenDialog({
    title: '导入抽卡记录',
    filters: [{ name: '抽卡记录', extensions: ['json', 'csv'] }, { name: '所有文件', extensions: ['*'] }],
    properties: ['openFile']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  return {
    fileName: path.basename(filePath),
    extension: path.extname(filePath).toLowerCase(),
    content: await fs.readFile(filePath, 'utf8')
  };
});

ipcMain.handle('data:export', async (_e, gameId: string, records: GachaRecord[]) => {
  const { dialog } = await import('electron');
  const game = getGameConfig(gameId);
  const result = await dialog.showSaveDialog({
    title: '导出抽卡记录',
    defaultPath: `${game.id}-gacha-records-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return false;
  await fs.writeFile(result.filePath, JSON.stringify({ records, exportedAt: new Date().toISOString() }, null, 2), 'utf8');
  return true;
});

interface HttpResult { statusCode: number; body: string; setCookie: string }

function httpRequest(method: string, url: string, body: string | null, extraHeaders: Record<string, string> = {}): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const headers: Record<string, string> = { ...extraHeaders };
    if (body) headers['Content-Type'] = 'application/json;charset=utf-8';
    const cb = (res: IncomingMessage) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location;
        if (loc) { httpRequest(method, loc, body, extraHeaders).then(resolve).catch(reject); return; }
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ statusCode: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8'), setCookie: (res.headers['set-cookie'] as string[] || []).join('; ') }));
      res.on('error', reject);
    };
    const req = https.request({ hostname: parsed.hostname, port: 443, path: parsed.pathname + parsed.search, method, headers }, cb);
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function httpsGet(url: string): Promise<string> {
  const res = await httpRequest('GET', url, null);
  if (res.statusCode >= 400) throw new Error(`HTTP ${res.statusCode}: ${res.body.slice(0, 200)}`);
  return res.body;
}

async function httpsJsonRequest(method: string, url: string, body: string | null, extraHeaders: Record<string, string> = {}) {
  const res = await httpRequest(method, url, body, extraHeaders);
  try { return { statusCode: res.statusCode, data: JSON.parse(res.body), setCookie: res.setCookie }; }
  catch { throw new Error(`HTTP ${res.statusCode}: ${res.body.slice(0, 200)}`); }
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function parseUrlParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  let query = url.includes('?') ? url.split('?')[1] : url;
  query = query.split('#')[0]; // strip hash fragment
  for (const pair of query.split('&')) {
    const [key, ...rest] = pair.split('=');
    if (key) params[key] = rest.join('=');
  }
  return params;
}

function findGameInstallPath(game: GameConfig): string | null {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const localLow = process.platform === 'win32'
    ? path.join(home, 'AppData', 'LocalLow')
    : path.join(home, 'Library', 'Application Support');
  const vendors = ['miHoYo', 'Cognosphere'];
  const gameDataDir: Record<string, RegExp> = {
    zzz: /ZenlessZoneZero|绝区零/i,
    genshin: /GenshinImpact|原神/i,
    starrail: /StarRail|崩坏：星穹铁道/i
  };
  const dataDirName: Record<string, string[]> = {
    zzz: ['ZenlessZoneZero_Data'],
    genshin: ['GenshinImpact_Data', 'YuanShen_Data'],
    starrail: ['StarRail_Data']
  };
  const pattern = gameDataDir[game.id];
  const dirNames = dataDirName[game.id];
  if (!pattern || !dirNames) return null;
  for (const vendor of vendors) {
    const vendorDir = path.join(localLow, vendor);
    if (!existsSync(vendorDir)) continue;
    for (const sub of readdirSync(vendorDir)) {
      if (!pattern.test(sub)) continue;
      const logFiles = ['Player.log', 'output_log.txt'].map(f => path.join(vendorDir, sub, f)).filter(f => existsSync(f));
      for (const logFile of logFiles) {
        try {
          const content = readFileSync(logFile, 'utf8');
          for (const dirName of dirNames) {
            const escaped = dirName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const m = content.match(new RegExp(`[A-Za-z]:[\\\\/][^\\r\\n]+?${escaped}`, 'i'));
            if (m?.[0]) return path.dirname(m[0]);
          }
        } catch { /* ignore */ }
      }
    }
  }
  return null;
}

function extractUrlFromWebCache(game: GameConfig): string | null {
  const installDir = findGameInstallPath(game);
  if (!installDir) return null;
  const cacheBaseNames: Record<string, string[]> = {
    zzz: ['ZenlessZoneZero_Data'],
    genshin: ['GenshinImpact_Data', 'YuanShen_Data'],
    starrail: ['StarRail_Data']
  };
  const dirNames = cacheBaseNames[game.id];
  if (!dirNames) return null;
  for (const dataDirName of dirNames) {
    const wcDir = path.join(installDir, dataDirName, 'webCaches');
    if (!existsSync(wcDir)) continue;
    const versions = readdirSync(wcDir)
      .filter(v => /^\d+\.\d+\.\d+\.\d+$/.test(v))
      .sort().reverse();
    for (const ver of versions) {
      const data2 = path.join(wcDir, ver, 'Cache', 'Cache_Data', 'data_2');
      if (!existsSync(data2)) continue;
      try {
        const raw = readFileSync(data2, 'utf8');
        const parts = raw.split('\0');
        for (let i = parts.length - 1; i >= 0; i--) {
          const seg = parts[i];
          if (seg.startsWith('1/0/') && seg.includes('getGachaLog') && seg.includes('auth_appid=webview_gacha')) {
            return seg.slice(4).split('\n')[0];
          }
        }
      } catch { /* ignore */ }
    }
  }
  return null;
}

async function extractAuthkeyFromLogs(game: GameConfig): Promise<string | null> {
  for (const logPath of game.logPaths) {
    if (!existsSync(logPath)) continue;
    try {
      const content = await fs.readFile(logPath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (line.includes('authkey') && line.includes(game.logKeyword)) {
          const match = line.match(/https?:\/\/[^\s"'<>#]+/);
          if (match) return match[0];
        }
      }
    } catch { /* ignore */ }
  }
  return null;
}

ipcMain.handle('data:getAuthkeyUrl', async (_e, gameId: string): Promise<string | null> => {
  const game = getGameConfig(gameId);
  if (!game.isMiHoYo) return null;

  const clipText = clipboard.readText();
  if (clipText.includes('authkey') && clipText.includes(game.logKeyword)) return clipText;

  const cacheUrl = extractUrlFromWebCache(game);
  if (cacheUrl) return cacheUrl;

  const logUrl = await extractAuthkeyFromLogs(game);
  if (logUrl) return logUrl;

  return null;
});

ipcMain.handle('data:fetchRemoteRecords', async (event, gameId: string, url: string) => {
  const game = getGameConfig(gameId);
  if (!game.isMiHoYo) throw new Error(`${game.name}不支持在线获取，请使用JSON导入功能`);

  const sendProgress = (msg: string) => event.sender.send('fetch:progress', msg);
  const params = parseUrlParams(url);
  const authkey = params.authkey;
  if (!authkey) throw new Error('URL 不包含 authkey');

  const lang = params.lang || 'zh-cn';
  const gameBiz = params.game_biz || game.bizKey;
  const region = params.region || game.regionCn;
  const rawBase = url.includes('?') ? url.split('?')[0] : url;
  const baseUrl = rawBase.includes('getGachaLog') ? rawBase : (url.includes('mihoyo.com') ? game.apiCn : game.apiOs);

  const allRecords: GachaRecord[] = [];

  for (let i = 0; i < game.gachaTypes.length; i++) {
    const gt = game.gachaTypes[i];
    sendProgress(`正在获取 ${gt.name}...`);
    let page = 1;
    let endId = '0';

    while (true) {
      const fullUrl = `${baseUrl}?authkey_ver=1&sign_type=2&auth_appid=webview_gacha&lang=${encodeURIComponent(lang)}&game_biz=${encodeURIComponent(gameBiz)}&plat_type=pc&region=${encodeURIComponent(region)}&authkey=${authkey}&page=${page}&size=20&gacha_type=${gt.value}&end_id=${endId}`;
      const raw = await httpsGet(fullUrl);
      let json: any;
      try {
        json = JSON.parse(raw);
      } catch {
        throw new Error(`API 返回非 JSON 数据（authkey 可能已过期），请重新在游戏中打开抽卡记录页面`);
      }

      if (json.retcode === -100 || json.retcode === -101) {
        throw new Error('authkey 已过期，请在游戏中重新打开抽卡记录页面后重试');
      }
      if (json.retcode !== 0) {
        throw new Error(`API 错误 (code: ${json.retcode}): ${json.message || '未知错误'}`);
      }

      const list = json.data?.list ?? [];
      if (list.length === 0) break;

      for (const item of list) {
        allRecords.push({
          id: String(item.id),
          uid: String(item.uid),
          time: item.time,
          name: item.name,
          rankType: game.rankMap[item.rank_type] ?? 'B',
          itemType: item.item_type ?? '未知',
          poolType: gt.poolType,
          poolName: gt.name,
          itemId: item.item_id
        });
      }

      sendProgress(`${gt.name}: 已获取 ${allRecords.length} 条`);
      endId = String(list[list.length - 1].id);
      page += 1;
      await sleep(300);
    }

    sendProgress(`总计已获取 ${allRecords.length} 条 (${i + 1}/${game.gachaTypes.length})`);
  }

  return allRecords;
});

// ===== 明日方舟：官网登录 + 直接 API 获取 =====
// 认证链路: 登录官网 → 提取 HgToken → OAuth grant → UID → U8 token → 角色登录 → 抽卡 API
let arknightsWin: BrowserWindow | null = null;
let arknightsResolve: ((records: GachaRecord[] | null) => void) | null = null;
let arknightsProgress: ((msg: string) => void) | null = null;
let arknightsResolved = false;
let arknightsTimeout: ReturnType<typeof setTimeout> | null = null;
let arknightsLoginCheck: ReturnType<typeof setInterval> | null = null;

function cleanupArknights() {
  if (arknightsTimeout) { clearTimeout(arknightsTimeout); arknightsTimeout = null; }
  if (arknightsLoginCheck) { clearInterval(arknightsLoginCheck); arknightsLoginCheck = null; }
  if (arknightsWin && !arknightsWin.isDestroyed()) { arknightsWin.close(); }
  arknightsWin = null;
  arknightsResolve = null;
  arknightsProgress = null;
}

async function tryExtractHgToken(session: Electron.Session): Promise<string | null> {
  try {
    const cookies = await session.cookies.get({});
    if (cookies.length === 0) return null;
    const cookieStr = cookies
      .filter(c => (c.domain ?? '').includes('hypergryph.com') && !c.name.startsWith('_') && c.name !== 'ak-user-center')
      .map(c => `${c.name}=${c.value}`).join('; ');
    if (!cookieStr) return null;
    const resp = await httpsJsonRequest('GET', 'https://web-api.hypergryph.com/account/info/hg', null, { 'Cookie': cookieStr });
    if (resp.statusCode !== 200 || resp.data?.code !== 0) return null;
    return resp.data?.data?.content || resp.data?.data?.token || null;
  } catch { return null; }
}

async function fetchArknightsRecordsDirectly(hgToken: string, progress: (msg: string) => void): Promise<GachaRecord[]> {
  const game = getGameConfig('arknights');

  // 1. OAuth 授权
  progress('正在验证账号...');
  const grant = await httpsJsonRequest('POST', 'https://as.hypergryph.com/user/oauth2/v2/grant',
    JSON.stringify({ token: hgToken, appCode: 'be36d44aa36bfb5b', type: 1 }));
  if (grant.data.status !== 0) throw new Error(`OAuth 授权失败: ${grant.data.msg}`);
  const oauthToken: string = grant.data.data.token;

  // 2. 获取绑定列表 → UID
  progress('正在获取 UID...');
  const binding = await httpsJsonRequest('GET',
    `https://binding-api-account-prod.hypergryph.com/account/binding/v1/binding_list?token=${encodeURIComponent(oauthToken)}&appCode=arknights`, null);
  if (binding.data.status !== 0) throw new Error(`获取绑定列表失败: ${binding.data.msg}`);
  const akEntry = (binding.data.data.list as any[]).find((b: any) => b.appCode === 'arknights');
  if (!akEntry?.bindingList?.length) throw new Error('未找到明日方舟绑定账号');
  const uid: string = akEntry.bindingList[0].uid;
  progress(`UID: ${uid}`);

  // 3. 换取 U8 token
  progress('正在获取 U8 token...');
  const u8 = await httpsJsonRequest('POST', 'https://binding-api-account-prod.hypergryph.com/account/binding/v1/u8_token_by_uid',
    JSON.stringify({ token: oauthToken, uid }));
  if (u8.data.status !== 0) throw new Error(`获取 U8 token 失败: ${u8.data.msg}`);
  const u8Token: string = u8.data.data.token;

  // 4. 角色登录 → 获取 ak-user-center cookie
  progress('正在登录角色...');
  const login = await httpsJsonRequest('POST', 'https://ak.hypergryph.com/user/api/role/login',
    JSON.stringify({ token: u8Token, source_from: '', share_type: '', share_by: '' }));
  const cookieMatch = login.setCookie.match(/ak-user-center=([^;]+)/);
  if (!cookieMatch) throw new Error('角色登录失败：未获取到会话 cookie');
  const akCookie = `ak-user-center=${cookieMatch[1]}`;

  // 5. 获取抽卡类别
  progress('正在获取卡池类别...');
  const cate = await httpsJsonRequest('GET',
    `https://ak.hypergryph.com/user/api/inquiry/gacha/cate?uid=${encodeURIComponent(uid)}`,
    null, { 'x-role-token': u8Token, 'Cookie': akCookie });
  if (cate.data.code !== 0) throw new Error(`获取卡池类别失败: ${cate.data.msg}`);
  const categories: Array<{ id: string; name: string }> = cate.data.data;
  progress(`共 ${categories.length} 个卡池类别`);

  // 6. 逐类别拉取记录
  const allRecords: GachaRecord[] = [];
  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    const displayName = cat.name.replace(/\n/g, ' ');
    progress(`正在获取「${displayName}」(${i + 1}/${categories.length})...`);

    let lastPos: number | undefined;
    let lastGachaTs: string | undefined;
    const seenKeys = new Set<string>();

    while (true) {
      let url = `https://ak.hypergryph.com/user/api/inquiry/gacha/history?uid=${encodeURIComponent(uid)}&category=${encodeURIComponent(cat.id)}&size=10`;
      if (lastPos !== undefined && lastGachaTs !== undefined) {
        url += `&pos=${lastPos}&gachaTs=${encodeURIComponent(lastGachaTs)}`;
      }
      const hist = await httpsJsonRequest('GET', url, null, { 'x-role-token': u8Token, 'Cookie': akCookie });
      if (hist.data.code !== 0) throw new Error(`获取记录失败: ${hist.data.msg}`);

      const list: any[] = hist.data.data?.list || [];
      if (list.length === 0) break;

      for (const item of list) {
        const charId = String(item.charId ?? '');
        const gachaTs = String(item.gachaTs ?? '');
        const dedupKey = `${charId}_${gachaTs}`;
        if (seenKeys.has(dedupKey)) continue;
        seenKeys.add(dedupKey);
        allRecords.push({
          id: `${item.poolId ?? ''}_${charId}_${gachaTs}_${item.pos ?? ''}`,
          uid,
          time: formatArknightsTs(gachaTs),
          name: String(item.charName ?? item.charId ?? '未知'),
          rankType: game.rankMap[String(item.rarity)] ?? 'B' as RankType,
          itemType: Number(item.rarity) >= 3 ? '角色' : '材料',
          poolType: mapArknightsPoolType(cat.name),
          poolName: String(item.poolName ?? item.poolId ?? '未知').replace(/\n/g, ' '),
          itemId: charId
        });
      }

      progress(`「${displayName}」: 已获取 ${allRecords.length} 条`);

      if (hist.data.data.hasMore && list.length > 0) {
        lastPos = list[list.length - 1].pos;
        lastGachaTs = list[list.length - 1].gachaTs;
      } else {
        break;
      }
      await sleep(200);
    }
  }
  return allRecords;
}

function formatArknightsTs(ts: string | number): string {
  const ms = Number(ts);
  if (isNaN(ms)) return new Date().toISOString().slice(0, 19).replace('T', ' ');
  const d = new Date(ms > 1e12 ? ms : ms * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function mapArknightsPoolType(categoryName: string): PoolType {
  const name = (categoryName ?? '').toLowerCase();
  if (name.includes('标准') || name.includes('standard') || name.includes('normal') || name.includes('常驻')) return 'standard';
  if (name.includes('联合') || name.includes('joint')) return 'joint';
  if (name.includes('春节') || name.includes('spring') || name.includes('周年') || name.includes('anniver') || name.includes('庆典') || name.includes('感恩')) return 'festival';
  return 'exclusive';
}

ipcMain.handle('data:closeArknightsWebView', () => {
  arknightsResolved = true;
  cleanupArknights();
});

ipcMain.handle('data:fetchArknightsRecords', async (event) => {
  arknightsResolved = false;

  arknightsWin = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: '明日方舟 - 登录获取寻访记录',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  });

  arknightsWin.webContents.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
  );

  arknightsProgress = (msg) => {
    if (!event.sender.isDestroyed()) event.sender.send('fetch:progress', msg);
  };
  arknightsProgress?.('请在浏览器中登录明日方舟账号，登录后将自动获取寻访记录...');

  arknightsWin.webContents.on('did-navigate', (_e, url) => {
    arknightsProgress?.(`页面: ${url.slice(0, 80)}`);
  });
  arknightsWin.webContents.on('did-fail-load', (_e, errorCode, errorDesc) => {
    arknightsProgress?.(`加载失败 (${errorCode}): ${errorDesc}`);
  });

  arknightsWin.on('closed', () => {
    if (!arknightsResolved) {
      arknightsResolved = true;
      arknightsProgress?.('窗口已关闭，未获取到记录');
      if (arknightsLoginCheck) { clearInterval(arknightsLoginCheck); arknightsLoginCheck = null; }
      arknightsResolve?.(null);
      arknightsResolve = null;
      arknightsProgress = null;
    }
  });

  // 每 3 秒检查是否已登录（尝试从 session cookies 提取 HgToken）
  arknightsLoginCheck = setInterval(async () => {
    if (arknightsResolved || !arknightsWin || arknightsWin.isDestroyed()) {
      if (arknightsLoginCheck) { clearInterval(arknightsLoginCheck); arknightsLoginCheck = null; }
      return;
    }
    const token = await tryExtractHgToken(arknightsWin.webContents.session);
    if (!token) return;

    // 登录成功，隐藏窗口，开始拉取记录
    if (arknightsLoginCheck) { clearInterval(arknightsLoginCheck); arknightsLoginCheck = null; }
    arknightsProgress?.('登录成功！正在获取寻访记录...');
    if (arknightsTimeout) { clearTimeout(arknightsTimeout); arknightsTimeout = null; }

    try {
      const records = await fetchArknightsRecordsDirectly(token, arknightsProgress!);
      arknightsResolved = true;
      arknightsProgress?.(`获取完成，共 ${records.length} 条记录`);
      arknightsResolve?.(records);
      cleanupArknights();
    } catch (e) {
      arknightsResolved = true;
      arknightsProgress?.(`获取失败: ${e instanceof Error ? e.message : '未知错误'}`);
      arknightsResolve?.(null);
      cleanupArknights();
    }
    arknightsResolve = null;
    arknightsProgress = null;
  }, 3000);

  arknightsTimeout = setTimeout(() => {
    if (!arknightsResolved) {
      arknightsResolved = true;
      arknightsProgress?.('超时（120秒），请重试');
      cleanupArknights();
      arknightsResolve?.(null);
    }
  }, 120000);

  arknightsWin.loadURL('https://ak.hypergryph.com/');
  return new Promise<GachaRecord[] | null>((resolve) => { arknightsResolve = resolve; });
});
