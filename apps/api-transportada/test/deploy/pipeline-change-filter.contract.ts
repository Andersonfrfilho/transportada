/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readdir } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

const REPOSITORY_ROOT = new URL('../../../../', import.meta.url)
const DEPLOY_WORKFLOW_PATH = new URL('.github/workflows/deploy.yml', REPOSITORY_ROOT)
const CI_WORKFLOW_PATH = new URL('.github/workflows/ci.yml', REPOSITORY_ROOT)
const FILTER_SCRIPT_PATH = new URL('.github/scripts/changed-targets.sh', REPOSITORY_ROOT)

/** `api) echo 'apps/api-transportada/ deploy/api/ ...' ;;` — um alvo por ramo do `case`. */
const TARGET_PATHS_PATTERN = /^\s+([a-z]+)\) echo '([^']+)' ;;$/gm

async function read(path: URL): Promise<string> {
  return Bun.file(path).text()
}

async function targetPaths(): Promise<Map<string, readonly string[]>> {
  const script = await read(FILTER_SCRIPT_PATH)
  const targets = new Map<string, readonly string[]>()
  for (const [, target, paths] of script.matchAll(TARGET_PATHS_PATTERN)) {
    if (target !== undefined && paths !== undefined) {
      targets.set(
        target,
        paths.split(' ').filter((path) => path !== ''),
      )
    }
  }
  return targets
}

/**
 * O filtro só é seguro porque o acoplamento entre apps é zero por construção: o `COPY` do
 * Dockerfile de cada serviço traz a própria pasta em `apps/` e os manifestos da raiz, e nada de
 * outra app. Não existe `packages/`, e `CLAUDE.md` proíbe uma app importar código-fonte de outra.
 *
 * O que estes contratos cobram é que o filtro não possa mentir sobre esse recorte — e que a
 * ignorância continue publicando, nunca pulando.
 */
