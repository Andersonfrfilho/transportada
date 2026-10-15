# Feature 266 — O motorista acompanha as ocorrências da rota

> Prévia aprovada pelo dono em 2026-10-15 ("certo aprovado pode fazer"): [`preview.html`](preview.html), publicada em
> https://claude.ai/artifact/9UtnZKUpiY6Ev7RgZRnrZh. Decisão de arquitetura: [ADR-0105](../../docs/adr/0105-a-ocorrencia-tem-um-andamento-com-o-motorista.md).

## Specs do mesmo assunto (lidas contra o código em `origin/staging`, 2026-10-15)

| Spec      | O que já decidiu e esta spec **usa sem refazer**                                                                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 034       | Sino do produto: inbox + e-mail, `sendNotification` via RabbitMQ. Sem push do sistema operacional.                                                                                                                       |
| 164 / 183 | Tratativa (`trip_occurrence_cases`) só abre com política de reentrega `allowed`/`blocked`. Uma conversa por (ocorrência, participante). **D4: a conversa não decide** — emendada num ponto só pela ADR-0105 §3.          |
| 167 / 240 | Correção e cancelamento da ocorrência pelo escritório. **Reabrir tratativa fica fora** — e continua fora: esta spec reabre o **andamento**, não a tratativa.                                                             |
| 173       | Marcador de ocorrência aberta na viagem do **escritório**. O motorista não tinha nada parecido.                                                                                                                          |
| 246       | Exigência (foto, assinatura, observação) cobrada pelo servidor. A recusa do registro do motorista é rejeição da fila offline (`rejectionCause`), não um estado do servidor.                                              |
| 248       | `registeredOccurrences[].contractorReply` na resposta da viagem; o boleto chega pelo chat.                                                                                                                               |
| 255       | Ícone por tipo de ocorrência (`OCCURRENCE_TYPE_ICON_NAMES`, 10 nomes).                                                                                                                                                   |
| 263 / 264 | Aba Conversas do motorista, conversa por assunto, selo de não lidas (`conversationDigests`), sino abre a conversa. **D4: o motorista não cria conversa de ocorrência** — emendada pela ADR-0105 §3: só cria respondendo. |

## Problema e resultado

O motorista registra ocorrência e perde o fio. Hoje o app mostra só uma linha "Ocorrência registrada às 14:32 · enviada"
por nota. Não há lista das ocorrências da viagem, nem o que o escritório decidiu, nem os documentos que chegaram (o
boleto prorrogado), nem como avisar que o assunto não acabou. A ocorrência de parada não aparece em lugar nenhum depois
de registrada.

**Resultado:** o motorista vê no cabeçalho da viagem quantas ocorrências estão **em aberto**. O alerta some quando todas
são resolvidas. Cada parada mostra os ícones das suas ocorrências com o estado. Uma lista e um detalhe mostram andamento,
documentos (com compartilhar) e o chat. O escritório **resolve** com observação, o motorista é avisado e pode **reabrir**
respondendo. Tudo fica registrado em evento e aparece no painel.

## Requisitos funcionais

- **RF1 — Estado por ocorrência.** Cada ocorrência da viagem tem um estado de andamento:
  - `queued`: só no app, aguardando sinal;
  - `rejected`: só no app, o servidor recusou o registro;
  - `open`: no servidor, sem evento de resolução ou com o último evento `reopened`;
  - `resolved`;
  - `cancelled` (167).

  Em aberto, para o alerta, significa `queued`, `rejected` ou `open`.

- **RF2 — Alerta no cabeçalho.** Ícone de alerta com o número de ocorrências em aberto da viagem atual, no cabeçalho
  (`DriverShellHeader`), entre a fila e o sino. Com zero em aberto, o ícone **não é renderizado**. Tocar abre a lista.
- **RF3 — A rota mostra os ícones.** Cada parada mostra o estado da entrega como ícone (entregue, atual, próxima) e uma
  fileira com um ícone por ocorrência da parada (de nota ou de parada). Cada ícone tem o ícone do tipo (255) e selos:
  - estado: enviada, na fila, recusada, resolvida;
  - número de mensagens não lidas;
  - clipe, quando há documento.

  Tocar no ícone abre o detalhe. O segmento da barra de progresso da parada com ocorrência em aberto fica em tom de alerta.

- **RF4 — Lista "Ocorrências da rota".** Mostra as em aberto primeiro e as resolvidas e canceladas embaixo. Filtros por
  ícone, com contagem: todas, com mensagem nova, com documento, recusadas, na fila. A linha leva ao chat quando ele
  existe, senão ao detalhe. A linha com documento tem o botão compartilhar.
- **RF5 — Detalhe.** Mostra:
  - tipo, estado e hora;
  - quadro de resolução (quem e quando; observação do escritório, ou a frase fixa quando a tratativa encerrou) ou de recusa (motivo e "Corrigir e reenviar");
  - botão do chat com contagem;
  - documentos;
  - o que foi registrado: nota, parada, observação, fotos;
  - andamento (linha do tempo);
  - outras ocorrências da mesma parada;
  - "Ver a nota na parada", que volta à rota com a parada em destaque.
