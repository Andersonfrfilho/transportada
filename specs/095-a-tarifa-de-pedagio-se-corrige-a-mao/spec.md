# Feature 095 — A tarifa de pedágio se corrige à mão

> Registrada em 2026-09-07. Estado: **pendente**. Nasceu do achado 3 da revisão da 090 e da resposta
> do usuário a ele: em vez de inventar regra sobre o dado do OSM, **dar uma página para preencher**.

## Problema e resultado

O catálogo de praças vem do OpenStreetMap, e o OSM erra de dois jeitos que a tela não consegue
distinguir: a praça **não declara tarifa** (3 das 166 medidas) ou **declara `0.00`** (4 das 166), que
às vezes é isenção e às vezes é campo não preenchido — as duas da SP-291 têm nome de praça de rodovia,
nenhum operador e zero em tudo.

A 090 fechou a metade honesta: a tela diz quantas praças estão sem tarifa conhecida em vez de somar
zero calado. O que falta é a saída: **quem opera saber o valor e não ter onde escrever**.

O resultado: uma página onde a transportadora corrige a tarifa da praça, e a correção dela vence o
mapa.

## Como o mercado faz, e o que isso decide aqui

Nenhuma plataforma séria usa o OSM como fonte de preço. Elas mantêm **base curada própria**,
alimentada das publicações oficiais — no Brasil a **ANTT** e a **ARTESP** publicam tarifa e data de
vigência de graça —, e por cima dela oferecem **ajuste por cliente**, porque tag com desconto,
vale-pedágio e contrato com operadora mudam o valor real de empresa para empresa. O mapa entra como
piso de **cobertura** (onde a praça está), nunca de **preço**.

Isso parte o problema em duas features, e só a segunda é esta:

1. **Curadoria oficial** — importar ANTT/ARTESP por cima do OSM. Já está no fora-de-escopo da 090
   ("atualizar tarifa por fonte oficial"), e continua lá: é trilho de dado, com fonte, periodicidade
   e histórico próprios.
2. **Ajuste da empresa** — esta. Ela é útil **antes** da curadoria e continua útil depois, porque
   contrato e desconto nunca serão dado público.

## A decisão que ordena o resto

### D1 — O ajuste é da empresa, e mora fora do catálogo público

`toll_booths` é uma das três tabelas sem `company_id`, e **assim permanece**: ela é o que o mapa diz.
A correção vai para `company_toll_booth_charges`, com `company_id`, e o valor efetivo é
**`ajuste da empresa ?? tarifa do catálogo`**.

⚠️ **Este padrão já existe nesta base, inteiro** — é o do combustível: `fuel_price_references` é
pública e sem tenant, `company_fuel_prices` é o ajuste, e `companies/domain/fuel-price.policy.ts`
resolve `ajuste ?? referência`. Reimplementar diferente aqui criaria duas formas de dizer a mesma
coisa; o caminho é copiar a forma, incluindo o `DELETE` que **apaga o ajuste** em vez de gravar zero.

⚠️ E **apagar não é zerar**: a linha ausente devolve a tarifa do mapa; `0.00` gravado à mão é uma
afirmação de isenção, feita por gente, com autor e data. É exatamente a distinção que o OSM não tem —
e é ela que resolve o achado 3 sem inventar regra sobre dado de terceiro.

### D2 — A correção diz quem fez e quando

A linha guarda `actor_user_id` e `observed_on` (a data da tarifa que a pessoa está registrando, não a
do clique). Reajuste de pedágio é anual, e a tela já imprime a data ao lado do valor desde a 090 —
ela passa a imprimir **de quem** o valor veio quando for ajuste.

### D3 — A praça tem dois preços, e quem decide qual vale é o veículo

Medido em 2026-09-07, na tabela oficial da **Arteris ViaPaulista**:

```
São Simão · SP-330 km 281   →  manual R$ 10,50   automático (tag) R$ 9,97
Santa Rita do Passa Quatro  →  manual R$ 10,50   automático (tag) R$ 9,97
```

