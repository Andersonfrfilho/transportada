# Plano — Feature 013

Decisões de modelagem estão em `docs/adr/0016-fleet-drivers-and-mdfe-manifest.md`. Este plano
cobre o que muda em cada camada e a ordem de entrega.

## Camada de dados

`src/database/fleet.schema.ts`

| tabela                             | papel                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `fleet_vehicles`                   | placa, RENAVAM, tara, capacidade kg/m³, `tpRod`, `tpCar`, UF, `role` (`traction`/`trailer`), status, dados do proprietário quando terceiro |
| `fleet_drivers`                    | nome, CPF, CNH, telefone, status, `membership_id` anulável                                                                                 |
| `fleet_driver_vehicle_assignments` | vínculo motorista↔veículo com período (`assigned_at`, `released_at`)                                                                      |

`src/database/mdfe.schema.ts`

| tabela                                                                     | papel                                                                                                                         |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `mdfe_manifests`                                                           | agregado da viagem: status, série/número fiscal, UF ini/fim, veículo, produto predominante, totais congelados, RNTRC snapshot |
| `mdfe_manifest_drivers`                                                    | condutores do manifesto (1..10), com snapshot de nome e CPF                                                                   |
| `mdfe_manifest_items`                                                      | vínculo N:1 com `cte_fiscal_documents` + município de descarga congelado                                                      |
| `mdfe_manifest_loading_cities`                                             | municípios de carregamento (1..50)                                                                                            |
| `mdfe_fiscal_documents`                                                    | chave, protocolo, XML autorizado, estado de encerramento e cancelamento                                                       |
| `mdfe_issuance_attempts` / `mdfe_issuance_events` / `mdfe_issuance_outbox` | mesmo desenho do CT-e                                                                                                         |

Migration única com rollback ao lado, como manda o repo. Nenhuma coluna monetária em float.

## Identidade

`COMPANY_ROLES` ganha `driver`; `TRANSPORTADA_PERMISSIONS` ganha `fleet.read`, `fleet.manage`,
`mdfe.read`, `mdfe.manage`, `mdfe.issue`, `mdfe.close`, `mdfe.cancel`, `trip.read`, `trip.report`.
O check constraint de `membership_roles` acompanha, e o realm Keycloak também.

⚠️ A allowlist do frontend (`COMPANY_PERMISSIONS`) precisa entrar no mesmo commit — divergir dela
é a família de bug já registrada no projeto (guard estrito rejeita um 200 válido).

## API — módulos novos

`src/fleet/` e `src/mdfe-manifests/`, nas quatro camadas do padrão.

Rotas:

```
GET    /fleet/vehicles              fleet.read
POST   /fleet/vehicles              fleet.manage
PATCH  /fleet/vehicles/:id          fleet.manage
GET    /fleet/drivers               fleet.read
POST   /fleet/drivers               fleet.manage
PATCH  /fleet/drivers/:id           fleet.manage
POST   /mdfe-manifests/preview      mdfe.manage
POST   /mdfe-manifests              mdfe.manage
GET    /mdfe-manifests              mdfe.read
GET    /mdfe-manifests/:id          mdfe.read
POST   /mdfe-manifests/:id/issue    mdfe.issue
POST   /mdfe-manifests/:id/close    mdfe.close
POST   /mdfe-manifests/:id/cancel   mdfe.cancel
```

`issue`, `close` e `cancel` aceitam `Idempotency-Key`, gravam attempt + evento de outbox e
devolvem 202 — a SEFAZ nunca é chamada dentro do request, igual ao CT-e.

## Domínio

- `mdfe-manifest-eligibility.policy.ts` — CT-e precisa estar `authorized`; não pode estar em outro
  manifesto vivo; todos os CT-es da mesma empresa.
- `mdfe-manifest-state.policy.ts` — transições permitidas e as duas regras da SEFAZ (encerrado não
  cancela; cancelamento fora da janela é recusado antes da chamada).
- `mdfe-payload.builder.ts` — puro: manifesto + perfil fiscal + veículo + condutores → `MdfeData`.
  Derivação de `UFIni`/`UFFim`, agrupamento por município de descarga, totais.

## Worker

Trilho `mdfe-issuance.v1` (main/retry/dead) com envelope Zod versionado, espelhando
`cte-issuance.v1`. Consumer resolve o input pela linha (só identificadores no envelope), chama o
gateway MDF-e, guarda XML e faz write-back. Cópia do schema Drizzle no worker, como já é a regra.

## Pacote fiscal

`@adatechnology/fiscal-provider` precisa dos eventos que não existem:

- **110112 encerramento** — `nProt`, `dtEnc`, `cUF`, `cMun` de encerramento;
- **110111 cancelamento** — `nProt` + justificativa ≥ 15.

Ambos via `MDFeRecepcaoEvento`, assinados no `infEvento`, com `procEventoMDFe` devolvido em
`xmlEvento` — mesma decisão do ADR-0015 para o CT-e. Teste de contrato antes.

## Frontend

Módulo `fleet` (veículos e motoristas) e módulo `mdfe-manifest` (lista, criação a partir de CT-es
autorizados, encerrar, cancelar). Client HTTP por módulo com `fetch` injetado, validação por type
guard, i18n PT/EN, CSS module com tokens. A tabela de manifestos segue
`docs/frontend/data-tables.md`.

## Ordem de entrega

1. Pacote fiscal: eventos 110112 e 110111.
2. Identidade: papel `driver` e permissões (API + frontend + realm).
3. Schema de frota + migration + cadastro (API e frontend).
4. Schema de MDF-e + migration.
5. Domínio: elegibilidade, estado, payload builder.
6. API: prévia, criação, listagem.
7. Worker: trilho, gateway, write-back.
8. API: issue / close / cancel.
9. Frontend: manifestos.

O passo 1 é independente e destrava o 7 e o 8; os passos 2 e 3 destravam o 4.
