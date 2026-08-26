# 057 — A viagem cabe no bolso do motorista · tasks

> **Ordem de trabalho:** a Fase 0 antes de qualquer linha de código. Depois o **backend inteiro**
> (fases 1–3) antes de a primeira tela existir — é a D2 levada a sério: se a tela nascer junto, ela
> puxa regra para dentro do React e o app nativo de amanhã vira reescrita. A prova da D2 é a suíte
> E2E das fases 2–3 rodando **sem browser nenhum**.

## Estado das dependências (verificado no código, 2026-08-26)

| Dependência                                | Estado                                  | Consequência para esta spec                                                                                                                       |
| ------------------------------------------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **056** paradas e máquina de estados       | ✅ implementada                         | `trip_stops` já tem `sequence`, `arrived_at`, `completed_at` e a constraint `completed_at is null or arrived_at is not null`. É a base.            |
| `driver`/`aggregate` com `trip.read`/`trip.report` | ✅ reservados, **sem consumidor**  | `authorization.policy.ts` já os declara. Esta spec é o primeiro consumidor — nenhuma permissão nova nasce.                                         |
| `fleet_drivers.membership_id`              | ✅ existe, anulável                     | É por ele que o servidor resolve `membership → driver → trip` (D1). Motorista sem `membership_id` não tem PWA — e isso é caso de tela, não erro.   |
| `stored_objects` + provider de bucket      | ✅ em uso (XML, PDF de fatura)          | O comprovante da D4 entra por lá: bucket privado, presigned curta, chave sem nome de pessoa.                                                       |
| `TRIP_DOCUMENT_DELIVER_PATH` (spec 027)    | ⚠️ existe e é do **escritório**         | O comentário da 056 já avisa: `deliver` de rua é `/me/trips/*`. As duas rotas convivem; nada é removido aqui.                                      |
| **060** hora e preço                       | ⛔ só spec                              | `delivery_window_*` já é coluna. A parada mostra a janela quando houver; sem cadastro, não mostra. Nenhuma migration futura por causa disso.       |
| **058** mediana de tempo de serviço        | ✅ implementada, **medindo vazio**      | Ela lê `arrived_at`/`completed_at`, que **nada escreve** hoje. Esta spec é quem começa a escrever — é a razão de a 057 vir antes da 059 e da 061. |

## Fase 0 — Decisão registrada

> 🤖 Modelo: `opus` 🧠

### T001 🧠 ✅ — ADR-0045: canal-agnóstico, e a posição que carimba sem seguir

Registra: por que as rotas são de domínio e não de tela (D2) e o que isso proíbe — regra de viagem em
componente React; por que `GET /me/trips/current` não tem parâmetro de viagem (D1, BOLA/API1); e a
LGPD da coordenada por extenso (D3) — a captura é pontual, mora no evento e nunca numa tabela de
posição, a recusa **não** bloqueia a entrega, e a retenção é de 90 dias com expurgo **implementado**,
não só escrito.

- **Arquivos:** `docs/adr/0045-a-viagem-cabe-no-bolso-do-motorista.md`, `docs/SECURITY.md` (§ retenção de coordenada)
- **Aceite:** revisão humana
- **Verificação:** —

## Fase 1 — O modelo

> 🤖 Modelo: `sonnet` (T003 é 🧠 — tabela nova que três specs vão ler)

### T002 ✅ — `trip_stop_events`: onde estava quando confirmou

Evento por confirmação: parada, documento opcional, tipo (`arrived`/`delivered`/`returned`),
`latitude`/`longitude` **anuláveis**, `accuracy_meters`, `captured_at`, ator e hora. É desta tabela
que sai o tempo real de atendimento por parada (RF-4) — a medição que a 058 D6 e a 060 D6 consomem.

Coordenada absurda (0,0, precisão de 5 km) é **gravada com a precisão**, nunca descartada em
silêncio: o escritório vê a precisão ao lado do pino e decide.

- **Arquivos:** `apps/api-transportada/src/database/trip.schema.ts`, migration + `rollback.sql`
- **Aceite:** CHECK do tipo fechado na lista; coordenada anulável; `accuracy_meters` sem default
- **Verificação:** `make migration-test`

### T003 🧠 ✅ — `trip_stop_occurrences`: o problema que hoje morre no WhatsApp

Parada, documento opcional, tipo de lista fechada (cobrança inesperada, espera longa, doca
interditada, agendamento exigido, mercadoria avariada, endereço não localizado, cliente fechado,
outro), descrição curta, anexo em `stored_objects`, ator e hora.

