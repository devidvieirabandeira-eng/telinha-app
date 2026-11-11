// Telinha para Windows. A janela abre o próprio site: o que muda no site muda aqui.
// O app só acrescenta o que o navegador não faz: escolher a janela do jogo, levar
// só o som dele, ficar na bandeja enquanto você joga e se atualizar sozinho.

const { app, BrowserWindow, Menu, Tray, desktopCapturer, ipcMain, nativeImage, session, shell } = require("electron");
const { execFile, spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const CHANGELOG = require("./changelog");

const SITE = new URL(process.env.TELINHA_URL || "https://telinha.devid-vieirabandeira.workers.dev");
const ALLOWED_PERMISSIONS = new Set(["media", "display-capture", "fullscreen", "clipboard-sanitized-write", "clipboard-read"]);
const ICON = path.join(__dirname, "build", "icon.png");

// Captura do som de um programa só (WASAPI process loopback, Windows 10 2004+), feita
// pelos executáveis do pacote application-loopback. Formato fixo: PCM 16 bits estéreo.
const LOOPBACK_DIR = process.env.TELINHA_LOOPBACK_DIR || (app.isPackaged
  ? path.join(process.resourcesPath, "loopback")
  : path.join(__dirname, "node_modules", "application-loopback", "bin", "win32-x64"));
const APP_AUDIO_FORMAT = { sampleRate: 44100, channels: 2 };
const BYTES_PER_FRAME = 4;

// Vídeo e som tocam sem precisar clicar antes (como no site, mas sem o bloqueio do navegador).
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
// Tela inteira pela Desktop Duplication em vez da Windows Graphics Capture: sem a borda
// amarela que o Windows 10 desenha em volta, e leve para jogos em tela cheia.
// (Janelas continuam na Graphics Capture: o método antigo deixa muitos jogos pretos.)
app.commandLine.appendSwitch("disable-features", "WebRtcAllowWgcScreenCapturer");

// Perfil separado (testes rodando com o app instalado aberto).
if (process.env.TELINHA_USER_DATA) app.setPath("userData", process.env.TELINHA_USER_DATA);

let mainWindow = null;
let tray = null;
let quitting = false;
let trayHintShown = false;
let live = false;
let picker = null; // { window, finish, pids: Map<id da fonte, pid> }
let pendingAudio = { mode: "none" }; // escolha de som da última vez que o seletor abriu
let capture = null; // { proc, wc }
let updateReady = null; // versão nova já baixada, esperando para instalar
let whatsNew = []; // [{ version, notes }]: novidades a mostrar depois de atualizar

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", showWindow);

function isSite(url) {
  try {
    return new URL(url).origin === SITE.origin;
  } catch {
    return false;
  }
}

function openExternal(url) {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
}

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: "Telinha",
    backgroundColor: "#07080d",
    autoHideMenuBar: true,
    icon: ICON,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // Escondido (bandeja ou atrás do jogo), o site para de desenhar e de rodar timers à toa.
      // A transmissão segue: WebRTC e áudio rodam em threads próprias.
      backgroundThrottling: true,
    },
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());

  // O X manda para a bandeja; sair de vez é pelo menu do ícone.
  mainWindow.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    mainWindow.hide();
    if (!trayHintShown) {
      trayHintShown = true;
      tray?.displayBalloon({
        iconType: "info",
        title: live ? "Transmissão continua" : "O Telinha continua aberto",
        content: "Para fechar de vez: botão direito no ícone > Sair.",
      });
    }
  });

  const wc = mainWindow.webContents;
  // Só navega dentro do Telinha; qualquer outro link abre no navegador.
  wc.on("will-navigate", (event, url) => {
    if (isSite(url)) return;
    event.preventDefault();
    openExternal(url);
  });
  wc.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });
  wc.on("did-start-navigation", (details) => {
    if (details.isMainFrame && !details.isSameDocument) stopCapture();
  });
  wc.on("render-process-gone", stopCapture);
  wc.on("did-fail-load", (_event, code, _description, _url, isMainFrame) => {
    // -3 = navegação cancelada (normal); o resto é falta de internet ou site fora do ar.
    if (isMainFrame && code !== -3) mainWindow.loadFile(path.join(__dirname, "offline.html"), { query: { site: SITE.href } });
  });

  mainWindow.loadURL(SITE.href);
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 32, height: 32 }));
  tray.setToolTip("Telinha");
  tray.on("click", showWindow);
  tray.on("balloon-click", showWindow);
  updateTrayMenu();
}

