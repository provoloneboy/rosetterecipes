import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const state = {
  recipes: [],
  categories: [],
  selectedId: null,
  activeTab: "recipes",
  currentUser: null,
  unsubRecipes: null,
  unsubCategories: null,
};

const el = {
  urlInput: document.getElementById("urlInput"),
  urlImportBtn: document.getElementById("urlImportBtn"),
  textInput: document.getElementById("textInput"),
  textImportBtn: document.getElementById("textImportBtn"),
  imageInput: document.getElementById("imageInput"),
  imageImportBtn: document.getElementById("imageImportBtn"),
  importStatus: document.getElementById("importStatus"),
  recipeList: document.getElementById("recipeList"),
  searchInput: document.getElementById("searchInput"),
  recipesTabBtn: document.getElementById("recipesTabBtn"),
  categoriesTabBtn: document.getElementById("categoriesTabBtn"),
  categoriesPanel: document.getElementById("categoriesPanel"),
  newCategoryInput: document.getElementById("newCategoryInput"),
  addCategoryBtn: document.getElementById("addCategoryBtn"),
  categoryList: document.getElementById("categoryList"),
  emptyViewer: document.getElementById("emptyViewer"),
  recipeViewer: document.getElementById("recipeViewer"),
  recipeTitle: document.getElementById("recipeTitle"),
  recipeMeta: document.getElementById("recipeMeta"),
  servingsInput: document.getElementById("servingsInput"),
  categorySelect: document.getElementById("categorySelect"),
  unitSelect: document.getElementById("unitSelect"),
  ingredientList: document.getElementById("ingredientList"),
  instructionList: document.getElementById("instructionList"),
  deleteRecipeBtn: document.getElementById("deleteRecipeBtn"),
  emailInput: document.getElementById("emailInput"),
  passwordInput: document.getElementById("passwordInput"),
  loginBtn: document.getElementById("loginBtn"),
  signupBtn: document.getElementById("signupBtn"),
  authForm: document.getElementById("authForm"),
  signedInBox: document.getElementById("signedInBox"),
  authUserLabel: document.getElementById("authUserLabel"),
  logoutBtn: document.getElementById("logoutBtn"),
  authStatus: document.getElementById("authStatus"),
};

const UNIT_ALIASES = {
  tsp: ["teaspoon", "teaspoons", "tsp", "tsp."],
  tbsp: ["tablespoon", "tablespoons", "tbsp", "tbsp."],
  cup: ["cup", "cups"],
  oz: ["oz", "ounce", "ounces"],
  lb: ["lb", "lbs", "pound", "pounds"],
  g: ["g", "gram", "grams"],
  kg: ["kg", "kilogram", "kilograms"],
  ml: ["ml", "milliliter", "milliliters", "millilitre", "millilitres"],
  l: ["l", "liter", "liters", "litre", "litres"],
};

const US_TO_METRIC = {
  tsp: { toUnit: "ml", factor: 4.92892 },
  tbsp: { toUnit: "ml", factor: 14.7868 },
  cup: { toUnit: "ml", factor: 236.588 },
  oz: { toUnit: "g", factor: 28.3495 },
  lb: { toUnit: "g", factor: 453.592 },
};

const METRIC_TO_US = {
  ml: { toUnit: "tsp", factor: 0.202884 },
  l: { toUnit: "cup", factor: 4.22675 },
  g: { toUnit: "oz", factor: 0.035274 },
  kg: { toUnit: "lb", factor: 2.20462 },
};

const FRACTIONS = {
  "1/8": 0.125,
  "1/4": 0.25,
  "1/3": 1 / 3,
  "1/2": 0.5,
  "2/3": 2 / 3,
  "3/4": 0.75,
  "7/8": 0.875,
};

let auth = null;
let db = null;
let firebaseConfig = null;

init();

function init() {
  bindEvents();
  initTabs();
  void initFirebase();
  renderList();
  renderCategories();
  renderViewer();
}

