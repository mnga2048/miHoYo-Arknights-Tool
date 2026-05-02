import { ipcRenderer } from 'electron';

const originalFetch = window.fetch;
window.fetch = async function (...args: Parameters<typeof fetch>) {
  const response = await originalFetch.apply(this, args);
  const input = args[0];
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : '';
  if (url.includes('ak.hypergryph.com/user/api/inquiry/gacha/history')) {
    const clone = response.clone();
    try {
      const data = await clone.json();
      ipcRenderer.send('arknights:gachaData', url, data);
    } catch { /* ignore non-JSON */ }
  }
  return response;
};

const origXhrOpen = XMLHttpRequest.prototype.open;
const origXhrSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.open = function (method: string, url: string, ...rest: any[]) {
  (this as any)._url = url;
  return origXhrOpen.apply(this, [method, url, ...rest] as any);
};
XMLHttpRequest.prototype.send = function (body?: any) {
  this.addEventListener('load', function () {
    const url = (this as any)._url;
    if (url && url.includes('ak.hypergryph.com/user/api/inquiry/gacha/history')) {
      try {
        const data = JSON.parse(this.responseText);
        ipcRenderer.send('arknights:gachaData', url, data);
      } catch { /* ignore */ }
    }
  });
  return origXhrSend.call(this, body);
};
