/**
 * Funções utilitárias SOMENTE para exibição de datas na UI.
 * NÃO usam new Date(). NÃO dependem de timezone.
 * NÃO alteram valores internos — apenas formatam strings para display.
 */

/**
 * Converte competência mensal YYYY-MM → MM/YYYY
 * Exemplo: "2025-03" → "03/2025"
 */
export function formatMonthDisplay(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  return `${month}/${year}`;
}

/**
 * Converte data completa YYYY-MM-DD → DD/MM/YYYY
 * Exemplo: "2025-03-15" → "15/03/2025"
 */
export function formatDateDisplay(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}
