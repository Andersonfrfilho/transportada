# Contrato da API — áudio e transcrição na conversa por assunto (T2.1 → T2.4, T2.5)

> Documento do que a API **faz hoje** nesta branch (T2.1 a T2.4), conferido contra o código em `apps/api-transportada/src`.
> O desenho e as decisões estão em [`contract.md`](./contract.md) (§5). Onde o código diverge do desenho, a divergência
> está marcada como tal. A forma do documento segue a da [263](../263-o-chat-chega-ao-app-do-motorista/api-contract.md).
>
> **Regra: tudo aditivo.** Nenhuma rota antiga da conversa muda de forma. Os campos novos só aparecem nas rotas por
> assunto listadas em §1 e no resumo de §2.

## 0. O que já aparece para o usuário e o que ainda não

| Situação em produção nesta branch                                                                 | Aparece no JSON?                              |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Empresa desligada, qualquer anexo de áudio                                                        | `transcription: { status: 'disabled' }`       |
| Empresa ligada, áudio sem linha de transcrição (estado de hoje, porque a rotina ainda não existe) | campo `transcription` **ausente**             |
| `pending`, `ready`, `failed/too_long`                                                             | só depois da Fase 3 (worker) gravar as linhas |

Hoje nenhum código de produção grava linha de transcrição: `insertPendingTranscription` e `writeExposedTranscription`
(`occurrence-conversation/infrastructure/conversation-transcription-write.query.ts`) só são chamados pelos testes e serão
chamados pela rotina da T3.3/T3.4. Logo, `pending` nunca aparece antes do worker, o que é o desenho da publicação em §6.

## 1. Anexo de áudio nas rotas por assunto

Só nos quatro casos de uso por assunto. Anexo que **não é áudio** (`contentType` diferente de `audio/*`) não ganha nenhum dos
dois campos novos.

| Método e caminho                                                        | Caso de uso                                                           | Quem usa             |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------- |
| `GET /me/trips/current/conversations/:subjectType/:subjectId/messages`  | `list-my-subject-messages.use-case.ts`                                | app do motorista     |
| `POST /me/trips/current/conversations/:subjectType/:subjectId/messages` | `reply-my-subject-conversation.use-case.ts` (eco da mensagem enviada) | app do motorista     |
| `GET /trips/:tripId/conversations/:subjectType/:subjectId/messages`     | `list-office-subject-messages.use-case.ts`                            | painel do escritório |
| `POST /trips/:tripId/conversations/:subjectType/:subjectId/messages`    | `send-office-subject-message.use-case.ts` (eco)                       | painel do escritório |

`subjectType` ∈ `occurrence | document | trip`. Os caminhos são os das constantes reais (`me-subject-conversation.routes.ts`,
`me-subject-conversation-write.routes.ts`, `office-subject-conversation.routes.ts`, `office-subject-conversation-write.routes.ts`).
A API não tem prefixo `/v1` nestas rotas: o `main.ts` monta os módulos sem `basePath` (só notificação, usuário e portal
agregado têm base própria).

**Não mudam** (mesma forma de hoje, com teste de ouro byte a byte):

- Rotas antigas do motorista (spec 183): `GET /me/trips/current/occurrence-conversations`,
  `GET|POST /me/trips/current/occurrences/:id/messages`, `POST …/occurrences/:id/uploads`, `POST …/messages/read`.
- Rotas antigas do escritório: `GET /trip-occurrences/:id/conversations`,
  `GET|POST /trip-occurrences/:id/conversations/:participant/messages`, uploads e leitura.
- Portal do contratante: `/client/me/occurrence-conversations/:ref` e subrotas.
- Tela antiga da ocorrência: `read-occurrence-conversations` não usa o mesmo serializador (`contract.md` §6).
- Uploads (`…/uploads`) e a rota de leitura (`…/messages/read`) das rotas por assunto: não entram na etapa de enriquecimento.

### 1.1 Campos novos no anexo de áudio

Os campos novos ficam no objeto do anexo, ao lado dos campos que já existem. Ausentes quando não há valor (a API nunca
manda `null` para eles).

