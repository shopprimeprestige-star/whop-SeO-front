import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, X } from "lucide-react";
import { uploadBrandAsset } from "@/lib/storage-upload";
import { toast } from "sonner";

type Props = {
  value?: string | null;
  onChange: (url: string) => void;
  folder?: "logo" | "payment" | "courier" | "cert";
  /** Background color shown behind the preview thumbnail */
  preview?: "light" | "dark";
  /** Label for accessibility / button */
  label?: string;
};

/**
 * Compact upload+URL combo: choose a file (uploaded to brand-assets bucket)
 * or paste an external URL. Shows a preview thumbnail with a clear button.
 */
export function AssetUploader({ value, onChange, folder = "logo", preview = "light", label }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File) => {
    setBusy(true);
    try {
      const { url } = await uploadBrandAsset(file, folder);
      onChange(url);
      toast.success("Logo caricato");
    } catch (e: any) {
      toast.error(e?.message || "Upload fallito");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-2">
      {value ? (
        <div
          className={`relative h-12 w-20 shrink-0 rounded-md ring-1 ring-border overflow-hidden flex items-center justify-center px-1.5 ${
            preview === "dark" ? "bg-zinc-900" : "bg-white"
          }`}
        >
          <img src={value} alt="preview" className="max-h-full max-w-full object-contain" />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
            title="Rimuovi"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      ) : (
        <div className={`h-12 w-20 shrink-0 rounded-md border border-dashed flex items-center justify-center text-[10px] text-muted-foreground ${
          preview === "dark" ? "bg-zinc-900 border-zinc-700" : "bg-muted/30"
        }`}>
          no img
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        title={label || "Carica immagine"}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        <span className="ml-1.5 text-xs">{busy ? "Upload…" : "Carica"}</span>
      </Button>
    </div>
  );
}
