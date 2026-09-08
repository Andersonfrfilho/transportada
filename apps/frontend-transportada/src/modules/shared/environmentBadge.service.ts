import type { DeploymentEnvironment } from './deploymentEnvironment.service.js'

const FAVICON_SELECTOR = 'link[rel="icon"]'
const WORK_IN_PROGRESS_ICON = '/icons/icon-work-in-progress.svg'

type ApplyEnvironmentBadgeParams = {
  readonly document: Document
  readonly environment: DeploymentEnvironment
}

/**
 * Na aba o ícone é a única coisa que aparece antes do título, então o 🚧 vai dentro dele, à frente
 * da marca — que continua desenhada ao lado, para o aviso não apagar a identidade do produto.
 * O título fica só com o nome: com o 🚧 no ícone, repetí-lo ali punha dois avisos lado a lado.
 *
 * O elemento é **trocado**, não editado: o navegador já buscou o ícone declarado no HTML, e mudar
 * o `href` dele deixa a aba com a marca de produção até um recarregamento forçado.
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
