const DB_NAME = "life-workbench-local";
const DB_VERSION = 1;
const STORE_ENTRIES = "entries";
const STORE_RESUMES = "resumes";
const INSTALL_DISMISSED_KEY = "life-workbench-install-dismissed";
const AI_CONFIG_KEY = "muli-ai-config";

const modules = [
  { id: "daily", icon: "✓", title: "每日拾光印记", desc: "只记录已经完成的事" },
  { id: "inspiration", icon: "✦", title: "细碎灵感备忘录", desc: "快速抓住点子和素材" },
  { id: "metaphysics", icon: "☉", title: "玄学研习档案馆", desc: "学习、案例、塔罗/八字资料" },
  { id: "study", icon: "A", title: "全科精进学习库", desc: "学习时长、掌握情况、复习" },
  { id: "viral", icon: "🔥", title: "爆款内容解构库", desc: "离线模板拆钩子和结构" },
  { id: "resume", icon: "CV", title: "简历修改库", desc: "PDF/Word 解析与岗位定制" },
];

const healingQuotes = [
  ["慢一点也没关系，只要你还在往前走。", "今天先照顾好自己，再去照顾目标。"],
  ["你已经走过的路，不会白走。", "把注意力放回可完成的一小步。"],
  ["稳定不是没有波动，而是波动之后还能回来。", "允许自己重启，也允许自己修正。"],
  ["认真生活的人，会在细节里慢慢变强。", "今天记录一点点完成感。"],
  ["别急着证明自己，先把手里的事做清楚。", "清晰比用力更重要。"],
  ["你不需要一次变得完美，只需要持续靠近想成为的人。", "今天的微小进步也值得被看见。"],
  ["当你愿意整理自己，生活也会慢慢变得有序。", "把混乱写下来，就是改变的开始。"],
];

const growthReadsPool = [
  { type: "科技", title: "少数派", desc: "效率工具、数字生活和工作流。", url: "https://sspai.com/" },
  { type: "商业", title: "哈佛商业评论中文网", desc: "管理、职业成长和商业思考。", url: "https://www.hbrchina.org/" },
  { type: "经济", title: "财新网", desc: "经济、社会和产业报道。", url: "https://www.caixin.com/" },
  { type: "科技", title: "36氪", desc: "创业、科技公司和商业动态。", url: "https://36kr.com/" },
  { type: "知识", title: "科普中国", desc: "科学、健康和公共知识。", url: "https://www.kepuchina.cn/" },
  { type: "文化", title: "澎湃新闻", desc: "文化、社会、书评和思想类内容。", url: "https://www.thepaper.cn/" },
  { type: "英语", title: "BBC Future", desc: "英文科技、心理与未来趋势阅读。", url: "https://www.bbc.com/future" },
  { type: "写作", title: "Aeon Essays", desc: "长文、哲学、心理与人文散文。", url: "https://aeon.co/essays" },
];

const chartColors = ["#7f9b8f", "#c7a27c", "#8b87a8", "#b58da0", "#7895a6", "#b98278", "#9aab89", "#d1b28f"];

let db;
let tarotCards = [];
let baziSeed = null;
let activeLibrary = "tarot";
let deferredInstallPrompt = null;
let lastResumeText = "";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nowText() {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}

function beijingDateKey(offset = 0) {
  const now = new Date(Date.now() + offset * 86400000);
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  window.setTimeout(() => el.classList.remove("show"), 2200);
}

