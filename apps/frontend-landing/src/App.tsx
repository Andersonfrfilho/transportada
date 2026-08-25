/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState, type ReactNode } from 'react'

import { Footer } from '@/modules/foundation/components/Footer.component'
import { Header } from '@/modules/foundation/components/Header.component'
import { useLandingSettings } from '@/modules/shared/useLandingSettings.query'
import { ApplicationPage } from './pages/ApplicationPage'
import { HomePage } from './pages/HomePage'

const APPLICATION_PATH = '/cadastro'

export function App(): ReactNode {
  const { data: settings } = useLandingSettings()
  const [pathname, setPathname] = useState(() => window.location.pathname)

  useEffect(() => {
    function syncLocation(): void {
      setPathname(window.location.pathname)
    }
    window.addEventListener('popstate', syncLocation)
    return () => window.removeEventListener('popstate', syncLocation)
  }, [])

  function navigateTo(path: string): void {
    window.history.pushState({}, '', path)
    setPathname(path)
    window.scrollTo({ top: 0 })
  }

  const brandName = settings.brandName ?? 'TransportAdA'
  const isApplicationRoute = pathname === APPLICATION_PATH

  /** A aba do navegador segue a marca configurada; sem configuração, é a plataforma mesmo. */
  useEffect(() => {
    document.title = brandName
  }, [brandName])

  return (
    <>
      <Header
        brandName={brandName}
        onNavigateHome={() => navigateTo('/')}
        onNavigateToApplication={() => navigateTo(APPLICATION_PATH)}
      />
      <main>
        {isApplicationRoute ? (
          <ApplicationPage onNavigateHome={() => navigateTo('/')} settings={settings} />
        ) : (
          <HomePage onNavigateToApplication={() => navigateTo(APPLICATION_PATH)} settings={settings} />
        )}
      </main>
      <Footer
        brandName={brandName}
        onNavigateToApplication={() => navigateTo(APPLICATION_PATH)}
        settings={settings}
      />
    </>
  )
}
