/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { drawFiscalSheet, type FiscalSheetLogo } from '../../shared/fiscal-sheet.gateway.js'
import { buildDacteLayout } from '../domain/dacte-layout.policy.js'

import { createDacteBarcodeGateway, type DacteBarcodeGateway } from './dacte-barcode.gateway.js'
import { parseCteXmlForDacte } from './cte-xml.mapper.js'

export type DactePdfLogo = FiscalSheetLogo

/** O logo é da empresa e o gateway é único no processo: a marca entra por render, não por construção. */
export type DactePdfRenderInput = { readonly logo?: DactePdfLogo | null; readonly xml: string }

export type DactePdfDocument = { readonly bytes: Buffer; readonly pageCount: number }

export type DactePdfGateway = {
  readonly render: (input: DactePdfRenderInput) => Promise<DactePdfDocument>
}

export type CreateDactePdfGatewayOptions = {
  readonly barcodes?: DacteBarcodeGateway
  readonly compress?: boolean
}

export function createDactePdfGateway(options?: CreateDactePdfGatewayOptions): DactePdfGateway {
  const barcodes = options?.barcodes ?? createDacteBarcodeGateway()
  return {
    render: async (input) => {
      const layout = buildDacteLayout(parseCteXmlForDacte(input.xml))

      return drawFiscalSheet({
        ...(options?.compress === undefined ? {} : { compress: options.compress }),
        documentTitle: `DACTE ${layout.number}`,
        images: {
          accessKey: await barcodes.renderAccessKey(layout.barcodeValue),
          qrCode:
            layout.qrCodeValue === undefined
              ? null
              : await barcodes.renderQrCode(layout.qrCodeValue),
        },
        logo: input.logo ?? null,
        sheet: {
          accessKeyGrouped: layout.accessKeyGrouped,
          barcodeValue: layout.barcodeValue,
          emitter: layout.emitter,
          ...(layout.legend === undefined ? {} : { legend: layout.legend }),
          metaLine: `MODAL ${layout.modal}   SÉRIE ${layout.series}   NÚMERO ${layout.number}   EMISSÃO ${layout.issuedAt}`,
          ...(layout.protocol === undefined ? {} : { protocol: layout.protocol }),
          ...(layout.qrCodeValue === undefined ? {} : { qrCodeValue: layout.qrCodeValue }),
          sections: layout.sections,
          subtitle: 'Documento Auxiliar do Conhecimento de Transporte Eletrônico',
          title: 'DACTE',
        },
      })
    },
  }
}