function updateTrayMenu() {
  tray?.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Abrir o Telinha", click: showWindow },
      ...(updateReady ? [{ label: `Reiniciar e atualizar para a ${updateReady}`, click: installUpdate }] : []),
      { type: "separator" },
      {
        // Com atualização baixada, sair já instala (a próxima abertura vem na versão nova).
        label: updateReady ? "Sair (e atualizar)" : "Sair",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
}

ipcMain.on("app:live", (event, value) => {
  if (!isSite(event.senderFrame?.url)) return;
  live = !!value;
  tray?.setToolTip(live ? "Telinha · você está ao vivo" : "Telinha");
});

function setupSession() {
  const ses = session.defaultSession;

  ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
    callback(isSite(details.requestingUrl) && ALLOWED_PERMISSIONS.has(permission));
  });
  ses.setPermissionCheckHandler((_wc, permission, origin) => isSite(origin) && ALLOWED_PERMISSIONS.has(permission));

  // "Compartilhar tela" do site: abre o nosso seletor em vez do do navegador.
  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    pendingAudio = { mode: "none" };
    if (!isSite(request.securityOrigin)) return callback({});
    try {
      const choice = await pickSource();
      if (!choice) return callback({});
      const sources = await desktopCapturer.getSources({ types: ["screen", "window"] });
      const source = sources.find((s) => s.id === choice.id);
      if (!source) return callback({});
      if (choice.audio === "system" && request.audioRequested) {
        // "loopback" = tudo que sai nas caixas de som do Windows.
        pendingAudio = { mode: "system" };
        return callback({ video: source, audio: "loopback" });
      }
      // "Só o som deste app": o vídeo vai sem áudio e o site pede o som do programa à parte.
      if (choice.audio === "app" && choice.pid) pendingAudio = { mode: "app", pid: choice.pid };
      callback({ video: source });
    } catch (err) {
      console.error("Falha ao escolher a tela:", err);
      callback({});
    }
  });
}

// ---------------------------------------------------------------- som de um programa só

ipcMain.handle("app-audio:start", (event) => {
  if (!isSite(event.senderFrame?.url)) return { mode: "none" };
  const choice = pendingAudio;
  pendingAudio = { mode: "none" };
  if (choice.mode !== "app") return { mode: choice.mode };
  startCapture(choice.pid, event.sender);
  return { mode: "app", ...APP_AUDIO_FORMAT };
});

ipcMain.on("app-audio:stop", (event) => {
  if (capture?.wc === event.sender) stopCapture();
});

function startCapture(pid, wc) {
  stopCapture();
  const proc = spawn(path.join(LOOPBACK_DIR, "ApplicationLoopback.exe"), [String(pid)], {
    cwd: LOOPBACK_DIR,
    windowsHide: true,
    stdio: ["ignore", "pipe", "ignore"],
  });
  capture = { proc, wc };
  let rest = Buffer.alloc(0);
  proc.stdout.on("data", (chunk) => {
    // Só manda quadros inteiros (4 bytes: 2 canais x 16 bits); o resto espera o próximo pedaço.
    const data = rest.length ? Buffer.concat([rest, chunk]) : chunk;
    const usable = data.length - (data.length % BYTES_PER_FRAME);
    rest = Buffer.from(data.subarray(usable));
    if (usable && !wc.isDestroyed()) wc.send("app-audio:data", new Uint8Array(data.subarray(0, usable)));
  });
  const ended = () => {
    if (capture?.proc !== proc) return;
    capture = null;
    if (!wc.isDestroyed()) wc.send("app-audio:end");
  };
  proc.on("exit", ended);
  proc.on("error", (err) => {
    console.error("Captura do som do programa falhou:", err.message);
    ended();
  });
}

function stopCapture() {
  const current = capture;
  capture = null;
  current?.proc.kill();
}

