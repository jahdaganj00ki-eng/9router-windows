const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  shell,
  session,
} = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

app.on("second-instance", () => {
  showMainWindow();
});

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const APP_PATH = app.getAppPath();
const RESOURCES_PATH = !isDev ? process.resourcesPath : APP_PATH;
const NEXT_SERVER_PATH = path.join(RESOURCES_PATH, "app");

let mainWindow = null;
let tray = null;
let nextServer = null;
let serverPort = 20128;
let isServerStopped = false;

function buildReadinessUrl() {
  return `http://127.0.0.1:${serverPort}/api/health`;
}

function waitForServer(timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tryConnect = () => {
      const req = http.get(buildReadinessUrl(), (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (json && json.ok === true) {
              resolve();
              return;
            }
          } catch {
            // ignore parse errors, treat as not ready
          }
          scheduleNext();
        });
      });

      req.on("error", scheduleNext);
      req.setTimeout(2000, () => {
        req.destroy();
        scheduleNext();
      });

      function scheduleNext() {
        if (Date.now() >= deadline) {
          reject(new Error("Server did not become ready in time"));
          return;
        }
        setTimeout(tryConnect, 500);
      }
    };

    tryConnect();
  });
}

function resolveServerEntry() {
  const candidates = [
    path.join(NEXT_SERVER_PATH, "custom-server.js"),
    path.join(NEXT_SERVER_PATH, "server.js"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return path.join(NEXT_SERVER_PATH, "custom-server.js");
}

function spawnServer() {
  if (nextServer) {
    return;
  }

  const entry = resolveServerEntry();
  const nodeExecPath = process.execPath;

  nextServer = spawn(nodeExecPath, [entry], {
    cwd: NEXT_SERVER_PATH,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(serverPort),
      HOSTNAME: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  nextServer.stdout.on("data", (data) => {
    process.stdout.write(`[9Router] ${data}`);
  });

  nextServer.stderr.on("data", (data) => {
    process.stderr.write(`[9Router] ${data}`);
  });

  nextServer.on("error", (err) => {
    console.error("[9Router] server spawn error:", err);
    nextServer = null;
  });

  nextServer.on("exit", (code, signal) => {
    console.log(`[9Router] server exited code=${code} signal=${signal}`);
    nextServer = null;
  });
}

function stopServer() {
  if (!nextServer) {
    return Promise.resolve();
  }

  const server = nextServer;
  nextServer = null;

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };

    server.once("exit", finish);

    try {
      server.kill("SIGTERM");
    } catch {}

    setTimeout(() => {
      try {
        if (!server.killed) {
          server.kill("SIGKILL");
        }
      } catch {}
      finish();
    }, 800);
  });
}

function showMainWindow() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "9Router",
    icon: fs.existsSync(path.join(RESOURCES_PATH, "assets", "icon.png"))
      ? path.join(RESOURCES_PATH, "assets", "icon.png")
      : path.join(RESOURCES_PATH, "assets", "icon.ico"),
    webPreferences: {
      preload: path.join(APP_PATH, "preload.js"),
      contextIsolation: true,
      sandbox: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("close", (event) => {
    if (!isServerStopped && mainWindow) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray() {
  if (tray) {
    return;
  }

  const iconPath = path.join(RESOURCES_PATH, "assets", "icon.ico");
  tray = new Tray(iconPath);
  tray.setToolTip("9Router");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "9Router (Port 20128)",
      enabled: false,
    },
    {
      label: "Open Dashboard",
      click: () => {
        const url = `http://localhost:${serverPort}/dashboard`;
        shell.openExternal(url);
      },
    },
    {
      label: "Quit",
      click: async () => {
        await stopServer();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    showMainWindow();
  });
}

async function bootstrap() {
  createTray();
  spawnServer();

  try {
    await waitForServer();
  } catch (err) {
    console.error("[9Router] failed to start server:", err);
  }

  showMainWindow();
}

app.whenReady().then(bootstrap);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async () => {
  isServerStopped = true;
  await stopServer();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    showMainWindow();
  }
});
