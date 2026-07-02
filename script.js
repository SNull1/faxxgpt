// ============================================================
// FAXX GPT — client-side console
// Calls the Anthropic API directly from the browser using a
// user-supplied key (bring-your-own-key pattern). See README
// for why this is necessary on a static GitHub Pages host.
// ============================================================

const DEFAULT_SYSTEM_PROMPT =
  "You are FAXX GPT, a sharp, concise assistant with a techy, slightly " +
  "irreverent personality. The person you're talking to is into game " +
  "development, modding (Garry's Mod, Roblox), and scripting. Keep answers " +
  "direct and practical, use code blocks for code, and don't pad responses " +
  "with fluff.";

const STORAGE_KEYS = {
  apiKey: "faxxgpt_api_key",
  systemPrompt: "faxxgpt_system_prompt",
  sessions: "faxxgpt_sessions",
  activeSession: "faxxgpt_active_session",
};

let state = {
  sessions: [],
  activeSessionId: null,
  sending: false,
};

// ---------------- boot sequence ----------------
function runBootSequence() {
  const bootScreen = document.getElementById("boot-screen");
  const bootText = document.getElementById("boot-text");
  const lines = [
    "FAXX_GPT SYSTEM // build console",
    "initializing session state.......[ OK ]",
    "loading rarity-tier renderer.....[ OK ]",
    "checking stored credentials......[ OK ]",
    "",
    "welcome back, faxx.",
  ];
  let i = 0;

  function typeLine() {
    if (i >= lines.length) {
      setTimeout(() => {
        bootScreen.classList.add("fade-out");
        setTimeout(() => {
          bootScreen.hidden = true;
          document.getElementById("app").hidden = false;
        }, 500);
      }, 350);
      return;
    }
    const line = lines[i];
    let charIndex = 0;
    bootText.textContent += (i > 0 ? "\n" : "");
    const interval = setInterval(() => {
      bootText.textContent += line[charIndex] || "";
      charIndex++;
      if (charIndex >= line.length) {
        clearInterval(interval);
        i++;
        setTimeout(typeLine, 90);
      }
    }, 14);
  }
  typeLine();
}

// ---------------- persistence ----------------
function loadState() {
  const rawSessions = localStorage.getItem(STORAGE_KEYS.sessions);
  state.sessions = rawSessions ? JSON.parse(rawSessions) : [];
  state.activeSessionId = localStorage.getItem(STORAGE_KEYS.activeSession) || null;

  if (state.sessions.length === 0) {
    createSession();
  } else if (!state.sessions.find((s) => s.id === state.activeSessionId)) {
    state.activeSessionId = state.sessions[0].id;
  }
}

function persistSessions() {
  localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(state.sessions));
  localStorage.setItem(STORAGE_KEYS.activeSession, state.activeSessionId);
}

function getApiKey() {
  return localStorage.getItem(STORAGE_KEYS.apiKey) || "";
}
function getSystemPrompt() {
  return localStorage.getItem(STORAGE_KEYS.systemPrompt) || DEFAULT_SYSTEM_PROMPT;
}

// ---------------- session management ----------------
function createSession() {
  const session = {
    id: "s_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: "untitled_session",
    messages: [],
  };
  state.sessions.unshift(session);
  state.activeSessionId = session.id;
  persistSessions();
  return session;
}

function getActiveSession() {
  return state.sessions.find((s) => s.id === state.activeSessionId);
}

function switchSession(id) {
  state.activeSessionId = id;
  persistSessions();
  renderSessionList();
  renderMessages();
}

// ---------------- rendering ----------------
function renderSessionList() {
  const list = document.getElementById("sessionList");
  list.innerHTML = "";
  state.sessions.forEach((s) => {
    const el = document.createElement("div");
    el.className = "session-item" + (s.id === state.activeSessionId ? " active" : "");
    el.textContent = s.title;
    el.tabIndex = 0;
    el.addEventListener("click", () => switchSession(s.id));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") switchSession(s.id);
    });
    list.appendChild(el);
  });
  const activeSession = getActiveSession();
  document.getElementById("chatTitle").textContent = activeSession ? activeSession.title : "untitled_session";
}

