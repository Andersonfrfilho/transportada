# Plano técnico

## Contexto e premissas

A spec 166 acabou de publicar a quantidade por item; esta spec torna esse conjunto **corrigível**.
Duas invariantes herdadas mandam no desenho: a ocorrência é fato registrado (imutável, auditável) e
a tratativa da spec 164 é quem fecha a janela.

A ordem de publicação é a mesma da 166, e pela mesma razão medida em 22/09: **frontend tolerante
primeiro**, API depois.

## Arquitetura e arquivos afetados

**Banco** (`apps/api-transportada/src/database/trip.schema.ts` + migration)

- `trip_document_occurrence_corrections` (nova): `id`, `company_id`, `occurrence_id`,
  `previous_items jsonb not null`, `corrected_by_user_id`, `created_at`. FK composta
  `(company_id, occurrence_id)` para `trip_document_occurrences`, `on delete restrict`. Índice pela
  chave de leitura `(company_id, occurrence_id, created_at)`.
- `trip_document_occurrences` ganha o cancelamento: `cancelled_at`, `cancelled_by_user_id`,
  `cancellation_reason`. CHECK de presença casada — os três existem juntos ou nenhum existe.
  ⚠️ Não é tabela à parte: é no máximo **uma** linha por ocorrência, e tabela 1-para-0..1 pagaria um
  join em toda leitura para representar três colunas.

**Domínio**

- `trips/domain/occurrence-correction.policy.ts` (nova): o conjunto anterior × o novo, a decisão de
  "não mudou nada" (RF5) e a normalização que a comparação exige (ordem de item não é mudança).
- `trips/domain/occurrence-cancellation.policy.ts` (nova): motivo não vazio, teto de 500, e os
  estados que recusam (já cancelada, tratativa aberta).

**Aplicação**

- `correct-occurrence-items.use-case.ts` e `cancel-occurrence.use-case.ts` (novos). Os dois leem a
  tratativa antes de escrever e recusam com erro de domínio próprio.
- A regra de itens da 166 (`occurrence-item-quantity.policy.ts`) é **reusada**, nunca reescrita: a
  correção valida exatamente como o registro. Segunda implementação diverge calada.
- O aviso de correção sai pela mesma porta de `notifyOccurrence`, com `try/catch` de fronteira que
  registra e engole (RF14) — o aviso nunca derruba a escrita.

**Presentation**

- `PATCH .../occurrences/:occurrenceId/items` e `POST .../occurrences/:occurrenceId/cancellation`,
  as duas com `TRIP_MANAGE_POLICY` e `Idempotency-Key`.
- A leitura da ocorrência publica `corrections[]` e `cancellation`.
- A linha do tempo (spec 158) ganha os dois tipos de evento.

**Frontend**

- Fase 1: `corrections`/`cancellation` como chaves opcionais no guard.
- `TripOccurrences.component.tsx`: botão "Corrigir" que reabre o formulário com o conjunto atual, e
  "Cancelar ocorrência" com diálogo de motivo. Os dois só nascem quando a ação é possível.
- Histórico da correção na leitura da ocorrência: o que era e o que passou a ser.

## Contratos/API/eventos

```
PATCH /trips/:id/documents/:documentId/occurrences/:occurrenceId/items
  { items: [{ code, quantity, unit }] }  → 200 { data: <ocorrência> }
  400 inválido · 404 de outra empresa · 409 tratativa aberta ou cancelada · 422 item único

POST /trips/:id/documents/:documentId/occurrences/:occurrenceId/cancellation
  { reason }                              → 200 { data: <ocorrência> }
  400 motivo vazio · 409 já cancelada ou tratativa aberta
```

Leitura ganha `corrections: [{ correctedAt, correctedByName, previousItems }]` e
`cancellation: { cancelledAt, cancelledByName, reason } | null`.

## Dados, migration e rollback

Aditiva: uma tabela nova e três colunas anuláveis com CHECK. Rollback derruba a tabela e as colunas.
Nenhum dado existente é reescrito, e ocorrência antiga nasce corrigível sem histórico.

⚠️ **A numeração colide.** Foi o que aconteceu na 166: duas migrations de outras sessões entraram
entre a geração e a publicação, e o encadeamento de snapshots quebrou. Gerar a migration **por
último**, logo antes de publicar, e rodar `db:generate` até `no_changes` depois do rebase.

## Segurança e tenant

`trip.manage` nas duas rotas. Ocorrência de outra empresa é `404` — o caso de uso não distingue "não
existe" de "é de outra empresa", como o resto do módulo. Motivo do cancelamento não vai a log.

## Idempotência e concorrência

`Idempotency-Key` nas duas rotas. Duas correções concorrentes: a segunda grava o conjunto que
encontrou, e as duas ficam no histórico — não há "última vence" silenciosa, há duas linhas.

A checagem da tratativa e a escrita acontecem na **mesma transação**: ler fora dela deixaria a
janela entre "não tem tratativa" e "abriu agora".

## Observabilidade

Os dois `409` têm código estável (`OCCURRENCE_CASE_ALREADY_OPEN`, `OCCURRENCE_ALREADY_CANCELLED`).
A falha do aviso de correção sai como `warn` com id da ocorrência — nunca com o motivo nem com itens.

## Estratégia de testes

- Políticas puras: o que conta como mudança (RF5), motivo inválido, teto.
- Contrato da API: os cinco códigos de erro, o `200` sem gravar correção, a resposta com os campos
  novos.
- Integração: a linha da correção com o conjunto anterior, o cancelamento com os três campos, e a
  ocorrência cancelada saindo da contagem.
- Frontend: tolerância (com e sem os campos), botões aparecendo só quando cabem, diálogo de motivo.
- ⚠️ Teste novo entra na lista explícita do `package.json` **e** no entrypoint da suíte.

## Riscos

- **A janela da tratativa é a única barreira** entre corrigir e mexer em dinheiro. Se a leitura dela
  sair da transação, a barreira vira sugestão.
- **"Não mudou nada" mal definido** enche a auditoria de ruído ou esconde correção real. A
  normalização (ordem, zeros à direita do decimal) é o miolo da política e leva contrato próprio.
- **Ordem de publicação.** De novo: tolerância primeiro, API depois.
