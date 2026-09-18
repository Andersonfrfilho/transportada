# Spec 158 — Linha do tempo da viagem, com autoria

## Problema e resultado

A spec 156 prometeu que "tudo o que o escritório registra fica na linha do tempo como 'registrado por
<usuária> (escritório) pelo motorista <nome>'" (resultado esperado; D3; aceite 2). A T9 entregou a
autoria só na **ocorrência** (nota e feed `/ocorrencias`). O resto nunca foi lido por rota nenhuma:

- **Iniciar a rota pelo motorista não deixa rastro.** `start-field-trip.use-case.ts` só troca
  `trips.status`; o repositório recebe `actorUserId` e não usa. Pelo escritório, fica uma linha em
  `audit_logs` (`trip_field_office.start_route`) — trilha de segurança, não dado de produto.
- **Chegada, entrega e devolução** estão em `trip_stop_events`, com `channel`,
  `on_behalf_of_driver_id`, `created_at` (a hora do fato) e `recorded_at` (a hora do registro, na
  baixa retroativa). Só a leitura do comprovante toca a tabela, e sem autoria.
- **As transições manuais do escritório** (separar, carregar, entregar, devolver pelo fluxo antigo, e
  o WhatsApp do operador) gravam `trip_document_events` **sem canal**, então o default as rotula
  `driver_app` — autoria enganosa.
- Nenhuma troca de `trips.status` tem histórico: há 14 `update(trips)` em
  `src/trips/infrastructure/`, e só o valor atual sobrevive.

**Resultado esperado:** quem abre a viagem vê, numa seção "Linha do tempo", em ordem, o despacho, cada
troca de status da viagem, cada chegada, entrega, devolução e ocorrência, e as transições manuais das
notas — cada item com **quando aconteceu**, **quando foi registrado** (se diferente), a nota ou a
parada a que se refere e a frase de autoria do canal: "por <usuária> (escritório) pelo motorista
<nome>", "pelo motorista <nome>", "pelo WhatsApp", "por <usuária>". Fecha o aceite 2 da spec 156.

## Fora do escopo

- Linha do tempo no app do motorista, no portal do contratante e no WhatsApp.
- Reconstruir o histórico de status anterior ao deploy (não existe dado para isso).
- Corrigir a entrega repetida do motorista sobre nota já baixada (grava evento novo sem mudar a nota,
  `report-document-delivery.use-case.ts:313-318`). A linha do tempo mostra o que foi gravado; o defeito
  é registrado à parte (T11).
- Exportar a linha do tempo (PDF/CSV) e EDI de ocorrência.
- Coordenadas do evento na tela (latitude/longitude ficam fora da resposta).

## Decisões

- **D1 — Tabela nova `trip_status_events`** _(decisão do usuário, 2026-09-18)_: `id`, `company_id`,
  `trip_id`, `from_status` (nulo na criação), `to_status`, `actor_user_id` (nulo quando a troca é do
  sistema — cron/worker), `channel`, `on_behalf_of_driver_id`, `occurred_at`, `recorded_at`. FK
  composta `(company_id, trip_id)` e `(company_id, on_behalf_of_driver_id)`, mesma check de
  `channel = 'office' ⇒ on_behalf_of_driver_id is not null` das tabelas de campo. Índice
  `(company_id, trip_id, occurred_at, id)`. Migration **aditiva**. **Toda** escrita de
  `trips.status` grava o evento na mesma transação, só quando o status mudou de fato (`changed=true`).
  Registrada na ADR-0068.
- **D2 — Canal novo `backoffice`** _(decisão do usuário, 2026-09-18)_ em `TRIP_FIELD_CHANNELS`: a ação
  feita pela tela do escritório que **não** é em nome do motorista (fluxo manual de separação/carga/
  baixa, ações de estado da viagem). Não exige `on_behalf_of_driver_id`. O fluxo manual passa a gravar
  `backoffice` pela web e `whatsapp` pelo WhatsApp do operador. `office` continua significando "em
  nome do motorista" (spec 156 D3).
