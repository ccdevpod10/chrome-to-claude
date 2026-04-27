const PROVIDERS = ["claude-cli", "anthropic", "openai", "openrouter"];
const ACTIONS = ["Improve", "Audit", "Fix bugs", "Explain"];
const PROVIDER_LABELS = {
  "claude-cli": "Claude CLI",
  anthropic: "Anthropic",
  openai: "OpenAI",
  openrouter: "OpenRouter",
};

const statusEl = document.getElementById("status");

// ── Provider card selection ───────────────────────────────────────────────

let activeProvider = "claude-cli";

function setActiveCard(provider) {
  activeProvider = provider;
  document.querySelectorAll(".provider-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.provider === provider);
  });
  PROVIDERS.forEach((p) => {
    document.getElementById("cfg-" + p).classList.toggle("hidden", p !== provider);
  });
}

document.querySelectorAll(".provider-card").forEach((card) => {
  card.addEventListener("click", () => setActiveCard(card.dataset.provider));
});

// ── Build per-action selects ──────────────────────────────────────────────

ACTIONS.forEach((action) => {
  const sel = document.getElementById("ap-" + action);
  if (!sel) return;
  const defaultOpt = document.createElement("option");
  defaultOpt.value = "";
  defaultOpt.textContent = "Use active provider";
  sel.appendChild(defaultOpt);
  PROVIDERS.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = PROVIDER_LABELS[p];
    sel.appendChild(opt);
  });
});

// ── Load saved settings ───────────────────────────────────────────────────

chrome.storage.local.get(
  ["activeProvider", "providers", "actionProviders", "bridgePort"],
  ({ activeProvider: ap = "claude-cli", providers = {}, actionProviders = {}, bridgePort }) => {
    setActiveCard(ap);

    if (bridgePort) document.getElementById("bridgePort").value = bridgePort;

    const cli = providers["claude-cli"] || {};
    const ant = providers["anthropic"] || {};
    const oai = providers["openai"] || {};
    const ort = providers["openrouter"] || {};

    if (cli.model) document.getElementById("cli-model").value = cli.model;
    if (ant.apiKey) document.getElementById("anthropic-key").value = ant.apiKey;
    if (ant.model) document.getElementById("anthropic-model").value = ant.model;
    if (oai.apiKey) document.getElementById("openai-key").value = oai.apiKey;
    if (oai.model) document.getElementById("openai-model").value = oai.model;
    if (ort.apiKey) document.getElementById("openrouter-key").value = ort.apiKey;
    if (ort.model) document.getElementById("openrouter-model").value = ort.model;

    ACTIONS.forEach((action) => {
      const sel = document.getElementById("ap-" + action);
      if (sel && actionProviders[action]) sel.value = actionProviders[action];
    });
  }
);

// ── Save ──────────────────────────────────────────────────────────────────

document.getElementById("save").addEventListener("click", async () => {
  const port = parseInt(document.getElementById("bridgePort").value, 10) || 8765;

  const providers = {
    "claude-cli": { model: document.getElementById("cli-model").value.trim() },
    anthropic: {
      apiKey: document.getElementById("anthropic-key").value.trim(),
      model: document.getElementById("anthropic-model").value.trim(),
    },
    openai: {
      apiKey: document.getElementById("openai-key").value.trim(),
      model: document.getElementById("openai-model").value.trim(),
    },
    openrouter: {
      apiKey: document.getElementById("openrouter-key").value.trim(),
      model: document.getElementById("openrouter-model").value.trim(),
    },
  };

  const actionProviders = {};
  ACTIONS.forEach((action) => {
    const sel = document.getElementById("ap-" + action);
    if (sel?.value) actionProviders[action] = sel.value;
  });

  await chrome.storage.local.set({
    activeProvider,
    providers,
    actionProviders,
    bridgePort: port,
    model: providers["claude-cli"].model || null,
  });

  statusEl.className = "";
  statusEl.textContent = "Saved.";
  setTimeout(() => { statusEl.textContent = ""; }, 2000);
});

// ── Clear history ─────────────────────────────────────────────────────────

document.getElementById("clear-history").addEventListener("click", async () => {
  await chrome.storage.session.set({ history: [] });
  statusEl.className = "";
  statusEl.textContent = "Conversation history cleared.";
  setTimeout(() => { statusEl.textContent = ""; }, 2000);
});
