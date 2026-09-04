/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

import {
  CONTENT_SECURITY_POLICY_FILE_NAME,
  EXTERNAL_CONNECT_ORIGIN,
  NON_FETCH_ORIGIN,
  buildContentSecurityPolicy,
} from '../../src/modules/shared/contentSecurityPolicy.service.js'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const API_BASE_URL = 'https://api.exemplo.com.br'
const KEYCLOAK_URL = 'https://identidade.exemplo.com.br/auth'
const ORIGIN_PATTERN = /https:\/\/[a-z0-9.-]+/gu
/** O arquivo que declara a diretiva nomeia toda origem dela: contá-lo faria a varredura se auto-provar. */
const DECLARATION_PATH = 'modules/shared/contentSecurityPolicy.service.ts'

const SERVED_POLICY = buildContentSecurityPolicy({
  allowsInlineScript: false,
  apiBaseUrl: API_BASE_URL,
  keycloakUrl: KEYCLOAK_URL,
  mapTilesUrl: undefined,
})

function directiveOf(policy: string, name: string): string {
  const directive = policy.split('; ').find((entry) => entry.startsWith(`${name} `))
  if (directive === undefined) {
    throw new Error(`CONTENT_SECURITY_POLICY_MISSING_DIRECTIVE_${name}`)
  }
  return directive
}

/**
 * A diretiva não se descobre por lista escrita à mão: quem procura os destinos é o teste, varrendo o
 * que o bundle realmente nomeia. Endereço novo em qualquer módulo cai aqui, e a única saída é
 * decidir — entra no `connect-src` ou entra em `NON_FETCH_ORIGIN` como origem que nunca é buscada.
 */
async function collectSourceOrigins(
  input: Readonly<{ skipsDeclaration: boolean }> = { skipsDeclaration: false },
): Promise<readonly string[]> {
  const origins = new Set<string>()
  const glob = new Bun.Glob('**/*.{ts,tsx,css,json}')

  for await (const relativePath of glob.scan({
    cwd: fileURLToPath(new URL('src', APPLICATION_ROOT)),
  })) {
    if (input.skipsDeclaration && relativePath === DECLARATION_PATH) continue
    const content = await Bun.file(
      fileURLToPath(new URL(`src/${relativePath}`, APPLICATION_ROOT)),
    ).text()

    for (const match of content.matchAll(ORIGIN_PATTERN)) {
      origins.add(match[0].replace(/\.$/u, ''))
    }
  }

  return [...origins].sort()
}

/**
 * Os hosts de telha de mapa mais comuns. A lista não precisa ser exaustiva para o contrato valer:
 * ela é a rede que pega a tentativa **óbvia**, que é a que acontece.
 */
const TILE_HOST = [
  'tile.openstreetmap.org',
  'tiles.openstreetmap.org',
  'basemaps.cartocdn.com',
  'api.mapbox.com',
  'api.maptiler.com',
  'maps.googleapis.com',
  'server.arcgisonline.com',
  'tile.thunderforest.com',
] as const

