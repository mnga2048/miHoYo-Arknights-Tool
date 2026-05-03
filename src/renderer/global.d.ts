import type { GachaRecord, StoredData } from '../shared/types';

declare global {
  interface Window {
    zzzApi?: {
      loadData: (gameId: string) => Promise<StoredData>;
      saveData: (gameId: string, records: GachaRecord[]) => Promise<StoredData>;
      chooseImport: () => Promise<{ fileName: string; extension: string; content: string } | null>;
      exportData: (gameId: string, records: GachaRecord[]) => Promise<boolean>;
      getAuthkeyUrl: (gameId: string) => Promise<string | null>;
      fetchRemoteRecords: (gameId: string, url: string) => Promise<GachaRecord[]>;
      onFetchProgress: (callback: (msg: string) => void) => void;
      showInput: (message: string, defaultVal: string) => Promise<string | null>;
      fetchArknightsRecords: () => Promise<GachaRecord[] | null>;
      closeArknightsWebView: () => Promise<void>;
      openExternal: (url: string) => Promise<void>;
    };
  }
}

export {};
