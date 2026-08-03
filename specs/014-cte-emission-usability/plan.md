# Plano — Feature 014

Nenhuma tabela nova, nenhuma migration. A feature corrige um contrato de serialização, o
posicionamento de um diálogo e o momento em que o bloqueio de uma nota é comunicado.

## Diagnóstico que originou o plano

Tudo abaixo foi medido em 2026-07-29 contra o `make dev` no ar, não inferido.

**Cadeia do decimal de taxa**

| etapa                                 | `icmsRate`   |
| ------------------------------------- | ------------ |
| Postgres `numeric(9,6)`               | `0.000000`   |
| `bun:sql` cru                         | `"0.000000"` |
| `drizzle-orm/bun-sql` com `numeric()` | `"0"`        |
| corpo de `GET /cte-emission-profiles` | `"0"`        |
| guard `RATE_PATTERN` do frontend      | rejeita      |

O desvio nasce no Drizzle, não no banco nem no Postgres. `freightRule.percentage` chega íntegro
(`"0.045000"`) porque vem do snapshot em `freight_rule_versions`, não de uma coluna `numeric`
lida pelo Drizzle — é a prova de que o problema é da leitura, não do dado.

**Containing block do diálogo**

`.cteEmissionOverlay` é `position: fixed`. `DIV.application-page-transition` tem
`transform: matrix(1,0,0,1,0,0)` — transform diferente de `none` cria containing block para
descendentes fixos. Medição em 1440×900, `scrollY: 0`: overlay `top: 182 / height: 2331.58`,
diálogo em `y ≈ 1197`.

## Camada de infraestrutura da API

`src/cte-profiles/infrastructure/cte-emission-profile.mapper.ts` passa a normalizar toda grandeza
decimal lida do banco para a escala fixa do contrato antes de entregar ao domínio: taxa com 6
casas, dinheiro com 4. A normalização é de string para string, com `Decimal`/`numeric` — nunca
`Number`, nunca `toFixed` sobre float binário.

O mesmo tratamento vale para `cte-emission-profile.mapper.ts:mapComponent` (`amount`, `rate`), que
hoje só não falha porque `cte_emission_profile_components` está vazia na base local.

`RATE_DECIMAL` e `MONEY_DECIMAL` em
`src/cte-profiles/presentation/cte-emission-profile-request.schema.ts` passam a exigir a escala
fixa também na entrada, para que ida e volta descrevam a mesma coisa. É um aperto do contrato:
precisa de teste de contrato provando que a forma antiga é recusada com 400 e a nova aceita.

## Camada de apresentação da API

`GET /nfe-documents` (listagem do workspace) passa a devolver, por documento, se ele está
bloqueado para emissão de CT-e e o motivo — a mesma informação que o preview já calcula, só que
antecipada. A regra vive no domínio e é compartilhada com o preview; não há segunda implementação.
Mudança de query ⇒ teste de tenant-safety obrigatório.

## Frontend

| arquivo                                                            | mudança                                                                                       |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `modules/nfe-workspace/components/CteEmissionDialog.component.tsx` | `createPortal` para `document.body`, `aria-modal`, focus trap, Escape no diálogo, scroll lock |
| `modules/nfe-workspace/components/NfeDocumentTable.component.tsx`  | coluna/indicador de bloqueio, linha bloqueada não selecionável, contagem na barra de seleção  |
| `modules/nfe-workspace/hooks/useCteEmissionDialog.hook.ts`         | expõe o perfil aplicado e o caminho para a tela de perfis                                     |
| `modules/cte-profiles/shared/cteProfilesGuards.validation.ts`      | permanece estrito — quem se ajusta é a API                                                    |

O guard do frontend **não** é afrouxado. Afrouxar esconderia o desvio de escala em vez de corrigi-lo,
e escala é a diferença entre 4,5% e 45%.

## Ordem de entrega

A Fase A é pré-requisito de tudo: enquanto a listagem de perfis erra, não há como verificar
visualmente nem o seletor nem a tela de administração. As fases B, C e D são independentes entre si.
A Fase E está bloqueada por clarificação e não é implementada nesta rodada.