describe('content security policy', () => {
  /**
   * ⚠️ A ADR-0044 §6 decidiu o mapa deste produto e **cobrou este contrato por escrito** — ele não
   * existia, e por isso a proibição era só prosa. O motivo é o da ADR-0047, que ela mantém de pé:
   * endereço de cliente é dado pessoal, e uma URL de telha é um log de servidor alheio — a
   * coordenada da parada viaja na própria URL.
   *
   * O mapa de rua deste produto é PMTiles servido do nosso domínio. Quem precisar de telha de
   * terceiro reabre a ADR primeiro, e este teste é onde a conversa começa.
   */
  test('never allows a third-party map tile host, in any directive', () => {
    for (const host of TILE_HOST) {
      expect(`${host}:${SERVED_POLICY.includes(host)}`).toBe(`${host}:false`)
    }
  })

  test('carries every external origin the bundle names, or declares it as never fetched', async () => {
    const connectSource = directiveOf(SERVED_POLICY, 'connect-src')
    const sourceOrigins = await collectSourceOrigins()

    expect(sourceOrigins.length).toBeGreaterThan(0)
    for (const origin of sourceOrigins) {
      const isDeclared =
        connectSource.includes(origin) || (NON_FETCH_ORIGIN as readonly string[]).includes(origin)
      expect(`${origin}:${isDeclared}`).toBe(`${origin}:true`)
    }
  })

  /**
   * A outra direção da mesma varredura, e a que faltava: destino que saiu do bundle tem de sair da
   * diretiva. Origem órfã não quebra nada visível — ela só continua permitindo uma saída que ninguém
   * mais usa, que é exatamente o que a diretiva existe para negar.
   */
  test('carries no origin the bundle stopped fetching', async () => {
    const namedOrigins = await collectSourceOrigins({ skipsDeclaration: true })

    for (const origin of EXTERNAL_CONNECT_ORIGIN) {
      const isNamed = namedOrigins.some((named) => named === origin)
      expect(`${origin}:${isNamed}`).toBe(`${origin}:true`)
    }
  })

  test('carries the api and the keycloak origins, without the path', () => {
    const connectSource = directiveOf(SERVED_POLICY, 'connect-src')

    expect(connectSource).toContain(API_BASE_URL)
    expect(connectSource).toContain('https://identidade.exemplo.com.br')
    expect(connectSource).not.toContain('/auth')
  })

  // O `iframe` do mapa saiu pela ADR-0037 e o Keycloak roda com `checkLoginIframe: false`: não há
  // moldura nenhuma no bundle, e é isso que a diretiva declara.
  test('forbids frames in both directions', () => {
    expect(SERVED_POLICY).toContain("frame-src 'none'")
    expect(SERVED_POLICY).toContain("frame-ancestors 'none'")
    expect(SERVED_POLICY).toContain("object-src 'none'")
  })

  /**
   * `wasm-unsafe-eval` não é `unsafe-eval`: ela libera **só** a compilação de WebAssembly, que o
   * recorte de fundo faz no navegador, e o `.wasm` continua tendo de vir de `'self'`. Sem ela o
   * runtime é bloqueado na compilação, e o erro aparece como "falha ao iniciar o modelo".
   */
  test('never relaxes script execution in what is served', () => {
    expect(directiveOf(SERVED_POLICY, 'script-src')).toBe("script-src 'self' 'wasm-unsafe-eval'")
    /** O `wasm-` é o que separa compilar WebAssembly de executar string arbitrária como código. */
    expect(SERVED_POLICY).not.toContain("'unsafe-eval'")
    expect(SERVED_POLICY).toContain("default-src 'self'")
  })

  // A camada flutuante posiciona o painel por atributo `style`, que nonce não cobre. A folga é de
  // estilo e só de estilo — se ela vazar para `script-src`, o teste acima falha.
  test('relaxes inline only for style, and inline script only for the dev server', () => {
    expect(directiveOf(SERVED_POLICY, 'style-src')).toBe("style-src 'self' 'unsafe-inline'")
    expect(
      directiveOf(
        buildContentSecurityPolicy({
          allowsInlineScript: true,
          apiBaseUrl: API_BASE_URL,
          keycloakUrl: KEYCLOAK_URL,
          mapTilesUrl: undefined,
        }),
        'script-src',
      ),
    ).toBe("script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline'")
  })

  test('survives the quality job, which builds without any environment file', () => {
    const policy = buildContentSecurityPolicy({
      allowsInlineScript: false,
      apiBaseUrl: undefined,
      keycloakUrl: '',
      mapTilesUrl: undefined,
    })

    expect(directiveOf(policy, 'connect-src')).toContain("'self'")
    expect(policy).toContain('https://photon.komoot.io')
  })

  test('refuses a declared origin it cannot read, instead of shipping a narrower directive', () => {
    expect(() =>
      buildContentSecurityPolicy({
        allowsInlineScript: false,
        apiBaseUrl: 'api.exemplo.com.br',
        keycloakUrl: KEYCLOAK_URL,
        mapTilesUrl: undefined,
      }),
    ).toThrow()
  })
})

/**
 * O conteúdo da diretiva é testado de verdade acima. Estas duas asserções são textuais porque o que
 * elas guardam é a costura: o plugin que emite o arquivo e o servidor que se recusa a subir sem ele.
 * Costura rompida não quebra nenhum teste de comportamento — publica sem cabeçalho, calada.
 */
describe('the policy reaches the served response', () => {
  test('is emitted by the build and read by the static server', async () => {
    const viteConfig = await Bun.file(
      fileURLToPath(new URL('vite.config.ts', APPLICATION_ROOT)),
    ).text()
    const staticServer = await Bun.file(
      fileURLToPath(new URL('server.ts', APPLICATION_ROOT)),
    ).text()

    expect(viteConfig).toContain('contentSecurityPolicyPlugin()')
    expect(viteConfig).toContain('CONTENT_SECURITY_POLICY_FILE_NAME')
    expect(staticServer).toContain(CONTENT_SECURITY_POLICY_FILE_NAME)
    expect(staticServer).toContain("'Content-Security-Policy': contentSecurityPolicy")
    expect(staticServer).toContain('FRONTEND_MISSING_CONTENT_SECURITY_POLICY')
  })
})
