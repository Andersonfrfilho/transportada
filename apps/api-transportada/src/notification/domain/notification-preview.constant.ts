/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Valores de exemplo para o envio de teste — um por variável que os textos do catálogo usam.
 *
 * Sem eles, o teste chega com `{{batchName}}` cru na caixa de quem pediu, e prova menos do que
 * deveria: quem manda um teste quer ver a frase que a pessoa vai ler.
 *
 * ⚠️ Cópia por valor do `NOTIFICATION_PREVIEW_PAYLOAD` do frontend. Os dois existem porque o preview
 * é desenhado lá e o envio acontece aqui, e nenhuma app importa código da outra. Variável nova no
 * catálogo sem exemplo aqui volta a aparecer crua no teste, e
 * `test/notification/preview-payload.contract.ts` de cada lado é o que cobra.
 */
export const NOTIFICATION_TEMPLATE_PREVIEW_PAYLOAD: Readonly<Record<string, string>> = {
  batchName: 'Lote CT-e julho',
  dueDate: '10/09/2026',
  failedCount: '3',
  invoiceNumber: '1042',
  plate: 'RTA2E19',
  reason: 'Certificado vencido',
  rejectionReason: 'Alíquota fora do intervalo permitido',
}
