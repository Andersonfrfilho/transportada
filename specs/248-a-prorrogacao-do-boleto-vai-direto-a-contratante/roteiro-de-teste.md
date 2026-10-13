# Roteiro de teste manual — o boleto da contratante (spec 248)

Roteiro para testar **na mão**, no ambiente local, o fluxo em que a contratante responde ao pedido de
prorrogação com o boleto e a resposta chega ao motorista. Os cenários vêm prontos de um seeder; cada um
mostra um estado diferente do retorno.

## 0. Antes de começar

| Item     | Valor                                                                                      |
| -------- | ------------------------------------------------------------------------------------------ |
| Painel   | `http://localhost:53000` (login com o usuário local do `db:seed:local`)                    |
| API      | `http://localhost:53001`                                                                   |
| Keycloak | `http://localhost:58200`                                                                   |
| Postgres | `localhost:55432` (qualquer cliente SQL; as consultas abaixo só leem, exceto as do alarme) |

### 0.1 Criar, conferir e apagar os cenários

De dentro de `apps/api-transportada`, com o `DATABASE_URL` do `.env` local (o script **recusa** qualquer
banco que não seja `localhost`, `127.0.0.1` ou `[::1]`):

```bash
bun run scripts/seed-contractor-reply-scenarios.ts                # cria (rodar de novo não duplica)
bun run scripts/seed-contractor-reply-scenarios.ts --reset        # apaga só o que ele criou
bun run scripts/seed-contractor-reply-scenarios.ts --reset --seed # apaga e cria de novo
```

- Tudo leva o prefixo **`[TESTE 248]`** (tipos, contratante, motoristas, veículos). O `--reset` acha o que é
  seu por esse prefixo, pelo bucket `teste-248` e pela chave de importação `teste-248-…`; mais nada é tocado.
- Os cenários nascem na empresa do vínculo ativo do usuário local. Outra empresa: `--company <uuid>`.
- O script imprime, no fim, quantas linhas entraram (ou saíram) por tabela.
- ⚠️ **Estado "de uso" se perde no `--reset`**: depois de você clicar em "Enviar ao motorista" ou "Marcar como
  tratado", só `--reset --seed` devolve o cenário ao estado inicial.

### 0.2 O que **não** funciona neste ambiente (de propósito)

- **Baixar ou abrir o PDF não funciona.** O bucket local (MinIO) não está no ar e os anexos são só linhas em
  `stored_objects` (bucket `teste-248`). Clicar em "baixar" dá erro: **não é defeito** do fluxo. O que se testa é
  o **estado**, a **entrega** (linha no chat do motorista apontando para o mesmo objeto) e as **telas**.
- **O e-mail à contratante não sai.** As configurações de e-mail do seeder são sintéticas (chave vazia,
  domínio `teste248.example.test`); o pedido fica na fila do e-mail e nunca é enviado a ninguém. A resposta da
  contratante foi **gravada pelo seeder** como se tivesse chegado.
- **O motorista não consegue logar**: ele tem conta ativa no banco (vínculo), mas não no Keycloak. A entrega ao
  chat é provada pelo painel e pelo SQL, não pelo app do motorista.
- **"Enviar ao cliente da nota"** ainda não existe nesta base (T4.7, PR 168). O cenário 6 já deixa os dados
  prontos; quando o PR entrar, o botão deve aparecer só na nota com e-mail (§ cenário 6).

### 0.3 Consultas de apoio (sem dado pessoal)

**Q0 — estado de todos os cenários**

```sql
select t.name as tipo,
       r.status,
       r.reason,
       r.alert_count as alertas,
       (r.deadline_at < now()) as prazo_vencido,
       (select count(*) from occurrence_conversation_attachments a
         where a.company_id = r.company_id and a.message_id = r.reply_message_id) as anexos_na_resposta,
       (select string_agg(d.target || ':' || d.status || coalesce('/' || d.reason, ''), ', ')
          from occurrence_contractor_reply_deliveries d
         where d.company_id = r.company_id and d.reply_id = r.id) as envios,
       (n.recipient_email is not null) as nota_tem_email_do_destinatario,
       o.id as ocorrencia_id
  from occurrence_contractor_replies r
  join trip_document_occurrences o on o.company_id = r.company_id and o.id = r.occurrence_id
  join company_occurrence_types t on t.company_id = o.company_id and t.id = o.occurrence_type_id
  join trip_documents d on d.company_id = o.company_id and d.id = o.trip_document_id
  join nfe_documents n on n.company_id = d.company_id and n.id = d.nfe_document_id
 where t.name like '[TESTE 248]%'
 order by t.name, r.created_at;
```

