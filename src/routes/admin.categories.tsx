import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/categories")({
  component: CategoriesPage,
});

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
}

function CategoriesPage() {
  const [items, setItems] = useState<Category[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);

  async function load() {
    const { data } = await supabase.from("categories").select("*").order("sort_order");
    setItems((data as Category[]) || []);
  }
  useEffect(() => {
    load();
  }, []);

  async function toggleActive(c: Category) {
    await supabase.from("categories").update({ is_active: !c.is_active }).eq("id", c.id);
    load();
  }

  async function remove(c: Category) {
    if (!confirm(`Eliminare ${c.name}?`)) return;
    await supabase.from("categories").delete().eq("id", c.id);
    toast.success("Categoria eliminata");
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Categorie</h1>
          <p className="text-muted-foreground">Tassonomia per organizzare il catalogo.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing(null)}>
              <Plus className="mr-2 h-4 w-4" /> Nuova categoria
            </Button>
          </DialogTrigger>
          <CategoryDialog
            category={editing}
            onSaved={() => {
              setOpen(false);
              load();
            }}
          />
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{items.length} categorie</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Ordine</TableHead>
                <TableHead>Attiva</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-12">
                    Nessuna categoria.
                  </TableCell>
                </TableRow>
              )}
              {items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="font-mono text-xs">{c.slug}</TableCell>
                  <TableCell>{c.sort_order}</TableCell>
                  <TableCell>
                    <Switch checked={c.is_active} onCheckedChange={() => toggleActive(c)} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditing(c);
                        setOpen(true);
                      }}
                    >
                      Modifica
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => remove(c)}
                    >
                      Elimina
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function CategoryDialog({
  category,
  onSaved,
}: {
  category: Category | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: category?.name || "",
    slug: category?.slug || "",
    description: category?.description || "",
    image_url: category?.image_url || "",
    sort_order: category?.sort_order ?? 0,
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim() || form.name.trim().toLowerCase().replace(/\s+/g, "-"),
        description: form.description || null,
        image_url: form.image_url || null,
        sort_order: Number(form.sort_order),
      };
      if (category) {
        await supabase.from("categories").update(payload).eq("id", category.id);
        toast.success("Categoria aggiornata");
      } else {
        await supabase.from("categories").insert(payload);
        toast.success("Categoria creata");
      }
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{category ? "Modifica categoria" : "Nuova categoria"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-2">
          <Label>Nome</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Slug</Label>
          <Input
            placeholder="auto"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Descrizione</Label>
          <Textarea
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Immagine URL</Label>
            <Input
              value={form.image_url}
              onChange={(e) => setForm({ ...form, image_url: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Ordine</Label>
            <Input
              type="number"
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
            />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={save} disabled={saving || !form.name}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salva
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
