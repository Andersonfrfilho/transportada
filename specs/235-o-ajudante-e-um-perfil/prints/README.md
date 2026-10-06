# Spec 235 — T12: prints para aprovação (rodada 2, contra o código corrigido)

Refeitos em 2026-10-02 do worktree `busy-jang-2057c9` (branch `work/spec-234-ajudante`, HEAD `bcac3e912`,
já com as correções A1, A2, A4 e A5). O painel rodou no Vite da própria app (`localhost:53010`,
`VITE_SMOKE_AUTH_BYPASS=true`), contra uma API **de mock** com dados sintéticos e nomes fictícios.
Nenhuma API, Keycloak ou banco real foi usado.

Cada tela tem quatro arquivos: `375` (celular, `deviceScaleFactor` 2) e `1280` (desktop), cada um em
`escuro` e `claro`. O nome segue `NN-descricao-largura-tema.png`. Total: 13 telas, 52 PNGs.

**Como foram capturados.** Chromium headless (Playwright da própria app) no tamanho real, com service
worker bloqueado, contra o Vite do worktree (`./node_modules/.bin/vite`, nunca `bunx vite`) e o mock.
O host precisa ser `localhost` (não `127.0.0.1`) e o Vite precisa de `VITE_APP_URL` e `VITE_KEYCLOAK_*`
no ambiente, senão a app lança `IDENTITY_CONFIGURATION_MISSING_VITE_APP_URL` e fica em branco. Os
scripts e os relatórios completos das medidas ficam no scratchpad da sessão, fora do repositório.

## Lista

| Nº  | Arquivos                                 | O que prova                                                                                                                                                                                                                                                                |
| --- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | `01-frota-lista-motoristas-*`            | Frota › Motoristas: selo **AJUDANTE** só no ajudante puro (Bruno), coluna CNH com "—" e nota "Sem nota". O motorista que também ajuda (Marcos) não leva selo. A 375 px a tabela rola dentro do cartão.                                                                     |
| 02  | `02-novo-motorista-perfil-motorista-*`   | Ficha nova com perfil **Motorista**: CNH visível, "Pode atuar como ajudante" ligado e editável, e as **duas** diárias ("Diária (R$/dia)" e "Diária própria (R$/dia)"). Opções do seletor: Agregado, Motorista, Ajudante. A 1280 os campos monetários cabem na coluna (A1). |
| 03  | `03-novo-motorista-perfil-ajudante-*`    | Ficha nova com perfil **Ajudante**: CNH some, o interruptor fica ligado e travado com a dica "O perfil Ajudante sempre atua como ajudante e não precisa de CNH." e aparece **só** "Diária própria (R$/dia)" — sem "Diária (R$/dia)" (A2).                                  |
| 04  | `04-editar-ajudante-puro-*`              | Edição do ajudante puro (Bruno): sem CNH, interruptor travado, **só** a diária própria (A2), valor 150,00.                                                                                                                                                                 |
| 05  | `05-editar-motorista-que-ajuda-*`        | Edição do motorista que ajuda (Marcos): CNH E, interruptor editável, **as duas** diárias (a de motorista e a própria 180,00), alinhadas na coluna (A1).                                                                                                                    |
| 06  | `06-acesso-tabela-usuarios-*`            | Acesso: papel Ajudante na tabela. Com ficha, vira link com título **"Ficha de frota"** (Bruno, A5); Motorista e Agregado seguem com "Ficha do motorista". Sem ficha, aparece só o selo AJUDANTE (Eduardo).                                                                 |
| 07  | `07-acesso-convite-papel-ajudante-*`     | Diálogo de convite com "Ajudante" entre os papéis e a dica do CPF: "Com papel de Motorista, Agregado ou Ajudante, é por ele que a ficha de frota é encontrada."                                                                                                            |
| 08  | `08-acesso-convite-aviso-sem-ficha-*`    | Aviso depois de convidar um ajudante cujo CPF não tem ficha: "Convite enviado, mas nenhuma ficha de frota com este CPF foi encontrada…". O mock devolve `fleetLink: no-driver-record`.                                                                                     |
| 09  | `09-acesso-editar-papeis-409-*`          | Edição de papéis do ajudante puro (tira Ajudante, marca Operação): a mensagem do `409 FLEET_DRIVER_PROFILE_EMPTY` aparece **logo abaixo do grupo Papéis**, antes do bloco Senha (A4).                                                                                      |
| 10  | `10-viagem-nova-seletor-motoristas-*`    | Nova viagem: o seletor de motoristas lista Carlos e Marcos e **não** lista Bruno (ajudante puro).                                                                                                                                                                          |
| 11  | `11-viagem-nova-seletor-ajudantes-*`     | Nova viagem: o seletor de ajudantes lista Marcos (motorista que ajuda) e Bruno (ajudante puro). Carlos fica de fora.                                                                                                                                                       |
| 12  | `12-viagem-nova-sem-ajudantes-*`         | Mock sem ajudantes ativos: "Nenhum ajudante ativo. Cadastre um em Frota › Motoristas ou dê o papel Ajudante em Acesso."                                                                                                                                                    |
| 13  | `13-viagem-troca-tripulacao-ajudantes-*` | Troca de tripulação: motoristas = Carlos e Marcos, ajudantes = Marcos e Bruno. O print mostra a lista de ajudantes aberta.                                                                                                                                                 |

## Medição do A1 (campo monetário dentro da coluna)