describe('contrato do filtro de mudança do pipeline', () => {
  /**
   * App nova em `apps/` sem alvo no filtro não cai em ramo nenhum: ela simplesmente nunca publica,
   * e nada fica vermelho para avisar. É o mesmo silêncio do `Keycloak inalterado`, numa app inteira.
   */
  test('toda app do monorepo tem alvo declarado no filtro', async () => {
    const entries = await readdir(new URL('apps/', REPOSITORY_ROOT), { withFileTypes: true })
    // App é o que o workspace `apps/*` publica, e o que o workspace enxerga é `package.json`.
    // Diretório de ferramenta (`.omc/`) não é app e não tem imagem para publicar.
    const applications = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => ({
          isApplication: await Bun.file(
            new URL(`apps/${entry.name}/package.json`, REPOSITORY_ROOT),
          ).exists(),
          name: entry.name,
        })),
    )
    const declared = [...(await targetPaths()).values()].flat()

    expect(applications.filter(({ isApplication }) => isApplication)).toHaveLength(5)
    for (const { isApplication, name } of applications) {
      if (isApplication) {
        expect(declared).toContain(`apps/${name}/`)
      }
    }
  })

  /**
   * O lockfile e o `package.json` da raiz entram em toda imagem pelo estágio `manifests`, e
   * `.github/` é o próprio pipeline. Mudança neles que não fure todos os alvos publica imagem com
   * dependência velha — e o sintoma aparece em runtime, não no build.
   */
  test('lockfile, manifesto da raiz e pipeline atingem toda app', async () => {
    const script = await read(FILTER_SCRIPT_PATH)

    expect(script).toMatch(/^readonly SHARED_PATHS='package\.json bun\.lock \.github\/'$/m)
  })

  /**
   * Quem publica o Keycloak e reconcilia o realm é o job da API. Se `deploy/keycloak/` e `realm/`
   * não marcarem o alvo `api`, o tema de login volta a ficar fora do ar sem ninguém notar — que é
   * exatamente o defeito de quatro dias que o passo de identidade documenta.
   */
  test('o tema e o realm do Keycloak marcam o alvo que os publica', async () => {
    const paths = (await targetPaths()).get('api') ?? []

    expect(paths).toContain('deploy/keycloak/')
    expect(paths).toContain('realm/')
  })

  /**
   * Eram quatro serviços separados por `CRON_JOB`, e um alvo só cobria os quatro. Hoje é um serviço
   * (spec 052): o alvo continua sendo um, e continua carregando a app inteira — recortar por trilho
   * exigiria manter à mão a lista de pastas transversais (`config/`, `database/`, `main.ts`), e uma
   * esquecida deixa a batida rodando schema velho contra tabela nova, sem ninguém olhando.
   */
  test('o serviço de cron carrega a app inteira', async () => {
    const paths = (await targetPaths()).get('cron') ?? []

    expect(paths).toContain('deploy/cron/')
    expect(paths).toContain('apps/cron-transportada/')
  })

  /** Baseline inutilizável é dúvida, e dúvida publica. Nunca cai no ramo do "nada mudou". */
  test('baseline ausente ou inalcançável publica todos os alvos', async () => {
    const script = await read(FILTER_SCRIPT_PATH)

    // O baseline passou a ser por alvo (`refs/deploy/<env>/<alvo>`), então a dúvida também é por
    // alvo: cada um publica sozinho, e só o caso "sem marco nenhum" ainda publica todos de uma vez.
    expect(script).toContain("emit_all 'sem marco de deploy e sem baseline")
    expect(script).toContain('git cat-file -e')
    expect(script).toContain('sem baseline utilizável — publica')
    expect(script).toContain('git diff falhou contra $baseline — publica')
  })

  /** Erro de `git` engolido vira "nada mudou" — foi assim que o tema de login sumiu. */
  test('o diff do filtro não engole a saída de erro do git', async () => {
    const script = await read(FILTER_SCRIPT_PATH)

    expect(script).not.toContain('git diff --name-only "$baseline" HEAD 2>/dev/null')
  })

  /**
   * Produção publica tudo, sempre. Ter os sete serviços comprovadamente saídos do mesmo commit vale
   * mais que os minutos economizados: sem isso, "os serviços estão em `abc123`" vira sete perguntas
   * separadas justamente quando algo quebra.
   */
  test('produção não filtra', async () => {
    const workflow = await read(DEPLOY_WORKFLOW_PATH)

    expect(workflow).toContain("github.ref_name == 'main'")
    expect(workflow).toMatch(/FORCE_ALL:.*inputs\.force_all/)
  })

  /**
   * ⚠️ Job pulado propaga `skipped` para quem depende dele. Sem `always()`, API inalterada mais
   * worker alterado deixaria o worker sem publicar **em silêncio** — e `always()` também ignora
   * falha e cancelamento, que por isso precisam ser conferidos na mão. A ordem que importa é a
   * mesma de antes: ninguém sobe contra um banco sem a migration da API.
   */
  test('API pulada não impede o worker de publicar, e API falha impede', async () => {
    const workflow = await read(DEPLOY_WORKFLOW_PATH)

    expect(workflow).toContain("needs.deploy-api.result != 'failure'")
    expect(workflow).toContain("needs.deploy-api.result != 'cancelled'")
    expect(workflow).toMatch(/if: >-\s+always\(\)\s+&& needs\.target\.result == 'success'/)
  })

  /**
   * É `gate / quality` que a proteção da main exige. Com matriz o contexto vira `gate / quality
   * (api)` — um nome por app, conjunto que muda a cada commit —, e o PR que não toca na API
   * travaria para sempre esperando um check que nunca vem. O agregador é o que mantém o nome fixo.
   */
  test('o gate mantém o contexto `quality` fixo acima da matriz', async () => {
    const workflow = await read(CI_WORKFLOW_PATH)

    expect(workflow).toMatch(/^ {2}quality:\n {4}if: always\(\)\n {4}needs: quality-app$/m)
  })

  /** Matriz vermelha com `fail-fast: false` não pode virar gate verde. */
  test('o agregador reprova matriz vermelha e aceita matriz pulada', async () => {
    const workflow = await read(CI_WORKFLOW_PATH)

    expect(workflow).toContain('success|skipped)')
    expect(workflow).toContain('::error::quality-app terminou em')
  })
})
