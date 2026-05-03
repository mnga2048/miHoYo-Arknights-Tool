import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { GachaRecord, ImportResult, PoolType, RankType } from '../shared/types';
import { POOL_LABELS } from '../shared/types';
import { GAMES, getGameConfig } from '../shared/games';
import type { GameConfig } from '../shared/games';
import GENSHIN_ICONS from '../shared/genshin-icons.json';
import ZZZ_ICONS from '../shared/zzz-icons.json';
import './styles.css';

type Tab = 'overview' | 'records' | 'settings';

interface PoolStats {
  poolType: PoolType;
  poolName: string;
  total: number;
  sCount: number;
  aCount: number;
  bCount: number;
  currentPity: number;
  averageS: number;
  bestS: number | null;
  worstS: number | null;
  sIntervals: { pity: number; name: string; itemId: string }[];
  latestS: GachaRecord | null;
}

interface SHit {
  name: string;
  pity: number;
  time: string;
  poolName: string;
  itemId: string;
  itemType: string;
}

function normalizePool(value: unknown): PoolType {
  const t = String(value ?? '').toLowerCase();
  if (t === '2' || (t.includes('光锥') && t.includes('常驻'))) return 'standard-weapon';
  if (t.includes('weapon') || t.includes('w-engine') || t.includes('音擎') || t.includes('光锥') || t === '302' || t === '12' || t === '3002') return 'weapon';
  if (t.includes('bangboo') || t.includes('邦布') || t === '500' || t === '5001') return 'bangboo';
  if (t.includes('standard') || t.includes('常驻') || t === '200' || t === '1001' || t === '1') return 'standard';
  if (t.includes('joint') || t.includes('联合')) return 'joint';
  if (t.includes('spring') || t.includes('春节') || t.includes('anniver') || t.includes('周年') || t.includes('庆典') || t.includes('感恩')) return 'festival';
  if (t.includes('exclusive') || t.includes('角色') || t.includes('独家') || t.includes('限定') || t === '301' || t === '11' || t === '400' || t === '2002' || t === 'limited') return 'exclusive';
  if (t.includes('novice') || t.includes('新手') || t === '100') return 'novice';
  if (t.includes('chronicled') || t.includes('集录') || t === 'normal') return 'standard';
  return 'other';
}

function normalizeRank(value: unknown): RankType {
  const t = String(value ?? '').toUpperCase();
  if (t === '5' || t === '6' || t === 'S') return 'S';
  if (t === '4' || t === 'A') return 'A';
  return 'B';
}

function normalizeRecord(raw: Record<string, unknown>, index: number): GachaRecord {
  const poolType = normalizePool(raw.poolType ?? raw.pool_type ?? raw.gacha_type ?? raw.gachaType ?? raw.poolName ?? raw.pool);
  const rankType = normalizeRank(raw.rankType ?? raw.rank_type ?? raw.rank ?? raw.rarity);
  return {
    id: String(raw.id ?? raw.record_id ?? raw.recordId ?? `${raw.time ?? 'row'}-${raw.name ?? index}`),
    uid: String(raw.uid ?? raw.user_id ?? raw.account ?? 'unknown'),
    time: String(raw.time ?? raw.datetime ?? raw.date ?? new Date().toISOString().slice(0, 19).replace('T', ' ')),
    name: String(raw.name ?? raw.item_name ?? raw.itemName ?? '未知物品'),
    rankType,
    itemType: String(raw.itemType ?? raw.item_type ?? raw.type ?? '未知'),
    poolType,
    poolName: String(raw.poolName ?? raw.pool_name ?? POOL_LABELS[poolType]),
    itemId: String(raw.itemId ?? raw.item_id ?? raw.charId ?? '')
  };
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { quoted = !quoted; continue; }
    if (line[i] === ',' && !quoted) { cells.push(current.trim()); current = ''; continue; }
    current += line[i];
  }
  cells.push(current.trim());
  return cells;
}

function parseImportContent(content: string, extension: string): GachaRecord[] {
  if (extension === '.json' || content.trim().startsWith('{') || content.trim().startsWith('[')) {
    const parsed = JSON.parse(content);
    const list = Array.isArray(parsed) ? parsed : parsed.records ?? parsed.data ?? parsed.list ?? [];
    if (!Array.isArray(list)) throw new Error('JSON 中没有找到 records/data/list 数组');
    return list.map((item, i) => normalizeRecord(item as Record<string, unknown>, i));
  }
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line, i) => {
    const values = parseCsvLine(line);
    const row: Record<string, unknown> = {};
    headers.forEach((h, hi) => { row[h] = values[hi]; });
    return normalizeRecord(row, i);
  });
}

