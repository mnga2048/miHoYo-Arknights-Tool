import type { PoolType, RankType } from './types.js';

export interface GachaTypeDef {
  value: string;
  name: string;
  poolType: PoolType;
}

export interface GameConfig {
  id: string;
  name: string;
  brand: string;
  logPaths: string[];
  logKeyword: string;
  apiCn: string;
  apiOs: string;
  bizKey: string;
  regionCn: string;
  gachaTypes: GachaTypeDef[];
  rankMap: Record<string, RankType>;
  pityCap: number;
  dataFileName: string;
  isMiHoYo: boolean;
  pullUnit: string;
  sUnit: string;
}

const home = process.env.HOME || process.env.USERPROFILE || '';
const localLow = process.platform === 'win32'
  ? `${home}\\AppData\\LocalLow`
  : `${home}/Library/Application Support`;

export const GAMES: GameConfig[] = [
  {
    id: 'zzz',
    name: '绝区零',
    brand: 'ZZZ',
    logPaths: [
      `${localLow}\\miHoYo\\绝区零\\Player.log`,
      `${localLow}\\miHoYo\\Zenless Zone Zero\\Player.log`,
      `${localLow}\\Cognosphere\\绝区零\\Player.log`,
      `${localLow}\\Cognosphere\\Zenless Zone Zero\\Player.log`,
      `${localLow}\\miHoYo\\绝区零\\output_log.txt`,
      `${localLow}\\miHoYo\\Zenless Zone Zero\\output_log.txt`
    ],
    logKeyword: 'gacha',
    apiCn: 'https://public-operation-common.mihoyo.com/common/gacha_record/api/getGachaLog',
    apiOs: 'https://public-operation-nap-sg.hoyoverse.com/common/gacha_record/api/getGachaLog',
    bizKey: 'nap_cn',
    regionCn: 'prod_gf_cn',
    gachaTypes: [
      { value: '1001', name: '常驻频段', poolType: 'standard' },
      { value: '2002', name: '独家频段', poolType: 'exclusive' },
      { value: '3002', name: '音擎频段', poolType: 'w-engine' },
      { value: '5001', name: '邦布频段', poolType: 'bangboo' }
    ],
    rankMap: { '4': 'S', '3': 'A', '2': 'B', '1': 'B' },
    pityCap: 90,
    dataFileName: 'zzz-gacha-records.json',
    isMiHoYo: true,
    pullUnit: '抽',
    sUnit: 'S 级'
  },
  {
    id: 'genshin',
    name: '原神',
    brand: 'GI',
    logPaths: [
      `${localLow}\\miHoYo\\原神\\output_log.txt`,
      `${localLow}\\miHoYo\\Genshin Impact\\output_log.txt`,
      `${localLow}\\Cognosphere\\Genshin Impact\\output_log.txt`,
      `${localLow}\\miHoYo\\原神\\Player.log`,
      `${localLow}\\miHoYo\\Genshin Impact\\Player.log`,
      `${localLow}\\Cognosphere\\Genshin Impact\\Player.log`
    ],
    logKeyword: 'gacha',
    apiCn: 'https://public-operation-hk4e.mihoyo.com/gacha_info/api/getGachaLog',
    apiOs: 'https://sg-public-data-api.hoyolab.com/event/gacha_info/api/getGachaLog',
    bizKey: 'hk4e_cn',
    regionCn: 'cn_gf01',
    gachaTypes: [
      { value: '100', name: '新手祈愿', poolType: 'novice' },
      { value: '200', name: '常驻祈愿', poolType: 'standard' },
      { value: '301', name: '限定角色祈愿', poolType: 'exclusive' },
      { value: '302', name: '限定武器祈愿', poolType: 'weapon' },
      { value: '400', name: '集录祈愿', poolType: 'chronicled' }
    ],
    rankMap: { '5': 'S', '4': 'A', '3': 'B' },
    pityCap: 90,
    dataFileName: 'genshin-gacha-records.json',
    isMiHoYo: true,
    pullUnit: '抽',
    sUnit: '5 星'
  },
  {
    id: 'starrail',
    name: '崩坏：星穹铁道',
    brand: 'HSR',
    logPaths: [
      `${localLow}\\miHoYo\\崩坏：星穹铁道\\Player.log`,
      `${localLow}\\miHoYo\\Honkai Star Rail\\Player.log`,
      `${localLow}\\Cognosphere\\Honkai Star Rail\\Player.log`,
      `${localLow}\\miHoYo\\崩坏：星穹铁道\\output_log.txt`,
      `${localLow}\\miHoYo\\Honkai Star Rail\\output_log.txt`
    ],
    logKeyword: 'gacha',
    apiCn: 'https://public-operation-hkrpg.mihoyo.com/common/hkrpg_gacha_record/api/getGachaLog',
    apiOs: 'https://sg-public-api.hoyolab.com/event/luna/rpc/get_gacha_log',
    bizKey: 'hkrpg_cn',
    regionCn: 'prod_gf_cn',
    gachaTypes: [
      { value: '1', name: '常驻跃迁', poolType: 'standard' },
      { value: '2', name: '常驻光锥', poolType: 'standard-weapon' },
      { value: '11', name: '限定角色跃迁', poolType: 'exclusive' },
      { value: '12', name: '限定光锥跃迁', poolType: 'weapon' }
    ],
    rankMap: { '5': 'S', '4': 'A', '3': 'B' },
    pityCap: 90,
    dataFileName: 'starrail-gacha-records.json',
    isMiHoYo: true,
    pullUnit: '抽',
    sUnit: '5 星'
  },
  {
    id: 'arknights',
    name: '明日方舟',
    brand: 'AK',
    logPaths: [],
    logKeyword: '',
    apiCn: '',
    apiOs: '',
    bizKey: '',
    regionCn: '',
    gachaTypes: [
      { value: 'normal', name: '标准寻访', poolType: 'standard' },
      { value: 'spring_fest', name: '春节限定寻访', poolType: 'exclusive' },
      { value: 'anniver_fest', name: '庆典限定寻访', poolType: 'exclusive' },
      { value: 'joint', name: '联合寻访', poolType: 'exclusive' },
      { value: 'festival', name: '限定寻访', poolType: 'exclusive' }
    ],
    rankMap: { '5': 'S', '4': 'A', '3': 'B', '2': 'B' },
    pityCap: 99,
    dataFileName: 'arknights-gacha-records.json',
    isMiHoYo: false,
    pullUnit: '抽',
    sUnit: '6 星'
  }
];

export function getGameConfig(id: string): GameConfig {
  return GAMES.find((g) => g.id === id) ?? GAMES[0];
}
