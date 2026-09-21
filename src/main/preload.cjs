const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('flypet', {
  bootstrap: () => ipcRenderer.invoke('bootstrap'),
  command: (action, value) => ipcRenderer.send('command', action, value),
  subscribe: handler => { ipcRenderer.on('view', (_event, view) => handler(view)); },
  activity: handler => { ipcRenderer.on('render-activity', (_event, active) => handler(active)); },
  sugar: handler => { ipcRenderer.on('sugar', (_event, value) => handler(value)); },
});