function escapeHTML(text = "") {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const database = req.result;
      if (!database.objectStoreNames.contains(STORE_ENTRIES)) {
        const store = database.createObjectStore(STORE_ENTRIES, { keyPath: "id" });
        store.createIndex("type", "type");
        store.createIndex("date", "date");
        store.createIndex("createdAt", "createdAt");
      }
      if (!database.objectStoreNames.contains(STORE_RESUMES)) {
        const store = database.createObjectStore(STORE_RESUMES, { keyPath: "id" });
        store.createIndex("kind", "kind");
        store.createIndex("createdAt", "createdAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(storeName, mode = "readonly") {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function put(storeName, value) {
  return new Promise((resolve, reject) => {
    const req = tx(storeName, "readwrite").put(value);
    req.onsuccess = () => resolve(value);
    req.onerror = () => reject(req.error);
  });
}

function remove(storeName, id) {
  return new Promise((resolve, reject) => {
    const req = tx(storeName, "readwrite").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function getAll(storeName) {
  return new Promise((resolve, reject) => {
    const req = tx(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function saveEntry(type, title, payload = {}) {
  const entry = {
    id: uid(),
    type,
    title: title || "未命名记录",
    date: payload.date || todayISO(),
    createdAt: Date.now(),
    payload,
  };
  await put(STORE_ENTRIES, entry);
  toast("已保存");
  await renderAll();
  return entry;
}

function formToObject(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  $$("input[type='checkbox']", form).forEach(input => data[input.name] = input.checked);
  return data;
}

function resetForm(form) {
  form.reset();
  const dateInput = $("input[type='date']", form);
  if (dateInput) dateInput.value = todayISO();
}

async function loadStaticData() {
  const [tarot, bazi] = await Promise.all([
    fetch("assets/tarot-card-library.json").then(r => r.json()),
    fetch("assets/bazi-resource-seed.json").then(r => r.json()),
  ]);
  tarotCards = tarot.cards || [];
  baziSeed = bazi;
}

function setupNavigation() {
  const grid = $("#moduleGrid");
  if (grid) {
    grid.innerHTML = modules.map(m => `
      <button class="module-card" data-view="${m.id}" type="button">
        <span class="module-icon">${m.icon}</span>
        <strong>${m.title}</strong>
        <span>${m.desc}</span>
      </button>
    `).join("");
  }

  const side = $("#sideModuleNav");
  if (side) {
    side.innerHTML = [
      { id: "dashboard", icon: "⌂", title: "总览", desc: "今日概览" },
      ...modules,
      { id: "profile", icon: "我", title: "我的", desc: "备份、设备、AI 设置" },
    ].map(m => `
      <button class="side-link ${m.id === "dashboard" ? "active" : ""}" data-view="${m.id}" type="button">
        <span class="module-icon">${m.icon}</span>
        <span class="side-text">${m.title}<small>${m.desc || ""}</small></span>
      </button>
    `).join("");
  }

  document.body.addEventListener("click", event => {
    const btn = event.target.closest("button[data-view]");
    if (!btn) return;
    event.preventDefault();
    switchView(btn.dataset.view, { scrollTop: true });
  });

  $("#sideToggle")?.addEventListener("click", () => {
    $("#sideNav").classList.toggle("collapsed");
    document.body.classList.toggle("sidebar-collapsed");
  });
}

function switchView(viewId, options = {}) {
  $$(".view").forEach(v => v.classList.toggle("active", v.id === viewId));
  $$(".bottom-nav button").forEach(b => b.classList.toggle("active", b.dataset.view === viewId));
  $$(".side-link").forEach(b => b.classList.toggle("active", b.dataset.view === viewId));
  document.body.dataset.view = viewId;
  const title = $(`#${viewId}`)?.dataset.title || "霂黎拾光小记";
  document.title = `${title} · 霂黎拾光小记`;
  if (options.scrollTop) window.scrollTo({ top: 0, behavior: "smooth" });
}

function setupDashboardWidgets() {
  renderDailyHealing();
  renderGrowthReads();
  $("#refreshReadsBtn")?.addEventListener("click", () => renderGrowthReads(Math.floor(Math.random() * 10)));
  updateBeijingClock();
  window.setInterval(updateBeijingClock, 1000);
}

function renderDailyHealing() {
  const key = beijingDateKey();
  const seed = Array.from(key).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const quote = healingQuotes[seed % healingQuotes.length];
  $("#dailyHealingText").textContent = quote[0];
  $("#dailyHealingSub").textContent = quote[1];
}

function renderGrowthReads(extraSeed = 0) {
  const key = beijingDateKey();
  const seed = Array.from(key).reduce((sum, ch) => sum + ch.charCodeAt(0), extraSeed);
  const picks = [0, 1, 2].map(i => growthReadsPool[(seed + i * 2) % growthReadsPool.length]);
  $("#growthReads").innerHTML = picks.map(item => `
    <a class="read-card" href="${item.url}" data-read-url="${item.url}" rel="noopener">
      <span class="tag">${escapeHTML(item.type)}</span>
      <strong>${escapeHTML(item.title)}</strong>
      <span>${escapeHTML(item.desc)}</span>
      <em>点击阅读</em>
    </a>
  `).join("");
  $$(".read-card").forEach(card => {
    card.addEventListener("click", event => {
      event.preventDefault();
      const url = card.dataset.readUrl || card.href;
      if (!url) return;
      window.location.href = url;
    });
  });
}

function updateBeijingClock() {
  const now = new Date();
  $("#beijingClock").textContent = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);
  $("#beijingDate").textContent = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(now);
}

function setupForms() {
  $("#analyticsPeriod")?.addEventListener("change", () => renderAll());

  $("#dailyForm").addEventListener("submit", async e => {
    e.preventDefault();
    const d = formToObject(e.currentTarget);
    await saveEntry("daily", d.title, d);
    resetForm(e.currentTarget);
  });

  $("#inspirationForm").addEventListener("submit", async e => {
    e.preventDefault();
    const d = formToObject(e.currentTarget);
    await saveEntry("inspiration", d.content.slice(0, 28) || "灵感", d);
    resetForm(e.currentTarget);
  });

  $("#metaLearnForm").addEventListener("submit", async e => {
    e.preventDefault();
    const d = formToObject(e.currentTarget);
    await saveEntry("meta-learn", d.topic, d);
    resetForm(e.currentTarget);
  });

  $("#tarotCaseForm").addEventListener("submit", async e => {
    e.preventDefault();
    const d = formToObject(e.currentTarget);
    await saveEntry("tarot-case", d.question, d);
    resetForm(e.currentTarget);
  });

  $("#studyForm").addEventListener("submit", async e => {
    e.preventDefault();
    const d = formToObject(e.currentTarget);
    await saveEntry("study", d.topic, d);
    if (d.syncDaily) {
      await saveEntry("daily", `学习：${d.topic}`, {
        title: `学习：${d.topic}`,
        category: "学习",
        importance: "中",
        result: `完成 ${d.category}「${d.topic}」学习 ${d.minutes || 0} 分钟，掌握情况：${d.mastery || "未填写"}`,
        materials: d.content || "",
        next: "由学习库自动同步",
      });
    }
    resetForm(e.currentTarget);
  });

  $("#chooseStudyPhotoBtn")?.addEventListener("click", () => $("#studyPhotoFile").click());
  $("#studyPhotoFile")?.addEventListener("change", e => {
    const file = e.target.files?.[0];
    $("#studyPhotoFileName").textContent = file ? file.name : "未选择照片";
  });

  $("#studyReviewForm")?.addEventListener("submit", async e => {
    e.preventDefault();
    const d = formToObject(e.currentTarget);
    const file = $("#studyPhotoFile")?.files?.[0];
    if (file) {
      try {
        d.photo = await fileToStoredFile(file);
      } catch (err) {
        console.error(err);
        toast("照片读取失败，已先保存文字复盘");
      }
    }
    await saveEntry("study-review", d.category || "学习复盘", d);
    resetForm(e.currentTarget);
    if ($("#studyPhotoFile")) $("#studyPhotoFile").value = "";
    if ($("#studyPhotoFileName")) $("#studyPhotoFileName").textContent = "未选择照片";
  });

  $("#viralForm").addEventListener("submit", async e => {
    e.preventDefault();
    const d = formToObject(e.currentTarget);
    await saveEntry("viral", d.title, d);
    resetForm(e.currentTarget);
  });

  $("#openViralLinkBtn").addEventListener("click", () => {
    const url = $("#viralUrl").value.trim();
    if (!url) {
      toast("请先粘贴来源链接");
      return;
    }
    window.open(url, "_blank", "noopener");
  });

  $("#fillViralTemplateBtn").addEventListener("click", () => {
    const form = $("#viralForm");
    form.hook.value ||= "先写：开头 3 秒用什么问题、冲突、反差或利益点抓住人？";
    form.structure.value ||= "按顺序写：开头钩子 → 信息/剧情递进 → 情绪峰值 → 评论/转发触发点 → 结尾动作。";
    form.reason.value ||= "从这些角度判断：情绪共鸣、身份认同、信息差、争议点、实用性、视觉/听觉刺激、平台热点。";
    form.formula.value ||= "把它抽象成：当【目标人群】遇到【强痛点/强欲望】时，用【反差开头】展示【解决/爽点】，最后引导【收藏/评论/行动】。";
    toast("已填入拆解提示");
  });

  $("#resumeVersionForm").addEventListener("submit", async e => {
    e.preventDefault();
    const d = formToObject(e.currentTarget);
    await generateResumeVersion(d);
    resetForm(e.currentTarget);
  });

  $("#aiResumeBtn")?.addEventListener("click", async () => {
    const form = $("#resumeVersionForm");
    const d = formToObject(form);
    if (!d.role || !d.jd) {
      toast("请先填写目标岗位和岗位 JD");
      return;
    }
    await generateAiResumeVersion(d);
  });
}

function setupMetaTabs() {
  $$(".seg").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".seg").forEach(b => b.classList.toggle("active", b === btn));
      $$(".meta-pane").forEach(p => p.classList.toggle("active", p.dataset.metaPane === btn.dataset.metaTab));
      if (btn.dataset.metaTab === "library") renderLibrary();
    });
  });

  $$(".lib-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      activeLibrary = btn.dataset.lib;
      $$(".lib-tab").forEach(b => b.classList.toggle("active", b === btn));
      renderLibrary();
    });
  });
  $("#tarotSearch").addEventListener("input", () => renderLibrary());
  $("#addResourceBtn").addEventListener("click", () => {
    activeLibrary = "custom";
    $$(".lib-tab").forEach(b => b.classList.toggle("active", b.dataset.lib === "custom"));
    renderLibrary();
    $("#resourceTitle")?.focus();
  });
  $("#chooseResourceFileBtn").addEventListener("click", () => $("#resourceFile").click());
  $("#resourceFile").addEventListener("change", e => {
    const file = e.target.files?.[0];
    if (!file) return;
    $("#resourceFileName").textContent = file.name;
    if (!$("#resourceTitle").value.trim()) $("#resourceTitle").value = file.name.replace(/\.[^.]+$/, "");
    toast("文件已选择，保存后会进入我的资料库");
  });
  $("#saveResourceBtn").addEventListener("click", addCustomResource);
}

