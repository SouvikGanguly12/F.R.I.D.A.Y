const loginView = document.querySelector("#login-view");
const chatView = document.querySelector("#chat-view");
const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");
const logoutButton = document.querySelector("#logout");
const input = document.querySelector("#message-input");
const sendButton = document.querySelector("#send");
const talkButton = document.querySelector("#talk");
const talkLabel = document.querySelector("#talk-label");
const speechLanguage = document.querySelector("#speech-language");
const speechVoice = document.querySelector("#speech-voice");
const handsFreeButton = document.querySelector("#hands-free");
const stopSpeakingButton = document.querySelector("#stop-speaking");
const statusText = document.querySelector("#status");
const messageList = document.querySelector("#messages");
const websiteShortcuts = document.querySelector("#website-shortcuts");
const notionState = document.querySelector("#notion-state");
const calendarState = document.querySelector("#calendar-state");
const noteButton = document.querySelector("#create-note");
const eventsButton = document.querySelector("#view-events");
const eventButton = document.querySelector("#create-event");
const weatherButton = document.querySelector("#weather-button");
const timeButton = document.querySelector("#time-button");
const localTimeDisplay = document.querySelector("#local-time");
const memoryState = document.querySelector("#memory-state");
const viewMemoriesButton = document.querySelector("#view-memories");
const clearMemoriesButton = document.querySelector("#clear-memories");
const actionDialog = document.querySelector("#action-dialog");
const actionForm = document.querySelector("#action-form");
const dialogTitle = document.querySelector("#dialog-title");
const dialogFields = document.querySelector("#dialog-fields");
const dialogError = document.querySelector("#dialog-error");

const history = [];
let recognition = null;
let listening = false;
let handsFree = false;
let busy = false;
let wakeLock = null;
let recognitionRestartTimer = null;
let pendingAction = null;
const MEMORY_STORAGE_KEY = "friday_explicit_memories_v1";

const websites = [
  { label: "Google", icon: "G", url: "https://www.google.com/" },
  { label: "YouTube", icon: "▶", url: "https://www.youtube.com/" },
  { label: "Gmail", icon: "M", url: "https://mail.google.com/" },
  { label: "Calendar", icon: "▦", url: "https://calendar.google.com/" },
  { label: "Notion", icon: "N", url: "https://www.notion.so/" },
  { label: "Wikipedia", icon: "W", url: "https://www.wikipedia.org/" },
  { label: "GitHub", icon: "⌘", url: "https://github.com/" },
  { label: "Maps", icon: "◇", url: "https://maps.google.com/" },
  { label: "Instagram", icon: "◎", url: "https://www.instagram.com/" },
  { label: "Facebook", icon: "f", url: "https://www.facebook.com/" },
  { label: "LinkedIn", icon: "in", url: "https://www.linkedin.com/" },
  { label: "ChatGPT", icon: "✦", url: "https://chatgpt.com/" },
  { label: "Spotify", icon: "♫", url: "https://open.spotify.com/" },
  { label: "Netflix", icon: "N", url: "https://www.netflix.com/" },
];

function renderWebsiteShortcuts() {
  for (const site of websites) {
    const link = document.createElement("a");
    link.className = "shortcut";
    link.href = site.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.innerHTML = `<span class="shortcut-icon" aria-hidden="true">${site.icon}</span><span>${site.label}</span>`;
    websiteShortcuts.append(link);
  }
}

function setAuthenticated(authenticated) {
  loginView.classList.toggle("hidden", authenticated);
  chatView.classList.toggle("hidden", !authenticated);
  logoutButton.classList.toggle("hidden", !authenticated);
  if (authenticated) refreshIntegrationStatus();
}

function setStatus(message) {
  statusText.textContent = message;
}

