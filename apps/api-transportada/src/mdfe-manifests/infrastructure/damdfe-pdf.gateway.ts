/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  createDacteBarcodeGateway,
  type DacteBarcodeGateway,
} from '../../cte-issuance/infrastructure/dacte-barcode.gateway.js'
import { drawFiscalSheet, type FiscalSheetLogo } from '../../shared/fiscal-sheet.gateway.js'
import { buildDamdfeSheet } from '../domain/damdfe-layout.policy.js'

import { parseMdfeXmlForDamdfe } from './mdfe-xml.mapper.js'

export type DamdfePdfRenderInput = { readonly logo?: FiscalSheetLogo | null; readonly xml: string }

export type DamdfePdfDocument = { readonly bytes: Buffer; readonly pageCount: number }

export type DamdfePdfGateway = {
  readonly render: (input: DamdfePdfRenderInput) => Promise<DamdfePdfDocument>
}

export type CreateDamdfePdfGatewayOptions = {
  readonly barcodes?: DacteBarcodeGateway
  readonly compress?: boolean
}

/**
 * O DAMDFE **não tem QR Code**: o layout do MDF-e não publica um, ao contrário do CT-e. Desenhar um
 * inventado daria ao fiscal um código que não resolve em lugar nenhum.
 */
export function createDamdfePdfGateway(options?: CreateDamdfePdfGatewayOptions): DamdfePdfGateway {
  const barcodes = options?.barcodes ?? createDacteBarcodeGateway()
  return {
    render: async (input) => {
      const sheet = buildDamdfeSheet(parseMdfeXmlForDamdfe(input.xml))

      return drawFiscalSheet({
        ...(options?.compress === undefined ? {} : { compress: options.compress }),
        documentTitle: `DAMDFE ${sheet.barcodeValue}`,
        images: { accessKey: await barcodes.renderAccessKey(sheet.barcodeValue), qrCode: null },
        logo: input.logo ?? null,
        sheet,
      })
    },
  }
}