**Q1 — endereço de cada ocorrência no painel**

```sql
select t.name as tipo, 'http://localhost:53000/ocorrencias/' || o.id as endereco
  from trip_document_occurrences o
  join company_occurrence_types t on t.company_id = o.company_id and t.id = o.occurrence_type_id
 where t.name like '[TESTE 248]%'
 order by t.name, o.created_at;
```

**Q2 — histórico (eventos) de um tipo** — troque o nome entre aspas:

```sql
select e.created_at, e.from_status, e.to_status, e.reason, e.actor_kind
  from occurrence_contractor_reply_events e
  join occurrence_contractor_replies r on r.company_id = e.company_id and r.id = e.reply_id
  join trip_document_occurrences o on o.company_id = r.company_id and o.id = r.occurrence_id
  join company_occurrence_types t on t.company_id = o.company_id and t.id = o.occurrence_type_id
 where t.name = '[TESTE 248] Prorrogação — com aprovação'
 order by e.created_at;
```

**Q3 — mensagens no chat do motorista** (a entrega ao motorista é uma mensagem lá) — mesmo filtro por nome:

```sql
select m.channel, m.direction, m.automatic, left(m.body_text, 40) as inicio_do_texto,
       (select count(*) from occurrence_conversation_attachments a
         where a.company_id = m.company_id and a.message_id = m.id) as anexos
  from occurrence_conversations c
  join occurrence_conversation_messages m on m.company_id = c.company_id and m.conversation_id = c.id
  join trip_document_occurrences o on o.company_id = c.company_id and o.id = c.occurrence_id
  join company_occurrence_types t on t.company_id = o.company_id and t.id = o.occurrence_type_id
 where c.participant = 'driver' and t.name = '[TESTE 248] Prorrogação — com aprovação'
 order by m.created_at;
```

**Q4 — o boleto entregue é o mesmo objeto do bucket** (nenhuma cópia): devolve `true` quando o anexo da
mensagem ao motorista aponta para o mesmo `stored_object` da resposta da contratante.

```sql
select exists (
  select 1
    from occurrence_contractor_replies r
    join occurrence_conversation_attachments source
      on source.company_id = r.company_id and source.id = r.reply_attachment_id
    join occurrence_contractor_reply_deliveries d
      on d.company_id = r.company_id and d.reply_id = r.id and d.status = 'sent'
    join occurrence_conversation_attachments delivered
      on delivered.company_id = d.company_id and delivered.message_id = d.driver_message_id
     and delivered.stored_object_id = source.stored_object_id
    join trip_document_occurrences o on o.company_id = r.company_id and o.id = r.occurrence_id
    join company_occurrence_types t on t.company_id = o.company_id and t.id = o.occurrence_type_id
   where t.name = '[TESTE 248] Prorrogação — com aprovação'
) as mesmo_objeto;
```

### 0.4 Onde ficam as telas

- **Tipos:** `/ocorrencias` → aba **Tipos** → abrir o tipo → bloco **Retorno da contratante** (modo, anexo que
  vale, texto ao motorista, prazo de espera, alerta, repetição e máximo de alertas).
- **Feed:** `/ocorrencias` → aba **Feed** → a linha da ocorrência mostra o selo do retorno → clicar abre o
  detalhe `/ocorrencias/<id>` (os endereços saem da Q1).
- **Detalhe da ocorrência:** no topo da conversa, o painel **Retorno da contratante** (selo de estado, prazo,
  alertas, motivo, nota do operador, **Envios**, **Histórico** e as ações); abaixo, a aba **Contratante** com a
  mensagem recebida e o anexo, e a aba **Motorista** com o chat do app.

