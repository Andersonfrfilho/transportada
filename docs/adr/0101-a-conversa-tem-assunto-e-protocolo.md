# ADR 0101 — A conversa tem assunto e protocolo

- **Status:** aceita para staging (2026-10-09, T2.1 da spec 260); produção exige aprovação humana própria
- **Data:** 2026-10-09
- **Nasce da spec 260** (T2.1)
- **Citações:** ADR-0072, ADR-0073, ADR-0081 §9, ADR-0097, specs 183, 189, 255, 257

## Contexto

A conversa com o motorista (spec 183) só existe amarrada a uma ocorrência: `occurrence_conversations`
exige `occurrence_kind` + `occurrence_id`, e mensagens, leituras e anexos apontam para ela por FK composta.
A spec 260 pede conversa sobre **uma nota** da viagem e sobre **a viagem**, um **protocolo** legível
(`AAMMDD-XXXX`) em toda conversa e, na lista do app, os canais que participaram e o ícone do tipo da
ocorrência. O dono fixou que nada disso pode mudar as rotas, as respostas nem o comportamento atuais da
conversa de ocorrência — app, portal da contratante, WhatsApp e e-mail da 143.

## Decisão

1. **O assunto mora em `occurrence_conversations`.** Colunas aditivas `subject_type` (`occurrence` padrão,
   `document`, `trip`; VARCHAR + CHECK), `trip_id` e `trip_document_id` (FK compostas com `company_id`);
   `occurrence_kind`/`occurrence_id` passam a aceitar nulo. Um CHECK de forma prende: ocorrência tem
   `occurrence_*` e nada mais; nota tem `trip_id` + `trip_document_id`; viagem tem `trip_id`; nota e viagem
   são **só** `participant = 'driver'`. Toda linha existente já é `occurrence` — não há backfill de assunto.
   O assunto `document` é o **vínculo** `trip_documents.id` (o `documentId` do `/me`), não a NF-e: o vínculo
   cobre nota por frete calculado e diz, por `released_at`, se a nota saiu da viagem.
2. **Uma conversa por (assunto, participante).** O único antigo fica; nota e viagem ganham únicos parciais
   (`… WHERE subject_type = 'document'|'trip'`).
3. **Visibilidade (BOLA).** O motorista alcança conversa de nota/viagem só se está na tripulação da viagem e
   é o destinatário da conversa ou o motorista principal agora; fora disso, `404 CONVERSATION_NOT_FOUND`.
   A conversa acompanha o principal (`retarget` da 183 T903, ADR-0097) sem escrita na leitura.
4. **Encerrada é gravada ou derivada.** O escritório encerra nota/viagem (`status = 'closed'`); nota
   liberada ou viagem `completed`/`cancelled` encerram na leitura, sem gancho nos fluxos de nota e viagem.
   Escrever em conversa encerrada é `409 CONVERSATION_CLOSED`. A conversa de ocorrência não encerra (como hoje).
5. **Protocolo gerado pelo banco.** Coluna `protocol` (`^[0-9]{6}-[2-9A-HJKMNP-Z]{4}$`), `UNIQUE (company_id,
protocol)`. Trigger `BEFORE INSERT` monta a data de `created_at` em `America/Sao_Paulo` e sorteia 4
   símbolos do alfabeto sem ambíguos, sorteando de novo até 5 vezes se a empresa já tem o valor; trigger
   `BEFORE UPDATE` recusa mudança. Backfill na migration, pela data de criação de cada conversa. Gerado no
   banco para cobrir todo caminho de inserção — inclusive os da contratante — sem mudar o código deles.
6. **Canais, ícone, rótulo e "espera resposta" são derivados na leitura**, em lote (sem N+1): canais
   distintos das mensagens; `icon_name` do tipo da ocorrência (spec 255); rótulo montado no servidor.
7. **Eco do `clientMessageId`.** `occurrence_conversation_messages.client_message_id` grava a
   `Idempotency-Key` (único parcial por conversa e direção). Rotas novas de ocorrência usam a **mesma**
   operação de idempotência das antigas, para a fila offline não duplicar na troca de rota.
8. **Rotas novas, antigas intactas.** `/me/trips/current/conversations/**` e `/trips/:tripId/conversations/**`
   são novas; as rotas da 183 não mudam de forma nem de comportamento. Duas consultas antigas que listam
   sem chave ganham o filtro `subject_type = 'occurrence'` — identidade com os dados de hoje.
9. **Aviso.** A ocorrência mantém `trip.conversation-message` e ganha campos extras no `payload`
   (`subjectType`, `subjectId`, `subjectLabel`, `protocol`). Nota e viagem usam a chave nova
   `trip.subject-conversation-message`. Nunca o corpo da mensagem.
10. **Publicação (ADR-0081 §9):** app tolerante à chave nova → banco e API → app nas rotas novas e telas.

## Consequências

- `occurrence_id` passa a aceitar nulo no TypeScript: cada leitura enumerativa precisa do filtro de assunto;
  consultas com chave `occurrence_id = X` não mudam.
- A conversa de nota e viagem é só do canal `app` na v1.
- Protocolo: corrida residual (~1 em 923 mil por par de transações concorrentes, mesma empresa e dia) pode
  devolver 23505 nos caminhos antigos; os caminhos novos repetem uma vez.
- Rollback: o do assunto recusa se houver conversa ou envio de arquivo de nota/viagem; o do protocolo
  apaga os protocolos (perda declarada).
- A API segue sem OpenAPI; as rotas novas são presas por contrato da tabela de rotas e documentadas em
  `docs/ai-context/api-transportada.md`.
- O texto do aviso da ocorrência não muda nesta ADR: o seed não sobrescreve template existente.

## Alternativas descartadas

- **Tabela de conversa nova com pilha paralela** — isolaria o fluxo antigo, mas duplicaria mensagens,
  status, leituras, anexos e envio de arquivo, com duas verdades de "conversa".
- **Migrar para o `conversation-module`** — fora do escopo (ADR-0072, spec 260 D1).
- **`nfe_document_id` como assunto** — perde nota vinculada por frete e não diz se a nota saiu da viagem.
- **Gerar o protocolo no TypeScript** — exigiria mudar os caminhos de inserção da contratante, e não cobriria
  inserção fora deles.
- **Contador por empresa e dia** — sem colisão, mas linha quente e protocolo enumerável; o D8 pede sorteio.
- **`channels` materializado** — escrita nova nos caminhos do WhatsApp e do e-mail.
- **Reescrever o template do aviso pelo catálogo** — não chega a quem já tem o template e mudaria o aviso de hoje.
