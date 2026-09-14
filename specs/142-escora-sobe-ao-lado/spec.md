# Spec 142 — A escora sobe ao lado da caixa escorada

> 🤖 Modelo: `opus` 🧠 (regra física da escora e estrutura da pilha por célula) · `sonnet` (contratos,
> docs, medição)

## Problema

Defeito de física em produção, achado na spec 139 (`specs/139-carga-mista-toda-medida/evidence.md` §2).
A escora (`bracedToward`, em `cargo-placement.policy.ts`) lia só o **topo** de cada ponto do baú. Com
80% da base apoiada (spec 135) uma caixa pode balançar sobre vão, e esse topo passa a ser a face de cima
de um balanço que pode **começar acima** da caixa escorada — prateleira sobre vão, não parede.

Medido em `ccc09130`: **29 de 144** cargas mistas do banco da spec 139 com caixa sem apoio no juiz da
descarga; na proposta real toda medida, **5** caixas no Atego e **1** no Accelo. Rastreado na entrega 54
do Atego real: a escora começava 21 cm acima do topo da escorada.

## Decisão

- **D1 — A vizinha escora só se sobe ao lado da candidata**, a mesma regra do juiz: vale a caixa mais
  alta da célula que **começa abaixo do topo da candidata** menos `MIN_BRACE_CONTACT_M` (1 cm).
- **D2 — Cada célula guarda a pilha inteira**, de cima para baixo, numa lista persistente
  (`stackHeadOf` + nós): partir a célula copia o número do nó do topo e as duas metades dividem a
  cauda. Toda caixa pousa acima de tudo o que já está na pegada, então a pilha só cresce pelo topo e a
  busca anda da cabeça para baixo até o primeiro nó que começa abaixo do limite — em geral um passo.
- **Recusada — altura maciça desde o piso** (a versão de `7a3c6c42`): recusa a caixa que sobe ao lado
  mas pousa em balanço, e custava 89 caixas no Atego real, 60 no Atego da fixture e 162 no sintético,
  sem ganho de física.

## Fora do escopo

Busca, orientação, genético, desempenho — spec 143. A interface pública (`resolveCargoPlacement`,
`resolveCargoLayout`) não muda.

## Critério de aceite

- Contrato `brace-rises-alongside.contract.ts` (Daily e Atego a 50%, 6 tamanhos, semente 1): toda caixa
  de pé em cada passo da descarga — vermelho em `b50a3952`, verde depois.
- As quatro viagens reais (presumida 368 × 259 × 214) e o Atego da fixture antiga sem piora.
- O custo que sobrar é medido, explicado e reescrito no contrato com a razão.
