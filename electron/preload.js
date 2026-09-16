const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  onPortChange: (callback) => ipcRenderer.on("port-change", (_event, port) => callback(port)),
  onServerStatus: (callback) => ipcRenderer.on("server-status", (_event, status) => callback(status)),
});
