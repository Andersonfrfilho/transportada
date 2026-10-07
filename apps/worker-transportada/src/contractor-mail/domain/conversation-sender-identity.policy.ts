/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.7d (pendência 9): a API mostra o contato cadastrado quando `dkim_result = 'aligned'`, e o endereço que
 * ela casa é o `from` do Resend. O `aligned` só vale quando o `From` que a `mailauth` alinhou ao `d=` é UM só e é o
 * mesmo endereço gravado; divergência (o `From` assinado é de um domínio e o `from` do provedor de outro) rebaixa
 * para `not_aligned` — a mensagem segue na conversa, sem o selo de verificada.
 */
import { DKIM_ALIGNMENT_RESULT, type DkimAlignmentResult } from './dkim-alignment.policy.js'

export function resolveConversationDkimResult(input: {
  readonly alignment: DkimAlignmentResult
  readonly headerFrom: readonly string[]
  readonly senderAddress: string
}): DkimAlignmentResult {
  if (input.alignment !== DKIM_ALIGNMENT_RESULT.ALIGNED) return input.alignment
  const [signedAddress, ...others] = input.headerFrom
  const isSameSender =
    signedAddress !== undefined &&
    others.length === 0 &&
    signedAddress.toLowerCase() === input.senderAddress.toLowerCase()
  return isSameSender ? input.alignment : DKIM_ALIGNMENT_RESULT.NOT_ALIGNED
}