- **`durationMs`** (inteiro, ms, positivo): `attachments.duration_ms` vence; se nulo, usa `audio_duration_ms` da transcrição
  (medida do worker, reserva). Ausente se nenhum dos dois for inteiro positivo até 86 400 000.

- **`transcription`** (por estado):

**`pending`** — linha existe, rotina ainda não concluiu. Só aparece depois da Fase 3.

```json
{ "transcription": { "status": "pending" } }
```

**`ready`** — texto gravado.

```json
{
  "transcription": {
    "status": "ready",
    "text": "chego na portaria em dez minutos",
    "generatedAt": "2026-10-12T14:03:22.114Z",
    "language": "pt",
    "engine": "<identificador do motor, até 64 caracteres>"
  }
}
```

- `generatedAt` sempre ISO com `Z` (`toISOString()`).
- `language` só se casar `/^[a-z]{2,3}$/`; `engine` só se não nulo e não vazio (até 64). Ausentes caso contrário.
- `text` sai sem NUL (U+0000) e cortado em 40 000 unidades UTF-16 (o banco guarda até 20 000 code points, `char_length`).
- **`ready` vazio** (áudio sem fala) é `"text": ""`: é um `ready` válido, não ausência.

**`failed` com `too_long`** — o áudio passou do teto e o transcritor não foi chamado (Fase 3).

```json
{ "transcription": { "status": "failed", "reason": "too_long", "maxDurationMs": 600000 } }
```

`maxDurationMs` é o teto **gravado na tentativa** (`max_duration_ms` da linha), não o teto atual do ambiente.

**`disabled`** — empresa desligada. Vale com ou sem linha, e para todo anexo de áudio.

```json
{ "transcription": { "status": "disabled" } }
```

Texto de transcrição **nunca** sai quando a empresa está desligada: a resposta é só o `disabled`.

**Ausente** (chave `transcription` não existe no objeto):

- empresa ligada e sem linha (áudio recém-enviado, antes do próximo ciclo da rotina);
- `ready` sem texto (`text` nulo: expurgado) — ver §4;
- `failed` com qualquer código que não seja `too_long`;
- anexo que não é áudio.

Origem da forma: o mapper é `toParticipantTranscription` (`occurrence-conversation/domain/participant-transcription.mapper.ts`)
e a forma é a de `participantTranscriptionSchema` do `@adatechnology/conversation-contracts` `0.6.0`. Um contrato de paridade
parseia cada saída com o schema do pacote (`test/occurrence-conversation/participant-transcription.contract.ts`).

### 1.2 Como a etapa roda

`enrichAudioAttachments` (`application/conversation-audio-enrichment.service.ts`) roda **depois** de
`signConversationAttachments` nos quatro casos de uso. Nunca dentro de `signConversationAttachments` nem de
`readConversationAttachments`. Consultas por página (medidas na T2.3, Postgres real):

| Página                                          | Consultas de leitura da transcrição | Total da página (medido) |
| ----------------------------------------------- | ----------------------------------- | ------------------------ |
| Sem anexo de áudio                              | 0                                   | 7 (mensagens)            |
| Com 1, 10 ou 30 anexos de áudio, empresa ligada | 2 (configuração + linhas)           | **9** (com as três)      |
| Com áudio, empresa desligada                    | 1 (configuração)                    | **8**                    |

Lista de conversas do motorista (`GET /me/trips/current/conversations`): **5 → 6** consultas com `transcriptionUpdatedAt`
(agregação em lote, sem junção), constante com 1, 10 ou 30 conversas. A medida está em
`driver-subject-conversation-transcription.integration.ts` e `driver-subject-conversation-scale`.

BOLA: a busca é por `(companyId do contexto, ids da página já autorizada)`. Id de anexo ou de conversa de outra empresa
ou de outra viagem da mesma empresa volta vazio.

## 2. `transcriptionUpdatedAt` no resumo do motorista

Campo novo, **só** no resumo do motorista:

- `GET /me/trips/current/conversations` (cada item de `data`);
- `POST /me/trips/current/conversations/open` (o `data` da resposta, `201` ou `200`).

O resumo do escritório (`office-subject-conversation.types.ts`) não recebe o campo: a chamada não passa a data.

