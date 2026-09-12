import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { PrefsProvider, THEME_BOOTSTRAP } from "@/lib/ui/prefs";

/**
 * Geist was loaded here with subsets: ["latin"], which carries no Thai glyphs,
 * and globals.css then overrode it with Arial anyway -- so the entire Thai UI
 * fell through to whatever the OS picked. IBM Plex Sans Thai is drawn as a
 * matched Thai/Latin pair, so both scripts share one set of proportions.
 */
const sans = IBM_Plex_Sans_Thai({
  variable: "--font-sans-thai",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono-code",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Weekly Progress Meeting System",
  description: "ระบบจัดการการประชุมความคืบหน้ารายสัปดาห์",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="th"
      data-theme="light"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <head>
        {/* Runs before paint so the page never shows the wrong theme first. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="min-h-full flex flex-col">
        <PrefsProvider>{children}</PrefsProvider>
      </body>
    </html>
  );
}
