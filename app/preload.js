// Ponte entre o site e o app: avisa que está no app, liga o som de um programa só
// e informa à bandeja se você está ao vivo.
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
});
