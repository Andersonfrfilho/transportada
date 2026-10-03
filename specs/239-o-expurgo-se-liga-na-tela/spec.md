# Feature 239 — O expurgo se liga na tela

> **Estado:** pronta para execução, sem dúvida aberta (as escolhas reversíveis estão marcadas como
> recomendação em "Decisões"). **Tem migration (T1.2 🧠): parar e perguntar ao usuário antes.**
> Data: 2026-10-03. Depende da 196 publicada (`origin/staging` em `7160491c7`).
> Palavras do usuário (2026-10-02, registradas em `specs/196-todo-evento-carrega-onde-aconteceu/evidence.md:1745-1747,1809-1811`):
> _"o expurgo por enquanto é para ficar desligado para tudo, isso deve ficar em uma página de
> configuração"_ e _"Spec nova, depois da 196"_.

## Problema e resultado

A spec 196 deixou o expurgo de noventa dias das cinco tabelas de evento com ponto **desligado**, e o
único jeito de ligá-lo é variável de ambiente do worker:

- `TRIP_LOCATION_PURGE_ENABLED`, `z.enum(['true','false'])`, padrão `'false'`
  (`apps/worker-transportada/src/config/environment.schema.ts:76-82`), exposta como
  `tripLocationPurgeEnabled` (`environment.schema.ts:243`) e ligada à rotina em
  `apps/worker-transportada/src/main.ts:1216-1217`.
- A rotina (`trip-location-purge/application/trip-location-purge.routine.ts:130-147`) sai antes de
  qualquer leitura quando desligada; o expurgo de 36 h dos pings do rastro ao vivo roda **antes e
  fora** do interruptor (`routine.ts:112-122`, emenda de 2026-10-03 à 196 D11).
- O prazo é constante de código: `TRIP_LOCATION_RETENTION_DAYS = 90`
  (`trip-location-purge/domain/trip-location-purge.constant.ts:14`), o mesmo número que a ADR-0045 §3.3
  (`docs/adr/0045-a-viagem-cabe-no-bolso-do-motorista.md:68`) e o `docs/SECURITY.md:1248-1257` prometem.
- O expurgo é **global**: os redatores não filtram empresa
  (`infrastructure/drizzle-trip-location.repository.ts:42-69,110-172`), e a cópia do schema do worker
  nem tem `company_id` (`src/database/trip-execution.schema.ts:10-66`). As cinco tabelas têm
  `company_id NOT NULL` na API (`apps/api-transportada/src/database/trip.schema.ts:488,1133,1365,1706,2085`).

Consequências: ligar exige redeploy e acesso ao painel do Railway; a empresa (que é a controladora do
dado na LGPD) não decide nada; e o `docs/SECURITY.md:1272-1283` registra como achado aberto que a
coordenada **não expira** enquanto ninguém ligar a variável.

**Resultado:** o `company-admin` liga, desliga e ajusta o prazo do expurgo da coordenada **da própria
empresa** num painel do módulo Viagens, sem variável de ambiente nem redeploy. Desligado continua sendo
o padrão. Ligar mostra, antes de confirmar, quantos pontos cairão; toda mudança fica em `audit_logs`; o
worker lê a configuração a cada ciclo e expurga cada empresa pelo prazo dela, sem cruzar tenants.

## Fora do escopo

- **O rastro ao vivo (`trip_location_pings`, 36 h).** Continua fora do interruptor e fora da tela
  (decisão do usuário de 2026-10-03, 196 D11 emendada). O painel **diz** que ele existe e que roda
  sempre, mas não o controla.
- **Prazo acima de 90 dias.** O teto da tela é o número da ADR-0045 §3.3. Guardar mais exige emendar a
  ADR-0045 e o `docs/SECURITY.md` — decisão própria, não desta spec (ver D6).
- **A coordenada do transcript do WhatsApp** (`meta_whatsapp.messages.payload.location` e o rótulo em
  `content`, achado da 196 T3.7 em `specs/196-.../evidence.md:2874`; ADR-0081 linha 100). Fica para
  **spec própria** (D9).
- **Endereço e cadastro de lugar** (`trip_stops`, `client_delivery_addresses`, `geocoded_*`,
  `municipality_centroids`, `toll_booths`, `fleet_drivers`): seguem fora do expurgo pelos motivos já
  listados em `TRIP_LOCATION_UNSTAMPED_TABLES` (`trip-location-purge.constant.ts:62-78`).
- **Restaurar coordenada apagada.** Não existe: o expurgo é irreversível, e é por isso que a tela pede
  confirmação (D5).