**É independente da entrega** (D6.2): o motorista esperou duas horas _e_ entregou, e os dois fatos
convivem. Forçar a ocorrência a ser motivo de não-entrega perderia o caso mais comum.

- **Arquivos:** `apps/api-transportada/src/database/trip.schema.ts`, migration + `rollback.sql`
- **Aceite:** tipo fechado por CHECK; `document_id` anulável; FK de anexo para `stored_objects` por `(company_id, id)`
- **Verificação:** `make migration-test`

### T004 ✅ — A confirmação que não duplica

Tabela de idempotência das rotas de campo, no padrão `*_processed_messages` que os workers já usam:
chave do cliente + rota + empresa, com o resultado guardado. Dois celulares logados no mesmo
motorista, ou a fila offline reenviando, resolvem-se aqui — não no cliente.

- **Arquivos:** `apps/api-transportada/src/database/trip.schema.ts`, migration + `rollback.sql`
- **Aceite:** unique por `(company_id, idempotency_key)`; reenvio devolve o mesmo resultado, não um segundo evento
- **Verificação:** `make migration-test`

### T005 ✅ — O expurgo da coordenada existe, não é promessa

Rotina agendada que apaga `latitude`/`longitude`/`accuracy_meters` dos eventos com mais de 90 dias,
**preservando o evento**. Dado de localização de pessoa identificada é dado pessoal na LGPD, e reter
"por garantia" transforma comprovante em passivo.

- **Arquivos:** `apps/cron-transportada/` (rotina), `docs/SECURITY.md`
- **Aceite:** evento anterior ao prazo perde a coordenada e mantém `arrived_at`/`completed_at`
- **Verificação:** teste de integração com relógio injetado

## Fase 2 — O domínio, sem tela nenhuma

> 🤖 Modelo: `sonnet` (T006 é 🧠 — é a fronteira de autorização do papel novo)

### T006 🧠 ✅ — O servidor resolve qual viagem é a dele

`membership → fleet_driver → trip_drivers → trip` em `dispatched` ou `in_transit`. O motorista
**não escolhe id**: se ele não escolhe, não há o que enumerar (D1).

Dois casos que a spec nomeia e que o teste trava: motorista sem viagem ativa devolve `200` com corpo
vazio — **não 404**, porque não ter viagem hoje é rotina; e motorista em duas viagens `dispatched`
devolve as duas, para a tela pedir a escolha.

- **Arquivos:** `src/trips/application/find-current-driver-trip.use-case.ts`, `trip-driver.port.ts`, repositório
- **Aceite:** motorista de outra empresa não alcança nada; sem viagem → `200` vazio; duas viagens → duas
- **Verificação:** `bun run --cwd apps/api-transportada test`

### T007 ✅ — Cheguei

`arrived_at` na parada, evento com a coordenada se houver, e a viagem sobe a `in_transit` se ainda
estiver em `dispatched`. Idempotente pela T004.

- **Arquivos:** `src/trips/application/report-stop-arrival.use-case.ts`
- **Aceite:** segunda chamada com a mesma chave não move nada; `location: null` é aceito
- **Verificação:** `bun run --cwd apps/api-transportada test`

### T008 ✅ — Entreguei, e não entreguei

Documento a `delivered` ou a `returned` com motivo de lista fechada (ausente, recusa, endereço não
encontrado, avaria, estabelecimento fechado). Última nota da parada fecha `completed_at`; última
parada fecha a viagem em `completed` (056 D1).

A confirmação enfileirada de uma nota que o escritório desvinculou é recusada com **código estável** —
a tela mostra o conflito em vez de sumir com o toque.

- **Arquivos:** `src/trips/application/report-document-delivery.use-case.ts`, `trip.error.ts`
- **Aceite:** fecha parada e viagem em cascata; nota desvinculada devolve código estável; idempotente
- **Verificação:** `bun run --cwd apps/api-transportada test`

### T009 ✅ — A ocorrência

Grava tipo, descrição e anexo opcional, sem pedir valor nenhum ao motorista (D6.1) e sem impedir a
entrega (D6.2).

- **Arquivos:** `src/trips/application/report-stop-occurrence.use-case.ts`
- **Aceite:** ocorrência e entrega bem-sucedida convivem na mesma nota; nenhum campo de valor no contrato
- **Verificação:** `bun run --cwd apps/api-transportada test`

### T010 ✅ — O comprovante vai para o bucket privado

Foto do canhoto e assinatura colhida na tela, ligadas ao evento de entrega. Chave do objeto **sem
nome de pessoa**, entrega por presigned curta. A assinatura colhe traço e nome do recebedor — **nunca
CPF** (D4).