---

## 1. Prorrogação — com aprovação

**Mostra:** a contratante já respondeu com 1 PDF; o operador ainda não decidiu enviar ao motorista.
**Tipo:** `[TESTE 248] Prorrogação — com aprovação` · modo "Levar ao motorista depois da aprovação do operador" ·
prazo 6 h · "Alertar a operação" a cada 60 min, máximo 24 · texto ao motorista "Segue o boleto prorrogado.".
O motorista da viagem **tem conta ativa**.

**Passos**

1. `/ocorrencias` → **Tipos** → abrir o tipo e conferir o bloco **Retorno da contratante** com os valores acima.
2. **Feed** → abrir a ocorrência deste tipo (ou o endereço da Q1).
3. No painel **Retorno da contratante**: ver o estado e as ações disponíveis.
4. Aba **Contratante**: ver a mensagem "Segue o boleto." com o anexo `boleto-1.pdf`.
5. Clicar em **Enviar ao motorista** (no painel ou ao lado do anexo).
6. Clicar de novo / recarregar a página.

**Esperado**

- Passo 3: estado **Aguardando o operador**; botões **Enviar ao motorista** e **Marcar como tratado**; no
  Histórico, uma linha "Aguardando o operador" feita pelo **Sistema**; **Envios** vazio.
- Passo 5: mensagem "Enviado ao motorista pelo chat do app."; o estado passa a **Entregue**; em **Envios**:
  "Motorista, chat do app — enviado"; no Histórico, "Entregue ao motorista" feita pela **Operação**.
- Passo 6: o botão deixa de aparecer ou responde "Já foi enviado ao motorista."; **nenhuma segunda mensagem**
  ao motorista.
- Aba **Motorista**: uma mensagem "Segue o boleto prorrogado." com o anexo.

**Conferir no banco** (Q0, Q2, Q3, Q4 com o nome acima)

- Antes do clique: Q0 → `awaiting_operator`, `anexos_na_resposta = 1`, `envios` vazio; Q3 → nenhuma linha.
- Depois: Q0 → `delivered`, `envios = driver_app_chat:sent`; Q3 → **1** linha (`app`, `outbound`,
  `automatic = false`, 1 anexo); Q4 → `true`; Q2 → duas linhas (`awaiting_contractor → awaiting_operator`,
  `system`; depois `awaiting_operator → delivered`, `user`).

---

## 2. Prorrogação — automático

**Mostra:** o boleto já foi entregue ao motorista sozinho, sem ninguém clicar.
**Tipo:** `[TESTE 248] Prorrogação — automático` · modo "Levar ao motorista automaticamente" · motorista com conta.

**Passos:** abrir a ocorrência (Q1) → painel do retorno → aba **Motorista**.

**Esperado**

- Estado **Entregue**; **Envios**: "Motorista, chat do app — enviado"; Histórico com "Boleto recebido" e depois
  "Entregue ao motorista", ambos pelo **Sistema**; nada a clicar para entregar.
- Aba **Motorista**: a mensagem "Segue o boleto prorrogado." com o anexo.

**Conferir no banco:** Q0 → `delivered`, `envios = driver_app_chat:sent`; Q3 (nome deste tipo) → 1 linha com
`automatic = true`; Q4 (nome deste tipo) → `true`.

---

## 3. Prorrogação — prazo vencido

**Mostra:** a contratante **não respondeu** e o prazo passou; já foram 2 alertas.
**Tipo:** `[TESTE 248] Prorrogação — prazo vencido` · espera 6 h · alerta a cada 60 min, máximo 24. O seeder
grava o retorno como `overdue`, prazo vencido há 3 h, 2 alertas, último há 1 h.

**Passos**

1. Abrir a ocorrência (Q1) e olhar o painel do retorno.
2. (Opcional, § 5) ligar a rotina de alarme e esperar um ciclo.
3. Clicar em **Marcar como tratado**, escrever o que foi feito e confirmar.

**Esperado**

- Passo 1: estado **Atrasada**, "2 alertas", **Prazo** com "vencido", **Alertas enviados** "2 de 24"; **sem**
  botão "Enviar ao motorista" (não há resposta); **Marcar como tratado** disponível.
