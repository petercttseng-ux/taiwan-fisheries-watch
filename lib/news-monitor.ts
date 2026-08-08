export type NewsItem = {
  id: string;
  cluster_id: string;
  hours_ago: number;
  priority: "高" | "中" | "低";
  source: string;
  title: string;
  topic: string;
  sentiment: "正向" | "中性" | "負向";
  url: string;
  short_response: string;
  detailed_response: string;
  published_at?: string;
};

export type DashboardSnapshot = {
  generatedAt: string;
  datasets: {
    kpis: Array<{ mentions: number; clusters: number; governance: number; negative: number }>;
    news_items: NewsItem[];
    sentiment_summary: Array<{ sentiment: "正向" | "中性" | "負向"; count: number; share_pct: number }>;
    topic_summary: Array<{ topic: string; count: number }>;
  };
  searchMeta?: {
    queryCount: number;
    resultCount: number;
    source: string;
    errors: string[];
  };
};

const SEARCH_QUERIES = [
  "(水產 OR 漁業署 OR 水產試驗所 OR 養殖 OR 漁港) when:1d",
  "(水產品 OR 漁村 OR 海洋保育 OR 國際漁業 OR IUU) when:1d",
];

const NEGATIVE_WORDS = ["死亡", "污染", "違規", "非法", "走私", "重罰", "危機", "災害", "颱風", "赤潮", "缺氧", "下跌", "衰退", "爭議", "起訴", "裁罰"];
const POSITIVE_WORDS = ["突破", "成長", "成功", "獲獎", "復育", "創新", "合作", "提升", "啟用", "豐收", "改善"];
const HIGH_PRIORITY_WORDS = ["食安", "污染", "死亡", "非法", "IUU", "走私", "禁捕", "裁罰", "災害", "赤潮", "缺氧", "疫情", "重金屬"];
const RELEVANT_TITLE = /(水產|漁業|漁港|漁村|漁船|漁權|漁獲|養殖|魚|蝦|蟹|貝類|海鮮|海洋保育|海洋保護|海洋永續|IUU|aquaculture|fishery|fisheries|seafood|algae|urchin)/i;

