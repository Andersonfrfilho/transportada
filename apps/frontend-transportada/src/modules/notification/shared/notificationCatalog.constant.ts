/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  NotificationCategoryOption,
  NotificationChannelOption,
} from '@adatechnology/notification-ui'

/**
 * ⚠️ Cópia por valor do catálogo da API (`notification/domain/notification-catalog.constant.ts`).
 * A tela oferece o que o produto entrega: canal a mais promete entrega que não sai, assunto a menos
 * esconde o desligamento de um aviso que existe. `test/notification/settings-catalog.contract.ts`
 * lê o arquivo da API e falha quando os dois divergem.
 */
export const NOTIFICATION_SETTINGS_CHANNEL_IDS = ['inbox', 'email'] as const

/** O que assina a prévia enquanto a instalação não tem marca cadastrada — igual ao rodapé do e-mail. */
export const NOTIFICATION_PRODUCT_NAME = 'TransportAdA'

/** Rota do workspace de notificações; a navegação manual de `main.tsx` casa por prefixo. */
export const NOTIFICATION_WORKSPACE_HREF = '/notificacoes'

/** Sub-rota do workspace de notificações; a navegação manual de `main.tsx` casa por este valor. */
export const NOTIFICATION_SETTINGS_HREF = `${NOTIFICATION_WORKSPACE_HREF}/preferencias`

export const NOTIFICATION_SETTINGS_CATEGORY_IDS = [
  'cte-batch',
  'nfse',
  'billing',
  'identity',
  'mdfe',
  // Spec 079: a ocorrência de entrega que a empresa escolheu ser avisada.
  'trip',
] as const

type TranslateLabel = (key: string) => string

function toLabelKey(id: string): string {
  return id.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

/** Rótulo e dica saem do `*.locale.json`; o id é o vocabulário fechado que a API entende. */
export function buildNotificationSettingsOptions(translate: TranslateLabel): {
  readonly categories: readonly NotificationCategoryOption[]
  readonly channels: readonly NotificationChannelOption[]
} {
  return {
    categories: NOTIFICATION_SETTINGS_CATEGORY_IDS.map((id) => ({
      id,
      label: translate(`settings.${toLabelKey(id)}`),
    })),
    channels: NOTIFICATION_SETTINGS_CHANNEL_IDS.map((id) => ({
      id,
      hint: translate(`settings.${toLabelKey(id)}Hint`),
      label: translate(`settings.${toLabelKey(id)}`),
    })),
  }
}

/**
 * Valores de exemplo do preview, um por variável que os textos do catálogo usam.
 *
 * Sem eles o preview desenha `{{batchName}}` cru, e quem está escrevendo o texto não vê a frase que
 * a pessoa vai ler — que é a única coisa que o preview existe para mostrar. São exemplos plausíveis
 * e curtos: valor comprido esconde o problema de quebra de linha em vez de revelá-lo.
 *
 * ⚠️ Cópia por valor das `placeholders` do catálogo da API
 * (`notification/domain/notification-catalog.constant.ts`). Variável nova lá sem exemplo aqui volta
 * a aparecer crua no preview, e `test/notification/preview-payload.contract.ts` é o que cobra.
 */
export const NOTIFICATION_PREVIEW_PAYLOAD: Readonly<Record<string, string>> = {
  batchName: 'Lote CT-e julho',
  documentLabel: '883658/1',
  dueDate: '10/09/2026',
  failedCount: '3',
  invoiceNumber: '1042',
  occurredAt: '03/09/2026 14h52',
  occurrenceType: 'Recusa do destinatário',
  plate: 'RTA2E19',
  reason: 'Certificado vencido',
  rejectionReason: 'Alíquota fora do intervalo permitido',
  // O exemplo leva **número**: é a mesma regra do rótulo da parada, que imprimia rua sem ele.
  stopLabel: 'RUA MIGUEL PETRONI, 1166, SAO CARLOS, SP',
}