function recordKey(r: GachaRecord) { return `${r.uid}:${r.poolType}:${r.id}`; }

function mergeRecords(existing: GachaRecord[], incoming: GachaRecord[]): { records: GachaRecord[]; result: ImportResult } {
  const map = new Map(existing.map((r) => [recordKey(r), r]));
  let imported = 0;
  let skipped = 0;
  incoming.forEach((r) => {
    if (map.has(recordKey(r))) { skipped++; return; }
    imported++;
    map.set(recordKey(r), r);
  });
  return { records: [...map.values()].sort((a, b) => b.time.localeCompare(a.time)), result: { imported, skipped, total: incoming.length } };
}

function analyzePool(records: GachaRecord[], poolType: PoolType | '', pityKey: 'poolType' | 'poolName' = 'poolType', crossPool = false): PoolStats {
  const pool = poolType ? records.filter((r) => r.poolType === poolType).sort(stableSort) : [...records].sort(stableSort);
  const firstPoolName = pool.find((r) => r.poolName)?.poolName ?? '';
  let sinceS = 0;
  let lastBanner = '';
  const intervals: { pity: number; name: string; itemId: string; itemType: string }[] = [];
  let latestS: GachaRecord | null = null;
  pool.forEach((r) => {
    const banner = crossPool ? '__all__' : (pityKey === 'poolName' ? r.poolName : r.poolType);
    if (pityKey === 'poolName' && !crossPool && banner !== lastBanner && lastBanner !== '') sinceS = 0;
    lastBanner = banner;
    sinceS++;
    if (r.rankType === 'S') { intervals.push({ pity: sinceS, name: r.name, itemId: r.itemId ?? '', itemType: r.itemType }); sinceS = 0; latestS = r; }
  });
  const sCount = pool.filter((r) => r.rankType === 'S').length;
  const aCount = pool.filter((r) => r.rankType === 'A').length;
  return {
    poolType: poolType || 'standard', poolName: firstPoolName || (poolType ? POOL_LABELS[poolType] : '全部寻访') || poolType,
    total: pool.length, sCount, aCount, bCount: pool.length - sCount - aCount,
    currentPity: sinceS,
    averageS: intervals.length ? Math.round((intervals.reduce((s, n) => s + n.pity, 0) / intervals.length) * 10) / 10 : 0,
    bestS: intervals.length ? Math.min(...intervals.map((n) => n.pity)) : null,
    worstS: intervals.length ? Math.max(...intervals.map((n) => n.pity)) : null,
    sIntervals: intervals, latestS
  };
}

function buildMonthly(records: GachaRecord[]) {
  const map = new Map<string, { total: number; s: number; a: number }>();
  records.forEach((r) => {
    const m = r.time.slice(0, 7);
    const s = map.get(m) ?? { total: 0, s: 0, a: 0 };
    s.total++; if (r.rankType === 'S') s.s++; if (r.rankType === 'A') s.a++;
    map.set(m, s);
  });
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-8);
}

function stableSort(a: GachaRecord, b: GachaRecord): number {
  const tc = a.time.localeCompare(b.time);
  if (tc !== 0) return tc;
  return a.id.localeCompare(b.id);
}

function buildSHitList(records: GachaRecord[], pityKey: 'poolType' | 'poolName' = 'poolType', crossPool = false): SHit[] {
  const hits: SHit[] = [];
  const byPool: Record<string, number> = {};
  [...records].sort(stableSort).forEach((r) => {
    const key = crossPool ? '__all__' : (pityKey === 'poolName' ? r.poolName : r.poolType);
    byPool[key] = (byPool[key] ?? 0) + 1;
    if (r.rankType === 'S') {
      hits.push({ name: r.name, pity: byPool[key], time: r.time, poolName: r.poolName, itemId: r.itemId ?? '', itemType: r.itemType });
      byPool[key] = 0;
    }
  });
  return hits.reverse();
}

function rankDisplay(rankType: RankType, gameId: string): string {
  if (gameId === 'arknights') {
    const m: Record<string, string> = { S: '6星', A: '5星', B: '4星' };
    return m[rankType] ?? rankType;
  }
  return rankType;
}

function formatPercent(v: number) { return Number.isFinite(v) ? `${Math.round(v * 10) / 10}%` : '0%'; }

