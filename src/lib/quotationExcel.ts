import * as XLSX from "xlsx";
import { formatCPFCNPJ, formatPhone } from "@/lib/cnpjLookup";

interface Profile {
  full_name: string | null;
  person_type: string;
  cpf_cnpj: string | null;
  inscricao_estadual: string | null;
  email: string | null;
  phone: string | null;
  street: string | null;
  street_number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  cep: string | null;
}

interface Vendor {
  nome_fantasia: string | null;
  razao_social: string | null;
  email: string | null;
  cnpj: string | null;
  phone: string | null;
}

interface QuotationItem {
  code: string;
  name: string;
  unit_abbr: string;
  quantity: number;
  observation: string;
}

interface QuotationExcelParams {
  quotationNumber: number;
  profile: Profile;
  vendor: Vendor | null;
  vendorEmail: string;
  items: QuotationItem[];
  message: string;
}

function formatAddress(p: Profile): string {
  const parts = [p.street, p.street_number, p.complement, p.neighborhood, p.city, p.state].filter(Boolean);
  return parts.join(", ") || "—";
}

function formatDoc(p: Profile): string {
  if (!p.cpf_cnpj) return "—";
  return formatCPFCNPJ(p.cpf_cnpj, p.person_type);
}

export function generateQuotationExcel(params: QuotationExcelParams): XLSX.WorkBook {
  const { quotationNumber, profile, vendor, vendorEmail, items, message } = params;
  const isPF = profile.person_type === "PF";

  const rows: (string | number)[][] = [];

  // Header
  rows.push(["Solicitação de Cotação"]);
  rows.push([`Nº ${String(quotationNumber).padStart(3, "0")}`, "", `Data: ${new Date().toLocaleDateString("pt-BR")}`]);
  rows.push([]);

  // Emitente
  rows.push(["EMITENTE"]);
  rows.push([isPF ? "Nome" : "Razão Social", profile.full_name || "—"]);
  rows.push([isPF ? "CPF" : "CNPJ", formatDoc(profile)]);
  if (!isPF && profile.inscricao_estadual) {
    rows.push(["I.E.", profile.inscricao_estadual]);
  }
  rows.push(["E-mail", profile.email || "—"]);
  rows.push(["Telefone", profile.phone ? formatPhone(profile.phone) : "—"]);
  rows.push(["Endereço", formatAddress(profile)]);
  rows.push([]);

  // Fornecedor
  rows.push(["FORNECEDOR"]);
  if (vendor) {
    rows.push(["Nome", vendor.nome_fantasia || vendor.razao_social || "—"]);
    if (vendor.cnpj) rows.push(["CNPJ", formatCPFCNPJ(vendor.cnpj, "PJ")]);
  }
  rows.push(["E-mail", vendorEmail || "—"]);
  rows.push([]);

  // Items header
  rows.push(["ITENS DA COTAÇÃO"]);
  rows.push(["#", "Código", "Descrição", "Un", "Qtde", "Preço Unit.", "Preço Total", "Observação"]);
  items.forEach((item, idx) => {
    rows.push([idx + 1, item.code, item.name, item.unit_abbr || "—", item.quantity, "", "", item.observation || ""]);
  });
  rows.push([]);

  // Message
  if (message) {
    rows.push(["MENSAGEM"]);
    rows.push([message]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths
  ws["!cols"] = [
    { wch: 5 },
    { wch: 12 },
    { wch: 35 },
    { wch: 6 },
    { wch: 8 },
    { wch: 14 },
    { wch: 14 },
    { wch: 30 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Cotação");
  return wb;
}

export function downloadQuotationExcel(params: QuotationExcelParams): void {
  const wb = generateQuotationExcel(params);
  XLSX.writeFile(wb, `cotacao-${String(params.quotationNumber).padStart(3, "0")}.xlsx`);
}

export function quotationExcelBlob(params: QuotationExcelParams): Blob {
  const wb = generateQuotationExcel(params);
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
