# 052 — A rotina tem botão, e o relógio é nosso

## Problema

As quatro rotinas agendadas só acontecem na janela delas, e a janela mora fora do produto.

| Job                          | Janela         | Espera até a próxima |
| ---------------------------- | -------------- | -------------------- |
| `fuel.price.pull`            | `0 9 * * 6`    | **seis dias**        |
| `notification.schedules.run` | `0 * * * *`    | uma hora             |
| `nfse.status.pull`           | `*/5 * * * *`  | cinco minutos        |
| `nfe.distribution.pull`      | `*/15 * * * *` | — **já tem botão**   |

Três buracos, e eles são o mesmo buraco visto de ângulos diferentes:

1. **Não dá para rodar agora.** O gatilho é o painel do Railway, e ninguém do lado do cliente tem
   acesso. O caso que abriu esta spec é concreto: a 051 subiu em 23/08 e `energy_tariff_references`
   fica vazia até 29/08 — veículo elétrico sem preço por seis dias, sem nada para apertar.
2. **Não dá para mudar a janela.** Ela está no `cronSchedule` de `deploy/cron*/railway.json`, que é
   arquivo de deploy: mudar a cadência é abrir PR, passar no gate e publicar.
3. **Não dá para saber o que aconteceu.** Não existe tabela nem tela de execução. Só o log do
   Railway — o mesmo acesso que o cliente não tem. "Falhou" e "ainda não deu a hora" são
   indistinguíveis.

E a janela já está duplicada: `SCHEDULED_DISTRIBUTION_CRON` existe **só** para a tela saber o
próximo ciclo, e há um contrato de teste (`scheduled-distribution-window.contract.ts`) guardando que
ela seja igual ao `cronSchedule` do `railway.json`. Um espelho que precisa de teste para não
divergir é sinal de que a verdade está no lugar errado. Pior: `resolveMinuteField` só sabe ler o
campo de minuto, então `0 9 * * 6` do combustível **nem é expressável** nessa política — a tela não
conseguiria dizer o próximo ciclo dele nem se quisesse.

## Decisões

1. **O relógio passa a ser nosso: a janela vive no banco, não no `railway.json`.** `job_schedules`
   guarda uma linha por rotina com `interval`, `next_run_at` e `enabled`. O Railway deixa de ser o
   agendador e vira **batida** — um serviço `cron` só, disparando a cada 5 minutos, que pega o
   advisory lock, seleciona o que venceu e publica. Consequências, todas desejadas:
   - Os quatro serviços de cron do Railway viram **um**.
   - `SCHEDULED_DISTRIBUTION_CRON`, o espelho e o contrato que o guarda **deixam de existir**.
   - A batida é o **piso de granularidade**: nada abaixo de 5 minutos. Hoje a rotina mais frequente
     é `*/5`, então nada se perde.

2. **O botão não é um segundo caminho — é o mesmo caminho, disparado antes da hora.** Botão de
   emergência que executa código próprio é código que só se descobre quebrado na emergência,
   justamente quando ninguém tem tempo de investigar. O executor passa a ser **um só**; o
   agendamento vira apenas _quem chamou_.

3. **O executor é o worker; o cron só publica.** É o que `nfe.distribution.pull` já faz — enfileira
   na `processing_outbox` e o consumidor executa — e não é coincidência que ele seja o **único dos
   quatro que já tem botão**: quem enfileira pode ser chamado por qualquer um. `nfse.status.pull` e
   `fuel.price.pull` processam dentro do cron (desvio deliberado, registrado no `CLAUDE.md`); esta
   spec fecha o desvio.

   Os dois atalhos recusados, e por quê:
   - **A API executar** obrigaria uma quarta cópia dos clientes da ANP, da ANEEL e da Nota RP dentro
     da API, e travaria uma requisição HTTP em cima do download de um XLSX.
   - **A API mandar o Railway rodar o serviço** põe credencial do provedor de hospedagem dentro da
     API do produto, acopla um produto de instalação dedicada ao Railway, e deixa chave de plano de
     operação em superfície de tenant.

4. **Clicar reagenda.** A execução manual publica e grava `next_run_at = agora + intervalo`. Rodar a
   coleta às 14h de quarta não deve fazer a próxima acontecer às 9h de sábado por herança de um
   relógio que ninguém mais consulta — o intervalo passa a contar do último ciclo real, não de uma
   grade fixa. É por isso que a janela é **intervalo**, não expressão cron: `0 9 * * 6` não sabe
   dizer "daqui a uma semana a partir de agora".
   ⚠️ Uma rotina perde a grade fixa ao ser rodada à mão. Conferido no código: para
   `fuel.price.pull` isso é indiferente, porque `resolveReferenceWeek` devolve a **última semana
   completa** — no sábado ela volta sete dias, não zero —, então qualquer dia da semana pede um
   arquivo que a ANP já publicou. O `CLAUDE.md` descreve essa derivação como "a semana que contém o
   dia de hoje", o que é impreciso e daria a impressão de que a rotina só pode rodar no sábado;
   corrigir esse parágrafo entra no T13.

