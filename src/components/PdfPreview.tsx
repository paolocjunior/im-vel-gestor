import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfPreviewProps {
  fileUrl: string;
  fileName: string;
}

export default function PdfPreview({ fileUrl, fileName }: PdfPreviewProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="text-center py-8 space-y-2">
        <p className="text-sm text-muted-foreground">Não foi possível exibir o PDF.</p>
        <a href={fileUrl} download={fileName} className="text-primary underline text-sm">
          Clique aqui para baixar
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <Document
        file={fileUrl}
        onLoadSuccess={({ numPages }) => { setNumPages(numPages); setCurrentPage(1); }}
        onLoadError={() => setError(true)}
        loading={<p className="text-sm text-muted-foreground py-8">Carregando PDF...</p>}
      >
        <Page
          pageNumber={currentPage}
          renderTextLayer={false}
          renderAnnotationLayer={false}
          width={Math.min(700, window.innerWidth - 80)}
          className="shadow-md"
        />
      </Document>

      {numPages > 0 && (
        <div className="flex items-center gap-3">
          <Button
            variant="outline" size="icon"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(p => p - 1)}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {currentPage} / {numPages}
          </span>
          <Button
            variant="outline" size="icon"
            disabled={currentPage >= numPages}
            onClick={() => setCurrentPage(p => p + 1)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          <a href={fileUrl} download={fileName}>
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-1" /> Baixar
            </Button>
          </a>
        </div>
      )}
    </div>
  );
}