async function initFirebase() {
  firebaseConfig = await loadFirebaseConfig();

  if (!isFirebaseConfigured(firebaseConfig)) {
    setAuthStatus("Add your Firebase keys in firebase-config.local.json or deploy with GitHub Secrets.");
    toggleAuthedUi(false);
    return;
  }

  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  onAuthStateChanged(auth, (user) => {
    state.currentUser = user;
    if (!user) {
      cleanupSubscriptions();
      state.recipes = [];
      state.categories = [];
      state.selectedId = null;
      toggleAuthedUi(false);
      setImportStatus("Log in to view and sync your recipes.");
      renderList();
      renderCategories();
      renderViewer();
      return;
    }

    toggleAuthedUi(true);
    setAuthStatus("Cloud sync active.");
    setImportStatus("Ready to import.");
    subscribeToUserData(user.uid);
  });
}

async function loadFirebaseConfig() {
  const paths = ["./firebase-config.local.json", "./firebase-config.json"];

  for (const path of paths) {
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) continue;
      return await response.json();
    } catch (_err) {
      // Try next config source.
    }
  }

  return null;
}

function isFirebaseConfigured(config) {
  if (!config || typeof config !== "object") return false;
  const keys = ["apiKey", "authDomain", "projectId", "appId"];
  return keys.every((key) => {
    const value = String(config[key] || "").trim();
    return value && !value.includes("YOUR_");
  });
}

function bindEvents() {
  el.authForm.addEventListener("submit", (event) => event.preventDefault());
  el.loginBtn.addEventListener("click", login);
  el.signupBtn.addEventListener("click", signup);
  el.logoutBtn.addEventListener("click", logout);

  el.urlImportBtn.addEventListener("click", importFromUrl);
  el.textImportBtn.addEventListener("click", importFromText);
  el.imageImportBtn.addEventListener("click", importFromImage);

  el.searchInput.addEventListener("input", renderList);

  el.servingsInput.addEventListener("input", () => renderViewer());
  el.unitSelect.addEventListener("change", () => renderViewer());

  el.deleteRecipeBtn.addEventListener("click", deleteSelectedRecipe);
  el.categorySelect.addEventListener("change", updateSelectedRecipeCategory);

  el.addCategoryBtn.addEventListener("click", addCategory);
  el.newCategoryInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addCategory();
    }
  });
}

function initTabs() {
  el.recipesTabBtn.addEventListener("click", () => {
    state.activeTab = "recipes";
    renderTabState();
  });

  el.categoriesTabBtn.addEventListener("click", () => {
    state.activeTab = "categories";
    renderTabState();
  });

  renderTabState();
}

function renderTabState() {
  const recipesActive = state.activeTab === "recipes";
  el.recipesTabBtn.classList.toggle("active", recipesActive);
  el.categoriesTabBtn.classList.toggle("active", !recipesActive);
  el.recipeList.classList.toggle("hidden", !recipesActive);
  el.categoriesPanel.classList.toggle("hidden", recipesActive);
}

function toggleAuthedUi(isAuthed) {
  el.authForm.classList.toggle("hidden", isAuthed);
  el.signedInBox.classList.toggle("hidden", !isAuthed);
  el.urlImportBtn.disabled = !isAuthed;
  el.textImportBtn.disabled = !isAuthed;
  el.imageImportBtn.disabled = !isAuthed;
  el.addCategoryBtn.disabled = !isAuthed;
  el.deleteRecipeBtn.disabled = !isAuthed;
  el.categorySelect.disabled = !isAuthed;

  if (isAuthed) {
    el.authUserLabel.textContent = state.currentUser?.email || "Signed in";
  } else {
    el.authUserLabel.textContent = "";
  }
}

function setAuthStatus(text) {
  el.authStatus.textContent = text;
}

function setImportStatus(text) {
  el.importStatus.textContent = text;
}

async function signup() {
  if (!auth) return;
  const email = el.emailInput.value.trim();
  const password = el.passwordInput.value.trim();

  if (!email || !password) {
    setAuthStatus("Enter email and password.");
    return;
  }

  try {
    await createUserWithEmailAndPassword(auth, email, password);
    setAuthStatus("Account created.");
  } catch (err) {
    setAuthStatus(humanizeAuthError(err));
  }
}

async function login() {
  if (!auth) return;
  const email = el.emailInput.value.trim();
  const password = el.passwordInput.value.trim();

  if (!email || !password) {
    setAuthStatus("Enter email and password.");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    setAuthStatus("Signed in.");
  } catch (err) {
    setAuthStatus(humanizeAuthError(err));
  }
}

async function logout() {
  if (!auth) return;
  await signOut(auth);
  setAuthStatus("Signed out.");
}