- **Painel de "último ciclo"** (quantas linhas o worker apagou na última batida) dentro da tela. O log
  já conta por tabela; trazer `job_runs` para o painel é melhoria separada.
- **Tela central de privacidade/LGPD.** O painel mora perto do efeito (D7), não numa tela nova.

## Decisões

- **D1 — A configuração mora numa tabela nova por empresa, `company_location_retention_settings`.**
  Mesmo molde das sete tabelas `company_*_settings` que já existem (`company_cargo_settings`,
  `company_crew_settings`, `company_delivery_proof_settings`, `company_driver_allowance_settings`,
  `company_energy_settings`, `company_route_optimization_settings`, `company_tax_settings`):
  `company_id` PK + FK `companies`, `purge_enabled BOOLEAN NOT NULL DEFAULT false`,
  `retention_days INTEGER NOT NULL DEFAULT 90` com `CHECK (retention_days BETWEEN 30 AND 90)`,
  `purge_effective_at TIMESTAMPTZ NULL` (D5), `updated_by_user_id` (sem FK, para o rastro sobreviver ao
  usuário), `created_at`, `updated_at` — o molde exato é
  `apps/api-transportada/src/database/company-driver-allowance-settings.schema.ts:17-37` (PK = `company_id`,
  FK `restrict`/`cascade`, CHECK nomeado). **Sem linha = padrão do sistema = desligado, 90 dias.** Não é coluna em `company_delivery_proof_settings`
  (aquela é regra da foto do canhoto; misturar faria o `DELETE` "voltar ao padrão" de um painel apagar o
  outro). É **migration aditiva** com `rollback.sql`: task 🧠, **parar e perguntar ao usuário antes**. O
  `rollback.sql` segue o da diária (`drizzle/20260917034547_driver_daily_allowance/rollback.sql:25-31`):
  **recusa** com `RAISE EXCEPTION` se a tabela tiver linha — derrubar a tabela com empresa ligada
  apagaria a decisão dela em silêncio.
  A mesma migration cria o índice parcial `(company_id, <coluna de tempo>) WHERE latitude IS NOT NULL`
  nas cinco tabelas (desde a `20261002153258_occurrence_location_stamp` as **cinco** têm índice parcial, mas **só por
  tempo**, `<tabela>_located_<tempo>_idx`; nenhuma tem `company_id` na frente, então os cinco novos
  — `<tabela>_company_located_<tempo>_idx`, via `buildEventLocationCompanyIndex` — acrescentam a empresa
  e não duplicam nenhum existente). Depois da T2.2 os cinco índices antigos só por tempo ficam sem leitor
  (candidatos a `DROP` em follow-up; **não** nesta spec).