async function addCustomResource() {
  activeLibrary = "custom";
  $$(".lib-tab").forEach(b => b.classList.toggle("active", b.dataset.lib === "custom"));
  const titleEl = $("#resourceTitle");
  const categoryEl = $("#resourceCategory");
  const tagsEl = $("#resourceTags");
  const summaryEl = $("#resourceSummary");
  const file = $("#resourceFile").files?.[0];
  if (!titleEl.value.trim() && !summaryEl.value.trim() && !file) {
    titleEl.focus();
    toast("请先填写或导入一份资料");
    return;
  }
  const title = titleEl.value.trim() || `我的资料｜${todayISO()}`;
  const category = categoryEl.value.trim() || "未分类";
  const tags = tagsEl.value.split(/[,，、\s]+/).map(t => t.trim()).filter(Boolean).slice(0, 20);
  const summary = summaryEl.value.trim();
  let storedFile = null;
  if (file) {
    try {
      storedFile = await fileToStoredFile(file);
    } catch (err) {
      console.error(err);
      toast(err.message || "文件读取失败，请换一个文件试试");
      return;
    }
  }
  await saveEntry("custom-resource", title, { title, category, tags, summary, file: storedFile, fileName: storedFile?.name || "" });
  titleEl.value = "";
  categoryEl.value = "";
  tagsEl.value = "";
  summaryEl.value = "";
  $("#resourceFile").value = "";
  $("#resourceFileName").textContent = "未选择文件";
  toast("资料已保存到我的资料库");
  await renderAll();
  renderLibrary();
}

async function setupResumeTools() {
  $("#chooseResumeFileBtn").addEventListener("click", () => $("#resumeFile").click());
  $("#resumeFile").addEventListener("change", e => {
    const file = e.target.files?.[0];
    $("#resumeFileName").textContent = file ? file.name : "未选择文件";
  });

  $("#parseResumeBtn").addEventListener("click", async () => {
    const file = $("#resumeFile").files?.[0];
    if (!file) {
      $("#resumeFile").click();
      toast("请先选择 PDF、Word 或 TXT 文件");
      return;
    }
    toast("正在解析简历...");
    try {
      const text = await parseResumeFile(file);
      $("#resumeText").value = text;
      await saveRawResume(text, file.name);
      toast("原始简历已解析并保存");
    } catch (err) {
      console.error(err);
      toast("解析失败，可复制文本后手动保存");
    }
  });

  $("#saveRawResumeBtn").addEventListener("click", async () => {
    const text = $("#resumeText").value.trim();
    if (!text) {
      toast("请先粘贴或解析简历文本");
      return;
    }
    await saveRawResume(text, "手动文本");
    toast("原始简历已保存");
  });

  $("#downloadResumeBtn").addEventListener("click", () => {
    if (!lastResumeText) {
      toast("请先选择或生成一个简历版本");
      return;
    }
    downloadText(`定制简历-${todayISO()}.txt`, lastResumeText);
  });
}

async function parseResumeFile(file) {
  const buffer = await file.arrayBuffer();
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    return extractPdfText(buffer);
  }
  if (name.endsWith(".docx")) {
    if (!window.mammoth) throw new Error("Word 解析库未加载");
    const result = await window.mammoth.extractRawText({ arrayBuffer: buffer });
    return (result.value || "").trim();
  }
  if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".json") || file.type.startsWith("text/") || file.type === "application/json") {
    return new TextDecoder("utf-8").decode(buffer).trim();
  }
  throw new Error("当前浏览器端仅稳定支持 PDF、docx 和 txt");
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function fileToStoredFile(file) {
  const maxSize = 12 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new Error("单个文件暂时建议不超过 12MB，请压缩或拆分后再上传");
  }
  return {
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    dataUrl: await readFileAsDataURL(file),
    savedAt: nowText(),
  };
}