- **RF6 — Documentos e compartilhar.** Entram os anexos do chat da ocorrência (escritório e contratante) e as fotos e a
  assinatura do motorista. Cada documento tem os botões ver e compartilhar; com mais de um, também "Compartilhar os N".
  Compartilhar usa a folha nativa do celular (`navigator.share` com arquivos). Sem suporte no aparelho, baixa o arquivo.
- **RF7 — Escritório resolve.** No painel, toda ocorrência (nota e parada) ganha "Resolver com observação", com
  observação obrigatória (o formulário avisa "o motorista vai ler esta observação") e permissão `occurrences.resolve`. Encerrar a tratativa (fechar, devolver ao armazém, cancelar)
  resolve o andamento automaticamente (ADR-0105 §2).
- **RF8 — Motorista reabre.** A reabertura é explícita. Na ocorrência resolvida o campo de resposta fica **travado** e
  mostra "Reabrir". O motorista toca em "Reabrir" e só então pode escrever; a primeira mensagem vai com `reopen: true` e
  grava o evento `reopened` e a mensagem juntos. Se tocar em "Reabrir" e não enviar nada, nada é gravado. Sem conversa, o
  mesmo botão no detalhe cria a conversa ao enviar. Resposta sem `reopen` numa ocorrência resolvida (app antigo,
  WhatsApp) é gravada e **não** reabre. Ocorrência cancelada não reabre.
- **RF9 — Notificações.**
  - A **equipe inteira** da viagem (motorista e ajudantes) recebe no sino "<tipo> resolvida"
    (`trip.occurrence-resolved`), que abre o detalhe. Não é enviada se a viagem já terminou, e o payload não leva nota. A
    mensagem nova já chega pelo aviso de conversa (263) e abre o chat.
  - O escritório recebe "<tipo> reaberta pelo motorista" (`trip.occurrence-reopened`). Quem recebe é quem gravou o último
    `resolved`; se foi o sistema, quem gravou o evento da tratativa ligado. Se essa pessoa já não tem
    `occurrences.resolve` na empresa, ninguém é notificado (o feed cobre).
- **RF9b — O motorista vê enquanto a viagem não termina.** Lista, detalhe e links assinados valem só para viagem **não
  finalizada**. Depois disso o detalhe responde 404 e o app mostra "Viagem encerrada" num link antigo.
- **RF10 — Tudo vira evento.** Os eventos `resolved` e `reopened`, com ator, nota e mensagem de origem, aparecem:
  - na linha do tempo do painel (`resolution.resolved`, `resolution.reopened`);
  - no detalhe do motorista;
  - no feed do painel, com o selo "Reaberta pelo motorista" e um filtro.
- **RF11 — Offline.** A lista e o detalhe usam o último retrato salvo no IndexedDB quando não há rede. A resposta que
  reabre entra na fila com chave de idempotência e só reabre no servidor quando sobe.

## Requisitos não funcionais

- **Isolamento:** o motorista lê só ocorrências da **sua viagem atual** e da sua empresa (contrato negativo para BOLA).
  `companyId` vem do token.
- **Sem PII em log**; o corpo da mensagem não vai para log nem para notificação (o padrão da 183 se mantém).
- **Links assinados** de vida curta (5 min) para foto, assinatura e anexo; nenhum link permanente no retrato offline.
- **CSP:** `frame-src 'none'` continua. O PDF abre em aba nova ou é baixado, nunca embutido.
- Alvo de toque de 44 px, ícone com `aria-label` e título (o texto fica no rótulo acessível).

## Fora do escopo

- Push do sistema operacional com o app fechado (o `sw.ts` não tem `push`; spec própria).
- Reabrir pela mensagem de WhatsApp ou e-mail.
- Reabrir a **tratativa** (167 continua valendo).
- Conversa com a contratante pelo motorista.
- O motorista resolver a própria ocorrência.

## Critérios de aceite

1. Viagem com três ocorrências em aberto: o cabeçalho mostra 3. O escritório resolve uma e o número vira 2 sem
   recarregar a página (no próximo refetch da viagem). Resolvidas as três, o ícone some.
2. A parada com duas ocorrências mostra dois ícones com selos distintos. Tocar em cada um abre o detalhe certo.
3. O motorista responde no chat de uma ocorrência resolvida. O painel mostra "Reaberta pelo motorista" e o evento na
   linha do tempo, e o alerta do motorista volta a contar a ocorrência.
4. O motorista de outra viagem recebe 404 ao ler ou reabrir a ocorrência (contrato negativo).
5. A tratativa fechada no painel marca a ocorrência como resolvida para o motorista, com uma **frase fixa** por status
   (encerrada → "Encerrada pelo escritório", devolvida ao armazém → "Mercadoria devolvida ao armazém", cancelada →
   "Tratativa cancelada pelo escritório"), nunca a nota interna da tratativa. A resolução manual mostra a observação do
   operador, e o formulário do painel avisa "o motorista vai ler esta observação".
6. O painel publicado antes da API continua carregando lista, detalhe e linha do tempo quando a API passa a mandar os
   eventos novos.
   6b. Finalizada a viagem, a lista e o detalhe somem para o motorista (404) e o sino de "resolvida" não é enviado.
7. O boleto que chegou no chat aparece em Documentos e abre a folha de compartilhar do celular. No desktop sem suporte,
   baixa o arquivo.