- **D2 — O worker lê a configuração na própria varredura, por empresa elegível, sem laço no código.** Cada
  lote de cada tabela é **um `UPDATE` só**, com `CROSS JOIN LATERAL` sobre as empresas elegíveis (parecer do
  architect, 2026-10-03; substitui o `JOIN ... LIMIT` + `UPDATE ... WHERE id IN` anterior):

  ```sql
  UPDATE trip_stop_events t
  SET latitude = NULL, longitude = NULL, accuracy_meters = NULL, captured_at = NULL, location_state = 'expired'
  WHERE t.latitude IS NOT NULL
    AND t.id IN (
      SELECT e.id
      FROM company_location_retention_settings s
      CROSS JOIN LATERAL (
        SELECT x.id FROM trip_stop_events x
        WHERE x.company_id = s.company_id AND x.latitude IS NOT NULL
          AND x.created_at < $now::timestamptz - make_interval(days => s.retention_days)
        ORDER BY x.created_at
        LIMIT $limit
      ) e
      WHERE s.purge_enabled AND s.purge_effective_at <= $now::timestamptz
      LIMIT $limit
    )
  RETURNING t.id;
  ```

  - **Emenda da T2.2 ao parecer:** o `ORDER BY x.<tempo>` do `LATERAL` não estava no parecer. Medido
    (`evidence.md`, T2.2): sem ele, com a fila esvaziada, o planejador apostava num `Seq Scan` com `LIMIT`
    que varre a tabela inteira para achar zero linha; com ele usa índice. Efeito colateral bom: apaga o mais
    antigo primeiro.
  - O `LATERAL` faz o planejador entrar no índice `<tabela>_company_located_<tempo>_idx` uma vez por
    empresa elegível, com `company_id` no `Index Cond` (em tese: ver a ressalva abaixo). O `LIMIT` interno
    é **igual** ao externo (500), então **não há justiça entre empresas**: a fila drena empresa por
    empresa, e a empresa B pode esperar dias sem perder ponto enquanto A tem backlog. O `t.latitude IS
NOT NULL` fora da subconsulta repete o filtro por idempotência.
  - **Ressalva medida (revisão da Fase 2, `evidence.md` ≈:527):** (a) enquanto o índice só por tempo
    `<tabela>_located_<tempo>_idx` existir, o planejador **não escolhe** o composto; (b) as sondas por
    consulta crescem com o número de empresas elegíveis, e o custo de cada sonda cresce com as linhas com
    ponto, vencidas, das empresas **não** elegíveis; (c) **follow-up, fora desta spec (exige migration):**
    `DROP INDEX` dos cinco `<tabela>_located_<tempo>_idx` com `SET LOCAL lock_timeout`, conferindo
    `idx_scan` em produção antes e com `rollback.sql` que recria os índices; a justiça entre empresas
    (`LIMIT` interno menor ou `ORDER BY` externo por idade) entra junto dele.
  - Coluna de tempo por tabela: `trip_stop_events.created_at`, `trip_status_events.recorded_at`,
    `trip_stop_occurrences.created_at`, `trip_document_occurrences.created_at`,
    `trip_delivery_proofs.created_at`. `captured_at` é zerado nas quatro tabelas de evento; **no
    comprovante `captured_at` não entra no `SET`** (como hoje). `location_state = 'expired'` é obrigatório
    (CHECK de `event-location.schema.ts`).
  - `$now` sempre com cast `::timestamptz` (cópia, no worker, de `timestamptzParameter`, que a API tem em
    `src/database/sql-timestamptz-parameter.support.ts`; o worker não importa da API).
  - **Proibido `FOR UPDATE SKIP LOCKED`.** Se algum dia houver `FOR UPDATE` na subconsulta com junção, tem
    de ser `FOR UPDATE OF x` — sem o `OF`, trava a linha de configuração e o `PUT` da tela espera.
  - O isolamento de tenant é a própria junção: cada linha só é comparada com o prazo **da sua** empresa
    (`x.company_id = s.company_id`), e empresa sem linha de configuração não entra. O número de consultas
    por ciclo é o mesmo de hoje (lotes × cinco tabelas), independente do número de empresas. `$now` segue
    injetado (`routine.ts:110`), para o teste de relógio. O worker ganha cópia por valor da tabela nova e do
    `company_id` nas cinco cópias (`src/database/trip-execution.schema.ts`), vigiadas pelo contrato de
    paridade que já existe (`test/trip-location-purge/schema-parity.contract.ts`).
  - Precedente de leitura de configuração por empresa numa varredura sem contexto de empresa: a
    distribuição de NF-e (`nfe-distribution-pull/infrastructure/drizzle-distribution-candidate.source.ts:82-120`).

- **D3 — A variável `TRIP_LOCATION_PURGE_ENABLED` some.** Recomendação, com justificativa:
  - a 196 D11 a declarou **provisória** ("o interruptor é de ambiente até virar tela",
    `specs/196-.../spec.md:208`);
  - a instalação é dedicada, um deploy por transportadora (ADR-0021, `CLAUDE.md` da raiz): um teto global
    duplicaria o mesmo interruptor em dois lugares, e o pior caso de dois interruptores é a tela dizer
    "ligado" com o worker desligado — mentira sobre retenção de dado pessoal, que é pior que qualquer dos
    dois estados;
  - o padrão seguro continua: sem linha de configuração, ninguém expurga, então o deploy que remove a
    variável **não muda comportamento** (nenhuma empresa tem linha no dia do deploy);
  - o schema de ambiente do worker não é `.strict()` (`environment.schema.ts:42`, `z.object` sem
    `.strict`): a variável que sobrar no Railway é ignorada, sem derrubar o boot.
    O campo `enabled` das dependências da rotina (`routine.ts:38-44`) sai junto; o caminho "ninguém
    ligou" passa a ser "nenhuma empresa elegível", com o mesmo log `trip_location_purge_disabled` quando a
    consulta de elegíveis volta vazia (para "o expurgo parou" continuar sendo resposta, não investigação).
    `.env.example:128-130`, `docs/SECURITY.md`, `docs/ai-context/worker-transportada.md:256` e o
    `apps/worker-transportada/CLAUDE.md` § "O expurgo de posição" são atualizados na mesma task.
  - **Gate A (antes da T4.6 / do deploy):** conferir que `TRIP_LOCATION_PURGE_ENABLED` **não** está `true`
    no worker de nenhum ambiente. O deploy que remove a variável para o expurgo daquele ambiente em
    silêncio — quem ligou pela variável passa a depender da tela, sem aviso.

