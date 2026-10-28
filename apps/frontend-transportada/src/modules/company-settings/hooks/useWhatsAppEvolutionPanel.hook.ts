/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import { createWhatsAppEvolutionClient } from '../shared/whatsappEvolutionClient.service'
import type { WhatsAppEvolutionSaveInput } from '../shared/whatsappEvolution.validation'

const WHATSAPP_EVOLUTION_QUERY_KEY = 'company-whatsapp-evolution'
const WHATSAPP_EVOLUTION_QR_QUERY_KEY = 'company-whatsapp-evolution-qr'
/** Sem a resposta do QR (erro), a tela tenta de novo neste ritmo em vez de parar. */
const QR_RETRY_MILLISECONDS = 20_000
/** Estado ao vivo: a tela relê a conexão neste ritmo para mostrar a queda sem recarregar. */
const CONNECTION_POLL_MILLISECONDS = 30_000

function getWhatsAppEvolutionClient() {
  return createWhatsAppEvolutionClient({
    apiBaseUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

/**
 * Spec 281 T4: liga a consulta só com a aba "WhatsApp" aberta. O QR é uma consulta à parte, ligada
 * por `qrEnabled`: ela se renova no ritmo que a API manda (`refreshAfterSeconds`) até o estado virar
 * `open`, e some do cache assim que a tela sai (`gcTime: 0`) — o QR é credencial de pareamento.
 */
export function useWhatsAppEvolutionPanel(
  input: Readonly<{ companyId?: string; enabled: boolean; qrEnabled: boolean }>,
) {
  const client = getWhatsAppEvolutionClient()
  const queryClient = useQueryClient()
  const queryKey = [WHATSAPP_EVOLUTION_QUERY_KEY, input.companyId] as const

  const query = useQuery({ enabled: input.enabled, queryFn: client.get, queryKey })
  const saveMutation = useMutation({
    mutationFn: (body: WhatsAppEvolutionSaveInput) => client.save(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })
  const stored = query.data
  const connectable = stored?.status === 'active' && stored.apiKeyConfigured
  // Com o QR aberto quem informa o estado é o próprio QR; fora dele, esta leitura periódica.
  const connectionQuery = useQuery({
    enabled: input.enabled && connectable && !input.qrEnabled,
    queryFn: client.connection,
    queryKey: [WHATSAPP_EVOLUTION_QUERY_KEY, 'connection', input.companyId] as const,
    refetchInterval: CONNECTION_POLL_MILLISECONDS,
    refetchIntervalInBackground: false,
  })
  const qrQuery = useQuery({
    enabled: input.enabled && input.qrEnabled,
    gcTime: 0,
    queryFn: async () => {
      const qr = await client.qr()
      // Conectou: o estado gravado mudou, então a configuração é relida.
      if (qr.state === 'open') await queryClient.invalidateQueries({ queryKey })

      return qr
    },
    queryKey: [WHATSAPP_EVOLUTION_QR_QUERY_KEY, input.companyId] as const,
    refetchInterval: (current) => {
      const data = current.state.data
      if (data?.state === 'open') return false
      return data === undefined
        ? QR_RETRY_MILLISECONDS
        : Math.max(data.refreshAfterSeconds, 5) * 1000
    },
    refetchIntervalInBackground: false,
  })

  return { connectionQuery, qrQuery, query, saveMutation }
}
