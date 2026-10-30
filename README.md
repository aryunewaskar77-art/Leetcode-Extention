# LMS to LeetCode Matcher - Chrome Extension (Manifest V3)

A Chrome Extension that inspects coding assignments presented on university Learning Management Systems (Moodle, Canvas, Blackboard, or custom college portals) and matches them to the canonical LeetCode problem using the Gemini 2.5 Flash API with Structured Outputs.

---

## ✨ Features

- **Decodes University Re-Skins**: University professors frequently disguise classic LeetCode problems (e.g. changing *stock prices* to *hostel expenses*, or *islands* to *campus zones*). The extension instructs Gemini to isolate algorithmic structure, input/output types, example test cases, and time/space constraints to identify the canonical LeetCode problem.
- **Priority-Based Problem Extraction**:
  - **Priority 1 (Highlight-to-Match)**: Select any text snippet on any LMS page to reveal an instant floating **"Find LeetCode Match"** pill.
  - **Priority 2 (Automatic Container Detection)**: Detects containers across Moodle (`.que .formulation`), Canvas (`.assignment-description`, `.quiz-question`), Blackboard (`#problem_body`, `.problem-statement`), and generic portal layouts (`main`, `article.markdown-body`).
- **Interactive Injected Card**: Injects a clean card right next to the question on the page containing the LeetCode title, difficulty badge, confidence score, pattern tags, reasoning, and direct link.
- **Rich Popup Dashboard**:
  - Pre-configured Gemini AI key for seamless out-of-the-box matching.
  - One-click **"Scan Current Page"** button.
  - Collapsible manual paste area for pasting questions manually.
  - Color-coded badges (Easy: Teal, Medium: Amber, Hard: Red) and extension badge indicators (`EZ`, `MED`, `HRD`).

---

## 🚀 How to Install and Load in Chrome

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Toggle on **Developer mode** in the top right corner.
3. Click the **Load unpacked** button.
4. Select this directory:
   ```
   /Users/aaryaanewaskar/Desktop/Projects/leetcodeExtention
   ```
5. *(For new clones)* Copy `config.example.js` to `config.js` and add your Gemini API key:
   ```bash
   cp config.example.js config.js
   ```
   *(Note: `config.js` is ignored in `.gitignore` so your API key will never be pushed to GitHub!)*
6. Click on the extension icon in the toolbar or highlight any coding question on your LMS!

---

## 🛠 File Structure

- [manifest.json](file:///Users/aaryaanewaskar/Desktop/Projects/leetcodeExtention/manifest.json): Manifest V3 configuration with necessary permissions (`storage`, `activeTab`, `scripting`, and host permissions).
- [gemini.js](file:///Users/aaryaanewaskar/Desktop/Projects/leetcodeExtention/gemini.js): Gemini 2.5 Flash client with JSON schema enforcement (`responseMimeType: "application/json"`).
- [leetcodeApi.js](file:///Users/aaryaanewaskar/Desktop/Projects/leetcodeExtention/leetcodeApi.js): Integration with the open [Alfa-LeetCode-API](https://github.com/alfaarghya/alfa-leetcode-api) dataset for verifying matched problem slugs, retrieving official topic tags, hints, and related problems.
- [background.js](file:///Users/aaryaanewaskar/Desktop/Projects/leetcodeExtention/background.js): Service worker handling cross-context messaging, Alfa LeetCode dataset enrichment, and extension badges (`EZ`, `MED`, `HRD`).
- [content.js](file:///Users/aaryaanewaskar/Desktop/Projects/leetcodeExtention/content.js): Content script scraping DOM / selection and injecting the floating pill & result widget.
- [injected.css](file:///Users/aaryaanewaskar/Desktop/Projects/leetcodeExtention/injected.css): Stylesheet for the floating selection pill and embedded badge on web pages.
- [popup.html](file:///Users/aaryaanewaskar/Desktop/Projects/leetcodeExtention/popup.html) & [popup.js](file:///Users/aaryaanewaskar/Desktop/Projects/leetcodeExtention/popup.js): Extension popup interface with configuration, page scanner, manual input, and verified dataset result card.
- [styles.css](file:///Users/aaryaanewaskar/Desktop/Projects/leetcodeExtention/styles.css): Light/dark mode styles for the extension popup.
- `icons/`: Extension icon assets (16x16, 48x48, 128x128).
