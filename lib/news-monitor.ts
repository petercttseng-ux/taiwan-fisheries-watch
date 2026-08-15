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

const PUBLISHED_SNAPSHOT_URL = "https://petercttseng-ux.github.io/taiwan-fisheries-watch/snapshot.json";

const SEARCH_QUERIES = [
  "(水產 OR 漁業署 OR 水產試驗所 OR 養殖 OR 漁港) when:1d",
  "(水產品 OR 漁村 OR 海洋保育 OR 國際漁業 OR IUU) when:1d",
];

const NEGATIVE_WORDS = ["死亡", "污染", "違規", "非法", "走私", "重罰", "危機", "災害", "颱風", "赤潮", "缺氧", "下跌", "衰退", "爭議", "起訴", "裁罰", "硝基呋喃", "抗生素", "致癌物"];
const POSITIVE_WORDS = ["突破", "成長", "成功", "獲獎", "復育", "創新", "合作", "提升", "啟用", "豐收", "改善"];
const HIGH_PRIORITY_WORDS = ["食安", "污染", "死亡", "非法", "IUU", "走私", "禁捕", "裁罰", "災害", "赤潮", "缺氧", "疫情", "重金屬", "硝基呋喃", "抗生素", "致癌物", "抱卵", "幼蟹"];
const RELEVANT_TITLE = /(水產|漁業|漁港|漁村|漁船|漁權|漁獲|養殖|魚|蝦|蟹|抱卵|幼體|貝類|海鮮|海保署|海洋保育|海洋保護|海洋永續|IUU|aquaculture|fishery|fisheries|seafood|algae|urchin)/i;
const EXCLUDED_TITLE = /(Steam|遊戲|古神|克蘇魯|討論牆|喊貴|店家喊冤|男星.*養殖場|普丁.*北方四島|北方四島.*普丁)/i;

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
  if (/(食安|檢驗|污染|重金屬|藥物|生菌|中毒|硝基呋喃|抗生素|致癌物)/.test(title)) return "水產品食安";
  if (/(保育|海保署|禁捕|抱卵|幼蟹|幼體|赤潮|紅潮|IUU|非法漁|漁獲管制|資源管理|海洋保護)/i.test(title)) return "資源保育與治理";
  if (/(養殖|魚塭|水產疾病|種苗|飼料)/.test(title)) return "養殖與產業";
  if (/(漁港|漁村|魚市場|地方創生|漁會|食魚教育)/.test(title)) return "漁港與地方創生";
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

type SuggestedResponse = Pick<NewsItem, "short_response" | "detailed_response">;

