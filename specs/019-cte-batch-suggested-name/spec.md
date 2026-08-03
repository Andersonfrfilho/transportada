# Feature 019 — Nome de lote sugerido sem colisão

## Problema e resultado

A feature 018 tornou o conflito de nome honesto: nome repetido responde `409 CTE_BATCH_NAME_TAKEN` e
o modal diz exatamente isso. O que 018 deixou aberto — e registrou como pergunta em `spec.md` — é que
o operador **vai** encontrar esse conflito quase sempre na segunda emissão do dia, porque o nome
sugerido pelo próprio modal se repete.

Hoje `defaultBatchName` (`cteEmission.service.ts:188`) monta
`CT-e <data> (<quantidade de notas selecionadas>)`. Dois lotes de uma nota no mesmo dia recebem a
mesma sugestão, e a única defesa é o `409`. O erro está correto, mas é atrito puro: o operador não fez
nada errado, só aceitou o nome que a tela ofereceu.

O discriminador precisa ser a **sequência do lote no dia**, não a contagem de notas. E quem sabe
quantos lotes já existem naquele dia é a API, não o navegador: o modal não tem — nem deve ter — a
lista de nomes já usados na empresa.

**Resultado esperado:** ao abrir o modal, o nome já vem sugerido como `CT-e <data> #<sequência>`, com
a sequência calculada pela API a partir dos nomes que a empresa já usou naquele dia. O operador
continua livre para reescrever, e reescrever para um nome tomado continua caindo no `409` honesto da 018.

## Decisões tomadas

| Questão                                    | Decisão                               | Consequência                                                                                                                                                                                              |
| ------------------------------------------ | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quem calcula a sugestão                    | A API, no `POST /cte-batches/preview` | Só o servidor enxerga os nomes já usados na empresa. O preview já roda ao abrir o modal e já é escopado por tenant — não entra rota nova nem chamada extra.                                               |
| Formato do nome                            | `CT-e <YYYY-MM-DD> #<sequência>`      | Curto, ordenável e legível na listagem de lotes e na fatura. Cabe folgado no limite de 100 caracteres do `name`.                                                                                          |
| O que a sequência conta                    | O maior `#N` já usado no dia + 1      | Contar linhas quebraria depois de um lote apagado ou renomeado; `max + 1` nunca reaproveita um número que ainda está na tela do operador.                                                                 |
| Fuso da data                               | `America/Sao_Paulo`                   | A data do nome tem que ser a data do operador. `new Date().toISOString().slice(0, 10)` (o que o frontend faz hoje) vira o dia seguinte a partir das 21h em Brasília. O worker já trata fuso fiscal assim. |
| Sobrescrever o que o operador digitou      | Nunca                                 | A sugestão só preenche o campo enquanto ele estiver intocado. Depois do primeiro caractere digitado, nenhuma resposta de preview mexe no nome.                                                            |
| Manter a constraint de unicidade           | Sim                                   | O nome identifica o lote para o operador; dois lotes homônimos na listagem seriam ambíguos. Nenhuma migration nesta feature.                                                                              |
| Garantir unicidade da sugestão             | Não, é palpite                        | Entre o preview e a criação outro operador pode levar o número. A sugestão reduz o atrito; quem garante a unicidade continua sendo a constraint, com o `409` da 018 na frente.                            |
| Comportamento com API antiga (sem o campo) | Frontend cai no nome local de hoje    | O guard de resposta do preview é estrito e rejeita chave desconhecida; a ordem das tasks põe o frontend para aceitar `suggestedName` **antes** de a API emitir, e a ausência do campo não quebra a tela.  |

## Fora do escopo

- Renomear lote depois de criado.
- Mudar a constraint `cte_batches_company_id_name_unique` ou qualquer coisa do banco — **sem
  migration nesta feature**.
- Sugerir nome em outros fluxos (fatura, manifesto, importação).
- Mudar cálculo, projeção, agrupamento, regra de frete ou submissão.
- Rever as mensagens de erro do modal, entregues e verificadas na 018.
- T009 da feature 014 continua bloqueada por `[NEEDS CLARIFICATION]`.

## Histórias priorizadas

### P1 — Emitir o segundo lote do dia sem tropeçar no nome

**Given** que minha empresa já criou hoje o lote `CT-e 2026-07-30 #1`
**When** eu seleciono outras notas e abro "Gerar CT-es"
**Then** o campo de nome já vem preenchido com `CT-e 2026-07-30 #2`, e confirmar cria o lote sem erro
de nome em uso.

### P2 — Continuar dono do nome

**Given** que eu digitei um nome próprio no campo
**When** eu troco o perfil de emissão ou o agrupamento e a projeção é recalculada
**Then** o nome que eu digitei permanece — a sugestão não volta por cima.

### P3 — Sequência que não reaproveita número

**Given** que os lotes `#1`, `#2` e `#3` do dia existem e o `#2` foi apagado
**When** eu abro o modal
**Then** a sugestão é `#4`, nunca `#2`.

## Critérios de aceite

1. `POST /cte-batches/preview` passa a devolver `suggestedName` no envelope, no formato
   `CT-e <YYYY-MM-DD> #<sequência>`, com a data em `America/Sao_Paulo`.
2. A sequência é `maior #N já usado naquele dia na empresa + 1`, e `#1` quando não há nenhum. Nome que
   não casa exatamente com o padrão do dia é ignorado no cálculo.
3. A consulta dos nomes filtra por `companyId`: duas empresas com lotes no mesmo dia recebem
   sequências independentes. Provado em Postgres real.
4. O modal preenche o campo com `suggestedName` assim que a projeção chega, **desde que** o operador
   não tenha digitado nada; depois de digitar, nenhuma resposta de preview altera o campo.
5. Sem `suggestedName` na resposta, o modal continua funcionando com o nome local de hoje — o guard de
   validação do preview não pode rejeitar a resposta por causa disso, nem quebrar quando o campo vem.
6. Nome repetido digitado à mão continua respondendo `409 CTE_BATCH_NAME_TAKEN` com a mensagem da
   018 — esta feature não relaxa nada disso.
7. `make check` verde e verificação ao vivo na stack local mostrando duas emissões seguidas no mesmo
   dia sem conflito, com evidência em `evidence.md`, sem CNPJ, IE, chave de acesso, razão social real
   ou nome de lote de tenant real.
