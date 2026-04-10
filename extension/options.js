const bridgePortEl = document.getElementById("bridgePort");
const modelEl = document.getElementById("model");
const saveBtn = document.getElementById("save");
const clearHistoryBtn = document.getElementById("clear-history");
const statusEl = document.getElementById("status");

// Load saved settings on open
chrome.storage.local.get(["bridgePort", "model"], ({ bridgePort, model }) => {
  if (bridgePort) bridgePortEl.value = bridgePort;
  if (model) modelEl.value = model;
});

saveBtn.addEventListener("click", async () => {
  const port = parseInt(bridgePortEl.value, 10) || 8765;
  const model = modelEl.value.trim();

  await chrome.storage.local.set({ bridgePort: port, model: model || null });

  statusEl.textContent = "Saved.";
  setTimeout(() => { statusEl.textContent = ""; }, 2000);
});

clearHistoryBtn.addEventListener("click", async () => {
  await chrome.storage.session.set({ history: [] });
  statusEl.textContent = "Conversation history cleared.";
  setTimeout(() => { statusEl.textContent = ""; }, 2000);
});
