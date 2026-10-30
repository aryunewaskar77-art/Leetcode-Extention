/**
 * LMS to LeetCode Matcher - Background Service Worker
 * Manages storage, badge status, and routing analysis requests.
 */

import { matchProblemWithGemini, DEFAULT_GEMINI_KEY } from "./gemini.js";
import { fetchLeetCodeProblemDetails } from "./leetcodeApi.js";

// Keep track of latest scan results per tab
const tabResults = new Map();

// Helper to set badge status
function updateBadge(tabId, status, difficulty = null) {
  if (!tabId) return;

  if (status === "loading") {
    chrome.action.setBadgeText({ tabId, text: "..." });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#f59e0b" }); // amber
  } else if (status === "success") {
    let diffBadge = "LC";
    let color = "#10b981"; // emerald

    if (difficulty === "Easy") {
      diffBadge = "EZ";
      color = "#00b8a3"; // LeetCode easy teal
    } else if (difficulty === "Medium") {
      diffBadge = "MED";
      color = "#ffc01e"; // LeetCode medium yellow/orange
    } else if (difficulty === "Hard") {
      diffBadge = "HRD";
      color = "#ff375f"; // LeetCode hard red
    }

    chrome.action.setBadgeText({ tabId, text: diffBadge });
    chrome.action.setBadgeBackgroundColor({ tabId, color });
  } else if (status === "not_found") {
    chrome.action.setBadgeText({ tabId, text: "NO" });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#64748b" }); // slate
  } else if (status === "error") {
    chrome.action.setBadgeText({ tabId, text: "!" });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#ef4444" }); // red
  } else {
    chrome.action.setBadgeText({ tabId, text: "" });
  }
}

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab ? sender.tab.id : message.tabId;

  if (message.action === "ANALYZE_PROBLEM") {
    const { problemText } = message;

    (async () => {
      try {
        if (tabId) updateBadge(tabId, "loading");

        // Retrieve stored API key or use built-in default
        const stored = await chrome.storage.sync.get(["geminiApiKey"]);
        const apiKey = stored.geminiApiKey || DEFAULT_GEMINI_KEY;

        if (!apiKey) {
          throw new Error("Missing Gemini API Key.");
        }

        const matchResult = await matchProblemWithGemini(apiKey, problemText);

        // If a LeetCode problem was matched, enrich with verified dataset from Alfa-LeetCode-API
        if (matchResult.isLeetCodeProblem && matchResult.slug) {
          const datasetDetails = await fetchLeetCodeProblemDetails(matchResult.slug);
          if (datasetDetails) {
            matchResult.datasetVerified = true;
            if (datasetDetails.questionId) matchResult.leetcodeNumber = parseInt(datasetDetails.questionId, 10);
            if (datasetDetails.title) matchResult.title = datasetDetails.title;
            if (datasetDetails.difficulty) matchResult.difficulty = datasetDetails.difficulty;
            if (datasetDetails.topicTags && datasetDetails.topicTags.length > 0) {
              matchResult.officialTags = datasetDetails.topicTags;
            }
            if (datasetDetails.hints && datasetDetails.hints.length > 0) {
              matchResult.officialHints = datasetDetails.hints;
            }
            if (datasetDetails.similarQuestions && datasetDetails.similarQuestions.length > 0) {
              matchResult.similarQuestions = datasetDetails.similarQuestions;
            }
          }
        }

        if (tabId) {
          tabResults.set(tabId, matchResult);
          if (matchResult.isLeetCodeProblem) {
            updateBadge(tabId, "success", matchResult.difficulty);
          } else {
            updateBadge(tabId, "not_found");
          }
        }

        sendResponse({ success: true, data: matchResult });
      } catch (error) {
        if (tabId) updateBadge(tabId, "error");
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true; // Keep message channel open for async response
  }

  if (message.action === "GET_LAST_RESULT") {
    const result = tabId ? tabResults.get(tabId) : null;
    sendResponse({ result });
    return false;
  }

  if (message.action === "CLEAR_RESULT") {
    if (tabId) {
      tabResults.delete(tabId);
      updateBadge(tabId, "clear");
    }
    sendResponse({ cleared: true });
    return false;
  }
});

// Clean up state when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabResults.delete(tabId);
});