- **D4 — Permissão e auditoria: `settings.manage`, nenhuma permissão nova.** Ler e gravar exigem
  `{ permission: 'settings.manage', scope: 'company' }`, como a diária
  (`companies/presentation/driver-allowance-settings.routes.ts:21`) e o comprovante
  (`trips/presentation/delivery-proof-settings.routes.ts:36`); só `company-admin` a tem
  (`identity/domain/authorization.policy.ts:126,138`). Respostas com `cache-control: no-store`, como o
  molde. Toda escrita (`PUT` e `DELETE`) grava **uma** linha em `audit_logs` **na mesma transação** da
  escrita — mais forte que o molde da diária, cujo `appendAudit`
  (`drizzle-driver-allowance-settings.repository.ts:74-88`) roda fora da transação do upsert; aqui a
  escrita apaga dado pessoal, e configuração sem rastro não pode existir nem por falha parcial (molde
  transacional: `trips/infrastructure/trip-field-office-audit.persistence.ts:17-41`). Campos:
  `actorUserId` (ator; o FK composto exige membership, `fiscal-operation.schema.ts:70-76`), `companyId`,
  `entityType`/`targetType = 'company_location_retention_settings'`, `entityId`/`targetId = companyId`
  (alvo), `action` no vocabulário do molde (`company-location-retention.saved` /
  `company-location-retention.cleared`, como `company-driver-allowance.saved`/`.cleared` em
  `driver-allowance-settings.use-case.ts:13-14`), `permission = 'settings.manage'`, `correlationId`,
  `beforeSnapshot`/`afterSnapshot` com
  `{ purgeEnabled, retentionDays, purgeEffectiveAt }`, `metadata.ipAddress` e `metadata.affectedEstimate`
  (D5: **recontagem do servidor** com o `now` da escrita, não o número que a tela mostrou — o corpo do `PUT`
  é `.strict()` e não traz contagem do cliente; só quando a escrita **abre carência**, isto é, ligar ou
  encurtar com o expurgo ligado; `null` ao alongar, repetir e desligar, que não ampliam o que cai). `created_at` é o timestamp. **Nenhuma coordenada, nenhum id de
  evento, nenhum nome** — a tabela `audit_logs` (`database/fiscal-operation.schema.ts:36-66`) não tem
  coluna de IP; o IP vai em `metadata`, como no molde.

- **D5 — Ligar (ou encurtar o prazo) é irreversível, então pede confirmação com número e tem carência
  de 24 h.**
  - **Antes de confirmar**, a tela chama `GET /company-settings/location-retention/impact?retentionDays=N`
    e mostra quantos eventos perderão o ponto **no primeiro ciclo**, por tabela agrupada em linguagem de
    tela (chegada/entrega, foto do canhoto, mudança de status, ocorrência). A contagem é exata até um
    teto de 100 000 por tabela (`count` sobre `SELECT ... LIMIT 100001`, usando o índice do D1); acima
    disso a tela diz "mais de 100 mil". É "aproximada" porque o ciclo roda depois e o número cresce com o
    tempo.
  - **Confirmação explícita:** diálogo com o número, o texto de LGPD (abaixo) e um botão destrutivo com
    verbo ("Ligar e apagar N pontos"), nunca "OK". Desligar, ou **alongar** o prazo, não pede confirmação
    — não apaga nada.
  - **Carência de 24 h:** toda escrita que **amplia** o que será apagado (ligar; encurtar o prazo com o
    expurgo ligado) grava `purge_effective_at = now() + 24 h`; o worker ignora a empresa até lá (D2).
    **Regra gravada** (`resolvePurgeEffectiveAt`): desligar grava `now` (desligado não lê o campo);
    ligar, e encurtar com o expurgo ligado, gravam `now + 24 h` (encurtar reabre a carência mesmo com
    uma em curso); alongar e repetir o valor, com o expurgo já ligado, **mantêm** o
    `purge_effective_at` anterior — não abrem carência nova e também não encurtam a que ainda corre.
    Por que não gravar `now` ao alongar (a redação original deste item): ligar e alongar logo em seguida
    anularia as 24 h do ligar, e a carência é justamente o que protege de um clique errado. Manter o
    anterior é idêntico a `now` quando a carência já passou (o worker compara `<= now`). Decisão
    exposta ao usuário e aceita por omissão em chat (2026-10-03); reverter é uma linha em
    `location-retention.policy.ts` (devolver `now` no último ramo) e a tabela do contrato. Desfazer dentro da carência é desligar — nada foi apagado. A tela mostra "começa a
    valer em DD/MM HH:mm". Motivo: o ciclo é diário (`job-catalog.constant.ts:120-125`), mas a próxima
    batida pode ser em um minuto, e um clique errado não pode ter efeito antes de alguém perceber.
  - **Texto de LGPD** (pt-BR, com par `en`): _"A posição registrada nos eventos da viagem é dado pessoal
    do motorista (LGPD, art. 5º, I). Guardar por um prazo definido e apagar depois atende aos princípios
    de necessidade e de limitação do tratamento (art. 6º, III). Apagar é definitivo: o evento continua na
    linha do tempo, mas sem o ponto. A pontualidade e a distância já avaliadas não mudam."_ A última frase
    é verdade conferida: a nota do motorista usa a pontualidade **gravada** da foto
    (`fleet/domain/driver-score.policy.ts:41-55`), não a coordenada.