- Passo 2 (só com a rotina ligada **e o worker no ar**): o contador sobe para 3 e o operador recebe o aviso
  (sino de notificações); sem o worker nada muda.
- Passo 3: estado **Tratado** com a "Nota do operador" que você escreveu; o alarme **para** para esta ocorrência.

**Conferir no banco:** Q0 → `overdue`, `alertas = 2`, `prazo_vencido = true`, `envios` vazio. Depois do passo 3:

```sql
select r.status, (r.handled_note is not null) as tem_nota, (r.handled_by_user_id is not null) as tem_autor
  from occurrence_contractor_replies r
  join trip_document_occurrences o on o.company_id = r.company_id and o.id = r.occurrence_id
  join company_occurrence_types t on t.company_id = o.company_id and t.id = o.occurrence_type_id
 where t.name = '[TESTE 248] Prorrogação — prazo vencido';
```

→ `handled`, `true`, `true`.

---

## 4. Prorrogação — resposta sem PDF

**Mostra:** a contratante respondeu, mas só com uma **foto** (não vale como boleto no tipo "Somente PDF").
**Tipo:** `[TESTE 248] Prorrogação — resposta sem PDF` · modo automático.

**Passos:** abrir a ocorrência (Q1) → painel do retorno → aba **Contratante**.

**Esperado**

- Estado **Precisa do operador**, com **Motivo: sem anexo aceito**; **nada** foi entregue (Envios vazio); a aba
  **Motorista** não tem a mensagem; o Histórico traz "Precisa do operador" pelo **Sistema**.
- O painel **não** oferece o envio automático do anexo; **Marcar como tratado** está disponível. O botão **Enviar
  ao motorista** ao lado do anexo da foto aparece na conversa (decisão do operador); **não** o clique neste
  cenário se quiser manter o estado.

**Conferir no banco:** Q0 → `needs_operator`, `reason = no_accepted_attachment`, `anexos_na_resposta = 1`, `envios`
vazio (e `reply_attachment_id` nulo: `select reply_attachment_id is null from occurrence_contractor_replies …`).

---

## 5. Prorrogação — dois PDFs

**Mostra:** a resposta trouxe **dois** PDFs; o sistema não escolhe um sozinho.
**Tipo:** `[TESTE 248] Prorrogação — dois PDFs` · modo automático.

**Passos:** abrir a ocorrência (Q1) → painel do retorno → aba **Contratante** (dois anexos: `boleto-1.pdf` e
`boleto-2.pdf`).

**Esperado**

- Estado **Precisa do operador**, **Motivo: mais de um anexo**; **nada** entregue ao motorista; Histórico com o
  evento do **Sistema**.
- O operador escolhe: o botão **Enviar ao motorista** ao lado de **cada** anexo leva aquele PDF; **Marcar como
  tratado** encerra sem enviar.

**Conferir no banco:** Q0 → `needs_operator`, `reason = multiple_attachments`, `anexos_na_resposta = 2`, `envios`
vazio.

---

## 6. Prorrogação — envia ao cliente da nota (duas notas)

**Mostra:** duas ocorrências do **mesmo tipo**: a nota da primeira tem e-mail do destinatário
(`recipient_email`), a da segunda **não**. Servem ao envio do boleto ao cliente da nota (PR 168 / T4.7).
**Tipo:** `[TESTE 248] Prorrogação — envia ao cliente da nota` · modo com aprovação · "Enviar o boleto ao e-mail
do cliente da nota: **O operador envia**" (assunto e texto do e-mail preenchidos). As duas respostas estão em
`awaiting_operator`, com 1 PDF.

**Passos**

1. Na aba **Tipos**, abrir o tipo e conferir **Enviar o boleto ao e-mail do cliente da nota = O operador envia**.
2. Abrir as duas ocorrências (Q1 devolve duas linhas deste tipo; a Q0 diz qual nota tem e-mail:
   `nota_tem_email_do_destinatario`).
3. Em cada uma, olhar o painel do retorno.