function openStoredFile(file) {
  if (!file?.dataUrl) {
    toast("这条记录没有可打开的附件");
    return;
  }
  const a = document.createElement("a");
  a.href = file.dataUrl;
  a.download = file.name || `附件-${todayISO()}`;
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function extractPdfText(buffer) {
  const pdfjs = await import("./vendor/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "./vendor/pdf.worker.min.mjs";
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages = [];
  const maxPages = Math.min(pdf.numPages, 30);
  for (let i = 1; i <= maxPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => item.str).join(" "));
  }
  return pages.join("\n\n").trim();
}

async function saveRawResume(text, fileName) {
  await put(STORE_RESUMES, {
    id: uid(),
    kind: "raw",
    title: `原始简历｜${fileName}`,
    text,
    fileName,
    createdAt: Date.now(),
  });
  await renderAll();
}

async function getLatestRawResume() {
  const all = (await getAll(STORE_RESUMES))
    .filter(r => r.kind === "raw")
    .sort((a, b) => b.createdAt - a.createdAt);
  return all[0];
}

async function selectBestRawResume(keywords) {
  const raws = (await getAll(STORE_RESUMES)).filter(r => r.kind === "raw");
  if (!raws.length) return null;
  return raws
    .map(r => ({ ...r, score: scoreResumeText(r.text || "", keywords) }))
    .sort((a, b) => b.score - a.score || b.createdAt - a.createdAt)[0];
}

function scoreResumeText(text, keywords) {
  return keywords.reduce((sum, k) => sum + (text.includes(k) ? 3 : 0), 0) + Math.min(String(text).length / 1200, 5);
}

function extractKeywords(jd) {
  const stop = new Set(["负责", "岗位", "要求", "工作", "能力", "相关", "优先", "具备", "熟悉", "以及", "进行", "可以", "需要", "以上"]);
  const words = jd
    .replace(/[，。；、,.！!？?（）()【】\[\]\n\r]/g, " ")
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length >= 2 && !stop.has(w));
  const count = new Map();
  words.forEach(w => count.set(w, (count.get(w) || 0) + 1));
  return Array.from(count.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([w]) => w);
}

async function generateResumeVersion(job) {
  const manualText = $("#resumeText").value.trim();
  const keywords = extractKeywords(job.jd);
  const raw = await selectBestRawResume(keywords);
  const sourceText = raw?.text || manualText;
  if (!sourceText) {
    toast("请先保存一份原始简历");
    return;
  }
  const matched = keywords.filter(k => sourceText.includes(k));
  const missing = keywords.filter(k => !sourceText.includes(k));
  const company = job.company ? `｜${job.company}` : "";
  const title = `${job.role}${company}｜${todayISO()}｜v1`;
  const revised = buildFinishedResume({
    title,
    role: job.role,
    company: job.company || "",
    sourceText,
    sourceFile: raw?.fileName || "当前文本框",
    keywords,
    matched,
    missing,
  });

  const item = {
    id: uid(),
    kind: "version",
    title,
    text: revised,
    role: job.role,
    company: job.company || "",
    jd: job.jd,
    sourceFile: raw?.fileName || "当前文本框",
    resumeType: job.resumeType || "岗位定制版",
    applicationStatus: job.applicationStatus || "未投递",
    keywords,
    matched,
    missing,
    status: "可投递",
    createdAt: Date.now(),
  };
  await put(STORE_RESUMES, item);
  lastResumeText = revised;
  toast("已生成成品简历并保存");
  await renderAll();
}

function getAiConfig() {
  try {
    return JSON.parse(localStorage.getItem(AI_CONFIG_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveAiConfig(config) {
  localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
}

function buildResumePrompt({ role, company, jd, sourceText }) {
  return [
    "你是一个严谨的中文简历修改助手。请只基于用户原始简历已有经历改写，绝不虚构工作经历、工作数据、项目内容、公司、证书或技能。",
    "规则：",
    "1. 只能基于原始简历已有经历改写；可以调整顺序、润色表达、突出关键词；不能新增不存在的公司、项目、证书、数据。",
    "2. 提取岗位JD关键词，自然匹配到简历内容里。",
    "3. 工作经历使用STAR法则优化表述，弱化无关经历，把和岗位匹配的内容前置展示。",
    "4. 能力达不到岗位要求时，只能写“正在学习/具备理论基础”，严禁造假夸大。",
    "5. 输出一份完整可投递的中文简历文本，并在末尾列出“未能匹配但不可虚构的岗位要求”。",
    "",
    `目标岗位：${role}`,
    `目标公司：${company || "未填写"}`,
    "",
    "岗位JD：",
    jd,
    "",
    "原始简历：",
    sourceText,
  ].join("\n");
}

async function callAiForResume({ role, company, jd, sourceText }) {
  const config = getAiConfig();
  if (!config.endpoint || !config.model || !config.key) {
    throw new Error("请先在“我的”页面填写 AI 接口地址、模型名称和 API Key");
  }
  let response;
  try {
    response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.key}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: "你只做真实简历改写，不能虚构经历、数据、项目或技能。" },
          { role: "user", content: buildResumePrompt({ role, company, jd, sourceText }) },
        ],
        temperature: 0.2,
      }),
    });
  } catch (err) {
    throw new Error("AI 请求没有发出去：可能是浏览器跨域限制、网络异常，或接口地址无法访问。若 Key 正确但仍失败，可能需要本地代理服务。");
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(explainAiError(response.status, detail));
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

function explainAiError(status, detail = "") {
  const short = detail.slice(0, 220);
  const map = {
    400: "请求格式不被接口接受，请检查接口地址是否为 chat/completions、模型名是否正确。",
    401: "API Key 无效或没有权限，请检查 Key 是否复制完整、是否启用。",
    402: "账户余额或额度不足，请到 DeepSeek 后台查看额度。",
    403: "接口拒绝访问，可能是权限、地区、来源或账号状态限制。",
    404: "接口地址或模型名不存在，请检查是否使用 https://api.deepseek.com/v1/chat/completions 和 deepseek-chat。",
    429: "请求过于频繁或额度被限流，稍后再试。",
  };
  return `AI 接口调用失败：${status}。${map[status] || "请检查接口地址、模型名、Key 和账户状态。"}${short ? `\n接口返回：${short}` : ""}`;
}

async function generateAiResumeVersion(job) {
  const manualText = $("#resumeText").value.trim();
  const keywords = extractKeywords(job.jd);
  const raw = await selectBestRawResume(keywords);
  const sourceText = raw?.text || manualText;
  if (!sourceText) {
    toast("请先保存一份原始简历");
    return;
  }
  toast("正在尝试调用 AI...");
  try {
    const company = job.company || "";
    const aiText = await callAiForResume({ role: job.role, company, jd: job.jd, sourceText });
    if (!aiText) throw new Error("AI 没有返回内容");
    const title = `${job.role}${company ? `｜${company}` : ""}｜AI修改｜${todayISO()}`;
    const item = {
      id: uid(),
      kind: "version",
      title,
      text: aiText,
      role: job.role,
      company,
      jd: job.jd,
      sourceFile: raw?.fileName || "当前文本框",
      resumeType: "AI 修改版",
      applicationStatus: job.applicationStatus || "未投递",
      keywords,
      matched: keywords.filter(k => sourceText.includes(k)),
      missing: keywords.filter(k => !sourceText.includes(k)),
      status: job.applicationStatus || "未投递",
      createdAt: Date.now(),
    };
    await put(STORE_RESUMES, item);
    lastResumeText = aiText;
    $("#resumeText").value = aiText;
    toast("AI 简历已生成并保存");
    await renderAll();
  } catch (err) {
    console.error(err);
    toast(err.message.includes("Failed to fetch") ? "AI 调用失败，可能是跨域或 Key 不可用" : err.message);
  }
}

function normalizeResumeLine(line) {
  return line
    .replace(/^负责[:：]?\s*/, "承担")
    .replace(/^参与[:：]?\s*/, "参与并推进")
    .replace(/^协助[:：]?\s*/, "协助完成")
    .replace(/进行/g, "")
    .replace(/负责负责/g, "负责")
    .trim();
}

function splitResumeLines(text) {
  return String(text || "")
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean);
}