- **Formato:** ISO com `Z`, ou **omitido** quando a conversa não tem nenhuma linha de transcrição.
- **Semântica:** `max(updated_at)` das linhas de transcrição da conversa (`group by conversation_id`, sobre o índice
  `(company_id, conversation_id, updated_at)`). Não depende da configuração da empresa: as linhas são lidas como estão.
- Toda escrita que muda o que a API expõe (`status`, `text`, `audio_duration_ms`, `max_duration_ms`, expurgo) faz
  `updated_at = now()` do banco. A reivindicação da rotina (lease e tentativas) não muda o campo.

Limitações (aceitas):

- **(a)** Desligar ou religar a empresa não grava nada nas linhas. O app só vê `disabled` (ou a volta do texto) na próxima
  mudança real de uma transcrição da conversa, ou ao reabri-la. Só o `updated_at` das linhas move o campo.
- **(b)** O app só compara o campo na **primeira página** do resumo (snapshot de 15 s). Conversa que cai numa página
  seguinte só é revalidada ao ser aberta. O painel relê a conversa aberta a cada 15 s e não usa o campo.

## 3. Configuração da transcrição por empresa

`GET` e `PUT` `/company-settings/audio-transcription` (`API_COMPANY_SETTINGS_AUDIO_TRANSCRIPTION_PATH` em
`shared/api.constant.ts`). Política `{ permission: 'settings.manage', scope: 'company' }` nas duas. Resposta `no-store`.
A empresa vem sempre do contexto autenticado.

### 3.1 Resposta (`GET` e `PUT`, `200`)

```json
{
  "data": {
    "enabled": true,
    "maxDurationMs": 600000,
    "updatedAt": null
  }
}
```

- `enabled`: sem linha = `true` (padrão, D9).
- `maxDurationMs`: vem de `AUDIO_TRANSCRIPTION_MAX_DURATION_MS`, só lido, nunca gravado.
- `updatedAt`: ISO com `Z`, ou `null` enquanto nenhuma pessoa mudou a configuração (sem linha, ou linha criada pela rotina).
  Lista branca de campos: o objeto do repositório nunca é espalhado na resposta.

### 3.2 Corpo do `PUT`

```json
{ "enabled": false }
```

- `.strict()`: qualquer outra chave (inclusive `companyId`) é `400`. `enabled` tem de ser booleano (`"false"` é `400`).

### 3.3 Erros

- `400 INVALID_REQUEST` com **todos** os erros de uma vez, no formato do envelope da API:
  `{ "error": { "code": "INVALID_REQUEST", "message": "Invalid request", "correlationId": "…", "details": [{ "field": "enabled", "message": "…" }] } }`.
- `401` sem autenticação; `403` quando o papel não tem `settings.manage` (política da rota).

### 3.4 Semântica da escrita

Transação com lock consultivo por empresa (`acquireAudioTranscriptionLock`), depois `select … for update` e
`insert … on conflict do update`. Horários (`updated_at`, `enabled_since`) são do **banco** (`now()`), não da API.

- **`PUT` igual ao valor atual: nada é gravado e nada é auditado.** Isso vale também para `PUT {enabled:true}` sem linha:
  a leitura literal de "PUT igual ao atual" não cria a linha, e `updatedAt` continua `null`.
  **Divergência registrada** (`evidence.md` T2.4, item 1): o `contract.md` §5.1 falava em upsert. A linha nasce no primeiro
  `PUT {enabled:false}`.
- **Desligar** (`enabled: false`): cria ou atualiza a linha, `updated_at = now()`. **Não apaga** nenhuma transcrição: a
  leitura passa a dar `disabled`.
- **Religar** (`enabled: true`): regrava `enabled_since = now()`, mantém `routine_started_at` (só a rotina o escreve).
- `updated_by_user_id` = ator da mudança.

### 3.5 Auditoria

Só quando o valor muda. Evento `company-audio-transcription.changed` em `audit_logs`:

- `actorUserId` = ator; `companyId`; `entityType` e `targetType` = `company_audio_transcription_settings`;
  `entityId` e `targetId` = id da empresa; `permission` = `settings.manage`;
