/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DeploymentEnvironment } from './deploymentEnvironment.service.js'

const WORK_IN_PROGRESS_MARK = '🚧'
const FAVICON_SELECTOR = 'link[rel="icon"]'
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><text x="1" y="26" font-size="27">${WORK_IN_PROGRESS_MARK}</text></svg>`

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

export function buildEnvironmentFaviconHref(
  environment: DeploymentEnvironment,
): string | undefined {
  if (environment === 'production') {
    return undefined
  }

  return `data:image/svg+xml,${encodeURIComponent(FAVICON_SVG)}`
}

/** O 🚧 na aba é o único aviso visível quando a janela está minimizada ou o painel, rolado. */
export function applyEnvironmentBadge(input: ApplyEnvironmentBadgeParams): void {
  const href = buildEnvironmentFaviconHref(input.environment)

  if (href === undefined) {
    return
  }

  const link = input.document.querySelector(FAVICON_SELECTOR)

  if (link !== null) {
    link.href = href
  }

  if (!input.document.title.startsWith(WORK_IN_PROGRESS_MARK)) {
    input.document.title = `${WORK_IN_PROGRESS_MARK} ${input.document.title}`
  }
}
