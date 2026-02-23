import { useState, useEffect, useRef } from "react";
import { Paperclip, Upload, X, Download, ChevronDown, ChevronRight, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PdfPreview from "@/components/PdfPreview";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AttachmentDoc {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type?: string | null;
}

interface AttachmentSectionProps {
  studyId: string;
  entity: string;
  entityId?: string | null;
  compact?: boolean;
  readOnly?: boolean;
}

export default function AttachmentSection({ studyId, entity, entityId, compact = false, readOnly = false }: AttachmentSectionProps) {
  const [attachments, setAttachments] = useState<AttachmentDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewName, setPreviewName] = useState("");
  const [previewType, setPreviewType] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const effectiveEntityId = entityId || entity;

  useEffect(() => {
    loadAttachments();
  }, [studyId, entity, entityId]);

  const loadAttachments = async () => {
    const { data } = await supabase.from("documents")
      .select("id, file_name, file_path, file_size, mime_type")
      .eq("study_id", studyId)
      .eq("entity", entity)
      .eq("entity_id", effectiveEntityId)
      .eq("is_deleted", false)
      .order("created_at");
    setAttachments(data || []);
  };

  const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_");

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const safeName = sanitizeFileName(file.name);
      const path = `${studyId}/${entity}/${effectiveEntityId}/${Date.now()}_${safeName}`;
      const { error: uploadErr } = await supabase.storage.from("documents").upload(path, file);
      if (uploadErr) { toast.error(`Erro ao enviar ${file.name}`); continue; }
      await supabase.from("documents").insert({
        study_id: studyId,
        entity,
        entity_id: effectiveEntityId,
        file_name: file.name,
        file_path: path,
        file_size: file.size,
        mime_type: file.type || null,
      });
    }
    setUploading(false);
    loadAttachments();
    toast.success("Arquivo(s) anexado(s)!");
  };

  const handleDownload = async (doc: AttachmentDoc) => {
    const { data } = await supabase.storage.from("documents").download(doc.file_path);
    if (!data) { toast.error("Erro ao baixar arquivo."); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url; a.download = doc.file_name; a.click();
    URL.revokeObjectURL(url);
  };

  const handlePreview = async (doc: AttachmentDoc) => {
    const { data } = await supabase.storage.from("documents").download(doc.file_path);
    if (!data) { toast.error("Erro ao carregar arquivo."); return; }
    const url = URL.createObjectURL(data);
    const mime = doc.mime_type || "";
    setPreviewUrl(url);
    setPreviewName(doc.file_name);
    setPreviewType(mime);
    setPreviewOpen(true);
  };

  const closePreview = () => {
    setPreviewOpen(false);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
  };

  const handleDelete = async (doc: AttachmentDoc) => {
    await supabase.storage.from("documents").remove([doc.file_path]);
    await supabase.from("documents").update({ is_deleted: true }).eq("id", doc.id);
    setAttachments(prev => prev.filter(a => a.id !== doc.id));
    toast.success("Anexo removido.");
  };

  const isPreviewable = (mime: string) => {
    return mime.startsWith("image/") || mime === "application/pdf";
  };

  const renderPreviewContent = () => {
    if (previewType.startsWith("image/")) {
      return <img src={previewUrl} alt={previewName} className="max-w-full max-h-[70vh] object-contain mx-auto" />;
    }
    if (previewType === "application/pdf") {
      return <PdfPreview fileUrl={previewUrl} fileName={previewName} />;
    }
    return <p className="text-sm text-muted-foreground py-8 text-center">Visualização não disponível para este tipo de arquivo. Use o botão de download.</p>;
  };

  if (compact) {
    return (
      <div className="mt-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Paperclip className="w-3 h-3" />
          <span>Anexos ({attachments.length})</span>
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
        {expanded && (
          <div className="mt-2 space-y-1">
            <input ref={fileInputRef} type="file" multiple className="hidden"
              onChange={e => { handleUpload(e.target.files); e.target.value = ""; }} />
            {!readOnly && (
              <Button type="button" variant="outline" size="sm" className="h-6 text-xs"
                onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                <Upload className="w-3 h-3 mr-1" /> {uploading ? "Enviando..." : "Adicionar"}
              </Button>
            )}
            {attachments.map(doc => (
              <div key={doc.id} className="flex items-center gap-1 text-xs bg-muted rounded px-2 py-0.5">
                <Paperclip className="w-2.5 h-2.5 shrink-0" />
                <span
                  className="flex-1 truncate cursor-pointer hover:underline"
                  onClick={() => handlePreview(doc)}
                  title="Clique para visualizar"
                >
                  {doc.file_name}
                </span>
                <button onClick={() => handleDownload(doc)} className="text-primary hover:text-primary/80" title="Download">
                  <Download className="w-3 h-3" />
                </button>
                {!readOnly && (
                  <button onClick={() => handleDelete(doc)} className="text-destructive hover:text-destructive/80" title="Excluir">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <Dialog open={previewOpen} onOpenChange={closePreview}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{previewName}</DialogTitle></DialogHeader>
            {renderPreviewContent()}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input ref={fileInputRef} type="file" multiple className="hidden"
        onChange={e => { handleUpload(e.target.files); e.target.value = ""; }} />
      {!readOnly && (
        <Button type="button" variant="outline" size="sm"
          onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          <Upload className="w-4 h-4 mr-1" /> {uploading ? "Enviando..." : "Adicionar Arquivo"}
        </Button>
      )}
      {attachments.map(doc => (
        <div key={doc.id} className="flex items-center gap-2 text-sm bg-muted rounded px-2 py-1">
          <Paperclip className="w-3 h-3 shrink-0" />
          <span
            className="flex-1 truncate cursor-pointer hover:underline"
            onClick={() => handlePreview(doc)}
            title="Clique para visualizar"
          >
            {doc.file_name}
          </span>
          {doc.file_size && <span className="text-muted-foreground text-xs">{(doc.file_size / 1024).toFixed(0)} KB</span>}
          <button onClick={() => handleDownload(doc)} className="text-primary hover:text-primary/80" title="Download">
            <Download className="w-3 h-3" />
          </button>
          {!readOnly && (
            <button onClick={() => handleDelete(doc)} className="text-destructive hover:text-destructive/80" title="Excluir">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}
      {attachments.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhum anexo.</p>
      )}

      <Dialog open={previewOpen} onOpenChange={closePreview}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{previewName}</DialogTitle></DialogHeader>
          {renderPreviewContent()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
