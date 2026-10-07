# Evidência — 252

## Pesquisa e desenho (2026-10-07)

Antes de qualquer task. Desenho do `architect` (`opus`); spec, plano, tarefas e ADR-0100 redigidos a partir dele, só
documentação (nenhum código, nenhuma migration). Branch `work/spec-feriados-import` a partir de `origin/staging`
(`927335484`).

### Numeração conferida

- `git ls-tree --name-only origin/staging specs/` → a última é `251-emissor-nacional-gratuito`.
- `git ls-tree --name-only origin/staging docs/adr/` → o último é `0098-a-nfse-fala-a-nota-rp-v3.md`.
- `specs/251-emissor-nacional-gratuito/tasks.md:87` reserva o **ADR 0099** para a 251.
- Nenhum worktree (`git worktree list`, 70+ árvores) tem `specs/252*` nem `docs/adr/0099*`/`010*`.
- Usados: **spec 252** e **ADR 0100** (iguais à reserva do `architect`).

### Specs do mesmo assunto lidas (regra do `CLAUDE.md` da raiz)

- **238** (`spec.md`, `plan.md`, `tasks.md`, início da `evidence.md`): calendário de dias úteis; "fora do escopo" exclui
  importar de fonte pública — **emendado pelo ADR-0100**. T2.4 (revisão de design da tela) segue aberta.
- **236** (`spec.md`): o prazo lê o calendário pela cidade do destino físico, recalculado a cada leitura; D7 desta spec
  existe para não mudar o selo de nota já entregue.
- **060** (trechos de feriado): D2b, "o feriado é do município, não do cliente"; exceção do cliente vence o feriado.
- **073**: destino físico (`resolvePhysicalDestination`), sem trecho próprio de feriado.
- **ADR-0048 §3**: "nenhuma fonte pública de feriado municipal é confiável" — **emendado pelo ADR-0100**.
- **ADR-0096** inteiro: forma B1, leitura da política (`source_rule_id IS NULL` → `once`), convivência §6, leituras em
  série.

### Fatos do código conferidos em `origin/staging` (amostra; a T0.2 confere o resto)

- `readPoolWindows` (`drizzle-route-optimization.repository.ts`): o select de `municipal_holidays` traz só
  `holidayOn` (~1053) e a mesma lista vai a todo cliente (`holidays.map(...)` ~1076); o mapa resolvido é por `taxId`
  (~1088).
- `route-optimization-municipal-holiday.integration.test.ts` ~199–206: "comportamento atual (defeito conhecido, spec
  238 fora de escopo)", espera `[CITY_A, CITY_B]`.
- `environment.schema.ts` do worker ~82–92: `GOOGLE_MAPS_API_KEY` opcional, vazio = ausente.
- `20261007133324_cargo_preview_retention/migration.sql`: molde de CHECK de `job` + linha em `job_schedules`
  (`86400`). Última migration em staging: `20261007140303_business_calendar`.
- Catálogo de jobs em quatro cópias (`job-catalog.constant.ts` na API, worker e cron; `jobCatalog.constant.ts` no
  painel).
- `routeSchedule.service.ts` ~55–75: o aviso de hoje olha só feriado nacional (`findBrazilianHoliday`) e só a última
  parada.
- `route-suggestion.routes.ts` ~33–34: `trip.manage` e `fleet.read`.
- `docs/SECURITY.md` ~1771–1782: destinos de saída do CEP e do Google, termos do Google aceitos como risco (spec 186).

### BrasilAPI (conferida e descartada)

Conferida pela sessão orquestradora em 2026-10-07 (não refeita nesta redação). As **14 datas de 2026** da BrasilAPI
batem com o calendário nacional do código (`listNationalHolidays`, ADR-0096 §2: 9 fixas + 4 por Páscoa = 13), e a
única a mais é a **Páscoa (05/04/2026)**, que é domingo e não muda dia útil. Só cobre nacionais: não resolve o problema
(municipal).

### FeriadosAPI (o que a documentação pública afirma)

Lida pela sessão orquestradora em 2026-10-07 (`https://feriadosapi.com`); transcrita aqui.