- **D6 — Prazo de 30 a 90 dias, padrão 90.** Recomendação:
  - **teto 90** = o número da ADR-0045 §3.3 e do `docs/SECURITY.md`; acima disso a tela estaria
    autorizando o que a documentação proíbe (ver "Fora do escopo");
  - **piso 30**: abaixo disso o ponto some antes das conferências que o usam — a revisão do canhoto e
    a sugestão de endereço da spec 195, que lê o carimbo da ocorrência e mostra "Ponto expirado" quando
    ele cai (`specs/196-.../spec.md:385-390`); 30 dias cobre o ciclo de fechamento mensal;
  - o CHECK do banco repete o intervalo (defesa em profundidade); o Zod `.strict()` da rota recusa fora
    dele com `400`.

  **O que "expurgo" é em cada tabela** (não muda nesta spec, só passa a ter prazo por empresa):

  | Tabela                      | Coluna de tempo | O que cai                                                 | O que fica                                     |
  | --------------------------- | --------------- | --------------------------------------------------------- | ---------------------------------------------- |
  | `trip_stop_events`          | `created_at`    | `latitude`, `longitude`, `accuracy_meters`, `captured_at` | o evento (chegada/entrega/devolução), a hora   |
  | `trip_delivery_proofs`      | `created_at`    | `latitude`, `longitude`, `accuracy_meters`                | a foto, o veredito e o `captured_at` declarado |
  | `trip_status_events`        | `recorded_at`   | `latitude`, `longitude`, `accuracy_meters`, `captured_at` | a mudança de status e o ator                   |
  | `trip_stop_occurrences`     | `created_at`    | `latitude`, `longitude`, `accuracy_meters`, `captured_at` | a ocorrência da parada                         |
  | `trip_document_occurrences` | `created_at`    | `latitude`, `longitude`, `accuracy_meters`, `captured_at` | a ocorrência da nota                           |

  Em todas, `location_state` vira `expired` (`trip-location-purge.constant.ts:26-35`; redatores em
  `drizzle-trip-location.repository.ts:52-60,122-130,155-162`). O comprovante mantém `captured_at` de
  propósito (`trip-execution.schema.ts:21-25`).

- **D7 — O painel mora na aba nova "Localização" do módulo Viagens.** Regra "Configuração perto do
  efeito" (`apps/frontend-transportada/CLAUDE.md:69-85`; registro `SETTINGS_PANEL_PLACEMENT` em
  `company-settings/shared/companySettingsTabs.service.ts`). O efeito aparece na linha do tempo da viagem
  (o "Localização apagada" da 196 RF10), que é do módulo `trip`. O vizinho direto é o painel do
  Comprovante, que já mora lá: `deliveryProof: { module: 'trip', source: 'deliveryProofSettings', tab:
'proof' }` (`companySettingsTabs.service.ts:115`), montado em `TripWorkspace.page.tsx:140-146,369-410` (rota `/trips`)
  (`TRIP_TABS = ['trips', 'proof']`). A aba nova é `location` ("Localização"), registrada como
  `locationRetention: { module: 'trip', source: 'locationRetentionSettings', tab: 'location' }`.
  Por que não `company-settings`: a regra proíbe tela central, e "Diária do motorista" só ficou lá porque
  o efeito dela é transversal (spec 143 D7); o desta é a linha do tempo da viagem.

