# Goal — fechar a 080: o detalhe da viagem se lê de uma vez

Feche as **13 tasks** de `specs/080-o-detalhe-da-viagem-se-le-de-uma-vez/tasks.md`, na ordem das
fases. Uma task por vez, commit isolado por task. Não abra a próxima antes de a anterior estar
verde e com evidência escrita.

A ordem não é estética: a Fase 1 destrava o mapa, a linha do percurso e a coordenada que a Fase 4
compara. Começar pela carga porque é mais bonito deixa a tela anunciando mapa que não existe.

## Antes de tocar em qualquer arquivo

1. O worktree **já existe**: `../transportada-wt/spec-080`, branch `work/spec-080`. Trabalhe de lá.
   Nunca do checkout principal — outra sessão trabalha nele.
2. Leia, e não por formalidade:
   - `CLAUDE.md` § "A viagem tem fases" e § "A viagem lista por parada" — decisões que já custaram
     retrabalho.
   - **ADR-0044** (cascata de geocodificação) e a spec **069**. O pipeline **já existe**: BrasilAPI
     pelo CEP como degrau primário, centroide de município como último, cache quente descartável e
     rotina de população com pausa de cortesia. **Não construa geocodificação.**
   - **ADR-0037** — por que nenhum terceiro renderiza dentro da nossa tela, e por que a CSP declara
     `frame-src 'none'`.
   - **ADR-0039** — o telefone do motorista está marcado para criptografia. A T009 pode ser o
     primeiro leitor desses campos; se for, isso vai por escrito na evidência.
3. `bun run --cwd apps/<app> test` do app que você vai tocar, **antes** de mudar nada, para saber a
   linha de base. Nesta base o `staging` já esteve vermelho por trabalho de terceiros duas vezes em
   uma tarde — descobrir isso no seu push custa uma hora.

## As regras que não se negociam nesta feature

- **Teste de contrato antes da implementação**, provado **por mutação**: quebre a regra, veja
  reprovar, restaure. Contrato que nunca viu o defeito é decoração.
- **Teste novo não roda se não entrar na lista explícita do `package.json` do app.**
- O teste do `frontend-transportada` **não tem DOM**: comportamento se prova em serviço puro e a
  fiação se prova por texto de fonte.
- **Medir, não olhar.** Geometria de tela se afirma com `getBoundingClientRect`, não com print. Um
  defeito de altura desta mesma tela passou por três leituras de olho e apareceu na primeira conta.
- Gates de toda task: `bun run lint`, `bun run typecheck`, `bun test` e `bun run build` do app
  tocado. `make check` antes de publicar.
- Publicar do worktree: `git fetch && git rebase origin/staging && git push origin HEAD:staging`.

## O que esta spec decidiu, e não se rediscute no meio do caminho

- **Sem fundo de mapa de terceiro.** Nada de Google (exige cartão, tem cota por SKU e **proíbe
  cache** dos tiles em contrato) e nada de tile público do OSM (a política de uso deles não cobre
  produção). O desenho é nosso; a linha do percurso vem do **OSRM que já roda no projeto**, por
  `/route/v1/driving/...?overview=full&geometries=geojson`. Se um dia faltar nome de rua, a saída
  é PMTiles servido do nosso MinIO — não um terceiro.
- **O navegador nunca fala com o OSRM.** A API busca e devolve a geometria pronta.
- **O pino sai no CEP, não no número.** A BrasilAPI resolve o logradouro; o número exigiria mandar
  o endereço de entrega dos clientes da transportadora para fora, em lote. Para traçar A→B pelas
  ruas, logradouro basta — o OSRM encaixa na via mais próxima.
- **O baú é desenhado por ordem de carregamento, sem posição de peça.** A nota da 079 T003 continua
  valendo: a NF-e não traz dimensão de volume, e sugerir canto é enganar. Se a tela começar a
  parecer instrução de estiva, ela passou do ponto.

## O que exige parar e perguntar — não improvise

- **Precisão no número da porta.** Se a T001 mostrar que o CEP põe o pino longe demais para operar,
  a saída é Photon (dado saindo daqui) ou instância própria. Nenhuma das duas se decide sozinho:
  é ADR.
- **Telefone do motorista (T009)** se a ADR-0039 já tiver sido executada: aí o campo está cifrado e
  o leitor precisa abrir envelope. Confira o estado da ADR antes de escrever a leitura.
- **Rastro do caminhão sobre o roteiro.** Está fora do escopo. `trip_locations` tem as três guardas
  da ADR-0050 §5 (consentimento, apagamento junto, morte no fechamento) e juntá-lo ao mapa é spec
  própria.

## Onde a investigação vem antes do código

Três tasks começam por descobrir, e escrever código antes disso é escrever a coisa errada:

- **T001** — por que a parada não tem coordenada. A hipótese é que só a sugestão de roteiro popula
  `geocoded_addresses`, e viagem que nunca passou por sugestão nunca foi geocodificada. Confirme
  com consulta antes de mexer em fiação.
- **T010** — a conta da viagem sem números: painel sem fiação, ou viagem sem frete calculado? São
  consertos diferentes, e o segundo não é conserto, é mensagem.
- **T013** — a barra que não anima. Pode ser dado que não muda, não CSS. Meça a transição antes de
  reescrever o componente.

## Fechamento

A spec só fecha com `evidence.md` escrito: o que entrou, o que ficou de fora, e **por quê**. Task
que você decidir não fazer sai nomeada no arquivo, com a razão — encolher escopo em silêncio é o
único desfecho inaceitável.
