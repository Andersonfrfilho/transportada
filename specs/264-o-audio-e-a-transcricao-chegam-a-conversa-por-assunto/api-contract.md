# API — contrato das rotas e dos campos (spec 264, Fase 2)

Recorte só da API do `contract.md` §5.1–5.3: o que o painel e o app do motorista leem. Tudo é **aditivo** (nenhum
campo existente muda); a tela antiga da ocorrência (`/me/trips/current/occurrences/**`, `/client/**`) não ganha nenhum
dos campos abaixo (ouro em `test/occurrence-conversation/audio-transcription-old-routes-golden.contract.ts`).

## 1. Configuração por empresa

`GET` e `PUT /v1/company-settings/audio-transcription` · `settings.manage`, escopo da empresa · `Cache-Control: no-store`.

| Verbo | Corpo                                  | Resposta `200`                                                                             |
| ----- | -------------------------------------- | ------------------------------------------------------------------------------------------ |
| `GET` | —                                      | `{ "data": { "enabled": boolean, "maxDurationMs": number, "updatedAt": string \| null } }` |
| `PUT` | `{ "enabled": boolean }` (`.strict()`) | a mesma forma, já com o valor gravado                                                      |

- **Sem linha = ligada.** `GET` sem decisão responde `200` com `enabled: true` e `updatedAt: null` (nunca `404`);
  `updatedAt` só deixa de ser `null` quando uma pessoa decide (a linha criada pela rotina não conta).
- `maxDurationMs` é `AUDIO_TRANSCRIPTION_MAX_DURATION_MS` do ambiente da API (padrão `600000`, entre 1 000 e 3 600 000),
  o mesmo número que o worker aplica. Informativo: nunca vem do corpo.
- Erros: `400` corpo inválido (boolean ausente, tipo errado, chave extra como `companyId`); `401`/`403` como toda rota com
  política. A empresa e o IP vêm do contexto (`resolveClientIp`), nunca do corpo ou de `X-Forwarded-For`.
- **Escrita:** numa transação, trava a empresa (advisory) e a linha atual (`FOR UPDATE`), faz _upsert_ e **só se o valor
  mudou** grava `audit_logs` (`company-audio-transcription.changed`; ator, empresa, `beforeSnapshot`/`afterSnapshot`
  `{ enabled }`, `correlationId`, `metadata.ipAddress`). `updated_at` e `enabled_since` (renovado ao ligar) são o `now()` do
  banco. `PUT` igual ao atual: nada muda, nada audita. Sem linha, `PUT { enabled: true }` também não grava.

## 2. Anexo de áudio nas rotas por assunto

Só nas quatro rotas por assunto — `GET`/`POST …/messages` do motorista (`/me/trips/current/conversations/:type/:id/…`) e as
equivalentes do escritório (`/trips/:tripId/conversations/:type/:id/…`). Só o anexo cujo `contentType` começa com `audio/`:

```jsonc
{
  "id": "…",
  "fileName": "…",
  "contentType": "audio/ogg",
  "sizeBytes": 123,
  "url": "…",
  "durationMs": 4200, // inteiro positivo ≤ 86 400 000; attachment.duration_ms, senão transcription.audio_duration_ms
  "transcription": {
    "status": "ready",
    "text": "…",
    "generatedAt": "2026-10-12T10:30:00.000Z",
    "language": "pt",
    "engine": "whisper-local",
  },
}
```

| Situação                             | `transcription`                                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| empresa desligada (com ou sem linha) | `{ "status": "disabled" }`                                                                                       |
| sem linha (áudio recém-enviado)      | ausente                                                                                                          |
| `pending`                            | `{ "status": "pending" }`                                                                                        |
| `ready`                              | `status`, `text` (`""` = nada dito), `generatedAt` ISO, `language` só se `/^[a-z]{2,3}$/`, `engine` só se houver |
| `failed` por duração                 | `{ "status": "failed", "reason": "too_long", "maxDurationMs": n }`                                               |
| `failed` (outro código) / `purged`   | `{ "status": "failed" }` / ausente                                                                               |

Nulo nunca vira `null`: a chave some. Anexo que não é áudio não ganha `durationMs` nem `transcription`.

- **Consultas constantes por página:** sem áudio, zero; com áudio, uma da configuração e — só com a empresa ligada — uma
  das linhas (`inArray` dos anexos), qualquer que seja o número de áudios. Com a empresa desligada o `durationMs` do
  anexo não é lido (a consulta das linhas não roda).
- O enriquecimento roda **depois** de `signConversationAttachments`, nunca dentro dele nem de `readConversationAttachments`.
- A forma é validada pela paridade com `participantTranscriptionSchema` de `@adatechnology/conversation-contracts@0.6.0`.

## 3. `transcriptionUpdatedAt` no resumo da lista do motorista

`GET /v1/me/trips/current/conversations` e `POST …/open` (campo `summary`) ganham `transcriptionUpdatedAt?` (ISO) =
`max(updated_at)` das transcrições da conversa; ausente quando não há transcrição. É uma agregação `group by conversation_id`
(coluna desnormalizada) com `inArray` das conversas da página, sem junção, **uma por página**. Só da API e do app: o
schema do contracts não o conhece.
