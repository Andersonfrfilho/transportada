# Feature 180 — O histórico conta a história inteira

## Problema e resultado

A linha do tempo da viagem (spec 158) responde _quando_ e _quem_, e para no resto. Quatro coisas
vistas na mesma tela, na bancada, em 23/09:

```
Nota 879807/2 devolvida          Motivo da devolução: recipient_refused
Nota 879795/2 carregada          por usuário removido
```

1. **O motivo da devolução aparece em inglês, cru.** `recipient_refused` é código de lista fechada
   (`DRIVER_RETURN_REASONS`), e o dicionário existe em `fieldActions.returnReason` — a tela do
   motorista já o usa. A linha do tempo passava o código direto para a interpolação.
2. **"por usuário removido" é falso.** Conferido no banco: os quatro eventos `loaded` têm
   `actor_user_id`, resolvem em `identity_users` e têm `user_company_memberships` com
   `status = 'active'`. A D6 manda `actorName: null` só **sem vínculo ativo** — há vínculo. A tela
   afirma uma remoção que não houve, e o fallback `actorName ?? t('authorship.removedActor')`
   transforma qualquer ausência nessa afirmação.
3. **"Nota carregada" não diz para onde.** Carregada em qual veículo, com qual motorista — que é a
   pergunta seguinte de quem lê.
4. **A foto da ocorrência não é alcançável dali.** O registro diz que há anexo (`attachmentCount`),
   e ver exige sair da tela.

Resultado: o histórico deixa de mentir sobre autoria, fala português, diz em que veículo a nota foi
carregada e deixa ver a foto sem sair dali.

## Fora do escopo

- **A foto de rosto do usuário na linha do tempo.** A D6 da spec 158 proíbe id de usuário e imagem
  no item, e a foto exige `users.manage` enquanto a linha do tempo exige `fleet.read` — quem vê a
  viagem não tem permissão para baixar o rosto. Decisão do usuário em 23/09: não fazer agora.
  ⚠️ O **avatar de iniciais** (RF9) não é isso e está dentro do escopo: ele nasce do `actorName` que
  o item já carrega, sem imagem, sem id e sem rota nova.
- **Miniatura inline na lista inteira.** O RF12 da spec 161 evitou assinar URL por anexo numa lista
  paginada, que é I/O por item. Esta spec mostra a foto **ao expandir**, não antes.
- O formato e a ordem dos eventos (D6, D8), que continuam como estão salvo o campo novo do RF4.
- A autoria por canal (`resolveFieldAuthorshipText`), que já é única e não muda.

## Histórias priorizadas

### P1 — O histórico não mente sobre quem fez

**Given** um evento cujo autor tem vínculo ativo com a empresa
**When** o operador lê o histórico
**Then** aparece o nome dele — nunca "usuário removido", que é afirmação sobre um fato que não
ocorreu.

### P1 — O motivo em português

**Given** uma nota devolvida com motivo `recipient_refused`
**When** o evento aparece
**Then** lê-se "Recusa", e não o código.

### P2 — Carregada para onde

**Given** uma nota carregada numa viagem
**When** o evento aparece
**Then** diz em qual veículo e com qual motorista ela foi.

### P3 — Ver a foto sem sair

**Given** uma ocorrência com anexo
**When** o operador expande o evento
**Then** vê as fotos pela mesma grade que o painel de ocorrências já usa.

### P4 — Onde a carga foi posta

**Given** uma viagem com posição de carga recomendada
**When** o operador lê o evento de carregamento
**Then** alcança a recomendação dali.

## Requisitos funcionais

- **RF1** `returnReason` é traduzido pelo dicionário `fieldActions.returnReason`. Código sem
  tradução — há `'migration'` legado no banco — cai no próprio código: feio, mas verdadeiro; ocultar
  esconderia o motivo da devolução.
- **RF2** Autor com vínculo ativo tem nome na linha do tempo. A causa do `actorName: null` indevido
  é corrigida na consulta, não mascarada no texto.
- **RF3** "Usuário removido" fica reservado ao que a D6 descreve: ator que existiu e **perdeu** o
  vínculo. Ausência por outro motivo não pode usar essa frase — afirmar remoção que não houve é pior
  que não dizer nada.
- **RF4** O evento de carregamento diz **veículo e motorista**. São dados da viagem, não de pessoa
  externa: nada aqui fere a D6, que proíbe id de usuário, imagem, coordenada, chave de storage e XML.
- **RF5** O item expandido de ocorrência mostra os anexos pela rota que já existe
  (`GET /trip-occurrences/:id/attachments`), reusando `OccurrenceAttachmentGrid`. O `item.id` de um
  evento de ocorrência **é** o id da ocorrência — nenhum join novo.
- **RF6** A lista continua **sem assinar URL** (RF12 da 161): a assinatura só acontece ao expandir,
  por item, sob ação do operador.
- **RF7** A posição recomendada da carga é alcançável do evento de carregamento **por link**, não
  embutida: o desenho da carga é volumoso e tem tela própria.
- **RF8** Campo novo no item obriga `TRIP_TIMELINE_ITEM_KEYS` e o guard de chave exata a subirem
  junto — o guard reprova a lista inteira com chave desconhecida. Frontend tolerante primeiro.