// Descobre o programa (PID) dono de cada janela, para capturar só o som dele.
function windowProcesses() {
  return new Promise((resolve) => {
    execFile(path.join(LOOPBACK_DIR, "ProcessList.exe"), { cwd: LOOPBACK_DIR, windowsHide: true, timeout: 4000 }, (err, stdout) => {
      if (err) return resolve([]);
      resolve(
        stdout
          .split(/\r?\n/)
          .map((line) => line.split(";"))
          .filter((parts) => parts.length >= 3 && /^\d+$/.test(parts[0]))
          .map(([pid, hwnd, ...title]) => ({ pid: Number(pid), hwnd: hwndValues(hwnd), title: title.join(";") })),
      );
    });
  });
}

// O HWND pode vir em decimal ou em hexadecimal; guarda as duas leituras para comparar.
function hwndValues(text) {
  const values = new Set();
  const t = text.trim().replace(/^0x/i, "");
  if (/^\d+$/.test(t)) values.add(BigInt(t));
  if (/^[0-9a-f]+$/i.test(t)) values.add(BigInt(`0x${t}`));
  return values;
}

// ---------------------------------------------------------------- seletor de tela

function pickSource() {
  if (picker) {
    picker.window.focus();
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const window = new BrowserWindow({
      parent: mainWindow,
      modal: true,
      width: 900,
      height: 680,
      resizable: false,
      minimizable: false,
      maximizable: false,
      show: false,
      title: "Escolha o que transmitir",
      backgroundColor: "#07080d",
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, "picker", "preload.js"),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    const finish = (value) => {
      if (!picker || picker.window !== window) return;
      picker = null;
      resolve(value);
      if (!window.isDestroyed()) window.close();
    };
    picker = { window, finish, pids: new Map() };
    window.on("closed", () => finish(null));
    window.once("ready-to-show", () => window.show());
    window.loadFile(path.join(__dirname, "picker", "picker.html"));
  });
}

const fromPicker = (event) => picker && event.sender === picker.window.webContents;

ipcMain.handle("picker:sources", async (event) => {
  if (!fromPicker(event)) return [];
  const [sources, processes] = await Promise.all([
    desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: { width: 400, height: 225 }, fetchWindowIcons: true }),
    process.platform === "win32" ? windowProcesses() : [],
  ]);
  const own = mainWindow?.getMediaSourceId();
  const list = sources
    .filter((s) => s.id !== own && s.name)
    .map((s) => {
      const kind = s.id.startsWith("screen:") ? "screen" : "window";
      let pid = null;
      if (kind === "window") {
        const hwnd = /^\d+$/.test(s.id.split(":")[1] ?? "") ? BigInt(s.id.split(":")[1]) : -1n;
        pid = (processes.find((p) => p.hwnd.has(hwnd)) ?? processes.find((p) => p.title === s.name))?.pid ?? null;
        if (pid === process.pid) return null;
      }
      return {
        id: s.id,
        name: s.name,
        kind,
        appAudio: !!pid,
        thumb: s.thumbnail.isEmpty() ? null : s.thumbnail.toDataURL(),
        icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
        pid,
      };
    })
    .filter(Boolean);
  // O PID fica guardado aqui; a página do seletor só recebe se dá ou não para pegar o som do app.
  picker.pids = new Map(list.filter((s) => s.pid).map((s) => [s.id, s.pid]));
  // Programas com janela aberta, um por PID: na aba Telas, de qual deles vem o som.
  const seen = new Set();
  const apps = list
    .filter((s) => s.pid && !seen.has(s.pid) && seen.add(s.pid))
    .map((s) => ({ id: s.id, name: s.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return { sources: list.map(({ pid, ...rest }) => rest), apps };
});

ipcMain.on("picker:choose", (event, choice) => {
  if (!fromPicker(event) || typeof choice?.id !== "string") return;
  const audio = ["app", "system", "none"].includes(choice.audio) ? choice.audio : "none";
  // O som pode vir de outra janela (tela inteira + som só do jogo); o PID sai da lista guardada.
  const audioFrom = typeof choice.audioFrom === "string" ? choice.audioFrom : choice.id;
  picker.finish({ id: choice.id, audio, pid: picker.pids.get(audioFrom) ?? null });
});

ipcMain.on("picker:cancel", (event) => {
  if (fromPicker(event)) picker.finish(null);
});

// ---------------------------------------------------------------- atualizações

// Procura versão nova no GitHub (repo público telinha-app) ao abrir e a cada 4 horas,
// baixa em segundo plano e avisa o site. Instala ao clicar em Atualizar ou ao sair.
const UPDATE_CHECK_MS = 4 * 60 * 60 * 1000;
const stateFile = () => path.join(app.getPath("userData"), "telinha-app.json");
let autoUpdater = null;

function readState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), "utf8"));
  } catch {
    return {};
  }
}

