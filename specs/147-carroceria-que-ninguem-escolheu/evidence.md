# Evidência

## Medição local (2026-09-12, antes da spec)

Consultas somente leitura no Postgres local:

```sql
select role, vehicle_type, body_type, count(*),
       count(capacity_m3) filter (where capacity_m3 > 0) as with_capacity,
       count(*) filter (where cargo_length_m > 0) as with_dims
from fleet_vehicles group by 1,2,3 order by 1,2,3;
```

- 14 veículos, todos `role = 'traction'`: **nenhuma carreta**.
- 8 com `body_type = '00'` (3 `truck`, 3 `toco`, 2 `tractor_unit`), nenhum com m³ nem medidas.
- Os 8 têm marca, modelo e ano vazios. Foram criados em 26/08, 01/09 e 06/09, provavelmente como
  cadastro de teste.
- Só os 2 `tractor_unit` têm viagem (1 cada, ambas fechadas).
- `vehicle_volume_references`: 18 linhas, todas `02`/`05`. Sem `00`, `01`, `03`, `04` e sem
  `tractor_unit`.
- `information_schema`: a única coluna de veículo em `trips` é `vehicle_id`. `mdfe_*` e
  `route_suggestion*` também têm um `vehicle_id` só. Não existe coluna nem tabela de
  reboque/carreta/implemento.
- `fleet_vehicles.body_type` tem default `'00'`, e o CHECK aceita `00`–`05` sem amarrar ao tipo.

## T0 — Medição em produção (2026-09-12)

- Autorização: usuário, nesta sessão ("Autorizo a IA a ler").
- Caminho: o Postgres de produção (`Postgres-FDoz`) **não tem TCP proxy público**. Por isso a
  consulta rodou por `railway ssh -e production -s api -- bun -e <script>`, com `Bun.SQL`, uma
  conexão só e `default_transaction_read_only = on`. Só agregados, sem PII e sem segredo impresso.
  O script está no scratchpad da sessão e não foi versionado.

| role     | vehicle_type | body_type | status |   n | com m³ | com as 3 medidas | com referência |
| -------- | ------------ | --------- | ------ | --: | -----: | ---------------: | -------------: |
| traction | utility      | 02        | active |   3 |      3 |                0 |              3 |
| traction | van          | 02        | active |   3 |      3 |                0 |              3 |

- Viagens nos últimos 60 dias: **0** (a consulta voltou vazia).
- Empresas: 1.
- Conclusão: nenhum `00` e nenhuma carreta em produção. O defeito medido existe só no banco local.

## T0b — Respostas do usuário (2026-09-12)

- **Q1:** "todos e também deve pedir no cadastro e implementar no aplicativo". A medição por câmera
  ficou fora e vira spec própria, também por resposta do usuário.
- **Q1b (cavalo):** "se tem cavalo precisa do caminhão; ele não pode carregar apenas com o cavalo;
  pode cadastrar vários cavalos, mas pode carregar um por vez". Virou: cavalo com `00`, despacho
  exige carreta, uma carreta por viagem aberta.
- **Q2:** "adicionar na listagem de pendências para realizar a atualização; pode ser uma página onde
  ficam nossas pendências". Virou: página `/pendencias`.
- **Q3:** os dois (carreta padrão na frota e carreta na viagem).
- **Q4:** sim, com fonte citada. Os valores dependem de aprovação na T-cat.
- **Q5:** commit `c02325b6`.
- `grep -c 'NEEDS CLARIFICATION' spec.md` = 0 depois da edição.

## T1 — Contrato: `resolveVolumeReferenceKey` é o único construtor da chave

- Arquivo novo: `apps/api-transportada/test/trip-infrastructure/occupancy-reference-key.contract.ts`,
  por texto de fonte contra `trip-occupancy.support.ts`.
- Anexado ao entrypoint existente `test/trip-infrastructure.contract.test.ts` (já listado no
  `package.json` da app) — sem entrypoint novo.
- Comando: `bun test test/trip-infrastructure.contract.test.ts` (de dentro de
  `apps/api-transportada`).
- Resultado (vermelho esperado, antes da T2): 14 pass, 4 fail — as 4 falhas são os testes novos
  desta task; os 14 pré-existentes (document-link, route-geometry-\*) seguem verdes.
- `bun run --cwd apps/api-transportada typecheck`: limpo.
- `bunx prettier --check` nos dois arquivos alterados: ok.

## T2 — Ligar a ocupação à função

- `trip-occupancy.support.ts:112-127`: a chave da consulta de `vehicleVolumeReferences` passa a
  vir de `resolveVolumeReferenceKey({ traction: { bodyType: vehicle.bodyType, role: 'traction',
vehicleType: vehicle.vehicleType }, trailer: null })`. Comportamento idêntico (sem carreta, a
  função devolve a chave do próprio veículo — D4).
- `bun run --cwd apps/api-transportada typecheck`: limpo.
- `bun test test/trip-infrastructure.contract.test.ts` (de dentro de `apps/api-transportada`): 18
  pass, 0 fail — T1 (as 4 asserções novas) agora verde.
- `bun test test/cargo-volume.contract.test.ts test/fleet-domain.contract.test.ts
test/trip-infrastructure.contract.test.ts test/trip-application.contract.test.ts`: 475 pass, 0
  fail.
- Suíte completa: `bun run --cwd apps/api-transportada test`: **5047 pass, 23 skip, 0 fail** — rodou
  inteira, sem depender de Postgres.
- `bunx prettier --check` e `bunx eslint --max-warnings=0` no arquivo alterado: ok.

## T3 — `resolveCapacityUnknownReason` (domínio puro)

- Criado `test/trip-domain/capacity-unknown-reason.contract.ts` (tabela com 8 casos) e importado em
  `test/trip-domain.contract.test.ts`, **antes** de o módulo existir.
- Vermelho: `bun run --cwd apps/api-transportada test test/trip-domain.contract.test.ts` →
  `error: Cannot find module '../../src/trips/domain/capacity-unknown-reason.policy.js'`, com
  `2 fail` na suíte inteira (só os dois testes que dependem do módulo novo).
- Implementado `apps/api-transportada/src/trips/domain/capacity-unknown-reason.policy.ts`:
  `resolveCapacityUnknownReason({capacityM3, traction, trailer})`. O "carregador" é o mesmo que
  `resolveVolumeReferenceKey` usa (`trailer ?? traction`); `capacityM3 !== null` já resolvido pelo
  chamador (a ficha vence, mesmo com `body_type: '00'`); carregador com `'00'` e que não é
  `tractor_unit` → `bodyTypeMissing` (cobre também carreta antiga com `'00'`); `tractor_unit` sem
  carreta → `trailerMissing`; senão → `referenceMissing`. `trailer` já existe como parâmetro
  opcional/nulo para a Fase 4.
- Verde: `bun run --cwd apps/api-transportada test test/trip-domain.contract.test.ts` →
  **5055 pass, 23 skip, 0 fail** (8 casos novos de `resolveCapacityUnknownReason`, mais os 5047
  pré-existentes já reportados na T2).
- `bun run --cwd apps/api-transportada typecheck`: limpo.
- `bunx prettier --check` e `bunx eslint` nos três arquivos tocados: ok, sem avisos.
