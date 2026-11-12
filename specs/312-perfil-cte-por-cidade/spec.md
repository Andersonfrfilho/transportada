# Spec 312 — Perfil de emissão CT-e por lista de cidades de destino

## Problema

Um contratante pode ter percentuais de frete diferentes por região (UNICA: 5% na região de Ribeirão Preto, 6% na de
São José do Rio Preto). O perfil de emissão casa só por CNPJ e aponta para uma única regra de frete, então não há como
separar as regiões sem mexer em perfil de outro contratante.

## Decisão

O perfil CT-e ganha `destinationCities` (coluna `text[]`, chaves `CIDADE|UF` sem acento e em maiúsculas).

- `null` ou ausente: o perfil vale para qualquer cidade (comportamento de hoje; nenhum perfil existente muda).
- Lista: o perfil só casa se a cidade do destinatário da nota estiver na lista. Cidade desconhecida não casa.
- Sem perfil que cubra a cidade: a nota fica bloqueada com o motivo `city_not_covered` (erro
  `CTE_PROFILE_CITY_NOT_COVERED`), em vez de emitir com a regra errada.
- A precedência continua a mesma (CNPJ completo antes da raiz, papel do remetente antes do destinatário, menor prioridade
  vence, empate é ambíguo); a cidade só filtra candidatos.

## Tela

O formulário do perfil tem o campo "Cidades de destino", uma por linha no formato `Cidade/UF`, com contagem e aviso de
linhas ilegíveis. Vazio = qualquer cidade. A API serve `destinationCities` como `[{ city, state }]` ou `null`; a tela
tolera a API antiga (chave ausente vira `null`).

## Fora do escopo

Perfil NFS-e por cidade; mudança no perfil da SPANI (proibida).

## Cadastro da UNICA

Dois perfis CT-e para o CNPJ 26344834000108, cada um com a própria regra de frete (5% e 6%) e a lista de cidades da
planilha CIDADES-AFR (93 cidades RP, 142 SJRP). Cadastro por tela ou pelo script de operação, que simula antes e só grava
com confirmação.

## Adendo — o mesmo CNPJ em dois perfis (achado ao cadastrar a UNICA em staging, 09/11/2026)

A tabela de matchers tinha `unique (company_id, tax_id, match_role)`, então o CNPJ da UNICA não podia estar nos dois
perfis regionais. A unicidade sai (migration `20261109163000_cte_profile_matcher_per_city`, rollback recusa se já
houver repetição). Em troca, `replaceMatchers` recusa (`409 CTE_PROFILE_MATCHER_CONFLICT`) o mesmo CNPJ e papel em outro
perfil não inativo, **a menos que os dois tenham lista de cidades e as listas não se cruzem** (`canShareMatcher`).
Sem lista de um dos lados o comportamento é o de antes: não dá para repetir o CNPJ.
