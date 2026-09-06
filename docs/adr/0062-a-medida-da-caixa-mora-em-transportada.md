# ADR-0062 — A medida da caixa mora em transportada, não no catálogo de venda

- **Data:** 2026-09-05
- **Estado:** aceita
- **Contexto:** habilita G004/G005/G006 da **spec 085**. Responde a T002 dela. Não revoga nada.

## Contexto

A spec 085 precisa guardar a medida da caixa de papelão que carrega os produtos — para dizer quanto
do baú a carga ocupa. A NF-e **não traz dimensão**: medido em 345 XMLs reais, o grupo `<vol>` tem
`qVol`, `pesoL` e `pesoB` em 345 de 345, e nada mais. A medida é preenchida à mão pelo conferente.

Existe `@adatechnology/catalog-module` no repositório de pacotes, com produto, `barcode` GTIN
validado e único por empresa, multiempresa por construção, rotas prontas e UI (`products-ui`). A
pergunta natural é reusá-lo.

## O que a investigação encontrou

**O módulo não tem o campo.** Nem `length`/`width`/`height`, nem peso. Acrescentá-los seria
legítimo — um e-commerce precisa deles para cotar frete —, e sozinho isso não seria obstáculo.

**O obstáculo é o modelo.** O `catalog-module` é catálogo **de venda**: `priceInCents` é
obrigatório, e ao lado dele vêm estoque, seções, disponibilidade e publicação na Meta Commerce. Uma
transportadora não vende o sabonete que carrega. Escrever `0` seria mentir num campo que outros três
produtos leem como preço.

**E a identidade não bate.** A unidade que a 085 mede é a **caixa**, identificada por
`(emitente, cProd, uCom)`:

- `cProd` é o código **do emitente** — sozinho não identifica nada;
- `uCom` entra na chave porque o mesmo produto em `CX12` e `CX24` são **duas caixas diferentes**;
- medido: `CX12` cobre **151 produtos distintos** e `CX24` cobre 90 — o código de embalagem diz
  quantas unidades vão dentro, nunca o tamanho da caixa;
- o GTIN-14, que identificaria a caixa globalmente, vem em **11%** delas (75 de 663).

Ou seja: o que precisamos cadastrar é o produto **de outra empresa**, sob o código **dela**, numa
embalagem específica. Isso não é catálogo nosso — é dado da relação de transporte.

**Reusar custaria criar 591 produtos alheios num catálogo de venda**, sem preço, que sabe publicar
na Meta Commerce. O risco não é técnico; é de um dia alguém publicar o catálogo do cliente.

## Decisão

**A medida mora em transportada, em `nfe_package_boxes`, chaveada por
`(company_id, emitter_tax_id, product_code, commercial_unit)` com `carton_gtin` opcional como alias
global.** O `catalog-module` **não é alterado** e **não é consumido** por esta feature.

A linha nasce sozinha na importação da NF-e, sem medida — o cadastro se popula com o que roda, e
medir é preencher o que já está lá.

## Consequências

- **Perde-se a UI pronta do `products-ui`.** A fila de medição é tela nova, mobile-first, com o
  leitor de código que já existe (ADR-0042). Custo aceito: a tela do `products-ui` é de catálogo de
  venda e não teria a fila ordenada por volume transportado, que é o coração da 085 R2.
- **Nenhum dos três produtos que consomem o `catalog-module` é tocado.** Não há bump, não há
  contrato quebrado, não há risco de regressão fora daqui.
- **Se um dia a transportadora vender algo** — peça, pallet, serviço avulso —, aí sim o
  `catalog-module` entra, para o que ela vende. As duas coisas coexistem sem se confundir.
- ⚠️ **Dimensão e peso continuam sendo dado legítimo de catálogo.** Se o quickcart precisar deles
  para cotar frete, que sejam acrescentados **lá** por aquela necessidade, não por esta — e nada
  nesta ADR impede isso.

## O que reabriria esta decisão

Ela é barata de reverter — uma tabela nossa, sem consumidor fora daqui. Reabre se: o quickcart
precisar de dimensão para cotar frete (aí o campo nasce no pacote **por aquela necessidade**), ou se
a transportadora passar a vender algo e o `catalog-module` entrar pelo que ela vende.

## Alternativas consideradas

**Tornar `priceInCents` opcional no `catalog-module`.** Recusada: é mudança de contrato num pacote
consumido por três produtos, para atender um caso que nem é catálogo. O ganho seria a UI pronta; o
custo é um campo obrigatório virar opcional em código que hoje confia nele.

**Copiar o `catalog-module` para dentro de transportada.** Recusada de saída: seria duplicar um
pacote inteiro para usar um terço dele.
