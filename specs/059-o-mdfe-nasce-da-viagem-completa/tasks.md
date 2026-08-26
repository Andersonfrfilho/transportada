# 059 — O MDF-e nasce da viagem completa · tasks

> **Ordem de trabalho:** a prontidão (fases 1–2) antes de qualquer gatilho. Um consumer que emite
> manifesto sobre uma regra de completude que ninguém conferiu é o pior defeito possível desta spec —
> declaração falsa à SEFAZ, e ninguém olhando.

## Estado das dependências (verificado no código, 2026-08-26)

| Dependência                             | Estado                                        | Consequência para esta spec                                                                                                              |
| --------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Emissão de MDF-e                        | ✅ viva (outbox → RabbitMQ → provider)        | Esta spec **não a toca**: ela decide *quando* chamar.                                                                                    |
| `mdfe_manifests.trip_id`                | ✅ existe                                     | O vínculo já está lá; falta a trava de manifesto vivo por viagem.                                                                        |
| `cteAuthorizedExpression()`             | ✅ existe em `trip.query.ts`                  | Já responde "esta nota tem CT-e autorizado?" — **sim/não**, sem o motivo. A readiness é a versão que diz por quê.                        |
| `POST /trips/:id/mdfe-manifests`        | ✅ existe                                     | Hoje exige `documentIds` no corpo. A D4 a faz completar da viagem.                                                                       |
| `list-returned-with-active-cte`         | ✅ implementada (056 D8)                      | Mesmo caminho de índice da D1 — e é por isso que ele nasce uma vez só.                                                                   |
| `TripMdfePendingDialog` (frontend)      | ⚠️ existe                                     | É a **evidência do problema**, não a solução: ele bloqueia na hora do clique em vez de a viagem saber. Evolui, não some.                 |
| Índice `cte_batch_items (company, nfe)` | ⛔ não existe                                 | O unique é `(company, batch, nfe)` — a busca por nota sozinha não o usa. Nasce aqui (RF-2).                                              |
| **057** execução de campo               | ✅ concluída                                  | A viagem agora sabe o que aconteceu na rua. Não é dependência desta spec, mas é o que a 061 espera das duas.                             |

## Premissa registrada — a dúvida que eu fecho, e por quê

A spec deixa em aberto: **emissão manual de MDF-e em `draft`/`route_planned` — permitir ou exigir
`dispatched` também no manual?**

Eu fecho por **exigir `dispatched` nos dois caminhos**, e o argumento é o da própria spec. A garantia
inteira da D3 é: *"depois de `dispatched` nenhuma nota entra ou sai, então o conjunto declarado no
manifesto não pode mudar por baixo dele"*. Permitir a emissão manual antes disso reabre exatamente
esse buraco — o manifesto declara dez CT-e, alguém vincula a décima primeira nota, e a declaração à
SEFAZ passa a ser falsa sem que nada acuse.

E o custo prático é pequeno: despachar é um clique, feito no instante em que o caminhão sai. Quem
quer "emitir antes de o caminhão sair" despacha e emite — a ordem muda, a operação não.

**Se a operação real exigir o contrário, isto se afrouxa numa linha** (o portão está num lugar só,
`checkTripAcceptsManifest`), e o teste que o trava está nomeado. A recusa diz o motivo e a ação:
"despache a viagem para emitir o manifesto", nunca um `409` mudo.

A segunda dúvida — **encerramento automático do MDF-e** quando a viagem vai a `completed` — a própria
spec já a empurra ("P3 desta spec ou a spec 060"). Fica **fora**, e o `evidence.md` a nomeia: manifesto
não encerrado é pendência na SEFAZ e trava o próximo, então ela é dívida conhecida, não esquecida.

## Fase 0 — Decisão registrada

> 🤖 Modelo: `opus` 🧠

### T001 🧠 — ADR-0046: a viagem não fala com a SEFAZ, mas passa a saber quando pedir

Revisa o **ADR-0023** por extenso: a viagem continua sem falar com a SEFAZ — quem fala é a trilha de
emissão — e passa a **saber quando** e a **poder pedir**. Sem isso escrito, a próxima pessoa lê o 0023
e conclui que esta feature o viola.

