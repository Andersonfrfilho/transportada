/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import bwipjs from 'bwip-js/node'

/**
 * O leitor do fiscal lê o código de barras, não o número impresso: gerar o desenho à mão falha
 * em silêncio — o papel parece certo e o scanner não devolve nada.
 */
const BARCODE_SCALE = 3
const BARCODE_HEIGHT = 12
const QR_CODE_SCALE = 4

export type DacteBarcodeGateway = {
  readonly renderAccessKey: (accessKey: string) => Promise<Buffer>
  readonly renderQrCode: (url: string) => Promise<Buffer>
}

export function createDacteBarcodeGateway(): DacteBarcodeGateway {
  return {
    // Chave de acesso tem 44 dígitos: o bwip-js codifica em Code128C, como o MOC exige.
    renderAccessKey: async (accessKey) =>
      bwipjs.toBuffer({
        bcid: 'code128',
        height: BARCODE_HEIGHT,
        includetext: false,
        scale: BARCODE_SCALE,
        text: accessKey,
      }),
    renderQrCode: async (url) =>
      bwipjs.toBuffer({
        bcid: 'qrcode',
        includetext: false,
        scale: QR_CODE_SCALE,
        text: url,
      }),
  }
}