const RESPONSE_RULES: Array<{ pattern: RegExp; response: SuggestedResponse }> = [
  {
    pattern: /(印尼.*出口.*醃製鯰魚|醃製鯰魚.*(?:臺灣|台灣)|salted.*catfish.*Taiwan)/i,
    response: {
      short_response: "報導指出印尼首批10.5噸醃製鯰魚輸臺，第二批預計9月增至近兩倍；應核對輸入規格、衛生證明、邊境查驗及實際通關量。",
      detailed_response: "本則重點是印尼醃製鯰魚首次以10.5噸規模輸往臺灣，並稱9月第二批數量將接近倍增。判讀時仍須查核實際魚種與產品型態、出口加工廠及臺灣進口商、產地與衛生證明、邊境查驗結果，以及第二批是否如期通關；單一或兩批出貨尚不足以推論長期市場趨勢。水試所可從加工、保存、產品品質與國內產業影響提供技術資料；輸入許可、食品安全查驗及通關由衛生福利部食藥署、海關與相關權責機關辦理。",
    },
  },
  {
    pattern: /(麥當勞|蝦堡).*(硝基呋喃|致癌抗生素|致癌物)|(?:硝基呋喃|致癌抗生素).*(?:蝦堡|麥當勞)|麥當勞.*蝦堡.*(?:下架|停售)/,
    response: {
      short_response: "報導稱蝦堡原料檢出硝基呋喃代謝物；應以官方公布的供應商、批號、檢出值、流向與下架範圍為準，勿擴大為所有蝦品風險。",
      detailed_response: "本則涉及蝦堡原料的硝基呋喃代謝物檢出與停售／下架。正式回應前應先確認採樣單位、原料或成品、供應商與產地、批號、檢出代謝物及數值、複驗結果、產品流向與實際下架範圍。硝基呋喃類不得使用於產食動物，但媒體所稱「在環境中養出超級細菌」屬機制性風險討論，不能取代本案來源追查或健康風險評估。水試所可協助養殖端用藥管理與殘留來源研判；食品風險、回收及裁處由食藥署與地方衛生機關認定。",
    },
  },
  {
    pattern: /(永安漁港.*食魚教育|食魚教育.*永安漁港)/,
    response: {
      short_response: "報導預告8月15日永安漁港食魚教育活動，核心是認識在地漁產與消費選擇；水試所可提供物種、產季、溯源及永續利用教材。",
      detailed_response: "本則為桃園永安漁港8月15日食魚教育與在地漁產推廣活動預告，重點在讓民眾認識魚種、產地與漁業文化，而非發布產量或食安檢驗結果。水試所可提供常見水產品辨識、產季、營養、保鮮、溯源及永續選購的科學教材，並協助把資源保育觀念轉化為可操作的消費指引。活動時間、地點、報名及展售內容應以主辦單位最新公告為準；個別產品品質與安全仍由供應業者及衛生權責機關負責。",
    },
  },
  {
    pattern: /(臺灣|台灣).*遠洋漁業.*永續轉型|遠洋漁業.*永續轉型/,
    response: {
      short_response: "本則探討臺灣遠洋漁業永續轉型；水試所應聚焦資源評估、混獲減量、漁獲可追溯與低碳作業，並以區域組織及船隊數據檢驗成效。",
      detailed_response: "本則主題是臺灣遠洋漁業如何由產量導向轉為兼顧資源、勞動與市場責任的永續經營。水試所可提供目標魚種資源評估、混獲與海洋生物互動資料、漁法改良、電子監測及能耗分析，並以區域漁業管理組織（RFMO）規範、船隊作業與漁獲資料檢驗措施成效。永續轉型不能只以單一認證或口號判定，尚須看配額遵循、可追溯性、勞動條件與查核結果；外交談判、船隊管理及違規裁處由漁業署等權責機關辦理。",
    },
  },
  {
    pattern: /(八斗子魚市場|八斗子.*現代化交易場域)/,
    response: {
      short_response: "八斗子魚市場新建工程由市府與漁業署投入逾1.67億元，預計2027年底前完工；重點是改善卸魚、交易衛生、遮陽保鮮與漁業服務。",
      detailed_response: "基隆市府資料顯示，八斗子漁港約占基隆漁產量8成；市府與漁業署投入1億6,700餘萬元新建魚市場，預計2027年底前完工，目標是改善卸魚整補、交易安全衛生、遮陽保鮮及服務環境。報導並列舉鯖鰺、小卷與脂胭蝦等主要漁獲，及冷凍庫、污廢水處理等周邊運銷設施。水試所可就漁獲品質、低溫鏈、作業動線與衛生監測提供技術建議；工程進度、預算執行、營運及觀光串聯由基隆市府、漁業署與基隆區漁會負責。",
    },
  },
  {
    pattern: /(休漁期.*結束.*下環街市|下環街市.*水產.*品類)/,
    response: {
      short_response: "報導預期休漁期結束後澳門下環街市水產品類增加；這是供應恢復預期，仍須以實際到貨量、產地、價格與查驗資料驗證。",
      detailed_response: "本則聚焦澳門休漁期結束後，下環街市水產品供應可能增加。休漁結束通常會改變短期到貨品項與數量，但不能僅憑市場預期推論資源量已恢復或價格一定下降；應持續比對實際漁獲來源、到貨量、規格、價格、冷鏈與衛生查驗。此案屬澳門市場與漁業管理情境，對臺灣的影響須另看進出口及替代品資料。水試所可提供資源與市場監測方法，當地休漁及市場管理仍由澳門權責機關辦理。",
    },
  },
  {
    pattern: /(遠洋船員.*醫療補助|醫療補助.*(?:本國|外籍).*船員)/,
    response: {
      short_response: "報導指遠洋船員醫療補助涵蓋本國與外籍船員；申請主體、補助項目、額度、憑證、期限及適用海域，應依漁業署正式公告。",
      detailed_response: "本則重點是漁業署遠洋船員醫療補助不以國籍排除船員，有助提升海上或海外港口作業期間的就醫可近性。對外說明仍應逐項核對正式作業要點，包括申請人是船員或漁船經營者、適用船舶與期間、可補助的診察或通訊醫療費用、額度、應備憑證、申請期限及重複補助限制。水試所支持以健康與作業風險資料改善遠洋作業安全；補助受理、保險責任、醫療判斷與勞動權益由漁業署、醫療及勞政權責機關辦理。",
    },
  },
  {
    pattern: /(2026海洋保育創意短影音競賽|尋找海的呼吸).*(延長|9月30日|9\/30)/,
    response: {
      short_response: "報導稱競賽延長報名至9月30日；但海保署既有活動頁載8月21日15時截止，原簡章的9月30日為入圍公告，須先確認最新修正。",
      detailed_response: "本則稱「2026海洋保育創意短影音競賽」延長報名至9月30日，但海保署既有活動頁仍載徵件至8月21日下午3時，原報名簡章所列9月30日則是預定公布入圍名單。若海保署已另行修正，應以最新官方新聞、活動網站及修正版簡章為準，並同步更新截止時間、評選與頒獎期程，避免把入圍公告日誤作報名截止日。水試所可協助審閱作品中的水產與海洋科學內容；競賽資格、著作權、AI使用規範及收件由海保署與承辦單位認定。",
    },
  },
  {
    pattern: /(銀礦灣.*紅潮|紅潮.*銀礦灣|red tide.*Silvermine Bay)/i,
    response: {
      short_response: "香港銀礦灣泳灘發現紅潮，報導稱未接魚類死亡；在藻種、毒性、範圍與溶氧資料確認前，不宜推論生態衝擊或連結臺灣海域。",
      detailed_response: "本則是香港大嶼山銀礦灣泳灘的紅潮通報，已知訊息僅為現場出現紅潮且當時未接獲魚類死亡報告。「未見魚死」不等於無風險，仍須確認藻種與細胞密度、是否產毒、影響範圍、持續時間、溶氧與水溫，並追蹤鄰近養殖或遊憩水域；也不能據此推論臺灣海域同步受影響。水試所可提供藻華辨識與水質監測方法；香港現場警示、採樣及漁戶通知由當地權責機關辦理。",
    },
  },
  {
    pattern: /(台電.*養殖|養殖.*用電|漁牧.*用電|颱風季.*養殖.*電)/i,
    response: {
      short_response: "報導聚焦台電向養殖業宣導平時檢修與颱風前整備；水試所提醒優先確認水車、抽水、警報及備援電力可正常運作。",
      detailed_response: "報導指出，台電台南區處於8月3日拜訪養殖漁業發展協會，將防災分為平時維護與颱風前整備：新增或變更設備應由合格承裝業者申請並採分流、階層式保護；風災前則應試轉備用發電機、檢查油料與自動切換開關（ATS）、開關箱防水及警報系統。水試所就養殖生產面提醒，水車與抽水馬達停擺可能迅速影響溶氧及水質，業者宜把設備巡檢、緊急增氧與通報流程納入場內應變；電力設計與施工仍由台電及合格承裝業者負責。",
    },
  },
  {
    pattern: /(海膽|sea\s*urchin).*(海藻|algae)|(?:海藻|algae).*(?:海膽|sea\s*urchin)/i,
    response: {
      short_response: "報導指出澎湖人工養殖馬糞海膽可全年供應，但年產約1.2萬顆，擴產關鍵在穩定培育受季節、天候、水溫與水質影響的大型海藻。",
      detailed_response: "報導說明，澎湖野生馬糞海膽僅於7、8月開放捕撈，且直徑須大於8公分；人工養殖雖可全年供應，但現場年產量約1.2萬顆，主要瓶頸不是海膽本身，而是大型海藻餌料難以穩定、規模化生產。水試所可就藻種保存與量產、季節性餌料調度、水溫與水質控制、海膽成長及產品品質建立試驗數據，協助評估擴產成本與場域承載。是否能實際降低野生資源壓力，仍須結合捕撈量與養殖替代效果長期驗證。",
    },
  },
  {
    pattern: /(嘉義優鮮.*父親節|父親節.*嘉義優鮮)/,
    response: {
      short_response: "嘉義優鮮水產平台8月3日至31日推出滿888元免運、任選2件88折及3款限定組合；水試所可從品質、冷鏈與加工技術支持產地品牌。",
      detailed_response: "本則是嘉義縣政府水產電商的父親節促銷消息：活動期間為8月3日至31日，優惠為全館滿888元免運及任選2件以上88折，另有「爸氣開動組」、「爸就愛這味」與「父親好食光」3款限定組合，並延伸中元採購情境。水試所可就臺灣鯛、虱目魚、鱸魚、鰻魚及加工品的保鮮、冷鏈、加工與品質驗證提供技術支援；優惠資格、售價、出貨與個別商品安全則應以平台、業者及地方衛生主管機關公告為準，水試所不為特定商品背書。",
    },
  },
  {
    pattern: /(Kiwit|奇美部落).*(Paliwal|Komolis|捕魚祭)|(?:Paliwal|Komolis).*(?:Kiwit|奇美部落)/i,
    response: {
      short_response: "報導主軸是Kiwit奇美部落3天Komolis捕魚祭及4年一度Paliwal收穫遊行，重點在年齡階層晉升、野外技能傳承與漁獲分享。",
      detailed_response: "本則報導Kiwit奇美部落完成3天Komolis捕魚祭後，舉行4年一度的Paliwal收穫遊行；青年依年齡階層分工、搭建臨時會所、報告捕魚範圍與時間，祭後檢討並分送漁獲，耆老強調捕獲多寡並非核心，重點是傳授判讀水路、確保安全等野外技能。這是部落文化、組織與世代傳承報導，不宜逕自解讀為漁業資源增減。水試所如參與河川生態或資源監測，應以部落同意、共同設計及尊重傳統知識權利為前提。",
    },
  },
  {
    pattern: /(珊瑚.*益生菌|益生菌.*珊瑚|Acr-14|Endozoicomonas)/i,
    response: {
      short_response: "中研院研究證實共生菌Acr-14可提升珊瑚耐熱並減緩菌相失衡；成果是保育技術的重要實驗基礎，尚需野外與長期效益驗證。",
      detailed_response: "報導所述研究已於7月刊登《The ISME Journal》。中研院團隊歷時近10年，完成菌株功能、耐熱、多體學與單細胞分析，直接驗證Endozoicomonas acroporae Acr-14可提升珊瑚耐熱能力，並以31種珊瑚細胞類型的分析顯示其有助維持微生物群落穩定；團隊也建立臺灣族群萼形柱珊瑚的染色體層級參考基因體。水試所可協作環境監測與技術驗證，但從控制實驗走向復育應用前，仍須確認不同珊瑚與海域的適用性、菌株持續性、生態風險及長期效果。",
    },
  },
  {
    pattern: /(抱卵母蟹|開花母蟹|腹甲離身|抱卵、幼體).*(禁捕|禁售|販售|罰)|(?:禁捕|禁售|販售|違規抓賣).*(?:抱卵母蟹|開花母蟹|抱卵、幼體)/,
    response: {
      short_response: "8月1日至12月31日禁捕、禁售抱卵母蟹及腹甲離身蟳蟹；特定小型蟳蟹全年禁捕，違者罰3萬至15萬元，發現違規可通報118。",
      detailed_response: "報導整理《沿近海漁船捕撈蟳蟹類漁獲管制措施》：8月1日至12月31日禁止捕撈、販售或展示抱卵母蟹，也禁止捕撈卸下或持有腹甲離身的蟳蟹；花蟹、三點蟹、花市仔甲殼寬未滿9公分、石蟳未滿7公分、旭蟹甲殼長未滿6公分則全年禁捕。誤捕原則上應立即放回海中，違者可罰3萬至15萬元，民眾可蒐證後撥118或向地方漁業執法機關通報。水試所可提供體長、抱卵率與資源量監測，違規認定及裁罰由漁業署、海巡署與地方政府辦理。",
    },
  },
  {
    pattern: /(整體海洋保護區管理政策方針|海洋保護區).*(3030|30.?30|政策方針)|(?:3030|30.?30).*(?:海洋保護區)/i,
    response: {
      short_response: "行政院7月27日核定首部整體海洋保護區管理政策方針，採3大目標、2大策略、10項行動並每5年至少檢討一次，推進30×30。",
      detailed_response: "海保署公告指出，行政院於7月27日核定首部「整體海洋保護區管理政策方針」，以2050年自然與人類和諧共生為願景，設3大目標、2大策略與10項行動，涵蓋既有保護區效能、長期監測、權益關係人參與、海域空間規劃、MPA劃設及OECM認定，並依法每5年至少檢討一次。2025年底完成的71處保護區治理評估，是制度基線而非保育成效的終局判定。水試所可提供漁業資源、棲地與社經監測資料；劃設、權益協調及管理仍由海保署與各目的事業主管機關辦理。",
    },
  },
  {
    pattern: /(巡護七號|太平洋公海巡護|公海巡護).*(IUU|漁權|巡護|啟航)|(?:IUU).*(?:巡護七號|公海巡護)/i,
    response: {
      short_response: "巡護七號執行2026年第2航次太平洋公海巡護，任務包括巡查、登檢、科學採樣、打擊IUU漁業及必要的人道救援。",
      detailed_response: "報導指出，海巡署「巡護七號」於8月3日啟航，執行2026年度第2航次太平洋公海巡護，配合漁業署進行公海巡查、登檢與科學採樣，以打擊非法、未報告及不受規範（IUU）漁業、維護遠洋漁權並履行區域漁業管理組織義務；任務亦包含視情況提供海上人道救援。我國自2000年起每年規劃2至3航次。水試所可在物種辨識、採樣設計及資源資料分析上提供科研支援；海上執法、登檢與違規認定由海巡署及漁業署依法辦理。",
    },
  },
  {
    pattern: /(€20\s*million|20\s*million|Friuli Venezia Giulia).*(fish|aquaculture|漁|養殖|fuel)|(?:fish|aquaculture).*(?:Friuli Venezia Giulia|€20\s*million)/i,
    response: {
      short_response: "歐盟核准義大利Friuli Venezia Giulia區域2,000萬歐元援助，補貼中東危機推升的農業肥料與燃料、漁業及養殖燃料成本。",
      detailed_response: "歐盟執委會依「中東危機臨時國家援助框架」核准Friuli Venezia Giulia自治區2,000萬歐元方案，執行至2026年12月31日，以直接補助及優惠貸款協助農業、漁業與養殖初級生產者；漁業與養殖依估計燃料用量核算，每一受益者上限5萬歐元，經費由該自治區支付。本案是特定危機、法制與區域條件下的成本紓困，不能直接等同臺灣政策。水試所可提供養殖能耗、節能增氧及低碳技術效益數據；補助設計與資格屬政策及財政權責。",
    },
  },
];

