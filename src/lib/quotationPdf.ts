import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
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

interface QuotationPdfParams {
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

export function generateQuotationPdf(params: QuotationPdfParams): jsPDF {
  const { quotationNumber, profile, vendor, vendorEmail, items, message } = params;
  const isPF = profile.person_type === "PF";
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = 15;

  // Title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Solicitação de Cotação", pageWidth / 2, y, { align: "center" });
  y += 6;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Nº ${String(quotationNumber).padStart(3, "0")}`, pageWidth / 2, y, { align: "center" });
  y += 4;
  doc.text(`Data: ${new Date().toLocaleDateString("pt-BR")}`, pageWidth / 2, y, { align: "center" });
  y += 10;

  // Emitente section
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("EMITENTE", margin, y);
  y += 5;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");

  const emitLines: string[] = [];
  emitLines.push(`${isPF ? "Nome" : "Razão Social"}: ${profile.full_name || "—"}`);
  emitLines.push(`${isPF ? "CPF" : "CNPJ"}: ${formatDoc(profile)}`);
  if (!isPF && profile.inscricao_estadual) {
    emitLines.push(`I.E.: ${profile.inscricao_estadual}`);
  }
  emitLines.push(`E-mail: ${profile.email || "—"}`);
  emitLines.push(`Telefone: ${profile.phone ? formatPhone(profile.phone) : "—"}`);
  emitLines.push(`Endereço: ${formatAddress(profile)}`);

  for (const line of emitLines) {
    doc.text(line, margin, y);
    y += 4.5;
  }
  y += 4;

  // Fornecedor section
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("FORNECEDOR", margin, y);
  y += 5;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");

  if (vendor) {
    doc.text(`Nome: ${vendor.nome_fantasia || vendor.razao_social || "—"}`, margin, y);
    y += 4.5;
    if (vendor.cnpj) {
      doc.text(`CNPJ: ${formatCPFCNPJ(vendor.cnpj, "PJ")}`, margin, y);
      y += 4.5;
    }
  }
  doc.text(`E-mail: ${vendorEmail || "—"}`, margin, y);
  y += 8;

  // Items table
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("ITENS DA COTAÇÃO", margin, y);
  y += 2;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["#", "Código", "Descrição", "Un", "Qtde", "Observação"]],
    body: items.map((item, idx) => [
      String(idx + 1),
      item.code,
      item.name,
      item.unit_abbr || "—",
      String(item.quantity),
      item.observation || "",
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [60, 60, 60], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 20 },
      3: { cellWidth: 12, halign: "center" },
      4: { cellWidth: 15, halign: "right" },
    },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // Message
  if (message) {
    // Check if we need a new page
    if (y > 240) {
      doc.addPage();
      y = 15;
    }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("MENSAGEM", margin, y);
    y += 5;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(message, pageWidth - margin * 2);
    doc.text(lines, margin, y);
  }

  return doc;
}

export function quotationPdfBlob(params: QuotationPdfParams): Blob {
  const doc = generateQuotationPdf(params);
  return doc.output("blob");
}

export function downloadQuotationPdf(params: QuotationPdfParams): void {
  const doc = generateQuotationPdf(params);
  doc.save(`cotacao-${String(params.quotationNumber).padStart(3, "0")}.pdf`);
}
