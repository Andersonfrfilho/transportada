# 016 — Alinhamento do CT-e gerado com CT-es reais

Insumo de pesquisa. Ainda **não** existe `spec.md`, `plan.md` nem `tasks.md` para esta feature.

## O que foi conferido

166 CT-es reais autorizados (SP→SP, emitente `05868574001090`) casados com as NF-es que os
originaram. Para cada par, o payload foi gerado pelo nosso próprio código
(`cte-profiles/domain/charge-composition.service.ts` + `cte-issuance/domain/cte-payload.builder.ts`)
com um perfil equivalente ao que está no banco local (4,5% sobre o valor da nota, CFOP 5353,
tomador 0, Simples Nacional) e comparado campo a campo com o XML real.

**19 campos conferidos por CT-e. 17 batem em 166/166:** `vTPrest`, `vRec`, `Comp`, `vCarga`,
`infQ`, `CFOP`, `natOp`, `toma`, `indIEToma`, `retira`, `tpServ`, município de origem, município de
destino, remetente, destinatário, informações adicionais e chaves dos documentos.

## Cálculo do valor (4,5%)

- `vTPrest = 4,5% × vNF`, arredondado half-up para 2 casas, em **166/166** — zero divergência.
- O arredondamento em duas etapas do nosso motor (`MONEY_SCALE 4` → `FISCAL_SCALE 2`) reproduz os
  166 valores exatamente; o arredondamento direto em uma etapa também. Não há deriva de dupla
  arredondamento neste conjunto.
- `vRec == vTPrest == Σ Comp` e `vCarga == Σ vNF` em todos.
- Estrutura uniforme: **1 componente por CT-e**, rótulo `Frete Spani 4,5`; `ICMSSN/CST=90 indSN=1`;
  `CFOP 5353`; `toma=0`; SP→SP; 1 remetente, 159 destinatários; nenhuma nota sem `pesoB`.
- **1 nota por CT-e nos 166** (`per_invoice`). O agrupamento `sender_recipient` já existe no schema
  (`CTE_EMISSION_GROUPING_MODES = ['per_invoice', 'sender_recipient']`) mas **não aparece neste
  lote real** — não há amostra para validar grupo.

## Divergência 1 — `icms` (166/166, benigna)

Nosso payload devolve `{cst: '90'}`; o XML real traz `{cst: '90', indSN: '1'}`.

Não é bug nosso: `CteXmlBuilder.buildIcms(icms, crt)` do `@adatechnology/fiscal-provider` ignora o
grupo informado e emite `<ICMS><ICMSSN><CST>90</CST><indSN>1</indSN></ICMSSN></ICMS>` sempre que
`crt ∈ {'1','2'}`. Nosso `crt` vem de `emitter.taxRegime` (`cte-issuance-payload.service.ts:74`) e o
emitente real tem `CRT = 1`.

**Pendência:** confirmar que a empresa local está com `taxRegime = '1'` nas configurações — só o XML
real foi verificado, não a nossa configuração.

## Divergência 2 — `proPred` (51/166, real)

O modo `highest_value` (maior `vProd`) não reproduz o produto predominante do emitente real.
Taxas de acerto testadas sobre os mesmos 166:

| Regra                                                              | Acertos     |
| ------------------------------------------------------------------ | ----------- |
| **maior `qCom`, desempate maior `vProd`, desempate menor `nItem`** | **165/166** |
| maior `qCom`, desempate último item em empate                      | 138/166     |
| maior `qCom`, desempate menor `nItem`                              | 136/166     |
| maior `qTrib`                                                      | 136/166     |
| maior `vProd` (nosso `highest_value`)                              | 115/166     |
| unidades (`qCom` × multiplicador da embalagem no `uCom`)           | 104/166     |
| primeiro item                                                      | 50/166      |
| último item                                                        | 30/166      |

`qCom` aqui é a quantidade comercial — número de caixas/fardos, não de unidades. Expandir pelo
multiplicador do `uCom` (`CX12`, `FD20`, `CX200`) **piora** o acerto, então a regra do emitente
olha volumes, não unidades.

Única falha da regra vencedora — CT-e 14139: real `LA ACO BOMBRIL 45G C/6` (`qCom 1 CX200`,
`vProd 339,00`) enquanto a regra escolhe `COCO RAL SOCOCO 100G TRAD` (`qCom 2 CX24`,
`vProd 229,44`). Compatível com escolha manual ou com um critério de peso que a NF-e não expõe por
item. **1/166 não justifica inventar regra** — a decisão de adotar `highest_quantity` como modo
configurável precisa ser do usuário.

## Conclusão para a feature

1. Acrescentar `highest_quantity` a `CTE_PREDOMINANT_PRODUCT_MODES`
   (`database/cte-emission-profile.schema.ts:50`, hoje `['highest_value','highest_weight','fixed']`),
   com desempate maior `vProd` → menor `nItem`, e expor no formulário de perfis. Nada de hardcode:
   o modo continua por perfil de emissão, por empresa.
2. Validar o agrupamento `sender_recipient` (várias notas → um CT-e) com teste de contrato, já que o
   lote real não tem amostra dele.
3. Confirmar `taxRegime` da empresa local.

Ordem obrigatória: teste de contrato antes da implementação, arquivo novo registrado na lista
explícita de testes do `package.json` da app, evidência em `evidence.md`.

## Amostras

`samples/` traz 5 pares NF-e + CT-e reais escolhidos para exercitar os desempates:

| Arquivo | Por que está aqui                                                 |
| ------- | ----------------------------------------------------------------- |
| `14093` | maior `qCom` ≠ maior `vProd` — o caso que reprova `highest_value` |
| `14094` | empate de unidades expandidas, decidido por `qCom`                |
| `14108` | empate em `qCom`, decidido por `vProd`                            |
| `14123` | empate em `qCom` e `vProd`, decidido por menor `nItem`            |
| `14139` | a única falha da regra vencedora                                  |

⚠️ São documentos fiscais reais, com CNPJ, IE e chave de acesso de terceiros. Estão na árvore de
trabalho; commitar publica esses dados no histórico do repositório.