const FALLBACK_RESPONSES: Record<string, SuggestedResponse> = {
  水產品食安: {
    short_response: "本則涉及水產品食安，應先核對主管機關檢驗結果、產品批次、採樣方法與風險範圍，再提出對外說明。",
    detailed_response: "目前自動監測僅取得新聞標題與來源，尚不足以判定食安風險。水試所建議先查核主管機關原始檢驗報告、產品名稱與批次、採樣及分析方法、檢出值與法定標準、流向與回收範圍，再依可驗證事實說明。檢驗判定、下架、回收或裁罰由衛生及相關權責機關依法辦理；在資料未完整前，不宜將個案擴大為整體水產品風險。",
  },
  資源保育與治理: {
    short_response: "本則涉及資源保育或治理措施，應以主管機關公告、適用物種與期間及科學監測資料為準，並區分研究建議與執法權責。",
    detailed_response: "目前自動監測僅取得新聞標題與來源。水試所回應前應查核主管機關公告全文、適用物種與海域、施行期間、管理依據及例外條件，並以漁獲量、體長組成、繁殖期或棲地監測資料評估資源意義。水試所可提供調查與方法建議；公告、執法、違規認定及裁罰仍由法定權責機關辦理。",
  },
  養殖與產業: {
    short_response: "本則涉及養殖產業，應先確認物種、場域、事件原因與影響範圍；水試所可就水質、生物安全、生產技術及風險管理提供科學支援。",
    detailed_response: "目前自動監測僅取得新聞標題與來源，尚不能據此判定個別養殖場狀況。水試所建議先查核物種、地點、時間、養殖方式、環境與水質資料、疾病或災損證據及產銷影響，再針對水質管理、生物安全、種苗與飼料、生產設備或緊急應變提供技術協助。個案責任、補助與裁處應由地方政府及相關權責機關認定。",
  },
  漁港與地方創生: {
    short_response: "本則涉及漁港或地方發展，應核對計畫範圍、使用者需求與生態影響；水試所可提供漁業生產、場域與資源監測資料。",
    detailed_response: "目前自動監測僅取得新聞標題與來源。回應前應確認計畫位置、期程、經費、使用對象、預期產業效益及環境影響，並納入漁民、居民與在地組織意見。水試所可提供漁業生產、資源與場域利用資料，協助建立可追蹤指標；工程、土地使用、營運與預算仍由主辦及法定權責機關辦理。",
  },
  國際漁業: {
    short_response: "本則涉及國際漁業，應先核對原始政策文件、適用國家與措施內容，再評估對臺灣漁業、資源管理或貿易的實際影響。",
    detailed_response: "目前自動監測僅取得新聞標題與來源。水試所建議查核發布機關、法規或決議原文、適用國家與物種、施行日期、配額或限制及執行機制，再依臺灣船隊、養殖或水產品貿易的暴露程度評估影響。水試所可提供資源評估與技術資料；外交、談判、貿易措施及執法由各權責機關辦理。",
  },
  產業與市場: {
    short_response: "本則屬產業或市場訊息，應核對品項、地區、期間與數據來源，再區分單一活動、短期波動及長期趨勢。",
    detailed_response: "目前自動監測僅取得新聞標題與來源，尚不足以推論整體產業趨勢。水試所建議查核品項、產地、交易期間、價格或數量的比較基準及官方統計，並區分個別業者或促銷活動與市場供需變化。水試所可提供生產、保鮮加工與品質技術資料；價格、行銷與商業決策由市場及相關權責單位負責。",
  },
};

