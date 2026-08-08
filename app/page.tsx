"use client";

import { useEffect, useMemo, useState } from "react";
import artifact from "./artifact-data.json";
import type { DashboardSnapshot, NewsItem } from "../lib/news-monitor";

const SNAPSHOT_POLL_INTERVAL_MS = 60 * 1000;

type ScheduleState = {
  intervalMinutes: number;
  nextRunAt: string;
  lastSuccessAt: string | null;
  healthy: boolean;
};

const sentimentClass: Record<string, string> = { 正向: "positive", 中性: "neutral", 負向: "negative" };
const priorityClass: Record<string, string> = { 高: "high", 中: "medium", 低: "low" };

function relativeTime(hours: number) {
  return hours === 0 ? "1 小時內" : `${hours} 小時前`;
}

function snapshotTime(value: string, compact = false) {
  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "--";
  const date = compact
    ? `${part("year")}/${part("month")}/${part("day")}`
    : `${part("year")} / ${part("month")} / ${part("day")}`;
  return `${date}${compact ? " " : "　"}${part("hour")}:${part("minute")}`;
}

export default function Home() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(artifact.snapshot as DashboardSnapshot);
  const [updateStatus, setUpdateStatus] = useState<"searching" | "ready" | "warning">("searching");
  const [updateMessage, setUpdateMessage] = useState("正在同步後端最新快照");
  const [schedule, setSchedule] = useState<ScheduleState | null>(null);
  const [query, setQuery] = useState("");
  const [sentiment, setSentiment] = useState("全部");
  const [priority, setPriority] = useState("全部");
  const [topic, setTopic] = useState("全部");

  const datasets = snapshot.datasets;
  const kpis = datasets.kpis[0];
  const news = datasets.news_items as NewsItem[];
  const sentiments = datasets.sentiment_summary;
  const topics = useMemo(() => [...datasets.topic_summary].sort((a, b) => b.count - a.count), [datasets.topic_summary]);
  const topicMax = Math.max(1, ...topics.map((item) => item.count));

  useEffect(() => {
    let active = true;

    const loadLatestSnapshot = async () => {
      if (active) {
        setUpdateStatus("searching");
        setUpdateMessage("正在同步後端最新快照");
      }

      try {
        const result = await fetch("/api/news/refresh", { method: "GET", cache: "no-store" });
        if (!result.ok) throw new Error(`快照服務回傳 ${result.status}`);
        const payload = await result.json() as {
          snapshot: DashboardSnapshot;
          persistence: "d1" | "fallback";
          schedule: ScheduleState;
          warning?: string;
        };
        if (!active) return;
        setSnapshot(payload.snapshot);
        setSchedule(payload.schedule);
        const warning = payload.persistence === "fallback" || !payload.schedule.healthy;
        setUpdateStatus(warning ? "warning" : "ready");
        setUpdateMessage(warning ? "後端快照暫時不可用，已保留上一版資料" : "後端排程正常；頁面已同步最新快照");
      } catch {
        if (!active) return;
        setUpdateStatus("warning");
        setUpdateMessage("快照同步暫時失敗，已保留上一版資料");
      }
    };

    void loadLatestSnapshot();
    const refreshTimer = window.setInterval(loadLatestSnapshot, SNAPSHOT_POLL_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("zh-Hant");
    return [...news]
      .sort((a, b) => a.hours_ago - b.hours_ago)
      .filter((item) => sentiment === "全部" || item.sentiment === sentiment)
      .filter((item) => priority === "全部" || item.priority === priority)
      .filter((item) => topic === "全部" || item.topic === topic)
      .filter((item) => !needle || [item.title, item.source, item.topic, item.short_response].join(" ").toLocaleLowerCase("zh-Hant").includes(needle));
  }, [news, query, sentiment, priority, topic]);

  const clearFilters = () => {
    setQuery("");
    setSentiment("全部");
    setPriority("全部");
    setTopic("全部");
  };

  const topAlert = news.find((item) => item.priority === "高" && item.hours_ago === 0) ?? news[0];
  const positiveShare = sentiments.find((item) => item.sentiment === "正向")?.share_pct ?? 0;
  const neutralShare = sentiments.find((item) => item.sentiment === "中性")?.share_pct ?? 0;
  const donutStyle = { background: `conic-gradient(var(--aqua) 0 ${positiveShare}%, var(--lime) ${positiveShare}% ${positiveShare + neutralShare}%, var(--coral) ${positiveShare + neutralShare}% 100%)` };

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="回到頁首"><span className="brand-mark" aria-hidden="true">水</span><span>水產科技情報站</span></a>
        <div className="header-meta" role="status" aria-live="polite" title={updateMessage}><span className={`status-dot ${updateStatus}`} aria-hidden="true" />{updateStatus === "searching" ? "正在同步" : updateStatus === "warning" ? "沿用上一版" : "後端排程正常"}<span className="meta-divider" />每 10 分鐘自動搜尋</div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">FISHERIES INTELLIGENCE · TAIWAN</p>
          <h1>水產新聞與<br /><span>輿情監測儀表板</span></h1>
          <p className="hero-description">彙整最近 24 小時水產、漁業、養殖、食安、資源保育與國際治理動態，並以水產試驗所科研及技術推廣立場提供回應建議。</p>
          <div className="freshness"><span>最後成功更新</span><strong>{snapshotTime(snapshot.generatedAt)}</strong><span>{schedule ? `下次搜尋 ${snapshotTime(schedule.nextRunAt, true)}` : "正在讀取排程"}</span></div>
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
            <div className="donut" style={donutStyle} role="img" aria-label={`正向 ${positiveShare}%，中性 ${neutralShare}%，負向 ${Math.max(0, 100 - positiveShare - neutralShare).toFixed(1)}%`}><div><strong>{kpis.mentions}</strong><span>則新聞</span></div></div>
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

      <footer><div className="brand footer-brand"><span className="brand-mark">水</span><span>水產科技情報站</span></div><p>資料來源：Google 新聞 RSS 及公開媒體 · 監測快照 {snapshotTime(snapshot.generatedAt, true)}</p><p>水產試驗所科研及技術應用推廣立場</p></footer>
    </main>
  );
}
