/**
 * LMS to LeetCode Matcher - Content Script
 * 1. Checks window.getSelection().toString() (cleanest input when user highlights question)
 * 2. Automatically detects LMS problem containers (Moodle, Canvas, Blackboard, custom portals)
 * 3. Injects floating pill on text selection & embeds rich match badge.
 */

// Known LMS selectors ordered by specificity
const LMS_CONTAINER_SELECTORS = [
  // Description tabs and panels (e.g. Vedam School of Tech, LeetCode-clones, custom SPA LMS)
  "[data-tab='description']",
  "[data-testid='description-panel']",
  "[class*='description']",
  "[class*='problem']",
  "[class*='question']",
  "[class*='statement']",
  // Moodle quiz / question containers
  ".que .formulation",
  ".que .content",
  ".que",
  // Canvas assignments & quizzes
  ".assignment-description",
  "#assignment_show .description",
  ".quiz-question .question_text",
  ".user_content",
  // Blackboard problem containers
  "#problem_body",
  ".problem-statement",
  ".vtbegenerated",
  "#contentBox",
  // Generic competitive programming / university portals
  ".problem-description",
  ".problem-statement-text",
  ".statement",
  "#problem-statement",
  ".task-description",
  "article.markdown-body",
  // Fallbacks
  "main",
  "[role='main']"
];

// Tags and classes to strip during DOM scraping
const NOISY_ELEMENTS = [
  "nav",
  "header",
  "footer",
  "script",
  "style",
  "svg",
  ".submit-button",
  ".btn",
  "button",
  ".grading-info",
  ".info",
  ".comment",
  ".nav-tabs",
  ".pagination"
];

let floatingPill = null;
let currentInjectedBadge = null;

/**
 * Clean and normalize problem text
 */
function cleanExtractedText(rawText) {
  if (!rawText) return "";
  return rawText
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

/**
 * Extract problem container DOM node if present
 */
function findProblemContainer() {
  for (const selector of LMS_CONTAINER_SELECTORS) {
    const els = document.querySelectorAll(selector);
    for (const el of els) {
      if (el && el.innerText && el.innerText.trim().length > 40) {
        return el;
      }
    }
  }

  // Heuristic scan: Find element with high density of problem-related terms (e.g. Vedam portal)
  const candidates = Array.from(document.querySelectorAll("div, section, article"));
  let bestEl = null;
  let maxScore = 0;

  for (const el of candidates) {
    // Avoid large ancestor wrappers like root or body
    if (el.children.length > 30) continue;
    const text = el.innerText || "";
    if (text.length < 50 || text.length > 5000) continue;

    let score = 0;
    if (/\b(example\s*\d*|examples)\b/i.test(text)) score += 2;
    if (/\b(constraints?)\b/i.test(text)) score += 2;
    if (/\b(input|output)\b/i.test(text)) score += 2;
    if (/\b(return|substring|array|indices|anagram|integer)\b/i.test(text)) score += 1;

    // Check class or id names
    const ident = `${el.className || ""} ${el.id || ""}`;
    if (/(description|problem|statement|task|question)/i.test(ident)) score += 3;

    if (score > maxScore) {
      maxScore = score;
      bestEl = el;
    }
  }

  return maxScore >= 4 ? bestEl : null;
}

/**
 * Extract clean problem text from the page according to priorities
 */
function extractProblemText() {
  // Priority 1: User selection
  const userSelection = window.getSelection() ? window.getSelection().toString().trim() : "";
  if (userSelection && userSelection.length > 20) {
    return {
      text: cleanExtractedText(userSelection),
      source: "selection",
      targetNode: null
    };
  }

  // Priority 2: Problem containers
  const container = findProblemContainer();
  if (container) {
    // Clone container to avoid modifying user DOM
    const clone = container.cloneNode(true);
    for (const noise of NOISY_ELEMENTS) {
      clone.querySelectorAll(noise).forEach((node) => node.remove());
    }
    const text = cleanExtractedText(clone.innerText);
    if (text.length > 30) {
      return {
        text,
        source: "container",
        targetNode: container
      };
    }
  }

  // Fallback: Body or Main content
  const main = document.querySelector("main") || document.body;
  if (main) {
    const clone = main.cloneNode(true);
    for (const noise of NOISY_ELEMENTS) {
      clone.querySelectorAll(noise).forEach((node) => node.remove());
    }
    return {
      text: cleanExtractedText(clone.innerText.slice(0, 4000)),
      source: "fallback",
      targetNode: main
    };
  }

  return { text: "", source: "none", targetNode: null };
}

/**
 * Render the Floating "Find LeetCode" Pill on selection
 */
function showSelectionPill(x, y, selectedText) {
  removeSelectionPill();

  const pill = document.createElement("div");
  pill.id = "lms-lc-selection-pill";
  pill.innerHTML = `
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
    </svg>
    <span>Find LeetCode Match</span>
  `;

  // Position pill right above or below the selection
  pill.style.left = `${Math.max(10, Math.min(window.innerWidth - 180, x))}px`;
  pill.style.top = `${Math.max(10, y - 36)}px`;

  pill.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    e.preventDefault();
  });

  pill.addEventListener("click", (e) => {
    e.stopPropagation();
    pill.innerHTML = `
      <div class="lms-lc-spinner"></div>
      <span>Matching...</span>
    `;

    chrome.runtime.sendMessage(
      {
        action: "ANALYZE_PROBLEM",
        problemText: selectedText
      },
      (response) => {
        removeSelectionPill();
        if (response && response.success) {
          const range = window.getSelection().rangeCount > 0 ? window.getSelection().getRangeAt(0) : null;
          injectBadge(response.data, range ? range.startContainer.parentElement : document.body);
        } else {
          alert(`LeetCode Matcher Error: ${response ? response.error : "Unknown error"}`);
        }
      }
    );
  });

  document.body.appendChild(pill);
  floatingPill = pill;
}

