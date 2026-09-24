import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  AVAILABLE_TRIP_DOCUMENTS_QUERY_KEY,
  TRIP_QUERY_KEY,
} from '../../src/modules/trip/shared/trip.constant'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const HOOK_PATHS = [
  'src/modules/trip/hooks/useTripQuickCreate.hook.ts',
  'src/modules/trip/hooks/useQuickCreateDraft.hook.ts',
  'src/modules/trip/hooks/useTripRouteAssembly.hook.ts',
  'src/modules/trip/hooks/useRouteAssemblyDraft.hook.ts',
]

function readSource(filePath: string): string {
  return readFileSync(new URL(filePath, APPLICATION_ROOT), 'utf8')
}

/**
 * As duas montagens de viagem — a manual do "Nova viagem" e a automática do roteiro — chamavam a
 * mesma `loadAvailableTripDocuments` sob chaves de cache diferentes. Abrir a tela de viagens
 * varria a base de notas paginada **duas vezes** para guardar duas cópias do mesmo recorte, e
 * quem abria o diálogo esperava por uma busca que a outra montagem já tinha terminado.
 */
describe('as notas livres têm um carregador e uma chave', () => {
  test('a chave pende do prefixo das viagens, que é quem a invalida', () => {
    expect(AVAILABLE_TRIP_DOCUMENTS_QUERY_KEY[0]).toBe(TRIP_QUERY_KEY)
  })

  test('nenhuma montagem guarda chave própria para a mesma lista', () => {
    for (const path of HOOK_PATHS) {
      const source = readSource(path)

      expect(source).not.toContain('QUICK_CREATE_DOCUMENTS_QUERY_KEY')
      expect(source).not.toContain('ROUTE_ASSEMBLY_DOCUMENTS_QUERY_KEY')
    }
  })

  /**
   * ⚠️ O que torna a chave única útil é ninguém montar uma chave nova ao lado dela. Toda leitura
   * das notas livres — consulta, adiantamento e a releitura do rascunho — cita a constante.
   */
  test('toda leitura das notas livres cita a constante única', () => {
    for (const path of HOOK_PATHS) {
      const source = readSource(path)
      const loaderMentions = source.split('queryFn: loadAvailableTripDocuments').length - 1
      const keyMentions = source.split('queryKey: AVAILABLE_TRIP_DOCUMENTS_QUERY_KEY').length - 1

      expect(keyMentions).toBe(loaderMentions)
      expect(loaderMentions).toBeGreaterThan(0)
    }
  })

  /** A chave mora com as outras chaves de viagem — não no módulo que os testes de hook trocam. */
  test('a chave não mora no módulo mockado do carregador', () => {
    const source = readSource('src/modules/trip/shared/availableTripDocuments.service.ts')

    expect(source).not.toContain('AVAILABLE_TRIP_DOCUMENTS_QUERY_KEY')
  })
})