5. **O período é editável no painel, com piso por rotina.** `settings.manage` altera o intervalo, e
   cada rotina declara o menor intervalo que aceita: a coleta pública da ANP e da ANEEL não vai a
   cada 5 minutos por engano de digitação — bater de minuto em minuto num serviço público de graça
   é o caminho para ser bloqueado. Intervalo abaixo do piso é `422` com o piso na mensagem, não
   truncamento em silêncio.

6. **Toda execução vira linha, e cada rotina tem o vocabulário de falha dela.** `job_executions`
   guarda job, origem (`schedule` · `manual`), quem pediu, começo, fim, `outcome`, `correlationId` e
   um resumo contado. O `outcome` de falha é **código estável por rotina**, nunca texto solto:
   - `fuel.price.pull` — `anp_unreachable` · `anp_week_not_published` · `anp_malformed_workbook` ·
     `aneel_unreachable` · `aneel_empty_slice`
   - `nfse.status.pull` — `provider_unreachable` · `malformed_response` · `credential_missing` ·
     `document_unavailable`
   - `nfe.distribution.pull` — o vocabulário de razões que
     `distribution-eligibility.policy.ts` já publica
   - `notification.schedules.run` — `queue_unreachable` · `template_missing`

   O painel traduz o código; a mensagem crua do provedor só aparece onde ela já aparece hoje (a
   rejeição da prefeitura, que é o que o operador precisa ler para corrigir). "Falhou" sem dizer o
   quê obriga a abrir o log — o acesso que o cliente não tem, que é o problema 3.

7. **"Última sincronização" é fato contado, não carimbo.** O cartão de cada rotina mostra: quando
   rodou, por quem foi chamada, o resultado, **o que mudou** (`142 preços atualizados`,
   `3 notas liquidadas`, `12 importações enfileiradas`, `nenhuma alteração`) e quando é a próxima.
   Ciclo que roda e não muda nada é resultado legítimo e precisa ser dito com essas palavras —
   senão o operador aperta de novo achando que não funcionou.

8. **A janela é da instalação; o opt-in continua sendo da empresa.** `job_schedules` **não tem**
   `company_id`: a cadência é do ambiente, como o `cronSchedule` que ela substitui. Quem participa
   de cada ciclo continua sendo decidido por empresa — o opt-in de distribuição, a credencial de
   NFS-e. Misturar as duas faria cada empresa poder mudar o relógio das outras sem saber.

9. **`settings.manage`, escopo `company`** — a permissão do company-admin, que responde pelo
   ambiente. Rodar rotina fora de hora e mexer no relógio não são operação de rotina.

10. **O painel mora ao lado do efeito**, seguindo "configuração perto do efeito":

    | Rotina                       | Onde                                                     |
    | ---------------------------- | -------------------------------------------------------- |
    | `fuel.price.pull`            | aba **Combustível** da frota, ao lado do ajuste de preço |
    | `nfse.status.pull`           | aba **Configurações** de NFS-e, com a credencial         |
    | `nfe.distribution.pull`      | aba **Remota** de Notas, junto do opt-in que já está lá  |
    | `notification.schedules.run` | tela de agendamentos de notificação                      |

    Uma tela única de "rotinas do sistema" faria o operador procurar o botão longe do problema dele.
    O cartão é **um componente só** (`RoutinePanel`), com quatro montagens — quatro cópias
    divergiriam na primeira mudança.

