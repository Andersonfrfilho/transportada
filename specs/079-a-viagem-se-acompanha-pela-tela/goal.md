# Goal — fechar a 079 e o que sobrou da sessão de 02/09/2026

Feche **tudo o que ficou pedido** para a tela de acompanhamento da viagem: as 18 tasks abertas de
`specs/079-a-viagem-se-acompanha-pela-tela/tasks.md`, mais os dois itens que nasceram fora do
arquivo e estão listados no fim deste documento.

Trabalhe **uma task por vez**, na ordem do `tasks.md` (Fase 1 → Fase 2 → Fase 3), com commit
isolado por task. Não abra a próxima antes de a anterior estar verde e com evidência escrita.

## Antes de tocar em qualquer arquivo

1. Crie o próprio worktree — `make worktree NAME=spec-079` — e rode tudo de lá. Nunca do checkout
   principal: outra sessão trabalha nele, e `git add` amplo leva trabalho alheio pela metade.
2. Leia `CLAUDE.md` § "A viagem tem fases" e § "A viagem lista por parada". As duas contêm decisões
   que já custaram retrabalho nesta base.
3. `bun run --cwd apps/<app> test` do app que você vai tocar, **antes** de mudar nada, para saber a
   linha de base.

## As regras que não se negociam nesta feature

- **Teste de contrato antes da implementação**, e provado **por mutação**: quebre a regra, veja
  reprovar, restaure. Contrato que nunca viu o defeito é decoração — e nesta sessão três gates
  "verdes" não mediam nada.
- **Teste novo não roda se não entrar na lista explícita do `package.json` do app.** Já aconteceu:
  arquivo no disco, gate verde, zero execuções.
- O teste do `frontend-transportada` **não tem DOM**. Comportamento se prova em serviço puro
  (`*.service.ts`) e a fiação se prova por **texto de fonte**. Não tente montar componente.
- Gates de toda task: `bun run lint`, `bun run typecheck`, `bun test` e `bun run build` do app
  tocado. `make check` antes de publicar.
- Publicar do worktree: `git fetch && git rebase origin/staging && git push origin HEAD:staging`.
- **Nunca** logar PII, e não dê leitor novo a `birth_date`, `license_number`, telefone ou endereço
  do motorista sem antes conferir a ADR-0039 — ela já decidiu criptografá-los, e o barato da
  decisão é justamente não haver leitor.

## Armadilhas medidas — leia antes de começar, poupam meia sessão cada

- **`TripProgressBar.component.tsx` JÁ EXISTE** e já está em `TripDetail.component.tsx`, com
  segmento por estado. A T011 pede só animação (com `prefers-reduced-motion` desligando) e a
  previsão de término. **Não recrie.** Três tasks desta spec descreveram como "criar" coisas que
  já existiam — confira a existência antes de escrever arquivo novo.
- **Não existe pasta `mutations/` no módulo `trip`**, apesar de tasks antigas sugerirem esse
  caminho. Toda mutação de viagem entra em `useTripWorkspace.hook.ts`. Seguir o nome sugerido
  fragmenta o mesmo padrão em dois lugares.
- **Ícone `<svg>` cru é proibido** fora de `src/components/ui/` — use `@/components/ui/icon`, e
  crie o desenho lá quando faltar. Vale para a T013 (mapa) e a T018 (ícones de CT-e).
- **`geocoding_precision` da parada da sugestão sai `null`** — `applyResolvedCoordinates` grava
  coordenada e não grava precisão. O mapa **não pode** usar esse campo para distinguir rooftop de
  centroide: leia `geocoded_addresses`. E `trip_stops.latitude/longitude/geocoding_precision`
  **nunca são escritos**, apesar de o app do motorista os ler.
- **Parada sem coordenada é nomeada fora do mapa, nunca some** — mesma regra da cidade sem polígono
  na aba Regiões. Mapa visto pela metade é pior que mapa com aviso ao lado.
- **Toda listagem que hoje imprime UUID passa a imprimir o número da nota** (T017). É a mesma
  família do rótulo da parada, que imprimia rua sem número: identificador interno na tela é sempre
  defeito, nunca economia.

## As duas tasks que exigem decisão escrita ANTES de código

Não comece a implementar; escreva a decisão no `tasks.md` e só então codifique.

- **T020 — ocorrência por produto, com tipo.** Hoje a ocorrência é do **motorista**, por parada, e
  **não existe por produto**. Decida por escrito: quais são os tipos (separação × entrega, e quais
  dentro de cada), quem pode registrar (o separador tem `trip.manage`, não `trip.report`), e o que
  a ocorrência faz com o estado da nota — bloqueia, marca, ou só anota. Tipo de ocorrência é
  catálogo: `*.constant.ts` + CHECK no banco + **cópia por valor** no frontend com contrato de
  paridade, como `FUEL_TYPES` e `VEHICLE_TYPES`.
- **T024 — reordenar as paradas na proposta.** Não é o arraste de `TripStopList`, que reordena a
  viagem. Decida: a distância recalcula junto, ou a proposta editada perde a distância? Publicar
  número velho ao lado de ordem nova é mentira barata de cometer.
- **T003 — desenho do veículo com a carga.** Antes de codar, escreva no comentário do componente o
  que a animação comunica **além** da barra. Sem resposta, a animação não entra.

## O que está bloqueado, e por quê — não force

- **P2 (contato do destinatário)** e a **T022** dependem de uma ADR: telefone vindo de XML fiscal
  usado para contato é finalidade nova sob a LGPD.
- **P3 (rastro do motorista)** e a **T026** (coordenada por estado) dependem da feature de
  consentimento. A T026 tem um agravante: o rastro da viagem se apaga no fechamento
  (`purgeByTrip`, ADR-0050 §5) e este **não se apagaria** — é rastro do trabalhador mais duradouro
  que o que ele consentiu. Exige decisão de retenção registrada.

Se alcançar uma delas, pare e diga — não improvise a ADR.

## Fora do `tasks.md`, e também pedidos

1. **Polling com timer e botão de atualização rápida** no detalhe da viagem, quando houver entrega
   pendente. Só agora faz sentido: até 02/09 a rota de entregar não mexia em `separation_status`,
   então não havia estado novo para buscar. O botão é explícito, ao lado do automático — quem está
   no galpão não espera o timer. Cadência e critério de "há o que buscar" saem de serviço puro,
   com contrato; a tela só consome.
2. **A cadeia órfã de `deliverDocument`** (`repository.deliverDocument` → `useCase.deliverDocument`
   → porta) ficou sem chamador quando a rota passou para a máquina de estados. Ela é a escrita que
   gravava `delivered_at` sem tocar em `separation_status` — a arma que causou o defeito. Remover
   exige reescrever um teste de integração que a usa como escrita de apoio para provar isolamento
   de tenant: **preserve essa cobertura**, ou não remova.

## Fechamento

A spec só fecha com `evidence.md` escrito: o que entrou, o que ficou de fora, e **por quê**. Task
que você decidir não fazer sai nomeada no arquivo, com a razão — encolher escopo em silêncio é o
único desfecho inaceitável.
