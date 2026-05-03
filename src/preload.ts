import { contextBridge, ipcRenderer } from 'electron';
import type { GachaRecord, StoredData } from './shared/types.js';

contextBridge.exposeInMainWorld('zzzApi', {
  loadData: (gameId: string): Promise<StoredData> => ipcRenderer.invoke('data:load', gameId),
  saveData: (gameId: string, records: GachaRecord[]): Promise<StoredData> => ipcRenderer.invoke('data:save', gameId, records),
  chooseImport: (): Promise<{ fileName: string; extension: string; content: string } | null> =>
    ipcRenderer.invoke('data:chooseImport'),
  exportData: (gameId: string, records: GachaRecord[]): Promise<boolean> => ipcRenderer.invoke('data:export', gameId, records),
  getAuthkeyUrl: (gameId: string): Promise<string | null> => ipcRenderer.invoke('data:getAuthkeyUrl', gameId),
  fetchRemoteRecords: (gameId: string, url: string): Promise<GachaRecord[]> => ipcRenderer.invoke('data:fetchRemoteRecords', gameId, url),
  onFetchProgress: (callback: (msg: string) => void) => {
    ipcRenderer.on('fetch:progress', (_event, msg) => callback(msg));
  },
  showInput: (message: string, defaultVal: string): Promise<string | null> =>
    ipcRenderer.invoke('data:showInput', message, defaultVal),
  fetchArknightsRecords: (): Promise<GachaRecord[] | null> => ipcRenderer.invoke('data:fetchArknightsRecords'),
  closeArknightsWebView: (): Promise<void> => ipcRenderer.invoke('data:closeArknightsWebView'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url)
});
