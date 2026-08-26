/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo, useState, type ReactNode } from 'react'

import { getLandingApiBaseUrl } from '@/modules/shared/landingEnvironment.config'
import { PortalAuthForms } from '@/modules/portal/components/PortalAuthForms.component'
import { PortalDashboard } from '@/modules/portal/components/PortalDashboard.component'
import { createPortalClient, type PortalSession } from '@/modules/portal/shared/portalClient.service'
import { clearStoredAccessToken, getStoredAccessToken } from '@/modules/portal/shared/portalSession.service'

export function PortalPage(): ReactNode {
  const client = useMemo(() => createPortalClient({ apiBaseUrl: getLandingApiBaseUrl() }), [])
  const [session, setSession] = useState<PortalSession | null>(() => {
    const storedToken = getStoredAccessToken()
    return storedToken === undefined
      ? null
      : { accessToken: storedToken, expiresInSeconds: 0, user: { email: '', id: '', isActive: true, name: '' } }
  })

  function handleLoggedOut(): void {
    clearStoredAccessToken()
    setSession(null)
  }

  if (session === null) {
    return <PortalAuthForms client={client} onAuthenticated={setSession} />
  }

  return <PortalDashboard client={client} onLoggedOut={handleLoggedOut} />
}
