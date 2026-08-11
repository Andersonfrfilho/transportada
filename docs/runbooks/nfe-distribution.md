# Runbook — distribuição de NF-e parada

Este runbook cobre o modo de falha mais caro do produto: a busca automática de notas (DF-e) roda,
não traz nada, e **cada tentativa nossa queima uma hora de silêncio que a SEFAZ exige**. Em
10/08/2026 isso durou o dia inteiro em produção com a suíte de testes verde.

Contexto de decisão: ADR-0007 e suas três emendas de 10/08/2026.

## 1. O laço

Todo defeito desta família termina no mesmo lugar, e é por isso que eles se escondem um atrás do
outro:

```
página chega → um item derruba a página → cursor NÃO é gravado
     → mensagem vai para o trilho de retry → retry reconsulta o MESMO CNPJ
     → SEFAZ responde cStat 656 (consumo indevido) → mais uma hora perdida
     → o cron da hora seguinte encontra a janela ainda fechada
```

`ultNSU` fica congelado, `nfe_import_items` não cresce, e a tela mostra importações “concluídas”
com 0 notas. **A ausência de erro visível é parte do sintoma.**

## 2. Sintomas

| O que se vê | Onde |
|---|---|
| `ult_nsu` congelado entre ciclos | `nfe_distribution_cursors` |
| Importações fechando com 0 notas recebidas | Importações → Remota |
| “A SEFAZ ainda está em intervalo obrigatório entre consultas” em todo ciclo | Importações → Remota |
| `next_allowed_at` sempre ~1h à frente de *agora*, nunca do ciclo anterior | cursor |
| `nfe_distribution_item_skipped` em massa | log do worker |
| Lotes presos em `NA FILA` | Importações → Remota |

## 3. Diagnóstico, nesta ordem

**Primeiro a tela, depois o banco, depois o log.** A tela responde em segundos e já separa
“a janela está fechada” de “a página está caindo”.

### 3.1 Painel Remota

`Importações → Remota` responde três coisas de uma vez: qual é a próxima janela permitida pela
SEFAZ, quando foi a última busca automática e quantas notas ela trouxe.

- Janela no futuro + última busca com 0 notas → **cooldown**, não há o que corrigir agora; espere.
- Janela aberta + cursor parado → **a página está caindo**; vá para o log.

### 3.2 Cursor em produção

```bash
railway ssh -p 62de4c69-216a-4335-93a0-4942c6a95c54 -e production -s Postgres-Hqfu \
  -- bash -lc 'psql -At -c "select ult_nsu from nfe_distribution_cursors"'
```

> Só há caminho interno para o Postgres de produção (`postgres-hqfu.railway.internal`); não existe
> `DATABASE_PUBLIC_URL` e não deve existir. Consultas de uma coluna só, curtas: seleções com várias
> colunas ou `concat` voltaram vazias de forma intermitente por esse caminho.

Contagem por variante, que é o que prova as correções de classificação e de chave:

```bash
railway ssh -p 62de4c69-216a-4335-93a0-4942c6a95c54 -e production -s Postgres-Hqfu \
  -- bash -lc 'psql -At -c "select count(*) from nfe_import_items where variant = '"'"'summary'"'"'"'
```

### 3.3 Log do worker

Procure, em ordem de gravidade:

1. `NFE_XML_UNSUPPORTED_DOCUMENT` — classificação errada (ver §4.2).
2. Violação de constraint no `insert` — chave sintética (ver §4.3).
3. `nfe_distribution_item_skipped` — item pulado; **isto é desfecho normal**, a página seguiu.

**Nunca leia nem repasse `rawResponse` de erro fiscal**: ali vai o XML da SEFAZ.

## 4. Os três defeitos de 10/08/2026

Todos os três produziam o laço do §1. Cada correção só revelou a seguinte.

### 4.1 `cStat 656` chegava como erro

O 656 é *desfecho*, não falha: grava a janela, finaliza a importação e dá `ack`. Enquanto ele
lançava, o retry reentregava em segundos e cada tentativa era uma consulta nova ao mesmo CNPJ.
Reconhecimento em `nfe-distribution/domain/sefaz-rate-limit.policy.ts`.

### 4.2 O `schema` da SEFAZ é versionado

A SEFAZ manda `resNFe_v1.01`, `procEventoNFe_v1.01.xsd`; a classificação comparava por igualdade
exata contra `resNFe`. Nada batia, tudo virava `complete`. Hoje o sufixo de versão é normalizado
antes de comparar, e **item que o importador não sabe ler é pulado, não derruba a página**.

### 4.3 Resumo sem chave sintetizava `access_key`

`nfe_import_items` tem `CHECK (access_key IS NULL OR access_key ~ '^[0-9]{44}$')`. O adapter
gravava `nsu-000000000037702` quando o pacote fiscal não preenchia `chaveNfe`. Hoje: **a chave do
resumo é lida, não inventada** — `chaveNfe` com 44 dígitos, senão `<chNFe>` do próprio XML, senão
nulo. O nome do objeto no bucket continua aceitando sufixo por NSU: ali nenhum CHECK governa.

## 5. O que não fazer

- **Não force a busca manual para “testar”.** Cada tentativa recusada empurra `next_allowed_at`
  mais uma hora à frente e desalinha a janela do cron. Em 10/08 uma tentativa às 23:57 moveu a
  janela para 00:57 — o custo de confirmar uma correção foi uma hora de produção.
- **Não trate `nfe_distribution_item_skipped` como incidente.** Ele existe justamente para a página
  sobreviver a um documento inesperado.
- **Não rode `consultarPorChave`/`consultarPorNsu` localmente.** O certificado A1 só é decriptado em
  memória pelo consumer (ADR-0007, item 15) — qualquer teste desses roda dentro do contêiner.

## 6. A regra estrutural

Três vezes seguidas a suíte ficou verde enquanto produção falhava, sempre pelo mesmo motivo:
**o fake do teste aceitava o que o Postgres recusa.**

> Fixture de teste que representa linha de banco espelha as constraints da tabela — CHECK, unique e
> nulabilidade. Fixture que representa payload de terceiro usa o valor que o terceiro **manda**, não
> o que a documentação dele anuncia.

As strings sem versão de §4.2 estavam na documentação do pacote fiscal e a SEFAZ nunca as envia; a
chave sintética de §4.3 nunca teve onde caber na coluna. Nos dois casos o teste afirmava um mundo
que não existe.

Caminho certo quando a dúvida for “o banco aceita isto?”: teste de integração contra Postgres de
verdade — `apps/worker-transportada/test/nfe-distribution-repository.integration.test.ts` já tem o
quarto item de página (resumo sem chave) exatamente para isso. Teste novo **precisa** entrar na
lista explícita de arquivos do `package.json` da app, senão não roda.

## 7. Em aberto

- A SEFAZ recusou com 656 a 27 minutos de janela aberta em 10/08. Ou o bloqueio é maior que a hora
  que assumimos, ou ele reconta a cada tentativa recusada. Sem conclusão.
- O cron é `0 * * * *`, mas a janela da SEFAZ conta a partir da consulta, não do relógio — os dois
  desalinham sozinhos. Rodar a cada 10–15 min fecharia a folga.
- `finalizeImport` sobrescreve `receivedCount` com os números da última página, enquanto
  `persistPage` acumula. Latente: só aparece quando mais de uma página passar.
- Resumo descartado no NSU `000000000037283` ainda não foi recuperado.
