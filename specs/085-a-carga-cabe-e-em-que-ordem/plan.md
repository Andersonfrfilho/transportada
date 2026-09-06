# Plano técnico

## Contexto e premissas

A spec 076 já entregou a política do baú (`cargo-layout.policy.ts`) e o painel
(`TripCargoPanel`), no **detalhe** da viagem. Esta feature move a resposta para onde a
decisão acontece, troca fatia contínua por fileira, e liga a cubagem por um cadastro que
se popula sozinho.

Premissa que ordena tudo: **a divisão do baú entre paradas não depende de calibragem**
(spec, D1). Logo a ordem de execução pode entregar o desenho **antes** do cadastro.

## Arquitetura e arquivos afetados

**Pacote** (`adatechnology-packages`) — só se a ADR de D5.2 aprovar:

- `backend/catalog-contracts/src/catalog.types.ts` · `schemas.ts` — `lengthMm`,
  `widthMm`, `heightMm`, `grossWeightGrams`, e `priceInCents` opcional.
- `backend/catalog-module` — migration própria no `pgSchema('catalog')`.
- `frontend/products-ui` — campos de medida na ficha.

**api-transportada**

- `database/nfe.schema.ts` — `nfe_package_boxes`.
- `database/fleet.schema.ts` — `fleet_vehicles.loading_access`.
- `nfe-documents/domain/cargo-volume.policy.ts` — soma por item, origem, reserva mediano.
- `trips/domain/cargo-layout.policy.ts` — fileiras, quebra na mesma cor, acesso lateral.
- `trips/application/preview-trip-cargo.use-case.ts` + rota `POST /trips/cargo-preview`.
- `nfe-documents/application/` — upsert da caixa na importação.

**worker-transportada**

- `nfe-package-box-backfill.service.ts` — relê os XMLs arquivados, no molde de
  `nfe-party-contact-backfill.service.ts`, que já faz exatamente isso para telefone e
  nome fantasia.

**frontend-transportada**

- `trip/components/TripCargoPanel.component.tsx` — fileiras + silhueta.
- `trip/components/TripQuickCreateDialog.component.tsx` — o painel entra aqui.
- `nfe-workspace/components/CargoVolumeFactorPanel.component.tsx` — vira a lista de
  caixas por volume transportado, com acumulado.
- `fleet/` — campo "por onde carrega" na ficha do veículo.

## Contratos/API/eventos

- `POST /trips/cargo-preview` (`trip.manage`, escopo `company`): `{nfeDocumentIds[],
vehicleId}` → `{occupancy, rows[], weightAlert, source}`. Espelha
  `/trips/valuation-preview`.
- `GET /nfe-package-boxes?sort=volume` (`settings.manage`): a lista de medição, ordenada
  pelo que mais roda, com cobertura acumulada.
- `PUT /nfe-package-boxes/:id` (`settings.manage`): grava as três medidas.

## Dados, migration e rollback

- `nfe_package_boxes` — nova, aditiva. Rollback é `drop table`.
- `fleet_vehicles.loading_access` — coluna nova com default derivado do `body_type`
  (`05`→`rear_and_side`, demais→`rear`). Rollback devolve a coluna, não os valores.
- `company_cargo_volume_factors` **fica como está**. Ela continua servindo o emitente que
  um dia preencher `<esp>`, e é o degrau mais baixo da precedência.

## Segurança e tenant

- `nfe_package_boxes` carrega `company_id`; unique inclui o tenant. Contrato negativo em
  `test/nfe-schema/tenant-safety.contract.ts`.
- ⚠️ **`vUnCom` não entra no cadastro.** É o preço de venda do **emitente** ao cliente
  dele — dado comercial de terceiro, num catálogo que sabe publicar na Meta Commerce.
  O `priceInCents` fica vazio; é por isso que ele precisa ser opcional.
- Medida de caixa não é PII e não entra na lista de campos cifrados.

## Idempotência e concorrência

- O upsert da caixa é idempotente pela chave única — reimportar a mesma nota não duplica
  e **não sobrescreve medida já preenchida**.
- O backfill relê XML imutável: repetir converge.

## Observabilidade

- Contador de caixas descobertas por importação e de caixas medidas sobre o total.
- A cobertura (% dos volumes com caixa medida) é o número que diz se a feature está
  ganhando terreno; ela aparece na aba Cubagem, não só em log.

## Estratégia de testes

- **O fator cancela**: com nada medido, mudar o volume de reserva não muda nenhuma fatia.
  É o contrato que trava D1 e o que impede alguém de reintroduzir dependência de
  calibragem sem perceber.
- Quantização: parada grande em fileiras seguidas da mesma cor; parada pequena dividindo
  fileira; soma das fileiras = capacidade.
- `rear` mantém LIFO; `rear_and_side` marca acesso lateral.
- Origem (`measured`/`partial`/`estimated`) presente em toda superfície que publica
  volume — por texto de fonte, como o peso já é cobrado.
- Isolamento por tenant nas duas tabelas novas.

## Riscos

- **A ADR de D5.2 não aprovar mexer no pacote.** Mitigação: a medida vai para
  `nfe_package_boxes` e o catálogo fica de fora — perde-se a UI pronta, não a feature.
- **Ninguém medir caixa nenhuma.** É o estado de hoje, e a feature **funciona nele**:
  fileiras saem do `qVol`. O risco é só a ocupação absoluta não aparecer.
- **A operação ser paletizada.** Aí D2/D3 mudam de unidade. Por isso a dúvida está
  aberta na spec e é a primeira a fechar.
