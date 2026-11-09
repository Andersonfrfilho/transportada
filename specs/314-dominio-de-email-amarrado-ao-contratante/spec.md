# Spec 314 — Domínio de e-mail amarrado a um contratante

Pedido do Anderson (09/11/2026): o domínio liberado pela 311 vale para a empresa inteira e para qualquer emitente. Tem que ser
amarrado a um contratante (caso SPANI: `spani.com.br` ↔ CNPJ 05.868.574/0010-90).

- RF1. `nfe_xml_allowed_email_domains` ganha `contractor_id` (opcional, FK para `contractors`). Domínio sem contratante segue como hoje
  (compatível com o que já existe).
- RF2. Quando o remetente só passa pelo domínio e o domínio tem contratante, o XML só entra se o **emitente** da nota tiver o CNPJ do
  contratante (a raiz de 8 dígitos vale: `05868574` aceita qualquer filial). Emitente diferente: a nota **não** entra e o resumo ao
  remetente diz o motivo (`SENDER_ISSUER_MISMATCH`), sem o nome do arquivo no log.
- RF3. Contato cadastrado (302) e usuário da empresa não passam por esse filtro: continuam como hoje.
- RF4. O script de operação (`liberar-dominio-xml.sh`) recebe o CNPJ do contratante e grava a ligação; sem simular, não grava.
- RF5. A tela de remetentes mostra o contratante de cada domínio, no padrão das telas (shadcn/ui, i18n).
- RF6. O WhatsApp não muda.

## [NEEDS CLARIFICATION]

- Domínio já liberado, sem contratante, continua aceito (recomendado, para não quebrar quem usa) ou passa a ser recusado?
- A conferência do emitente é por raiz (recomendado) ou só por CNPJ completo?

## Fora do escopo

Remover a liberação sem contratante; mudar a checagem de DKIM.
