# ADR-0116 — O rateio das contas é calculado na leitura, por grupo de custo

- **Status:** proposto (aguarda Anderson aprovar os previews da extensão da spec 325, T4.0)
- **Data:** 2026-11-13
- **Contexto:** spec 325, extensão "rateio e resultado do mês". Complementa a [ADR-0115](0115-a-conta-da-empresa-e-modulo-proprio.md).

## Decisão

1. **Três grupos de custo** (modelo por km das grandes transportadoras): fixo do veículo, variável por km e administrativo. Cada categoria de conta pertence a um grupo (`cost_group`); o pagamento de motorista/agregado é `in_trip` e não é rateado.
2. **Critério configurável por empresa e grupo** (`per_km`, `per_trip_day`, `per_revenue`, `equal`), com padrão recomendado. Conta com veículo vai só para as viagens dele.
3. **Calculado na leitura.** O rateio não é gravado na viagem nem em `trip_financial_parcels`: o resultado da viagem (0049) e o lucro por nota (232/259) não mudam. Gravar criaria uma segunda fonte de verdade que envelhece quando a conta é baixada ou o critério muda.
4. **O motorista não é somado de novo.** O custo dele fica na parcela `driver` da viagem; a conta só entra como conta da empresa na parte que passar da soma das viagens incluídas.
5. **O custo por km por veículo é uma leitura exposta** (caso de uso e rota), para a futura cotação de frete reaproveitar sem refazer a conta.

## Consequências

- Margem por viagem, veículo e cliente fecha com o total do painel (contrato de soma); a parte sem viagem no período aparece como "não rateado".
- Mês fechado não é congelado nesta versão; se for preciso, vira task com snapshot próprio.

## Alternativas descartadas

| Alternativa                        | Por que não                                                          |
| ---------------------------------- | -------------------------------------------------------------------- |
| Gravar o rateio na viagem          | Duas fontes de verdade; muda o resultado da viagem fechado (0049)    |
| Critério único fixo (igual/viagem) | Viagem longa e curta pagariam o mesmo; margem por rota ficaria falsa |
| Ratear também o motorista          | Conta o motorista em dobro                                           |
