"use client";

import { useMemo, useState } from "react";
import artifact from "./artifact-data.json";

type NewsItem = {
  id: string;
  cluster_id: string;
  hours_ago: number;
  priority: string;
  source: string;
  title: string;
  topic: string;
  sentiment: string;
  url: string;
  short_response: string;
  detailed_response: string;
};

const datasets = artifact.snapshot.datasets;
const kpis = datasets.kpis[0];
const news = datasets.news_items as NewsItem[];
const sentiments = datasets.sentiment_summary;
const topics = [...datasets.topic_summary].sort((a, b) => b.count - a.count);
const topicMax = Math.max(...topics.map((item) => item.count));

const sentimentClass: Record<string, string> = { 正向: "positive", 中性: "neutral", 負向: "negative" };
const priorityClass: Record<string, string> = { 高: "high", 中: "medium", 低: "low" };

function relativeTime(hours: number) {
  return hours === 0 ? "1 小時內" : `${hours} 小時前`;
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [sentiment, setSentiment] = useState("全部");
  const [priority, setPriority] = useState("全部");
  const [topic, setTopic] = useState("全部");

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("zh-Hant");
    return [...news]
      .sort((a, b) => a.hours_ago - b.hours_ago)
      .filter((item) => sentiment === "全部" || item.sentiment === sentiment)
      .filter((item) => priority === "全部" || item.priority === priority)
      .filter((item) => topic === "全部" || item.topic === topic)
      .filter((item) => !needle || [item.title, item.source, item.topic, item.short_response].join(" ").toLocaleLowerCase("zh-Hant").includes(needle));
  }, [query, sentiment, priority, topic]);

  const clearFilters = () => {
    setQuery("");
    setSentiment("全部");
    setPriority("全部");
    setTopic("全部");
  };

  const topAlert = news.find((item) => item.priority === "高" && item.hours_ago === 0) ?? news[0];

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="回到頁首"><span className="brand-mark" aria-hidden="true">水</span><span>水產科技情報站</span></a>
        <div className="header-meta"><span className="status-dot" aria-hidden="true" />已驗證快照<span className="meta-divider" />10 分鐘更新</div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">FISHERIES INTELLIGENCE · TAIWAN</p>
          <h1>水產新聞與<br /><span>輿情監測儀表板</span></h1>
          <p className="hero-description">彙整最近 24 小時水產、漁業、養殖、食安、資源保育與國際治理動態，並以水產試驗所科研及技術推廣立場提供回應建議。</p>
          <div className="freshness"><span>最後監測</span><strong>2026 / 08 / 01　10:34</strong><span>Asia / Taipei</span></div>
        </div>

        <aside className="signal-card" aria-label="最新高優先訊號">
          <div className="signal-topline"><span className="live-pill"><i />最新高優先</span><span>{relativeTime(topAlert.hours_ago)}</span></div>
          <p className="signal-source">{topAlert.source} · {topAlert.topic}</p>
          <h2>{topAlert.title}</h2>
          <p>{topAlert.short_response}</p>
          <a href={topAlert.url} target="_blank" rel="noreferrer">查看原始報導 <span aria-hidden="true">↗</span></a>
          <div className="signal-grid" aria-hidden="true"><span /><span /><span /><span /><span /><span /></div>
        </aside>
      </section>

      <section className="metric-grid" aria-label="監測指標">
        <article className="metric-card"><div className="metric-icon">◎</div><div><span>有效新聞</span><strong>{kpis.mentions}</strong><small>最近 24 小時</small></div></article>
        <article className="metric-card"><div className="metric-icon">◫</div><div><span>事件群組</span><strong>{kpis.clusters}</strong><small>重複報導已歸群</small></div></article>
        <article className="metric-card"><div className="metric-icon">⌁</div><div><span>治理與保育</span><strong>{kpis.governance}</strong><small>需政策溝通</small></div></article>
        <article className="metric-card risk-card"><div className="metric-icon">!</div><div><span>負向訊號</span><strong>{kpis.negative}</strong><small>需持續追蹤</small></div></article>
      </section>

      <section className="analytics-grid" aria-label="輿情分析">
        <article className="panel sentiment-panel">
          <div className="panel-heading"><div><p className="section-kicker">SENTIMENT</p><h2>新聞情緒分布</h2></div><span>共 {kpis.mentions} 則</span></div>
          <div className="sentiment-content">
            <div className="donut" role="img" aria-label="中性與正向各 41.7%，負向 16.7%"><div><strong>{kpis.mentions}</strong><span>則新聞</span></div></div>
            <div className="legend">
              {sentiments.map((item) => <div key={item.sentiment}><span className={`legend-dot ${sentimentClass[item.sentiment]}`} /><p>{item.sentiment}<small>{item.count} 則</small></p><strong>{item.share_pct}%</strong></div>)}
            </div>
          </div>
        </article>

        <article className="panel topic-panel">
          <div className="panel-heading"><div><p className="section-kicker">TOPICS</p><h2>議題分布</h2></div><span>{topics.length} 類議題</span></div>
          <div className="topic-bars">
            {topics.map((item, index) => <div className="topic-row" key={item.topic}><span className="topic-rank">{String(index + 1).padStart(2, "0")}</span><span className="topic-name">{item.topic}</span><div className="bar-track"><i style={{ width: `${(item.count / topicMax) * 100}%` }} /></div><strong>{item.count}</strong></div>)}
          </div>
        </article>
      </section>

      <section className="news-section" id="news">
        <div className="section-title-row"><div><p className="section-kicker">MONITORING FEED</p><h2>新聞與建議回應</h2></div><p>顯示 <strong>{filtered.length}</strong> / {news.length} 則</p></div>
        <div className="filters" aria-label="新聞篩選器">
          <label className="search-field"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋標題、來源、議題或回應…" /></label>
          <label><span>情緒</span><select value={sentiment} onChange={(event) => setSentiment(event.target.value)}><option>全部</option><option>正向</option><option>中性</option><option>負向</option></select></label>
          <label><span>優先級</span><select value={priority} onChange={(event) => setPriority(event.target.value)}><option>全部</option><option>高</option><option>中</option><option>低</option></select></label>
          <label className="topic-filter"><span>議題</span><select value={topic} onChange={(event) => setTopic(event.target.value)}><option>全部</option>{topics.map((item) => <option key={item.topic}>{item.topic}</option>)}</select></label>
          <button type="button" onClick={clearFilters}>重設</button>
        </div>

        <div className="news-list">
          {filtered.map((item) => (
            <article className="news-card" key={item.id}>
              <div className="news-card-side"><span className={`priority-rail ${priorityClass[item.priority]}`} /><div><span className="cluster-label">{item.cluster_id.toUpperCase()}</span><strong>{relativeTime(item.hours_ago)}</strong></div></div>
              <div className="news-card-body">
                <div className="badge-row"><span className={`badge sentiment-${sentimentClass[item.sentiment]}`}>{item.sentiment}</span><span className={`badge priority-${priorityClass[item.priority]}`}>{item.priority}優先</span><span className="badge topic-badge">{item.topic}</span></div>
                <p className="news-source">{item.source}</p>
                <h3><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a></h3>
                <div className="response-short"><span>水試所簡要回應</span><p>{item.short_response}</p></div>
                <details><summary>展開詳細回應 <span aria-hidden="true">＋</span></summary><div className="detail-response"><p>{item.detailed_response}</p><p className="authority-note">正式對外發布前，應由權責單位完成事實查核與核定。</p></div></details>
              </div>
              <a className="source-link" href={item.url} target="_blank" rel="noreferrer" aria-label={`開啟 ${item.title} 原始報導`}>↗</a>
            </article>
          ))}
        </div>
        {filtered.length === 0 && <div className="empty-state"><strong>沒有符合條件的新聞</strong><p>請調整篩選條件或清除搜尋字詞。</p><button onClick={clearFilters}>清除篩選</button></div>}
      </section>

      <section className="notice-panel"><div className="notice-symbol">i</div><div><h2>判讀與使用注意</h2><p>情緒標記反映事件與標題語氣，不代表水試所對媒體或當事人的評價。同一事件以 cluster_id 歸群；涉及執法、裁罰、食安認定或個案責任時，尊重權責機關調查。</p></div></section>

      <footer><div className="brand footer-brand"><span className="brand-mark">水</span><span>水產科技情報站</span></div><p>資料來源：Google 新聞及公開媒體 · 監測快照 2026/08/01 10:34</p><p>水產試驗所科研及技術應用推廣立場</p></footer>
    </main>
  );
}
