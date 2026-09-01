/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ReactNode } from 'react'

const COPYRIGHT_HOLDER = 'Ada Technology'
const COPYRIGHT_HOLDER_URL = 'https://adatechnology.com.br'
const PRODUCT_NAME = 'TransportAdA'
/**
 * Cópia por valor do `ada-technology.png` do tema de login — o bundle não lê `deploy/`, e o tema
 * não importa código nosso. `test/design-system/application-footer.contract.ts` compara os bytes
 * dos dois, para o rodapé antes e depois de entrar não assinar com desenhos diferentes.
 */
const ADA_MARK_SOURCE = '/icons/ada-technology.png'

export function ApplicationFooter(): ReactNode {
  const year = new Date().getFullYear()

  return (
    <footer className="application-footer">
      {/* `alt` vazio: o nome está escrito ao lado, e anunciar a imagem repetiria a palavra. */}
      <img alt="" aria-hidden="true" src={ADA_MARK_SOURCE} />
      <span>
        © {year}{' '}
        {/* `noreferrer` também nega o `window.opener`: a aba do site não alcança a sessão daqui */}
        <a href={COPYRIGHT_HOLDER_URL} target="_blank" rel="noreferrer">
          {COPYRIGHT_HOLDER}
        </a>{' '}
        — {PRODUCT_NAME}
      </span>
    </footer>
  )
}
