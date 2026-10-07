# Feature 248 — A prorrogação do boleto vai direto à contratante, e o boleto atualizado responde o motorista

## Problema e resultado

No balcão, o cliente pede ao motorista para prorrogar o vencimento do boleto. Hoje o motorista
registra "Cliente pediu prorrogação do boleto" (tipo semeado pela 241,
`occurrence-type-catalog.constant.ts:52`), e daí em diante tudo depende de alguém no escritório:
escrever à contratante, esperar o boleto novo, achá-lo na caixa de e-mail e mandá-lo ao motorista.
O motorista fica parado na frente do cliente sem saber se o boleto vem.

O SAC da contratante já disse o formato do pedido (arquivo `Template de ocorrências.md`, recebido em
2026-10-06):

```text
Assunto: OCORRÊNCIA -SPANI - NF - 717795 -MOT - JOSE BENTO - MOTIVO - PRORROGAÇÃO

Bom dia,

O cliente está solicitando a prorrogação do boleto.

MOTORISTA:  JOSÉ BENTO
RAZÃO SOCIAL:. MERCADO FONTE NOVA TURMALINA
NOTA FISCAL: 717795
VALOR DA NOTA:
```

O usuário pediu (2026-10-06): _"a prorrogação deve ir diretamente para a Spani e devemos observar o
retorno do boleto atualizado e já responder o motorista"_. E, antes: _"tem ocorrências de pedido de
alteração de vencimento de boleto que não interferem em nada na entrega"_.

Ao fim: o motorista registra a prorrogação (sem foto, sem produtos, sem soltar a nota, sem
tratativa); o e-mail sai sozinho à contratante **da nota** no formato do SAC; quando ela responde ao
mesmo e-mail com o boleto em PDF, o produto reconhece a resposta pela conversa da ocorrência, guarda
o PDF e o entrega ao motorista na conversa dele — sozinho ou depois de um toque do operador, **como o
tipo estiver configurado** —; e a ocorrência mostra em que pé está: aguardando a contratante, boleto
recebido, aguardando o operador, enviado ao motorista, ou falhou, com o motivo.

## O que já existe, o que falta

Levantado no código de `origin/staging` (`687473e1f`), 2026-10-06. Detalhe e linhas em `plan.md`.

| Ponta                                       | Existe                                                                                                                                                                                                                                                      | Falta                                                                                                                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tipo sem itens, sem foto, sem soltar a nota | 241 (`items_mode = off` ⇒ `redelivery_policy = unset`), 246 (exigências por campo); `unset` não abre tratativa (`occurrence-case.policy.ts:23`)                                                                                                             | nada                                                                                                                                                              |
| E-mail automático à contratante da nota     | 183: `emails_contractor` + `email_subject`/`email_body`, disparado depois do commit (`automatic-occurrence-mail.hook.ts:48-86`), contatos de `contractor_contacts` com `receives_occurrences`, Resend pelo worker, idempotência `occurrence-auto-mail:<id>` | o painel não edita o modelo nem a chave (a **247** entrega); o disparo é em memória — processo que cai entre o commit e o hook perde o e-mail                     |
| Resposta da contratante                     | 143/183: webhook Resend assinado (Svix), token de resposta HMAC por conversa (`reply-token.policy.ts:31-52`), worker grava o MIME bruto no bucket e a mensagem `inbound` na conversa da contratante                                                         | nada para chegar; falta **reagir** a ela                                                                                                                          |
| Anexo da resposta                           | 183 T702c1: `inbound-mail-attachments.service.ts` extrai, confere o tipo pelos bytes, ≤ 10 MB, ≤ 5 por mensagem, grava em `stored_objects` + `occurrence_conversation_attachments`                                                                          | saber **qual** anexo é o retorno                                                                                                                                  |
| Conversa com o motorista                    | 183: canal `app` com anexos e aviso na caixa (`driver-conversation.use-case.ts`)                                                                                                                                                                            | levar o anexo da conversa da contratante à do motorista (hoje só o sentido inverso, no portal: `forwardDriverAttachments`)                                        |
| WhatsApp ao motorista                       | entrada (comandos e conversa), gateway com `sendText`/`sendTemplate` (`meta-whatsapp-sending.gateway.ts:35-51`), política de janela (`whatsapp-window-expiry.policy.ts`)                                                                                    | envio na conversa da ocorrência (bloqueado pela **183 T002/T503**: modelos da Meta não submetidos), `sendMedia`/documento no gateway, checagem de janela no envio |
| Estado do retorno                           | estados da mensagem (`queued`…`bounced`)                                                                                                                                                                                                                    | estado do **retorno** por ocorrência e na linha do tempo                                                                                                          |
| Prazo e lembrete                            | —                                                                                                                                                                                                                                                           | nenhum job de cobrança de resposta (`cron-transportada/src/shared/job-catalog.constant.ts`)                                                                       |
| Auditoria da ação automática                | rastro em `contractor_mail_messages`, `occurrence_conversation_messages.automatic`                                                                                                                                                                          | `audit_logs.actor_user_id` é `NOT NULL` (`fiscal-operation.schema.ts:37-63`): ação sem usuário não cabe                                                           |
| Antivírus                                   | —                                                                                                                                                                                                                                                           | não existe no produto                                                                                                                                             |