- `beforeSnapshot` e `afterSnapshot` = `{ enabled }` (valor antes e depois);
- `metadata.ipAddress` (IP resolvido pelo `ClientIpResolver`) e `correlationId`;
- nenhum texto de conversa.

### 3.6 Variável de ambiente

`AUDIO_TRANSCRIPTION_MAX_DURATION_MS` (`config/environment.schema.ts`): inteiro, mínimo `1000`, máximo `3600000`,
padrão `600000`; string vazia vale o padrão. A linha em `.railway/railway.ts` (mesmo valor no worker) entra na T3.2, que cria
a variável do worker. Até lá, só a API lê o valor.

## 4. Tabelas e colunas (resumo da T2.1)

Migration `apps/api-transportada/drizzle/20261012140238_conversation_audio_transcription/` (aditiva, com `rollback.sql`).

**`occurrence_conversation_audio_transcriptions`** — uma linha por anexo de áudio.

- `company_id`, `attachment_id` (único), `conversation_id` (desnormalizado para a agregação de §2).
- `status` em `pending | ready | failed`. **`disabled` nunca é gravado** (é decisão de leitura, §1.1). `purged` não é status.
- `text` (nulo quando expurgado), `language`, `engine`, `model`, `audio_duration_ms`, `processing_ms`.
- `failure_code` (lista fechada, RF14 + `company_disabled`), `max_duration_ms` (só em `too_long`).
- `attempts`, `lease_token`, `lease_expires_at`, `next_attempt_at` (uso da rotina, Fase 3), `generated_at`, `created_at`, `updated_at`.
- CHECKs: `ready` ⇔ `generated_at`; `failed` exige `failure_code`; `too_long` ⇔ `max_duration_ms` não nulo;
  `text` ≤ 20 000 code points; `audio_duration_ms > 0` quando houver.
- **Regra de expurgo:** `ready` com `text` nulo e `generated_at` preservado é o estado expurgado. Para a API é **ausente** (§1.1).

**`company_audio_transcription_settings`** — uma linha por empresa, opcional.

- `company_id` (PK), `enabled` (padrão `true`), `enabled_since` (padrão `now()`), `routine_started_at` (nulo até a rotina
  enxergar a empresa), `updated_by_user_id` (nulo quando a rotina criou a linha), `updated_at`.

**Índice parcial** em `occurrence_conversation_attachments`: `(created_at) where content_type like 'audio/%'`.

## 5. Ordem de publicação e compatibilidade

Ordem (`plan.md` § f e ADR-0081 §9, "a app nova contra a API antiga perde evento"):

1. **Pacotes:** `@adatechnology/conversation-contracts` (`0.6.0`) e `conversations-ui` publicados antes de qualquer app.
2. **Apps tolerantes:** as apps sobem na versão nova **sem** ligar a gravação nem mapear os campos novos.
3. **Banco e API:** migration aditiva, campos de §1, `transcriptionUpdatedAt` de §2 e a configuração de §3. A API sem worker
   devolve só `disabled` ou ausente, nunca `pending` eterno, porque sem rotina não há linha.
4. **Worker:** imagem com o whisper e a rotina `conversation.audio.transcribe`. Só depois da API.
5. **Telas:** gravação ligada no app e no painel, configuração no painel.

Compatibilidade:

- **App antigo contra API nova:** ignora `durationMs`, `transcription` e `transcriptionUpdatedAt` (o schema de contrato
  descarta chaves desconhecidas e o app não as usa). Nada quebra.
- **App novo contra API antiga:** a API não manda os campos; o app mostra só o player, sem texto e sem duração.
- **A API nova não depende do pacote em produção:** a tabela de regras é espelhada (`participant-transcription.constant.ts`);
  o pacote só entra como `devDependency` em versão exata e é importado só em `test/**`.
- **Produção:** cada etapa vai por PR separado com aprovação humana.

## 6. Pendências que este documento não fecha

- A configuração de transcrição (§3) não tem tela no painel ainda: é da Fase 5.
- `pending`, `ready` e `failed/too_long` não aparecem em produção até a Fase 3 (§0).
- A variável `AUDIO_TRANSCRIPTION_MAX_DURATION_MS` no worker e em `.railway/railway.ts` é da T3.2.