export function suggestResponseForTitle(title: string, topic: string): SuggestedResponse {
  return RESPONSE_RULES.find((rule) => rule.pattern.test(title))?.response
    ?? FALLBACK_RESPONSES[topic]
    ?? FALLBACK_RESPONSES["產業與市場"];
}

export function isRelevantNewsTitle(title: string) {
  return RELEVANT_TITLE.test(title) && !EXCLUDED_TITLE.test(title);
}

export function clusterKeyForTitle(title: string) {
  if (/(麥當勞|蝦堡).*(硝基呋喃|致癌抗生素|致癌物)|(?:硝基呋喃|致癌抗生素).*(?:蝦堡|麥當勞)|麥當勞.*蝦堡.*(?:下架|停售)/.test(title)) return "mcdonalds-shrimp-burger-nitrofuran";
  if (/(抱卵母蟹|開花母蟹|腹甲離身|抱卵、幼體).*(禁捕|禁售|販售|罰)|(?:禁捕|禁售|販售|違規抓賣).*(?:抱卵母蟹|開花母蟹|抱卵、幼體)/.test(title)) return "ovigerous-and-undersized-crab-control";
  if (/(整體海洋保護區管理政策方針|海洋保護區).*(3030|30.?30|政策方針)|(?:3030|30.?30).*(?:海洋保護區)/i.test(title)) return "marine-protected-area-policy";
  if (/(巡護七號|太平洋公海巡護|公海巡護).*(IUU|漁權|巡護|啟航)|(?:IUU).*(?:巡護七號|公海巡護)/i.test(title)) return "pacific-high-seas-patrol";
  if (/(台電.*養殖|養殖.*用電|漁牧.*用電|颱風季.*養殖.*電)/i.test(title)) return "aquaculture-power-resilience";
  return normalizeTitle(title);
}

