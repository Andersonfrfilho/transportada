/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

const REPOSITORY_ROOT = new URL('../../../../', import.meta.url).pathname
const APPS_DIRECTORY = join(REPOSITORY_ROOT, 'apps')

/**
 * Membro do workspace é diretório **com `package.json`** — o glob `apps/*` do Bun ignora o resto.
 * Diretório de estado de ferramenta (`.omc` e afins) mora ali e não é app.
 */
async function listWorkspaceApps(): Promise<readonly string[]> {
  const entries = await readdir(APPS_DIRECTORY, { withFileTypes: true })
  const candidates = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  const members = await Promise.all(
    candidates.map(async (app) => {
      const isMember = await Bun.file(join(APPS_DIRECTORY, app, 'package.json')).exists()
      return isMember ? app : null
    }),
  )

  return members.filter((app): app is string => app !== null)
}

async function listDockerfileApps(): Promise<readonly string[]> {
  const apps = await listWorkspaceApps()
  const withDockerfile = await Promise.all(
    apps.map(async (app) => {
      const exists = await Bun.file(join(APPS_DIRECTORY, app, 'Dockerfile')).exists()
      return exists ? app : null
    }),
  )

  return withDockerfile.filter((app): app is string => app !== null)
}

/**
 * O workspace da raiz é `apps/*`, e `bun install --frozen-lockfile` compara o `bun.lock` com **todos**
 * os membros. Um `package.json` que não é copiado para a imagem faz o Bun ver um membro sem
 * manifesto, recusar o lockfile, e o build morrer em segundos com "lockfile had changes".
 *
 * Isto já derrubou o deploy três vezes — uma por app nova que nasceu depois dos Dockerfiles. O
 * comentário no topo de cada um deles sempre disse a invariante ("os workspaces Bun exigem o
 * package.json de todas as apps"); o que faltava era alguém verificá-la. É o que este teste faz.
 */
describe('Dockerfile workspace manifests', () => {
  test('every Dockerfile copies the package.json of every app in the workspace', async () => {
    const apps = await listWorkspaceApps()
    const dockerfileApps = await listDockerfileApps()

    expect(dockerfileApps.length).toBeGreaterThan(0)

    for (const owner of dockerfileApps) {
      const dockerfile = await Bun.file(join(APPS_DIRECTORY, owner, 'Dockerfile')).text()
      const missing = apps.filter(
        (app) => !dockerfile.includes(`COPY apps/${app}/package.json apps/${app}/package.json`),
      )

      expect({ dockerfile: owner, missing }).toEqual({ dockerfile: owner, missing: [] })
    }
  })

  /** O lockfile é copiado junto, ou não há com o que comparar os manifestos. */
  test('every Dockerfile copies the root manifest and the lockfile', async () => {
    for (const owner of await listDockerfileApps()) {
      const dockerfile = await Bun.file(join(APPS_DIRECTORY, owner, 'Dockerfile')).text()

      expect(dockerfile).toContain('COPY package.json bun.lock ./')
    }
  })
})