Registra: por que completude é consulta e não flag (flag dessincroniza quando um CT-e é cancelado, e
manifesto emitido sobre flag velha é declaração falsa); por que o gatilho é evento e não varredura;
por que automático nasce **desligado**; e a premissa do `dispatched` no manual, acima.

- **Arquivos:** `docs/adr/0046-o-mdfe-nasce-da-viagem-completa.md`, `docs/adr/0023-*` (nota de revisão), `docs/spec/fiscal-integration.md`
- **Aceite:** revisão humana
- **Verificação:** —

## Fase 1 — O modelo

> 🤖 Modelo: `sonnet`

### T002 — O caminho de índice da nota até o CT-e

`cte_batch_items (company_id, nfe_document_id)`. O unique existente lidera por `batch_id`, então a
busca por nota varre. Com 200 notas numa viagem, é a diferença entre uma consulta e duzentas.

- **Arquivos:** `src/database/cte-batch.schema.ts`, migration + `rollback.sql`
- **Aceite:** índice criado; a readiness de 200 notas não faz N+1
- **Verificação:** `make migration-test`

### T003 — `trips.fiscal_readiness_state`, derivado e nunca autoritativo

`incomplete|ready|manifested|divergent`, recalculado. **A resposta da readiness é sempre a verdade**;
esta coluna existe para filtrar lista sem varrer o fiscal inteiro, e o comentário do schema tem de
dizer isso — senão alguém a lê como fonte e emite sobre valor velho.

- **Arquivos:** `src/database/trip.schema.ts`, migration + `rollback.sql`
- **Aceite:** CHECK fechado na lista; default `incomplete`
- **Verificação:** `make migration-test`

### T004 — A trava de manifesto vivo por viagem

Unique parcial em `mdfe_manifests (company_id, trip_id)` para manifesto **não cancelado/rejeitado**.
É o que impede duas autorizações simultâneas de virarem dois MDF-e — e duplicar manifesto é incidente
fiscal, não bug de tela.

- **Arquivos:** `src/database/mdfe.schema.ts`, migration + `rollback.sql`
- **Aceite:** segundo manifesto vivo na mesma viagem é recusado pelo banco
- **Verificação:** `make migration-test`

### T005 — `automatic_mdfe_on_completion`, desligado por padrão

No perfil fiscal da empresa, com trilha de quem ligou (`security.md` §10). Emissão fiscal automática
é ação irreversível contra órgão público: ligar por padrão é decidir pelo cliente algo que custa
dinheiro dele quando erra.

- **Arquivos:** `src/database/*.schema.ts`, migration + `rollback.sql`
- **Aceite:** default `false`; alteração grava trilha
- **Verificação:** `make migration-test`

## Fase 2 — A prontidão, que é a regra inteira

> 🤖 Modelo: `opus` 🧠 (T006 é a regra que decide declaração à SEFAZ)

### T006 🧠 — A readiness responde por nota, com o motivo

Uma consulta para as N notas. Por nota: `ok`, `no_cte`, `cte_in_progress`, `cte_rejected` (com cStat e
mensagem), `cte_cancelled`. E o caso da **D4b**: viagem carregada por `freight_calculations` declara
que não há o que manifestar por este caminho, em vez de ficar `incomplete` para sempre — que é como
uma viagem some da lista sem ninguém entender.

- **Arquivos:** `src/trips/application/read-trip-fiscal-readiness.use-case.ts`, `infrastructure/trip-fiscal-readiness.query.ts`
- **Aceite:** um teste por motivo de bloqueio; sem N+1
- **Verificação:** `bun run --cwd apps/api-transportada test` + integração

### T007 — O portão da emissão, num lugar só

`checkTripAcceptsManifest`: recusa se a viagem não está `dispatched` (premissa acima), se a readiness
não é `ready`, se passa de 50 municípios de descarregamento (D5), ou se a empresa não tem certificado
válido — **antes de tocar a fila**.

Os 50 municípios são recusados **com a lista** e a sugestão de dividir a viagem, nunca como rejeição
da SEFAZ traduzida do jeito que a SEFAZ fala.

- **Arquivos:** `src/trips/domain/trip-manifest.policy.ts`
- **Aceite:** um teste por recusa, cada uma com código estável próprio
- **Verificação:** `bun run --cwd apps/api-transportada test`

