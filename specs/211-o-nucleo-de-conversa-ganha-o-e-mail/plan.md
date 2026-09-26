# Plano — 211, o núcleo de conversa vira pacote

> Lê-se depois de `spec.md` e da **ADR-0085**. Aqui fica **como** fazer e **em que ordem**, com o
> que já existe medido contra o que falta.

## O que já existe (medido em 2026-09-26, não estimado)

### No `adatechnology-packages`

| Peça                                                                          | Onde                                                | Serve ao núcleo?                                          |
| ----------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------- |
| `MessageStatus = received\|sent\|delivered\|read\|failed`                     | `meta-whatsapp-contracts/src/conversation.types.ts` | vocabulário certo, **nome errado** (é da Meta)            |
| `ChannelAdapterInterface` (`sendText`, `sendMedia`, `fetchMediaAsBase64`)     | `meta-whatsapp-contracts/src/providers.ts`          | **a porta é genérica, o vocabulário não** (`waMessageId`) |
| `DELIVERY_STATUS = queued\|sent\|delivered\|failed\|bounced\|skipped`         | `notification-contracts/src/notification.types.ts`  | quase o do núcleo — falta `read`                          |
| `EmailDriverPort`, `email-provider` (smtp/resend/ses)                         | `notification-contracts`, `email-provider`          | **envio**, não conversa. Fica onde está (ADR-0085 §5)     |
| `parseResendWebhook`, `parseSesNotification`                                  | `notification-contracts/src/receipts/`              | reaproveitável pelo transporte do canal `email`           |
| `CONVERSATION_CHANNEL = whatsapp\|messenger\|instagram\|webchat`              | `conversations-ui/src/conversationChannel.ts`       | **falta `email`** — é o RF10                              |
| `CHANNEL_CAPABILITIES` (`hasSessionWindow`, `windowHours`, `reopenMechanism`) | `conversations-ui/src/conversationChannel.ts`       | embrião da tabela do RF2, **só na UI**                    |
| `createTranscriberChain`, `/whisper-local`                                    | `audio-transcription-provider`                      | é a porta opcional do RF4 (ADR-0074)                      |

⚠️ **Duas armadilhas já visíveis:**

1. O vocabulário de status existe **em dois lugares e diferente** — `meta-whatsapp-contracts` tem
   `read` e não tem `bounced`; `notification-contracts` tem `bounced` e não tem `read`. O núcleo
   precisa dos dois (`read` é do WhatsApp e do app; `bounced` é do e-mail), e **não pode importar
   nenhum dos dois**: `notification-contracts/CLAUDE.md` proíbe por escrito importar
   `meta-whatsapp-*`, e o inverso criaria dependência entre trios. O núcleo declara o seu.
2. `CHANNEL_CAPABILITIES` do `conversations-ui` é da UI e não tem contrapartida no backend. O RF2
   põe a tabela no `conversation-contracts`, e a UI passa a **ler a do contrato** em vez de ter a
   dela — senão nascem duas verdades sobre o que um canal sabe fazer.

### No TransportAdA (o que sai)

Da spec 183, entregue e exercitada:

| Tabela                                | Vai para o núcleo?                                             |
| ------------------------------------- | -------------------------------------------------------------- |
| `occurrence_conversations`            | **sim**, virando conversa com `subject_type`/`subject_id` (D1) |
| `occurrence_conversation_messages`    | **sim**                                                        |
| `occurrence_conversation_attachments` | **sim**                                                        |
| `occurrence_conversation_reads`       | **sim**                                                        |
| `occurrence_conversation_unassigned`  | **sim**                                                        |
| `company_quick_replies`               | **sim**                                                        |
| `occurrence_conversation_settings`    | **sim** (é configuração de canal, não de ocorrência)           |
| `contractor_contacts`                 | **não** — é quem é a contratante (RF12)                        |
| `contractor_mail_*`                   | **não** — vira o transporte do canal `email` (RF14)            |

O que **fica** e vira adaptador: a atribuição com o ramo do motorista (RF13), as permissões, o
`companyId`, o recorte do portal, a ligação com a ocorrência.

## Ordem, e por que é essa

A ordem é ditada por uma coisa só: **publicar é parada que exige o usuário** (ADR-0054, ADR-0065).
Tudo que precisa do pacote publicado vem depois da parada, e nada antes dela pode depender do que
vem depois.

```
Fase 1  contratos            ─┐
Fase 2  módulo               ─┤ no adatechnology-packages
Fase 3  transporte e-mail    ─┘
Fase 4  ⛔ PARADA: o usuário publica
Fase 5  TransportAdA consome ─┐
Fase 6  migração             ─┤ no transportada
Fase 7  conversations-ui     ─┘  (publica de novo: segunda parada)
Fase 8  fechamento
```

### Fase 1 — `conversation-contracts`

Só tipos, zod e portas; única dependência `zod`, no molde do `notification-contracts`. Nada de
runtime, nada de tabela, nada de estilo.

O vocabulário nasce **do que a 183 já usa**, não de projeto novo:

```
CONVERSATION_CHANNEL   email | whatsapp | app | portal | webchat
MESSAGE_DIRECTION      inbound | outbound
DELIVERY_STATUS        queued | sent | delivered | read | failed | bounced
DKIM_RESULT            aligned | not_aligned | unverifiable | absent
```

A tabela de capacidades (RF2) é o coração da D3 e da D4:

