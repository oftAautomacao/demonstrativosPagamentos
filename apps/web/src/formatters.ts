export function formatDateOnly(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR');
}

export function formatDateTime(value: string | null): string {
  if (!value) {
    return 'Nao informado';
  }

  return new Date(value).toLocaleString('pt-BR');
}