function removeSelectionPill() {
  if (floatingPill && floatingPill.parentElement) {
    floatingPill.parentElement.removeChild(floatingPill);
    floatingPill = null;
  }
}

/**
 * Inject the rich LeetCode badge into the page
 */
function injectBadge(data, anchorNode = null) {
  if (currentInjectedBadge && currentInjectedBadge.parentElement) {
    currentInjectedBadge.parentElement.removeChild(currentInjectedBadge);
    currentInjectedBadge = null;
  }

  const container = document.createElement("div");
  container.className = "lms-lc-injected-badge-wrapper";

  const diffClass = `lms-lc-diff-${data.difficulty || "Unknown"}`;
  const confidencePercent = Math.round((data.confidenceScore || 0) * 100);
  const titleDisplay = data.isLeetCodeProblem
    ? `${data.leetcodeNumber ? `#${data.leetcodeNumber} - ` : ""}${data.title}`
    : "No Direct LeetCode Match";

  container.innerHTML = `
    <div class="lms-lc-card">
      <div class="lms-lc-header">
        <div class="lms-lc-title-group">
          <svg class="lms-lc-logo-icon" viewBox="0 0 24 24" fill="#FFA116">
            <path d="M13.483 0a1.374 1.374 0 0 0-.961.438L7.116 6.226l-3.854 4.126a5.266 5.266 0 0 0-1.209 2.104 5.35 5.35 0 0 0-.125.513 5.527 5.527 0 0 0 .062 2.362 5.83 5.83 0 0 0 .349 1.017 5.938 5.938 0 0 0 1.271 1.818l4.277 4.193.039.038c2.248 2.165 5.852 2.133 8.063-.074l2.396-2.392c.54-.54.54-1.414.003-1.955a1.378 1.378 0 0 0-1.951-.003l-2.396 2.392a3.021 3.021 0 0 1-4.205.038l-.02-.019-4.276-4.193c-.652-.64-.972-1.469-.948-2.263a2.68 2.68 0 0 1 .666-1.794l3.774-4.04 5.322-5.703A1.376 1.376 0 0 0 13.483 0zm-2.88 5.57a1.38 1.38 0 0 0-.978.405l-4.1 4.1a1.38 1.38 0 0 0 1.95 1.953l4.1-4.1a1.38 1.38 0 0 0-.972-2.358zm7.575 3.327a1.38 1.38 0 0 0-.978.405l-8.91 8.91a1.38 1.38 0 1 0 1.95 1.953l8.91-8.91a1.38 1.38 0 0 0-.972-2.358z"/>
          </svg>
          <a class="lms-lc-card-title" href="${data.leetcodeUrl || '#'}" target="_blank" rel="noopener noreferrer">
            ${titleDisplay}
          </a>
          <span class="lms-lc-difficulty ${diffClass}">${data.difficulty || "Unknown"}</span>
        </div>
        <button class="lms-lc-close-btn" title="Dismiss">&times;</button>
      </div>

      <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px; flex-wrap: wrap;">
        <span class="lms-lc-pattern-badge">
          ⚡ ${data.pattern || "General Algorithm"}
        </span>
        <span class="lms-lc-confidence">
          Confidence: ${confidencePercent}%
        </span>
        ${
          data.datasetVerified
            ? `<span style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.35); font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">&check; LeetCode Verified</span>`
            : ""
        }
      </div>

      ${
        Array.isArray(data.officialTags) && data.officialTags.length > 0
          ? `<div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px;">
               ${data.officialTags.map(t => `<span style="background: #313244; color: #a6adc8; font-size: 10px; padding: 2px 6px; border-radius: 4px;">${t}</span>`).join("")}
             </div>`
          : ""
      }

      <div class="lms-lc-reasoning">
        ${data.reasoning || "Matched based on algorithmic input/output constraints."}
      </div>

      <div class="lms-lc-footer">
        <span style="font-size: 11px; color: #6c7086;">Detected via Gemini 3.5 Flash</span>
        ${
          data.leetcodeUrl
            ? `<a class="lms-lc-open-btn" href="${data.leetcodeUrl}" target="_blank" rel="noopener noreferrer">
                 Open on LeetCode &rarr;
               </a>`
            : ""
        }
      </div>
    </div>
  `;

  container.querySelector(".lms-lc-close-btn").addEventListener("click", () => {
    container.remove();
    currentInjectedBadge = null;
  });

  // Attach to target or problem container
  let target = anchorNode || findProblemContainer() || document.body.firstElementChild || document.body;
  if (target === document.body) {
    document.body.prepend(container);
  } else {
    target.parentElement.insertBefore(container, target);
  }

  currentInjectedBadge = container;
  container.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// Handle selection events to display floating pill
document.addEventListener("mouseup", (e) => {
  // If clicked inside our pill or injected badge, ignore
  if (
    (floatingPill && floatingPill.contains(e.target)) ||
    (currentInjectedBadge && currentInjectedBadge.contains(e.target))
  ) {
    return;
  }

  setTimeout(() => {
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : "";

    if (text && text.length > 25) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      showSelectionPill(rect.left + window.scrollX, rect.top + window.scrollY, text);
    } else {
      removeSelectionPill();
    }
  }, 10);
});

// Remove pill when clicking elsewhere
document.addEventListener("mousedown", (e) => {
  if (floatingPill && !floatingPill.contains(e.target)) {
    removeSelectionPill();
  }
});

// Message listener from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "GET_PAGE_PROBLEM_TEXT") {
    const extracted = extractProblemText();
    sendResponse({
      text: extracted.text,
      source: extracted.source,
      hasText: Boolean(extracted.text && extracted.text.length > 10)
    });
    return false;
  }

  if (message.action === "INJECT_MATCH_RESULT") {
    injectBadge(message.data);
    sendResponse({ success: true });
    return false;
  }
});