function parseRss(xml: string): NewsItem[] {
  const now = Date.now();
  const items = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];

  return items.flatMap((block) => {
    const rawTitle = readTag(block, "title");
    const url = readTag(block, "link");
    const source = readTag(block, "source") || "Google 新聞";
    const publishedAt = readTag(block, "pubDate");
    if (!rawTitle || !url || !isRelevantNewsTitle(rawTitle)) return [];
    const sourceSuffix = ` - ${source}`;
    const title = rawTitle.endsWith(sourceSuffix) ? rawTitle.slice(0, -sourceSuffix.length).trim() : rawTitle;

    const publishedTime = Date.parse(publishedAt);
    const hoursAgo = Number.isFinite(publishedTime) ? Math.max(0, Math.floor((now - publishedTime) / 3_600_000)) : 0;
    if (hoursAgo > 24) return [];

    const topic = classifyTopic(title);
    const sentiment = classifySentiment(title);
    const priority = classifyPriority(title, sentiment);
    const suggestedResponse = suggestResponseForTitle(title, topic);

    return [{
      id: `n-${stableId(url)}`,
      cluster_id: `c-${stableId(clusterKeyForTitle(title))}`,
      hours_ago: hoursAgo,
      priority,
      source,
      title,
      topic,
      sentiment,
      url,
      ...suggestedResponse,
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
  const generatedAt = new Date(Date.now() + 8 * 60 * 60 * 1000)
    .toISOString()
    .replace("Z", "+08:00");

  return {
    generatedAt,
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
      const headers = {
        accept: "application/rss+xml, application/xml;q=0.9",
        "accept-language": "zh-TW,zh;q=0.9,en;q=0.7",
        "user-agent": "Mozilla/5.0 (compatible; FisheriesNewsMonitor/1.0)",
      };
      let response = await fetch(url, { headers });
      if (response.status >= 500) {
        await new Promise((resolve) => setTimeout(resolve, 750));
        response = await fetch(url, { headers });
      }
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
  if (news.length === 0) {
    try {
      const response = await fetch(PUBLISHED_SNAPSHOT_URL, {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const snapshot = await response.json() as DashboardSnapshot;
      if (!snapshot.generatedAt || !snapshot.datasets?.news_items?.length) {
        throw new Error("快照內容不完整");
      }
      return {
        ...snapshot,
        searchMeta: {
          queryCount: SEARCH_QUERIES.length,
          resultCount: snapshot.datasets.news_items.length,
          source: "GitHub Pages 最新監測快照",
          errors,
        },
      };
    } catch (fallbackError) {
      errors.push(`GitHub Pages 備援: ${fallbackError instanceof Error ? fallbackError.message : "讀取失敗"}`);
      throw new Error(errors.join("；") || "搜尋未傳回任何有效新聞");
    }
  }
  return summarize(news, errors);
}