function lineScore(line, keywords) {
  return keywords.reduce((sum, k) => sum + (line.includes(k) ? 2 : 0), 0) + (/[0-9%％]/.test(line) ? 1 : 0);
}

function buildFinishedResume({ title, role, company, sourceText, sourceFile, keywords, matched, missing }) {
  const lines = splitResumeLines(sourceText);
  const headerLines = lines.filter(line => line.length <= 28 && /姓名|电话|邮箱|微信|求职|意向|教育|学历|大学|专业/.test(line)).slice(0, 10);
  const contentLines = lines.filter(line => !headerLines.includes(line));
  const scored = contentLines
    .map((line, index) => ({ line: normalizeResumeLine(line), index, score: lineScore(line, keywords) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const priority = scored.filter(item => item.score > 0).slice(0, 12);
  const rest = scored.filter(item => item.score <= 0).sort((a, b) => a.index - b.index).slice(0, 28);
  const companyText = company ? `｜${company}` : "";
  const summary = matched.length
    ? `基于原始简历中已出现的「${matched.slice(0, 8).join("、")}」等经历表达，优先呈现与${role}相关的能力。`
    : `基于原始简历内容重排经历顺序，保持经历真实性，并尽量贴近${role}岗位表达。`;
  return [
    title,
    "",
    "【求职目标】",
    `${role}${companyText}`,
    "",
    "【个人信息 / 基础信息】",
    headerLines.length ? headerLines.join("\n") : "请在此处保留姓名、电话、邮箱等个人信息。",
    "",
    "【岗位匹配摘要】",
    summary,
    `本次自动选用原始简历：${sourceFile}`,
    "",
    "【核心匹配经历】",
    priority.length ? priority.map(item => `- ${item.line}`).join("\n") : "原始简历中暂无明显命中岗位关键词的经历，以下正文仍按原始内容保留。",
    "",
    "【完整经历整理】",
    [...priority.slice(0, 6), ...rest].map(item => `- ${item.line}`).join("\n"),
    "",
    "【保留但建议人工确认】",
    missing.length ? `岗位 JD 中提到但原简历未明显出现：${missing.join("、")}。如确有真实经历，可手动补充具体项目、成果或数据；如没有，不建议硬加。` : "岗位关键词在原简历中已有较多对应表达，投递前可再检查时间、公司名、项目数据是否准确。",
  ].join("\n");
}

async function renderAll() {
  const [entries, resumes] = await Promise.all([getAll(STORE_ENTRIES), getAll(STORE_RESUMES)]);
  const sorted = entries.sort((a, b) => b.createdAt - a.createdAt);
  renderStats(sorted, resumes);
  renderEntries(sorted);
  renderDailyAnalytics(sorted);
  renderResumes(resumes.sort((a, b) => b.createdAt - a.createdAt));
  renderLibrary();
}

function renderStats(entries, resumes) {
  $("#todayText").textContent = new Date().toLocaleDateString("zh-CN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  $("#statToday").textContent = entries.filter(e => e.date === todayISO()).length;
  const studyMinutes = entries
    .filter(e => e.type === "study" && e.date === todayISO())
    .reduce((sum, e) => sum + Number(e.payload.minutes || 0), 0);
  $("#statStudy").textContent = `${(studyMinutes / 60).toFixed(1)}h`;
  $("#statResume").textContent = resumes.filter(r => r.kind === "version").length;
}

function getPeriodRange(period) {
  const now = new Date();
  const start = new Date(now);
  if (period === "day") {
    start.setHours(0, 0, 0, 0);
  } else if (period === "week") {
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
    start.setHours(0, 0, 0, 0);
  } else if (period === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
  }
  return start;
}

function minutesFromEntry(entry) {
  const p = entry.payload || {};
  if (p.minutes) return Number(p.minutes) || 0;
  if (p.startTime && p.endTime) {
    const [sh, sm] = p.startTime.split(":").map(Number);
    const [eh, em] = p.endTime.split(":").map(Number);
    const diff = (eh * 60 + em) - (sh * 60 + sm);
    return diff > 0 ? diff : 0;
  }
  return 0;
}

function renderDailyAnalytics(entries) {
  const barEl = $("#categoryBarChart");
  const pieEl = $("#timePieChart");
  const insightEl = $("#dailyInsight");
  if (!barEl || !pieEl || !insightEl) return;
  const period = $("#analyticsPeriod")?.value || "day";
  const start = getPeriodRange(period);
  const dailyEntries = entries.filter(e => e.type === "daily" && new Date(e.createdAt || e.date) >= start);
  const grouped = new Map();
  dailyEntries.forEach(entry => {
    const category = entry.payload?.category || "其他";
    const minutes = minutesFromEntry(entry) || 30;
    const prev = grouped.get(category) || { count: 0, minutes: 0, titles: [] };
    prev.count += 1;
    prev.minutes += minutes;
    prev.titles.push(entry.title);
    grouped.set(category, prev);
  });
  const rows = Array.from(grouped.entries()).sort((a, b) => b[1].minutes - a[1].minutes || b[1].count - a[1].count);
  if (!rows.length) {
    barEl.innerHTML = `<div class="record-list empty">暂无可统计的成就记录</div>`;
    pieEl.innerHTML = `<div class="record-list empty">暂无数据</div>`;
    insightEl.textContent = "保存每日成就后，这里会自动汇总你的行为分布、时间投入和核心完成事项。";
    return;
  }
  const max = Math.max(...rows.map(([, v]) => v.minutes));
  const totalMinutes = rows.reduce((sum, [, v]) => sum + v.minutes, 0);
  barEl.innerHTML = rows.map(([name, v]) => `
    <div class="bar-row">
      <span>${escapeHTML(name)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${Math.max(8, v.minutes / max * 100)}%"></span></span>
      <strong>${v.minutes}分</strong>
    </div>
  `).join("");
  let acc = 0;
  const segments = rows.map(([, v], idx) => {
    const startDeg = acc;
    const endDeg = acc + (v.minutes / totalMinutes) * 360;
    acc = endDeg;
    return `${chartColors[idx % chartColors.length]} ${startDeg}deg ${endDeg}deg`;
  });
  pieEl.innerHTML = `
    <div>
      <div class="pie-disc" style="background: conic-gradient(${segments.join(",")})"></div>
      <div class="legend-list">
        ${rows.map(([name, v], idx) => `<span><i class="legend-dot" style="background:${chartColors[idx % chartColors.length]}"></i>${escapeHTML(name)} ${Math.round(v.minutes / totalMinutes * 100)}%</span>`).join("")}
      </div>
    </div>
  `;
  const top = rows[0];
  const periodText = { day: "今日", week: "本周", month: "本月", year: "今年" }[period];
  const core = dailyEntries.slice(0, 5).map(e => `· ${e.title}`).join("\n");
  insightEl.textContent = `${periodText}共记录 ${dailyEntries.length} 项完成事项，估算投入 ${(totalMinutes / 60).toFixed(1)} 小时。\n投入最多的是「${top[0]}」，约 ${top[1].minutes} 分钟，占 ${Math.round(top[1].minutes / totalMinutes * 100)}%。\n核心完成事项：\n${core}`;
}

function renderEntries(entries) {
  const recent = entries.slice(0, 8);
  $("#recentList").innerHTML = recent.length ? recent.map(recordHTML).join("") : "暂无记录";
  $("#recentList").classList.toggle("empty", !recent.length);
  renderTypeList("dailyList", entries, ["daily"]);
  renderTypeList("inspirationList", entries, ["inspiration"]);
  renderTypeList("metaList", entries, ["meta-learn", "tarot-case", "custom-resource"]);
  renderTypeList("studyList", entries, ["study", "study-review"]);
  renderTypeList("viralList", entries, ["viral"]);
  $$(".delete-entry").forEach(btn => btn.addEventListener("click", async () => {
    await remove(STORE_ENTRIES, btn.dataset.id);
    toast("已删除");
    await renderAll();
  }));
  $$(".open-entry-file").forEach(btn => btn.addEventListener("click", async () => {
    const all = await getAll(STORE_ENTRIES);
    const item = all.find(e => e.id === btn.dataset.id);
    const file = item?.payload?.file || item?.payload?.photo;
    openStoredFile(file);
  }));
}

function renderTypeList(elId, entries, types) {
  const list = entries.filter(e => types.includes(e.type)).slice(0, 30);
  const el = $(`#${elId}`);
  if (!el) return;
  el.innerHTML = list.length ? list.map(recordHTML).join("") : `<div class="record-list empty">暂无记录</div>`;
}

function recordHTML(entry) {
  const p = entry.payload || {};
  const typeMap = {
    daily: "拾光", inspiration: "灵感", "meta-learn": "玄学学习", "tarot-case": "塔罗案例",
    study: "学习", "study-review": "学习复盘", viral: "爆款拆解", "custom-resource": "我的资料",
  };
  const tags = [
    typeMap[entry.type] || entry.type,
    p.category,
    p.kind,
    p.status,
    entry.date,
    ...(p.tags || []),
  ].filter(Boolean);
  const file = p.file || p.photo;
  return `
    <article class="record compact-record">
      <details>
        <summary>
          <strong>${escapeHTML(entry.title)}</strong>
          <span>${new Date(entry.createdAt || Date.now()).toLocaleString("zh-CN", { hour12: false })}</span>
        </summary>
        <div class="record-detail">
          ${file?.type?.startsWith("image/") ? `<img class="note-photo" src="${file.dataUrl}" alt="${escapeHTML(file.name || "笔记照片")}">` : ""}
          ${recordDetailsHTML(p)}
        </div>
      </details>
      <div class="record-meta">
        ${tags.slice(0, 8).map(tag => `<span class="tag">${escapeHTML(tag)}</span>`).join("")}
        ${file ? `<button class="text-btn open-entry-file" data-id="${entry.id}" type="button">打开附件</button>` : ""}
        <button class="text-btn delete-entry" data-id="${entry.id}" type="button">删除</button>
      </div>
    </article>
  `;
}

function recordDetailsHTML(payload = {}) {
  const hiddenKeys = new Set(["file", "photo", "dataUrl"]);
  const labels = {
    title: "标题", category: "分类", tags: "标签", result: "完成成果", materials: "物料工具", next: "下一步",
    content: "内容", question: "疑问", background: "背景", caseType: "案例类型", spread: "方法",
    cards: "关键要素", reading: "解读", review: "复盘", minutes: "时长", mastery: "掌握情况",
    score: "效率自评", understanding: "今日理解", blockers: "卡点/错题", source: "资料来源",
    summary: "备注/总结", fileName: "文件名", url: "链接", platform: "平台", hook: "开头钩子",
    structure: "结构拆解", reason: "爆火原因", formula: "复用公式",
  };
  const rows = Object.entries(payload)
    .filter(([key, value]) => !hiddenKeys.has(key) && value !== undefined && value !== null && value !== "")
    .map(([key, value]) => {
      const text = Array.isArray(value) ? value.join("、") : String(value);
      return `<dt>${escapeHTML(labels[key] || key)}</dt><dd>${escapeHTML(text)}</dd>`;
    })
    .join("");
  return rows ? `<dl class="detail-dl">${rows}</dl>` : `<p class="muted small">暂无详情</p>`;
}

function renderLibrary() {
  const el = $("#libraryList");
  if (!el) return;
  if (activeLibrary === "tarot") {
    const q = ($("#tarotSearch").value || "").trim().toLowerCase();
    const filtered = tarotCards.filter(card => {
      const hay = [
        card.name_zh, card.name_en, card.arcana, card.suit, card.astrology, card.element,
        ...(card.keywords || []),
        card.upright, card.reversed,
      ].join(" ").toLowerCase();
      return !q || hay.includes(q);
    });
    el.innerHTML = filtered.slice(0, 78).map(card => `
      <details class="library-card">
        <summary>${escapeHTML(card.name_zh)} <span class="tag">${escapeHTML(card.arcana)}</span></summary>
        <dl>
          <dt>关键词</dt><dd>${escapeHTML((card.keywords || []).join("、"))}</dd>
          <dt>正位</dt><dd>${escapeHTML(card.upright || "")}</dd>
          <dt>逆位</dt><dd>${escapeHTML(card.reversed || "")}</dd>
          <dt>占星</dt><dd>${escapeHTML(card.astrology || "")}</dd>
          <dt>元素</dt><dd>${escapeHTML(card.element || "")}</dd>
          <dt>卡巴拉</dt><dd>${escapeHTML(Object.values(card.kabbalah || {}).join("；"))}</dd>
        </dl>
      </details>
    `).join("");
  } else {
    getAll(STORE_ENTRIES).then(entries => {
      const q = ($("#tarotSearch").value || "").trim().toLowerCase();
      const custom = entries
        .filter(e => e.type === "custom-resource")
        .filter(e => {
          const hay = [e.title, e.payload?.category, e.payload?.summary, e.payload?.fileName, ...(e.payload?.tags || [])].join(" ").toLowerCase();
          return !q || hay.includes(q);
        })
        .sort((a, b) => b.createdAt - a.createdAt);
      el.innerHTML = custom.length ? custom.map(e => `
        <details class="library-card">
          <summary>${escapeHTML(e.title)} <span class="tag">${escapeHTML(e.payload.category || "未分类")}</span></summary>
          <dl>
            ${e.payload.fileName ? `<dt>文件</dt><dd>${escapeHTML(e.payload.fileName)}</dd>` : ""}
            ${e.payload.tags?.length ? `<dt>标签</dt><dd>${escapeHTML(e.payload.tags.join("、"))}</dd>` : ""}
            <dt>备注</dt><dd>${escapeHTML(e.payload.summary || "未填写备注")}</dd>
          </dl>
          <div class="record-meta">
            ${e.payload.file ? `<button class="text-btn open-entry-file" data-id="${e.id}" type="button">打开附件</button>` : ""}
            <button class="text-btn edit-resource" data-id="${e.id}" type="button">编辑</button>
            <button class="text-btn delete-entry" data-id="${e.id}" type="button">删除</button>
          </div>
        </details>
      `).join("") : `<div class="record-list empty">暂无自定义资料，点击“新增资料”添加。</div>`;
      $$(".edit-resource", el).forEach(btn => btn.addEventListener("click", async () => {
        const all = await getAll(STORE_ENTRIES);
        const item = all.find(e => e.id === btn.dataset.id);
        if (!item) return;
        $("#resourceTitle").value = item.payload.name || item.title || "";
        $("#resourceCategory").value = item.payload.category || "其他";
        $("#resourceTags").value = (item.payload.tags || []).join("，");
        $("#resourceSummary").value = item.payload.summary || "";
        await remove(STORE_ENTRIES, item.id);
        toast("已载入编辑区，修改后重新保存");
        await renderAll();
      }));
      $$(".open-entry-file", el).forEach(btn => btn.addEventListener("click", async () => {
        const all = await getAll(STORE_ENTRIES);
        const item = all.find(e => e.id === btn.dataset.id);
        openStoredFile(item?.payload?.file);
      }));
      $$(".delete-entry", el).forEach(btn => btn.addEventListener("click", async () => {
        await remove(STORE_ENTRIES, btn.dataset.id);
        toast("已删除");
        await renderAll();
      }));
    });
  }
}

function renderResumes(resumes) {
  const el = $("#resumeList");
  const kindFilter = $("#resumeKindFilter")?.value || "all";
  const statusFilter = $("#resumeStatusFilter")?.value || "all";
  const list = resumes
    .filter(r => kindFilter === "all" || r.kind === kindFilter)
    .filter(r => statusFilter === "all" || (r.applicationStatus || r.status || "未投递") === statusFilter)
    .slice(0, 50);
  el.innerHTML = list.length ? list.map(r => `
    <article class="record">
      <h3>${escapeHTML(r.title)}</h3>
      <p>${escapeHTML((r.text || "").slice(0, 260))}</p>
      <div class="record-meta">
        <span class="tag">${escapeHTML(r.kind === "raw" ? "原始版" : r.resumeType || "岗位/AI版本")}</span>
        ${r.role ? `<span class="tag">${escapeHTML(r.role)}</span>` : ""}
        ${r.company ? `<span class="tag">${escapeHTML(r.company)}</span>` : ""}
        <span class="tag">${escapeHTML(r.applicationStatus || r.status || "未投递")}</span>
        <span class="tag">${new Date(r.createdAt).toLocaleDateString("zh-CN")}</span>
        <button class="text-btn use-resume" data-id="${r.id}" type="button">查看/下载</button>
        <button class="text-btn delete-resume" data-id="${r.id}" type="button">删除</button>
      </div>
    </article>
  `).join("") : `<div class="record-list empty">暂无简历</div>`;
  $$(".use-resume").forEach(btn => btn.addEventListener("click", async () => {
    const all = await getAll(STORE_RESUMES);
    const item = all.find(r => r.id === btn.dataset.id);
    if (!item) return;
    lastResumeText = item.text || "";
    $("#resumeText").value = lastResumeText;
    toast("已载入到文本框，可下载或继续生成版本");
  }));
  $$(".delete-resume").forEach(btn => btn.addEventListener("click", async () => {
    await remove(STORE_RESUMES, btn.dataset.id);
    toast("已删除简历记录");
    await renderAll();
  }));
}

function setupBackup() {
  const exportBackup = async () => {
    const data = {
      exportedAt: nowText(),
      entries: await getAll(STORE_ENTRIES),
      resumes: await getAll(STORE_RESUMES),
    };
    downloadText(`霂黎拾光小记备份-${todayISO()}.json`, JSON.stringify(data, null, 2));
  };
  const importBackup = async file => {
    if (!file) return;
    const data = JSON.parse(await file.text());
    for (const entry of data.entries || []) await put(STORE_ENTRIES, entry);
    for (const resume of data.resumes || []) await put(STORE_RESUMES, resume);
    toast("备份已导入");
    await renderAll();
  };
  $("#exportBtn").addEventListener("click", exportBackup);
  $("#importBtn").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", e => importBackup(e.target.files?.[0]));
  $("#myExportBtn")?.addEventListener("click", exportBackup);
  $("#myImportBtn")?.addEventListener("click", () => $("#myImportFile").click());
  $("#myImportFile")?.addEventListener("change", e => importBackup(e.target.files?.[0]));
  $("#resumeKindFilter")?.addEventListener("change", () => renderAll());
  $("#resumeStatusFilter")?.addEventListener("change", () => renderAll());
}

function setupMemoryToggles() {
  $$(".toggle-memory").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = $(`#${btn.dataset.target}`);
      if (!target) return;
      const willOpen = target.hidden;
      target.hidden = !willOpen;
      btn.textContent = willOpen ? "收起" : "展开";
    });
  });
}

