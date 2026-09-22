/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Dados fictícios da prévia de modelo (`POST /contractor-mail-templates/preview`, spec 150 T402),
 * os mesmos de `email-template.html`: a prévia nunca lê nota, contratante nem contato de verdade.
 */
import type { BuildAddressCorrectionMailParams } from './address-correction-mail.types.js'

export const ADDRESS_CORRECTION_MAIL_SAMPLE: Omit<BuildAddressCorrectionMailParams, 'template'> = {
  carrierName: 'Transportadora Exemplo Ltda',
  contractorName: 'Comercial Exemplo Imp Exp Ltda',
  items: [
    {
      proposed: {
        city: 'Itirapina',
        cityCode: '3523909',
        complement: null,
        district: 'Jardim Nova Itirapina',
        number: '1209',
        postalCode: '13530000',
        state: 'SP',
        street: 'Rua Três',
      },
      reason: { distanceMetres: null, matchLevel: 'not_found' },
      recipientName: 'Mercado Bom Preço Ltda',
      reported: {
        city: 'ITIRAPINA',
        cityCode: '3523909',
        complement: null,
        district: 'CENTRO',
        number: '1209',
        postalCode: '13530000',
        state: 'SP',
        street: 'RUA 3',
      },
    },
    {
      proposed: {
        city: 'Orlândia',
        cityCode: '3534302',
        complement: null,
        district: 'Centro',
        number: '50',
        postalCode: '14620000',
        state: 'SP',
        street: 'Avenida Quatro',
      },
      reason: { distanceMetres: 3200, matchLevel: 'rooftop' },
      recipientName: 'Distribuidora Vale Verde Ltda',
      reported: {
        city: 'ORLANDIA',
        cityCode: '3534302',
        complement: null,
        district: 'CENTRO',
        number: '50',
        postalCode: '14620000',
        state: 'SP',
        street: 'AVENIDA 04',
      },
    },
  ],
  operatorName: 'Maria Operadora',
}
