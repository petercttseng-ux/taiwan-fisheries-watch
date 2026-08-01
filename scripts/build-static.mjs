import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const artifact = JSON.parse(fs.readFileSync(path.join(root, "app", "artifact-data.json"), "utf8"));
const css = fs.readFileSync(path.join(root, "app", "globals.css"), "utf8").replace(/^@import[^\n]*\n/, "");
const datasets = artifact.snapshot.datasets;
const kpis = datasets.kpis[0];
const news = [...datasets.news_items].sort((a, b) => a.hours_ago - b.hours_ago);
const sentiments = datasets.sentiment_summary;
const topics = [...datasets.topic_summary].sort((a, b) => b.count - a.count);
const topicMax = Math.max(...topics.map((item) => item.count));
const topAlert = news.find((item) => item.priority === "高" && item.hours_ago === 0) ?? news[0];

const esc = (value) => String(value ?? "").replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);
const relativeTime = (hours) => hours === 0 ? "1 小時內" : `${hours} 小時前`;
const sentimentClass = { 正向: "positive", 中性: "neutral", 負向: "negative" };
const priorityClass = { 高: "high", 中: "medium", 低: "low" };

const sentimentRows = sentiments.map((item) => `<div><span class="legend-dot ${sentimentClass[item.sentiment]}"></span><p>${esc(item.sentiment)}<small>${item.count} 則</small></p><strong>${item.share_pct}%</strong></div>`).join("");
const topicRows = topics.map((item, index) => `<div class="topic-row"><span class="topic-rank">${String(index + 1).padStart(2, "0")}</span><span class="topic-name">${esc(item.topic)}</span><div class="bar-track"><i style="width:${(item.count / topicMax) * 100}%"></i></div><strong>${item.count}</strong></div>`).join("");
const topicOptions = topics.map((item) => `<option>${esc(item.topic)}</option>`).join("");
const newsCards = news.map((item) => {
  const searchable = [item.title, item.source, item.topic, item.short_response].join(" ").toLocaleLowerCase("zh-Hant");
  return `<article class="news-card" data-sentiment="${esc(item.sentiment)}" data-priority="${esc(item.priority)}" data-topic="${esc(item.topic)}" data-search="${esc(searchable)}">
    <div class="news-card-side"><span class="priority-rail ${priorityClass[item.priority]}"></span><div><span class="cluster-label">${esc(item.cluster_id.toUpperCase())}</span><strong>${relativeTime(item.hours_ago)}</strong></div></div>
    <div class="news-card-body">
      <div class="badge-row"><span class="badge sentiment-${sentimentClass[item.sentiment]}">${esc(item.sentiment)}</span><span class="badge priority-${priorityClass[item.priority]}">${esc(item.priority)}優先</span><span class="badge topic-badge">${esc(item.topic)}</span></div>
      <p class="news-source">${esc(item.source)}</p><h3><a href="${esc(item.url)}" target="_blank" rel="noreferrer">${esc(item.title)}</a></h3>
      <div class="response-short"><span>水試所簡要回應</span><p>${esc(item.short_response)}</p></div>
      <details><summary>展開詳細回應 <span aria-hidden="true">＋</span></summary><div class="detail-response"><p>${esc(item.detailed_response)}</p><p class="authority-note">正式對外發布前，應由權責單位完成事實查核與核定。</p></div></details>
    </div><a class="source-link" href="${esc(item.url)}" target="_blank" rel="noreferrer" aria-label="開啟原始報導">↗</a>
  </article>`;
}).join("");

