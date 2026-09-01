/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DeploymentEnvironment } from './deploymentEnvironment.service.js'

const FAVICON_SELECTOR = 'link[rel="icon"]'
const WORK_IN_PROGRESS_ICON = '/icons/icon-work-in-progress.svg'

type FaviconLink = {
  href: string
}

type BadgeableDocument = {
  title: string
  querySelector: (selectors: string) => FaviconLink | null
}

type ApplyEnvironmentBadgeParams = {
  readonly document: BadgeableDocument
  readonly environment: DeploymentEnvironment
}

/**
 * Na aba o ícone é a única coisa que aparece antes do título, então o 🚧 vai dentro dele, à frente
 * da marca — que continua desenhada ao lado, para o aviso não apagar a identidade do produto.
 * O título fica só com o nome: com o 🚧 no ícone, repetí-lo ali punha dois avisos lado a lado.
 */
export function applyEnvironmentBadge(input: ApplyEnvironmentBadgeParams): void {
  if (input.environment === 'production') {
    return
  }

  const favicon = input.document.querySelector(FAVICON_SELECTOR)
  if (favicon === null) {
    return
  }

  favicon.href = WORK_IN_PROGRESS_ICON
}