- **Arquivos:** `src/trips/application/attach-delivery-proof.use-case.ts`
- **Aceite:** objeto privado; nenhuma PII na chave; acima do teto de tamanho recusa com código estável e **não** trava a entrega
- **Verificação:** `bun run --cwd apps/api-transportada test`

## Fase 3 — As rotas, que são o contrato do canal

> 🤖 Modelo: `sonnet`

### T011 ✅ — As sete rotas de `/me/trips/*`

`GET current`, `POST stops/:stopId/arrive`, `POST documents/:documentId/deliver`, `POST .../return`,
`POST .../proof`, `POST stops/:stopId/occurrences`, `GET history`. Todas sob `trip.read`/`trip.report`,
todas honrando `Idempotency-Key`, todas resolvendo o motorista pelo token.

Payload de `current` enxuto para 3G: sem XML, sem histórico de evento, sem produto item a item.

- **Arquivos:** `src/trips/presentation/me-trip.routes.ts`, `me-trip.schema.ts`, `src/main.ts`
- **Aceite:** `driver` não alcança `/trips/:id` nem nenhuma rota de `trip.manage`; rate limit próprio em `/me/*`
- **Verificação:** `bun run --cwd apps/api-transportada test:integration`

### T012 ✅ — `Permissions-Policy` abre geolocalização e mantém o microfone fechado

`geolocation=(self), camera=(self), microphone=()`. O contrato **falha** se o microfone deixar de ser
`()` — é a diretiva que ninguém percebe voltando aberta.

- **Arquivos:** `apps/frontend-transportada/src/modules/shared/contentSecurityPolicy.service.ts`
- **Aceite:** contrato que quebra se `microphone` mudar
- **Verificação:** `bun run --cwd apps/frontend-transportada test` + `build` com `diff` do arquivo publicado

## Fase 4 — A tela do motorista

> 🤖 Modelo: `sonnet`

### T013 ✅ — A fila offline, que é onde a coisa se prova

IndexedDB, drenagem no evento `online` e no `sync` do service worker. **A tela diz a verdade**:
confirmação na fila aparece como "aguardando envio", nunca como enviada — mentir sobre sincronização
é pior que não ter offline.

- **Arquivos:** `src/modules/driver-trip/shared/offlineQueue.service.ts`, `hooks/`
- **Aceite:** três confirmações offline drenam sem duplicar; bateria acabando não perde a fila
- **Verificação:** contrato + smoke com `navigator.onLine` simulado

### T014 ✅ — O workspace `/minha-viagem`

Default de quem tem papel `driver` no `resolveCurrentWorkspace` — o motorista não pode cair na tela
de NF-e. Paradas na ordem congelada, primeira pendente destacada, dois toques por parada.

- **Arquivos:** `src/main.tsx`, `src/modules/driver-trip/pages/`, `components/`
- **Aceite:** alvo de toque ≥44px, sem tabela densa, ação principal ao alcance do polegar
- **Verificação:** smoke em 375px

### T015 ✅ — Navegar é delegar, e o texto é locale

Botão que abre `geo:`/`maps.google.com` com o endereço. Nenhum texto na tag.

- **Arquivos:** `src/modules/driver-trip/locales/`
- **Aceite:** paridade de chaves pt/en
- **Verificação:** `bun run --cwd apps/frontend-transportada test`

### T016 ✅ — O escritório vê andar

A tela de viagem do desktop (056) ganha a coluna de execução — chegada, entrega, motivo de retorno —
por `refetchInterval` do TanStack Query, **não** WebSocket novo.

- **Arquivos:** `src/modules/trip/components/`
- **Aceite:** a coluna aparece sem clique; nenhuma conexão nova
- **Verificação:** smoke

## Fase 5 — A verificação que exercita o caminho real

> 🤖 Modelo: `sonnet`

### T017 ✅ — E2E sem browser: a prova da D2

A suíte chama **só as rotas**. Se ela precisar de um browser para passar, a regra vazou para a tela e
a D2 está quebrada.

- **Arquivos:** `apps/api-transportada/test/integration/me-trip.integration.ts`
- **Aceite:** viagem inteira executada por HTTP: chega, entrega, não entrega, ocorrência, fecha
- **Verificação:** `bun run --cwd apps/api-transportada test:integration`

### T018 ✅ — `evidence.md`

O que rodou, o que passou e o que ficou de fora.

- **Arquivos:** `specs/057-a-viagem-cabe-no-bolso-do-motorista/evidence.md`
- **Aceite:** revisão humana
- **Verificação:** —