function SortBtn({ asc, onToggle }: { asc: boolean; onToggle: () => void }) {
  return (
    <button className="sort-btn" onClick={onToggle} title={asc ? '当前：正序（旧→新）' : '当前：倒序（新→旧）'}>
      {asc ? '↑ 正序' : '↓ 倒序'}
    </button>
  );
}

function CharAvatar({ name, rankType, gameId, itemId, itemType, size = 32 }: { name: string; rankType: RankType; gameId: string; itemId: string; itemType?: string; size?: number }) {
  const [imgErr, setImgErr] = React.useState(false);
  const [imgSrcIndex, setImgSrcIndex] = React.useState(0);

const getAvatarUrls = () => {
  if (gameId === 'zzz' && itemId) {
    const icon = ZZZ_ICONS[itemId];
    if (icon) return [`https://enka.network${icon}`];
    return [];
  }

  if (gameId === 'arknights' && itemId) {
    const jsdelivrUrl = `https://cdn.jsdelivr.net/gh/yuanyan3060/ArknightsGameResource@main/avatar/${itemId}.png`;
    const githubUrl = `https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/main/avatar/${itemId}.png`;
    return [jsdelivrUrl, githubUrl];
  }

  if (gameId === 'genshin' && name) {
    const entry = GENSHIN_ICONS[name];
    if (entry) {
      return [`https://enka.network/ui/${entry.icon}`];
    }
    return [];
  }

  if (gameId === 'starrail' && itemId) {
    const isLightCone = itemType === '光锥' || itemType?.includes('光锥');
    const folder = isLightCone ? 'light_cone' : 'character';
    return [`https://raw.githubusercontent.com/Mar-7th/StarRailRes/master/icon/${folder}/${itemId}.png`];
  }
if (gameId === 'zzz' && itemId) {
  return [
    `https://enka.network/ui/${itemId}.png`,
    `https://enka.network/ui/UI_AvatarIcon_${itemId}.png`
  ];
}
  return [];
};

  const urls = getAvatarUrls();
  const url = urls[imgSrcIndex] || null;
  const borderColor = rankType === 'S' ? '#e3ff37' : rankType === 'A' ? '#c78aff' : '#4f8cff';
  const bg = rankType === 'S'
    ? 'linear-gradient(145deg, rgba(227, 255, 55, 0.15), rgba(168, 194, 0, 0.08))'
    : rankType === 'A'
    ? 'linear-gradient(145deg, rgba(199, 138, 255, 0.15), rgba(139, 92, 246, 0.08))'
    : 'linear-gradient(145deg, rgba(79, 140, 255, 0.15), rgba(59, 130, 246, 0.08))';
  const fg = rankType === 'S' ? '#e3ff37' : rankType === 'A' ? '#c78aff' : '#4f8cff';

  const handleImgError = () => {
    if (imgSrcIndex < urls.length - 1) {
      setImgSrcIndex(imgSrcIndex + 1);
    } else {
      setImgErr(true);
    }
  };

  if (url && !imgErr) {
    return <img key={itemId} className="char-avatar" style={{ width: size, height: size, border: `2px solid ${borderColor}` }} src={url} alt="" onError={handleImgError} />;
  }
  return (
    <div key={itemId} className="char-avatar avatar-fb" style={{
      width: size, height: size,
      background: bg,
      border: `2px solid ${borderColor}`,
      fontSize: size * 0.4,
      color: fg,
      fontWeight: 800,
      boxShadow: `inset 0 0 0 1px ${borderColor}33`
    }}>
      {name.charAt(0)}
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return <section className="stat-card"><span>{label}</span><strong>{value}</strong><small>{hint}</small></section>;
}

function MiniBar({ label, value, max, tone }: { label: string; value: number; max: number; tone: 's' | 'a' | 'b' }) {
  return (
    <div className="mini-bar">
      <div className="mini-bar-label"><span>{label}</span><b>{value}</b></div>
      <div className="bar-track"><div className={`bar-fill ${tone}`} style={{ width: `${max > 0 ? Math.max(4, (value / max) * 100) : 0}%` }} /></div>
    </div>
  );
}

function PoolPanel({ stats, pityCap, game }: { stats: PoolStats; pityCap: number; game: GameConfig }) {
  const progress = Math.min(100, Math.round((stats.currentPity / pityCap) * 100));
  const displayName = stats.poolName && stats.poolName !== stats.poolType ? stats.poolName : (POOL_LABELS[stats.poolType] || stats.poolType);
  return (
    <section className="pool-panel">
      <div className="pool-panel-head">
        <div><h3>{displayName}</h3><p>{stats.total ? `最近 ${stats.latestS?.name ?? '暂无'}` : '暂无记录'}</p></div>
        <b>{stats.total} {game.pullUnit}</b>
      </div>
      <div className="pity-ring" style={{ '--progress': `${progress}%` } as React.CSSProperties}>
        <strong>{stats.currentPity}</strong><span>距上次{game.sUnit}</span>
      </div>
      <div className="pool-grid">
        <span>{stats.sCount} 次{game.sUnit}</span>
        <span>{stats.aCount} 次{game.id === 'arknights' ? '5星' : 'A'}</span>
        <span>平均 {stats.averageS || '-'}</span>
        <span>最非 {stats.worstS ?? '-'}</span>
      </div>
    </section>
  );
}

let currentGame: GameConfig = GAMES[0];

function App() {
  const [activeGameId, setActiveGameId] = useState(GAMES[0].id);
  const [records, setRecords] = useState<GachaRecord[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [status, setStatus] = useState('正在加载本地记录...');
  const [filter, setFilter] = useState('');
  const [filterPool, setFilterPool] = useState('');
  const [filterRank, setFilterRank] = useState('');
  const [fetching, setFetching] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [sortAsc, setSortAsc] = useState(false);
  const [hitSortAsc, setHitSortAsc] = useState(false);
  const [intervalSortAsc, setIntervalSortAsc] = useState(false);

  currentGame = getGameConfig(activeGameId);
  const game = currentGame;

  const poolTypes = useMemo(() => [...new Set(records.map((r) => r.poolType))], [records]);
  const poolNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    records.forEach((r) => { if (!map[r.poolType]) map[r.poolType] = r.poolName; });
    return map;
  }, [records]);
  const poolPityMap = useMemo((): Record<string, number> => {
    if (game.id === 'arknights') {
      return { exclusive: 99, standard: 99, other: 99, 'w-engine': 99, weapon: 99, bangboo: 99, novice: 99, chronicled: 99, 'standard-weapon': 99, joint: 99, festival: 99 };
    }
    return { exclusive: 90, 'w-engine': 80, bangboo: 80, standard: 90, 'standard-weapon': 90, other: 90, weapon: 80, novice: 20, chronicled: 90, joint: 90, festival: 90 };
  }, [game.id]);
  const pityKey = 'poolType';
  const crossPool = game.id === 'arknights';
  const stats = useMemo(() => poolTypes.map((pt) => analyzePool(records, pt, pityKey, crossPool)), [records, poolTypes, pityKey, crossPool]);
  const arknightsCombined = useMemo(() => game.id === 'arknights' && records.length ? analyzePool(records, '', pityKey, true) : null, [game.id, records, pityKey]);
  const total = records.length;
  const sCount = records.filter((r) => r.rankType === 'S').length;
  const aCount = records.filter((r) => r.rankType === 'A').length;
  const monthly = useMemo(() => buildMonthly(records), [records]);
  const maxMonth = Math.max(1, ...monthly.map(([, v]) => v.total));
  const sHitListRaw = useMemo(() => buildSHitList(records, pityKey, crossPool), [records, pityKey, crossPool]);
  const sHitList = useMemo(() => hitSortAsc ? [...sHitListRaw].reverse() : sHitListRaw, [sHitListRaw, hitSortAsc]);
  const maxPity = Math.max(1, ...sHitList.map((h) => h.pity));
  const overallAvgPity = sHitListRaw.length > 0
    ? Math.round(sHitListRaw.reduce((sum, h) => sum + h.pity, 0) / sHitListRaw.length * 10) / 10
    : 0;

  const visibleRecords = useMemo(() => {
    const filtered = records.filter((r) => {
      if (filterPool && r.poolType !== filterPool) return false;
      if (filterRank && r.rankType !== filterRank) return false;
      if (filter.trim() && !`${r.name}${r.itemType}${r.poolName}${r.uid}`.includes(filter.trim())) return false;
      return true;
    });
    return [...filtered].sort(sortAsc ? stableSort : (a, b) => -stableSort(a, b) || 0);
  }, [records, filter, filterPool, filterRank, sortAsc]);

  const loadGameData = useCallback(async (gid: string) => {
    try {
      const data = await window.zzzApi?.loadData(gid);
      setRecords(data.records);
      const g = getGameConfig(gid);
      setStatus(data.records.length ? `已加载 ${data.records.length} 条${g.name}记录` : `还没有${g.name}记录`);
    } catch (e) {
      setStatus(`读取失败：${(e as Error).message}`);
    }
  }, []);

  useEffect(() => { loadGameData(activeGameId); }, [activeGameId, loadGameData]);
  useEffect(() => { window.zzzApi?.onFetchProgress((msg) => setStatus(msg)); }, []);

  const switchGame = (gid: string) => {
    setActiveGameId(gid);
    setActiveTab('overview');
    setFilter('');
  };

  async function persist(nextRecords: GachaRecord[], message: string) {
    setRecords(nextRecords);
    await window.zzzApi?.saveData(activeGameId, nextRecords);
    setStatus(message);
  }

  async function importFile() {
    try {
      const file = await window.zzzApi?.chooseImport();
      if (!file) return;
      const parsed = parseImportContent(file.content, file.extension);
      const merged = mergeRecords(records, parsed);
      await persist(merged.records, `导入完成：新增 ${merged.result.imported} 条，跳过重复 ${merged.result.skipped} 条`);
    } catch (e) { setStatus(`导入失败：${(e as Error).message}`); }
  }

  async function fetchRemote() {
    if (fetching) return;

    if (!game.isMiHoYo) {
      try {
        setFetching(true);
        setStatus(`${game.name}：正在打开登录页面...`);
        const remoteRecords = await window.zzzApi?.fetchArknightsRecords() ?? [];
        if (!remoteRecords || remoteRecords.length === 0) {
          setStatus(`${game.name}未获取到记录，请在弹出的页面中完成登录并打开抽卡记录`);
          return;
        }
        const merged = mergeRecords(records, remoteRecords);
        await persist(merged.records, `获取 ${remoteRecords.length} 条${game.name}记录：新增 ${merged.result.imported}，跳过 ${merged.result.skipped}`);
      } catch (e) { setStatus(`${game.name}获取失败：${(e as Error).message}`); }
      finally { setFetching(false); }
      return;
    }

    try {
      setFetching(true);
      setStatus('正在查找抽卡记录链接...');
      let url = await window.zzzApi?.getAuthkeyUrl(activeGameId);
      if (!url) {
        setFetching(false);
        url = await window.zzzApi?.showInput(`未自动找到${game.name}抽卡记录链接，请手动粘贴URL。\n\n操作：打开${game.name} → 抽卡记录 → 查看详情，复制浏览器地址栏完整URL`, '');
        if (!url) { setStatus('已取消'); return; }
        setFetching(true);
      }
      if (!url.includes('authkey')) { setStatus('链接无效：不包含 authkey'); return; }
      setStatus('正在获取...');
      const remoteRecords = await window.zzzApi?.fetchRemoteRecords(activeGameId, url) ?? [];
      if (remoteRecords.length === 0) { setStatus('未获取到记录，authkey 可能已过期'); return; }
      const merged = mergeRecords(records, remoteRecords);
      await persist(merged.records, `获取 ${remoteRecords.length} 条：新增 ${merged.result.imported}，跳过 ${merged.result.skipped}`);
    } catch (e) { setStatus(`获取失败：${(e as Error).message}`); }
    finally { setFetching(false); }
  }

  async function clearData() {
    if (!window.confirm('确认清空当前记录？')) return;
    await persist([], '本地记录已清空');
  }

  async function exportData() {
    const ok = await window.zzzApi?.exportData(activeGameId, records);
    setStatus(ok ? '导出完成' : '已取消');
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">{game.brand}</span>
          <div>
            <h1>{game.name}</h1>
            <p>抽卡分析</p>
          </div>
        </div>

        <div className="game-selector">
          {GAMES.map((g) => (
            <button key={g.id} className={g.id === activeGameId ? 'active' : ''} onClick={() => switchGame(g.id)}>
              <span className="game-brand">{g.brand}</span>
              <span className="game-name">{g.name}</span>
            </button>
          ))}
        </div>

<nav>
  <button className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>总览</button>
  {game.id !== 'arknights' && poolTypes.map((pt) => (
    <button key={pt} className={activeTab === pt ? 'active' : ''} onClick={() => setActiveTab(pt as Tab)}>
      {poolNameMap[pt] || POOL_LABELS[pt] || pt}
    </button>
  ))}
  <button className={activeTab === 'records' ? 'active' : ''} onClick={() => setActiveTab('records')}>明细</button>
  <button className={activeTab === 'settings' ? 'active' : ''} onClick={() => setActiveTab('settings')}>管理</button>
</nav>

        {activeGameId === 'zzz' && (
          <button className="action-btn wiki-btn" onClick={() => window.zzzApi?.openExternal('https://baike.mihoyo.com/zzz/wiki/channel/map/2/43')}>访问情报站</button>
        )}
        <button className="action-btn" onClick={() => setShowHelp(true)}>使用帮助</button>

        <div className="side-note">
          <strong>{total}</strong>
          <span>条{game.name}记录</span>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p>Gacha Analyzer</p>
            <h2>{activeTab === 'overview' ? '抽卡总览' : activeTab === 'records' ? '抽卡明细' : activeTab === 'settings' ? '数据管理' : (poolNameMap[activeTab as PoolType] || POOL_LABELS[activeTab as PoolType] || activeTab)}</h2>
          </div>
          <div className="actions">
            <button className="fetch-btn" onClick={fetchRemote} disabled={fetching}>{fetching ? '获取中...' : '获取记录'}</button>
            <button onClick={importFile}>导入</button>
            <button onClick={exportData} disabled={!records.length}>导出</button>
          </div>
        </header>

        <div className="status-line">{status}</div>

        {activeTab !== 'settings' && (
          <>
            <section className="stats-row">
              <StatCard label={`总${game.pullUnit}数`} value={total} hint="所有池合计" />
              <StatCard label={game.sUnit} value={sCount} hint={`出率 ${formatPercent(total ? (sCount / total) * 100 : 0)}`} />
              <StatCard label={game.id === 'arknights' ? '5 星' : 'A 级'} value={aCount} hint={`出率 ${formatPercent(total ? (aCount / total) * 100 : 0)}`} />
              <StatCard label={`平均${game.sUnit}间隔`} value={sCount ? overallAvgPity : '-'} hint="各池实际平均" />
            </section>

            {activeTab === 'overview' && (
              <section className="dashboard-grid">
                <div className="panel wide">
                  <div className="panel-head"><h3>月度趋势</h3><span>近 8 个月</span></div>
                  <div className="month-chart">
                    {monthly.length ? monthly.map(([month, value]) => {
                      const sPct = value.total ? (value.s / value.total) * 100 : 0;
                      const aPct = value.total ? (value.a / value.total) * 100 : 0;
                      const bPct = value.total ? ((value.total - value.s - value.a) / value.total) * 100 : 0;
                      const sDeg = (sPct / 100) * 360;
                      const aDeg = (aPct / 100) * 360;
                      const bDeg = (bPct / 100) * 360;
                      return (
                        <div className="month-item" key={month}>
                          <svg className="month-ring" viewBox="0 0 36 36">
                            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#2a2d36" strokeWidth="3" />
                            {sDeg > 0 && <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e3ff37" strokeWidth="3" strokeDasharray={`${sDeg} ${360 - sDeg}`} strokeDashoffset="25" />}
                            {aDeg > 0 && <circle cx="18" cy="18" r="15.9" fill="none" stroke="#c78aff" strokeWidth="3" strokeDasharray={`${aDeg} ${360 - aDeg}`} strokeDashoffset={`${25 - sDeg}`} />}
                            {bDeg > 0 && <circle cx="18" cy="18" r="15.9" fill="none" stroke="#4f8cff" strokeWidth="3" strokeDasharray={`${bDeg} ${360 - bDeg}`} strokeDashoffset={`${25 - sDeg - aDeg}`} />}
                          </svg>
                          <div className="month-info">
                            <small>{month.slice(5)}</small>
                            <b>{value.total}</b>
                          </div>
                        </div>
                      );
                    }) : <div className="empty">导入记录后显示趋势</div>}
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-head"><h3>稀有度分布</h3><span>{total} {game.pullUnit}</span></div>
                  <MiniBar label={game.sUnit} value={sCount} max={total} tone="s" />
                  <MiniBar label={game.id === 'arknights' ? '5 星' : 'A 级'} value={aCount} max={total} tone="a" />
                  <MiniBar label={game.id === 'arknights' ? '4 星' : 'B 级'} value={Math.max(0, total - sCount - aCount)} max={total} tone="b" />
                </div>
                {arknightsCombined
                  ? <PoolPanel stats={arknightsCombined} pityCap={game.pityCap} game={game} />
                  : stats.map((s) => <PoolPanel key={s.poolType} stats={s} pityCap={poolPityMap[s.poolType] ?? game.pityCap} game={game} />)}
                <div className="panel wide">
                  <div className="panel-head"><h3>最近{game.sUnit}出货</h3><span>卡片视图</span></div>
                  <div className="recent-cards">
                    {sHitList.length ? sHitList.slice(0, 20).map((hit, i) => (
                      <div className="recent-card" key={`card-${hit.name}-${i}`}>
                        <div className="recent-card-img">
                          <CharAvatar name={hit.name} rankType="S" gameId={game.id} itemId={hit.itemId} itemType={hit.itemType} size={64} />
                        </div>
                        <span className="recent-card-name">{hit.name}</span>
                        <span className="recent-card-pity">{hit.pity} 抽</span>
                      </div>
                    )) : <div className="empty">暂无{game.sUnit}出货记录</div>}
                  </div>
                </div>
                <div className="panel wide s-hit-panel">
                  <div className="panel-head"><h3>{game.sUnit}出货记录</h3><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><SortBtn asc={hitSortAsc} onToggle={() => setHitSortAsc(!hitSortAsc)} /><span>共 {sHitList.length} 次</span></div></div>
                  <div className="hit-list">
                    {sHitList.length ? sHitList.map((hit, i) => (
                      <div className="hit-row" key={`${hit.name}-${i}`}>
                        <CharAvatar name={hit.name} rankType="S" gameId={game.id} itemId={hit.itemId} itemType={hit.itemType} size={30} />
                        <span className="hit-row-name">{hit.name}</span>
                        <div className="hit-row-track"><div className="hit-row-bar s-bar" style={{ width: `${(hit.pity / maxPity) * 100}%` }} /></div>
                        <b className="hit-row-pity">{hit.pity}</b>
                        <small className="hit-row-pool">{hit.poolName}</small>
                      </div>
                    )) : <div className="empty">暂无{game.sUnit}出货记录</div>}
                  </div>
                </div>
              </section>
            )}

            {activeTab !== 'overview' && activeTab !== 'records' && activeTab !== 'settings' && (() => {
              const cs = stats.find((s) => s.poolType === activeTab);
              if (!cs) return null;
              const sortedIntervals = intervalSortAsc ? [...cs.sIntervals].reverse() : cs.sIntervals;
              return (
                <section className="dashboard-grid pool-view">
                  <PoolPanel stats={cs} pityCap={poolPityMap[cs.poolType] ?? game.pityCap} game={game} />
                  <div className="panel wide">
                    <div className="panel-head"><h3>最近{game.sUnit}出货</h3><span>卡片视图</span></div>
                    <div className="recent-cards">
                      {sortedIntervals.length ? sortedIntervals.slice(0, 20).map((item, i) => (
                        <div className="recent-card" key={`card-${item.pity}-${i}`}>
                          <div className="recent-card-img">
                            <CharAvatar name={item.name} rankType="S" gameId={game.id} itemId={item.itemId} itemType={item.itemType} size={64} />
                          </div>
                          <span className="recent-card-name">{item.name}</span>
                          <span className="recent-card-pity">{item.pity} 抽</span>
                        </div>
                      )) : <div className="empty">暂无{game.sUnit}出货记录</div>}
                    </div>
                  </div>
                  <div className="panel wide">
                    <div className="panel-head"><h3>{game.sUnit}出货间隔</h3><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><SortBtn asc={intervalSortAsc} onToggle={() => setIntervalSortAsc(!intervalSortAsc)} /><span>按时间顺序</span></div></div>
                    <div className="hit-list">
                      {sortedIntervals.length ? sortedIntervals.map((item, i) => (
                        <div className="hit-row" key={`${item.pity}-${i}`}>
                          <CharAvatar name={item.name} rankType="S" gameId={game.id} itemId={item.itemId} itemType={item.itemType} size={30} />
                          <span className="hit-row-name">{item.name}</span>
                          <div className="hit-row-track"><div className="hit-row-bar i-bar" style={{ width: `${(item.pity / (poolPityMap[cs.poolType] ?? game.pityCap)) * 100}%` }} /></div>
                          <b className="hit-row-pity">{item.pity}</b>
                        </div>
                      )) : <div className="empty">暂无记录</div>}
                    </div>
                  </div>
                </section>
              );
            })()}

            <section className="records-panel">
              <div className="panel-head"><h3>抽卡明细</h3><div className="filter-bar"><SortBtn asc={sortAsc} onToggle={() => setSortAsc(!sortAsc)} /><select value={filterPool} onChange={(e) => setFilterPool(e.target.value)}><option value="">全部卡池</option>{poolTypes.map((pt) => <option key={pt} value={pt}>{poolNameMap[pt] || POOL_LABELS[pt] || pt}</option>)}</select><select value={filterRank} onChange={(e) => setFilterRank(e.target.value)}><option value="">全部稀有度</option><option value="S">{game.sUnit}</option><option value="A">{game.id === 'arknights' ? '5 星' : 'A 级'}</option><option value="B">{game.id === 'arknights' ? '4 星' : 'B 级'}</option></select><input placeholder="搜索" value={filter} onChange={(e) => setFilter(e.target.value)} /></div></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>时间</th><th>名称</th><th>稀有度</th><th>类型</th><th>卡池</th><th>UID</th></tr></thead>
                  <tbody>
                    {visibleRecords.slice(0, 500).map((r) => (
                      <tr key={recordKey(r)} className={`rank-${r.rankType.toLowerCase()}`}>
                        <td>{r.time}</td><td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><CharAvatar name={r.name} rankType={r.rankType} gameId={game.id} itemId={r.itemId ?? ''} itemType={r.itemType} size={40} /><span>{r.name}</span></div></td><td>{rankDisplay(r.rankType, game.id)}</td><td>{r.itemType}</td><td>{r.poolName}</td><td>{r.uid}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!visibleRecords.length && <div className="empty table-empty">没有匹配记录</div>}
              </div>
            </section>
          </>
        )}

        {activeTab === 'settings' && (
          <section className="settings-grid">
            <div className="panel wide">
              <h3>支持的导入格式</h3>
              <p>JSON 可使用 records/data/list 数组；CSV 第一行作为字段名。</p>
              <pre>{`[{ "id": "...", "uid": "...", "time": "...", "name": "角色名", "rankType": "S", "itemType": "角色", "poolType": "exclusive", "poolName": "限定池" }]`}</pre>
            </div>
            <div className="panel">
              <h3>本地数据</h3>
              <p>所有记录仅保存在本机，不上传账号信息。</p>
              <button className="danger" onClick={clearData} disabled={!records.length}>清空记录</button>
            </div>
          </section>
        )}
      </section>

      {showHelp && (
        <div className="modal-overlay" onClick={() => setShowHelp(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>使用帮助</h2>
              <button onClick={() => setShowHelp(false)}>✕</button>
            </div>
            <div className="modal-body">
              <h3>在线获取记录（原神 / 星穹铁道 / 绝区零）</h3>
              <ol>
                <li>打开游戏 → 进入<b>抽卡记录</b>页面</li>
                <li>点击底部的<b>「查看详情」</b>按钮</li>
                <li>回到本工具，点击顶部的<b>「获取记录」</b>按钮</li>
                <li>工具会自动从游戏日志中提取链接并拉取全部数据</li>
              </ol>
              <p className="help-note">如果自动获取失败，也可以手动复制浏览器地址栏的 URL，然后点击获取记录，在弹窗中粘贴。</p>

              <h3>为什么找不到链接？</h3>
              <ul>
                <li>必须在游戏中<b>打开过抽卡记录页面</b>，日志才会记录链接</li>
                <li>链接有效期约 24 小时，过期后需重新打开</li>
                <li>本工具会扫描以下游戏日志文件：<br />
                  <code>miHoYo/绝区零/Player.log</code><br />
                  <code>miHoYo/原神/Player.log</code><br />
                  <code>miHoYo/崩坏：星穹铁道/Player.log</code>
                </li>
              </ul>

              <h3>JSON / CSV 导入</h3>
              <p>点击「导入」按钮选择文件。支持多种字段命名格式（如 <code>poolType</code> / <code>pool_type</code> / <code>gacha_type</code> 均可识别）。</p>

              <h3>明日方舟 — 获取抽卡记录</h3>
              <p>点击「获取记录」会弹出一个<b>内置浏览器窗口</b>，无需安装任何额外工具。</p>
              <ol>
                <li>点击「获取记录」按钮</li>
                <li>在弹出的页面中<b>完成登录</b>（手机号+验证码）</li>
                <li>登录后，页面会自动加载<b>寻访记录</b></li>
                <li>工具会自动从页面中提取数据并关闭弹窗</li>
              </ol>
              <p className="help-note">整个过程约 1-2 分钟。如果 90 秒内未检测到数据，请确认页面已导航到抽卡记录页面。</p>

              <h3>数据安全</h3>
              <p>所有数据仅保存在本机，不会上传任何账号信息。authkey 仅在内存中使用，不会存储。</p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
