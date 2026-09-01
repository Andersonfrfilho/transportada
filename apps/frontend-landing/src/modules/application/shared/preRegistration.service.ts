import { CNPJ_LENGTH, normalizeTaxId } from '@/modules/shared/taxId.service'

import type { AttachmentType } from './attachmentClient.service'

/**
 * Spec 071: **a etapa de documentos é a primeira**, antes de "Dados pessoais". Ter os dados antes de
 * preencher é o ponto inteiro — com o campo de arquivo no meio da página, quem chegava só descobria
 * que podia ter anexado depois de já ter digitado tudo à mão.
 *
 * A ordem mora aqui, e não só no JSX, porque é ela que o contrato percorre: o risco desta tela é
 * alguém acrescentar um bloco acima de Documentos sem perceber, e ordem escrita como dado se lê.
 */
export const PRE_REGISTRATION_BLOCKS = [
  'Documentos',
  'Dados pessoais',
  'Empresa',
  'Endereço',
  'CNH e RNTRC',
  'Recebimento',
  'Veículo',
] as const

export type PreRegistrationBlock = (typeof PRE_REGISTRATION_BLOCKS)[number]

/**
 * Um campo por tipo, **todos opcionais**: candidatura barrada por anexo é candidatura perdida, e
 * quem decide o que falta é o operador.
 *
 * `reads` diz quem preenche formulário ao vivo, e a lista é curta de propósito:
 *
 * - **CRLV e documento da empresa** leem no navegador, pela camada de texto do PDF.
 * - **CNH** não lê: a CNH-e é imagem embrulhada em PDF pelo invólucro do Serpro (medido: ~400
 *   caracteres de texto legal e nenhum campo). Ler exige OCR, que é servidor, que é assíncrono — e
 *   assíncrono não preenche formulário aberto. O que ela alimenta é a conferência do operador.
 * - **Comprovante de endereço** não lê por decisão: conta de luz, água, telefone e internet não têm
 *   layout que se ancore, e um parser genérico para isso é palpite com aparência de leitura.
 */
export const DOCUMENT_FIELDS: readonly Readonly<{
  hint: string
  label: string
  reads: 'company' | 'none' | 'vehicle'
  type: AttachmentType
}>[] = [
  {
    hint: 'Preenchemos o veículo, o nome, o documento e a cidade com o que estiver escrito nele.',
    label: 'CRLV do veículo',
    reads: 'vehicle',
    type: 'crlv',
  },
  {
    hint: 'CCMEI, contrato social ou cartão CNPJ — o que você tiver.',
    label: 'Documento da empresa',
    reads: 'company',
    type: 'company_document',
  },
  {
    hint: 'Nossa equipe confere os dados da habilitação com o que você declarou.',
    label: 'CNH',
    reads: 'none',
    type: 'cnh',
  },
  {
    hint: 'Conta de luz, água, telefone, internet ou contrato de aluguel — qualquer data.',
    label: 'Comprovante de endereço',
    reads: 'none',
    type: 'address_proof',
  },
]

/**
 * Spec 071: o bloco Empresa aparece pelo CNPJ **lido do documento ou digitado** — o que vier
 * primeiro. Antes ele dependia do CNPJ digitado, e com a etapa de documentos no topo não há CNPJ
 * digitado ainda: o documento da empresa chegaria antes do bloco que ele preenche.
 *
 * O lido não sobrescreve o digitado (é o merge que decide isso); ele só abre o bloco. Quem digitou
 * um CPF e anexou o CCMEI da própria empresa vê os dois — e é assim que deve ser.
 */
export function shouldShowCompanyBlock(input: {
  readonly readTaxId: string | undefined
  readonly typedTaxId: string
}): boolean {
  return isCnpj(input.typedTaxId) || isCnpj(input.readTaxId ?? '')
}

function isCnpj(value: string): boolean {
  return normalizeTaxId(value).length === CNPJ_LENGTH
}