11. **Travou tem resposta, e ela não é um botão que mata processo.** O guard de `409` da decisão
    anterior cria um risco próprio: ciclo que morre sem gravar `finished_at` bloqueia o botão para
    sempre e congela `next_run_at` — a rotina morre calada, que é o defeito que esta spec veio
    consertar. Três mecanismos, porque são três falhas diferentes e um botão só mentiria sobre duas
    delas:
    - **O processo morreu** (contêiner reiniciado, deploy no meio do ciclo). É o caso que de fato
      acontece, e ele **não precisa de botão**: a execução carrega `lease_expires_at`, renovado
      enquanto o ciclo corre — o mesmo padrão do outbox relay, que já roda com lease de 30s. Lease
      vencido é execução abandonada: o `outcome` vira `abandoned`, o `409` sai do caminho e a
      janela volta a andar sozinha. O advisory lock de sessão o Postgres já solta quando a conexão
      cai; o que faltava era a linha saber disso.
    - **O processo está vivo e demorando.** Aqui existe **"Interromper"**, e ele é _cooperativo_:
      grava `cancel_requested_at`, e o ciclo para no **próximo limite de unidade** — entre empresas
      na distribuição, entre notas na NFS-e, entre UFs na coleta. Não é imediato, e o botão diz
      isso ("vai parar ao terminar a etapa atual"). O que já foi gravado fica gravado: todas as
      quatro rotinas são idempotentes por chave natural, então parar no meio e rodar de novo
      converge. Interromper não é desfazer.
    - **A tela discorda do mundo.** **"Destravar"**, atrás de confirmação: marca a execução atual
      como `abandoned` e libera a rotina, sem tocar em processo nenhum. É a saída para quando o
      operador _sabe_ que aquilo não está mais rodando e o lease ainda não venceu. O texto do
      diálogo diz exatamente o que ele faz e o que ele não faz — chamar isso de "parar" faria o
      operador acreditar que matou algo.

    O que **não** existe é matar o processo de fora. Os três clientes externos já têm timeout
    (`ANP_TIMEOUT_MS`, `ANEEL_TIMEOUT_MS`, `NFSE_PROVIDER_TIMEOUT_MS`), então "travado para sempre"
    é reinício de contêiner, não chamada pendurada — e reinício é exatamente o caso que o lease
    resolve sozinho.

12. **Desligar a rotina é possível, e nunca silencioso.** `enabled` ganha controle na tela, porque
    rotina que não pode ser pausada obriga a derrubar o serviço quando o provedor externo está fora
    do ar cuspindo erro. Mas rotina pausada é **estado que se anuncia**: o cartão fica marcado, com
    desde quando e por quem, e o aviso não some com o tempo. Conferência de NFS-e desligada e
    esquecida é nota parada sem ninguém saber — o risco é real, e a resposta é o aviso permanente,
    não proibir o controle.

## Fora de escopo

- **Matar o processo em andamento de fora.** Não existe caminho honesto: ou o ciclo coopera
  (decisão 11), ou o lease expira.
- **Histórico paginado.** O cartão mostra a última execução; a linha fica gravada para consulta.
- **Grade fixa por horário** ("todo sábado às 9h"). O intervalo é o modelo, pela decisão 4.
- **Desligar uma rotina pela tela.** `enabled` existe na tabela para o caminho de manutenção, sem
  controle na interface — desligar a conferência de NFS-e por engano é nota parada sem aviso.

## Riscos aceitos

- **O relógio da instalação fica atrás de uma permissão de empresa.** Numa instalação com dois
  CNPJs, o admin de um deles muda a cadência que vale para os dois. É consequência de a cadência ser
  do ambiente; o alternativo seria uma permissão de plataforma, e a ADR-0021 não tem consumidor
  para ela.
- **Cinco minutos de piso.** Rotina que precisasse de granularidade menor não cabe — nenhuma
  precisa hoje, e a batida é uma linha de configuração se um dia precisar.
- **A execução manual não é instantânea.** O worker consome em segundos, mas o ciclo da ANP baixa e
  lê um XLSX. O cartão mostra "em andamento" e atualiza quando grava — não finge que terminou.
- **"Interromper" tem latência de uma unidade.** Numa coleta que está no meio de uma UF, o clique
  só surte efeito ao terminar aquela UF. É o preço de não ter `kill`, e o botão diz isso antes.

## Aceite

- Apertar o botão com a batida parada produz no banco o mesmo resultado que a janela produziria, e
  as duas execuções aparecem em `job_executions` distinguidas só pela origem.
- Depois do clique, `next_run_at` é `agora + intervalo` — verificado nas quatro rotinas.
- Dois cliques seguidos produzem uma execução e um `409`.
- Intervalo abaixo do piso da rotina é `422` nomeando o piso; o gravado não muda.
- Cada código de falha do vocabulário de cada rotina tem tradução no painel, e o contrato falha se
  algum ficar sem.
- Sem `settings.manage`, as rotas respondem `403`, os botões não são renderizados e o período não é
  editável — mas o cartão de última sincronização continua visível, porque ali é informação de
  operação.
- Execução cujo lease vence sem `finished_at` vira `abandoned` sozinha, o botão volta a aceitar
  clique e `next_run_at` volta a andar — verificado matando o worker no meio de um ciclo.
- "Interromper" no meio de um ciclo de várias unidades para no limite seguinte, e o que já foi
  gravado continua gravado; rodar de novo em seguida converge para o mesmo estado.
- Rotina pausada exibe o aviso com desde quando e por quem, em todas as visitas à tela.
- Nenhum `railway.json` de cron além da batida sobrevive à feature, e nenhum teste espelha
  `cronSchedule` em variável de ambiente.
