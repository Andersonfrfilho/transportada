# ADR 0007 — Outbox, idempotência e cursor NF-e persistentes

- Status: aceito
- Data: 2026-07-20
- Decisores: mantenedor do projeto e revisão Opus

## Contexto

Importação e distribuição são efeitos críticos, demorados e sujeitos a falhas
de storage, broker e SEFAZ. Publicar em RabbitMQ depois do commit pode perder o
job; publicar antes pode executar um estado que o banco não confirmou. O broker
entrega pelo menos uma vez, então redelivery também pode duplicar documento,
contador ou evento.

`NfeDistribuicaoProvider` pagina até 50 itens, exige `ultNSU` persistido e
protege uma consulta vazia por uma hora apenas em memória. Esse estado não é
suficiente com restart ou múltiplas instâncias.

## Decisão

1. API grava agregado e `processing_outbox` na mesma transação.
2. Um relay no worker reivindica outbox com lease e
   `FOR UPDATE SKIP LOCKED`, publica em confirm channel e marca `published_at`.
3. Falha antes do confirm mantém/reagenda o outbox; confirmação repetida é
   absorvida pelo consumer.
4. Envelopes v1 contêm apenas IDs, tenant, ator, correlação e tipo/versão.
   Tenant e ator recebidos são claims não autoritativos: o consumer deriva
   ambos do outbox/agregado persistido por `eventId` + agregado e exige
   igualdade antes de qualquer efeito.
5. Importação e distribuição possuem exchanges/queues main, retry/DLX e DLQ
   independentes e versionadas.
6. Consumers validam envelope estrito e usam `processed_messages` persistente
   com unique `(companyId,consumer,eventId)`, uniques de negócio e
   version/lease; nenhum `Set` em memória decide efeito real.
7. Ack ocorre somente depois do commit do efeito e do registro processado.
8. Erro transitório usa backoff limitado; erro fatal segue para DLQ; o envelope
   nunca carrega XML, certificado ou resposta SEFAZ.
9. Cada item possui tentativas append-only. Reprocessar cria nova tentativa e
   outbox, sem reescrever o histórico.
10. `nfe_distribution_cursors` é único por `(companyId,environment)` e guarda
    `ultNSU`, `maxNSU`, lease, versão e `nextAllowedAt`.
11. Cursor inicia em `000000000000000`, nunca regride e é confirmado junto dos
    efeitos de cada página.
12. Apenas um lease ativo consulta o provider por empresa/ambiente.
13. Todo item distribuído persiste NSU e ambiente com unique parcial
    `(companyId,environment,sourceNsu)`; página repetida/sobreposta é absorvida
    antes de efeitos, com uniques de evento e chave NF-e como segunda barreira.
14. Ausência de documentos/bloqueio equivalente ao `cStat 656` atualiza
    `nextAllowedAt`, sobrevivendo a restart e escala.
15. Certificado A1 é carregado/decriptado apenas em memória pelo consumer de
    distribuição e nunca integra idempotency key, fila, log ou auditoria.

## Fluxo do outbox

```text
API transaction
  ├── grava nfe_imports/items
  └── grava processing_outbox
          ↓ commit
relay claim → RabbitMQ publisher confirm → published_at
          ↓
consumer claim → efeito → DB commit + processed_messages → ack
```

Se o processo cair:

- antes do commit da API: não existe job;
- depois do commit e antes do publish: relay recupera;
- depois do publish e antes de `published_at`: pode republicar; consumer dedupe;
- depois do efeito e antes do ack: mensagem redeliver; uniques/processed
  messages retornam o mesmo resultado;
- durante um lease: outra instância espera ou recupera após expiração.

## Concorrência da distribuição

Cada página usa o cursor atualmente confirmado. O worker não mantém uma
transação PostgreSQL aberta durante a chamada SEFAZ; ele:

1. adquire/renova lease curto com versão;
2. lê cursor e chama o gateway;
3. confirma itens e avanço de cursor somente se ainda possui lease/versão;
4. repete quando `temMais=true`;
5. libera lease ou deixa expirar em crash.

Se perder o lease, descarta o resultado não confirmado. Uma repetição segura
pode consultar novamente o mesmo NSU; idempotência absorve a página.

### Emenda (10/08/2026): o 656 chega como erro, e erro ia para o trilho de retry

O item 14 dizia "ausência de documentos **ou bloqueio equivalente ao `cStat 656`**", mas só a
primeira metade existia no código: `nextAllowedAt` era gravado no ramo em que a SEFAZ responde com
sucesso e a página vem vazia. Quando a SEFAZ **recusa** com 656, o provider lança, e lançar deixava o
consumer sem gravar cursor nenhum.

Isso se sustentava sozinho em produção. O trilho de retry reentregava em segundos e cada tentativa
era uma consulta nova ao mesmo CNPJ; o cron, vendo `cooldown_active: 0`, enfileirava outra importação
por hora. A SEFAZ pede uma hora de silêncio, e as nossas próprias tentativas impediam essa hora de
acontecer — `ultNSU` ficou em `000000000000000` do primeiro ciclo elegível em diante.

