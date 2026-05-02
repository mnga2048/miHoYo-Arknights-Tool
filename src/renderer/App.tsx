import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { GachaRecord, ImportResult, PoolType, RankType } from '../shared/types';
import { POOL_LABELS } from '../shared/types';
import { GAMES, getGameConfig } from '../shared/games';
import type { GameConfig } from '../shared/games';
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
  sIntervals: number[];
  latestS: GachaRecord | null;
}

interface SHit {
  name: string;
  pity: number;
  time: string;
  poolName: string;
}

const poolPityCap: Record<PoolType, number> = {
  exclusive: 90, 'w-engine': 80, bangboo: 80, standard: 90, other: 90,
  weapon: 80, novice: 20, chronicled: 90
};

function normalizePool(value: unknown): PoolType {
  const t = String(value ?? '').toLowerCase();
  if (t.includes('weapon') || t.includes('w-engine') || t.includes('音擎') || t.includes('光锥') || t === '302' || t === '12' || t === '3002') return 'weapon';
  if (t.includes('bangboo') || t.includes('邦布') || t === '500' || t === '5001') return 'bangboo';
  if (t.includes('standard') || t.includes('常驻') || t === '200' || t === '1001') return 'standard';
  if (t.includes('exclusive') || t.includes('角色') || t.includes('独家') || t.includes('限定') || t === '301' || t === '11' || t === '400' || t === '2002' || t === 'limited' || t === 'joint') return 'exclusive';
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
    itemType: String(raw.itemType ?? raw.item_type ?? raw.type ?? (rankType === 'B' ? '材料' : '未知')),
    poolType,
    poolName: String(raw.poolName ?? raw.pool_name ?? POOL_LABELS[poolType])
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
  return { records: [...map.values()].sort((a, b) => Date.parse(b.time) - Date.parse(a.time)), result: { imported, skipped, total: incoming.length } };
}

