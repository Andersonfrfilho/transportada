/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'

const THEME_DIRECTORY = new URL('../../../../deploy/keycloak/theme/login/', import.meta.url)
const FORK_MARKER_PATH = new URL(
  '../../../../deploy/keycloak/theme/forked-from.properties',
  import.meta.url,
)
const DOCKERFILE_PATH = new URL('../../../../deploy/keycloak/Dockerfile', import.meta.url)
const COMPOSE_PATH = new URL('../../../../compose.yaml', import.meta.url)

/** `chave=valor` por linha, comentário com `#` — o formato que o próprio Keycloak usa em tema. */
async function readMarker(): Promise<Readonly<Record<string, string>>> {
  const text = await Bun.file(FORK_MARKER_PATH).text()
  const entries = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const separator = line.indexOf('=')
      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()] as const
    })
  return Object.fromEntries(entries)
}

/** `quay.io/keycloak/keycloak:26.5.2@sha256:…` → `26.5.2` */
function imageVersionOf(text: string): string | undefined {
  return /quay\.io\/keycloak\/keycloak:([0-9][^@\s"']*)/.exec(text)?.[1]
}

/**
 * O tema bifurca templates do `base` da imagem: `template.ftl` e companhia são cópias de uma versão
 * específica do Keycloak. Num upgrade os templates de cima mudam — campo novo, macro nova, chave de
 * mensagem nova — e as nossas cópias seguem na forma antiga **caladas**: a tela continua com a nossa
 * marca e passa no smoke do tema, faltando o que o Keycloak novo espera.
 *
 * Este contrato existe para o bump não depender de alguém lembrar: subir a imagem sem revisitar o
 * tema reprova, e a mensagem diz o que comparar.
 */
describe('contrato do tema bifurcado do Keycloak', () => {
  /** Versão declarada e imagem andam juntas, senão o marcador vira folclore. */
  test('a versão bifurcada acompanha a imagem do Keycloak', async () => {
    const marker = await readMarker()
    const dockerfileVersion = imageVersionOf(await Bun.file(DOCKERFILE_PATH).text())

    expect(dockerfileVersion).toBeDefined()
    expect(marker['keycloak.version']).toBe(dockerfileVersion)
  })

  /** Ambiente local e publicado servem a mesma tela: duas versões de imagem seriam dois temas. */
  test('o compose roda a mesma versão de Keycloak que a imagem publicada', async () => {
    const dockerfileVersion = imageVersionOf(await Bun.file(DOCKERFILE_PATH).text())

    expect(imageVersionOf(await Bun.file(COMPOSE_PATH).text())).toBe(dockerfileVersion)
  })

  /** Template bifurcado fora da lista é o que ninguém vai re-diffar no upgrade. */
  test('todo template bifurcado está declarado no marcador', async () => {
    const marker = await readMarker()
    const declared = (marker['forked.templates'] ?? '')
      .split(/\s+/)
      .filter((name) => name.length > 0)
    const present = (await readdir(Bun.fileURLToPath(THEME_DIRECTORY))).filter((name) =>
      name.endsWith('.ftl'),
    )

    expect([...declared].sort()).toEqual([...present].sort())
  })
})

/**
 * ⚠️ Achado por captura de tela em staging: a tela de login do Keycloak abria com o nome do
 * **produto** e o slogan de venda dele — "Importa NF-e, calcula frete e emite CT-e em lote." —,
 * enquanto a tela de entrada da app abre com a marca da **transportadora**.
 *
 * Cada deploy é de uma transportadora só (ADR-0021). Estampar o fornecedor no lugar do cliente é o
 * avesso disso, e é a mesma decisão que `fix(notification): a prévia assina com a marca da
 * instalação` já tinha tomado para o e-mail.
 *
 * O tema não alcança a nossa API para ler a marca — ele é FreeMarker dentro do Keycloak. O que ele
 * tem é `realm.displayName`, que é justamente o nome da instalação.
 */
describe('a tela de login assina com a marca da instalação (ADR-0021)', () => {
  test('o cabeçalho lidera com a instalação, e o produto é o que sobra sem ela', async () => {
    const template = await Bun.file(new URL('template.ftl', THEME_DIRECTORY)).text()
    // ⚠️ A conta é sobre o que se **lê**, não sobre o `aria-label` da seção — ele já cita a
    // instalação, e medi-lo faria este teste passar com o slogan intacto no topo.
    const wordmark = template.slice(
      template.indexOf('class="brand-wordmark"'),
      template.indexOf('</p>', template.indexOf('class="brand-wordmark"')),
    )

    expect(wordmark).toInclude('realm.displayName')
  })

  /** Slogan de venda não tem o que fazer na porta de quem já é cliente. */
  test('não vende o produto para quem já comprou', async () => {
    const mensagens = await Bun.file(
      new URL('messages/messages_pt_BR.properties', THEME_DIRECTORY),
    ).text()

    expect(mensagens).not.toInclude('transportadaTagline=')
  })
})
