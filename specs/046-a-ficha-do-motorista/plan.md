# Plano técnico — 046

## Contexto e premissas

Registro posterior: os arquivos abaixo já existem. O plano descreve o que foi feito e por quê, para
que a próxima mudança nestes campos não redescubra as escolhas.

## Arquitetura e arquivos afetados

**api-transportada**

- `src/database/fleet.schema.ts` — nove colunas novas em `fleet_drivers`, quatro CHECKs, um índice
  parcial.
- `src/fleet/presentation/fleet-request.schema.ts` — Zod da fronteira; CEP e UF canonicalizados aqui.
- `src/fleet/infrastructure/fleet.mapper.ts`, `.../drizzle-fleet-driver.repository.ts`,
  `src/fleet/application/fleet.port.ts` — os campos atravessam as quatro camadas sem regra nova.

**frontend-transportada**

- `fleet/shared/driverAddress.service.ts` — os quatro provedores e as duas estratégias de fan-out.
- `fleet/shared/municipality.service.ts` — lista do IBGE, grafia e degradação.
- `fleet/shared/driverMembership.service.ts` — opções de vínculo e degradação.
- `fleet/hooks/useDriverAddressLookup.hook.ts` — debounce, `AbortSignal`, estado da consulta.
- `fleet/components/DriverAddressFields`, `DriverCityField`, `DriverMembershipField`,
  `DriverQuickCreateDialog` — camada declarativa.

## Contratos/API/eventos

`POST`/`PUT /fleet/drivers` ganham os campos novos, todos opcionais. Nenhum evento, nenhuma fila:
cadastro não produz mensagem.

## Dados, migration e rollback

`drizzle/20260820002947_fleet_driver_address_and_dates/` — aditiva. Colunas de texto com
`default ''` e `not null`, datas anuláveis: ficha antiga não precisa de backfill, e endereço ausente
é string vazia, não `null`, para o CHECK de comprimento não ter dois casos.

`rollback.sql` ao lado, derrubando índice, CHECKs e colunas nessa ordem. Ele devolve o schema, **não
os valores** — endereço digitado depois da migration se perde no rollback, e isso é aceitável porque
nada além do CRUD o lê.

## Segurança e tenant

- Todo repositório recebe `context.companyId`; `test/fleet-schema/tenant-safety.contract.ts` cobre.
- Nenhum campo do motorista em log.
- ⚠️ Três decisões abertas em `spec.md` — consulta externa, CSP, criptografia em repouso. Nenhuma
  resolvida por este plano, e é por isso que elas estão escritas em vez de combinadas.

## Idempotência e concorrência

Nada novo: cadastro é `PUT` por id. O índice parcial de CNH é a única corrida possível, e o banco a
resolve — duas fichas com a mesma CNH na mesma empresa dão `23505`.

## Observabilidade

Nada específico. O CRUD já loga por `correlation-id`, sem PII.

## Estratégia de testes

Contrato antes da implementação nas listas (cidade, vínculo). Nos campos de endereço a prova é de
fronteira: schema (CHECK e índice) e HTTP (aceita, recusa, canonicaliza).

## Riscos

- **Provedor público muda formato sem avisar.** Mitigado por type guard na leitura e degradação para
  digitável — nunca `as`.
- **Nominatim aplica limite.** Não temos como mandar `User-Agent` do navegador; o debounce não é teto
  de taxa. Este risco é real e está aberto na decisão 1.
- **Campo sem leitor apodrece.** Endereço e datas existem sem consumidor: se o MDF-e não os adotar,
  são nove colunas de dado pessoal guardadas por nada — o que torna a decisão 3 mais urgente, não
  menos.