function analyzePool(records: GachaRecord[], poolType: PoolType): PoolStats {
  const pool = records.filter((r) => r.poolType === poolType).sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  let sinceS = 0;
  const intervals: number[] = [];
  let latestS: GachaRecord | null = null;
  pool.forEach((r) => {
    sinceS++;
    if (r.rankType === 'S') { intervals.push(sinceS); sinceS = 0; latestS = r; }
  });
  const sCount = pool.filter((r) => r.rankType === 'S').length;
  const aCount = pool.filter((r) => r.rankType === 'A').length;
  return {
    poolType, poolName: POOL_LABELS[poolType] || poolType,
    total: pool.length, sCount, aCount, bCount: pool.length - sCount - aCount,
    currentPity: sinceS,
    averageS: intervals.length ? Math.round((intervals.reduce((s, n) => s + n, 0) / intervals.length) * 10) / 10 : 0,
    bestS: intervals.length ? Math.min(...intervals) : null,
    worstS: intervals.length ? Math.max(...intervals) : null,
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

function buildSHitList(records: GachaRecord[]): SHit[] {
  const hits: SHit[] = [];
  const byPool: Record<string, number> = {};
  records.sort((a, b) => Date.parse(a.time) - Date.parse(b.time)).forEach((r) => {
    byPool[r.poolType] = (byPool[r.poolType] ?? 0) + 1;
    if (r.rankType === 'S') {
      hits.push({ name: r.name, pity: byPool[r.poolType], time: r.time, poolName: r.poolName });
      byPool[r.poolType] = 0;
    }
  });
  return hits.reverse();
}

function formatPercent(v: number) { return Number.isFinite(v) ? `${Math.round(v * 10) / 10}%` : '0%'; }

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

function PoolPanel({ stats, pityCap }: { stats: PoolStats; pityCap: number }) {
  const progress = Math.min(100, Math.round((stats.currentPity / pityCap) * 100));
  return (
    <section className="pool-panel">
      <div className="pool-panel-head">
        <div><h3>{stats.poolName}</h3><p>{stats.total ? `最近 ${stats.latestS?.name ?? '暂无'}` : '暂无记录'}</p></div>
        <b>{stats.total} {currentGame.pullUnit}</b>
      </div>
      <div className="pity-ring" style={{ '--progress': `${progress}%` } as React.CSSProperties}>
        <strong>{stats.currentPity}</strong><span>距上次{currentGame.sUnit}</span>
      </div>
      <div className="pool-grid">
        <span>{stats.sCount} 次{currentGame.sUnit}</span>
        <span>{stats.aCount} 次A</span>
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
  const [fetching, setFetching] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  currentGame = getGameConfig(activeGameId);
  const game = currentGame;

  const poolTypes = useMemo(() => [...new Set(records.map((r) => r.poolType))], [records]);
  const stats = useMemo(() => poolTypes.map((pt) => analyzePool(records, pt)), [records, poolTypes]);
  const total = records.length;
  const sCount = records.filter((r) => r.rankType === 'S').length;
  const aCount = records.filter((r) => r.rankType === 'A').length;
  const monthly = useMemo(() => buildMonthly(records), [records]);
  const maxMonth = Math.max(1, ...monthly.map(([, v]) => v.total));
  const sHitList = useMemo(() => buildSHitList(records), [records]);
  const maxPity = Math.max(1, ...sHitList.map((h) => h.pity));

  const visibleRecords = useMemo(() => records
    .filter((r) => `${r.name}${r.itemType}${r.poolName}${r.uid}`.includes(filter.trim())), [records, filter]);

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
    try {
      setFetching(true);
      setStatus('正在查找抽卡记录链接...');
      let url = await window.zzzApi?.getAuthkeyUrl(activeGameId);
      if (!url) {
        setFetching(false);
        if (!game.isMiHoYo) {
          setStatus(`${game.name}不支持在线获取，请使用JSON导入`);
          return;
        }
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
          {poolTypes.map((pt) => (
            <button key={pt} className={activeTab === pt ? 'active' : ''} onClick={() => setActiveTab(pt as Tab)}>
              {POOL_LABELS[pt] || pt}
            </button>
          ))}
          <button className={activeTab === 'records' ? 'active' : ''} onClick={() => setActiveTab('records')}>明细</button>
          <button className={activeTab === 'settings' ? 'active' : ''} onClick={() => setActiveTab('settings')}>管理</button>
        </nav>

        <button className="help-btn" onClick={() => setShowHelp(true)}>使用帮助</button>

        <div className="side-note">
          <strong>{total}</strong>
          <span>条{game.name}记录</span>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p>Gacha Analyzer</p>
            <h2>{activeTab === 'overview' ? '抽卡总览' : activeTab === 'records' ? '抽卡明细' : activeTab === 'settings' ? '数据管理' : (POOL_LABELS[activeTab as PoolType] || activeTab)}</h2>
          </div>
          <div className="actions">
            <button className="fetch-btn" onClick={fetchRemote} disabled={fetching || !game.isMiHoYo}>{fetching ? '获取中...' : '获取记录'}</button>
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
              <StatCard label="A 级" value={aCount} hint={`出率 ${formatPercent(total ? (aCount / total) * 100 : 0)}`} />
              <StatCard label={`平均${game.sUnit}间隔`} value={sCount ? Math.round(total / sCount) : '-'} hint="粗略估算" />
            </section>

            {activeTab === 'overview' && (
              <section className="dashboard-grid">
                <div className="panel wide">
                  <div className="panel-head"><h3>月度趋势</h3><span>近 8 个月</span></div>
                  <div className="month-chart">
                    {monthly.length ? monthly.map(([month, value]) => (
                      <div className="month-item" key={month}>
                        <div className="month-column">
                          <span className="month-s" style={{ height: `${(value.s / maxMonth) * 100}%` }} />
                          <span className="month-a" style={{ height: `${(value.a / maxMonth) * 100}%` }} />
                          <span className="month-total" style={{ height: `${(value.total / maxMonth) * 100}%` }} />
                        </div>
                        <small>{month.slice(5)}</small>
                      </div>
                    )) : <div className="empty">导入记录后显示趋势</div>}
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-head"><h3>稀有度分布</h3><span>{total} {game.pullUnit}</span></div>
                  <MiniBar label={game.sUnit} value={sCount} max={total} tone="s" />
                  <MiniBar label="A 级" value={aCount} max={total} tone="a" />
                  <MiniBar label="B 级" value={Math.max(0, total - sCount - aCount)} max={total} tone="b" />
                </div>
                {stats.map((s) => <PoolPanel key={s.poolType} stats={s} pityCap={poolPityCap[s.poolType] ?? game.pityCap} />)}
                <div className="panel wide s-hit-panel">
                  <div className="panel-head"><h3>{game.sUnit}出货记录</h3><span>共 {sHitList.length} 次</span></div>
                  <div className="s-hit-chart">
                    {sHitList.length ? sHitList.map((hit, i) => (
                      <div className="s-hit-item" key={`${hit.name}-${i}`}>
                        <b>{hit.pity}</b>
                        <div className="s-hit-bar-wrap"><div className="s-hit-bar" style={{ height: `${Math.max(8, (hit.pity / maxPity) * 100)}%` }} /></div>
                        <span className="s-hit-name">{hit.name}</span>
                        <small>{hit.poolName}</small>
                      </div>
                    )) : <div className="empty">暂无{game.sUnit}出货记录</div>}
                  </div>
                </div>
              </section>
            )}

            {activeTab !== 'overview' && activeTab !== 'records' && activeTab !== 'settings' && (() => {
              const cs = stats.find((s) => s.poolType === activeTab);
              if (!cs) return null;
              return (
                <section className="dashboard-grid pool-view">
                  <PoolPanel stats={cs} pityCap={poolPityCap[cs.poolType] ?? game.pityCap} />
                  <div className="panel wide">
                    <div className="panel-head"><h3>{game.sUnit}出货间隔</h3><span>按时间顺序</span></div>
                    <div className="interval-chart">
                      {cs.sIntervals.length ? cs.sIntervals.map((item, i) => (
                        <div key={`${item}-${i}`} className="interval-pill" style={{ height: `${Math.max(16, (item / (poolPityCap[cs.poolType] ?? game.pityCap)) * 100)}%` }}><b>{item}</b></div>
                      )) : <div className="empty">暂无记录</div>}
                    </div>
                  </div>
                </section>
              );
            })()}

            <section className="records-panel">
              <div className="panel-head"><h3>抽卡明细</h3><input placeholder="搜索" value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>时间</th><th>名称</th><th>稀有度</th><th>类型</th><th>卡池</th><th>UID</th></tr></thead>
                  <tbody>
                    {visibleRecords.slice(0, 500).map((r) => (
                      <tr key={recordKey(r)} className={`rank-${r.rankType.toLowerCase()}`}>
                        <td>{r.time}</td><td>{r.name}</td><td>{r.rankType}</td><td>{r.itemType}</td><td>{r.poolName}</td><td>{r.uid}</td>
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

              <h3>明日方舟</h3>
              <p>明日方舟不支持在线获取，请通过第三方工具（如披萨小助手、ArkRecord 等）导出 JSON 文件后，使用「导入」功能导入。</p>

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