⚠️ **Nós usamos o manual, e quase toda transportadora paga com tag.** São ~5% a mais em cada praça,
sempre para cima e sempre invisível: na rota Ribeirão → Pirassununga isso é R$ 3,18 por caminhão,
repetido em toda viagem, no número que decide aceitar ou recusar carga.

Três consequências:

1. **O OSM não tem esse campo.** `charge` traz um valor só, que é o manual. A tarifa automática só
   vem do ajuste da empresa (D1) ou da importação oficial futura.
2. **É por praça e por concessionária.** A Intervias publica **um** preço nas páginas de trecho; a
   ViaPaulista publica **dois**. Não existe desconto global de tag para aplicar por cima — inventar
   um seria trocar um erro conhecido por um palpite.
3. **Quem paga com tag é o veículo, não a empresa.** Frota mista é o caso normal: o agregado tem a
   tag dele, o próprio pode não ter. Por isso a marca é do **veículo**
   (`fleet_vehicles.has_automatic_toll_payment`), não de configuração da empresa.

**A regra, e a direção do erro é escolhida de propósito:** veículo com cobrança automática usa a
tarifa automática **quando ela é conhecida**; quando não é, cai para a manual **e a tela diz que
caiu**. Nunca se aplica desconto estimado.

⚠️ A queda para o manual **superestima** o custo, e é assim que tem de ser: num número que decide
aceitar carga, errar para cima faz recusar uma viagem que pagaria — errar para baixo faz aceitar uma
que não paga, e o prejuízo já aconteceu quando alguém percebe.

## O que aparece na tela

Aba nova em `fleet` — ao lado de **Combustível**, que é o painel gêmeo —, guardada por
`settings.manage`. Lista as praças **que a operação encontrou** (as que apareceram em alguma rota
calculada), não as 166 do catálogo: corrigir praça por onde ninguém passa é trabalho jogado fora.

Cada linha: nome, operador, tarifa do mapa, campo de ajuste, data. As **sem tarifa conhecida** e as
com `0.00` sobem primeiro — são o motivo da página existir.

### D4 — A conta da viagem ainda usa a base manual (lacuna aberta pela D3)

A D3 fez a **montagem** usar a tarifa automática quando o veículo tem tag. A parcela de custo de
`read-trip-valuation.use-case.ts` — a que forma a **margem da viagem** — continua na base manual.

⚠️ Duas telas mostram pedágios diferentes para a mesma viagem, e isso precisa fechar. A diferença
medida é de R$ 2,12 na rota Ribeirão → Pirassununga com toco.

Fica publicado assim de propósito, e a razão é a mesma da D3: **a base manual superestima**, e a
parcela que superestima é a que entra na margem. Errar para cima faz recusar viagem que pagaria;
errar para baixo faz aceitar a que não paga. Das duas inconsistências possíveis, esta é a menos cara
— mas continua sendo inconsistência, e não deve sobreviver a mais de uma rodada.

- **Depende de:** D3.
- **Custo:** passar `hasAutomaticTollPayment` do contexto do veículo, que a valoração já lê, até
  `resolveTollRouteCost`. É encanamento, não decisão nova.

## Fora de escopo

- **Importar ANTT/ARTESP** (a outra metade, acima).
- **Desconto de tag, vale-pedágio e eixo suspenso** — herdado da 090: são contrato com operadora, e
  pedem cadastro próprio.
- **Corrigir a posição da praça.** Coordenada errada é problema do mapa, e o casamento é por nó.

## Contratos obrigatórios

- Veículo com cobrança automática e praça **sem** tarifa automática conhecida cai para a manual, e a
  contagem dessas quedas sai na tela — desconto estimado é proibido.
- `company_toll_booth_charges` **tem `company_id`** e é assertada no `tenant-safety` — ao contrário
  de `toll_booths`, que continua na lista de exceções.
- O valor efetivo é `ajuste ?? catálogo`, resolvido num lugar só, no molde de `fuel-price.policy.ts`.
- Apagar o ajuste devolve a tarifa do mapa; `0.00` ajustado **não** conta como tarifa desconhecida e
  imprime `R$ 0,00` — porque agora alguém assinou embaixo.
- A listagem mostra só praça já vista em rota, e ordena as sem tarifa primeiro.