- **D3 — Histórico de `trip_document_events`**: hoje só o fluxo manual grava nessa tabela
  (`drizzle-trip-document.repository.ts`, `drizzle-trip-document-batch.repository.ts`), mas web e
  WhatsApp do operador passam pelos mesmos repositórios, então o histórico não sabe de onde veio.
  A ADR-0068 escolhe, com dado de produção medido na T1, entre: (a) backfill `backoffice` se não
  houver linha vinda do WhatsApp do operador; (b) nenhuma reescrita, e a leitura trata linhas com
  `occurred_at` anterior ao corte da migration como **canal não registrado** (frase "por <usuária>",
  sem selo). A escolha fica escrita na ADR, não deixada para o executor.
- **D4 — Rota `GET /trips/:id/timeline`**, com `TRIP_FIELD_READ_POLICY` (`fleet.read` **ou**
  `trip.report-on-behalf`), a mesma das leituras do D11 da spec 156: o `finance` lê, o separador não
  ganha nada novo. Viagem de outra empresa → 404. Paginação por cursor `(occurredAt, id)`, `limit`
  padrão 100 e máximo 200, ordem decrescente (o mais recente primeiro).
- **D5 — Fontes e tipos de item** (`kind`), unidas em memória como `mergeOccurrenceFeed` faz no feed:

  | `kind`                    | fonte                       | referência    |
  | ------------------------- | --------------------------- | ------------- |
  | `trip.dispatched`         | `trip_dispatch_snapshots`   | viagem        |
  | `trip.status_changed`     | `trip_status_events` (D1)   | viagem        |
  | `stop.arrived`            | `trip_stop_events`          | parada        |
  | `document.delivered`      | `trip_stop_events`          | nota e parada |
  | `document.returned`       | `trip_stop_events`          | nota e parada |
  | `stop.occurrence`         | `trip_stop_occurrences`     | parada        |
  | `document.occurrence`     | `trip_document_occurrences` | nota          |
  | `document.status_changed` | `trip_document_events`      | nota          |

  O `kind='occurrence'` de `TRIP_STOP_EVENT_KINDS` nunca é escrito e não entra.

- **D6 — Formato do item**: `id`, `kind`, `occurredAt`, `recordedAt` (só quando difere de
  `occurredAt`), `channel` (nulo = não registrado), `actorName`, `onBehalfOfDriverName`, `fromStatus`/
  `toStatus` (só nos `*.status_changed`), `stop` (`{ id, sequence }` ou nulo), `document`
  (`{ id, number, series }` ou nulo), `occurrence` (`{ typeName, note }` ou nulo), `returnReason`
  (só em `document.returned`). **Nunca**: ids de usuário, documento/nome de quem recebeu, imagem,
  chave de storage, coordenadas, XML. Nome do ator e do motorista pelos mesmos aliases de
  `trip-occurrence-feed.query.ts` (vínculo ativo → perfil; motorista por `(companyId, id)`); sem
  vínculo ativo, `actorName: null`, nunca o id cru.
- **D7 — Frase de autoria única no front**: `resolveFieldAuthorshipText` sai do namespace
  `occurrence.authorship.*` para um neutro (`authorship.*`) e ganha `backoffice` e "canal não
  registrado". `TripOccurrences` e a linha do tempo usam a mesma função.

## Histórias priorizadas

### P1 — O escritório confere quem deu a baixa

**Given** uma nota entregue pelo escritório em nome do motorista, com "Entregue em" dois dias antes
**When** alguém com `fleet.read` ou `trip.report-on-behalf` abre a viagem **Then** a linha do tempo
mostra "Nota 123 entregue — por <usuária> (escritório) pelo motorista <nome>", com a data informada e
"registrado em <hoje>".

### P1 — Quem iniciou a rota

**Given** uma viagem `in_transit` **When** o motorista (ou o escritório por ele) inicia a rota **Then** a
linha do tempo mostra a troca `in_transit → on_delivery_route` com a autoria do canal.

