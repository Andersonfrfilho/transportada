/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ **Link simbólico rastreado é máquina de um desenvolvedor dentro do repositório.**
 *
 * Sete deles entraram sem ninguém ver — `node_modules` na raiz e em cada app —, apontando para
 * `/Users/…/Documents/personal/transportada/…`. No runner do CI eles pendem no vazio, e o
 * `railway up` morre com `IO error … No such file or directory` **sem criar deployment**: gate
 * verde, deploy quebrado, e o erro não nomeia o que o causou.
 *
 * O `.gitignore` dizia `node_modules/`, com a barra — e barra casa **diretório**. Um link simbólico
 * chamado `node_modules` não é diretório para o git, então passava reto. A barra saiu.
 *
 * Este contrato é a rede: qualquer link simbólico novo no índice reprova aqui, com o caminho.
 */
import { describe, expect, test } from 'bun:test'

const SYMLINK_MODE = '120000'

async function trackedSymlinks(): Promise<readonly string[]> {
  const process = Bun.spawn(['git', 'ls-files', '--stage'], {
    cwd: new URL('../../../../', import.meta.url).pathname,
    stdout: 'pipe',
  })
  const output = await new Response(process.stdout).text()

  return output
    .split('\n')
    .filter((line) => line.startsWith(SYMLINK_MODE))
    .map((line) => line.split('\t')[1] ?? '')
}

describe('nenhum link simbólico é versionado', () => {
  test('o índice não carrega caminho de máquina nenhuma', async () => {
    expect(await trackedSymlinks()).toEqual([])
  })
})