- **D8 — O texto fixo "90 dias" da linha do tempo passa a ser o prazo da empresa.** Hoje
  `trip.locale.json:856-857,899` (e o `en`) dizem "apagada após 90 dias". Com prazo configurável a frase
  vira mentira em toda empresa que escolher outro número. A linha do tempo passa a dizer "apagada pelo
  prazo de retenção" sem número — o evento não sabe com qual prazo foi apagado, e gravar o prazo no
  evento seria coluna nova sem necessidade. O `scoreHint` do motorista ("cada perda some depois de 90
  dias", `frontend-driver/.../driverTrip.locale.json:161`) **não** muda: é a janela da nota
  (`DRIVER_SCORE_WINDOW_DAYS = 90`, `driver-score.policy.ts:16`), outro prazo.

- **D9 — A coordenada do transcript do WhatsApp vai para spec própria (recomendação).** O pacote
  `@adatechnology/meta-whatsapp-module` persiste a mensagem crua em `meta_whatsapp.messages.payload`
  (achado da 196 T3.7). Motivos para não entrar aqui:
  - o schema `meta_whatsapp` é do **pacote** (migrations próprias, `drizzle-meta-whatsapp/`), não da API;
    o worker não tem cópia dele, e apagar campo de JSON de mensagem é outra operação (redigir um caminho
    do `payload` e o `content`, não quatro colunas);
  - o conserto certo provavelmente mora no pacote (`adatechnology-packages`), com versão e publicação
    próprias — misturar faria esta spec depender de publicação de pacote;
  - a mensagem tem outros dados pessoais além do ponto (telefone, texto), e a retenção dela merece a
    decisão inteira, não só a da coordenada.
    Esta spec **registra a pendência** no `docs/SECURITY.md` (T4.3) e o painel diz, em uma linha, que
    "mensagens do WhatsApp seguem regra própria". Quando a spec do WhatsApp existir, ela pode ler o mesmo
    `retention_days` desta tabela.

## Histórias priorizadas

### P1 — A empresa liga o expurgo pela tela

**Given** um `company-admin` na aba Localização de Viagens, expurgo desligado, **when** ele liga com 90
dias, **then** vê quantos pontos cairão, confirma, e a tela diz "ligado, começa a valer em DD/MM HH:mm";
a escrita fica em `audit_logs`.

### P1 — O worker respeita cada empresa

**Given** duas empresas na mesma instalação, A ligada com 30 dias e B desligada, **when** o ciclo roda
depois da carência, **then** só os pontos de A com mais de 30 dias caem; nada de B é lido para escrita.

### P2 — Desfazer antes de valer

**Given** o expurgo ligado há 2 horas, **when** o admin desliga, **then** nada foi apagado e o próximo
ciclo não toca a empresa.

### P2 — Quem não gere configuração não mexe

**Given** um `operator` sem `settings.manage` (só `company-admin` a tem), **when** abre Viagens, **then**
a aba Localização segue a regra do vizinho Comprovante (`canManage` em `TripWorkspace.page.tsx:159,376`),
e o `PUT` direto devolve `403`.

## Requisitos funcionais

- **RF1** `GET /company-settings/location-retention` → `{ data: { purgeEnabled, retentionDays,
purgeEffectiveAt, origin, updatedAt } }`; sem linha → `200` (nunca `404`) com `{ purgeEnabled: false,
retentionDays: 90, purgeEffectiveAt: null, origin: 'default', updatedAt: null }`, como o `rateOrigin`
  da diária (`driver-allowance-settings.routes.ts:97-112`). `settings.manage`. `companyId` do contexto
  autenticado. Constante de caminho em `src/shared/api.constant.ts`, ao lado de
  `API_COMPANY_SETTINGS_DRIVER_ALLOWANCE_PATH` (`:56`).
- **RF2** `PUT /company-settings/location-retention` com `{ purgeEnabled, retentionDays }`
  (Zod `.strict()`, `retentionDays` inteiro 30–90). Calcula `purge_effective_at` pelo D5, grava e
  audita na mesma transação.
- **RF3** `DELETE /company-settings/location-retention` apaga a linha (volta ao padrão = desligado),
  audita `.cleared` e devolve `204`; sem linha, não faz nada nem audita (molde
  `driver-allowance-settings.use-case.ts:60-79`). Desligar não tem carência.
- **RF4** `GET /company-settings/location-retention/impact?retentionDays=N` → contagem por tabela, com
  teto de 100 000 e `capped: boolean` por tabela; mesma validação de `N`; só conta linhas da empresa do
  contexto; nunca devolve id, data ou coordenada.
- **RF5** O worker expurga por empresa pela junção do D2: só empresa com `purge_enabled`,
  `purge_effective_at <= now` e linha com tempo anterior a `now - retention_days`.
- **RF6** Sem empresa elegível, o ciclo registra `trip_location_purge_disabled` e fecha `succeeded`; os
  pings de 36 h rodam antes, como hoje.
- **RF7** O log do ciclo passa a contar `redactedByTable` e `companies` (quantas empresas elegíveis),
  nunca id de evento, coordenada ou pessoa. `companyId` é id opaco e pode aparecer.
- **RF8** O painel mostra: estado (ligado/desligado/aguardando carência), prazo, "começa a valer em",
  uma linha sobre o rastro ao vivo (36 h, sempre) e uma sobre o WhatsApp (regra própria), o texto de
  LGPD, e as ações Ligar/Desligar/Salvar prazo/Voltar ao padrão.
- **RF9** A confirmação do D5 aparece ao ligar e ao encurtar o prazo com o expurgo ligado; nunca ao
  desligar ou alongar.
- **RF10** A linha do tempo diz "apagada pelo prazo de retenção" sem número (D8), pt-BR e `en`.

## Requisitos não funcionais

- Migration **aditiva**, com `rollback.sql`, `make migration-test` e `db:generate` = `no_changes`
  depois. Os cinco índices são `CREATE INDEX` em transação (o runner não usa `CONCURRENTLY`): aplicar
  fora do horário de campo, como as migrations da 196 (`specs/196-.../evidence.md`, nota da
  `20261003010806`).
- Coordenada nunca em log, em resposta desta spec, em `audit_logs` nem no corpo de erro.
- Rate limit da rota de impacto igual ao das rotas de configuração (consulta com `count` é cara).
- Painel: tema escuro, cobre `#d58a47`, cantos retos, rótulos em mono maiúsculo com
  `letter-spacing: 0.08em`, primitivos caseiros (`.ui-card`, `.ui-badge`, `.ui-button`) — **não**
  shadcn/Tailwind (`apps/frontend-transportada/CLAUDE.md`; o `CLAUDE.md` da raiz está desatualizado
  nisso). Toque ≥ 44 px, textos em `*.locale.json` pt-BR e `en`, sem rolagem horizontal em 375 px.
- Estados: carregando (esqueleto do vizinho), erro de leitura, erro de gravação, sem permissão, padrão
  (sem linha), ligado, aguardando carência, salvando.

## Casos extremos e falhas

| Caso                                                            | Comportamento                                                                                                                                           |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empresa sem linha                                               | Desligada; o worker não a lê (junção interna).                                                                                                          |
| `retentionDays` 29, 91, `"90"`, `90.5`                          | `400` com todos os erros de validação; o CHECK do banco recusa se o Zod falhar.                                                                         |
| Ligar e desligar dentro de 24 h                                 | Nada apagado; duas linhas em `audit_logs`.                                                                                                              |
| Encurtar de 90 para 30 com o expurgo ligado                     | Confirmação com a contagem para 30; carência de 24 h; até lá o worker **pula a empresa** (não usa 90).                                                  |
| Alongar de 30 para 90                                           | Sem confirmação nem carência nova: mantém a data de início anterior (a carência em curso, se houver, continua; senão já valia); o próximo ciclo usa 90. |
| Contagem acima de 100 000 numa tabela                           | `capped: true`; a tela diz "mais de 100 mil".                                                                                                           |
| Ciclo em andamento quando o admin desliga                       | O lote em voo termina (no máximo 500 linhas por tabela); o próximo lote relê a junção e para.                                                           |
| Coluna ausente (API sem a migration, `42703`)                   | Como hoje: a tabela falha sozinha, `failedTables`, as outras seguem (`routine.ts:222-258`).                                                             |
| Tabela de configuração ausente no worker (deploy fora de ordem) | A contagem de elegíveis lança (`42P01`) fora do `try/catch` por tabela → o **ciclo falha inteiro**, nenhum redator roda, nada apagado. Seguro.          |
| `PUT` de outra empresa forjando `companyId` no corpo            | `400` (`.strict()`); a empresa é sempre a do token.                                                                                                     |
| Usuário sem `settings.manage`                                   | `403` nas quatro rotas; a aba segue a regra do vizinho (D7).                                                                                            |

## Critérios de aceite

- **CA1** Sem linha, `GET` devolve `200` com o padrão desligado/90 e `origin: 'default'`.
- **CA2** `PUT` grava, audita (ator, empresa, IP em `metadata`, antes/depois, sem coordenada) e calcula
  `purge_effective_at` pelas quatro transições do D5; provado contra Postgres.
- **CA3** `DELETE` volta ao padrão, devolve `204` e audita `.cleared`; sem linha, não audita.
- **CA4** Fora de 30–90 → `400`; sem `settings.manage` → `403`; corpo com chave a mais → `400`.
- **CA5** `impact` conta só a empresa do contexto, respeita o teto e não devolve id/data/coordenada.
- **CA6** Integração, **nas cinco tabelas**, com relógio injetado e cinco empresas: **A** ligada, 30 dias,
  `effective_at = NOW-1h` (eventos de 31 d / 29 d / exatamente 30 d / sem ponto → só o de 31 d cai; limite
  estrito); **B** desligada com `effective_at = NOW-10d`, 30 dias (evento de 100 d intacto); **C** ligada,
  30 dias, `effective_at = NOW+1h` (100 d intacto); **D** sem linha (100 d intacto); **E** ligada, 90 dias,
  efetiva (60 d / 91 d → só o de 91 d cai). `effective_at = NOW` é elegível; `expired` só nas linhas que
  caíram; segunda execução devolve 0. Cinco mutações reprovam: tirar `s.company_id = x.company_id`
  (B, C, D), tirar `purge_enabled` (B), tirar `purge_effective_at <= now` (C), trocar `s.retention_days`
  por constante (A/E), trocar `<` por `<=` (exatamente 30 d).
- **CA7** Contrato de paridade reprova cópia do worker sem `company_id` ou sem a tabela nova.
- **CA8** Sem empresa elegível, a rotina não chama nenhum redator das cinco tabelas e registra
  `trip_location_purge_disabled`; os pings rodam (mutação no desvio reprova).
- **CA9** `TRIP_LOCATION_PURGE_ENABLED` não existe mais no schema, no `.env.example`, no tipo
  `WorkerEnvironment` nem na rotina; o contrato de ambiente (`test/environment.contract.test.ts`) é
  ajustado sem afrouxar o `toEqual`.
- **CA10** O painel aparece na aba Localização de Viagens, registrado em `SETTINGS_PANEL_PLACEMENT`
  (contrato `test/company-settings/tabs.contract.ts`), com os estados do RNF e a confirmação do RF9.
- **CA11** A linha do tempo não cita "90 dias" no estado `expired` (D8).
- **CA12** Prints em 1280 e 375 px dos estados desligado, confirmação e aguardando carência, comparados
  com o painel do Comprovante, aprovados pelo usuário (web.md §15).
- **CA13** `make migration-test` passa com a migration e o `rollback.sql`.

## Riscos

- **Clique errado apaga dado pessoal de forma definitiva.** Mitigado por confirmação com número (D5),
  carência de 24 h e auditoria. Resíduo: quem confirma e não desfaz em 24 h perde o dado — é o efeito
  pretendido.
- **Varredura com junção pode ficar lenta** em tabela grande. Mitigado pelo índice parcial
  `(company_id, tempo) WHERE latitude IS NOT NULL` nas cinco (D1) e pelo lote de 500 com teto por tabela
  que já existe. Medido na T2.2: o planejador não escolhe o composto enquanto o índice só por tempo
  existir; as sondas crescem com o número de empresas elegíveis e cada uma com o dado das não elegíveis;
  e a fila drena empresa por empresa, sem justiça entre elas (D2). Follow-up com migration (`DROP INDEX`
  dos cinco `<tabela>_located_<tempo>_idx` com `SET LOCAL lock_timeout`, `idx_scan` conferido em
  produção, rollback que recria os índices, e a justiça entre empresas junto) — não é desta spec.
- **Encurtar o prazo com o expurgo ligado suspende a empresa por 24 h** (a carência reabre e o prazo
  antigo também para de valer): é o efeito pretendido, mas quem encurta não vê o expurgo rodar no dia.
- **Deploy fora de ordem.** O worker novo contra o banco sem a tabela falha seguro (nada apagado). A API
  nova com o worker velho deixa a tela gravando uma configuração que ninguém lê — e o worker velho segue
  desligado pela variável. Ordem: migration + API → worker → painel; o painel só é publicado com o
  worker novo no ar (T4.4).
  **Gate B:** o job do painel **não espera** o worker (`deploy.yml:266-289`); num push único o painel sobe
  em paralelo ao worker, e se `deploy-services` falhar com o painel no ar, depois de 24 h a tela diz
  "ligado" com um worker velho que ignora a tabela. Saída: pushes separados (worker antes do painel) ou
  confirmar o worker no ar antes de alguém ligar.
- **Retenção suspensa continua até alguém ligar.** É o padrão pedido pelo usuário; o `docs/SECURITY.md`
  troca o achado "ligar a variável" por "ligar na tela", com a mesma ressalva.
- **Spec 195** lê o carimbo da ocorrência para a sugestão de endereço: com 30 dias, sugestão pendente
  perde o ponto antes. É o "Ponto expirado" que a 195 já trata.
