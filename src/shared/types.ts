import type { GameConfig, GachaTypeDef } from './games.js';

export type RankType = 'S' | 'A' | 'B';

export type PoolType = 'exclusive' | 'w-engine' | 'bangboo' | 'standard' | 'other' | 'weapon' | 'novice' | 'chronicled';

export interface GachaRecord {
  id: string;
  uid: string;
  time: string;
  name: string;
  rankType: RankType;
  itemType: string;
  poolType: PoolType;
  poolName: string;
}

export interface StoredData {
  records: GachaRecord[];
  updatedAt: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  total: number;
}

export const POOL_LABELS: Record<PoolType, string> = {
  exclusive: '独家频段',
  'w-engine': '音擎频段',
  bangboo: '邦布频段',
  standard: '常驻频段',
  other: '其他频段',
  weapon: '武器池',
  novice: '新手池',
  chronicled: '集录池'
};

export type { GameConfig, GachaTypeDef };
