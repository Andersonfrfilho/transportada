/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState, type ReactNode } from 'react'

import { EnvironmentBanner } from '@/modules/foundation/components/EnvironmentBanner.component'
import { Footer } from '@/modules/foundation/components/Footer.component'
import { Header } from '@/modules/foundation/components/Header.component'
import { resolveLegalDocumentKey } from '@/modules/legal/shared/legalDocuments.service'
import { getDeploymentEnvironment } from '@/modules/shared/deploymentEnvironment.service'
import { useLandingSettings } from '@/modules/shared/useLandingSettings.query'
import { ApplicationPage } from './pages/ApplicationPage'
import { HomePage } from './pages/HomePage'
import { LegalPage } from './pages/LegalPage'
import { PortalPage } from './pages/PortalPage'

const APPLICATION_PATH = '/cadastro'
const PORTAL_PATH = '/portal'
const deploymentEnvironment = getDeploymentEnvironment()

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
  const isPortalRoute = pathname === PORTAL_PATH
  const legalDocumentKey = resolveLegalDocumentKey(pathname)

  /** A aba do navegador segue a marca configurada; sem configuração, é a plataforma mesmo. */
  useEffect(() => {
    document.title = brandName
  }, [brandName])

  return (
    <>
      <EnvironmentBanner environment={deploymentEnvironment} />
      <Header
        brandName={brandName}
        onNavigateHome={() => navigateTo('/')}
        onNavigateToApplication={() => navigateTo(APPLICATION_PATH)}
      />
      <main>
        {isApplicationRoute ? (
          <ApplicationPage onNavigateHome={() => navigateTo('/')} settings={settings} />
        ) : isPortalRoute ? (
          <PortalPage />
        ) : legalDocumentKey === undefined ? (
          <HomePage
            onNavigateToApplication={() => navigateTo(APPLICATION_PATH)}
            settings={settings}
          />
        ) : (
          <LegalPage
            documentKey={legalDocumentKey}
            onNavigateHome={() => navigateTo('/')}
            settings={settings}
          />
        )}
      </main>
      <Footer
        brandName={brandName}
        onNavigateTo={navigateTo}
        onNavigateToApplication={() => navigateTo(APPLICATION_PATH)}
        settings={settings}
      />
    </>
  )
}
