import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readSource(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

/**
 * Spec 110 D6: **editar invalida os números, e o aceite espera o recálculo.**
 *
 * ⚠️ O achado que fechou a `[NEEDS CLARIFICATION]`: o aceite parte dos **grupos do servidor**, não do
 * que o cliente desenhou. Uma edição que só existisse no cliente seria ignorada — o operador veria
 * uma distribuição e receberia outra.
 */
describe('proposal edit contract', () => {
  test('o aceite é recusado enquanto a proposta estiver alterada', async () => {
    const source = await readSource('src/modules/trip/components/TripProposalList.component.tsx')

    expect(source).toContain(
      'disabled={isAccepting || isEdited || hasUnsavedEdits || summary.selectedCount === 0}',
    )
  })

  /**
   * ⚠️ **Da proposta, não de um caminhão.** Tirar uma parada muda o maço, e o maço decide a
   * distribuição inteira: um botão "recalcular este caminhão" prometeria um recorte que o solver
   * não faz.
   */
  test('o recálculo é da proposta inteira', async () => {
    const list = await readSource('src/modules/trip/components/TripProposalList.component.tsx')
    const locale = await readSource('src/modules/trip/locales/trip.locale.json')

    expect(list).toContain('onRecalculate: () => void')
    expect(locale).toContain('Recalcular a proposta')
  })

  /** ⚠️ A remoção só vira efeito no recálculo: é ele que tira as notas do maço. */
  test('o recálculo é o que honra a remoção', async () => {
    const hook = await readSource('src/modules/trip/hooks/useTripRouteAssembly.hook.ts')

    expect(hook).toContain('.filter((document) => !pendingRemovals.has(document.id))')
  })

  /** Riscada, não sumida: nada é destruído antes do recálculo, e o desfazer precisa dela na tela. */
  test('a parada tirada continua desenhada, com desfazer', async () => {
    const source = await readSource('src/modules/trip/components/TripAssemblyMap.component.tsx')

    expect(source).toContain('removedNoteIds')
    expect(source).toContain("t('assemblyMap.undoRemoveStop')")
  })

  /**
   * ⚠️ **Mover para outro caminhão não existe nesta feature**, e não por esquecimento: o solver
   * redistribui livremente e desfaria o movimento. Ele exige fixar a parada no veículo — spec
   * própria. Este contrato existe para o botão não aparecer antes disso.
   */
  test('mover destino não é oferecido enquanto o solver não fixar parada', async () => {
    const map = await readSource('src/modules/trip/components/TripAssemblyMap.component.tsx')

    expect(map).not.toContain('onMoveStop')
  })
})
