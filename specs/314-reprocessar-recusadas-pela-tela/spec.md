# Feature 314 — Reprocessar pela tela as notas recusadas

## Problema e resultado

Em 10/11/2026 as 46 notas da UNICA ficaram recusadas (`NFE_IMPORT_UNRELATED_CNPJ`) até a regra do emitente contratante ir
à produção (#626). Depois disso, a única forma de refazê-las foi um script rodado por SSH no worker (`tmp/ops/producao-reprocessa-recusadas.sh`),
porque a rota de reprocesso (`POST /v1/nfe-imports/:id/reprocess`) só refaz item `failed`. O operador não pode depender
de quem tem acesso ao servidor para corrigir uma recusa que a regra nova já aceitaria.

Resultado: na fila de importações de NF-e, a importação com nota recusada por um motivo **que pode ter mudado** ganha o botão
"Reprocessar", que mostra quantas notas serão refeitas e só grava depois da confirmação do operador.

## Fora do escopo

- Reprocessar recusa que nenhuma configuração muda (XML inválido, modelo que não é NF-e, ambiente fiscal diferente).
- Reprocessar em lote várias importações de uma vez (o script cobre esse caso de operação; a tela é por importação).
- Mudar a regra de quem é "relacionado à empresa" (specs 311–313 já decidiram).
- Reprocessar recibo de e-mail recusado antes de virar importação (`sender_not_allowed`, `sender_not_authenticated`).

## Histórias priorizadas

### P1 — Reprocessar importação com notas recusadas

**Given** uma importação com itens `rejected` por `NFE_IMPORT_UNRELATED_CNPJ` **When** o operador com `invoices.import` abre a fila de importações
**Then** vê "Reprocessar" naquela importação, e ao clicar vê "N notas serão refeitas" com Confirmar e Cancelar; só Confirmar grava.

### P1 — A nota que já foi importada não vira duplicada

**Given** uma importação com itens `imported`, `duplicated` e `rejected` **When** o operador reprocessa **Then** só os itens `rejected`
elegíveis são refeitos; os já importados ficam como estão.

### P2 — O resultado aparece sem recarregar

**Given** o reprocesso confirmado **When** o worker termina **Then** a fila mostra os novos contadores (importadas, duplicadas, recusadas) e o histórico da tentativa anterior segue visível.

## Requisitos funcionais

- RF1: a rota de reprocesso aceita item `rejected` cujo `error.code` esteja na lista fechada de **recusas reprocessáveis** (hoje só `NFE_IMPORT_UNRELATED_CNPJ`), além de `failed`.
- RF2: cada item refeito vira uma nova tentativa (`attempt + 1`, `previousItemId`, `previousAttempt`), como NFI-015; XML original, chave e histórico anterior não mudam.
- RF3: a API tem uma consulta que só conta (simulação) e devolve quantas notas seriam refeitas, por motivo, sem gravar nada; a tela usa essa contagem na confirmação.
- RF4: a permissão é `invoices.import`, a mesma do reprocesso atual; `companyId` vem do contexto autenticado.
- RF5: importação em `pending`, `queued` ou `processing` não pode ser reprocessada (`409`), para não haver duas tentativas ao mesmo tempo.
- RF6: a lista de recusas reprocessáveis fica em uma constante única, lida pela API e devolvida na consulta; a tela não reimplementa a regra.
- RF7: o botão segue o design system (`shadcn/ui`), com texto em `.locale.json`; sem estilo paralelo.

## Requisitos não funcionais

- Idempotência: duas confirmações seguidas geram uma só tentativa (a segunda recebe `409`).
- Auditoria: o evento `transportada.nfe.import.requested` é publicado pelo outbox com o ator e o `correlationId` da importação.
- Nenhum dado de chave de acesso ou XML nos logs.

## Casos extremos e falhas

- Importação com recusas de motivos misturados: refaz só as reprocessáveis e informa quantas ficaram de fora e por quê.
- Importação sem nenhum item reprocessável: o botão não aparece.
- Reprocesso de nota que continua recusada: volta a `rejected` com o novo motivo na nova tentativa.
- Falha ao publicar o evento: a transação desfaz a tentativa (outbox na mesma transação).

## Critérios de aceite

- Contrato da API: item `rejected` reprocessável gera tentativa e evento; não reprocessável, `409`; simulação não grava.
- Contrato do painel: botão só aparece com item elegível; confirmação mostra a contagem da API.
- Integração com banco: duas confirmações seguidas deixam uma tentativa só.
- Em staging: reprocessar uma importação de teste com `NFE_IMPORT_UNRELATED_CNPJ` leva as notas a `imported`.

## Dúvidas

- Mesma permissão `invoices.import` ou uma própria para reprocessar recusa? Padrão: a mesma. Troca se o dono quiser separar.
- Publicar só em staging primeiro, como pedido: confirmado pelo padrão do projeto; main depende de aprovação.