function renderMessages(justAddedAssistant) {
  const container = document.getElementById("messages");
  const session = getActiveSession();
  container.innerHTML = "";

  if (!session || session.messages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `
      <div class="empty-glyph">FX</div>
      <p class="empty-title">FAXX GPT is idle</p>
      <p class="empty-sub">Drop a message below to unlock a reply.</p>
    `;
    container.appendChild(empty);
    return;
  }

  session.messages.forEach((m, idx) => {
    const bubble = document.createElement("div");
    const isLastAssistant = justAddedAssistant && idx === session.messages.length - 1 && m.role === "assistant";
    bubble.className = "msg " + m.role + (isLastAssistant ? " unlocking" : "");
    const tag = m.role === "user" ? "you" : m.role === "assistant" ? "faxx_gpt" : "system";
    bubble.innerHTML = `<span class="msg-tag">${tag}</span><div class="msg-body"></div>`;
    bubble.querySelector(".msg-body").textContent = m.content;
    container.appendChild(bubble);
  });

  container.scrollTop = container.scrollHeight;
}

function setTyping(on) {
  document.getElementById("typingRow").hidden = !on;
  if (on) {
    document.getElementById("messages").scrollTop = document.getElementById("messages").scrollHeight;
  }
}

// ---------------- API call ----------------
async function callFaxxGPT(messages) {
  const apiKey = getApiKey();
  if (!apiKey) {
    openSettingsModal();
    throw new Error("No API key set. Add one in Settings first.");
  }

  const model = document.getElementById("modelSelect").value;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 1024,
      system: getSystemPrompt(),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const errJson = await response.json();
      detail = errJson?.error?.message || "";
    } catch (_) {}
    throw new Error(`API error (${response.status}). ${detail}`);
  }

  const data = await response.json();
  const textBlock = (data.content || []).find((b) => b.type === "text");
  return textBlock ? textBlock.text : "(no text content returned)";
}

// ---------------- sending flow ----------------
async function handleSend(text) {
  const session = getActiveSession();
  if (!session || state.sending) return;

  session.messages.push({ role: "user", content: text });
  if (session.title === "untitled_session") {
    session.title = text.slice(0, 28) + (text.length > 28 ? "…" : "");
  }
  persistSessions();
  renderSessionList();
  renderMessages();

  state.sending = true;
  document.getElementById("sendBtn").disabled = true;
  setTyping(true);

  try {
    const reply = await callFaxxGPT(session.messages);
    session.messages.push({ role: "assistant", content: reply });
    persistSessions();
    renderMessages(true);
  } catch (err) {
    session.messages.push({ role: "error", content: err.message || "Something went wrong." });
    persistSessions();
    renderMessages();
  } finally {
    state.sending = false;
    document.getElementById("sendBtn").disabled = false;
    setTyping(false);
  }
}

// ---------------- settings modal ----------------
function openSettingsModal() {
  document.getElementById("apiKeyInput").value = getApiKey();
  document.getElementById("systemPromptInput").value = getSystemPrompt();
  document.getElementById("modalOverlay").hidden = false;
  document.getElementById("apiKeyInput").focus();
}
function closeSettingsModal() {
  document.getElementById("modalOverlay").hidden = true;
}
function saveSettings() {
  const key = document.getElementById("apiKeyInput").value.trim();
  const prompt = document.getElementById("systemPromptInput").value.trim();
  if (key) localStorage.setItem(STORAGE_KEYS.apiKey, key);
  localStorage.setItem(STORAGE_KEYS.systemPrompt, prompt || DEFAULT_SYSTEM_PROMPT);
  closeSettingsModal();
}

// ---------------- textarea autosize ----------------
function autosize(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 160) + "px";
}

// ---------------- init ----------------
function init() {
  loadState();
  renderSessionList();
  renderMessages();

  document.getElementById("newChatBtn").addEventListener("click", () => {
    createSession();
    renderSessionList();
    renderMessages();
  });

  const form = document.getElementById("composerForm");
  const input = document.getElementById("composerInput");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    autosize(input);
    handleSend(text);
  });

  input.addEventListener("input", () => autosize(input));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  document.getElementById("settingsBtn").addEventListener("click", openSettingsModal);
  document.getElementById("modalClose").addEventListener("click", closeSettingsModal);
  document.getElementById("modalSave").addEventListener("click", saveSettings);
  document.getElementById("modalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "modalOverlay") closeSettingsModal();
  });

  if (!getApiKey()) {
    setTimeout(openSettingsModal, 900);
  }
}

runBootSequence();
init();
