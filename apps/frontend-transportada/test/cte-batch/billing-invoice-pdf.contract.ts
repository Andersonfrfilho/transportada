/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const DIALOG_COMPONENT = 'src/modules/cte-batch/components/CteBillingDialog.component.tsx'
const DIALOG_HOOK = 'src/modules/cte-batch/hooks/useCteBillingDialog.hook.ts'
const DOWNLOAD_SERVICE = 'src/modules/billing/shared/billingDocumentDownload.service.ts'
const LOCALE_PT = 'src/modules/cte-batch/locales/cteBatch.locale.json'
const LOCALE_EN = 'src/modules/cte-batch/locales/cteBatch.en.locale.json'

const DOCUMENT_KEYS = ['downloadInvoice', 'downloadingInvoice', 'documentError'] as const

function readFile(path: string): Promise<string> {
  return Bun.file(new URL(path, APPLICATION_ROOT)).text()
}

async function readLocaleBilling(path: string): Promise<Record<string, unknown>> {
  const locale: unknown = JSON.parse(await readFile(path))
  const billing = (locale as Record<string, unknown>).billing
  expect(typeof billing).toBe('object')
  return billing as Record<string, unknown>
}

describe('a fatura recém-emitida sai em PDF do próprio modal', () => {
  /**
   * Emitir e fechar deixava o operador procurando a fatura na listagem só para imprimir o PDF que
   * ele acabou de gerar. O id vem no resultado da emissão, então o documento é uma ação, não outra busca.
   */
  test('cada fatura emitida ganha o botão de baixar o PDF', async () => {
    const dialog = await readFile(DIALOG_COMPONENT)

    expect(dialog).toContain("t('billing.downloadInvoice')")
    expect(dialog).toContain('outcome.invoiceId')
    expect(dialog).toContain('dialog.downloadInvoice')
  })

  /** Sem giro o botão parece morto enquanto o PDF é gerado — o mesmo defeito do "Baixar lote". */
  test('o botão gira enquanto o PDF é gerado e não deixa pedir dois de uma vez', async () => {
    const dialog = await readFile(DIALOG_COMPONENT)

    expect(/\?\s*'spinner'\s*:\s*'download'/.test(dialog)).toBe(true)
    expect(dialog).toContain('dialog.resolveInvoiceDocumentState')

    const hook = await readFile(DIALOG_HOOK)
    expect(hook).toContain('resolveBillingDocumentActionState')
  })

  test('a falha do PDF aparece no modal, com o código que a API devolveu', async () => {
    const dialog = await readFile(DIALOG_COMPONENT)

    expect(dialog).toContain("t('billing.documentError'")
    expect(dialog).toContain('dialog.documentErrorCode')
  })

  test('quem fala com a API é o client do módulo, e o PDF abre em aba isolada', async () => {
    const [hook, service] = await Promise.all([readFile(DIALOG_HOOK), readFile(DOWNLOAD_SERVICE)])

    expect(hook).toContain('generateDocument')
    expect(hook).toContain('createBillingDocumentWindowDownload')
    expect(hook).not.toContain('fetch(')
    /** `noreferrer` nega o `window.opener`: a aba do PDF não alcança a sessão desta. */
    expect(service).toContain("'noopener,noreferrer'")
  })

  test('os três textos existem nos dois idiomas', async () => {
    const [pt, en] = await Promise.all([readLocaleBilling(LOCALE_PT), readLocaleBilling(LOCALE_EN)])

    for (const key of DOCUMENT_KEYS) {
      expect(typeof pt[key]).toBe('string')
      expect(typeof en[key]).toBe('string')
    }
    expect(pt.documentError).toContain('{{code}}')
    expect(en.documentError).toContain('{{code}}')
  })
})