function humanizeAuthError(err) {
  const code = err?.code || "auth/error";
  if (code.includes("invalid-credential")) return "Invalid email or password.";
  if (code.includes("email-already-in-use")) return "Email already in use.";
  if (code.includes("weak-password")) return "Password should be at least 6 characters.";
  return "Authentication failed. Check Firebase setup and credentials.";
}

function cleanupSubscriptions() {
  if (state.unsubRecipes) state.unsubRecipes();
  if (state.unsubCategories) state.unsubCategories();
  state.unsubRecipes = null;
  state.unsubCategories = null;
}

function subscribeToUserData(uid) {
  cleanupSubscriptions();

  const recipeQuery = query(collection(db, "recipes"), where("uid", "==", uid));
  state.unsubRecipes = onSnapshot(recipeQuery, (snapshot) => {
    state.recipes = snapshot.docs
      .map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          title: data.title || "Untitled Recipe",
          sourceUrl: data.sourceUrl || "",
          servings: normalizeServings(data.servings),
          ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
          instructions: Array.isArray(data.instructions) ? data.instructions : [],
          categoryId: data.categoryId || "",
          createdAtMs: data.createdAt?.toMillis ? data.createdAt.toMillis() : 0,
        };
      })
      .sort((a, b) => b.createdAtMs - a.createdAtMs);

    if (!state.recipes.some((r) => r.id === state.selectedId)) {
      state.selectedId = state.recipes[0]?.id || null;
    }

    renderList();
    renderViewer();
    renderCategories();
  });

  const categoryQuery = query(collection(db, "categories"), where("uid", "==", uid));
  state.unsubCategories = onSnapshot(categoryQuery, (snapshot) => {
    state.categories = snapshot.docs
      .map((docSnap) => ({
        id: docSnap.id,
        name: String(docSnap.data().name || "").trim(),
      }))
      .filter((c) => c.name)
      .sort((a, b) => a.name.localeCompare(b.name));

    renderCategories();
    renderList();
    renderViewer();
  });
}

async function importFromText() {
  if (!ensureAuthed()) return;

  const text = el.textInput.value.trim();
  if (!text) {
    setImportStatus("Paste recipe text first.");
    return;
  }

  const parsed = parseRecipeText(text, "Pasted Recipe");
  await saveRecipe(parsed);
  setImportStatus("Recipe imported from text.");
  el.textInput.value = "";
}

async function importFromUrl() {
  if (!ensureAuthed()) return;

  const sourceUrl = el.urlInput.value.trim();
  if (!sourceUrl) {
    setImportStatus("Enter a recipe URL first.");
    return;
  }

  try {
    new URL(sourceUrl);
  } catch {
    setImportStatus("Please enter a valid URL.");
    return;
  }

  setImportStatus("Fetching and extracting recipe...");

  try {
    const text = await fetchRecipeTextWithFallbacks(sourceUrl);
    const structured = parseRecipeFromStructuredData(text, sourceUrl);
    const title = guessTitleFromMarkdown(text) || "Imported Recipe";
    const parsed = structured || parseRecipeText(text, title, sourceUrl);
    await saveRecipe(parsed);
    el.urlInput.value = "";
    setImportStatus("Recipe extracted from URL.");
  } catch (err) {
    console.error(err);
    setImportStatus(`Could not extract this URL automatically (${err?.message || "blocked"}). Try paste text for this site.`);
  }
}