- **RF9** Cada evento com autor mostra um **avatar de iniciais**, derivado do `actorName` que a
  linha do tempo já publica. Iniciais não são imagem nem id de usuário: nada aqui esbarra na D6, não
  há rota nova, não há `users.manage`, e não há uma requisição por item — é só frontend. É também o
  estado de "sem foto" para quando a foto real existir um dia.
- **RF10** As iniciais saem do primeiro e do último nome (`Eurides Dias Fontes` → `EF`); nome de uma
  palavra dá uma letra. A cor do círculo é derivada do nome, estável entre telas — cor aleatória a
  cada render faria o mesmo autor parecer pessoas diferentes.
- **RF11** Sem autor identificado, não há avatar — um círculo de interrogação afirmaria que existe
  alguém por trás, e o que existe é a ausência do dado (RF3).
- **RF12** O filtro de nota passa a aceitar **várias notas**, escolhidas numa lista das notas da
  viagem — hoje é um checkbox preso à nota cujo comprovante foi aberto (`openProofDocumentId`), e
  fora desse caminho ele nem aparece.
- **RF13** Com filtro ativo, os **eventos da viagem continuam aparecendo** (criada, despachada,
  chegada em parada). Hoje eles somem junto, porque a regra exige `document.id` igual; comparar duas
  notas sem saber quando a viagem saiu tira o sentido da linha do tempo.
- **RF14** O filtro continua **em memória**, sobre as páginas já carregadas — decisão do usuário em
  23/09, para não reabrir a consulta agora.
  ⚠️ Isto herda um defeito conhecido: evento de uma nota que esteja em página ainda não carregada
  não aparece, e a lista parece completa quando não está. O RF13 ameniza (a lista nunca fica vazia),
  mas não corrige. A correção real é o filtro virar parâmetro da consulta, e fica registrada aqui
  para quando a viagem grande cobrar.
- **RF15** **O evento leva à coisa.** Nota vira link para a nota; parada, para a parada; ocorrência,
  para a ocorrência. Hoje o histórico diz que algo aconteceu com a nota 879795/2 e deixa o operador
  procurá-la sozinho — o que é o oposto do que um histórico serve para fazer.
- **RF16** **O evento expande.** Um evento com mais a dizer — ocorrência com observação e fotos,
  devolução com motivo, carregamento com veículo e posição da carga — abre no lugar, sem sair da
  tela. Fechado, mostra só título, hora e autoria, para a lista continuar varrível de cima a baixo.
- **RF17** **O evento é formatado, não um parágrafo.** Título, autoria e detalhes têm hierarquia
  visual distinta; o que é dado (veículo, motivo, quantidade) aparece rotulado, não embutido no meio
  da frase.
- **RF18** Nada disso pode custar requisição na lista: link é `href`, e o conteúdo caro — anexos —
  só é buscado quando o operador expande (RF5, RF6).
- **RF19** Textos em pt-BR e en.

## Requisitos não funcionais

- Sem N+1: veículo e motorista entram por join nas consultas que já existem, não por consulta por
  item.
- Expandir um item não pode recarregar a lista.
- 375px e área de toque de 44px.

## Casos extremos e falhas

- **Ator sem perfil cadastrado**: se o nome não existir mesmo, a tela diz que o autor não está
  identificado — nunca que foi removido (RF3).
- **Anexo expirado pela retenção**: a grade já marca isso e não gera URL; o comportamento não muda.
- **Viagem sem veículo atribuído no momento do carregamento**: o evento omite o veículo em vez de
  inventar o atual, que pode ser outro.
- **Evento antigo, anterior a esta spec**: sem veículo gravado, a linha aparece como hoje — nada
  quebra.
- **Ocorrência sem anexo**: expandir não mostra grade vazia; não oferece o que não existe.

## Critérios de aceite

- **CA01** Motivo de devolução aparece traduzido; código desconhecido aparece cru, não sumido.
- **CA02** Evento com autor de vínculo ativo mostra o nome.
- **CA03** "Usuário removido" só aparece para vínculo perdido.
- **CA04** Evento de carregamento mostra veículo e motorista.
- **CA05** Expandir ocorrência com anexo mostra as fotos; sem anexo, não mostra grade.
- **CA06** A lista não assina URL de anexo enquanto nenhum item é expandido.
- **CA07** A posição da carga é alcançável por link do evento de carregamento.
- **CA08** Evento com autor mostra avatar de iniciais; o mesmo autor tem sempre a mesma cor.
- **CA09** Evento sem autor identificado não mostra avatar.
- **CA10** É possível escolher mais de uma nota, e a lista mostra os eventos de todas elas.
- **CA11** Com filtro ativo, os eventos da viagem continuam visíveis.
- **CA12** Sem nenhuma nota escolhida, a lista é a completa — não vazia.
- **CA13** A nota citada no evento leva à nota; a parada, à parada.
- **CA14** Evento com mais a dizer expande no lugar e recolhe; fechado mostra só título, hora e
  autoria.
- **CA15** A lista não dispara requisição de anexo enquanto nada é expandido.
- **CA16** Evento sem nada a acrescentar não oferece expansão — um controle que abre o vazio é pior
  que controle nenhum.
- **CA17** O marcador do trilho fica centralizado no item, com uma ou com várias linhas.
- **CA18** Revisão de design com print, em 375px e no desktop (web.md §15).

## Dúvidas

Nenhuma — decisões do usuário em 23/09: miniatura sob demanda, sem avatar; veículo, motorista e
posição da carga na mesma spec.
