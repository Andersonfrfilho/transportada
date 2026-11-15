# Feature 326 — Lançar contas pelo WhatsApp

> Pedido do Anderson, 2026-11-15: "a atendente, reconhecendo o número do financeiro, ofereça adicionar contas via WhatsApp". Resposta dele: vale **só para quem recebeu a permissão no perfil e tem número verificado**, e acontece **na conversa direta com a assistente**, não no grupo.
> Status: **aprovada** (2026-11-15, "pode fazer").

## Specs do mesmo assunto (lidas)

| Spec | O que já decidiu e esta spec **usa sem refazer**                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 325  | Módulo Contas: `expenses.read`/`expenses.manage` (só `company-admin`, concedível por grupo), `createExpense`, categorias, auditoria. |
| 144  | Conversa direta: número verificado + vínculo com a empresa do canal; menu raiz filtrado por permissão; `FlowAction` reconfere.       |
| 294  | O atendente direto com o bot (baixa e encerrar rota) — molde de fluxo por texto livre.                                               |

## Quem pode

- Quem tem `expenses.manage` no vínculo (hoje o administrador; o financeiro, se o administrador der a permissão por grupo) **e** número verificado. O papel `finance` **não** ganha a permissão por esta spec.
- Motorista, agregado e ajudante **nunca** lançam: não têm a permissão, e a ação recusa também quem carregar um desses papéis, mesmo com a permissão vinda por outro caminho.
- A opção "💰 Lançar conta" só aparece no menu de quem tem a permissão; a `FlowAction` confere de novo (menu escondido não é autorização).

## Fluxo (v1)

1. Menu raiz → "💰 Lançar conta".
2. Fixa ou variável (botões).
3. Nome da conta (texto).
4. Categoria (lista das categorias ativas, sem a de pagamento de motorista/agregado).
5. Valor (texto: `1500`, `1.500,50`, `R$ 1500`).
6. Variável: vencimento (`dd/mm`, `dd/mm/aaaa`, "hoje", "amanhã"). Fixa: periodicidade (mensal, bimestral, trimestral, anual) e dia do vencimento (1 a 31).
7. Resumo com **Confirmar**, **Corrigir** (recomeça) e **Cancelar**. Só grava depois do Confirmar, pelo mesmo caso de uso do painel; a trilha de auditoria leva `channel: whatsapp`.

"cancelar" em qualquer passo encerra e volta ao menu.

## Fora do escopo

- Pagamento de motorista/agregado/ajudante, parcelas, veículo: só no painel.
- Foto ou PDF de boleto (a spec 325 deixa OCR de boleto fora). A atendente pede valor e vencimento por texto.
- Modelo de mensagem novo: não há; a conversa começa pelo financeiro, dentro da janela de 24 h.
