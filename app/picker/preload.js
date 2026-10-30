const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("picker", {
  sources: () => ipcRenderer.invoke("picker:sources"),
  choose: (id, audio, audioFrom) => ipcRenderer.send("picker:choose", { id, audio, audioFrom }),
  cancel: () => ipcRenderer.send("picker:cancel"),
});
