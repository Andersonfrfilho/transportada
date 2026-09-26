import { describe, expect, it } from 'bun:test'

/**
 * ADR-0075 §7: nada é importado de outra app — o que vem do painel ou do portal é copiado por
 * valor, e o arquivo copiado começa com "Cópia por valor de <origem> (ADR-0075 §7).". Este
 * contrato varre os arquivos que a T3.2 (módulo da viagem, primitivos de UI e dependências de
 * identidade) traz para dentro de `apps/frontend-driver` e confere que o cabeçalho aponta para a
 * origem certa.
 *
 * JSON não entra na lista: `*.locale.json` não aceita comentário, então não leva cabeçalho.
 */
const COPIED_FILES: ReadonlyArray<readonly [path: string, origin: string]> = [
  // driver-trip: components
  [
    'src/modules/driver-trip/components/DriverBottomBar.component.tsx',
    'apps/frontend-transportada/src/modules/driver-trip/components/DriverBottomBar.component.tsx',
  ],
  [
    'src/modules/driver-trip/components/DriverLoadSheet.component.tsx',
    'apps/frontend-transportada/src/modules/driver-trip/components/DriverLoadSheet.component.tsx',
  ],
  [
    'src/modules/driver-trip/components/DriverManifestCard.component.tsx',
    'apps/frontend-transportada/src/modules/driver-trip/components/DriverManifestCard.component.tsx',
  ],
  [
    'src/modules/driver-trip/components/DriverProofOutcomeNotice.component.tsx',
    'apps/frontend-transportada/src/modules/driver-trip/components/DriverProofOutcomeNotice.component.tsx',
  ],
  [
    'src/modules/driver-trip/components/DriverShellHeader.component.tsx',
    'apps/frontend-transportada/src/modules/driver-trip/components/DriverShellHeader.component.tsx',
  ],
  [
    'src/modules/driver-trip/components/DriverStopCard.component.tsx',
    'apps/frontend-transportada/src/modules/driver-trip/components/DriverStopCard.component.tsx',
  ],
  [
    'src/modules/driver-trip/components/DriverTripProgress.component.tsx',
    'apps/frontend-transportada/src/modules/driver-trip/components/DriverTripProgress.component.tsx',
  ],
  [
    'src/modules/driver-trip/components/ProofCrop.component.tsx',
    'apps/frontend-transportada/src/modules/driver-trip/components/ProofCrop.component.tsx',
  ],
  [
    'src/modules/driver-trip/components/SignaturePad.component.tsx',
    'apps/frontend-transportada/src/modules/driver-trip/components/SignaturePad.component.tsx',
  ],
  // driver-trip: hooks
  [
    'src/modules/driver-trip/hooks/useDriverTrip.hook.ts',
    'apps/frontend-transportada/src/modules/driver-trip/hooks/useDriverTrip.hook.ts',
  ],
  // driver-trip: pages
  [
    'src/modules/driver-trip/pages/DriverEventQueue.page.tsx',
    'apps/frontend-transportada/src/modules/driver-trip/pages/DriverEventQueue.page.tsx',
  ],
  [
    'src/modules/driver-trip/pages/DriverPendingProofs.page.tsx',
    'apps/frontend-transportada/src/modules/driver-trip/pages/DriverPendingProofs.page.tsx',
  ],
  [
    'src/modules/driver-trip/pages/DriverProfile.page.tsx',
    'apps/frontend-transportada/src/modules/driver-trip/pages/DriverProfile.page.tsx',
  ],
  [
    'src/modules/driver-trip/pages/DriverTripWorkspace.page.tsx',
    'apps/frontend-transportada/src/modules/driver-trip/pages/DriverTripWorkspace.page.tsx',
  ],
  // driver-trip: shared
  [
    'src/modules/driver-trip/shared/driverFileSave.service.ts',
    'apps/frontend-transportada/src/modules/driver-trip/shared/driverFileSave.service.ts',
  ],
  [
    'src/modules/driver-trip/shared/driverLocation.service.ts',
    'apps/frontend-transportada/src/modules/driver-trip/shared/driverLocation.service.ts',
  ],
  [
    'src/modules/driver-trip/shared/driverStopDistance.service.ts',
    'apps/frontend-transportada/src/modules/driver-trip/shared/driverStopDistance.service.ts',
  ],
  [
    'src/modules/driver-trip/shared/driverTrip.types.ts',
    'apps/frontend-transportada/src/modules/driver-trip/shared/driverTrip.types.ts',
  ],
  [
    'src/modules/driver-trip/shared/driverTripClient.service.ts',
    'apps/frontend-transportada/src/modules/driver-trip/shared/driverTripClient.service.ts',
  ],
  [
    'src/modules/driver-trip/shared/driverTripProgress.service.ts',
    'apps/frontend-transportada/src/modules/driver-trip/shared/driverTripProgress.service.ts',
  ],
  [
    'src/modules/driver-trip/shared/driverTripResponse.validation.ts',
    'apps/frontend-transportada/src/modules/driver-trip/shared/driverTripResponse.validation.ts',
  ],
  [
    'src/modules/driver-trip/shared/driverTripView.service.ts',
    'apps/frontend-transportada/src/modules/driver-trip/shared/driverTripView.service.ts',
  ],
  [
    'src/modules/driver-trip/shared/driverWorkspace.service.ts',
    'apps/frontend-transportada/src/modules/driver-trip/shared/driverWorkspace.service.ts',
  ],
  [
    'src/modules/driver-trip/shared/eventQueueView.service.ts',
    'apps/frontend-transportada/src/modules/driver-trip/shared/eventQueueView.service.ts',
  ],
  [
    'src/modules/driver-trip/shared/indexedDbQueue.service.ts',
    'apps/frontend-transportada/src/modules/driver-trip/shared/indexedDbQueue.service.ts',
  ],
  [
    'src/modules/driver-trip/shared/occurrenceNoticePreview.service.ts',
    'apps/frontend-transportada/src/modules/driver-trip/shared/occurrenceNoticePreview.service.ts',
  ],
  [
    'src/modules/driver-trip/shared/offlineAttachments.service.ts',
    'apps/frontend-transportada/src/modules/driver-trip/shared/offlineAttachments.service.ts',
  ],
  [
    'src/modules/driver-trip/shared/offlineQueue.service.ts',
    'apps/frontend-transportada/src/modules/driver-trip/shared/offlineQueue.service.ts',
  ],
  [
    'src/modules/driver-trip/shared/occurrencePhotoImage.service.ts',
    'apps/frontend-transportada/src/modules/trip/shared/occurrencePhotoImage.service.ts',
  ],
  [
    'src/modules/driver-trip/shared/proofCrop.service.ts',
    'apps/frontend-transportada/src/modules/driver-trip/shared/proofCrop.service.ts',
  ],
  [
    'src/modules/driver-trip/shared/proofFormPlan.service.ts',
    'apps/frontend-transportada/src/modules/driver-trip/shared/proofFormPlan.service.ts',
  ],
  [
    'src/modules/driver-trip/shared/signatureCapture.service.ts',
    'apps/frontend-transportada/src/modules/driver-trip/shared/signatureCapture.service.ts',
  ],
  // driver-trip: styles
  [
    'src/modules/driver-trip/styles/driverTrip.module.css',
    'apps/frontend-transportada/src/modules/driver-trip/styles/driverTrip.module.css',
  ],
  // design system caseiro do painel — só os primitivos que o módulo usa
  ['src/lib/utils.ts', 'apps/frontend-transportada/src/lib/utils.ts'],
  ['src/components/ui/button.tsx', 'apps/frontend-transportada/src/components/ui/button.tsx'],
  ['src/components/ui/icon.tsx', 'apps/frontend-transportada/src/components/ui/icon.tsx'],
  [
    'src/components/ui/icon.module.css',
    'apps/frontend-transportada/src/components/ui/icon.module.css',
  ],
  ['src/components/ui/skeleton.tsx', 'apps/frontend-transportada/src/components/ui/skeleton.tsx'],
  [
    'src/components/ui/skeleton.module.css',
    'apps/frontend-transportada/src/components/ui/skeleton.module.css',
  ],
  [
    'src/components/ui/file-field.tsx',
    'apps/frontend-transportada/src/components/ui/file-field.tsx',
  ],
  [
    'src/components/ui/file-field.module.css',
    'apps/frontend-transportada/src/components/ui/file-field.module.css',
  ],
  ['src/components/ui/barcode.tsx', 'apps/frontend-transportada/src/components/ui/barcode.tsx'],
  [
    'src/components/ui/barcode.module.css',
    'apps/frontend-transportada/src/components/ui/barcode.module.css',
  ],
  [
    'src/components/ui/code128.service.ts',
    'apps/frontend-transportada/src/components/ui/code128.service.ts',
  ],
  [
    'src/components/ui/copy-button.tsx',
    'apps/frontend-transportada/src/components/ui/copy-button.tsx',
  ],
  [
    'src/components/ui/copy-button.module.css',
    'apps/frontend-transportada/src/components/ui/copy-button.module.css',
  ],
  // "Quem recebeu" deixou de ser select nativo (spec 207) — Select do design system, por valor
  ['src/components/ui/select.tsx', 'apps/frontend-transportada/src/components/ui/select.tsx'],
  [
    'src/components/ui/select.module.css',
    'apps/frontend-transportada/src/components/ui/select.module.css',
  ],
  [
    'src/components/ui/select.service.ts',
    'apps/frontend-transportada/src/components/ui/select.service.ts',
  ],
  [
    'src/components/ui/searchableSelect.service.ts',
    'apps/frontend-transportada/src/components/ui/searchableSelect.service.ts',
  ],
  // Foco ao abrir recorte/assinatura, e o diálogo modal do "Ver imagem" (spec 207)
  [
    'src/modules/shared/useRevealedPanel.hook.ts',
    'apps/frontend-transportada/src/modules/shared/useRevealedPanel.hook.ts',
  ],
  [
    'src/modules/shared/useModalDialog.hook.ts',
    'apps/frontend-transportada/src/modules/shared/useModalDialog.hook.ts',
  ],
  // identidade: marca da instalação, WhatsApp e utilitários compartilhados
  [
    'src/modules/identity/components/InstallationBrandMark.component.tsx',
    'apps/frontend-transportada/src/modules/identity/components/InstallationBrandMark.component.tsx',
  ],
  [
    'src/modules/identity/hooks/useInstallationBrandView.hook.ts',
    'apps/frontend-transportada/src/modules/identity/hooks/useInstallationBrandView.hook.ts',
  ],
  [
    'src/modules/identity/queries/useInstallationBrand.query.ts',
    'apps/frontend-transportada/src/modules/identity/queries/useInstallationBrand.query.ts',
  ],
  [
    'src/modules/identity/queries/useAuthMe.query.ts',
    'apps/frontend-transportada/src/modules/identity/queries/useAuthMe.query.ts',
  ],
  [
    'src/modules/identity/shared/installationBrand.service.ts',
    'apps/frontend-transportada/src/modules/identity/shared/installationBrand.service.ts',
  ],
  [
    'src/modules/identity/shared/installationBrandCache.service.ts',
    'apps/frontend-transportada/src/modules/identity/shared/installationBrandCache.service.ts',
  ],
  [
    'src/modules/identity/components/WhatsAppPhonePanel.component.tsx',
    'apps/frontend-transportada/src/modules/identity/components/WhatsAppPhonePanel.component.tsx',
  ],
  [
    'src/modules/identity/hooks/useWhatsAppPhone.hook.ts',
    'apps/frontend-transportada/src/modules/identity/hooks/useWhatsAppPhone.hook.ts',
  ],
  [
    'src/modules/identity/shared/whatsappPhone.constant.ts',
    'apps/frontend-transportada/src/modules/identity/shared/whatsappPhone.constant.ts',
  ],
  [
    'src/modules/identity/shared/whatsappPhone.types.ts',
    'apps/frontend-transportada/src/modules/identity/shared/whatsappPhone.types.ts',
  ],
  [
    'src/modules/identity/shared/whatsappPhone.validation.ts',
    'apps/frontend-transportada/src/modules/identity/shared/whatsappPhone.validation.ts',
  ],
  [
    'src/modules/identity/shared/whatsappPhoneClient.service.ts',
    'apps/frontend-transportada/src/modules/identity/shared/whatsappPhoneClient.service.ts',
  ],
  [
    'src/modules/identity/shared/whatsappPhoneViewModel.service.ts',
    'apps/frontend-transportada/src/modules/identity/shared/whatsappPhoneViewModel.service.ts',
  ],
  [
    'src/modules/identity/styles/whatsappPhone.module.css',
    'apps/frontend-transportada/src/modules/identity/styles/whatsappPhone.module.css',
  ],
  [
    'src/modules/shared/phone.service.ts',
    'apps/frontend-transportada/src/modules/shared/phone.service.ts',
  ],
  [
    'src/modules/shared/useCountdown.hook.ts',
    'apps/frontend-transportada/src/modules/shared/useCountdown.hook.ts',
  ],
  [
    'src/modules/shared/taxId.service.ts',
    'apps/frontend-transportada/src/modules/shared/taxId.service.ts',
  ],
  [
    'src/modules/shared/i18n/i18n.service.ts',
    'apps/frontend-transportada/src/modules/shared/i18n/i18n.service.ts',
  ],
]

const HEADER_LINE_PATTERN =
  /^\/\* Cópia por valor(?:, reduzida,)? de (?<origin>\S+) \(ADR-0075 §7\)\. \*\/$/u

async function readFirstLine(relativePath: string): Promise<string> {
  const source = new URL(`../../${relativePath}`, import.meta.url)
  const text = await Bun.file(source).text()
  return text.split('\n', 1)[0] ?? ''
}

describe('cabeçalho "Cópia por valor" (ADR-0075 §7)', () => {
  it.each(COPIED_FILES)('%s aponta para a origem certa', async (path, origin) => {
    const firstLine = await readFirstLine(path)
    const match = HEADER_LINE_PATTERN.exec(firstLine)
    expect(match?.groups?.origin).toBe(origin)
  })
})
