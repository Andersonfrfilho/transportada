import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readSource(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

/**
 * Spec 110 D5b: as ações por viagem são **só de ícone**, e por isso cada uma carrega `aria-label` e
 * uma dica. E o espaço dos **três** fica reservado sempre.
 */
describe('proposal actions contract', () => {
  /**
   * ⚠️ O botão de recalcular só existe na linha alterada. Sem a reserva, as métricas das linhas
   * vizinhas **dançam horizontalmente** quando ele entra — foi o que o usuário viu no preview.
   */
  test('a largura das ações reserva os três botões, apareçam dois ou três', async () => {
    const stylesheet = await readSource('src/modules/trip/styles/trip.module.css')
    const rule = stylesheet.slice(stylesheet.indexOf('.proposalActions {'))

    expect(rule).toContain('width: calc(3 * var(--control-height-compact)')
    expect(rule).toContain('justify-content: flex-end')
  })

  test('todo botão de ícone tem rótulo acessível e dica', async () => {
    const source = await readSource('src/modules/trip/components/TripProposalRow.component.tsx')
    const tooltips = source.match(/<Tooltip label=/g) ?? []
    const labels = source.match(/aria-label=\{t\(/g) ?? []

    /** Três ações: aceitar só esta, descartar esta, recalcular a alterada. */
    expect(tooltips).toHaveLength(3)
    expect(labels).toHaveLength(3)
  })

  /**
   * ⚠️ Botão dentro de botão não existe, e marcar uma viagem para aceitar não pode abrir um detalhe
   * de trinta linhas. A caixa e as ações ficam **fora** do gatilho.
   */
  test('a caixa e as ações ficam fora do gatilho da linha', async () => {
    const source = await readSource('src/modules/trip/components/TripProposalRow.component.tsx')
    const trigger = source.slice(
      source.indexOf('<button className={styles.proposalTrigger}'),
      source.indexOf('</button>'),
    )

    expect(trigger).not.toContain('<Checkbox')
    expect(trigger).not.toContain('<Tooltip')
    expect(source.indexOf('<Checkbox')).toBeLessThan(source.indexOf('proposalTrigger'))
  })

  /**
   * ⚠️ Grade de largura fixa, não `flex`: com flex cada linha se ajusta ao próprio conteúdo e
   * `R$ 541,85` não cai embaixo de `R$ 1.211,97`. Número que não alinha não se compara.
   */
  test('as métricas saem em grade de largura fixa', async () => {
    const stylesheet = await readSource('src/modules/trip/styles/trip.module.css')
    const rule = stylesheet.slice(stylesheet.indexOf('.proposalMetrics {'))

    expect(rule).toContain('display: grid')
    expect(rule).toContain('grid-template-columns: repeat(6, minmax(0, 7.5rem))')
  })

  /**
   * Spec 138: entre 40rem e 64rem a identidade e a grade disputavam a mesma fileira sem quebra —
   * o número vazava por cima do vizinho ("R$ 836,58R$ 1.151,90" colados) e "2.580,601 kg" quebrava
   * no meio da unidade. A grade agora tem `gap` de token, valor com `nowrap`, e desce inteira para
   * a fileira de baixo (nunca disputa espaço espremendo) quando não cabe ao lado da identidade.
   */
  test('a grade reflui por quebra de linha, nunca por espremer a coluna', async () => {
    const stylesheet = await readSource('src/modules/trip/styles/trip.module.css')
    const trigger = stylesheet.slice(
      stylesheet.indexOf('.proposalTrigger {'),
      stylesheet.indexOf('.proposalIdentity {'),
    )
    expect(trigger).toContain('flex-wrap: wrap')

    const metricsRule = stylesheet.slice(
      stylesheet.indexOf('.proposalMetrics {'),
      stylesheet.indexOf('.proposalMetric {'),
    )
    expect(metricsRule).toContain('flex: 1 1 100%')
    expect(metricsRule).toMatch(/gap: var\(--space-\d+\) var\(--space-\d+\)/)
    expect(metricsRule).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))')
    expect(metricsRule).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))')

    const valueRule = stylesheet.slice(stylesheet.indexOf('.proposalMetricValue {'))
    expect(valueRule).toContain('white-space: nowrap')
  })

  /** Nenhum breakpoint deste bloco usa `max-width` — só os quatro `min-width` permitidos. */
  test('a grade e as ações nunca usam max-width', async () => {
    const stylesheet = await readSource('src/modules/trip/styles/trip.module.css')
    const block = stylesheet.slice(
      stylesheet.indexOf('.proposalMetrics {'),
      stylesheet.indexOf('.proposalDetail {'),
    )
    expect(block).not.toMatch(/max-width/)
  })

  /**
   * Spec 138: o realce de hover parava antes da caixa de seleção e antes da fileira de botões — o
   * fundo cobria só o gatilho (`.proposalTrigger:hover`). Hoje ele é do cartão inteiro
   * (`.proposalRow:hover`), e nenhum filho declara hover próprio que o esconderia.
   */
  test('o hover cobre o cartão inteiro, não só o gatilho', async () => {
    const stylesheet = await readSource('src/modules/trip/styles/trip.module.css')

    expect(stylesheet).toContain('.proposalRow:hover {')
    expect(stylesheet).not.toContain('.proposalTrigger:hover {')
  })

  /**
   * Botões e caixa de seleção continuam **dentro** do `<li>` do cartão — nunca um irmão fora dele
   * — para o hover do cartão os alcançar e para eles seguirem clicáveis com o teclado.
   */
  test('as ações continuam dentro do contêiner do cartão', async () => {
    const source = await readSource('src/modules/trip/components/TripProposalRow.component.tsx')
    const card = source.slice(source.indexOf('<li '), source.lastIndexOf('</li>'))

    expect(card).toContain('className={styles.proposalActions}')
    expect(card).toContain('className={styles.proposalCheck}')
    expect(card.indexOf('proposalActions')).toBeGreaterThan(card.indexOf('proposalTrigger'))
  })

  /** As três ações seguem vindo do design system: ícone, botão e dica — nenhum HTML cru. */
  test('as ações usam os componentes do design system', async () => {
    const source = await readSource('src/modules/trip/components/TripProposalRow.component.tsx')

    expect(source).toContain("import { Button } from '@/components/ui/button'")
    expect(source).toContain("import { Icon } from '@/components/ui/icon'")
    expect(source).toContain("import { Tooltip } from '@/components/ui/tooltip'")
  })
})
