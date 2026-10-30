/**
 * LMS to LeetCode Matcher - Popup Controller
 */

document.addEventListener("DOMContentLoaded", async () => {
  // Elements
  const scanPageBtn = document.getElementById("scanPageBtn");
  const accordionHeader = document.getElementById("accordionHeader");
  const accordionContent = document.getElementById("accordionContent");
  const accordionArrow = document.getElementById("accordionArrow");
  const manualTextInput = document.getElementById("manualTextInput");
  const analyzeManualBtn = document.getElementById("analyzeManualBtn");

  const errorBanner = document.getElementById("errorBanner");
  const loadingState = document.getElementById("loadingState");
  const emptyState = document.getElementById("emptyState");
  const resultCard = document.getElementById("resultCard");

  const resultTitleLink = document.getElementById("resultTitleLink");
  const resultDifficulty = document.getElementById("resultDifficulty");
  const resultPattern = document.getElementById("resultPattern");
  const resultConfidence = document.getElementById("resultConfidence");
  const resultReasoning = document.getElementById("resultReasoning");
  const resultOpenLink = document.getElementById("resultOpenLink");

  // Check if current tab already has a result
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab && activeTab.id) {
    chrome.runtime.sendMessage(
      { action: "GET_LAST_RESULT", tabId: activeTab.id },
      (response) => {
        if (response && response.result) {
          renderResult(response.result);
        }
      }
    );
  }

  // Accordion toggle for manual paste
  accordionHeader.addEventListener("click", () => {
    accordionContent.classList.toggle("open");
    accordionArrow.innerHTML = accordionContent.classList.contains("open") ? "&#9652;" : "&#9662;";
  });

  // Scan Current Page Trigger
  scanPageBtn.addEventListener("click", async () => {
    hideError();

    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!currentTab || !currentTab.id) {
      showError("Unable to identify active browser tab.");
      return;
    }

    // Try sending message to content script, with scripting fallback if tab was opened before extension loaded
    showLoading();
    try {
      chrome.tabs.sendMessage(
        currentTab.id,
        { action: "GET_PAGE_PROBLEM_TEXT" },
        async (response) => {
          if (!chrome.runtime.lastError && response && response.hasText) {
            executeAnalysis(response.text, currentTab.id);
            return;
          }

          // Fallback: If content script was not injected yet or returned empty, inject extractor directly via chrome.scripting
          try {
            const results = await chrome.scripting.executeScript({
              target: { tabId: currentTab.id },
              func: () => {
                // Priority 1: Selection
                const sel = window.getSelection() ? window.getSelection().toString().trim() : "";
                if (sel && sel.length > 20) return sel;

                // Priority 2: Look for description panel / tab
                // Check for elements containing "Example", "Constraints", or "Input:"
                const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
                let bestNode = null;
                let maxScore = 0;

                while (walker.nextNode()) {
                  const node = walker.currentNode;
                  const tag = node.tagName.toLowerCase();
                  if (["script", "style", "nav", "header", "button"].includes(tag)) continue;
                  
                  const text = node.innerText || "";
                  if (text.length < 50 || text.length > 5000) continue;

                  let score = 0;
                  if (/example/i.test(text)) score += 2;
                  if (/constraints/i.test(text)) score += 2;
                  if (/input:/i.test(text)) score += 2;
                  if (/output:/i.test(text)) score += 2;
                  if (/anagram|array|string|integer|return/i.test(text)) score += 1;

                  // Favor containers with class or id description
                  const className = typeof node.className === "string" ? node.className : "";
                  if (/description|problem|statement|task/i.test(className + " " + (node.id || ""))) {
                    score += 3;
                  }

                  if (score > maxScore) {
                    maxScore = score;
                    bestNode = node;
                  }
                }

                if (bestNode && maxScore >= 3) {
                  return bestNode.innerText.trim();
                }

                return "";
              }
            });

            const extractedText = results && results[0] && results[0].result ? results[0].result.trim() : "";
            if (extractedText && extractedText.length > 25) {
              executeAnalysis(extractedText, currentTab.id);
            } else {
              hideLoading();
              showError("Could not detect problem text automatically. Highlight the question text on the page or paste it below.");
            }
          } catch (scriptErr) {
            hideLoading();
            showError("Could not read page content. Highlight the question on the page or paste it manually below.");
          }
        }
      );
    } catch (err) {
      hideLoading();
      showError(`Scan failed: ${err.message}`);
    }
  });

  // Analyze Pasted Text Trigger
  analyzeManualBtn.addEventListener("click", async () => {
    hideError();
    const text = manualTextInput.value.trim();
    if (!text || text.length < 20) {
      showError("Please paste sufficient problem description or test cases (minimum 20 characters).");
      return;
    }

    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    showLoading();
    executeAnalysis(text, currentTab ? currentTab.id : null);
  });

  function executeAnalysis(problemText, tabId) {
    chrome.runtime.sendMessage(
      {
        action: "ANALYZE_PROBLEM",
        problemText,
        tabId
      },
      (res) => {
        hideLoading();
        if (res && res.success) {
          renderResult(res.data);
          // Also instruct active tab content script to inject the floating badge
          if (tabId) {
            chrome.tabs.sendMessage(tabId, {
              action: "INJECT_MATCH_RESULT",
              data: res.data
            }).catch(() => {});
          }
        } else {
          showError(res ? res.error : "Failed to analyze problem.");
        }
      }
    );
  }

  function renderResult(data) {
    emptyState.classList.add("hidden");
    resultCard.classList.remove("hidden");

    const title = data.isLeetCodeProblem
      ? `${data.leetcodeNumber ? `#${data.leetcodeNumber} - ` : ""}${data.title}`
      : "No Exact LeetCode Match Found";

    resultTitleLink.textContent = title;
    resultTitleLink.href = data.leetcodeUrl || "#";

    resultDifficulty.textContent = data.difficulty || "Unknown";
    resultDifficulty.className = `diff-badge diff-${data.difficulty || "Unknown"}`;

    resultPattern.textContent = `⚡ ${data.pattern || "General Algorithm"}`;
    const conf = Math.round((data.confidenceScore || 0) * 100);
    resultConfidence.textContent = `Confidence: ${conf}%`;

    resultReasoning.textContent = data.reasoning || "Matched algorithmic invariants.";

    // Render Alfa-LeetCode-API enriched details
    const datasetSection = document.getElementById("datasetDetailsSection");
    const officialTagsContainer = document.getElementById("officialTagsContainer");
    const officialHintsSection = document.getElementById("officialHintsSection");
    const officialHintsList = document.getElementById("officialHintsList");
    const similarQuestionsSection = document.getElementById("similarQuestionsSection");
    const similarQuestionsList = document.getElementById("similarQuestionsList");

    if (data.datasetVerified) {
      datasetSection.classList.remove("hidden");

      // Topic tags
      officialTagsContainer.innerHTML = "";
      if (Array.isArray(data.officialTags) && data.officialTags.length > 0) {
        data.officialTags.forEach((tag) => {
          const pill = document.createElement("span");
          pill.className = "official-tag";
          pill.textContent = tag;
          officialTagsContainer.appendChild(pill);
        });
      }

      // Hints
      if (Array.isArray(data.officialHints) && data.officialHints.length > 0) {
        officialHintsSection.classList.remove("hidden");
        officialHintsList.innerHTML = "";
        data.officialHints.slice(0, 2).forEach((hint) => {
          const li = document.createElement("li");
          li.innerHTML = hint;
          officialHintsList.appendChild(li);
        });
      } else {
        officialHintsSection.classList.add("hidden");
      }

      // Similar problems
      if (Array.isArray(data.similarQuestions) && data.similarQuestions.length > 0) {
        similarQuestionsSection.classList.remove("hidden");
        similarQuestionsList.innerHTML = "";
        data.similarQuestions.forEach((sq) => {
          const item = document.createElement("a");
          item.className = "similar-item";
          item.href = sq.url;
          item.target = "_blank";
          item.rel = "noopener";
          item.innerHTML = `
            <span>${sq.title}</span>
            <span class="diff-badge diff-${sq.difficulty || 'Unknown'}" style="font-size: 9px; padding: 1px 5px;">${sq.difficulty || ''}</span>
          `;
          similarQuestionsList.appendChild(item);
        });
      } else {
        similarQuestionsSection.classList.add("hidden");
      }
    } else {
      datasetSection.classList.add("hidden");
    }

    if (data.leetcodeUrl) {
      resultOpenLink.href = data.leetcodeUrl;
      resultOpenLink.classList.remove("hidden");
    } else {
      resultOpenLink.classList.add("hidden");
    }
  }

  function showLoading() {
    emptyState.classList.add("hidden");
    resultCard.classList.add("hidden");
    loadingState.classList.remove("hidden");
    scanPageBtn.disabled = true;
    analyzeManualBtn.disabled = true;
  }

  function hideLoading() {
    loadingState.classList.add("hidden");
    scanPageBtn.disabled = false;
    analyzeManualBtn.disabled = false;
  }

  function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.classList.remove("hidden");
  }

  function hideError() {
    errorBanner.textContent = "";
    errorBanner.classList.add("hidden");
  }
});
