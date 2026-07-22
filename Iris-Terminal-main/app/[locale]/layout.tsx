import { Toaster } from "@/components/ui/sonner"
import { GlobalState } from "@/components/utility/global-state"
import { Providers } from "@/components/utility/providers"
import TranslationsProvider from "@/components/utility/translations-provider"
import initTranslations from "@/lib/i18n"
import {
  PROJECT_DESCRIPTION,
  PROJECT_NAME,
  PROJECT_TITLE
} from "@/lib/project-config"
import { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import { ReactNode } from "react"
import "katex/dist/katex.min.css"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

interface RootLayoutProps {
  children: ReactNode
  params: {
    locale: string
  }
}

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3000"),
  applicationName: PROJECT_NAME,
  title: {
    default: PROJECT_TITLE,
    template: `%s - ${PROJECT_NAME}`
  },
  description: PROJECT_DESCRIPTION,
  manifest: "/manifest.json",
  icons: {
    icon: "/branding/logo.jpg",
    apple: "/branding/logo.jpg"
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: PROJECT_TITLE
  },
  formatDetection: {
    telephone: false
  },
  openGraph: {
    type: "website",
    siteName: PROJECT_NAME,
    title: {
      default: PROJECT_TITLE,
      template: `%s - ${PROJECT_NAME}`
    },
    description: PROJECT_DESCRIPTION,
    images: [{ url: "/branding/logo.jpg" }]
  },
  twitter: {
    card: "summary",
    title: {
      default: PROJECT_TITLE,
      template: `%s - ${PROJECT_NAME}`
    },
    description: PROJECT_DESCRIPTION,
    images: ["/branding/logo.jpg"]
  }
}

export const viewport: Viewport = {
  themeColor: "#0f1115"
}

const i18nNamespaces = ["translation"]

export default async function RootLayout({
  children,
  params: { locale }
}: RootLayoutProps) {
  const { resources } = await initTranslations(locale, i18nNamespaces)

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={inter.className}>
        <Providers attribute="class" defaultTheme="dark">
          <TranslationsProvider
            namespaces={i18nNamespaces}
            locale={locale}
            resources={resources}
          >
            <Toaster richColors position="top-center" duration={3000} />
            <div className="relative flex h-dvh flex-col items-center overflow-x-auto">
              <div
                className="manor-bg pointer-events-none"
                aria-hidden="true"
              />
              <div
                className="manor-bg-mask pointer-events-none"
                aria-hidden="true"
              />
              <div className="relative z-10 flex size-full flex-col">
                <GlobalState>{children}</GlobalState>
              </div>
            </div>
          </TranslationsProvider>
        </Providers>
      </body>
    </html>
  )
}
