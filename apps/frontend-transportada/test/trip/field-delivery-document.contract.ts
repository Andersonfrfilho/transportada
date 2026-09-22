import { describe, expect, it } from 'bun:test'

import { buildFieldDeliveryWizardDocuments } from '../../src/modules/trip/shared/fieldDeliveryDocument.service'

/**
 * Spec 156 T11 (D5): a faixa da nota mostra número/série, destinatário e cidade — nunca CPF nem
 * outro dado sensível (security.md §1). A ordem segue `documentIds` (a ordem da seleção/lote), não
 * a ordem interna da viagem.
 */
describe('documentos do assistente de baixa (spec 156 T11)', () => {
  const documents = [
    {
      contact: { contractorName: null, name: 'Maria Souza', phone: null, taxId: '111' },
      id: 'doc-1',
      nfeNumber: '123',
      nfeSeries: '1',
      stopId: 'stop-1',
    },
    {
      contact: null,
      id: 'doc-2',
      nfeNumber: '456',
      nfeSeries: null,
      stopId: 'stop-2',
    },
  ]
  const stops = [
    { id: 'stop-1', label: 'São Paulo/SP' },
    { id: 'stop-2', label: 'Campinas/SP' },
  ]

  it('monta na ordem da seleção, com destinatário e cidade da parada', () => {
    expect(
      buildFieldDeliveryWizardDocuments({ documentIds: ['doc-2', 'doc-1'], documents, stops }),
    ).toEqual([
      {
        city: 'Campinas/SP',
        documentId: 'doc-2',
        nfeNumber: '456',
        nfeSeries: null,
        recipientName: '',
      },
      {
        city: 'São Paulo/SP',
        documentId: 'doc-1',
        nfeNumber: '123',
        nfeSeries: '1',
        recipientName: 'Maria Souza',
      },
    ])
  })

  it('nota sem parada ou sem contato não quebra — cidade e destinatário vazios', () => {
    const [result] = buildFieldDeliveryWizardDocuments({
      documentIds: ['doc-2'],
      documents,
      stops: [],
    })
    expect(result).toEqual({
      city: '',
      documentId: 'doc-2',
      nfeNumber: '456',
      nfeSeries: null,
      recipientName: '',
    })
  })

  it('id que não existe mais na viagem é descartado, nunca gera um passo vazio', () => {
    expect(buildFieldDeliveryWizardDocuments({ documentIds: ['ghost'], documents, stops })).toEqual(
      [],
    )
  })
})
