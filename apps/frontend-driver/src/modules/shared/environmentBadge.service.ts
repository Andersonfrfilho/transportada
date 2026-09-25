/* Cópia por valor de apps/frontend-client/src/modules/shared/environmentBadge.service.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DeploymentEnvironment } from './deploymentEnvironment.service'

const FAVICON_SELECTOR = 'link[rel="icon"]'
const WORK_IN_PROGRESS_ICON = '/icons/icon-work-in-progress.svg'

type ApplyEnvironmentBadgeParams = {
  readonly document: Document
  readonly environment: DeploymentEnvironment
}

/**
 * O elemento é **trocado**, não editado: o navegador já buscou o ícone declarado no HTML, e mudar o
 * `href` dele deixa a aba com a marca de produção até um recarregamento forçado.
 */
export function applyEnvironmentBadge(input: ApplyEnvironmentBadgeParams): void {
  if (input.environment === 'production') {
    return
  }

  const currentFavicon = input.document.querySelector(FAVICON_SELECTOR)
  if (currentFavicon === null) {
    return
  }

  currentFavicon.remove()

  const favicon = input.document.createElement('link')
  favicon.rel = 'icon'
  favicon.type = 'image/svg+xml'
  favicon.href = WORK_IN_PROGRESS_ICON
  input.document.head.appendChild(favicon)
}
