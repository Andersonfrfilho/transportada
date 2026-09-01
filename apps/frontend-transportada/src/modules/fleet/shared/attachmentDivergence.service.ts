/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  AggregateApplication,
  AggregateApplicationAttachment,
} from './aggregateApplicationClient.service'

export type AttachmentDivergence = Readonly<{
  declared: string
  field: string
  read: string
}>

/**
 * O rótulo que o operador leu na tela, nunca a chave interna do campo.
 *
 * Spec 071: a CNH e o CRLV entram aqui. O que o OCR lê da CNH **nunca** volta ao formulário de quem
 * se candidatou — ele já enviou e foi embora, e prometer preenchimento assíncrono seria prometer o
 * que não se entrega. O ganho é do operador: quando ele abre a candidatura, os campos lidos já estão
 * ao lado do que foi declarado.
 */
export const ATTACHMENT_FIELD_LABEL: Readonly<Record<string, string>> = {
  brand: 'Marca',
  cnpj: 'CNPJ',
  legalName: 'Razão social',
  licenseCategory: 'Categoria da CNH',
  licenseNumber: 'Número da CNH',
  model: 'Modelo',
  modelYear: 'Ano do modelo',
  name: 'Nome',
  openedAt: 'Data de abertura',
  ownerName: 'Proprietário do veículo',
  plate: 'Placa',
  renavam: 'RENAVAM',
  tradeName: 'Nome fantasia',
}

function readDeclaredField(
  application: AggregateApplication,
  section: string,
  field: string,
): string {
  const block = application.declaredData[section]
  if (typeof block !== 'object' || block === null) return ''
  const value = (block as Record<string, unknown>)[field]

  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
}

function normalize(value: string): string {
  return value.replace(/[^0-9A-Za-zÀ-ÿ]/gu, '').toUpperCase()
}

/**
 * O que o **servidor** leu do arquivo contra o que a candidatura declarou. Duas coisas que não são
 * divergência, e tratá-las como tal treinaria o operador a ignorar o aviso: campo que a leitura não
 * achou (ausência nunca é conflito) e campo que ninguém declarou (não há o que conferir).
 *
 * A comparação é canônica — máscara é do teclado, não do dado, e comparar `30.213.061/0001-06` com
 * `30213061000106` acusaria divergência em documento correto.
 */
export function listAttachmentDivergences(
  input: Readonly<{
    application: AggregateApplication
    attachment: AggregateApplicationAttachment
  }>,
): readonly AttachmentDivergence[] {
  const extracted = input.attachment.extractedFields
  if (extracted === null) return []

  const { application } = input
  const pairs: readonly Readonly<{ declared: string; field: string }>[] = [
    { declared: application.taxId, field: 'cnpj' },
    { declared: readDeclaredField(application, 'company', 'legalName'), field: 'legalName' },
    { declared: readDeclaredField(application, 'company', 'openedAt'), field: 'openedAt' },
    { declared: readDeclaredField(application, 'company', 'tradeName'), field: 'tradeName' },
    // A CNH lida pelo OCR, contra o que foi digitado no bloco "CNH e RNTRC".
    { declared: application.name, field: 'name' },
    { declared: readDeclaredField(application, 'driver', 'licenseNumber'), field: 'licenseNumber' },
    {
      declared: readDeclaredField(application, 'driver', 'licenseCategory'),
      field: 'licenseCategory',
    },
    // O CRLV, quando o anexo é um.
    { declared: readDeclaredField(application, 'vehicle', 'plate'), field: 'plate' },
    { declared: readDeclaredField(application, 'vehicle', 'brand'), field: 'brand' },
    { declared: readDeclaredField(application, 'vehicle', 'model'), field: 'model' },
    { declared: readDeclaredField(application, 'vehicle', 'modelYear'), field: 'modelYear' },
    /**
     * O proprietário do CRLV se compara com o nome de quem se candidatou, e divergir é **normal**:
     * agregado que roda com veículo de terceiro é o caso comum. Ele aparece para o operador saber,
     * não para reprovar.
     */
    { declared: application.name, field: 'ownerName' },
  ]

  return pairs.flatMap(({ declared, field }) => {
    const read = extracted[field] ?? ''
    if (declared === '' || read === '' || read === null) return []
    if (normalize(declared) === normalize(read)) return []

    return [{ declared, field, read }]
  })
}
