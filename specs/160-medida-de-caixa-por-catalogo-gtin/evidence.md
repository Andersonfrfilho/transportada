# Evidência — Fase 1 (T001–T006)

## T001 — Fixtures do payload real do Cosmos

`apps/api-transportada/test/fixtures/gtin-catalog.fixture.ts`. Dados exatamente como medidos na
sessão de descoberta (Tixan `7896098909768`, batata palha `7898963886129`, payload documentado do
Cosmos com dimensão zero). Tipos `PackageBoxCatalogCandidate`/`PackageBoxCatalogContentReference`
declarados localmente na fixture (não importados da política, que só nasce em T004) para o arquivo
compilar isoladamente antes da implementação existir.

```
bun run typecheck   → 0 erros (arquivo isolado; ver T002/T003 para o efeito da referência cruzada)
```

## T002 — Contrato vermelho da sanidade (CA01, CA01b)

`apps/api-transportada/test/package-box-catalog/sanity.contract.ts`, entrypoint fino
`test/package-box-catalog.contract.test.ts`, adicionado à lista explícita do `test` em
`apps/api-transportada/package.json`.

```
$ bun test ./test/package-box-catalog.contract.test.ts
error: Cannot find module '../../src/nfe-documents/domain/package-box-catalog-sanity.policy.js'
 0 pass / 1 fail / 1 error   ← vermelho esperado, antes da T004
```

## T003 — Contrato vermelho do consenso (CA02, CA03)

`apps/api-transportada/test/package-box-catalog/consensus.contract.ts`, mesmo entrypoint.

```
$ bun test ./test/package-box-catalog.contract.test.ts
error: Cannot find module '../../src/nfe-documents/domain/package-box-catalog-consensus.policy.js'
 0 pass / 1 fail / 1 error   ← vermelho esperado, antes da T005
```

## T004 — `package-box-catalog-sanity.policy.ts` (RF05)

`apps/api-transportada/src/nfe-documents/domain/package-box-catalog-sanity.policy.ts` +
`package-box-catalog.constant.ts` (limites `EDGE_MIN_MM`/`EDGE_MAX_MM`, códigos fechados).

Implementa os **seis** códigos do RF05 (o tasks.md diz "cinco", mas o RF05 lista seis:
`EDGE_TOO_LARGE`, `EDGE_TOO_SMALL`, `GROSS_WEIGHT_BELOW_CONTENT`, `DENSITY_OUT_OF_RANGE`,
`VOLUME_BELOW_CONTENT`, `UNIT_AMBIGUOUS`) — decisão conservadora: implementar o que o requisito
funcional pede por extenso, não o número citado de cabeça no tasks.md.

Decisão de design (não estava no plan.md em detalhe): `DENSITY_OUT_OF_RANGE` e
`VOLUME_BELOW_CONTENT` comparam a geometria da caixa contra a **massa do conteúdo conhecido**
(`unitsPerBox × unitNetWeightGrams`), nunca contra o peso bruto declarado pelo provedor — é
exatamente esse peso que a P3 mostrou estar sistematicamente torto (grama gravada como quilo);
usá-lo para validar a si mesmo não pegaria nada. Confirmado batendo os números reais do plan.md: a
batata palha reinterpretada em mm dá densidade calculada de **486 kg/m³** (`10 kg ÷ 0,020568 m³`),
exatamente o número citado no plan.md — prova de que a fórmula está certa.

```
$ bun run typecheck            → 0 erros
$ bun test ./test/package-box-catalog.contract.test.ts
 18 pass / 0 fail / 37 expect() calls   (após T004+T005 juntas)
```

## T005 — `package-box-catalog-consensus.policy.ts` (RF07, RNF03)

`apps/api-transportada/src/nfe-documents/domain/package-box-catalog-consensus.policy.ts`. Tolerância
15 mm por aresta / 5% no peso bruto (RNF03). CA02 (duas fontes concordando promovem) e CA03 (fonte
única só propõe) verdes — ver saída consolidada acima.

## T006 — `'catalog'` em `PACKAGE_BOX_MEASUREMENT_SOURCES` (RF09)

Alterados:

- `apps/api-transportada/src/database/nfe.schema.ts`
- `apps/api-transportada/src/nfe-documents/domain/package-box-measurement.constant.ts`

```
$ bun run typecheck   → 0 erros
$ bun run test        → 6700 pass / 0 fail / 32 skip / 23075 expect() calls (suíte completa da API)
```

### Decisões tomadas por conta própria (ambiguidade da task, caminho conservador)

