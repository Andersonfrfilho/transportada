import { useQuery } from '@tanstack/react-query'

import { getTripClient } from '../hooks/useTripWorkspace.hook'
import type { FieldDeliveryOcrDocument } from '../shared/fieldDeliveryOcrDocuments.service'

const FIELD_DELIVERY_DOCUMENTS_QUERY_KEY = ['trip', 'field-delivery-documents'] as const

/**
 * Spec 156 T14, ADR-0069 §3: a chave de acesso de cada nota, para o OCR do canhoto casar pela
 * chave inteira. `enabled` fica com quem chama — só abre com o assistente do escritório aberto, e
 * erro (rota, permissão) vira lista vazia no consumidor, nunca trava o passo (R8).
 */
export function useFieldDeliveryDocumentsQuery(
  input: Readonly<{ enabled: boolean; tripId: string }>,
) {
  return useQuery<readonly FieldDeliveryOcrDocument[]>({
    enabled: input.enabled,
    queryFn: () => getTripClient().readFieldDeliveryDocuments({ tripId: input.tripId }),
    queryKey: [...FIELD_DELIVERY_DOCUMENTS_QUERY_KEY, input.tripId],
  })
}
