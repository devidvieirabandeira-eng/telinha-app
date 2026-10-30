// Seletor de tela do app: lista telas e janelas com miniatura e devolve a escolha,
// junto com o que fazer com o som.
const $ = (sel) => document.querySelector(sel);

const HINTS = {
  app: "Só o som desse programa vai junto. O Discord e o resto do PC ficam de fora.",
  system: "Tudo que toca nas suas caixas de som vai junto, inclusive o Discord.",
  none: "A transmissão vai sem áudio.",
  screenApp: "A tela inteira vai sem a borda amarela, com o som só do programa escolhido.",
  noApp: "Não achei programas com janela aberta para pegar o som. Abra o jogo e clique em atualizar.",
};

let sources = [];
let apps = []; // programas com janela aberta (para o som na aba Telas)
let kind = "window";
let selected = null;
let audioTouched = false; // a pessoa mudou o som na mão: respeita a escolha

async function load() {
  $("#refresh").classList.add("spin");
  ({ sources, apps } = await window.picker.sources());
  const select = $("#audio-app");
  const previous = select.value;
  select.replaceChildren(...apps.map((a) => new Option(a.name, a.id)));
  if (apps.some((a) => a.id === previous)) select.value = previous;
  $("#refresh").classList.remove("spin");
  render();
}

const current = () => sources.find((s) => s.id === selected);

function render() {
  const list = sources.filter((s) => s.kind === kind);
  if (!list.some((s) => s.id === selected)) selected = list[0]?.id ?? null;
  const screens = sources.filter((x) => x.kind === "screen").length;
  $("#grid").replaceChildren(
    ...list.map((s) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "item";
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(s.id === selected));
      item.addEventListener("click", () => select(s.id));
      item.addEventListener("dblclick", () => share(s.id));

      const thumb = document.createElement("div");
      thumb.className = s.thumb ? "thumb" : "thumb none";
      if (s.thumb) thumb.style.backgroundImage = `url("${s.thumb}")`;
      else thumb.textContent = "Sem prévia";

      const label = document.createElement("div");
      label.className = "label";
      if (s.icon) {
        const icon = document.createElement("img");
        icon.src = s.icon;
        icon.alt = "";
        label.append(icon);
      }
      const name = document.createElement("span");
      name.textContent = s.kind === "screen" && screens === 1 ? "Tela inteira" : s.name;
      name.title = s.name;
      label.append(name);

      item.append(thumb, label);
      return item;
    }),
  );
  $("#empty").hidden = list.length > 0;
  $("#share").disabled = !selected;
  renderAudio();
}

function renderAudio() {
  const s = current();
  const screen = s?.kind === "screen";
  // Janela: o som vem dela mesma. Tela inteira: de um programa escolhido na lista.
  const appOk = screen ? apps.length > 0 : !!s?.appAudio;
  $('input[name="audio"][value="app"]').disabled = !appOk;
  $("#audio-app-label").textContent = screen ? "Só o som de um app" : "Só o som deste app";
  let mode = document.querySelector('input[name="audio"]:checked')?.value;
  if (!audioTouched || !mode || (mode === "app" && !appOk)) mode = !appOk || screen ? "system" : "app";
  $(`input[name="audio"][value="${mode}"]`).checked = true;
  $("#audio-app").hidden = !(screen && mode === "app");
  $("#audio-hint").textContent =
    screen && mode === "app" ? HINTS.screenApp : screen && !appOk && mode === "system" ? `${HINTS.system} ${HINTS.noApp}` : HINTS[mode];
}

function select(id) {
  selected = id;
  render();
}

function share(id = selected) {
  if (!id) return;
  const audio = document.querySelector('input[name="audio"]:checked')?.value ?? "none";
  const screen = sources.find((s) => s.id === id)?.kind === "screen";
  window.picker.choose(id, audio, screen && audio === "app" ? $("#audio-app").value : undefined);
}

for (const tab of document.querySelectorAll(".tab")) {
  tab.addEventListener("click", () => {
    kind = tab.dataset.kind;
    for (const t of document.querySelectorAll(".tab")) t.setAttribute("aria-selected", String(t === tab));
    selected = null;
    render();
  });
}

for (const radio of document.querySelectorAll('input[name="audio"]')) {
  radio.addEventListener("change", () => {
    audioTouched = true;
    renderAudio();
  });
}

$("#refresh").addEventListener("click", load);
$("#share").addEventListener("click", () => share());
$("#cancel").addEventListener("click", () => window.picker.cancel());
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") window.picker.cancel();
  if (e.key === "Enter" && selected) share();
});

load();
