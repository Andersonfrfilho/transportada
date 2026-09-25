/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readModule(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

describe('first access public route contract', () => {
  test('renders the first-access page before Keycloak initializes, for its own path', async () => {
    const main = await readModule('src/main.tsx')

    const bootstrapFunction = main.slice(main.indexOf('async function bootstrapApplication'))
    const pathCheckIndex = bootstrapFunction.indexOf("'/primeiro-acesso'")
    const keycloakInitIndex = bootstrapFunction.indexOf('await initializeKeycloakAuth()')

    expect(main).toContain('FirstAccessPage')
    expect(pathCheckIndex).toBeGreaterThan(-1)
    expect(keycloakInitIndex).toBeGreaterThan(-1)
    expect(pathCheckIndex).toBeLessThan(keycloakInitIndex)
    expect(bootstrapFunction.slice(0, keycloakInitIndex)).toContain('return')
  })
})

const PUBLIC_PAGES = [
  'FirstAccessPage',
  'PasswordResetPage',
  'UserActivationPage',
  'LoginIdentifierPage',
] as const

/**
 * A faixa de ambiente morava só no `ApplicationShell`: as telas que o `bootstrapApplication` monta
 * antes do login abriam em staging sem aviso nenhum — justamente as que um convidado vê primeiro.
 */
describe('public route environment banner contract', () => {
  test('wraps every public page rendered by the bootstrap in the environment frame', async () => {
    const main = await readModule('src/main.tsx')
    const bootstrapFunction = main.slice(main.indexOf('async function bootstrapApplication'))

    for (const page of PUBLIC_PAGES) {
      const pageIndex = bootstrapFunction.indexOf(`<${page} />`)
      const renderIndex = bootstrapFunction.lastIndexOf('createRoot(', pageIndex)

      expect(pageIndex).toBeGreaterThan(-1)
      expect(bootstrapFunction.slice(renderIndex, pageIndex)).toContain('<PublicRouteFrame>')
    }
  })

  test('the frame shows the deploy environment banner above the page', async () => {
    const main = await readModule('src/main.tsx')
    const frameStart = main.indexOf('function PublicRouteFrame(')
    const frame = main.slice(frameStart, main.indexOf('\n}\n', frameStart))

    expect(frameStart).toBeGreaterThan(-1)
    expect(frame).toContain('className="public-route-frame"')
    const bannerIndex = frame.indexOf('<EnvironmentBanner environment={deploymentEnvironment} />')
    expect(bannerIndex).toBeGreaterThan(-1)
    expect(bannerIndex).toBeLessThan(frame.indexOf('{children}'))
  })

  /** As telas públicas já ocupam a viewport sozinhas; com a faixa acima, sem isso a página rola. */
  test('the frame gives the page only the height the banner leaves', async () => {
    const stylesheet = await readModule('src/styles/index.css')
    const frameRule = stylesheet.slice(
      stylesheet.indexOf('.public-route-frame {'),
      stylesheet.indexOf('}', stylesheet.indexOf('.public-route-frame {')),
    )
    const pageRuleStart = stylesheet.indexOf('.public-route-frame > :last-child {')
    const pageRule = stylesheet.slice(pageRuleStart, stylesheet.indexOf('}', pageRuleStart))

    expect(frameRule).toContain('flex-direction: column')
    expect(frameRule).toContain('min-block-size: 100dvh')
    expect(pageRuleStart).toBeGreaterThan(-1)
    expect(pageRule).toContain('min-height: 0')
    expect(pageRule).toContain('min-block-size: 0')
  })
})