const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="最近24小時水產新聞、漁業政策與公開輿情監測"><title>水產新聞與輿情監測儀表板</title><style>${css}</style></head><body><main>
<header class="site-header"><a class="brand" href="#top" aria-label="回到頁首"><span class="brand-mark">水</span><span>水產科技情報站</span></a><div class="header-meta"><span class="status-dot"></span>已驗證快照<span class="meta-divider"></span>10 分鐘更新</div></header>
<section class="hero" id="top"><div class="hero-copy"><p class="eyebrow">FISHERIES INTELLIGENCE · TAIWAN</p><h1>水產新聞與<br><span>輿情監測儀表板</span></h1><p class="hero-description">彙整最近 24 小時水產、漁業、養殖、食安、資源保育與國際治理動態，並以水產試驗所科研及技術推廣立場提供回應建議。</p><div class="freshness"><span>最後監測</span><strong>2026 / 08 / 01　10:34</strong><span>Asia / Taipei</span></div></div>
<aside class="signal-card"><div class="signal-topline"><span class="live-pill"><i></i>最新高優先</span><span>${relativeTime(topAlert.hours_ago)}</span></div><p class="signal-source">${esc(topAlert.source)} · ${esc(topAlert.topic)}</p><h2>${esc(topAlert.title)}</h2><p>${esc(topAlert.short_response)}</p><a href="${esc(topAlert.url)}" target="_blank" rel="noreferrer">查看原始報導 ↗</a><div class="signal-grid"><span></span><span></span><span></span><span></span><span></span><span></span></div></aside></section>
<section class="metric-grid"><article class="metric-card"><div class="metric-icon">◎</div><div><span>有效新聞</span><strong>${kpis.mentions}</strong><small>最近 24 小時</small></div></article><article class="metric-card"><div class="metric-icon">◫</div><div><span>事件群組</span><strong>${kpis.clusters}</strong><small>重複報導已歸群</small></div></article><article class="metric-card"><div class="metric-icon">⌁</div><div><span>治理與保育</span><strong>${kpis.governance}</strong><small>需政策溝通</small></div></article><article class="metric-card risk-card"><div class="metric-icon">!</div><div><span>負向訊號</span><strong>${kpis.negative}</strong><small>需持續追蹤</small></div></article></section>
<section class="analytics-grid"><article class="panel sentiment-panel"><div class="panel-heading"><div><p class="section-kicker">SENTIMENT</p><h2>新聞情緒分布</h2></div><span>共 ${kpis.mentions} 則</span></div><div class="sentiment-content"><div class="donut" role="img" aria-label="新聞情緒比例"><div><strong>${kpis.mentions}</strong><span>則新聞</span></div></div><div class="legend">${sentimentRows}</div></div></article><article class="panel topic-panel"><div class="panel-heading"><div><p class="section-kicker">TOPICS</p><h2>議題分布</h2></div><span>${topics.length} 類議題</span></div><div class="topic-bars">${topicRows}</div></article></section>
<section class="news-section" id="news"><div class="section-title-row"><div><p class="section-kicker">MONITORING FEED</p><h2>新聞與建議回應</h2></div><p>顯示 <strong id="result-count">${news.length}</strong> / ${news.length} 則</p></div>
<div class="filters"><label class="search-field"><span>⌕</span><input id="query" placeholder="搜尋標題、來源、議題或回應…"></label><label><span>情緒</span><select id="sentiment"><option>全部</option><option>正向</option><option>中性</option><option>負向</option></select></label><label><span>優先級</span><select id="priority"><option>全部</option><option>高</option><option>中</option><option>低</option></select></label><label class="topic-filter"><span>議題</span><select id="topic"><option>全部</option>${topicOptions}</select></label><button type="button" id="reset">重設</button></div>
<div class="news-list" id="news-list">${newsCards}</div><div class="empty-state" id="empty" hidden><strong>沒有符合條件的新聞</strong><p>請調整篩選條件或清除搜尋字詞。</p><button id="empty-reset">清除篩選</button></div></section>
<section class="notice-panel"><div class="notice-symbol">i</div><div><h2>判讀與使用注意</h2><p>情緒標記反映事件與標題語氣，不代表水試所對媒體或當事人的評價。同一事件以 cluster_id 歸群；涉及執法、裁罰、食安認定或個案責任時，尊重權責機關調查。</p></div></section>
<footer><div class="brand footer-brand"><span class="brand-mark">水</span><span>水產科技情報站</span></div><p>資料來源：Google 新聞及公開媒體 · 監測快照 2026/08/01 10:34</p><p>水產試驗所科研及技術應用推廣立場</p></footer></main>
<script>const q=document.querySelector('#query'),s=document.querySelector('#sentiment'),p=document.querySelector('#priority'),t=document.querySelector('#topic'),cards=[...document.querySelectorAll('.news-card')],count=document.querySelector('#result-count'),empty=document.querySelector('#empty');function apply(){const needle=q.value.trim().toLocaleLowerCase('zh-Hant');let shown=0;cards.forEach(c=>{const ok=(!needle||c.dataset.search.includes(needle))&&(s.value==='全部'||c.dataset.sentiment===s.value)&&(p.value==='全部'||c.dataset.priority===p.value)&&(t.value==='全部'||c.dataset.topic===t.value);c.hidden=!ok;if(ok)shown++});count.textContent=shown;empty.hidden=shown!==0}function reset(){q.value='';s.value=p.value=t.value='全部';apply()}[q,s,p,t].forEach(el=>el.addEventListener(el===q?'input':'change',apply));document.querySelector('#reset').addEventListener('click',reset);document.querySelector('#empty-reset').addEventListener('click',reset);</script></body></html>`;

const clientDir = path.join(root, "dist", "client");
const serverDir = path.join(root, "dist", "server");
fs.mkdirSync(clientDir, { recursive: true });
fs.mkdirSync(serverDir, { recursive: true });
fs.writeFileSync(path.join(clientDir, "index.html"), html);
const worker = `const html=${JSON.stringify(html)};export default{async fetch(){return new Response(html,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"public, max-age=300","x-content-type-options":"nosniff"}})}};`;
fs.writeFileSync(path.join(serverDir, "index.js"), worker);
fs.mkdirSync(path.join(root, "dist", ".openai"), { recursive: true });
fs.copyFileSync(path.join(root, ".openai", "hosting.json"), path.join(root, "dist", ".openai", "hosting.json"));
console.log(`Static dashboard built: ${news.length} news items`);
