# Feature 327 — Comprovante da conta paga e "Pagar conta" pelo WhatsApp

> Pedido do Anderson, 2026-11-15: pelo WhatsApp lançar o pagamento (a baixa) da conta e anexar o comprovante; "a conta, se for paga, o anexo do comprovante é opcional" e "deve ser vinculado à conta". Dito por ele: **o módulo Contas não tem nada a ver com ocorrências**: na tela só existe "conta". "Ocorrência" é nome interno da tabela `company_expense_occurrences`, e o texto da tela e do bot **nunca** usa a palavra.
> Status: **rascunho para aprovação** (a ser confirmado o limite de anexos).

## Specs do mesmo assunto (lidas)

| Spec | O que já decidiu e esta spec **usa sem refazer**                                                                                    |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 325  | Baixa da conta (valor pago, data, observação, autor) e a lista de vencimentos. "Anexo do comprovante" era **v2**; esta spec o traz. |
| 326  | "Lançar conta" na conversa direta: menu por `expenses.manage`, papel de motorista recusado, confirmação antes de gravar.            |
| 144  | Número verificado, menu filtrado por permissão, FlowAction reconfere.                                                               |

## Problema e resultado

Quem paga hoje dá a baixa só pelo painel, e o comprovante não tem onde ficar. Resultado:

1. **Comprovante opcional, vinculado à conta paga** (cada vencimento tem o seu: o de março não se mistura com o de abril). Foto ou PDF, até 5 por conta, 10 MB cada (limite proposto, a confirmar). Sem anexo, a baixa vale igual: o comprovante nunca trava o pagamento.
2. **Painel**: na baixa e na conta paga, anexar, ver e baixar o comprovante. Só componentes do design system.
3. **WhatsApp ("💰 Pagar conta")**: lista as contas em aberto (mais próximas do vencimento primeiro), pede valor e data (já preenchidos com o previsto e hoje), pergunta "Quer anexar o comprovante?" (Anexar / Pular), mostra o resumo e só baixa depois do Confirmar. O comprovante enviado na conversa já fica vinculado à conta.

## Regras

- Permissão: `expenses.manage` (a mesma da baixa do painel); papel de motorista, agregado ou ajudante recusado, como na 326. Anexo lido e baixado: `expenses.read`.
- O arquivo vai para o **bucket privado** dos comprovantes (mesmo gateway de armazenamento da entrega), sem URL pública; quem vê pede uma assinada e curta. Hash SHA-256 gravado; o mesmo arquivo na mesma conta não duplica.
- Tipo aceito: JPEG, PNG, WebP e PDF. Outro tipo ou acima do limite: o bot explica e pede de novo.
- Conta paga é imutável (spec 325 RF5): o anexo, porém, **pode ser acrescentado depois** da baixa (esquecer o comprovante é o caso comum). Remover um anexo exige `expenses.manage` e entra na trilha de auditoria.
- Auditoria: `expense.occurrence.attachment_added` / `_removed`, com canal (`panel` ou `whatsapp`); a baixa pelo WhatsApp leva `channel: whatsapp`.
- Migration **aditiva** (tabela nova, sem mexer nas existentes) e rollback.

## Fora do escopo

- Leitura do comprovante ou do boleto (OCR); conciliação bancária.
- Anexo no cadastro da conta (só no pagamento de cada vencimento).
- Pagamento de motorista/agregado/ajudante pelo WhatsApp (segue só no painel).
