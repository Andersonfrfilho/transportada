/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'

import { getLandingApiBaseUrl } from './landingEnvironment.config'
import { DEFAULT_LANDING_SETTINGS, fetchLandingSettings, type LandingSettings } from './landingSettings.service'

const LANDING_SETTINGS_QUERY_KEY = ['landing', 'settings'] as const
const ACCENT_COLOR_PROPERTY = '--color-accent'

/** A cor configurada sobrescreve o token padrão em `:root`; sem cor válida, o token do CSS fica. */
function applyAccentColor(accentColor: string | undefined): void {
  if (accentColor === undefined) return
  document.documentElement.style.setProperty(ACCENT_COLOR_PROPERTY, accentColor)
}

export function useLandingSettings(): { readonly data: LandingSettings; readonly isLoading: boolean } {
  const query = useQuery({
    queryFn: () => fetchLandingSettings({ apiBaseUrl: getLandingApiBaseUrl() }),
    queryKey: LANDING_SETTINGS_QUERY_KEY,
    staleTime: 5 * 60_000,
  })
  const settings = query.data ?? DEFAULT_LANDING_SETTINGS

  useEffect(() => {
    applyAccentColor(settings.accentColor)
  }, [settings.accentColor])

  return { data: settings, isLoading: query.isLoading }
}