function saveVersion() {
  try {
    fs.writeFileSync(stateFile(), JSON.stringify({ ...readState(), version: app.getVersion() }));
  } catch (err) {
    console.warn("Não deu para salvar a versão:", err.message);
  }
}

const versionParts = (v) => String(v).split(".").map((n) => Number.parseInt(n, 10) || 0);
function compareVersions(a, b) {
  const [x, y] = [versionParts(a), versionParts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

// Abriu numa versão mais nova que a da última vez: separa o que mudou desde então.
function prepareWhatsNew() {
  const current = app.getVersion();
  // A 1.1.0 não guardava a versão: se já existe perfil de antes, veio dela.
  const previous = readState().version ?? (fs.existsSync(path.join(app.getPath("userData"), "Local Storage")) ? "1.1.0" : null);
  if (previous && compareVersions(previous, current) < 0) {
    whatsNew = Object.keys(CHANGELOG)
      .filter((v) => compareVersions(v, previous) > 0 && compareVersions(v, current) <= 0)
      .sort((a, b) => compareVersions(b, a))
      .map((version) => ({ version, notes: CHANGELOG[version] }));
  }
  // Sem novidades para mostrar, já marca como vista; com novidades, espera o site confirmar.
  if (!whatsNew.length) saveVersion();
}

function setUpdateReady(version) {
  updateReady = version;
  updateTrayMenu();
  if (mainWindow && !mainWindow.webContents.isDestroyed()) mainWindow.webContents.send("update:ready", version);
  if (!mainWindow?.isVisible()) {
    tray?.displayBalloon({
      iconType: "info",
      title: `Telinha ${version} pronto`,
      content: "Clique em Atualizar no app, ou saia pelo ícone da bandeja e abra de novo.",
    });
  }
}

function installUpdate() {
  if (!updateReady || !autoUpdater) return;
  quitting = true;
  stopCapture();
  // Silencioso e abre de novo sozinho quando terminar.
  autoUpdater.quitAndInstall(true, true);
}

function setupUpdates() {
  // Teste local: TELINHA_FAKE_UPDATE=1.2.1 finge uma versão nova já baixada.
  if (!app.isPackaged) {
    if (process.env.TELINHA_FAKE_UPDATE) setTimeout(() => setUpdateReady(process.env.TELINHA_FAKE_UPDATE), 4000);
    return;
  }
  ({ autoUpdater } = require("electron-updater"));
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-downloaded", (info) => setUpdateReady(info.version));
  autoUpdater.on("error", (err) => console.warn("Atualização falhou:", err?.message ?? err));
  // Não começa um download no meio de uma live; tenta de novo na próxima rodada.
  const check = () => {
    if (!live && !updateReady) autoUpdater.checkForUpdates().catch(() => {});
  };
  setTimeout(check, 15_000);
  setInterval(check, UPDATE_CHECK_MS);
}

ipcMain.handle("update:state", (event) => {
  if (!isSite(event.senderFrame?.url)) return null;
  return { version: app.getVersion(), ready: updateReady, whatsNew };
});

ipcMain.on("update:seen", (event) => {
  if (!isSite(event.senderFrame?.url) || !whatsNew.length) return;
  whatsNew = [];
  saveVersion();
});

ipcMain.on("update:install", (event) => {
  if (isSite(event.senderFrame?.url)) installUpdate();
});

// ---------------------------------------------------------------- ciclo de vida

app.whenReady().then(() => {
  prepareWhatsNew();
  setupSession();
  createTray();
  createWindow();
  setupUpdates();
});

app.on("before-quit", () => {
  quitting = true;
  stopCapture();
});
app.on("window-all-closed", () => app.quit());
