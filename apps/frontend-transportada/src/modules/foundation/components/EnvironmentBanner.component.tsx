/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ReactNode } from 'react'

import type { DeploymentEnvironment } from '@/modules/shared/deploymentEnvironment.service'

type EnvironmentBannerProps = {
  environment: DeploymentEnvironment
}

const ENVIRONMENT_BANNER_LABELS: Readonly<Record<DeploymentEnvironment, string>> = {
  local: 'Ambiente de desenvolvimento — os dados daqui não valem como registro fiscal.',
  production: '',
  staging: 'Ambiente de homologação (staging) — os dados daqui não valem como registro fiscal.',
}

export function EnvironmentBanner({ environment }: EnvironmentBannerProps): ReactNode {
  if (environment === 'production') {
    return null
  }

  return (
    <div
      className="application-environment-banner"
      data-environment={environment}
      role="status"
      aria-live="polite"
    >
      <span aria-hidden="true">🚧</span>
      <span>{ENVIRONMENT_BANNER_LABELS[environment]}</span>
    </div>
  )
}