### P2 — O fluxo manual deixa de se passar pelo motorista

**Given** a usuária separa e carrega notas pela tela antiga **Then** os itens aparecem "por <usuária>",
sem o selo de motorista.

## Requisitos funcionais

1. Migration aditiva: `trip_status_events` (D1) e `backoffice` na check de `channel` de todas as
   tabelas que a usam.
2. Toda escrita de `trips.status` grava `trip_status_events` na mesma transação (D1). Um contrato
   estático lê `src/trips/infrastructure/` e reprova `update(trips)` que mexa em `status` sem gravar o
   evento no mesmo método.
3. Start-route (motorista e escritório) e a transição automática da chegada gravam o evento com ator,
   canal e motorista de `deriveFieldAuthorship`.
4. Fluxo manual grava `backoffice` (web) ou `whatsapp` (operador) em `trip_document_events` e em
   `trip_status_events` (D2).
5. `GET /trips/:id/timeline` conforme D4–D6.
6. Seção "Linha do tempo" no detalhe da viagem, com os estados carregando, vazio e erro, "carregar
   mais" pelo cursor, e filtro opcional por nota (a nota aberta no detalhe filtra no cliente).

## Requisitos não funcionais

- Uma consulta por fonte, sem N+1; cada uma usa índice que começa por `company_id` (a de
  `trip_stop_events` entra por `trip_stops_company_trip_idx`).
- p95 da rota ≤ 300 ms com uma viagem de 50 notas e 200 eventos (medido na integração).
- Nenhum log com nome, documento, imagem ou payload do item (security.md §1).

## Casos extremos e falhas

- Viagem sem evento nenhum (recém-criada): `items: []`, a tela mostra o estado vazio.
- Ator removido da empresa: `actorName: null` → "por usuário removido"; nunca id.
- Troca de status sem ator (cron/worker): `channel: null`, `actorName: null` → "pelo sistema".
- Dois eventos com o mesmo `occurredAt`: desempate estável por `id`, o cursor não repete nem pula.
- Entrega repetida do motorista (fora do escopo): aparecem os dois itens.
- Viagem anterior ao deploy: sem `trip.status_changed` antes do corte; a tela não inventa.

## Critérios de aceite

1. Iniciar a rota pelo **motorista** grava `trip_status_events` com `channel='driver_app'`, e a
   linha do tempo mostra "pelo motorista <nome>".
2. Iniciar a rota pelo **escritório** mostra "por <usuária> (escritório) pelo motorista <nome>" —
   o aceite 2 da spec 156.
3. Entrega do escritório com "Entregue em" retroativo: `occurredAt` = a data informada, `recordedAt`
   = a hora do registro; entrega do motorista não traz `recordedAt`.
4. Separar pela tela antiga grava `channel='backoffice'` e aparece sem selo de motorista.
5. Viagem de outra empresa → 404 `TRIP_NOT_FOUND`; nenhuma junção sem `company_id` (contrato estático
   no molde de `occurrence-feed-query-tenant-safety.contract.ts`).
6. `finance` → 200; sem `fleet.read` nem `trip.report-on-behalf` → 403. As listas de
   `finance-read.contract.ts` e `separator-role.contract.test.ts` são atualizadas, não contornadas.
7. Cursor: 250 eventos lidos em páginas de 100 devolvem os 250, sem repetir nem pular, inclusive com
   `occurredAt` empatado.
8. A resposta não contém `actorUserId`, `receiverName`, `receiverDocumentMasked`, `latitude`,
   `longitude`, `objectKey`; o validador do front recusa chave desconhecida.
9. Um `update(trips)` novo com `status` e sem evento reprova o contrato estático.
10. Nenhuma migration destrutiva; `make migration-test` passa com rollback.

## Dúvidas

Nenhuma bloqueante. D3 é decidida na ADR-0068 com dado medido (T1), com as duas saídas já escritas.