function setupProfile() {
  const config = getAiConfig();
  if ($("#aiEndpoint")) $("#aiEndpoint").value = config.endpoint || "https://api.deepseek.com/v1/chat/completions";
  if ($("#aiModel")) $("#aiModel").value = config.model || "deepseek-chat";
  if ($("#aiKey")) $("#aiKey").value = config.key || "";
  updateAiStatus();

  $("#saveAiConfigBtn")?.addEventListener("click", () => {
    saveAiConfig({
      endpoint: $("#aiEndpoint").value.trim(),
      model: $("#aiModel").value.trim(),
      key: $("#aiKey").value.trim(),
    });
    updateAiStatus("AI 设置已保存在本机浏览器");
  });

  $("#testAiConfigBtn")?.addEventListener("click", async () => {
    saveAiConfig({
      endpoint: $("#aiEndpoint").value.trim(),
      model: $("#aiModel").value.trim(),
      key: $("#aiKey").value.trim(),
    });
    updateAiStatus("正在测试 AI 连接...");
    try {
      await callAiForResume({
        role: "测试岗位",
        company: "",
        jd: "需要内容整理能力",
        sourceText: "本人有内容整理和资料归档经验。",
      });
      updateAiStatus("AI 连接测试成功，可以在简历模块试用 AI 改写。");
    } catch (err) {
      console.error(err);
      updateAiStatus(`测试失败：${err.message}`);
    }
  });
}

