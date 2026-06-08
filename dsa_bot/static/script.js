/**
 * AlgoMentor — DSA Chatbot · Frontend Script
 * ===========================================
 *
 * WHAT THIS FILE DOES:
 *   1.  Stores the conversation history (so Claude remembers context)
 *   2.  Sends messages to the Python Flask server at POST /chat
 *   3.  Renders Claude's Markdown replies as styled HTML
 *   4.  Handles UI: typing dots, auto-resize textarea, Enter to send
 *
 * FLOW:
 *   User types → sendMessage() →
 *     addMessage(user) →
 *     showTyping() →
 *     fetch('/chat', { messages: history }) →
 *     hideTyping() →
 *     addMessage(bot) →
 *     push reply to history
 */

"use strict";

// ══════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════

/**
 * conversationHistory keeps ALL messages so far.
 * We send the full array to the server every time,
 * which lets Claude remember the whole conversation.
 *
 * Shape: [{ role: "user"|"assistant", content: "..." }, ...]
 */
let conversationHistory = [];

/** Prevents sending another message while waiting for a reply */
let isLoading = false;


// ══════════════════════════════════════════════════════
//  MARKDOWN → HTML RENDERER
//  Converts Claude's markdown text into styled HTML
// ══════════════════════════════════════════════════════

/**
 * Escape < > & in code so they display correctly
 */
function escHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * renderMarkdown(text)
 * Converts a subset of Markdown → HTML
 * Handles: code blocks, inline code, headers, bold, italic,
 *          bullets, numbered lists, horizontal rules, line breaks
 */
function renderMarkdown(text) {
  // 1. Fenced code blocks  ```python\n...\n```
  text = text.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) => {
    return `<pre><code>${escHtml(code.trim())}</code></pre>`;
  });

  // 2. Inline code  `variable`
  text = text.replace(/`([^`\n]+)`/g, "<code>$1</code>");

  // 3. ### Heading
  text = text.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
  text = text.replace(/^##\s+(.+)$/gm,  "<h3>$1</h3>");
  text = text.replace(/^#\s+(.+)$/gm,   "<h3>$1</h3>");

  // 4. **bold**
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // 5. *italic* (used for accent colour in our CSS)
  text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // 6. Horizontal rule  ---
  text = text.replace(/^---+$/gm, "<hr/>");

  // 7. Bullet list items  - item  or  • item
  text = text.replace(/^[-•]\s+(.+)$/gm, "<li>$1</li>");
  // Wrap consecutive <li> runs in <ul>
  text = text.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");

  // 8. Numbered list  1. item
  text = text.replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>");

  // 9. Double blank lines → paragraph break
  text = text.replace(/\n\n/g, "<br/><br/>");

  // 10. Single newline → <br>
  text = text.replace(/\n/g, "<br/>");

  return text;
}


// ══════════════════════════════════════════════════════
//  UI HELPERS
// ══════════════════════════════════════════════════════

/**
 * addMessage(role, content, isError?)
 * Creates and appends a message bubble to the chat.
 *
 * role    – "user" | "bot"
 * content – raw text (user) or markdown text (bot)
 * isError – adds red tint to bot bubble
 */
function addMessage(role, content, isError = false) {
  // Hide welcome screen on first real message
  const welcome = document.getElementById("welcome");
  if (welcome) welcome.style.display = "none";

  const feed = document.getElementById("messages");

  // Row wrapper
  const row = document.createElement("div");
  row.className = `msg-row ${role === "user" ? "user" : ""}`;

  // Avatar
  const av = document.createElement("div");
  av.className = `av ${role === "user" ? "usr" : "bot"}`;
  av.textContent = role === "user" ? "YOU" : "🧠";

  // Bubble
  const bubble = document.createElement("div");
  bubble.className = [
    "bubble",
    role === "user" ? "usr" : "bot",
    isError ? "err" : "",
  ].join(" ").trim();

  if (role === "user") {
    // User text: plain (no HTML injection risk)
    bubble.textContent = content;
  } else {
    // Bot text: render markdown
    bubble.innerHTML = renderMarkdown(content);
  }

  row.appendChild(av);
  row.appendChild(bubble);
  feed.appendChild(row);

  // Scroll to bottom
  feed.scrollTop = feed.scrollHeight;
}

/**
 * showTyping()
 * Adds the animated three-dot typing indicator.
 */
function showTyping() {
  const feed = document.getElementById("messages");

  const row = document.createElement("div");
  row.className = "msg-row";
  row.id = "typing-row";

  const av = document.createElement("div");
  av.className = "av bot";
  av.textContent = "🧠";

  const dots = document.createElement("div");
  dots.className = "typing";
  dots.innerHTML = `
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  `;

  row.appendChild(av);
  row.appendChild(dots);
  feed.appendChild(row);
  feed.scrollTop = feed.scrollHeight;
}

/** hideTyping() — removes the typing indicator */
function hideTyping() {
  document.getElementById("typing-row")?.remove();
}


// ══════════════════════════════════════════════════════
//  CORE: SEND MESSAGE
// ══════════════════════════════════════════════════════

/**
 * sendMessage(overrideText?)
 *
 * If overrideText is provided (sidebar/starter clicks), use that.
 * Otherwise read the textarea.
 *
 * Steps:
 *  1. Get & validate the text
 *  2. Show user bubble
 *  3. Push to history
 *  4. Show typing dots
 *  5. POST to /chat with full history
 *  6. Hide dots, show bot reply
 *  7. Push reply to history
 */
async function sendMessage(overrideText) {
  if (isLoading) return;

  const input   = document.getElementById("user-input");
  const sendBtn = document.getElementById("send-btn");
  const text    = (overrideText ?? input.value).trim();

  if (!text) return;

  // Clear textarea
  if (!overrideText) {
    input.value = "";
    input.style.height = "auto";
  }

  // Show user bubble
  addMessage("user", text);

  // Save to history before sending
  conversationHistory.push({ role: "user", content: text });

  // Lock UI
  isLoading = true;
  sendBtn.disabled = true;
  showTyping();

  try {
    // ── POST to Python backend ──────────────────────────
    const res = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: conversationHistory }),
    });

    const data = await res.json();
    hideTyping();

    if (!res.ok) {
      // Server returned an error object
      addMessage("bot", `**Error:** ${data.error || `Server error (${res.status})`}`, true);
      conversationHistory.pop(); // remove last user msg from history
      return;
    }

    const reply = data.reply;
    addMessage("bot", reply);
    conversationHistory.push({ role: "assistant", content: reply });

  } catch (err) {
    // Network error — server probably isn't running
    hideTyping();
    addMessage(
      "bot",
      "**Connection Error:** Cannot reach the server.\n\n" +
      "Make sure your Python server is running:\n" +
      "`python app.py`\n\n" +
      "Then refresh this page.",
      true
    );
    conversationHistory.pop();

  } finally {
    isLoading = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

/**
 * quickAsk(topic)
 * Called by sidebar buttons and starter cards.
 * Passes the topic string directly to sendMessage.
 */
function quickAsk(topic) {
  sendMessage(topic);
}


// ══════════════════════════════════════════════════════
//  TEXTAREA: AUTO-RESIZE + KEYBOARD SHORTCUT
// ══════════════════════════════════════════════════════

const textarea = document.getElementById("user-input");

// Grow the textarea as the user types
textarea.addEventListener("input", () => {
  textarea.style.height = "auto";
  textarea.style.height = Math.min(textarea.scrollHeight, 150) + "px";
});

// Enter → send   |   Shift+Enter → new line
textarea.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Focus on load
textarea.focus();