### T008 — `GET /trips/:id/fiscal-readiness`

- **Arquivos:** `src/trips/presentation/trip.routes.ts`, `trip.schema.ts`
- **Aceite:** `trip.read` alcança; código estável por motivo
- **Verificação:** `bun run --cwd apps/api-transportada test:integration`

## Fase 3 — O gatilho

> 🤖 Modelo: `sonnet` (T010 é 🧠 — concorrência)

### T009 — `cte.authorized.v1` sai na autorização

O worker já escreve `cte_fiscal_documents`; o evento nasce ali. Sem chave de acesso no envelope —
id opaco (`security.md` §1).

- **Arquivos:** `apps/worker-transportada/src/cte-issuance/`, topologia
- **Aceite:** envelope sem chave de acesso nem participante
- **Verificação:** contrato + `make worker-integration`

### T010 🧠 — O consumer que pergunta se a viagem ficou pronta

Trilha padrão: retry, `processed_messages`, dead-letter. **Idempotente** — o mesmo evento duas vezes
não emite dois manifestos. E a trava de concorrência da T004 é quem decide quando dois eventos chegam
no mesmo instante.

Casos que o teste trava: CT-e autorizado depois de a viagem ser cancelada (ignora e registra), e
viagem fora de `dispatched` (marca pronta, **não** emite).

- **Arquivos:** `apps/worker-transportada/src/trip-fiscal-readiness/`
- **Aceite:** dois eventos simultâneos → um manifesto; evento repetido → nenhum efeito novo
- **Verificação:** `make worker-integration`

## Fase 4 — A emissão que se preenche da viagem

> 🤖 Modelo: `sonnet`

### T011 — O corpo vira parcial, e a viagem completa o resto

`documentIds`, veículo, condutores e municípios saem da viagem. O diálogo pede **o resto** — seguro,
tipo de carga ambíguo, produto predominante, vale-pedágio —, não tudo de novo.

- **Arquivos:** `src/mdfe-manifests/application/create-trip-mdfe-manifest.use-case.ts`, schema
- **Aceite:** corpo vazio emite manifesto completo quando a viagem tem tudo
- **Verificação:** integração

### T012 — Notificação nos três momentos

"Ficou pronta", "emitido", "divergiu". Falha de emissão automática **nunca é silenciosa**.

- **Arquivos:** `apps/worker-transportada/src/trip-fiscal-readiness/`
- **Aceite:** as três chegam; nenhuma carrega chave de acesso
- **Verificação:** contrato

## Fase 5 — A tela

> 🤖 Modelo: `sonnet`

### T013 — O painel de prontidão na viagem

"8 de 10 prontas", e por nota faltante o motivo. Evolui o `TripMdfePendingDialog`.

- **Arquivos:** `src/modules/trip/components/`
- **Aceite:** cada motivo aparece com texto próprio
- **Verificação:** contrato + smoke

### T014 — A lista de manifestos da viagem, com XML e DAMDFE (D4c)

Inclusive cancelados e rejeitados, **com o motivo** — "por que esse não valeu?" é a pergunta que se
faz depois.

- **Arquivos:** `src/modules/trip/components/`
- **Aceite:** download por presigned curta; cancelado listado com motivo
- **Verificação:** smoke

### T015 — Semáforo e filtro no painel de viagens (P3)

- **Arquivos:** `src/modules/trip/`
- **Aceite:** filtro "prontas para manifestar"
- **Verificação:** contrato

## Fase 6 — Verificação

> 🤖 Modelo: `sonnet`

### T016 — E2E: da nota ao manifesto autorizado

Viagem → CT-e para todas as notas → despacho → prontidão → emissão → manifesto com veículo,
condutores e municípios corretos.

- **Arquivos:** `apps/api-transportada/test/integration/`
- **Verificação:** `bun run --cwd apps/api-transportada test:integration`

### T017 — `evidence.md`

O que rodou, o que passou, e **o que ficou de fora** — o encerramento automático em primeiro lugar.

- **Arquivos:** `specs/059-o-mdfe-nasce-da-viagem-completa/evidence.md`
- **Verificação:** —
