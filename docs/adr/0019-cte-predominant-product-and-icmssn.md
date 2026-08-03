# ADR-0019: Produto predominante é parâmetro do perfil, e o grupo ICMSSN é do pacote fiscal

## Contexto

A feature 016 comparou, campo a campo, 166 CT-es reais autorizados com o payload que o nosso código
monta para as mesmas NF-es (`specs/016-cte-real-alignment/research.md`). Dezessete dos dezenove
campos batem em 166/166 — `vTPrest`, `vCarga`, `Comp`, `CFOP`, `natOp`, `toma`, `indIEToma`,
municípios e chaves. Dois não batiam.

O primeiro é `proPred`. O único modo calculado comparável no produto, `highest_value` (maior
`vProd`), acerta 115/166. O critério que o emitente real usa é **maior `qCom`**, com desempate por
maior `vProd` e depois menor `nItem`: 165/166. A única divergência restante é o CT-e 14139, em que a
escolha do emitente não é derivável de nenhum dado por item da NF-e.

Ao ligar o modo novo, o modo `highest_weight` apareceu quebrado: ele lia `nfe_products.gross_weight`,
coluna que a importação de NF-e nunca preenche, então qualquer perfil configurado nele derrubava a
emissão com `CTE_PAYLOAD_UNRESOLVED_PREDOMINANT_PRODUCT` — e havia teste congelando essa falha como se
fosse regra. O peso que a NF-e realmente traz está em `nfe_volumes` (`pesoB`/`pesoL`), por volume, não
por item.

O segundo é o grupo ICMS. O nosso payload devolve `{cst:'90'}` para o perfil Simples, mas o XML real
traz `<ICMS><ICMSSN><CST>90</CST><indSN>1</indSN></ICMSSN>`. A diferença não vem do nosso código:
`CteXmlBuilder.buildIcms(icms, crt)` do `@adatechnology/fiscal-provider` ignora o grupo recebido e
emite `ICMSSN` sempre que `crt ∈ {'1','2'}`.

## Decisão

**O critério de produto predominante é parâmetro do perfil de emissão, nunca regra fixa de
transportadora.** `highest_quantity` entra em `CTE_PREDOMINANT_PRODUCT_MODES` ao lado de `fixed`,
`highest_value` e `highest_weight`, é escolhido por perfil — e portanto por empresa, já que perfil é
sempre de um `company_id` — e aparece traduzido no formulário. Nenhum CNPJ, nenhuma condição por
transportadora e nenhum default novo: perfis existentes continuam no modo em que estão.

A tabela de acerto de `research.md` é o fundamento da decisão, não uma regra legal. O que ela prova é
que **um** emitente usa esse critério, não que a legislação o exija; por isso o resultado é uma opção
configurável, e não uma troca de comportamento para todo mundo. Pelo mesmo motivo a divergência de
1/166 fica fora do escopo: não se inventa regra fiscal a partir de uma amostra.

A escolha compara em inteiro escalado (`parseScaledDecimal`, escala 4) — grandeza desc, `totalValue`
desc, `ordinal` asc, posição da nota asc — e os três modos calculados passam pelo mesmo comparador;
só muda a grandeza. Num item agrupado, os candidatos são os itens de **todas** as notas do CT-e.

**O peso do volume é a declaração legal da carga; peso por item, quando existir, só escolhe o produto
predominante.** São duas perguntas diferentes com a mesma unidade. O que vai em `infQ`
(`PESO BRUTO`, `PESO LIQUIDO`, `UN`) é o que a transportadora carrega de fato, embalagem inclusa, e
isso está em `nfe_volumes` — a soma dos pesos dos itens é sempre menor e não descreve a carga
transportada. Por isso `composeCargoQuantities` continua somando só volumes, e peso de item nunca
entra nessa conta.

Para escolher o produto predominante, `highest_weight` usa peso por item **sob regra de
tudo-ou-nada**: só se todos os itens do grupo declararem peso positivo. Basta um item sem peso e a
fonte por item é descartada inteira, porque comparar item pesado contra item de peso ausente é
comparar com zero — o item sem peso perderia sempre, por falta de dado e não por ser mais leve.
Descartada a fonte por item, cada nota passa a valer o peso bruto dos seus volumes: todos os itens da
mesma nota disputam com a mesma magnitude e o desempate herdado (`vProd` desc, `nItem` asc) decide
dentro dela. Sem peso em item e sem peso em volume, aí sim o modo falha.

`CtePayloadProduct.grossWeight` fica como ponto de extensão: no dia em que a importação passar a
extrair peso por item da NF-e, a fonte troca sozinha, sem mudar contrato nem migration.

**O grupo ICMSSN e o `indSN` são responsabilidade do pacote fiscal, a partir do CRT.** O nosso
payload continua devolvendo `{cst:'90'}` para o perfil Simples com alíquota zero, e o `crt` que o
pacote usa nasce de `companyFiscalProfiles.taxRegime`, atravessando `providerConfig` sem ser
reescrito. Replicar `indSN` no nosso payload seria duplicar em dois lugares uma regra que o pacote já
decide — e divergir dele no dia em que ele mudar.

A alternativa descartada foi tratar `highest_quantity` como correção do `highest_value`, trocando o
critério para todos. Isso quebraria silenciosamente perfis de outras empresas cujo CT-e hoje está
correto, para acertar o caso de um emitente.

## Consequências

- Um perfil pode ser migrado para `highest_quantity` pela tela, e o efeito é só dele. O `CHECK` de
  `predominant_product_mode` foi ampliado por migration com rollback manual ao lado — e o rollback
  falha de propósito se já existir perfil gravado no modo novo, porque decidir o que fazer com esses
  perfis é humano.
- A escolha do produto predominante num CT-e agrupado depende da ordem das notas apenas no
  desempate final; até lá, quantidade, valor e ordinal decidem.
- `highest_weight` deixou de ser um modo que só falha: perfil configurado nele passa a emitir,
  escolhendo pelo peso do volume enquanto a NF-e não trouxer peso por item. O teste que congelava a
  falha foi trocado pelo comportamento novo, e a rejeição continua coberta no caso certo — sem peso
  em item **e** sem peso em volume.
- Enquanto o peso vier só do volume, todos os itens de uma nota empatam em magnitude e quem decide é
  o `vProd`. Numa nota só, `highest_weight` e `highest_value` dão o mesmo resultado; a diferença
  aparece no CT-e agrupado, onde a nota mais pesada ganha da nota de maior valor.
- Volume por nota é dado que já persistimos e que o cálculo de rota vai precisar; nada aqui o
  consome de forma exclusiva.
- `providerConfig.crt` está preso por contrato ao `taxRegime` da empresa, e empresa sem regime
  gravado falha em `CTE_ISSUANCE_EMITTER_INCOMPLETE` antes de chegar à SEFAZ.
- Se o pacote fiscal passar a respeitar o grupo ICMS recebido, nada muda do nosso lado: continuamos
  mandando `{cst:'90'}`, que é o grupo correto para o perfil.
