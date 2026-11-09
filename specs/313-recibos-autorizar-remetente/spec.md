# Spec 313 — Recibos de XML: autorizar remetente, ver a conversa e criar o contratante

Pedido do Anderson (09/11/2026), depois do caso da UNICA: "tudo no padrão das nossas telas".

Leitura obrigatória feita: specs 301 a 311 (recibos, autorização por contato e por domínio, avisos do bot).

## Problema

1. Um remetente recusado (`sender_not_authenticated` por DKIM, ou "não autorizado") só se resolve por script ou
   cadastro manual de contato; a tela de recibos (spec 303) só mostra.
2. O recibo mostra o resultado, mas não o que o bot respondeu ao remetente.
3. A nota importada de um emitente que não é contratante fica sem contratante; hoje se cadastra à mão.

## Etapas (cada uma um PR para staging)

### Etapa 1 — Autorizar remetente na tela de recibos

- RF1. Recibo recusado por remetente não autorizado mostra a ação "Autorizar remetente" (`nfe.import`).
- RF2. A ação cria o contato do contratante (escolhido na tela) com o tipo `nfe_xml`, ou libera o domínio (só e-mail,
  nunca provedor público, spec 311). WhatsApp exige o aceite do número (regra da 183 D6): sem aceite, a tela diz isso.
- RF3. Recusa por DKIM **não** oferece autorizar: explica que o problema é do domínio do remetente. Autorizar não
  contorna a checagem.
- RF4. Idempotente; `companyId` do contexto; auditoria com quem autorizou.
- RF5. O recibo recusado não é reprocessado (o anexo não é guardado). A tela orienta o reenvio.

### Etapa 2 — A conversa no recibo

- RF6. O recibo guarda o que o bot enviou ao remetente (aviso e resumo: texto, canal, horário), para exibir na tela.
  Migration aditiva (tabela de mensagens do recibo); nada de segredo ou XML no texto.
- RF7. A tela mostra a linha do tempo: remetente enviou N arquivos → aviso → resumo.

### Etapa 3 — Contratante criado na importação (decisão do desenho abaixo)

- RF8. Ao importar uma nota cujo emitente (CNPJ) não é contratante da empresa, cria-se o contratante `active` com o nome
  do emitente, só se a empresa ligar a opção (parametrizável, desligada por padrão).
- RF9. Marcado como "criado automaticamente" e listado em `/pendencias` para conferência (período de fechamento e e-mail
  do relatório ficam padrão até alguém completar).

## Fora do escopo

Reprocessar anexo recusado; mexer na checagem DKIM.

## Decisões para o Anderson

- D1. O contratante automático nasce do **emitente** da nota (é como o recibo já cruza os contratantes, spec 303)?
- D2. Etapa 3 desligada por padrão, ligada por configuração da empresa?
