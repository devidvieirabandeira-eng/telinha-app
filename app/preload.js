// Ponte entre o site e o app: avisa que está no app, liga o som de um programa só,
// informa à bandeja se você está ao vivo e mostra atualizações e novidades.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("telinhaDesktop", {
  platform: process.platform,
  setLive: (live) => ipcRenderer.send("app:live", !!live),
  startAppAudio: () => ipcRenderer.invoke("app-audio:start"),
  stopAppAudio: () => ipcRenderer.send("app-audio:stop"),
  onAppAudio: (callback) => {
    ipcRenderer.removeAllListeners("app-audio:data");
    ipcRenderer.on("app-audio:data", (_event, chunk) => callback(chunk));
  },
  onAppAudioEnd: (callback) => {
    ipcRenderer.removeAllListeners("app-audio:end");
    ipcRenderer.on("app-audio:end", () => callback());
  },
  // { version, ready: versão baixada ou null, whatsNew: [{ version, notes }] }
  getUpdate: () => ipcRenderer.invoke("update:state"),
  onUpdateReady: (callback) => {
    ipcRenderer.removeAllListeners("update:ready");
    ipcRenderer.on("update:ready", (_event, version) => callback(String(version)));
  },
  installUpdate: () => ipcRenderer.send("update:install"),
  seenWhatsNew: () => ipcRenderer.send("update:seen"),
});