- Afirma cobrir **5.571 municípios** e **13.500+ feriados por ano**.
- Endpoints, autenticação `Bearer`, formato da resposta e paginação: ADR-0100 § Contexto.
- **Gratuito:** nacionais, estaduais e as 27 capitais, **60 req/min**. Cidades do interior **consomem cota** / plano
  pago; a documentação **não diz quanto**.
- **Developer:** R$ 39/mês, 5.000 consultas/mês, 60 req/min.
- **Aniversário de cidade:** **não mencionado** na documentação.
- **Termos de armazenamento:** **não encontrados** — a página de termos respondeu **404** e a documentação não diz se
  os dados podem ser guardados (Q4).

### Amostra local de NF-e (destinos)

67 cidades de destino distintas, todas em SP, nenhuma capital. Estimativa: carga inicial ≈ 138 requisições (134
cidade×ano + 2 paridade nacional + 2 estaduais de SP), ≈ 3 min, 2 ciclos de 100; manutenção ≈ 25/mês. As 645 cidades
de SP × 2 anos = 1.290 consultas cabem no 1º mês do plano Developer.

### Abertos para o usuário

- **Q3** plano e cota — `[NEEDS CLARIFICATION]`.
- **Q4** termos de uso — `[NEEDS CLARIFICATION]`; risco no ADR-0100 e em `docs/SECURITY.md`.

Nenhum dos dois bloqueia código; os dois bloqueiam configurar `FERIADOS_API_TOKEN` (passo do usuário).

## Acréscimo do usuário — o aviso no app do motorista (2026-10-07)

Pedido no chat, depois do desenho: _"e o aviso no app do motorista também"_. Incorporado como Q5b, D12, RF10b, RF13,
RF14, CA15–CA17 e as tasks T4.3, T5.1b e T5.4; ADR-0100 §2 (D12) e §6. Só documentação.

Fatos conferidos em `origin/staging` (`927335484`) para o desenho:

- **A guarda do app escolhe campo a campo.** `apps/frontend-driver/src/modules/driver-trip/shared/driverTripResponse.validation.ts`
  (`toStop` ~215–235) monta a parada só com os campos que conhece; campo desconhecido na resposta é **ignorado**, e só
  campo essencial ausente (`documents`, `sequence`) vira `DriverTripResponseError`. O app de hoje já tolera
  `holidayWarnings`; a T5.1b o faz **ler** o campo como acessório (molde do motivo da recusa do canhoto, spec 220 RF29)
  e o leva ao `DriverTripSnapshot`.
- **Offline:** o que passa pela guarda é o snapshot guardado no aparelho (`tripSnapshot.service.ts`: 24 h, dono
  `SHA-256(sub)`, ADR-0075 §8). O aviso precisa estar no tipo validado para sobreviver sem rede.
- **A regra de ordem da API é de requisição.** `apps/api-transportada/CLAUDE.md` ~555: "Os esquemas `.strict()` exigem
  **API antes do app**: campo novo no app antes de a API aceitar dá `400`". `holidayWarnings` é campo de **resposta**:
  a ordem é a inversa (clientes tolerantes → API).
- **Contagem de consultas da leitura do motorista:** `test/integration/driver-snapshot-products.integration.ts` conta
  só as consultas a `nfe_products` (uma por viagem, 247 T4.6) e prova que a falha dos produtos não derruba o snapshot.
  **Não há contrato da contagem total** de `GET /me/trips/current`; a T4.3 mede a linha de base e a fixa antes do
  código.
- **Isolamento da nota:** `test/trip-domain/delivery-deadline-isolation.contract.ts` impede que
  `driver-score.policy.ts`, `delivery-proof-*.ts`, `proof-pending.query.ts` e `drizzle-current-driver-trip.repository.ts`
  importem o prazo da 236 (agulha `delivery-deadline`). A T4.3 acrescenta a agulha do calendário/aviso para os
  arquivos da nota e do comprovante (a leitura do motorista pode usar o aviso; a nota não).
- **App separada:** o cabeçalho da guarda diz "cópia por valor" da do painel (ADR-0075 §7); nada é importado. O
  módulo legado `driver-trip` do painel fica fora (spec 189 Fase 10) e já tolera o campo pela mesma guarda.

Escolha por delegação registrada: o aviso traz `cityName` (RF10b) para o texto "em Campinas" sair sem consulta no app.