**Esperado hoje (sem o PR 168):** as duas mostram **Aguardando o operador**, com **Enviar ao motorista**; **não
existe** "Enviar ao cliente da nota".
**Esperado depois do PR 168:** "Enviar ao cliente da nota" disponível **só** na nota com e-mail; na outra, o botão
aparece desabilitado (ou ausente) com o motivo "nota sem e-mail do cliente"; ao enviar, uma linha em **Envios**
"Cliente da nota, e-mail" (o e-mail em si não sai neste ambiente: § 0.2).

**Conferir no banco:** Q0 → duas linhas deste tipo em `awaiting_operator`, uma com
`nota_tem_email_do_destinatario = true` e outra `false`. Depois do PR 168, a entrega sem e-mail deve ficar
`skipped/note_without_recipient_email`.

---

## 7. Prorrogação — motorista sem conta

**Mostra:** o boleto chegou no modo automático, mas o motorista da viagem **não tem conta ativa**.
**Tipo:** `[TESTE 248] Prorrogação — motorista sem conta` · modo automático.

**Passos:** abrir a ocorrência (Q1) → painel do retorno → aba **Motorista**.

**Esperado**

- Estado **Boleto recebido** (a resposta foi aceita), mas **não entregue**; em **Envios**: "Motorista, chat do
  app — não enviado (motorista sem conta)"; a aba **Motorista** sem a mensagem.
- A entrega pulada ocupa a chave de idempotência do anexo. Se você clicar em **Enviar ao motorista** ao lado do
  anexo, o servidor responde "já entregue" (a tela diz "Já foi enviado ao motorista.") em vez do aviso de motorista
  sem conta — **observe e reporte** se for o caso; o teste não prova qual das duas frases a tela mostra.

**Conferir no banco:** Q0 → `reply_received`, `envios = driver_app_chat:skipped/driver_without_account`; Q3 (nome
deste tipo) → nenhuma linha.

---

## 8. A rotina de alarme (`occurrence.contractor-reply.alert`)

A rotina nasce **pausada** (`job_schedules`, origem `system`) e **só roda no worker**: sem o
`worker-transportada` no ar, ligar a linha **não faz nada** e o contador de alertas do cenário 3 não muda.

```sql
-- Estado atual:
select job, enabled, paused_origin, interval_seconds, next_run_at
  from job_schedules
 where job = 'occurrence.contractor-reply.alert';

-- LIGAR (o worker pega no próximo ciclo; intervalo de 300 s):
-- update job_schedules
--    set enabled = true, paused_at = null, paused_by = null, paused_origin = null, next_run_at = now()
--  where job = 'occurrence.contractor-reply.alert';

-- DESLIGAR de volta (pausa de fábrica):
-- update job_schedules
--    set enabled = false, paused_at = now(), paused_by = null, paused_origin = 'system'
--  where job = 'occurrence.contractor-reply.alert';
```

O `CHECK` da tabela exige os três campos de pausa nulos quando `enabled = true`, e `paused_at` + `paused_origin`
preenchidos quando `false`: por isso os `update` mexem nos quatro campos juntos. Depois de testar, **desligue
de novo**.

---

## 9. Resumo

| #   | Tipo                     | Retorno no banco                            | O que se vê                                   |
| --- | ------------------------ | ------------------------------------------- | --------------------------------------------- |
| 1   | com aprovação            | `awaiting_operator`                         | "Enviar ao motorista" → `delivered`           |
| 2   | automático               | `delivered`                                 | boleto no chat do motorista, sem clique       |
| 3   | prazo vencido            | `overdue`, 2 alertas                        | "Atrasada", "Marcar como tratado" → `handled` |
| 4   | resposta sem PDF         | `needs_operator` / `no_accepted_attachment` | motivo "sem anexo aceito"                     |
| 5   | dois PDFs                | `needs_operator` / `multiple_attachments`   | operador escolhe o PDF                        |
| 6   | envia ao cliente da nota | 2× `awaiting_operator`                      | com e sem e-mail do destinatário (PR 168)     |
| 7   | motorista sem conta      | `reply_received`, entrega `skipped`         | "motorista sem conta"                         |
