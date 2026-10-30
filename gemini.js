/**
 * LMS to LeetCode Matcher - Gemini API Client
 * Uses gemini-3.5-flash with structured JSON response schema.
 */

import { CONFIG } from "./config.js";

export const DEFAULT_GEMINI_KEY = CONFIG.GEMINI_API_KEY || "";
const GEMINI_MODEL = "gemini-3.5-flash";

const LEETCODE_SCHEMA = {
  type: "OBJECT",
  properties: {
    isLeetCodeProblem: {
      type: "BOOLEAN",
      description: "Whether this problem corresponds to or is an adaptation/reskin of a known LeetCode problem."
    },
    leetcodeNumber: {
      type: "INTEGER",
      description: "Canonical LeetCode problem number (e.g. 15 for 3Sum), or null if not applicable."
    },
    title: {
      type: "STRING",
      description: "Canonical LeetCode problem title (e.g. '3Sum')."
    },
    difficulty: {
      type: "STRING",
      enum: ["Easy", "Medium", "Hard", "Unknown"],
      description: "LeetCode official difficulty rating."
    },
    slug: {
      type: "STRING",
      description: "LeetCode URL problem slug (e.g. '3sum' or 'two-sum')."
    },
    leetcodeUrl: {
      type: "STRING",
      description: "Full direct URL to the problem on LeetCode (e.g. 'https://leetcode.com/problems/3sum/')."
    },
    confidenceScore: {
      type: "NUMBER",
      description: "Confidence score between 0.0 and 1.0 indicating how strongly this matches the LeetCode question."
    },
    pattern: {
      type: "STRING",
      description: "Primary algorithmic pattern/tags (e.g., 'Two Pointers / Sliding Window', 'Dynamic Programming', 'Monotonic Stack', 'Graph BFS/DFS')."
    },
    reasoning: {
      type: "STRING",
      description: "Concise explanation of why the input/output signature, test cases, and constraints map to this specific LeetCode problem despite any re-skinning."
    }
  },
  required: [
    "isLeetCodeProblem",
    "title",
    "difficulty",
    "slug",
    "leetcodeUrl",
    "confidenceScore",
    "pattern",
    "reasoning"
  ]
};

const SYSTEM_INSTRUCTION = `You are a world-class competitive programming and algorithm identification expert.
Your mission is to analyze university Learning Management System (LMS) coding assignments (from Moodle, Canvas, Blackboard, Brightspace, or custom university portals) and pinpoint the canonical LeetCode problem they are based on.

Key Instructions:
1. UNIVERSITY RE-SKIN DECODING:
   - Professors and TAs frequently rewrite or re-skin LeetCode problems (e.g., changing "stock prices" to "hostel expenses / crypto rates", "cities & flights" to "campus Wi-Fi routers", "robber houses" to "energy harvesting stations", or "islands" to "campus buildings").
   - Look past the decorative scenario and story wrapper.
   - Analyze:
     * Core mathematical/algorithmic invariants
     * Input structure (e.g., array of integers, DAG, binary tree, intervals, matrix)
     * Output structure (e.g., boolean, max profit, count of ways, list of triplets)
     * Target time & space complexity constraints (e.g., N <= 10^5 implies O(N) or O(N log N))
     * Sample input/output cases

2. PRECISE MAPPING:
   - Find the exact canonical LeetCode problem.
   - Provide the correct official problem number (e.g., 1 for Two Sum, 15 for 3Sum, 42 for Trapping Rain Water, 200 for Number of Islands).
   - Provide the canonical LeetCode URL in the format: https://leetcode.com/problems/<slug>/
   - If the question is genuinely custom or not derived from any LeetCode problem, set "isLeetCodeProblem": false with the closest algorithmic pattern and explain in "reasoning".
`;

const FALLBACK_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite"
];

async function callGeminiWithModel(modelName, apiKey, problemText) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

  const payload = {
    system_instruction: {
      parts: [{ text: SYSTEM_INSTRUCTION }]
    },
    contents: [
      {
        parts: [
          {
            text: `Analyze the following coding assignment/problem description and identify the canonical LeetCode match:\n\n---\n${problemText.trim()}\n---`
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: LEETCODE_SCHEMA,
      temperature: 0.1
    }
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData?.error?.message || `API request failed with status ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!candidateText) {
    throw new Error("Gemini API returned an empty response.");
  }

  const result = JSON.parse(candidateText);
  if (result.slug && (!result.leetcodeUrl || !result.leetcodeUrl.startsWith("http"))) {
    result.leetcodeUrl = `https://leetcode.com/problems/${result.slug}/`;
  }
  return result;
}

export async function matchProblemWithGemini(apiKey, problemText) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error("Gemini API key is required.");
  }

  let lastError = null;

  // Try across available models with automatic retry on 503 / 429
  for (const model of FALLBACK_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (attempt > 0) {
          // Wait 1.2s before retry on spike
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }
        return await callGeminiWithModel(model, apiKey, problemText);
      } catch (err) {
        lastError = err;
        const isTemporary = err.status === 503 || err.status === 429 || (err.message && /high demand|temporar/i.test(err.message));
        if (!isTemporary) {
          // If non-temporary (e.g. 400 or auth failure), don't retry same model
          break;
        }
      }
    }
  }

  throw lastError || new Error("Gemini service is currently busy. Please retry in a few seconds.");
}
