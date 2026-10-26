# Feature 279 — O cliente tem e-mail para receber o boleto

Pedido do dono (Anderson, 26/10/2026): "o motorista envia um email se quiser para já enviar também ao cliente o email
prorrogado, ter isso nas telas para enviarmos e já guardarmos esse email para futuros envios" e, na resposta, "um tipo de
email do cliente para envio desses boletos, com botões tanto no painel quanto no app do motorista, que fica no cadastro do
cliente e pode aceitar um email ou vários". Estende a 248 (RF9–RF12: encaminhar o boleto ao cliente da nota ou a um e-mail
informado); não recria nada dela.

Specs lidas antes (mesmo assunto): 183, 248 (`spec.md`, `plan.md`, código de `forward-contractor-reply-by-email`), 267, 274,
276, 278. Confirmado no código de `staging` (2ca71f2): o encaminhamento ao e-mail da nota e a e-mail informado **existe**
(`ContractorReplyEmailActions.component.tsx`, rota `occurrence-contractor-reply.routes.ts`, alvos
`note_recipient_email` e `informed_email`); o que falta é o **cadastro** do e-mail e o **botão no app do motorista**.

## Problema e resultado

Hoje o boleto prorrogado só chega ao cliente (o supermercado) se a NF-e trouxe `<dest><email>` ou se o operador digita o
endereço a cada vez, e esse endereço não é guardado. O motorista, que está na frente do cliente, não pode fazer nada.

Resultado:

1. O cadastro do **cliente de entrega** ganha **e-mails para boleto** (tipo `boleto`; o cadastro aceita outros tipos, ver D1): um ou vários, com rótulo
   opcional ("financeiro", "dono"). Fica no cadastro e serve a todo envio futuro.
2. No painel, na ocorrência com o boleto aceito, o botão **"Enviar boleto ao cliente"** abre a lista dos e-mails do
   cadastro (marcados), mais o e-mail da nota, se houver, mais o campo "outro e-mail" com a opção **"Guardar no cadastro
   do cliente"**. O operador escolhe e envia.
3. No app do motorista, na conversa da ocorrência em que o boleto chegou, o botão **"Enviar ao cliente"** mostra os mesmos
   e-mails guardados (marcados) e deixa o motorista **informar um e-mail novo**, que ele pode guardar para o cliente. Sem
   e-mail guardado, o motorista digita um; com e-mail guardado, é um toque.
4. A tela do cliente (painel) lista, edita e remove esses e-mails.

## Fora do escopo

- Envio **automático** sem toque quando o motorista informa o e-mail (continua o `forward_to_note_recipient = automatic`
  da 248, só para o e-mail da nota). Se o dono quiser automático também para os e-mails do cadastro, é decisão nova.
- Usar os tipos `invoice`, `finance` e `general` em outros fluxos: eles já são cadastráveis (D1), mas só `boleto` é lido por
  um envio nesta spec.
- E-mail do cliente na ocorrência de devolução (247).

## Decisões

- **D1 — Onde mora.** Tabela nova `delivery_client_emails (id, company_id, tax_id, purpose, address, label, created_by,
created_at)`, chave estrangeira em `(company_id, tax_id)` de `delivery_clients`, único `(company_id, tax_id, purpose,
lower(address))`, `purpose` (o **tipo** do e-mail) CHECK `('boleto','invoice','finance','general')` — boleto, nota fiscal, financeiro e geral —
  com o vocabulário numa constante só, e um e-mail pode existir em mais de um tipo (a unicidade inclui o tipo), endereço com o mesmo padrão e limite de 254 de `nfe_documents.recipient_email`.
  Não vai coluna em `delivery_clients` porque são vários e porque o tipo é parte do modelo.
- **D2 — Máximo.** 10 e-mails por cliente e tipo (`422 DELIVERY_CLIENT_EMAIL_LIMIT_REACHED`), para o cadastro não
  virar lista de transmissão.
- **D3 — Reuso do trilho de envio.** O envio ao cliente é um novo alvo, `client_boleto_emails`, do mesmo
  `forward-contractor-reply-by-email`: um e-mail por endereço, sem token de resposta, entrega em
  `occurrence_contractor_reply_deliveries`, idempotente por (retorno, anexo, endereço). O texto vem de
  `forward_email_subject`/`forward_email_body` do tipo (248). Nada é reimplementado.
- **D4 — Endereço novo do motorista.** O motorista **nunca** dispara para endereço que a API não validou: a API valida
  (formato, 254, sem `\r\n,;<>`), mascara na resposta e no log, e só guarda no cadastro quando `save = true`. Endereço já
  existente no cadastro não duplica. Quem guarda fica em `created_by`.
