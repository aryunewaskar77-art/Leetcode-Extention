/**
 * LMS to LeetCode Matcher - LeetCode Dataset Client
 * Fetches verified problem details, official test cases, topic tags,
 * hints, and similar questions from Alfa-LeetCode-API (https://alfa-leetcode-api.onrender.com/).
 */

const ALFA_BASE_URL = "https://alfa-leetcode-api.onrender.com";

/**
 * Fetch detailed problem specs from Alfa-LeetCode-API by titleSlug
 * @param {string} slug - The problem slug, e.g. "two-sum" or "3sum"
 * @returns {Promise<Object|null>}
 */
export async function fetchLeetCodeProblemDetails(slug) {
  if (!slug) return null;

  try {
    const cleanSlug = slug.trim().toLowerCase();
    const url = `${ALFA_BASE_URL}/select?titleSlug=${encodeURIComponent(cleanSlug)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`Alfa-LeetCode-API returned status ${res.status} for slug ${cleanSlug}`);
      return null;
    }

    const data = await res.json();
    if (!data || !data.questionTitle) {
      return null;
    }

    // Parse topic tags
    const topicTags = Array.isArray(data.topicTags)
      ? data.topicTags.map((t) => t.name)
      : [];

    // Parse similar questions if present
    let similarQuestions = [];
    if (typeof data.similarQuestions === "string") {
      try {
        similarQuestions = JSON.parse(data.similarQuestions).map((sq) => ({
          title: sq.title,
          difficulty: sq.difficulty,
          url: `https://leetcode.com/problems/${sq.titleSlug}/`
        }));
      } catch (e) {
        similarQuestions = [];
      }
    }

    return {
      verified: true,
      questionId: data.questionFrontendId || data.questionId,
      title: data.questionTitle,
      difficulty: data.difficulty,
      link: data.link || `https://leetcode.com/problems/${cleanSlug}/`,
      topicTags,
      hints: Array.isArray(data.hints) ? data.hints : [],
      likes: data.likes,
      dislikes: data.dislikes,
      similarQuestions: similarQuestions.slice(0, 4)
    };
  } catch (err) {
    console.warn("Could not enrich with Alfa-LeetCode-API:", err.message);
    return null;
  }
}
