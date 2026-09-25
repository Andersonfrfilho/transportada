/* Copyright (c) 2026 Ada Technology. MIT License. */
/** RF3 (ADR-0075 §2): sem `trip.read` a mensagem é essa, sem link — a conta não é de motorista. */
export function DriverForbiddenPage() {
  return (
    <main className="page">
      <div className="panel">
        <h1 className="page__title">Sem acesso</h1>
        <p role="alert">Esta conta não é de motorista; use o painel da transportadora.</p>
      </div>
    </main>
  )
}
