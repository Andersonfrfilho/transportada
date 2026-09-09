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
})