| canal      | confirma leitura | janela | anexo | áudio | transporte próprio |
| ---------- | ---------------- | ------ | ----- | ----- | ------------------ |
| `email`    | **não** (D4)     | não    | sim   | sim   | **sim** (D5)       |
| `whatsapp` | sim              | 24h    | sim   | sim   | não                |
| `app`      | sim              | não    | sim   | sim   | não                |
| `portal`   | sim              | não    | sim   | não¹  | não                |
| `webchat`  | não              | não    | sim   | não   | não                |

¹ o portal **ouve** áudio e não grava: `Permissions-Policy` nega o microfone lá (ADR-0073 §2).

### Fase 2 — `conversation-module`

Stateful, no molde do `meta-whatsapp-module`: `src/schema/`, `src/migrations/*.sql`,
`src/repositories/`, `src/use-cases/`, injeção por `createConversationModule({ config, features, providers })`,
`peerDependencies: drizzle-orm`.

O schema é o da 183 **com dois cortes**:

- `occurrence_kind` + `occurrence_id` → `subject_type` + `subject_id`, anuláveis, sem FK (D1);
- `contractor_id` / `driver_user_id` / `participant` → participante genérico com
  `(canal, identificador)` (ADR-0085 §3).

O resto — o CHECK de autoria, o `unique(company_id, channel, provider_message_id)` do status
idempotente, o `sha256` do anexo, a fila de não atribuídas — vai como está, porque já está certo.

⚠️ **O `companyId` continua na tabela do pacote**, e continua **nunca** vindo do corpo da
requisição (RNF3). É a invariante que o `notification-contracts/CLAUDE.md` testa em
`strictness.test.ts`, e o núcleo herda o mesmo teste.

### Fase 3 — o transporte do canal `email`

`ConversationEmailTransportPort` e a implementação que hoje mora em `apps/*/src/contractor-mail/`:
token derivado por HMAC, `In-Reply-To`/`References`, MIME bruto com `sha256` antes de interpretar,
DKIM por `mailauth`.

⚠️ **Comportamento idêntico, byte a byte** (CA07). O token é **derivado, não sorteado** — se a
fórmula mudar, toda conversa em andamento perde a resposta. A fórmula da 143:

```
token = base32lower(HMAC-SHA256(replyTokenSecret,
        "transportada:contractor-mail-reply:v1:" + companyId + ":" + threadId))[:128 bits]
```

O prefixo tem `transportada` dentro, e o pacote é genérico: o prefixo passa a ser **parâmetro**, e o
TransportAdA fornece exatamente a string de hoje. Trocar o prefixo é trocar todos os endereços de
resposta em uso.

Fixtures de DKIM são **sintéticas**, assinadas por chave de teste com resolvedor de DNS injetado
(143): e-mail real anonimizado não serve, porque anonimizar quebra a assinatura.

### Fase 4 — ⛔ parada: o usuário publica

O usuário faz o merge e a publicação no `adatechnology-packages`. Nada da fase 4 em diante começa
antes de a versão estar no registry e instalada — a ordem obrigatória do `CLAUDE.md` de lá é
"merge aqui → confirmar registry → bumpar consumidor", e typecheck verde sobre `dist` espelhado
**não é prova** de build do consumidor.

### Fase 5 — o TransportAdA consome

Os módulos da 183 passam a chamar o pacote. O que era tabela do produto vira chamada de caso de uso;
o que é do produto (quem é a contratante, o motorista, a permissão, o ramo do motorista na
atribuição) vira adaptador que implementa as portas.

### Fase 6 — migração

**A primeira task conta as linhas** (D8). Com a base vazia, como o dono do projeto informou, é
`create` + cópia do que houver + `drop`. Se a contagem contrariar a premissa, **a fase para** e o
plano volta ao caminho duplo.

### Fase 7 — `conversations-ui`

`email` no `CONVERSATION_CHANNEL`, e a tela passa a ler a tabela de capacidades do contrato (RF10,
D3): desabilita com dica, ou esconde. Segunda publicação, segunda parada.

Fica **fora**: consertar `MessageBubble`, `AudioPlayer` e `AudioRecorderButton`, que dependem de
Tailwind e não aceitam `className` (registrado na 183). Continua sendo defeito aberto do pacote.

### Fase 8 — fechamento

Revisão de código e de segurança, documentação nos dois repositórios, `evidence.md`.

## Riscos

| Risco                                                        | Mitigação                                                                                      |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| **O núcleo nasce com um consumidor só**                      | assumido na ADR-0085; o CA01 impede que ele ganhe vocabulário de TMS enquanto espera o segundo |
| **A fórmula do token mudar e quebrar conversa em andamento** | prefixo é parâmetro; teste fixa o token de hoje contra o do pacote, byte a byte (CA07)         |
| **Duas verdades sobre capacidade de canal** (contrato × UI)  | a UI passa a ler a do contrato (RF10); contrato falha se a UI declarar a dela                  |
| **A base não estar vazia**                                   | a contagem vem antes da migração, e a fase para se contrariar a premissa (D8)                  |
| **Regressão na 183 depois da troca**                         | CA09: todos os testes da 183 verdes; eles já existem e são o arnês                             |
| **Publicação travar a spec no meio**                         | as fases 1–3 são um repositório e as 5–7 outro; a parada é explícita e esperada                |
| **Vazar domínio do TMS para o pacote sem ninguém notar**     | CA01 é contrato executável, não revisão de código                                              |

## Fora deste plano

O que a `spec.md` § "Fora do escopo" lista, e mais: **as tasks abertas da 143** (T019–T022, decisão
da taxa por e-mail) continuam abertas e em revisão de validade contra a 164. Esta spec muda o dono
do transporte que elas usam, e não muda a decisão que elas propõem.
