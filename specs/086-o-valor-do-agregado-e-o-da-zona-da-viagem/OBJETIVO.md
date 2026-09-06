# Objetivo — implementar a 086 inteira

> Criado em 2026-09-05. Este arquivo é o plano de execução da spec 086 de ponta a ponta.
> `tasks.md` diz **o que** fazer; aqui fica **a ordem, a razão dela e quando parar**.

## O que está sendo consertado

A parcela `driver` da prévia de viagem já mostra o custo do agregado — o encanamento existe ponta a
ponta. **O que ela não faz é escolher a zona certa.** `readCrew`/`readPreviewCrew` juntam a cobertura
do motorista sem nenhum filtro pelo destino, e `byDriver` fica com a primeira linha que trouxer
valor. Motorista que cobre mais de uma zona recebe preço decidido pela ordem que o Postgres devolveu.

Medido no dado real de staging: em BARRETOS, `truck` vale **1.086,12** na zona `1.000` e **1.508,51**
na `1.003`. 39% de diferença num número que a tela apresenta como medido, sem marca de estimativa, e
que decide se a viagem é montada.

## Regra de conclusão

Vale para toda task, sem exceção:

- **Nada é dado por concluído sem verificação executada.** "Compila" não é "funciona".
- **Teste de contrato antes da implementação.** A T3 e a T5 têm um contrato cada que precisa
  **falhar** contra o código de hoje antes de passar — se ele nasce verde, ele não está medindo o
  defeito, e o defeito continua lá.
- Commit isolado por task, para rollback barato.
- `evidence.md` só depois de a verificação existir, com o que ficou de fora escrito nele.
- **Spec marcada como concluída com buraco silencioso é pior que spec aberta.**

## Preparação, antes da T1

```bash
make worktree NAME=spec-086
```

Duas sessões no mesmo checkout produzem formatação cruzada e commit de uma entrando no push da outra.

O dado de teste **já está em local**: 29 zonas, 83 cidades e 146 preços trazidos de staging em
2026-09-05, com os 6 motoristas locais cobrindo zonas distintas. Não precisa repetir a carga.

⚠️ A extensão `unaccent` foi criada no Postgres local **só para medir**. Ela não faz parte da
solução e não entra em migration — a dobra de acento é TypeScript.

## Ordem, e a razão dela

A ordem **não** é por tamanho: é por dependência de dado, e a primeira task é a que a medição
promoveu.

```
T1 (dobra de acento) ──> T2 (importação sobrevive)
        └──────────────> T3 (política pura) ──> T4 (lacuna) ──> T5 🧠 ──> T6
```

### 1. T1 — a dobra de acento vem primeiro

Sem ela, **metade das viagens cai em lacuna pelo motivo errado**: 39 de 76 destinos casavam com a
tabela, e as 38 que falhavam eram todas grafia (`RIBEIRAO PRETO` contra `Ribeirão Preto`), não
cidade faltando. Construir a escolha de zona antes disso é construir sobre um casamento que erra
metade das vezes — e a lacuna diria "cadastre RIBEIRAO PRETO" com a cidade já cadastrada.

Com a dobra: 65 de 76. As 12 que sobram são ausência de verdade, e são elas que a T4 nomeia.

### 2. T2 — a importação não pode quebrar junto

`normalizeRegionCity` é usada na importação da planilha (spec 038, ADR-0038). A idempotência dela é
contrato: reimportar o mesmo arquivo devolve `{0,0,0}`. Mudar a dobra sem afirmar isso troca um
defeito por outro maior — a tabela de preços é o cadastro do qual tudo aqui depende.

### 3. T3 — a decisão sai para uma política pura

`resolveTripDriverZone` é onde a D1 vira código: **a zona é a do último destino, o mais distante.**
Ela é pura porque é assim que o contrato consegue afirmar o que importa — que **inverter a ordem das
paradas na entrada não muda o resultado**. Esse teste é o coração da spec; ele falha hoje.

### 4. T4 — a lacuna antes da consulta

`CITY_WITHOUT_REGION` precisa existir e ter rótulo **antes** de a T5 começar a produzi-la, senão a
primeira execução real imprime a chave crua na tela do operador.

### 5. T5 🧠 — as consultas param de decidir

> **PARAR e trocar para `opus` antes de começar** (`model-economy.md`). É a única task de arquitetura
> do conjunto: ela tira a decisão de dentro do SQL e mantém uma consulta só, sem N+1 por motorista ou
> por parada.

Aqui mora o defeito. `readCrew` e `readPreviewCrew` passam a trazer o destino junto e a chamar a
política; o bloco `byDriver` que fica com a primeira linha com valor **sai**. A paridade entre as
duas é contrato: divergir faria a prévia prometer um preço e a viagem cobrar outro.

Ao terminar a T5, **voltar para `sonnet`** para a T6.

### 6. T6 — a evidência contra o dado real

Não é formalidade: é a única prova de que a mudança alcançou a operação. O número errado que o
motorista recebia antes tem de estar escrito ali, com o certo ao lado.

## Gates

| momento             | comando                                         |
| ------------------- | ----------------------------------------------- |
| por task (API)      | `bun run --cwd apps/api-transportada test`      |
| por task (frontend) | `bun run --cwd apps/frontend-transportada test` |
| depois da T5        | `make migration-test`                           |
| antes de publicar   | `make check`                                    |

Publicar do worktree:

```bash
git fetch && git rebase origin/staging && git push origin HEAD:staging
```

## O que este objetivo NÃO promete

- **`tractor_unit` não ganha preço.** `resolveVehicleFreightClass` manda `''` de propósito: cavalo
  mecânico não é coluna da planilha do cliente. Se depois da 086 uma viagem com cavalo mecânico
  mostrar número na parcela `driver`, é defeito, não avanço.
- **As 12 cidades ausentes não se cadastram sozinhas.** A spec as **nomeia**; cadastrá-las é trabalho
  de operação, na aba Regiões. A sugestão de município próximo é sugestão, nunca aplicada sozinha.
- **A tabela de preços não muda.** Importação, tela de Regiões e schema ficam como estão.
- **Salário de motorista da casa continua fora da viagem** — é custo do período (ADR-0049 §3).

## Decisão assumida, não perguntada

Na prévia sem roteiro planejado não há ordem de paradas, então "o destino mais distante" não é
calculável. Assumi **a zona mais alta alcançada dentro da família**, que é o que a acumulação de
`coversRegion` já significa; paradas em famílias diferentes sem ordem viram lacuna.

Se a preferência for que a prévia sem roteiro seja sempre lacuna, é uma linha na T3 — e é melhor
decidir isso antes da T3 do que depois da T5.

## Definição de pronto

- [ ] Os seis contratos novos passam, e os dois que medem o defeito falhavam antes
- [ ] `make check` verde
- [ ] `evidence.md` com o preço errado e o certo, medidos no dado de staging
- [ ] Nenhum `[NEEDS CLARIFICATION]` reaberto
- [ ] 086 marcada em `specs/OBJETIVO-PENDENTES.md`