Medido por `getBoundingClientRect()` no navegador, tema escuro, nas telas 02 a 05. "Coluna" é o
`<label>` do campo (item da grade). O rótulo "Diária própria (R$/dia)(opcional)" é o primeiro `<span>`
do label, com o `(opcional)` em `<em>`.

| Largura | Antes (rodada 1)                                                                                              | Depois (rodada 2)                                                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1280    | Tela 02 e 03: caixa de "Diária (R$/dia)" com `right=1240` contra limite 1233 do fieldset (7 px de vazamento). | **Nenhum campo passa da coluna** nas 4 telas: `right` da caixa == `right` da coluna (1022 ou 1216, conforme a fileira da grade) e <= 1233 do fieldset. Lista de campos vazando: vazia. |
| 375     | Sem vazamento.                                                                                                | Sem vazamento: caixa e coluna em `right=319`, fieldset em 336.                                                                                                                         |

Rótulo e colagem à caixa, nas 4 telas e nas duas larguras:

- **Texto do rótulo não cortado:** `scrollWidth == clientWidth` (182 a 1280, 263 a 375), `text-overflow: clip`
  e `overflow-x: visible` sem corte efetivo; o `(opcional)` termina antes da borda da coluna (a 1280:
  1171,7 < 1216; a 375: 252,6 < 319).
- **Rótulo colado à caixa:** distância vertical rótulo → caixa de **4 px** em todos os campos
  monetários e também em Nome, CNH, Nome do pai e Nome da mãe. Os campos monetários não se destacam
  mais dos vizinhos (antes, o bloco do interruptor esticava o trilho do rótulo e separava o rótulo
  da caixa).

## Conferências por texto e medida (todas as 52 capturas)

- **Overflow horizontal a 375 px:** `scrollWidth == innerWidth` (375) em todas as telas. A 1280, 1280.
- **Console:** sem erro em 12 das 13 telas. Na 09 aparecem o 409 esperado e **um `pageerror`
  `FLEET_DRIVER_PROFILE_EMPTY`** (rejeição de promise não tratada, achado A3, **não corrigido de propósito**).
- **Alvo de toque a 375 px:** "Pode atuar como ajudante" mede 263×44 e o seletor "Perfil de acesso"
  263×48. O checkbox "Ajudante" do convite mede 335×44. A 1280 o checkbox da ficha tem 38 px e o do
  convite 24 px, aceitável para ponteiro fino.
- **Rótulo acessível:** o checkbox se chama "Pode atuar como ajudante" pelo `<label>`. No perfil
  Ajudante ele fica `checked` + `disabled`. A mensagem do 409 tem `role="alert"`.
- **Foco visível:** chegando por Tab, o checkbox casa `:focus-visible` com outline sólido de 2 px no
  cobre do tema, nos dois temas.
- **Contraste do selo "Ajudante":** 12,92:1 no escuro (fonte de 11,5 px). Passa AA e AAA.
- **Posição da mensagem do 409 (A4):** a 375 px o último papel (Ajudante) termina em y=1236, a
  mensagem começa em 1296 e o título "Senha" em 1433. A 1280: 815, 859 e 958.

## Situação dos achados

| ID  | Situação                              | Nota                                                                                                                                                                                                    |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | **Corrigido e verificado**            | Medição acima. Commit `17995731e`.                                                                                                                                                                      |
| A2  | **Corrigido e verificado**            | Telas 03 e 04 mostram só "Diária própria"; a 05 (motorista que ajuda) mostra as duas; a 02 (motorista) também. Commit `f6269a2a0`.                                                                      |
| A3  | Pendente, **fora desta spec**         | `pageerror` `FLEET_DRIVER_PROFILE_EMPTY` na tela 09: `UserAdministration.page.tsx:229` (`void screen.submitEdit()`) + `useUserAdministration.hook.ts:122` (e `:99` no convite). Padrão anterior à spec. |
| A4  | **Corrigido e verificado**            | Tela 09: mensagem logo abaixo do grupo Papéis, antes de Senha. Commit `5d9515503`.                                                                                                                      |
| A5  | **Corrigido e verificado**            | Tela 06: título "Ficha de frota" só no papel Ajudante; Motorista e Agregado ficam com "Ficha do motorista". Commit `870e4a5ee`.                                                                         |
| A6  | Pendente, **fora desta spec**         | Consistência na tabela de Acesso: papel com ficha é link em caixa normal ("Ajudante"), sem ficha é selo em maiúsculas ("AJUDANTE"). Já era assim para Motorista e Agregado.                             |
| A7  | Pendente, **fora desta spec**         | Com perfil Ajudante a seção continua chamada "Identificação do motorista" e "Endereço da empresa do agregado" continua visível; dicas acumuladas no fim da seção. Anterior à spec.                      |
| A8  | Pendente (observação)                 | O seletor de ajudantes mostra só o nome; o de motoristas mostra a nota. Não é defeito.                                                                                                                  |
| A9  | Pendente (observação, efeito do mock) | Na tela 13 o chip do motorista atual aparece como UUID porque o motorista da viagem do fixture não está na lista de frota do mock.                                                                      |

## O que não foi fotografado

- O seletor de perfil **na edição**: ele não existe na ficha já criada (o perfil só se escolhe no
  cadastro). Os prints 04 e 05 mostram a edição sem ele, como a tela é.
- O fluxo "Montar roteiro pela busca de notas" (`TripRouteAssemblyDialog`), que também recebe a lista
  de motoristas: está fora da lista da T12.
