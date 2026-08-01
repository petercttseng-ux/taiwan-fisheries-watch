import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "水產新聞與輿情監測儀表板",
  description: "彙整最近24小時水產、漁業、養殖、食安、資源保育與國際治理動態，並提供水產試驗所建議回應。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "水產新聞與輿情監測儀表板",
    description: "水產科技研發、產業推廣與政策溝通的即時情報介面。",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