1. **`apps/worker-transportada/src/database/nfe.schema.ts` não foi tocado.** A instrução do prompt
   dizia para mudar "a cópia espelhada" nas duas apps, "as duas, idênticas". Investigado: o schema
   do worker **não tem hoje** nenhum export `PACKAGE_BOX_MEASUREMENT_SOURCES`, nem coluna
   `measurement_source` na cópia de `nfe_package_boxes` — só `lengthMm/widthMm/heightMm/
grossWeightGrams/measuredAt`. Não existe o que espelhar; a espelhagem prevista depende da spec
   155 (D13–D19 do worker), que o próprio `plan.md` desta feature registra como "não commitada".
   Criar esse export do zero no worker seria inventar escopo (e um enum sem nenhum consumidor) que
   nenhuma task da Fase 1 pediu — decisão conservadora foi não criar.

2. **`'catalog' ainda não é gravável no banco.** As duas CHECKs do Postgres que hoje restringem os
   valores aceitos (`nfe_package_boxes_measurement_source_check` e
   `nfe_package_box_measurements_source_check`) têm os quatro valores antigos **hardcoded em SQL**,
   não derivados do array TS. T006 pediu explicitamente para não gerar migration. Resultado:
   typecheck e testes de aplicação ficam verdes, mas uma tentativa real de `INSERT`/`UPDATE` com
   `measurement_source = 'catalog'` seria rejeitada pelo banco até uma migration aditiva (fora da
   Fase 1) alargar as duas CHECKs. Comentário `⚠️` deixado nos dois arquivos TS explicando isso, para
   quem for implementar a Fase 2/4 não presumir que o valor já está pronto para gravação.

3. **RF05 tem seis códigos, não cinco** (ver nota do T004 acima) — o tasks.md conta "cinco"; os seis
   estão implementados e testados.

## Testes verdes (Fase 1 completa)

```
$ bun run typecheck                                    → 0 erros
$ bun test ./test/package-box-catalog.contract.test.ts → 18 pass / 0 fail
$ bun run test (suíte completa da api-transportada)     → 6700 pass / 0 fail / 32 skip
```

## Commits desta sessão

| Hash       | Assunto                                                                                 |
| ---------- | --------------------------------------------------------------------------------------- |
| `f2763b65` | test(nfe): fixture com o payload torto do Cosmos para dois GTINs reais (spec 160, T001) |
| `e1614629` | test(nfe): contrato vermelho da sanidade de catálogo (spec 160, T002)                   |
| `f3aecd47` | test(nfe): contrato vermelho do consenso de catálogo (spec 160, T003)                   |
| `0a12ce3c` | feat(nfe): política pura de sanidade do catálogo de GTIN (spec 160, T004)               |
| `c504072c` | feat(nfe): política pura de consenso do catálogo de GTIN (spec 160, T005)               |
| `d1f10741` | feat(nfe): 'catalog' entra em PACKAGE_BOX_MEASUREMENT_SOURCES (spec 160, T006)          |

## Correção de dados em produção — `units_per_box` (2026-09-21)

Fora das tasks T001–T020. Executado pelo usuário no terminal (a escrita remota em produção é
bloqueada para o agente), no banco `postgres-hqfu`.

- **Antes:** 799 caixas, `units_per_box = 1` em 798, embora `commercial_unit` já dissesse a
  quantidade (`CX32`, `FR20`…). Causa: o formulário abria o campo com `1` e ninguém redigitava.
- **Regra:** a mesma de `resolvePackagingUnitCount` (lista fechada `CX FR FD DP EV PC UN`, teto
  1000), aplicada só onde o valor era `1` e o derivado ficava entre 2 e 1000.
- **Execução:** bloco `DO` numa transação que abortava se o número de linhas afetadas fosse diferente
  de 791 (medido no ensaio). Saída: `NOTICE: ok: 791 caixas corrigidas`.
- **Depois:** 799 caixas, 7 com `1` (as 7 são `UN1`, avulsas de verdade) e **0** divergentes da
  unidade comercial.
- **Incluiu as 100 já medidas com `1`:** nenhuma das 100 tinha sido alterada do padrão, e a única
  caixa em que alguém mexeu (Tixan, `CX9`) já estava certa. Cem caixas de `CX12` a `CX240` serem todas
  avulsas não é plausível.
- **Não tocou:** `measured_at`, dimensões nem o histórico `nfe_package_box_measurements`.
- **Rollback:** backup `id,valor_antigo,valor_novo` das 791 linhas; todas estavam em `1`, então
  desfazer é voltar esses ids para `1`.
