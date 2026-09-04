/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'
import {
  createNfeWorkspaceClient,
  type NfeDocumentListItem,
} from '@/modules/nfe-workspace/shared/nfeWorkspaceClient.service'

const PAGE_LIMIT = 100
/** Trava de laço: cursor que não avança não pode virar varredura infinita da base de notas. */
const PAGE_CAP = 40

/**
 * As notas que ainda podem entrar numa viagem, com a linha **inteira** da listagem — são os filtros
 * de lá que rodam sobre ela, e eles leem cidade, estado, valor e emitente.
 *
 * Um carregador só para os dois modais de criação: dois carregadores dariam dois recortes do que é
 * "nota disponível", e o operador veria contagens diferentes na mesma tela.
 */
export async function loadAvailableTripDocuments(): Promise<readonly NfeDocumentListItem[]> {
  const client = createNfeWorkspaceClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
  const items: NfeDocumentListItem[] = []
  let cursor: null | string = null

  for (let page = 0; page < PAGE_CAP; page += 1) {
    const result = await client.listDocuments({ cursor, limit: PAGE_LIMIT })
    items.push(...result.items)
    if (result.nextCursor === null || result.nextCursor === cursor) break
    cursor = result.nextCursor
  }

  /** Nota já em viagem não é oferecida: o lote não existe para produzir recusa em massa. */
  return items.filter((item) => item.tripId === null)
}
