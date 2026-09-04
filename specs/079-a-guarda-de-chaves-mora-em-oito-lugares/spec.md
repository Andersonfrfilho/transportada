# Feature 079 — A guarda de chaves mora em oito lugares

## Problema e resultado

`hasExactKeys` é a função que decide se um corpo de resposta tem exatamente as chaves esperadas.
Ela é a última linha antes de a API vazar token, identidade de tenant ou XML fiscal para dentro do
cliente — a spec 078 mediu isso, quando tentou afrouxá-la e catorze testes reprovaram, entre eles
`recusa um resumo de credencial que traga o token de volta`.

**Ela está escrita oito vezes.** Medido em 2026-09-02:

| assinatura                                          | onde                                    | quantas |
| --------------------------------------------------- | --------------------------------------- | ------- |
| `({ keys, value }) => boolean`                      | `company-settings/shared/`              | **5**   |
| `(value, keys) => value is Record<string, unknown>` | `nfse-invoice`, `mdfe-manifest`, `trip` | **3**   |

Doze arquivos a usam; oito a declaram. E as duas formas **não são a mesma função**: a posicional é
_type predicate_ — ela estreita o tipo —, e a de objeto devolve `boolean` e por isso exige que o
chamador já tenha feito `isRecord` antes.

O risco não é estético. Uma regra de segurança escrita oito vezes é uma regra que **muda em sete
lugares e fica para trás no oitavo** — e o oitavo é o que vaza, calado, no dia em que alguém
"melhorar" a validação de um módulo só. A spec 078 chegou a mexer em quatro delas antes de reverter;
foi a diferença de assinatura que fez a mudança falhar em partes, e isso é o ensaio do defeito.

Ao fim desta feature a guarda mora num lugar só, com uma assinatura só, e um contrato impede a nona
cópia de nascer.

## Fora do escopo

- **Mudar a semântica.** A guarda continua recusando chave a mais: a spec 078 já pesou e decidiu.
  Esta feature é extração — se ela mudar comportamento, virou outra coisa.
- **`hasOnlyKeys` / `hasEveryKey` / `isRecord`** onde já são compartilhados dentro de um módulo.
  Move-se o que está duplicado **entre** módulos.
- **As três apps de cliente.** ⚠️ `frontend-client` e `frontend-landing` têm as próprias validações,
  por decisão da ADR-0050 (bundles separados). Unificá-las **entre apps** seria criar acoplamento
  que aquela ADR removeu de propósito — e o `frontend-client` existe justamente para não compartilhar
  código com o painel. Ver D2.

## Histórias priorizadas

### P1 — A regra tem um lugar

**Given** um módulo que valida corpo de resposta
**When** ele precisa conferir as chaves
**Then** ele importa a guarda compartilhada, e não escreve a sua.

### P2 — A nona cópia não nasce

**Given** alguém escrevendo validação nova
**When** declara a própria `hasExactKeys`
**Then** o contrato reprova, nomeando o arquivo.

### P3 — O comportamento não muda

**Given** a suíte inteira antes da extração
**When** a extração termina
**Then** os mesmos testes passam, sem nenhum alterado para acomodá-la.

## Requisitos funcionais

- **RF1** — Uma guarda, em `modules/shared/`, com a assinatura de **type predicate** — ela subsume a
  de `boolean`, e o caminho contrário obrigaria todo chamador a repetir `isRecord`.
- **RF2** — `hasKeys` (permitidas × obrigatórias, da spec 078) mora junto: é a mesma família, e
  separá-las convidaria a próxima cópia.
- **RF3** — Contrato por varredura de fonte reprovando declaração nova (P2).
- **RF4** — Nenhum teste existente alterado para a extração passar (P3). Teste que precise mudar é
  sinal de que a semântica mudou.

## Requisitos não funcionais

- **RNF1** — A suíte inteira verde a cada arquivo trocado, não só no fim: oito trocas de uma vez é o
  mesmo defeito oito vezes se algo escapar.

## Casos extremos e falhas

- **Chamador que já estreitou o tipo** — os cinco de `company-settings` chamam depois de `isRecord`.
  Com o predicate, o `isRecord` deles vira redundante, e removê-lo é opcional: esta spec **não**
  reescreve validação, só troca a guarda.
- **Módulo que exporta a sua** — `trip`, `mdfe-manifest` e `nfse-invoice` exportam para outros
  arquivos do mesmo módulo. O reexport pode ficar, apontando para a compartilhada.

## Critérios de aceite

- **CA1** — Uma declaração no repositório, em `modules/shared/`. (P1/RF1)
- **CA2** — Contrato reprova declaração nova, nomeando o arquivo. (P2/RF3)
- **CA3** — Suíte verde **sem nenhum teste existente alterado**. (P3/RF4)
- **CA4** — `hasKeys` mora junto. (RF2)

## Decisões

- **D1 — A assinatura que fica é a de _type predicate_.**
  Ela subsume a de `boolean`: quem só quer o booleano ignora o estreitamento, mas quem tem o
  booleano precisa repetir `isRecord` para estreitar. Cinco chamadores hoje fazem exatamente isso.

- **D2 — ⚠️ A unificação para dentro do painel, nunca entre apps.**
  `frontend-client` tem as próprias validações porque a ADR-0050 §1 separou os bundles **de
  propósito**: servir o painel a um usuário externo seria depender de que toda condicional de
  permissão esteja certa para sempre. Um módulo compartilhado entre as duas apps reabriria essa
  porta pela dependência. A duplicação **entre apps** é decisão registrada; a duplicação **dentro do
  painel** é a que esta spec resolve.

- **D3 — A extração é a spec inteira; a semântica não se toca.**
  Foi a spec 078 que decidiu manter a rigidez, e ela já pagou o custo dessa decisão. Misturar
  extração com ajuste de comportamento produziria uma mudança em que ninguém consegue dizer qual
  metade quebrou.

## Dúvidas

Nenhuma bloqueante.