function updateAiStatus(message) {
  const el = $("#aiStatus");
  if (!el) return;
  const config = getAiConfig();
  el.textContent = message || (config.endpoint && config.model && config.key
    ? `已配置模型：${config.model}。如果接口支持浏览器调用，就可以试用 AI 简历改写。`
    : "未配置 AI。未配置时，简历模块会使用本地整理版。");
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function setupInstallPrompt() {
  const hint = $("#installHint");
  const installText = $("#installText");
  const installBtn = $("#installBtn");
  const installClose = $("#installClose");
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;

  if (!hint || !installText || !installBtn || !installClose || isStandalone || localStorage.getItem(INSTALL_DISMISSED_KEY) === "1") {
    if (hint) hint.hidden = true;
    return;
  }

  installBtn.disabled = false;
  installBtn.textContent = "知道了";
  installText.textContent = "如需添加到手机桌面，请用浏览器菜单里的“添加到主屏幕”。";

  const showHint = () => {
    if (localStorage.getItem(INSTALL_DISMISSED_KEY) !== "1") hint.hidden = false;
  };

  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferredInstallPrompt = e;
    installBtn.disabled = false;
    installBtn.textContent = "安装";
    installText.textContent = "可添加到安卓手机桌面，像 APP 一样独立打开";
    showHint();
  });

  installBtn.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
      hint.hidden = true;
      toast("请点浏览器菜单，选择“添加到主屏幕”");
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    hint.hidden = true;
  });

  installClose.addEventListener("click", () => {
    localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
    hint.hidden = true;
  });

  window.addEventListener("appinstalled", () => {
    localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
    deferredInstallPrompt = null;
    hint.hidden = true;
  });

  window.setTimeout(() => {
    if (!deferredInstallPrompt) showHint();
  }, 1200);
}

async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("sw.js");
    } catch (err) {
      console.warn("Service Worker 注册失败", err);
    }
  }
}

async function init() {
  db = await openDB();
  await loadStaticData();
  setupNavigation();
  setupDashboardWidgets();
  setupForms();
  setupMetaTabs();
  await setupResumeTools();
  setupBackup();
  setupMemoryToggles();
  setupProfile();
  setupInstallPrompt();
  resetForm($("#tarotCaseForm"));
  await registerServiceWorker();
  await renderAll();
}

init().catch(err => {
  console.error(err);
  toast("应用初始化失败，请刷新重试");
});
