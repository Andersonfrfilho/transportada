# Feature 124 — Motorista sem a zona: a conta usa o preço da tabela, e avisa

## Problema e resultado

Desde a spec 123, quando o destino da viagem cai numa zona que o motorista **não cobre**, a parcela
`driver` sai ausente com `DRIVER_ZONE_NOT_COVERED` e a zona recusada no detalhe. A conta fica sem o
maior custo da viagem — o agregado costuma ser o dobro do combustível —, e a margem aparece maior do
que é até alguém ajustar a ficha do motorista.

Decisão do usuário: **"caso o motorista não tenha a zona, procure na tabela e coloque o preço, mas
deixe um aviso para adicionar no registro dele."**

O preço existe: a zona do destino está em `freight_region_cities` e a célula `(zona, classe)` está em
`freight_region_driver_rates`. O que falta é a linha de cobertura na ficha do motorista
(`fleet_driver_regions`) — e ela não muda quanto a transportadora paga por aquela rota, só diz que
aquele motorista roda ali.

## Regras

1. **Zona existe, motorista não a cobre, a tabela tem preço para `(zona, classe)`** → a parcela usa
   esse preço, com `source: 'estimated'` e a lacuna-aviso `DRIVER_ZONE_PRICED_FROM_TABLE`, cujo
   `detail` é o mesmo da 123 (`3.000 (CAJURU) · vuc`, e o nome do motorista quando há mais de um).
2. **A tabela também não tem preço** para aquela zona/classe → continua ausente, com a lacuna da 123
   (`DRIVER_ZONE_NOT_COVERED`, que já nomeia a zona). Nada é inventado.
3. **A lacuna-aviso não torna a conta incompleta.** `DRIVER_ZONE_PRICED_FROM_TABLE` entra em
   `ADVISORY_GAPS`, e `hasGaps` a ignora: o total conta o valor, e a marca de estimado diz que ele é
   projeção. A tela imprime o valor **e** o aviso na mesma linha.
4. **Vale na viagem, na prévia da montagem e na proposta de roteiro** — as três passam por
   `resolveCrew` e `buildValuationFromContext`; nenhuma segunda implementação.
5. **O cadastro vence sempre.** Quando alguém acrescenta a zona na ficha do motorista, o mesmo preço
   passa a sair `measured`, sem aviso — a regra do pedágio (spec 090 T9): o afirmado vence o
   projetado.

## Decisões

### D1 — O preço é o mesmo, a origem não

Coberta ou não, a célula `(zona, classe)` é a mesma, e o preço dela é o que a transportadora paga
pela rota. O que muda é quem afirmou que aquele motorista roda ali: sem a linha de cobertura, é o
cálculo que está supondo. Por isso `estimated`, e não `measured`.

### D2 — É aviso, e não lacuna, porque o número está completo

`TOLL_PARTIAL` também tem valor e lacuna ao mesmo tempo, mas lá o total **subestima** (praça sem
tarifa fica de fora) — é incompleto de verdade. Aqui o total não subestima nada: ele usa o preço
que a própria tabela dá. Marcar a conta como incompleta mandaria o operador procurar um buraco que
não existe; o que ele precisa é da ação ("acrescente a zona na ficha"), e ela está no aviso.

⚠️ Consequência no congelamento (`freeze-trip-financial-result`): a parcela congela `estimated`,
com a lacuna-aviso na nota — a mesma coisa que já acontece com o combustível, que é sempre projeção.
Não bloqueia o fechamento, e não se apresenta como medido.

### D3 — Com mais de um condutor, vence quem falta

Ausente vence estimado, que vence medido — a mesma ordem da receita (061 D1). Dois agregados, um
coberto e outro não: a soma conta os dois, a origem é `estimated`, e o detalhe nomeia **o que não
cobre**. Um sem preço nenhum: a parcela inteira fica ausente, como sempre.

### D4 — Assalariado junto: o aviso vence

Uma parcela só tem uma lacuna. Entre "há motorista da casa" (`SALARIED_CREW_MEMBER`) e "acrescente
a zona na ficha", a segunda é acionável; a primeira é informação que a visão do período já trata.

## Ordem de deploy

**API primeiro** é o recomendado, mas qualquer ordem funciona: a lacuna nova chega como texto e o
`t()` cai no `defaultValue`; o frontend novo continua imprimindo `gap` + `detail` como antes. O
frontend antigo contra a API nova imprime o aviso **no lugar** do número (ele esconde o valor de
toda linha com lacuna), sem quebrar. Nenhum guard por lista fechada nesse caminho.

## Medições

Ver `evidence.md` (base local desta instalação, 2026-09-10, viagens com tripulação).
