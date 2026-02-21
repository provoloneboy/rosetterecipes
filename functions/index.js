import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";

setGlobalOptions({ region: "us-central1", maxInstances: 10 });

export const extractRecipe = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  try {
    const sourceUrl = String(req.query.url || req.body?.url || "").trim();
    if (!sourceUrl) {
      res.status(400).json({ ok: false, error: "Missing url" });
      return;
    }

    const parsed = new URL(sourceUrl);
    const normalizedUrl = parsed.toString();

    const html = await fetchHtmlWithFallbacks(normalizedUrl);

    const recipe =
      parseRecipeFromJsonLd(html, normalizedUrl) ||
      parseRecipeFromHtmlText(html, normalizedUrl);

    if (!recipe.ingredients.length || !recipe.instructions.length) {
      res.status(422).json({ ok: false, error: "No recipe found on this page" });
      return;
    }

    res.json({ ok: true, recipe });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || "Extraction failed" });
  }
});

async function fetchHtmlWithFallbacks(sourceUrl) {
  const variants = getUrlVariants(sourceUrl);

  let lastError = null;
  for (const url of variants) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: {
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      if (!html || html.length < 200) {
        throw new Error("Response too short");
      }

      return html;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("Could not fetch source URL");
}

function getUrlVariants(sourceUrl) {
  const urls = new Set([sourceUrl]);

  try {
    const url = new URL(sourceUrl);
    if (url.hostname.includes("allrecipes.com")) {
      const noTrailing = sourceUrl.replace(/\/$/, "");
      urls.add(`${noTrailing}/print/`);
      urls.add(`${noTrailing}?output=1`);
    }
  } catch {
    // Ignore variant generation failure.
  }

  return [...urls];
}

function parseRecipeFromJsonLd(html, sourceUrl) {
  const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];

  for (const script of scripts) {
    const data = safeJsonParse(script[1]);
    if (!data) continue;

    const recipeNode = findRecipeNode(data);
    if (!recipeNode) continue;

    const ingredients = toStringArray(recipeNode.recipeIngredient)
      .map(cleanIngredient)
      .filter((x) => x && looksLikeIngredient(x));

    const instructions = extractInstructionLines(recipeNode.recipeInstructions)
      .map(cleanInstruction)
      .filter((x) => x && looksLikeInstruction(x));

    if (!ingredients.length || !instructions.length) continue;

    return {
      title: String(recipeNode.name || "Imported Recipe").trim(),
      sourceUrl,
      servings: parseServings(recipeNode.recipeYield) || 1,
      ingredients: dedupe(ingredients).slice(0, 60),
      instructions: dedupe(instructions).slice(0, 40),
      categoryId: "",
    };
  }

  return null;
}

function parseRecipeFromHtmlText(html, sourceUrl) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

  const rawLines = text
    .split(/[\n\r]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5000);

  const ingredients = rawLines
    .map(cleanIngredient)
    .filter((x) => x && looksLikeIngredient(x));

  const instructions = rawLines
    .map(cleanInstruction)
    .filter((x) => x && looksLikeInstruction(x));

  return {
    title: guessTitle(rawLines) || "Imported Recipe",
    sourceUrl,
    servings: 1,
    ingredients: dedupe(ingredients).slice(0, 60),
    instructions: dedupe(instructions).slice(0, 40),
    categoryId: "",
  };
}

function guessTitle(lines) {
  return lines.find((line) => line.length > 5 && line.length < 90 && !looksLikeInstruction(line) && !looksLikeIngredient(line));
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function findRecipeNode(root) {
  const queue = [root];

  while (queue.length) {
    const node = queue.shift();
    if (!node) continue;

    if (Array.isArray(node)) {
      queue.push(...node);
      continue;
    }

    if (typeof node !== "object") continue;

    const type = node["@type"];
    if (
      (typeof type === "string" && type.toLowerCase() === "recipe") ||
      (Array.isArray(type) && type.some((entry) => String(entry).toLowerCase() === "recipe"))
    ) {
      return node;
    }

    for (const value of Object.values(node)) {
      if (value && (typeof value === "object" || Array.isArray(value))) {
        queue.push(value);
      }
    }
  }

  return null;
}

function toStringArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return [String(value).trim()].filter(Boolean);
}

function extractInstructionLines(value) {
  if (!value) return [];

  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractInstructionLines(item));
  }

  if (typeof value === "object") {
    const direct = [value.text, value.name].filter(Boolean).map(String);
    const nested = value.itemListElement ? extractInstructionLines(value.itemListElement) : [];
    return [...direct, ...nested];
  }

  return [];
}

function cleanIngredient(line) {
  return String(line || "")
    .replace(/[•·]/g, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanInstruction(line) {
  return String(line || "")
    .replace(/^step\s*\d+\s*[:.)-]?\s*/i, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeIngredient(line) {
  const l = line.toLowerCase();
  if (!l || l.length > 150) return false;
  if (/^(ingredients?|instructions?)$/.test(l)) return false;
  if (/\b(reviews?|photos?|subscribe|privacy|terms|kitchen tips|news|features)\b/.test(l)) return false;
  if (/^\d{1,2}:\d{2}$/.test(l)) return false;
  if (/^\d+%$/.test(l)) return false;

  return (
    /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|¼|½|¾)/.test(l) &&
    /\b(tsp|tbsp|cup|cups|oz|lb|g|kg|ml|l|teaspoon|tablespoon|ounce|pound)\b/.test(l)
  );
}

function looksLikeInstruction(line) {
  const l = line.toLowerCase();
  if (!l || l.length < 8 || l.length > 300) return false;
  if (/\b(reviews?|photos?|subscribe|privacy|terms|kitchen tips|news|features)\b/.test(l)) return false;

  return /\b(preheat|mix|stir|bake|cook|heat|add|pour|simmer|boil|whisk|serve|transfer|arrange|flip|reduce)\b/.test(l);
}

function parseServings(value) {
  const text = Array.isArray(value) ? value.join(" ") : String(value || "");
  const match = text.match(/(\d{1,2})/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function dedupe(items) {
  return [...new Set(items.map((x) => x.trim()).filter(Boolean))];
}