Passa a valer: **a recusa por 656 é desfecho, não falha.** O consumer grava a janela, finaliza a
importação com o que já tinha persistido e devolve `rate-limited`, o que faz o handler dar `ack`. Sem
retry, sem DLQ — a mensagem cumpriu o que tinha para cumprir, e quem retoma é o cron depois da janela.
Qualquer outro cStat continua lançando e mantém retry, backoff e DLQ como antes.

O pacote fiscal sinaliza o 656 de duas formas — rejeição tipada com `code` e `Error` cru com o cStat
na mensagem —, e as duas contam. O reconhecimento vive em
`nfe-distribution/domain/sefaz-rate-limit.policy.ts` e nunca toca `rawResponse`, onde vai o XML.

### Emenda (10/08/2026): o `schema` da SEFAZ é versionado, e um item ruim derrubava a página

Com o 656 corrigido, a primeira página real revelou o que ele escondia: `NFE_XML_UNSUPPORTED_DOCUMENT`
em todo ciclo, 14 ms depois de a página chegar. A classificação comparava o `schema` do `docZip` por
igualdade exata contra `resNFe`, `resEvento` e `procEventoNFe`, mas a SEFAZ versiona o atributo
(`resNFe_v1.01`, `procNFe_v4.00`) e o pacote fiscal o entrega cru. Nenhum item batia: todos caíam em
`complete` e um resumo era mandado ao importador de NF-e completa. As fixtures usavam as strings sem
versão — as que a documentação do pacote anuncia e que a SEFAZ nunca envia —, então a suíte ficava
verde enquanto produção falhava na primeira página.

Passam a valer duas regras. **A classificação normaliza o sufixo de versão** antes de comparar.
E **item que o importador não sabe ler é pulado, não é falha da página**: sem isso, um único documento
inesperado impede a gravação do cursor, o retry reconsulta o mesmo CNPJ e queima a janela de uma hora
— o mesmo laço do 656, por outra porta. O item pulado conta em `skippedCount` e sai em
`nfe_distribution_item_skipped` com NSU e schema, nunca com o XML. Qualquer outro erro continua
derrubando a página, com retry e DLQ.

### Emenda (10/08/2026): o resumo sem chave sintetizava um `access_key` que o banco recusa

Com a classificação corrigida, os resumos finalmente chegaram ao `insert` — e a primeira página real
morreu ali. `nfe_import_items` tem `CHECK (access_key IS NULL OR access_key ~ '^[0-9]{44}$')`, e o
adapter, quando o pacote fiscal não preenchia `chaveNfe`, gravava `nsu-000000000037702`. A coluna é
anulável desde sempre; a string sintética nunca teve onde caber. Antes da correção anterior esses
itens caíam em `complete` e eram pulados antes do `insert`, então o defeito ficou escondido atrás do
outro — e o desfecho em produção era o mesmo laço: página derrubada, cursor não gravado, retry
reconsultando o mesmo CNPJ, `cStat 656`, uma hora perdida.

Passa a valer: **a chave do resumo é lida, não inventada.** O adapter usa `chaveNfe` quando o pacote
a entrega com 44 dígitos e, quando não entrega, extrai o `<chNFe>` do próprio resumo — que é onde a
chave verdadeira está. Não achando nenhuma das duas, o item persiste com `access_key` nulo, que é o
que a coluna sempre permitiu. O nome do objeto no bucket continua aceitando o sufixo por NSU: ali a
string só precisa ser única, e nenhum CHECK a governa.

As fixtures do contrato do adapter agora **espelham o CHECK do banco** — chave ou nula, ou 44
dígitos, e nada mais. Foi a terceira vez seguida que a suíte ficou verde enquanto produção falhava,
sempre pelo mesmo motivo: o fake aceitava o que o Postgres recusa. O teste de integração da página
ganhou um quarto item, um resumo sem chave, contra Postgres de verdade.

## Consequências

- não existe exactly-once distribuído, mas os efeitos observáveis são
  idempotentes sob entrega pelo menos uma vez;
- outbox e processed messages crescem e exigirão retenção operacional depois
  de prazo seguro;
- o worker passa a depender de PostgreSQL, RabbitMQ e storage para readiness;
- DLQ exige runbook e reprocessamento explícito — o diagnóstico do laço descrito nas emendas está
  em `docs/runbooks/nfe-distribution.md`;
- o curso da distribuição permanece correto entre instâncias e restart;
- chamada SEFAZ continua sujeita ao contrato real do provider, encapsulado pelo
  gateway.

## Segurança e testes

- dois relays e dois consumers não duplicam efeito;
- confirm perdido e redelivery pós-commit são exercitados;
- retry/DLX, DLQ e shutdown drenam mensagens;
- 51 itens confirmam paginação e cursor monotônico;
- duas distribuições do mesmo tenant/ambiente não chamam o gateway em paralelo;
- tenants e ambientes possuem cursores independentes;
- mensagens/logs/auditoria não contêm XML, CNPJ, PFX, senha ou resposta SEFAZ;
- gateway fake cobre rede; homologação real permanece gate manual separado.

## Rollback

Antes de dados reais, parar consumers/relay, drenar ou apagar topologias locais,
reverter código e remover tabelas na ordem documentada pela migration. Depois de
processamentos reais, não apagar outbox, mensagens processadas ou cursores:
desabilitar produtores/consumers e corrigir por roll-forward.