## Tudo é configuração do tipo

Restrição do usuário (2026-10-06): _"isso deve ser tudo configuração na criação do tipo de
ocorrência"_. A prorrogação é **uma linha** de `company_occurrence_types` criada ou editada na aba
Tipos; nenhum código pergunta pelo nome. O nome do catálogo
(`BILL_EXTENSION_OCCURRENCE_TYPE_NAME`) só serve ao bootstrap de empresa vazia e continua assim. O
contraexemplo a não repetir é a migration da 241 que casa a segunda via por nome exato
(`20261006033752_occurrence_type_items_mode/migration.sql:14`).

### Campos novos do tipo (`company_occurrence_types`)

| Campo                              | Vocabulário                                                      | Default | O que governa                                                                                                                                         |
| ---------------------------------- | ---------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contractor_reply_mode`            | `off` · `forward_after_approval` · `forward_automatic`           | `off`   | o que fazer com a resposta da contratante: nada (só aparece na conversa, como hoje); levar ao motorista depois de um toque do operador; levar sozinho |
| `contractor_reply_attachment_kind` | `pdf` · `pdf_or_image`                                           | `pdf`   | qual anexo da resposta vale como retorno                                                                                                              |
| `driver_reply_template`            | texto, 1–1000 caracteres, marcadores da lista fechada da 079/247 | `''`    | a mensagem que acompanha o anexo na conversa do motorista                                                                                             |
| `contractor_reply_wait_hours`      | inteiro 1–168, ou nulo                                           | nulo    | prazo de espera da resposta; nulo = sem prazo                                                                                                         |
| `contractor_reply_reminder`        | `off` · `notify_operator` · `remind_contractor`                  | `off`   | o que acontece quando o prazo vence                                                                                                                   |

CHECKs: `contractor_reply_mode <> 'off'` exige `emails_contractor = true` (sem e-mail, não há
resposta a observar) **e** `btrim(driver_reply_template) <> ''`; `contractor_reply_reminder <> 'off'`
exige `contractor_reply_wait_hours IS NOT NULL`. Todas geradas de constantes. Escrita fora disso →
`422` com código estável por regra.

### Campos que já existem e esta spec usa (sem duplicar)

`emails_contractor`, `email_subject`, `email_body` (183/079, editáveis na tela pela 247),
`items_mode = off`, `attachment_mode = off`, `note_mode`, momentos (246), `redelivery_policy =
unset` (164/241).

### Exceção por contratante (camada da 246)

O comportamento do retorno é **da contratante** — uma responde com PDF em minutos, outra não responde
por e-mail. **Decidido por delegação em 2026-10-06 — reversível:** entram na exceção **por
contratante** (`company_occurrence_type_contractor_overrides`), nulas e sem default, herdando do tipo:
`contractor_reply_mode` e `contractor_reply_wait_hours`. **Não entram:** na exceção por destinatário
(quem responde é a contratante, não o mercado), nem o modelo de mensagem, o tipo de anexo e o
lembrete — seriam segundo mecanismo. Custo de reverter: colunas nulas, migration aditiva.

## O que é o momento

Mesma explicação da [spec 247](../247-a-devolucao-soma-os-itens-linha-por-linha/spec.md) § "O que é o
momento": o momento diz **quem registra e sobre o quê**. A prorrogação é registrada pelo **motorista,
numa nota** (hoje rotulado "Entrega da nota") e, se a operação quiser, pelo **escritório, pelo
motorista**. A troca de rótulos proposta é da 247.

## Fora do escopo

- Pagar, emitir, calcular ou validar boleto; ler linha digitável ou vencimento de dentro do PDF.
- Mudar a regra da tratativa (164): a prorrogação não abre tratativa e não muda o estado da nota.
- Interpretar o texto da resposta (a 183 D4 vale: a conversa não decide). O retorno é reconhecido
  pelo **anexo** na conversa certa, nunca por palavra no corpo.
- O canal WhatsApp **à contratante** (183 T002).
- Antivírus (ver D6).
- Encaminhar ao cliente final pelo produto: o motorista mostra ou compartilha do próprio aparelho
  (ver pergunta Q6).

## Histórias priorizadas

### P1 — O pedido sai sozinho, no formato do SAC

**Given** o tipo "Cliente pediu prorrogação do boleto" com `emails_contractor` ligado e o modelo do
SAC
**When** o motorista registra a prorrogação da NF 717795
**Then** o e-mail sai à contratante da nota sem ninguém no escritório tocar, com o assunto
`OCORRÊNCIA -{{contratante}} - NF - {{numeroNotaSemSerie}} -MOT - {{motorista}} - MOTIVO - PRORROGAÇÃO`
renderizado
**And** a ocorrência mostra **"Aguardando a contratante"** desde o envio, com o prazo se o tipo tiver
**And** a nota continua na viagem, sem tratativa e sem foto.

### P2 — O boleto chega ao motorista sem o operador procurar

**Given** o tipo com `contractor_reply_mode = forward_automatic` e anexo `pdf`
**When** a contratante responde ao e-mail com um PDF
**Then** a ocorrência passa a **"Boleto recebido"** e, em seguida, **"Enviado ao motorista"**
**And** o motorista vê, na conversa da ocorrência no app, a mensagem do tipo com o PDF, e recebe o
aviso na caixa.

### P3 — Com aprovação, o operador confere antes

**Given** o tipo com `forward_after_approval`
**When** chega a resposta com PDF
**Then** a ocorrência fica em **"Aguardando o operador"**, o painel mostra o PDF e o botão **"Enviar
ao motorista"** (`occurrences.resolve`)
**And** ao tocar, o envio acontece e o estado vira **"Enviado ao motorista"**, com quem aprovou.

### P4 — O que dá errado aparece com o motivo

**Given** a resposta não traz PDF (só texto, ou só uma imagem num tipo `pdf`), ou traz dois PDFs
**When** ela chega
**Then** o estado vira **"Precisa do operador"** com o motivo ("resposta sem PDF", "mais de um PDF")
e nada vai ao motorista sozinho; o operador escolhe o anexo ou responde à contratante
**And** se o prazo vence sem resposta, o estado mostra **"Sem resposta no prazo"** e o lembrete do
tipo acontece uma vez.

## Requisitos funcionais

- **RF1** Os cinco campos do tipo (tabela acima), com CHECKs geradas das constantes, validação no
  `PUT /company-settings/occurrence-types`, leitura nos `GET`, e o bloco **"Retorno da contratante"**
  na aba Tipos, dentro de "E-mail à contratante" da 247, só habilitado com o e-mail ligado.
- **RF2** O envio do pedido continua sendo o aviso automático da 183, sem segundo caminho. Para não
  perder o pedido quando o processo cai entre o commit e o hook em memória, um **varredor** (job do
  `cron-transportada`) reenvia, pela mesma chave de idempotência, as ocorrências de tipo com
  `emails_contractor` sem mensagem automática depois de 10 minutos.
- **RF3** Toda ocorrência de tipo com `contractor_reply_mode` efetivo `<> off` ganha, **na mesma
  transação do envio do pedido**, um **retorno** em `awaiting_contractor`, com `deadline_at` quando
  houver prazo. Um retorno por ocorrência (`UNIQUE (company_id, occurrence_id)`).
- **RF4** O worker, depois de gravar uma resposta `inbound` na conversa da contratante
  (`recordOccurrenceConversationMailReply`), publica o evento de resposta no outbox; um consumidor
  aplica a **política pura** `decideContractorReply` sobre o retorno aberto daquela ocorrência:
  - exatamente **um** anexo do tipo aceito → `reply_received`, e então `forwarding` (automático) ou
    `awaiting_operator` (com aprovação);
  - **nenhum** anexo aceito → `needs_operator` com motivo `no_accepted_attachment`;
  - **mais de um** → `needs_operator` com `multiple_attachments`;
  - retorno já `sent_to_driver` → nada muda; a resposta fica na conversa, e o operador pode
    encaminhar à mão (RF7).
    O tipo de anexo é o **conferido pelos bytes** pela 183 (`conversation-attachment.policy.ts`),
    nunca o nome nem o `Content-Type` declarado.
- **RF5** O envio ao motorista é um caso de uso único (`forwardContractorReplyToDriver`), chamado pelo
  automático e pelo toque do operador: cria a mensagem na conversa **do motorista** com o texto
  renderizado de `driver_reply_template` e **o mesmo `stored_object`** do anexo (sem copiar bytes),
  pelo canal decidido em Q4. Idempotente por `contractor-reply:<retornoId>`.
- **RF6** Falha no envio ao motorista → `failed` com motivo fechado: `driver_without_account`,
  `driver_unreachable`, `whatsapp_window_closed`, `whatsapp_template_missing`, `send_failed`. O
  painel mostra o motivo e o botão **"Tentar de novo"**.
- **RF7** O operador pode, a qualquer momento, encaminhar **qualquer** anexo da conversa da
  contratante à do motorista pelo mesmo caso de uso (`occurrences.resolve`), inclusive fora do fluxo
  automático. Isso cobre a resposta duplicada e a resposta que chega depois do envio.
- **RF8** Prazo: com `contractor_reply_wait_hours`, o job `occurrence.contractor-reply.remind` passa o
  retorno vencido a `expired` e executa o lembrete do tipo **uma vez**: `notify_operator` → aviso na
  caixa de quem despachou a viagem (mesmo destinatário do aviso interno, `occurrence-notifier.gateway.ts`);
  `remind_contractor` → resposta na mesma conversa de e-mail com o texto fixo de cobrança do produto
  ("Reenvio do pedido abaixo."), pelo trilho da 183. Resposta que chega depois de `expired` volta o
  retorno ao fluxo normal.
- **RF9** **Estado à vista.** O retorno aparece na linha da ocorrência (lista e detalhe) como selo:
  Aguardando a contratante (com prazo) · Boleto recebido · Aguardando o operador · Precisa do operador
  (motivo) · Enviado ao motorista · Falhou (motivo) · Sem resposta no prazo. No app do motorista, a
  ocorrência mostra "Pedido enviado à contratante" e, depois, o anexo.
- **RF10** **Histórico imutável:** cada transição grava uma linha em
  `occurrence_contractor_reply_events` (`from`, `to`, `reason`, `actor_kind` `system` | `user`,
  `actor_user_id` nulo quando `system`, mensagem e anexo envolvidos). É a auditoria da ação automática
  — `audit_logs` não aceita ator nulo (D5).
- **RF11** O retorno nunca escreve na tratativa nem na nota (183 D4; contrato
  `conversation-never-decides.contract.ts` estendido).

## Requisitos não funcionais

- **O PDF é entrada não confiável.** Vale o que a 183 já faz e não se afrouxa: tipo pelos bytes,
  ≤ 10 MB, ≤ 5 por mensagem, objeto em bucket privado, chave opaca (`occurrence-conversations/<token>`)
  sem CNPJ nem nome, download só por URL assinada de 300 s com `Content-Disposition: attachment`,
  nunca aberto, convertido ou executado no servidor. Nenhum byte no banco.
- Nenhum CNPJ, nome, e-mail, telefone, número de nota ou nome de arquivo em log — só ids e o motivo.
- `companyId` vem do webhook já conferido (Svix) e da conversa; o retorno é buscado por
  `(company_id, occurrence_id)`. Contrato negativo entre empresas.
- Idempotência em três pontos: evento de resposta por `provider_email_id` (já existe), transição por
  `(retorno, mensagem)`, envio ao motorista por `contractor-reply:<retornoId>`.
- Rate limit: o automático manda **no máximo um** anexo por retorno; o encaminhamento manual usa o
  limite da rota de mensagem da 183 (30 / 300 s).
- Migration aditiva com `rollback.sql`; sem ENUM nativo; CHECKs nomeadas ≤ 63.
- Ordem de publicação (ADR-0081 §9): painel e app tolerantes às chaves e ao selo novos → banco,
  worker e API → telas que escrevem.

## Casos extremos e falhas

| Caso                                                        | Comportamento                                                                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Contratante sem contato que receba ocorrências              | o pedido não sai (`no_recipient`, 183); o retorno **não** é criado; a ocorrência mostra "Pedido não enviado: sem contato" |
| E-mail da empresa não configurado                           | idem, motivo `mail_not_ready`                                                                                             |
| Resposta sem anexo                                          | `needs_operator` / `no_accepted_attachment`; segue aguardando outra resposta                                              |
| Anexo que não é PDF (tipo `pdf`)                            | não conta; se não houver outro, `needs_operator`                                                                          |
| Vários PDFs                                                 | `needs_operator` / `multiple_attachments`; o operador escolhe (RF7)                                                       |
| PDF acima de 10 MB                                          | a 183 já o descarta (conta em `skipped`); vira "sem anexo aceito"                                                         |
| Resposta duplicada (reenvio do mesmo e-mail)                | idempotente por `provider_email_id`                                                                                       |
| Segunda resposta depois do envio                            | fica na conversa; nada automático; RF7                                                                                    |
| Resposta de outra ocorrência                                | o token é por conversa; casa só a conversa dela                                                                           |
| Token inválido ou desconhecido                              | o worker descarta (`token_unknown`, 143); nenhum retorno muda                                                             |
| Motorista sem conta                                         | `failed` / `driver_without_account`                                                                                       |
| Motorista sem WhatsApp verificado (se o canal for WhatsApp) | cai para o app (Q4) ou `failed` / `driver_unreachable`                                                                    |
| Fora da janela de 24 h da Meta                              | só com modelo aprovado (183 D5); sem ele, `failed` / `whatsapp_template_missing` ou app (Q4)                              |
| Ocorrência cancelada (240) antes da resposta                | o retorno vira `cancelled`; resposta posterior só aparece na conversa                                                     |
| Tipo reconfigurado no meio                                  | o retorno guarda o modo **efetivo do registro** (cópia); mudança vale para as próximas                                    |

## Critérios de aceite

- **CA01** Registro do tipo configurado → e-mail com o assunto e o corpo do SAC renderizados, e
  retorno `awaiting_contractor` com prazo — integração.
- **CA02** Resposta com um PDF → `sent_to_driver` (automático) ou `awaiting_operator` (aprovação), e a
  mensagem do motorista referencia o mesmo `stored_object` — integração do worker e da API.
- **CA03** Política `decideContractorReply` cobre a tabela de casos — contrato, com mutações (aceitar
  pelo nome do arquivo; enviar com dois PDFs; reenviar depois de `sent_to_driver`).
- **CA04** **Só a configuração decide:** dois tipos de mesmo nome com `contractor_reply_mode`
  diferentes se comportam diferente; uma exceção por contratante muda o modo só para ela — contrato e
  integração, com mutação (`if` pelo nome).
- **CA05** Prazo vencido → `expired` e um lembrete só, mesmo com o job rodando duas vezes —
  integração.
- **CA06** Empresa B não vê nem move retorno da A; resposta com token de outra empresa não casa —
  integração.
- **CA07** Nenhum log com dado pessoal ou nome de arquivo — contrato de parede **e** mutação.
- **CA08** `make migration-test` verde com `rollback.sql`.
- **CA09** Revisão de design e usabilidade com print em 375, 768 e 1280 (selo na lista, detalhe com
  "Enviar ao motorista", bloco "Retorno da contratante" na aba Tipos, conversa no app do motorista).
- **CA10** Passada independente de funcionalidade, usabilidade e design por `code-reviewer`.

## Modelo do SAC (valores exatos do roteiro)

Dado que o operador digita na aba Tipos — nada disso entra no código, seed ou migration.

- Tipo: o que a empresa já tem, "Cliente pediu prorrogação do boleto" (241), ou um criado na tela.
- Momentos: **Motorista, numa nota** (+ **Escritório, pelo motorista**, se quiser).
- Foto **Desligado** · Observação **Opcional** · Assinatura **Desligado** · Produtos **Desligado** ·
  sem política de reentrega (`unset`).
- Mandar e-mail à contratante ao registrar: **ligado**.
- Assunto:
  `OCORRÊNCIA -{{contratante}} - NF - {{numeroNotaSemSerie}} -MOT - {{motorista}} - MOTIVO - PRORROGAÇÃO`
- Corpo:

  ```text
  Bom dia,

  O cliente está solicitando a prorrogação do boleto.

  MOTORISTA: {{motorista}}
  RAZÃO SOCIAL: {{razaoSocial}}
  NOTA FISCAL: {{numeroNotaSemSerie}}
  VALOR DA NOTA: R$ {{valorNota}}
  ```

  O SAC deixou "VALOR DA NOTA" em branco; o modelo o preenche. `{{numeroNotaSemSerie}}` e o valor
  formatado vêm da 247.

- Retorno da contratante: **conforme Q3** (recomendado `forward_automatic`), anexo **PDF**, prazo
  **conforme Q2**, lembrete **conforme Q2**.
- Mensagem ao motorista: **conforme Q5** (proposta: `Boleto atualizado da NF {{numeroNotaSemSerie}}
({{razaoSocial}}). Mostre ou repasse ao cliente.`).

## Dúvidas

### [NEEDS CLARIFICATION] — fatos de negócio que o código não responde

- **Q1 — Como a contratante devolve o boleto prorrogado?**
  (a) respondendo ao mesmo e-mail, com o PDF anexo; (b) respondendo ao e-mail com um link (banco ou
  portal) no corpo, sem anexo; (c) por outro canal (WhatsApp, telefone, portal dela); (d) não devolve
  — só confirma e o banco reemite.
  **Recomendada: (a).** É a única que o trilho existente observa sem ler texto. Com (b) o produto
  ficaria em "Precisa do operador" a cada resposta (não se interpreta link, 183 D4); com (c) ou (d) o
  `contractor_reply_mode` fica `off` e esta spec se reduz ao RF2.
- **Q2 — Em quanto tempo a contratante costuma responder, e o que fazer quando não responde?**
  Prazo: 2 h · 4 h · 24 h · sem prazo. Lembrete: avisar o operador · reenviar à contratante ·
  nenhum. **Recomendada: 4 h e avisar o operador** — o motorista está esperando na rua; reenviar à
  contratante sem ninguém ver repete o pedido sem resolver.
- **Q3 — O boleto vai ao motorista sozinho ou o operador confere antes?** (a) sozinho quando há
  exatamente um PDF; (b) sempre com o toque do operador. **Recomendada: (a)**, que é o "já responder o
  motorista" do pedido; (b) fica disponível no mesmo campo para outra contratante. Esta pergunta só
  fixa o **valor do roteiro**; o mecanismo é configurável de qualquer forma.
- **Q4 — Por qual canal o motorista recebe?** O WhatsApp na conversa da ocorrência depende dos
  modelos da Meta que **ainda não foram submetidos** (183 T002/T503), e enviar documento fora da janela
  de 24 h só com modelo aprovado. Opções: (a) pelo **app do motorista** (conversa da ocorrência + aviso
  na caixa) agora, e pelo WhatsApp quando os modelos estiverem aprovados; (b) só pelo WhatsApp,
  esperando a 183 T002; (c) WhatsApp dentro da janela, app fora dela.
  **Recomendada: (a).** Entrega hoje pelo que existe; a fase de WhatsApp desta spec fica atrás da
  183 T002.
- **Q5 — O texto da mensagem ao motorista, e o do modelo da Meta.** A mensagem é campo do tipo (o
  operador escreve); falta a **aprovação do texto do modelo de WhatsApp**, que é submetido à Meta pelo
  dono da conta. Proposta do modelo (utilidade, pt-BR, um documento no cabeçalho): `Boleto atualizado