async function fetchRecipeTextWithFallbacks(sourceUrl) {
  const variants = getSourceUrlVariants(sourceUrl);
  const targets = [];
  for (const variant of variants) {
    const noScheme = variant.replace(/^https?:\/\//, "");
    targets.push(`https://r.jina.ai/http://${noScheme}`);
    targets.push(`https://r.jina.ai/https://${noScheme}`);
    targets.push(`https://api.allorigins.win/raw?url=${encodeURIComponent(variant)}`);
    targets.push(`https://corsproxy.io/?${encodeURIComponent(variant)}`);
  }

  let lastError = null;

  for (const target of targets) {
    try {
      const response = await fetch(target, { method: "GET" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${target}`);
      }
      const text = (await response.text()).trim();
      if (!text) {
        throw new Error(`Empty response from ${target}`);
      }
      return text;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("All URL extraction methods failed.");
}

function getSourceUrlVariants(sourceUrl) {
  const urls = new Set([sourceUrl]);
  try {
    const parsed = new URL(sourceUrl);
    if (parsed.hostname.includes("allrecipes.com")) {
      const noTrailing = sourceUrl.replace(/\/$/, "");
      urls.add(`${noTrailing}/print/`);
      urls.add(`${noTrailing}?output=1`);
    }
  } catch (_err) {
    // Keep default URL only.
  }
  return [...urls];
}

function parseRecipeFromStructuredData(rawText, sourceUrl) {
  if (!/<script/i.test(rawText)) return null;

  const blocks = [...rawText.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of blocks) {
    const json = safeJsonParse(block[1]);
    if (!json) continue;
    const recipe = findRecipeNode(json);
    if (!recipe) continue;

    const ingredients = Array.isArray(recipe.recipeIngredient)
      ? recipe.recipeIngredient.map((x) => String(x).trim()).filter(Boolean)
      : [];
    const instructions = extractInstructions(recipe.recipeInstructions);
    if (!ingredients.length || !instructions.length) continue;

    return {
      title: String(recipe.name || "Imported Recipe").trim(),
      sourceUrl,
      servings: extractServings(String(recipe.recipeYield || "")) || 1,
      ingredients: dedupe(ingredients).slice(0, 80),
      instructions: dedupe(instructions).slice(0, 80),
      categoryId: "",
    };
  }

  return null;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function findRecipeNode(node) {
  const queue = [node];
  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;

    const type = current["@type"];
    if (
      (typeof type === "string" && type.toLowerCase() === "recipe") ||
      (Array.isArray(type) && type.some((x) => String(x).toLowerCase() === "recipe"))
    ) {
      return current;
    }

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    if (typeof current === "object") {
      for (const value of Object.values(current)) {
        if (value && typeof value === "object") queue.push(value);
      }
    }
  }

  return null;
}

function extractInstructions(rawInstructions) {
  if (!rawInstructions) return [];
  if (typeof rawInstructions === "string") return [rawInstructions.trim()].filter(Boolean);

  if (Array.isArray(rawInstructions)) {
    const result = [];
    for (const item of rawInstructions) {
      if (typeof item === "string") {
        const text = item.trim();
        if (text) result.push(text);
      } else if (item && typeof item === "object") {
        const text = item.text || item.name || "";
        if (typeof text === "string" && text.trim()) result.push(text.trim());
        if (Array.isArray(item.itemListElement)) {
          result.push(...extractInstructions(item.itemListElement));
        }
      }
    }
    return result;
  }

  if (typeof rawInstructions === "object") {
    const text = rawInstructions.text || rawInstructions.name || "";
    return typeof text === "string" && text.trim() ? [text.trim()] : [];
  }

  return [];
}

async function importFromImage() {
  if (!ensureAuthed()) return;

  const file = el.imageInput.files?.[0];
  if (!file) {
    setImportStatus("Choose an image first.");
    return;
  }

  if (!window.Tesseract) {
    setImportStatus("OCR library did not load. Refresh and try again.");
    return;
  }

  setImportStatus("Reading text from image (OCR)...");

  try {
    const result = await Tesseract.recognize(file, "eng", {
      workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js",
      corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js",
      langPath: "https://tessdata.projectnaptha.com/4.0.0",
      logger: (m) => {
        if (m.status === "recognizing text") {
          setImportStatus(`Reading image... ${Math.round(m.progress * 100)}%`);
        }
      },
    });

    const extractedText = result.data.text.trim();
    if (!extractedText) {
      setImportStatus("No text found in image.");
      return;
    }

    const parsed = parseRecipeText(extractedText, "Photo Imported Recipe");
    await saveRecipe(parsed);
    setImportStatus("Recipe imported from image.");
    el.imageInput.value = "";
  } catch (err) {
    console.error(err);
    setImportStatus("Image OCR failed. Try a clearer image.");
  }
}

function ensureAuthed() {
  if (!state.currentUser || !db) {
    setImportStatus("Please log in first.");
    return false;
  }
  return true;
}

async function saveRecipe(recipe) {
  await addDoc(collection(db, "recipes"), {
    uid: state.currentUser.uid,
    title: recipe.title,
    sourceUrl: recipe.sourceUrl || "",
    servings: normalizeServings(recipe.servings),
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    categoryId: recipe.categoryId || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

async function deleteSelectedRecipe() {
  if (!ensureAuthed()) return;
  if (!state.selectedId) return;
  await deleteDoc(doc(db, "recipes", state.selectedId));
}

async function updateSelectedRecipeCategory() {
  if (!ensureAuthed()) return;
  const recipe = state.recipes.find((r) => r.id === state.selectedId);
  if (!recipe) return;

  await updateDoc(doc(db, "recipes", recipe.id), {
    categoryId: el.categorySelect.value,
    updatedAt: serverTimestamp(),
  });
}

async function addCategory() {
  if (!ensureAuthed()) return;

  const name = el.newCategoryInput.value.trim();
  if (!name) return;

  const exists = state.categories.some((c) => c.name.toLowerCase() === name.toLowerCase());
  if (exists) {
    setImportStatus("Category already exists.");
    return;
  }

  await addDoc(collection(db, "categories"), {
    uid: state.currentUser.uid,
    name,
    createdAt: serverTimestamp(),
  });

  el.newCategoryInput.value = "";
  setImportStatus("Category added.");
}

async function deleteCategory(categoryId) {
  if (!ensureAuthed()) return;

  const batch = writeBatch(db);

  for (const recipe of state.recipes) {
    if (recipe.categoryId === categoryId) {
      batch.update(doc(db, "recipes", recipe.id), {
        categoryId: "",
        updatedAt: serverTimestamp(),
      });
    }
  }

  batch.delete(doc(db, "categories", categoryId));
  await batch.commit();
}

function parseRecipeText(rawText, fallbackTitle, sourceUrl = "") {
  const cleanText = rawText.replace(/\r/g, "").trim();
  const lines = cleanText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const title =
    lines.find((l) => l.length > 3 && l.length < 90 && !isLikelyInstruction(l) && !isLikelyIngredient(l)) ||
    fallbackTitle;

  const servings = extractServings(cleanText) || 1;

  const ingredientLines = [];
  const instructionLines = [];

  let mode = "unknown";
  for (const line of lines) {
    const low = line.toLowerCase();

    if (/^ingredients?\b/.test(low)) {
      mode = "ingredients";
      continue;
    }
    if (/^(instructions?|method|directions?)\b/.test(low)) {
      mode = "instructions";
      continue;
    }

    if (mode === "ingredients") {
      ingredientLines.push(stripBullet(line));
      continue;
    }

    if (mode === "instructions") {
      instructionLines.push(stripLeadingStep(line));
      continue;
    }

    if (isLikelyIngredient(line)) {
      ingredientLines.push(stripBullet(line));
    } else if (isLikelyInstruction(line)) {
      instructionLines.push(stripLeadingStep(line));
    }
  }

  if (!ingredientLines.length) {
    ingredientLines.push(...lines.filter(isLikelyIngredient).map(stripBullet));
  }

  if (!instructionLines.length) {
    const nonIngredients = lines.filter((l) => !isLikelyIngredient(l));
    instructionLines.push(...nonIngredients.slice(0, 15).map(stripLeadingStep));
  }

  return {
    title,
    sourceUrl,
    servings,
    ingredients: dedupe(ingredientLines).slice(0, 80),
    instructions: dedupe(instructionLines).slice(0, 80),
    categoryId: "",
  };
}

function guessTitleFromMarkdown(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.startsWith("# ")) {
      return line.replace(/^#\s+/, "").trim();
    }
  }
  return lines[0]?.slice(0, 80);
}

function stripBullet(line) {
  return line.replace(/^[-*•]+\s*/, "").trim();
}

function stripLeadingStep(line) {
  return line.replace(/^\d+[.)]\s*/, "").trim();
}

function dedupe(arr) {
  return [...new Set(arr.map((x) => x.trim()).filter(Boolean))];
}

function isLikelyIngredient(line) {
  const l = line.toLowerCase();
  return (
    /^(\d+|\d+\/\d+|\d+\.\d+|one|two|three|half|¼|½|¾)/.test(l) ||
    /\b(tsp|tbsp|cup|cups|oz|ounce|ounces|lb|pound|g|gram|kg|ml|l|pinch|dash)\b/.test(l)
  );
}

function isLikelyInstruction(line) {
  const l = line.toLowerCase();
  return /^(step\s*\d+|\d+[.)]|preheat|mix|stir|bake|cook|saute|whisk|combine|serve|boil|simmer)\b/.test(l);
}

function extractServings(text) {
  const match = text.match(/\b(serves|servings|yield)\s*[:\-]?\s*(\d{1,2})\b/i);
  if (!match) return null;
  const n = Number(match[2]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeServings(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function renderList() {
  const queryText = el.searchInput.value.trim().toLowerCase();

  const items = state.recipes.filter((recipe) => {
    if (!queryText) return true;
    const categoryName = findCategoryName(recipe.categoryId).toLowerCase();
    return (
      recipe.title.toLowerCase().includes(queryText) ||
      recipe.ingredients.join(" ").toLowerCase().includes(queryText) ||
      categoryName.includes(queryText)
    );
  });

  el.recipeList.innerHTML = "";

  if (!state.currentUser) {
    const p = document.createElement("p");
    p.className = "status";
    p.textContent = "Log in to see your recipes.";
    el.recipeList.appendChild(p);
    return;
  }

  if (!items.length) {
    const p = document.createElement("p");
    p.className = "status";
    p.textContent = "No recipes yet.";
    el.recipeList.appendChild(p);
    return;
  }

  for (const recipe of items) {
    const categoryName = findCategoryName(recipe.categoryId);
    const div = document.createElement("div");
    div.className = `recipe-item${recipe.id === state.selectedId ? " active" : ""}`;
    div.innerHTML = `
      <h4>${escapeHtml(recipe.title)}</h4>
      <p>${recipe.ingredients.length} ingredients • ${recipe.instructions.length} steps</p>
      ${categoryName ? `<span class="category-chip">${escapeHtml(categoryName)}</span>` : ""}
    `;

    div.addEventListener("click", () => {
      state.selectedId = recipe.id;
      renderList();
      renderViewer();
    });

    el.recipeList.appendChild(div);
  }
}

function renderCategories() {
  el.categoryList.innerHTML = "";

  if (!state.currentUser) {
    const p = document.createElement("p");
    p.className = "status";
    p.textContent = "Log in to manage categories.";
    el.categoryList.appendChild(p);
    renderCategorySelect();
    return;
  }

  if (!state.categories.length) {
    const p = document.createElement("p");
    p.className = "status";
    p.textContent = "No categories yet.";
    el.categoryList.appendChild(p);
    renderCategorySelect();
    return;
  }

  for (const category of state.categories) {
    const count = state.recipes.filter((recipe) => recipe.categoryId === category.id).length;
    const row = document.createElement("div");
    row.className = "category-item";
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(category.name)}</strong>
        <p class="status">${count} recipe${count === 1 ? "" : "s"}</p>
      </div>
      <button class="danger" data-id="${category.id}" type="button">Delete</button>
    `;

    row.querySelector("button")?.addEventListener("click", () => deleteCategory(category.id));
    el.categoryList.appendChild(row);
  }

  renderCategorySelect();
}

function renderCategorySelect() {
  const selectedRecipe = state.recipes.find((r) => r.id === state.selectedId);
  const current = selectedRecipe?.categoryId || "";

  el.categorySelect.innerHTML = '<option value="">Uncategorized</option>';
  for (const category of state.categories) {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    el.categorySelect.appendChild(option);
  }

  el.categorySelect.value = current;
}

function findCategoryName(categoryId) {
  if (!categoryId) return "";
  return state.categories.find((c) => c.id === categoryId)?.name || "";
}

function renderViewer() {
  const recipe = state.recipes.find((r) => r.id === state.selectedId);
  if (!recipe) {
    el.emptyViewer.classList.remove("hidden");
    el.recipeViewer.classList.add("hidden");
    return;
  }

  el.emptyViewer.classList.add("hidden");
  el.recipeViewer.classList.remove("hidden");

  if (!el.servingsInput.dataset.initialized || el.servingsInput.dataset.recipeId !== recipe.id) {
    el.servingsInput.value = String(recipe.servings || 1);
    el.servingsInput.dataset.initialized = "true";
    el.servingsInput.dataset.recipeId = recipe.id;
    el.unitSelect.value = "original";
  }

  const targetServings = normalizeServings(el.servingsInput.value);
  const unitMode = el.unitSelect.value;
  const ratio = targetServings / normalizeServings(recipe.servings);

  el.recipeTitle.textContent = recipe.title;
  const metaParts = [recipe.sourceUrl ? `Source: ${recipe.sourceUrl}` : "Manual import"];
  metaParts.push(`Base servings: ${recipe.servings}`);
  const categoryName = findCategoryName(recipe.categoryId);
  if (categoryName) metaParts.push(`Category: ${categoryName}`);
  el.recipeMeta.textContent = metaParts.join(" • ");

  renderCategorySelect();

  el.ingredientList.innerHTML = "";
  for (const item of recipe.ingredients) {
    const li = document.createElement("li");
    li.textContent = transformIngredient(item, ratio, unitMode);
    el.ingredientList.appendChild(li);
  }

  el.instructionList.innerHTML = "";
  for (const step of recipe.instructions) {
    const li = document.createElement("li");
    li.textContent = step;
    el.instructionList.appendChild(li);
  }
}

function transformIngredient(line, ratio, unitMode) {
  const parsed = parseIngredientAmount(line);
  if (!parsed) return line;

  let value = parsed.value * ratio;
  let unit = parsed.unit;

  if (unitMode === "metric") {
    const conv = US_TO_METRIC[unit];
    if (conv) {
      value *= conv.factor;
      unit = conv.toUnit;
    }
  } else if (unitMode === "us") {
    const conv = METRIC_TO_US[unit];
    if (conv) {
      value *= conv.factor;
      unit = conv.toUnit;
    }
  }

  const formatted = formatAmount(value);
  const canonicalUnit = pluralizeUnit(unit, value);
  return `${formatted} ${canonicalUnit} ${parsed.rest}`.replace(/\s+/g, " ").trim();
}

function parseIngredientAmount(line) {
  const pattern = /^\s*(\d+(?:\.\d+)?|\d+\/\d+|(?:\d+\s+\d+\/\d+)|¼|½|¾)\s*([A-Za-z.]+)?\s+(.*)$/;
  const match = line.match(pattern);
  if (!match) return null;

  const value = parseAmount(match[1]);
  if (!Number.isFinite(value)) return null;

  const unit = normalizeUnit((match[2] || "").toLowerCase());
  const rest = match[3] || "";

  if (!unit) {
    return {
      value,
      unit: "",
      rest: `${match[2] ? `${match[2]} ` : ""}${rest}`.trim(),
    };
  }

  return { value, unit, rest };
}

function normalizeUnit(unit) {
  if (!unit) return "";
  const cleaned = unit.replace(/[^a-z]/g, "");
  for (const [canonical, aliases] of Object.entries(UNIT_ALIASES)) {
    if (aliases.some((alias) => alias.replace(/[^a-z]/g, "") === cleaned)) {
      return canonical;
    }
  }
  return "";
}

function parseAmount(raw) {
  const normalized = raw.trim();

  if (normalized.includes(" ")) {
    const [a, b] = normalized.split(/\s+/);
    return parseAmount(a) + parseAmount(b);
  }

  if (normalized === "¼") return 0.25;
  if (normalized === "½") return 0.5;
  if (normalized === "¾") return 0.75;

  if (FRACTIONS[normalized]) return FRACTIONS[normalized];

  if (/^\d+\/\d+$/.test(normalized)) {
    const [n, d] = normalized.split("/").map(Number);
    return d ? n / d : NaN;
  }

  return Number(normalized);
}

function formatAmount(value) {
  if (!Number.isFinite(value)) return "";

  const rounded = Math.round(value * 100) / 100;
  const whole = Math.floor(rounded);
  const fractional = rounded - whole;

  const known = Object.entries(FRACTIONS).find(([, val]) => Math.abs(val - fractional) < 0.03);
  if (known) {
    if (whole === 0) return known[0];
    return `${whole} ${known[0]}`;
  }

  return Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded.toFixed(2)).replace(/\.00$/, "").replace(/0$/, "");
}

function pluralizeUnit(unit, amount) {
  if (!unit) return "";

  const singularMap = {
    tsp: "tsp",
    tbsp: "tbsp",
    cup: "cup",
    oz: "oz",
    lb: "lb",
    g: "g",
    kg: "kg",
    ml: "ml",
    l: "l",
  };

  const pluralMap = {
    tsp: "tsp",
    tbsp: "tbsp",
    cup: "cups",
    oz: "oz",
    lb: "lb",
    g: "g",
    kg: "kg",
    ml: "ml",
    l: "l",
  };

  return Math.abs(amount - 1) < 0.01 ? singularMap[unit] : pluralMap[unit];
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
