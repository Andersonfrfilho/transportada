# Evidência

Executado em 2026-09-03, worktree `../transportada-wt/spec-081`, branch `work/spec-081`.

## Gates da raiz

| Comando                | Resultado                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `bun run format:check` | ✅ `All matched files use Prettier code style!`                                            |
| `bun run lint`         | ✅ seis apps, `--max-warnings=0`                                                           |
| `bun run typecheck`    | ✅ cinco `tsc --noEmit` limpos                                                             |
| `bun run build`        | ✅ inclusive o PWA do frontend                                                             |
| `make migration-test`  | ⚠️ **não executado** — Docker parado nesta máquina (`Cannot connect to the Docker daemon`) |

## Testes

| App                     | Antes | Depois                               |
| ----------------------- | ----- | ------------------------------------ |
| `api-transportada`      | 4077  | **4078** pass, 0 fail (156 arquivos) |
| `worker-transportada`   | 882   | 882 pass, 0 fail                     |
| `cron-transportada`     | 94    | 94 pass, 0 fail                      |
| `frontend-transportada` | 2437  | **2439** pass, 0 fail                |
| `frontend-client`       | 18    | 18 pass                              |
| `frontend-landing`      | 107   | 107 pass                             |

## Por task

- **T001** — `route_suggestion_vehicles.driver_id`, FK composta, unique por sugestão e índice.
  `test/database-migration.contract.test.ts` verde depois de a migration entrar na lista explícita
  de `static-migration.contract.ts`. ⚠️ O `make migration-test` (aplicar + reverter em Postgres
  descartável) **não rodou** — Docker parado. É o único critério de aceite em aberto.
- **T002/T003** — `GET /fleet/driver-vehicles`. Contrato novo
  `test/fleet-http/driver-vehicle-links.contract.ts` vermelho por `404` antes da rota, verde depois
  (85 testes no arquivo de entrada).
  ⚠️ `test/separator-role.contract.test.ts` reprovou por desenho — rota nova de frota exige decisão
  escrita sobre o separador. Decidido: **ele alcança**, porque é quem escolhe veículo e motorista ao
  montar a viagem, e o par não carrega nada além dos dois ids.
- **T004/T005** — o par na API. `vehicleIds` saiu do corpo; entrou
  `vehicles: [{vehicleId, driverId?}]`. Contratos novos: par com e sem motorista no mesmo pedido,
  par malformado (`driverId` fora de UUID, campo extra, corpo antigo) recusado com `400`, motorista
  indisponível e motorista repetido com `409`, aceite criando viagem com e sem motorista.
- **T006/T007** — pareamento no frontend. `multiVehiclePairing.service.ts` com 12 contratos.
  Dois defeitos achados **pelo contrato**, antes de qualquer tela:
  1. desmarcar no seletor por motorista derrubava o par preenchido pela ponta do veículo;
  2. escolher o motorista cujo caminhão já estava na lista **descartava** o par em vez de
     substituí-lo — a linha ficava sem motorista logo depois de o operador escolher a pessoa.
     O smoke Playwright (`responsive.smoke.spec.ts`) passou a exercitar as duas pontas e a cobrar o par
     no corpo enviado.

## O que ficou de fora

- `make migration-test` — pendente de Docker.
- Smoke Playwright não executado (precisa da stack de pé); o arquivo foi atualizado e typecheck e
  lint passam sobre ele.
