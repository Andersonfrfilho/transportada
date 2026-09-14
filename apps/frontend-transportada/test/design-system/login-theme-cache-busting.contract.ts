/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'

const REPOSITORY_ROOT = new URL('../../../..', import.meta.url)
const THEME_LOGIN = 'deploy/keycloak/theme/login/'
const THEME_PROPERTIES = `${THEME_LOGIN}theme.properties`
const THEME_TEMPLATE = `${THEME_LOGIN}template.ftl`
const DOCKERFILE = 'deploy/keycloak/Dockerfile'
const VERSION_QUERY = '?v=${resourcesVersion}'
// Recurso do `base`, não nosso: a URL já muda com a versão do servidor, que é quem o altera.
const SERVER_OWNED_RESOURCES = new Set(['js/authChecker.js'])

function repositoryFile(filePath: string) {
  return Bun.file(new URL(filePath, REPOSITORY_ROOT))
}

async function readThemeTemplates(): Promise<ReadonlyArray<{ name: string; source: string }>> {
  const entries = await readdir(new URL(THEME_LOGIN, REPOSITORY_ROOT))
  const templateNames = entries.filter((entry) => entry.endsWith('.ftl'))
  return Promise.all(
    templateNames.map(async (name) => ({
      name,
      source: await repositoryFile(`${THEME_LOGIN}${name}`).text(),
    })),
  )
}

/**
 * ⚠️ O Keycloak serve `/resources/<versão-do-servidor>/login/transportada/...` com
 * `Cache-Control: max-age=2592000` — 30 dias. A versão do caminho é a do **servidor**, então tema
 * novo com o mesmo Keycloak chegava a um navegador que guardou o CSS antigo: em 14/09/2026 a faixa
 * de ambiente apareceu sem estilo em staging até um recarregamento forçado. O `?v=` com o hash do
 * conteúdo do tema é o que muda a URL a cada mudança, sem ninguém lembrar de subir número.
 */
describe('login theme cache busting contract', () => {
  test('every theme resource the templates reference carries the content version', async () => {
    const templates = await readThemeTemplates()
    const unversioned: string[] = []
    let versionedCount = 0

    for (const { name, source } of templates) {
      for (const match of source.matchAll(/\$\{url\.resourcesPath\}\/([^"?\s]+)(\?v=[^"\s]*)?/g)) {
        const resource = match[1] ?? ''
        if (SERVER_OWNED_RESOURCES.has(resource)) continue
        if (match[2] === VERSION_QUERY) {
          versionedCount += 1
          continue
        }
        unversioned.push(`${name}: ${resource}`)
      }
    }

    expect(unversioned).toEqual([])
    // Ícones, favicon, color-theme.js, o laço de `styles=`, o de `scripts=` e a marca do rodapé
    expect(versionedCount).toBeGreaterThanOrEqual(7)
  })

  test('the stylesheet loop fed by styles= appends the version to the href', async () => {
    const template = await repositoryFile(THEME_TEMPLATE).text()

    expect(template).toContain(`<link href="\${url.resourcesPath}/\${style}${VERSION_QUERY}"`)
    expect(template).toContain(`<script src="\${url.resourcesPath}/\${script}${VERSION_QUERY}"`)
  })

  /** `<#global>`, não `<#assign>`: o `footer.ftl` é importado como namespace e não vê o `assign`. */
  test('the template reads the version from the theme properties with a safe default', async () => {
    const template = await repositoryFile(THEME_TEMPLATE).text()

    expect(template).toContain('<#global resourcesVersion = properties.resourcesVersion!"dev" />')
  })

  test('theme.properties declares the version with a default the image build replaces', async () => {
    const properties = await repositoryFile(THEME_PROPERTIES).text()

    expect(properties).toMatch(/^resourcesVersion=dev$/m)
  })

  test('the image derives the version from the theme content, not from date, hand or git', async () => {
    const dockerfile = await repositoryFile(DOCKERFILE).text()
    const stampStart = dockerfile.indexOf('RUN version=')
    const stamp = dockerfile.slice(stampStart, dockerfile.indexOf('\n\n', stampStart))

    expect(stampStart).toBeGreaterThan(-1)
    expect(stamp).toMatch(/find \. -type f -print0 \| LC_ALL=C sort -z \| xargs -0 sha256sum/)
    expect(stamp).toContain('| sha256sum | cut -c1-12')
    expect(stamp).toMatch(/sed -i "s\/\^resourcesVersion=\.\*\/resourcesVersion=\$\{?\w+\}?\/"/)
    expect(stamp).not.toMatch(/\bdate\b/)
    expect(stamp).not.toMatch(/\bgit\b/)
    expect(dockerfile).not.toMatch(/^ARG\s/m)
    // Um COPY só do tema: um segundo, cru, sobrescreveria o `theme.properties` carimbado.
    expect(dockerfile.match(/COPY\b[^\n]*deploy\/keycloak\/theme\b/g)?.length).toBe(1)
  })
})
