# Plano técnico — Spec 200

## Contexto e premissas

- Depende da 192 em staging, especificamente de três peças:
  - `trip_loaded_cargo_layouts` com a cópia, o mapa e a matriz;
  - `cargoBlockedBy`;
  - `hasLoadedCargoPlan`.
- A cópia por valor segue a ADR-0075 §7.
- A T0 confere o formato de `TripPlacedBox`/`TripCargoPlacement` no painel (`trip.types.ts:429-615`)
  e o estado do `DriverStopCard` (798 linhas, disputado por 179/193/195/196).

## Arquitetura e arquivos afetados

**API**

- `trips/presentation/me-trip.routes.ts`: `GET /stops/:stopId/cargo-plan`.
- `trips/application/read-driver-cargo-plan.use-case.ts`: lê a cópia pela leitura da 192 (filtro e
  remapeamento), sem uma segunda implementação.

**App do motorista**

- Arquivos copiados com cabeçalho:
  - `src/components/ui/cargo-isometric.tsx` e o `.module.css`;
  - `src/modules/driver-trip/shared/stopColor.service.ts`;
  - `stopFocus.service.ts`;
  - `cargoComplement.service.ts`.
- `pages/DriverCargoPlan.page.tsx`.
- `components/DriverCargoPlanList.component.tsx` (a lista em texto).
- `hooks/useDriverCargoPlan.hook.ts`.
- `shared/driverCargoPlan.validation.ts`.
- `shared/cargoPlanCache.service.ts`.
- `modules/shared/driverRoute.service.ts` (`/carga/:stopId`).
- O botão no `DriverStopCard`.
- Os locales.

## Contratos/API/eventos

```
GET /me/trips/current/stops/:stopId/cargo-plan        trip.read
  200 { data: { layoutId, bed: {lengthM,widthM,heightM}, loadingAccess, boxes: TripPlacedBox[],
                stops: [{ stopId, sequence, label }], focusStopId,
                blockedBy: { fromOrderChange: uuid[], fromLoading: uuid[] } } }
  404 TRIP_NOT_FOUND · 404 CARGO_PLAN_NOT_AVAILABLE
```

A rota é `GET`, então fica fora do inventário de carimbo da 196, que só varre `POST`.

## Dados, migration e rollback

- Sem migration no servidor.
- No cliente, IndexedDB v3→v4 só se o cache precisar de store novo. A migração é aditiva e tem
  contrato.

## Segurança e tenant

- Posse pela parada.
- A planta traz número de nota e rótulo, sem PII do motorista.
- O cache fica sob o `subHash` do dono e é descartado no "Sair".
- `img-src` e `connect-src` não mudam: a rota é da própria API.

## Idempotência e concorrência

- Só leitura.
- A cópia é imutável depois do despacho. O cache é invalidado quando muda `stopOrderVersion` ou
  `layoutId`.

## Observabilidade

Sem log novo.

## Estratégia de testes

- **Contrato e integração da rota:** CA01.
- **Contratos da app, sem DOM:**
  - validação (CA02);
  - serviço das camadas (CA03);
  - cache (CA04);
  - migração (CA05);
  - cabeçalho de cópia.
- **Build e smoke:** CA06.
- **Prints:** CA07.

## Riscos

- **Bundle.** O isométrico soma ao precache. Se estourar 1,5 MiB, a página vira import dinâmico, fora
  do precache e só com rede, e o requisito offline passa a ser a lista em texto.
- **Aparelho fraco com Atego.** Mitigação: a T2.3 mede o tempo do desenho e, se precisar, agrupa as
  caixas por parada e camada.
- **Divergência de cópia com o painel.** O cabeçalho e o mapa de cópia tornam a origem visível; a
  correção no painel não chega sozinha.
