export interface CNPJData {
  razao_social: string;
  nome_fantasia: string;
  telefone: string;
  email: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
}

export async function lookupCNPJ(cnpj: string): Promise<{
  ok: boolean;
  data?: CNPJData;
  error?: string;
}> {
  const clean = cnpj.replace(/\D/g, "");
  if (clean.length !== 14) return { ok: false, error: "CNPJ inválido (deve conter 14 dígitos)." };
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`);
    if (!res.ok) {
      if (res.status === 404) return { ok: false, error: "CNPJ não encontrado." };
      return { ok: false, error: `Erro na consulta (${res.status}).` };
    }
    const d = await res.json();
    return {
      ok: true,
      data: {
        razao_social: d.razao_social || "",
        nome_fantasia: d.nome_fantasia || "",
        telefone: d.ddd_telefone_1 ? `(${d.ddd_telefone_1.substring(0, 2)})${d.ddd_telefone_1.substring(2)}` : "",
        email: d.email || "",
        logradouro: d.logradouro || "",
        numero: d.numero || "",
        complemento: d.complemento || "",
        bairro: d.bairro || "",
        municipio: d.municipio || "",
        uf: d.uf || "",
      },
    };
  } catch {
    return { ok: false, error: "Erro ao consultar CNPJ." };
  }
}

export function formatCNPJ(value: string): string {
  const digits = value.replace(/\D/g, "").substring(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").substring(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  if (digits.length <= 7) return `(${digits.slice(0, 2)})${digits.slice(2)}`;
  return `(${digits.slice(0, 2)})${digits.slice(2, 7)}-${digits.slice(7)}`;
}