function decodeXml(value: string) {
  return value
    .replace(/^<!\[CDATA\[|\]\]>$/g, "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .trim();
}

function readTag(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function stableId(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeTitle(title: string) {
  return title
    .replace(/\s+-\s+[^-]+$/, "")
    .replace(/[\s、，。！？：；,.!?;:'"（）()【】\[\]「」『』\-—_]/g, "")
    .toLocaleLowerCase("zh-Hant");
}

function classifyTopic(title: string) {
  if (/(食安|檢驗|污染|重金屬|藥物|生菌|中毒)/.test(title)) return "水產品食安";
  if (/(保育|禁捕|IUU|非法漁|漁獲管制|資源管理|海洋保護)/i.test(title)) return "資源保育與治理";
  if (/(養殖|魚塭|水產疾病|種苗|飼料)/.test(title)) return "養殖與產業";
  if (/(漁港|漁村|地方創生|漁會)/.test(title)) return "漁港與地方創生";
  if (/(國際|日本|中國|歐盟|美國|菲律賓|印尼|越南|遠洋)/.test(title)) return "國際漁業";
  return "產業與市場";
}

function classifySentiment(title: string): NewsItem["sentiment"] {
  if (NEGATIVE_WORDS.some((word) => title.includes(word))) return "負向";
  if (POSITIVE_WORDS.some((word) => title.includes(word))) return "正向";
  return "中性";
}

function classifyPriority(title: string, sentiment: NewsItem["sentiment"]): NewsItem["priority"] {
  if (HIGH_PRIORITY_WORDS.some((word) => title.includes(word))) return "高";
  if (sentiment === "負向" || /(漁業署|農業部|水產試驗所)/.test(title)) return "中";
  return "低";
}

function responseFor(topic: string) {
  const guidance: Record<string, string> = {
    水產品食安: "應優先核對主管機關檢驗結果、產品批次與風險範圍，避免在證據未完整前擴大解讀。",
    資源保育與治理: "建議依主管機關公告與科學調查資料判讀，持續追蹤資源量、執法及產業影響。",
    養殖與產業: "建議持續掌握養殖環境、生物安全與產銷變化，必要時提供技術輔導及風險溝通。",
    漁港與地方創生: "可從場域安全、產業效益、生態承載與地方參與等面向持續追蹤。",
    國際漁業: "建議比對原始政策文件與國際規範，評估對臺灣產業、資源管理及貿易的可能影響。",
    產業與市場: "建議持續比對價格、供需與官方統計，釐清短期新聞事件與長期產業趨勢。",
  };
  return guidance[topic] ?? guidance["產業與市場"];
}

function parseRss(xml: string): NewsItem[] {
  const now = Date.now();
  const items = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];

  return items.flatMap((block) => {
    const rawTitle = readTag(block, "title");
    const url = readTag(block, "link");
    const source = readTag(block, "source") || "Google 新聞";
    const publishedAt = readTag(block, "pubDate");
    if (!rawTitle || !url || !RELEVANT_TITLE.test(rawTitle)) return [];
    const sourceSuffix = ` - ${source}`;
    const title = rawTitle.endsWith(sourceSuffix) ? rawTitle.slice(0, -sourceSuffix.length).trim() : rawTitle;

    const publishedTime = Date.parse(publishedAt);
    const hoursAgo = Number.isFinite(publishedTime) ? Math.max(0, Math.floor((now - publishedTime) / 3_600_000)) : 0;
    if (hoursAgo > 24) return [];

    const normalized = normalizeTitle(title);
    const topic = classifyTopic(title);
    const sentiment = classifySentiment(title);
    const priority = classifyPriority(title, sentiment);
    const guidance = responseFor(topic);

    return [{
      id: `n-${stableId(url)}`,
      cluster_id: `c-${stableId(normalized)}`,
      hours_ago: hoursAgo,
      priority,
      source,
      title,
      topic,
      sentiment,
      url,
      short_response: guidance,
      detailed_response: `本則由系統自動搜尋公開新聞來源並依標題初步分類為「${topic}」。${guidance} 自動分類僅供監測排序，正式引用或對外回應前，仍應開啟原始報導並由權責單位完成事實查核與核定。`,
      ...(publishedAt ? { published_at: new Date(publishedAt).toISOString() } : {}),
    }];
  });
}

function summarize(news: NewsItem[], errors: string[]): DashboardSnapshot {
  const sentiments: Array<NewsItem["sentiment"]> = ["正向", "中性", "負向"];
  const sentimentSummary = sentiments.map((sentiment) => {
    const count = news.filter((item) => item.sentiment === sentiment).length;
    return { sentiment, count, share_pct: news.length ? Number(((count / news.length) * 100).toFixed(1)) : 0 };
  });

  const topicCounts = new Map<string, number>();
  news.forEach((item) => topicCounts.set(item.topic, (topicCounts.get(item.topic) ?? 0) + 1));
  const topicSummary = [...topicCounts].map(([topic, count]) => ({ topic, count })).sort((a, b) => b.count - a.count);
  const clusters = new Set(news.map((item) => item.cluster_id)).size;
  const governance = news.filter((item) => /治理|保育|食安/.test(item.topic)).length;

  return {
    generatedAt: new Date().toISOString(),
    datasets: {
      kpis: [{ mentions: news.length, clusters, governance, negative: sentimentSummary.find((item) => item.sentiment === "負向")?.count ?? 0 }],
      news_items: news,
      sentiment_summary: sentimentSummary,
      topic_summary: topicSummary,
    },
    searchMeta: { queryCount: SEARCH_QUERIES.length, resultCount: news.length, source: "Google 新聞 RSS", errors },
  };
}

export async function searchLatestNews(): Promise<DashboardSnapshot> {
  const errors: string[] = [];
  const results = await Promise.all(SEARCH_QUERIES.map(async (query) => {
    const url = new URL("https://news.google.com/rss/search");
    url.searchParams.set("q", query);
    url.searchParams.set("hl", "zh-TW");
    url.searchParams.set("gl", "TW");
    url.searchParams.set("ceid", "TW:zh-Hant");

    try {
      const response = await fetch(url, { headers: { accept: "application/rss+xml, application/xml;q=0.9" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return parseRss(await response.text());
    } catch (error) {
      errors.push(`${query}: ${error instanceof Error ? error.message : "搜尋失敗"}`);
      return [];
    }
  }));

  const deduplicated = new Map<string, NewsItem>();
  results.flat().forEach((item) => {
    const key = normalizeTitle(item.title);
    const existing = deduplicated.get(key);
    if (!existing || item.hours_ago < existing.hours_ago) deduplicated.set(key, item);
  });

  const news = [...deduplicated.values()].sort((a, b) => a.hours_ago - b.hours_ago).slice(0, 60);
  if (news.length === 0) throw new Error(errors.join("；") || "搜尋未傳回任何有效新聞");
  return summarize(news, errors);
}