function appendMessage(role, content) {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${role}`;
  bubble.textContent = content;
  messageList.append(bubble);
  messageList.scrollTop = messageList.scrollHeight;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Something went wrong.");
  return body;
}

async function postIntegration(payload) {
  return requestJson("/api/integrations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function checkSession() {
  try {
    const session = await requestJson("/api/session", { method: "GET" });
    setAuthenticated(session.authenticated);
  } catch {
    setAuthenticated(false);
    loginError.textContent = "Could not connect to FRIDAY. Check the deployment and try again.";
  }
}

async function refreshIntegrationStatus() {
  try {
    const status = await requestJson("/api/integrations", { method: "GET" });
    notionState.textContent = status.notion ? "Configured" : "Needs Vercel setup";
    calendarState.textContent = status.calendar ? "Configured" : "Needs Vercel setup";
    notionState.classList.toggle("connected", status.notion);
    calendarState.classList.toggle("connected", status.calendar);
  } catch (error) {
    setStatus(error.message);
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";
  const button = loginForm.querySelector("button");
  button.disabled = true;
  button.textContent = "Signing in…";
  try {
    await requestJson("/api/session", {
      method: "POST",
      body: JSON.stringify({ password: new FormData(loginForm).get("password") }),
    });
    loginForm.reset();
    setAuthenticated(true);
    input.focus();
  } catch (error) {
    loginError.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Sign in";
  }
});

logoutButton.addEventListener("click", async () => {
  speechSynthesis.cancel();
  setHandsFree(false);
  if (recognition && listening) recognition.stop();
  await requestJson("/api/session", { method: "DELETE" }).catch(() => {});
  history.length = 0;
  messageList.replaceChildren();
  setAuthenticated(false);
});

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.08;
  utterance.lang = speechVoice.value === "auto"
    ? (/[\u0900-\u097f]/.test(text) ? "hi-IN" : "en-IN")
    : speechVoice.value;
  const voices = speechSynthesis.getVoices();
  const language = utterance.lang.slice(0, 2).toLowerCase();
  const preferred = voices.find((voice) => voice.lang.toLowerCase() === utterance.lang.toLowerCase())
    || voices.find((voice) => voice.lang.toLowerCase().startsWith(`${language}-`));
  if (preferred) {
    utterance.voice = preferred;
    utterance.lang = preferred.lang;
  }
  utterance.onend = scheduleRecognitionRestart;
  speechSynthesis.speak(utterance);
}

async function sendMessage(rawText) {
  const text = rawText.trim();
  if (!text || busy) return;
  if (handleWebsiteCommand(text)) return;
  const timeCommand = text.replace(/[.!?]+$/, "").replace(/\s+/g, " ");
  if (/^(?:what(?:'s| is) the time|what time is it|tell me the time|current time|time now|time)$/i.test(timeCommand)) {
    appendMessage("user", text);
    const reply = `The current time is ${formatLocalTime()}.`;
    appendMessage("assistant", reply);
    speak(reply);
    return;
  }
  if (/^(what do you remember|what have you remembered|show( me)?( my)? memories|list( my)? memories)$/i.test(text)) {
    appendMessage("user", text);
    showMemories();
    return;
  }
  if (/^(forget everything|forget all( my)? memories|clear( all)?( my)? memories)$/i.test(text)) {
    appendMessage("user", text);
    confirmClearMemories();
    return;
  }
  const rememberMatch = text.match(/^(?:remember that|remember|save to memory)\s*[:,]?\s*(.+)$/i);
  if (rememberMatch) {
    appendMessage("user", text);
    confirmRemember(rememberMatch[1]);
    return;
  }
  if (/\b(weather|temperature|forecast|how hot|how cold)\b/i.test(text)) {
    appendMessage("user", text);
    const cityMatch = text.match(/\b(?:in|for|at)\s+([a-z][a-z\s-]{1,60})/i);
    const city = cityMatch
      ? cityMatch[1].split(/\b(?:today|tomorrow|now|currently|right now)\b/i)[0].trim()
      : "";
    openWeatherDialog(city);
    return;
  }
  if (/^(take a note|create a note|save a note)\b/i.test(text)) {
    const noteText = text.replace(/^(take a note|create a note|save a note)\b[:,\s]*/i, "");
    appendMessage("user", text);
    openNoteDialog(noteText);
    return;
  }
  if (/^(add|create|schedule)\s+(a\s+)?(calendar\s+)?event\b/i.test(text)) {
    appendMessage("user", text);
    openEventDialog();
    return;
  }
  if (/^(show(?: me)?|check|what('?s| is) on|read)\s+(my\s+)?(google\s+)?calendar\b/i.test(text)) {
    appendMessage("user", text);
    await loadCalendarEvents();
    return;
  }
  busy = true;
  sendButton.disabled = true;
  appendMessage("user", text);
  history.push({ role: "user", content: text });
  input.value = "";
  input.style.height = "auto";
  setStatus("FRIDAY is thinking…");

  try {
    const result = await requestJson("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        messages: history.slice(-12),
        memories: getMemories().map((memory) => memory.text),
      }),
    });
    appendMessage("assistant", result.answer);
    history.push({ role: "assistant", content: result.answer });
    if (history.length > 12) history.splice(0, history.length - 12);
    setStatus("Ready");
    speak(result.answer);
  } catch (error) {
    history.pop();
    setStatus(error.message);
  } finally {
    busy = false;
    sendButton.disabled = false;
    scheduleRecognitionRestart();
  }
}

function getMemories() {
  try {
    const stored = JSON.parse(localStorage.getItem(MEMORY_STORAGE_KEY) || "[]");
    if (!Array.isArray(stored)) return [];
    return stored.filter(
      (memory) =>
        memory &&
        typeof memory.id === "string" &&
        typeof memory.text === "string" &&
        memory.text.length <= 500,
    ).slice(0, 30);
  } catch {
    setStatus("Could not read local memories; browser storage may be disabled.");
    return [];
  }
}

function saveMemories(memories) {
  if (memories.length > 30) {
    setStatus("FRIDAY can keep up to 30 memories. Remove one before adding another.");
    return false;
  }
  try {
    localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(memories));
    memoryState.textContent = `${memories.length} saved on this browser`;
    return true;
  } catch {
    setStatus("Could not save memory. Check browser storage settings.");
    return false;
  }
}

function confirmRemember(text) {
  const memory = text.trim();
  if (!memory || memory.length > 500) {
    setStatus("A memory must be between 1 and 500 characters.");
    return;
  }
  showActionDialog("Remember this for future chats?", [
    ["Memory", "memory", "textarea", memory, true, "Only save information you are comfortable storing on this device."],
  ], async (values) => {
    const memories = getMemories();
    memories.push({ id: crypto.randomUUID(), text: values.get("memory").trim() });
    if (!saveMemories(memories)) throw new Error("Could not save this memory.");
    appendMessage("assistant", "I’ll remember that on this browser. You can ask “what do you remember?” or clear your memories anytime.");
    speak("I’ll remember that on this browser.");
  });
}

function showMemories() {
  const memories = getMemories();
  if (!memories.length) {
    appendMessage("assistant", "I don’t have any saved memories on this browser yet.");
    speak("I don't have any saved memories on this browser yet.");
    return;
  }
  appendMessage("assistant", `Here’s what I remember:\n${memories.map((memory, index) => `${index + 1}. ${memory.text}`).join("\n")}`);
}

function confirmClearMemories() {
  if (!getMemories().length) {
    setStatus("There are no saved memories to clear.");
    return;
  }
  showActionDialog("Clear all saved memories?", [
    ["Type CLEAR to confirm", "confirmation", "text", "", true, "This only clears memories on this browser."],
  ], async (values) => {
    if (values.get("confirmation").trim() !== "CLEAR") {
      throw new Error("Type CLEAR exactly to delete saved memories.");
    }
    if (!saveMemories([])) throw new Error("Could not clear memories.");
    appendMessage("assistant", "All memories saved on this browser have been deleted.");
    speak("All saved memories have been deleted.");
  });
}

function openWeatherDialog(prefill = "") {
  showActionDialog("Check current weather", [
    ["City", "city", "text", prefill, true, "Enter a city, for example Kolkata"],
  ], async (values) => {
    const result = await requestJson("/api/weather", {
      method: "POST",
      body: JSON.stringify({ city: values.get("city").trim() }),
    });
    const report = `Current weather in ${result.location}: ${result.condition}, ${result.temperature}${result.unit}, feels like ${result.feelsLike}${result.unit}. Humidity ${result.humidity}%, wind ${result.windSpeed} km/h.`;
    appendMessage("assistant", report);
    const attribution = document.createElement("a");
    attribution.className = "event-item";
    attribution.href = "https://open-meteo.com/";
    attribution.target = "_blank";
    attribution.rel = "noopener noreferrer";
    attribution.textContent = "Weather data: Open-Meteo";
    messageList.append(attribution);
    speak(report);
    setStatus(`Weather from ${result.source}; observed ${result.observedAt}.`);
  });
}

function formatLocalTime() {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date());
}

function updateLocalTime() {
  localTimeDisplay.textContent = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
}

function handleWebsiteCommand(text) {
  const match = text.match(/^open\s+(.+?)[.!?]*$/i);
  if (!match) return false;
  const requested = match[1]
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^my\s+/, "")
    .replace(/\s+(website|site)$/, "");
  const aliases = {
    "google search": "google",
    "google maps": "maps",
    "youtube music": "youtube",
  };
  const label = aliases[requested] || requested;
  const site = websites.find((entry) => entry.label.toLowerCase() === label);
  if (!site) {
    setStatus(`I can open: ${websites.map((entry) => entry.label).join(", ")}.`);
    return true;
  }
  speak(`Opening ${site.label}.`);
  const opened = window.open(site.url, "_blank", "noopener,noreferrer");
  if (!opened) {
    const link = document.createElement("a");
    link.className = "event-item";
    link.href = site.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `Tap to open ${site.label}`;
    messageList.append(link);
  }
  appendMessage("assistant", `Opening ${site.label}.`);
  setStatus(`Opening ${site.label}`);
  return true;
}

function setHandsFree(enabled) {
  handsFree = enabled;
  handsFreeButton.setAttribute("aria-pressed", String(enabled));
  handsFreeButton.textContent = enabled ? "Hands-free: on" : "Hands-free: off";
  handsFreeButton.classList.toggle("hands-free-active", enabled);
  if (!enabled) {
    clearTimeout(recognitionRestartTimer);
    if (recognition && listening) recognition.stop();
    if (wakeLock) {
      wakeLock.release().catch(() => {});
      wakeLock = null;
    }
    return;
  }
  if (!recognition) {
    setHandsFree(false);
    setStatus("Hands-free listening is not supported in this browser.");
    return;
  }
  requestScreenWakeLock();
  startRecognition();
}

function requestScreenWakeLock() {
  if (!handsFree || !("wakeLock" in navigator) || document.visibilityState !== "visible") return;
  navigator.wakeLock.request("screen")
    .then((lock) => {
      wakeLock = lock;
      lock.addEventListener("release", () => {
        if (wakeLock === lock) wakeLock = null;
      });
    })
    .catch(() => setStatus("Keep the app open and screen awake for hands-free listening."));
}

function startRecognition() {
  if (!recognition || !handsFree || document.visibilityState !== "visible" ||
      busy || speechSynthesis.speaking || actionDialog.open) return;
  try {
    recognition.lang = speechLanguage.value;
    recognition.start();
  } catch {
    scheduleRecognitionRestart();
  }
}

function scheduleRecognitionRestart() {
  clearTimeout(recognitionRestartTimer);
  if (!handsFree) return;
  recognitionRestartTimer = setTimeout(startRecognition, 500);
}

function makeField(label, name, type, value = "", required = true, placeholder = "") {
  const wrapper = document.createElement("div");
  const fieldLabel = document.createElement("label");
  fieldLabel.htmlFor = `field-${name}`;
  fieldLabel.textContent = label;
  const field = document.createElement(type === "textarea" ? "textarea" : "input");
  field.id = `field-${name}`;
  field.name = name;
  if (type !== "textarea") field.type = type;
  field.value = value;
  field.required = required;
  field.placeholder = placeholder;
  wrapper.append(fieldLabel, field);
  dialogFields.append(wrapper);
  return field;
}

function showActionDialog(title, fields, action) {
  dialogTitle.textContent = title;
  dialogFields.replaceChildren();
  dialogError.textContent = "";
  pendingAction = action;
  for (const field of fields) {
    makeField(...field);
  }
  actionDialog.showModal();
  dialogFields.querySelector("input, textarea")?.focus();
}

function openNoteDialog(prefill = "") {
  if (notionState.textContent !== "Configured") {
    setStatus("Set NOTION_API_KEY and NOTION_PARENT_PAGE_ID in Vercel to connect Notion.");
    return;
  }
  let content = prefill;
  let title = "Quick note";
  if (content) {
    const firstLine = content.split(/\r?\n/, 1)[0].trim();
    if (firstLine.length <= 80 && content.includes("\n")) {
      title = firstLine.replace(/^title:\s*/i, "");
      content = content.slice(content.indexOf("\n") + 1).trim();
    }
  }
  showActionDialog("Save a Notion note?", [
    ["Note title", "title", "text", title, true, "What should this note be called?"],
    ["Note", "content", "textarea", content, true, "Write or dictate the note…"],
  ], async (values) => {
    const result = await postIntegration({
      service: "notion",
      title: values.get("title"),
      content: values.get("content"),
    });
    setStatus("Note saved to Notion.");
    speak("Your note is saved in Notion.");
    if (result.note.url) window.open(result.note.url, "_blank", "noopener,noreferrer");
  });
  if (prefill) {
    dialogFields.querySelector("textarea")?.focus();
  }
}

function openEventDialog() {
  if (calendarState.textContent !== "Configured") {
    setStatus("Set Google Calendar credentials in Vercel to connect your calendar.");
    return;
  }
  const start = new Date(Date.now() + 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const toLocalInput = (date) => {
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 16);
  };
  showActionDialog("Create a calendar event?", [
    ["Event title", "summary", "text", "", true, "What is the event?"],
    ["Starts", "start", "datetime-local", toLocalInput(start), true, ""],
    ["Ends", "end", "datetime-local", toLocalInput(end), true, ""],
    ["Details (optional)", "description", "textarea", "", false, "Add details…"],
  ], async (values) => {
    const result = await postIntegration({
      service: "calendar",
      action: "create",
      summary: values.get("summary"),
      start: new Date(values.get("start")).toISOString(),
      end: new Date(values.get("end")).toISOString(),
      description: values.get("description"),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    });
    setStatus(`Created calendar event: ${result.event.summary}`);
    speak(`Created calendar event: ${result.event.summary}.`);
  });
}

async function loadCalendarEvents() {
  try {
    const result = await postIntegration({ service: "calendar", action: "list" });
    messageList.replaceChildren();
    if (!result.events.length) {
      appendMessage("assistant", "You have no upcoming events in the next 7 days.");
      speak("You have no upcoming events in the next seven days.");
    }
    const spokenEvents = [];
    for (const event of result.events) {
      const link = document.createElement("a");
      link.className = "event-item";
      if (event.htmlLink) {
        link.href = event.htmlLink;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
      link.textContent = event.summary;
      const date = document.createElement("small");
      date.textContent = event.start ? new Date(event.start).toLocaleString() : "All day";
      link.append(date);
      messageList.append(link);
      spokenEvents.push(
        event.start
          ? `${event.summary}, ${new Date(event.start).toLocaleString()}`
          : `${event.summary}, all day`,
      );
    }
    setStatus(`Showing ${result.events.length} upcoming events.`);
    if (spokenEvents.length) {
      speak(`Your upcoming events are: ${spokenEvents.join(". ")}.`);
    }
  } catch (error) {
    setStatus(error.message);
  }
}

actionForm.addEventListener("submit", async (event) => {
  if (event.submitter && event.submitter.value === "cancel") {
    pendingAction = null;
    return;
  }
  event.preventDefault();
  if (!pendingAction || !actionForm.reportValidity()) return;
  const action = pendingAction;
  const values = new FormData(actionForm);
  pendingAction = null;
  const confirmButton = document.querySelector("#dialog-confirm");
  confirmButton.disabled = true;
  dialogError.textContent = "";
  setStatus("Saving…");
  try {
    await action(values);
    actionDialog.close();
  } catch (error) {
    pendingAction = action;
    dialogError.textContent = error.message;
    setStatus("Could not save.");
  } finally {
    confirmButton.disabled = false;
  }
});

noteButton.addEventListener("click", () => openNoteDialog());
eventButton.addEventListener("click", openEventDialog);
eventsButton.addEventListener("click", loadCalendarEvents);
weatherButton.addEventListener("click", () => openWeatherDialog());
handsFreeButton.addEventListener("click", () => setHandsFree(!handsFree));
viewMemoriesButton.addEventListener("click", showMemories);
clearMemoriesButton.addEventListener("click", confirmClearMemories);
timeButton.addEventListener("click", () => sendMessage("What time is it?"));

sendButton.addEventListener("click", () => sendMessage(input.value));
input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
});
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage(input.value);
  }
});
stopSpeakingButton.addEventListener("click", () => speechSynthesis.cancel());

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = speechLanguage.value;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => {
    listening = true;
    talkButton.classList.add("listening");
    talkLabel.textContent = "Listening… tap to stop";
    setStatus("Listening. Speak now.");
  };
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    setStatus(`Heard: ${transcript}`);
    sendMessage(transcript);
  };
  recognition.onerror = (event) => {
    const message = event.error === "not-allowed"
      ? "Allow microphone access in your browser settings."
      : `Voice input failed (${event.error}). You can type instead.`;
    setStatus(message);
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      setHandsFree(false);
    }
  };
  recognition.onend = () => {
    listening = false;
    talkButton.classList.remove("listening");
    talkLabel.textContent = "Tap to talk";
    scheduleRecognitionRestart();
  };
  speechLanguage.addEventListener("change", () => {
    recognition.lang = speechLanguage.value;
  });
}

talkButton.addEventListener("click", () => {
  if (!recognition) {
    setStatus("Voice input is not supported by this browser. You can type instead.");
    return;
  }
  if (handsFree) {
    setHandsFree(false);
    return;
  }
  speechSynthesis.cancel();
  try {
    recognition.lang = speechLanguage.value;
    recognition.start();
  } catch {
    setStatus("Voice input is already starting. Try again in a moment.");
  }
});

actionDialog.addEventListener("close", scheduleRecognitionRestart);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    requestScreenWakeLock();
    scheduleRecognitionRestart();
  }
  else if (handsFree && recognition && listening) recognition.stop();
});

renderWebsiteShortcuts();
updateLocalTime();
setInterval(updateLocalTime, 15000);
checkSession();
