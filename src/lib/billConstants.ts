// Cost Center → Category hierarchy
export const COST_CENTERS: Record<string, string[]> = {
  "Administrativo": ["Escritório", "Material de Escritório", "Seguros", "Licenças", "Outros"],
  "Marketing": ["Anúncios", "Mídia", "Eventos", "Brindes", "Outros"],
  "Obra": ["Material de Construção", "Mão de Obra", "Ferramentas", "Equipamentos", "Outros"],
  "Financeiro": ["Taxas Bancárias", "Impostos", "Juros", "Multas", "Outros"],
  "Manutenção": ["Elétrica", "Hidráulica", "Pintura", "Limpeza", "Outros"],
  "Jurídico": ["Honorários", "Taxas", "Cartório", "Outros"],
  "Outros": ["Diversos"],
};

export const COST_CENTER_OPTIONS = Object.keys(COST_CENTERS);

export const PAYMENT_METHODS = [
  "Pix", "Dinheiro", "Transferência", "Boleto",
  "Débito em Conta", "Cartão de Crédito", "Cartão de Débito", "Cheque", "Outros",
];

export const INSTALLMENT_OPTIONS = [
  { label: "À Vista", value: "AVISTA" },
  ...Array.from({ length: 60 }, (_, i) => ({ label: `${i + 1}x`, value: `${i + 1}x` })),
];

export const formatDateBR = (d: string) => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

export const todayISO = () => {
  const d = new Date();
  return d.toISOString().slice(0, 10);
};

export const addDaysISO = (base: string, days: number): string => {
  const d = new Date(base + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