da nota {{1}}. Mostre ou repasse ao cliente.` Aprova, ou qual texto?
- **Q6 — O motorista só mostra o boleto ou precisa repassá-lo ao cliente?** (a) mostra na tela; (b)
  repassa pelo próprio WhatsApp do aparelho (botão "Compartilhar" do sistema); (c) o produto manda
  direto ao cliente. **Recomendada: (b)** — sem guardar contato do cliente; (c) traria telefone de
  terceiro para o produto (LGPD, 183) e é spec à parte.

Sem estas respostas a spec **não ganha prompt de execução** (ver `tasks.md`).

### Decididas por delegação em 2026-10-06 — o usuário pode reverter antes da execução

| #   | Decisão                                                                                                                                                                     | Alternativa descartada                                       | Custo de reverter                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | O retorno é reconhecido pelo **anexo** na conversa da ocorrência (token da 143), nunca por assunto ou texto                                                                 | casar pelo assunto "PRORROGAÇÃO"; ler o PDF                  | baixo para acrescentar; ler texto contraria a 183 D4                                                                                       |
| D2  | Estado do retorno em tabela própria por ocorrência, com eventos imutáveis                                                                                                   | reaproveitar `trip_occurrence_cases` (`awaiting_contractor`) | alto: a prorrogação **não** abre tratativa (241, `occurrence-case.policy.ts:23`); usar a tratativa mudaria a regra da 164                  |
| D3  | Varredor do pedido não enviado (RF2) em vez de mover o hook para outbox                                                                                                     | outbox transacional no registro                              | médio: o varredor usa a idempotência que já existe; outbox mexe nos cinco caminhos de registro (`apps/api-transportada/CLAUDE.md:491-496`) |
| D4  | O anexo vai ao motorista como **referência ao mesmo `stored_object`**                                                                                                       | copiar o objeto                                              | baixo; cópia duplicaria expurgo e custo                                                                                                    |
| D5  | Auditoria em `occurrence_contractor_reply_events`, não em `audit_logs`                                                                                                      | afrouxar `audit_logs.actor_user_id`                          | médio: mexer na tabela fiscal de auditoria é decisão maior                                                                                 |
| D6  | **Sem antivírus**: o arquivo nunca é aberto pelo produto, é servido como download com URL de 300 s, e é o mesmo arquivo que a contratante já mandaria ao motorista por fora | ClamAV em container                                          | médio: um serviço novo no compose e no Railway; registrar em `docs/SECURITY.md` como risco aceito                                          |
| D7  | Exceção por contratante para modo e prazo do retorno; nada por destinatário                                                                                                 | tudo por exceção; nada por exceção                           | baixo: colunas nulas                                                                                                                       |
| D8  | O modo efetivo é copiado no retorno no registro                                                                                                                             | reler o tipo a cada resposta                                 | baixo                                                                                                                                      |
| D9  | O selo da prorrogação mora na linha da ocorrência, sem nova aba                                                                                                             | aba "Boletos"                                                | baixo                                                                                                                                      |