- **D5 — Permissão.** Painel: a mesma do encaminhamento da 248 para enviar e a de editar cliente de entrega para o
  cadastro. Motorista: rota em `/me/trips/current/occurrences/:id/...`, restrita à viagem e à ocorrência dele, e só
  quando o tipo liga `forward_to_informed_email` ou `forward_to_note_recipient` (a configuração do tipo continua mandando);
  o limite por ocorrência da 248 (`CONTRACTOR_REPLY_EMAIL_MAX_PER_OCCURRENCE`) vale também para ele.
- **D6 — O escritório não tem trava.** O botão do painel nunca depende de e-mail cadastrado: sem nenhum, o operador digita
  como hoje.
- **D7 — Auditoria.** Cada envio fica em `occurrence_contractor_reply_deliveries` com o ator (usuário ou motorista) e
  aparece na linha do tempo (278: "Boleto enviado ao cliente"); cada cadastro/remoção grava `audit_logs`.

## Histórias priorizadas

### P1 — O motorista envia o boleto ao cliente

**Given** a contratante devolveu o boleto da prorrogação e o cliente tem um e-mail para boleto guardado **When** o
motorista toca em "Enviar ao cliente" e confirma **Then** o PDF sai para esse e-mail e a conversa mostra "Enviado ao
cliente (a\*\*\*@...)".

**Given** o cliente não tem e-mail guardado **When** o motorista digita um e-mail e marca "Guardar para este cliente"
**Then** o boleto sai e o e-mail passa a estar no cadastro do cliente.

### P1 — O cadastro do cliente

**Given** a tela do cliente **When** o operador adiciona, edita o rótulo ou remove um e-mail para boleto **Then** a lista
muda, e o motorista e o painel passam a ver a mudança no próximo envio.

### P2 — O escritório envia pelo painel

**Given** a ocorrência com o boleto aceito **When** o operador abre "Enviar boleto ao cliente", marca um ou mais e-mails
(cadastro, nota ou digitado) e envia **Then** sai um e-mail por endereço e cada um aparece na linha do tempo.

## Requisitos funcionais

- **RF1** `GET/POST/PATCH/DELETE /delivery-clients/:taxId/emails?type=boleto` (painel), com limite e validação de D1/D2.
- **RF2** `GET /me/trips/current/occurrences/:id/client-boleto-emails` devolve os e-mails guardados **mascarados** com um
  `emailId` opaco; o motorista escolhe por `emailId`, nunca por endereço, para os já guardados.
- **RF3** `POST /me/trips/current/occurrences/:id/client-boleto-emails/send` com `{ emailIds?: string[], newAddress?: string,
save?: boolean, idempotencyKey }`, pelo trilho de D3; resposta com o resultado por endereço (mascarado).
- **RF4** `POST` do painel do encaminhamento da 248 aceita `emailIds` além de `address`/alvo da nota, com `save`.
- **RF5** Painel: seção "E-mails do cliente" na tela do cliente, agrupada por tipo, com seletor de tipo ao adicionar (o tipo
  `boleto` vem selecionado quando se chega pelo botão do boleto); seletor múltiplo no botão da ocorrência.
- **RF6** App do motorista: botão "Enviar ao cliente" na conversa da ocorrência com boleto, folha com a lista, campo de
  e-mail novo e "Guardar para este cliente".
- **RF7** Linha do tempo (278): "Boleto enviado ao cliente" com o ator e o endereço mascarado.

## Requisitos não funcionais

- Endereço em claro só no banco e no corpo do POST; nunca em log, resposta ou evento (mascarado, como na 248).
- Multiempresa: `companyId` do contexto; contratos negativos de outra empresa e de outro motorista.
- Migration aditiva e reversível; nenhum tipo de ocorrência existente é alterado.
- Painel e app do motorista seguem o tema e os seletores reais de cada app; prévia com print antes de ir a `staging`.

## Casos extremos e falhas

- Ocorrência sem boleto aceito: `409` com código estável; o botão some no app e no painel.
- Anexo maior que o limite do e-mail: resultado `attachment_too_large_for_email` (248), sem tentar.
- E-mail já guardado digitado de novo: não duplica, e o envio segue.
- Falha do provedor de e-mail: linha `failed` na entrega, botão "Tentar de novo" no painel; o motorista vê "Não saiu, o
  escritório foi avisado".
- Motorista sem conexão: o app enfileira com a mesma `idempotencyKey` e o envio não duplica.

## Critérios de aceite

- CA1 Cadastro: adicionar, listar mascarado, editar rótulo, remover, limite 10, duplicata, outro tenant (`404`).
- CA2 Envio do painel e do motorista pelo trilho da 248, um e-mail por endereço, idempotente.
- CA3 Motorista de outra viagem/empresa não envia nem lista.
- CA4 Nenhum endereço em claro em resposta, log ou evento.
- CA5 Telas com print aprovado pelo dono antes de `staging`.

## Dúvidas

- Nenhuma bloqueante. Pendente de confirmação do dono (não bloqueia): automático para os e-mails do cadastro (fora do
  escopo acima) e se o motorista pode **remover** e-mail do cadastro (nesta spec ele só adiciona; remover é do painel).
