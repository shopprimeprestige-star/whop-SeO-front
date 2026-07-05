import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { FileText, Loader2, Save, Plus, Trash2, Building2 } from "lucide-react";

export const Route = createFileRoute("/admin/legal")({
  component: LegalPage,
});

const LEGAL_TEMPLATES: Record<string, string> = {
  privacy: `# Privacy Policy

La presente Privacy Policy descrive le modalità con cui vengono trattati i dati personali degli utenti che visitano questo sito o effettuano acquisti.

## Titolare del trattamento
Il titolare del trattamento è la società che gestisce questo sito, contattabile tramite l'apposita sezione dedicata sul sito.

## Dati raccolti
Raccogliamo solo i dati strettamente necessari per: evadere gli ordini, fornire assistenza clienti, migliorare il servizio e — previo consenso — per finalità di marketing.

## Finalità e base giuridica
I dati vengono trattati per dare esecuzione al contratto di acquisto, per adempiere a obblighi di legge (es. fiscali) e, se hai prestato il consenso, per inviarti comunicazioni promozionali.

## Conservazione
I dati relativi agli ordini sono conservati per il tempo previsto dalla normativa fiscale. I dati di marketing finché non revochi il consenso.

## Diritti dell'interessato
Puoi richiedere in qualsiasi momento accesso, rettifica, cancellazione, limitazione e portabilità dei tuoi dati, oltre a opporti al trattamento, scrivendo all'indirizzo di contatto indicato sul sito.

## Cookie
Per maggiori informazioni consulta la Cookie Policy.`,

  terms: `# Termini e Condizioni

Gli acquisti effettuati su questo sito sono regolati dai presenti termini e condizioni.

## Oggetto
Il sito vende prodotti al consumatore finale tramite ordini online.

## Prezzi e pagamenti
Tutti i prezzi sono espressi nella valuta indicata e includono l'IVA quando applicabile. Sono accettati i metodi di pagamento indicati in fase di checkout.

## Spedizione
I tempi di consegna stimati sono indicati in fase d'ordine. Eventuali ritardi causati dal corriere non sono imputabili al venditore.

## Diritto di recesso
Il consumatore ha diritto di recedere dal contratto entro 30 giorni dalla consegna, senza necessità di motivazione, nei limiti previsti dalla normativa vigente.

## Garanzia
I prodotti sono coperti dalla garanzia legale di conformità prevista dal Codice del Consumo.

## Foro competente
Per qualsiasi controversia si applica la normativa europea a tutela del consumatore.`,

  shipping: `# Spedizioni

Spediamo gli ordini con corrieri tracciati in tutta Europa.

## Tempi di consegna
- 24-48h per la maggior parte delle destinazioni
- 3-5 giorni lavorativi per le aree più remote

## Costi
La spedizione è gratuita oltre la soglia indicata in fase di checkout. Sotto tale soglia viene applicato un contributo spese.

## Tracking
Una volta spedito, riceverai via email il codice di tracciamento per seguire la consegna in tempo reale.`,

  returns: `# Resi e Rimborsi

Hai a disposizione 30 giorni dalla consegna per restituire i prodotti acquistati.

## Come effettuare il reso
1. Contattaci tramite l'area dedicata sul sito indicando il numero d'ordine
2. Riceverai le istruzioni per la spedizione di reso
3. Spedisci il prodotto integro nella confezione originale

## Rimborsi
Il rimborso viene elaborato entro 14 giorni dalla ricezione del reso, sullo stesso metodo di pagamento utilizzato per l'acquisto.

## Prodotti non rimborsabili
Articoli personalizzati, sigillati per ragioni igieniche se aperti, e prodotti danneggiati per uso improprio.`,

  cookies: `# Cookie Policy

Questo sito utilizza cookie per garantire il corretto funzionamento e migliorare l'esperienza di navigazione.

## Tipologie di cookie
- **Tecnici**: necessari al funzionamento del sito (carrello, sessione, preferenze)
- **Analitici**: utilizzati in forma aggregata per misurare l'utilizzo del sito
- **Marketing**: solo previo consenso, per personalizzare comunicazioni e offerte

## Gestione del consenso
Puoi modificare le tue preferenze in qualsiasi momento dal banner cookie o dalle impostazioni del browser.

## Cookie di terze parti
Alcuni servizi (es. analytics, social media, pagamenti) impostano cookie di terze parti soggetti alle rispettive privacy policy.`,
};

function LegalPage() {
  const [tab, setTab] = useState("company");
  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground">
          <FileText className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Legale & Azienda</h1>
          <p className="text-sm text-muted-foreground">Dati aziendali centralizzati e pagine legali con placeholder</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="company"><Building2 className="h-3 w-3 mr-1" /> Dati azienda</TabsTrigger>
          <TabsTrigger value="pages"><FileText className="h-3 w-3 mr-1" /> Pagine legali</TabsTrigger>
        </TabsList>
        <TabsContent value="company"><CompanySection /></TabsContent>
        <TabsContent value="pages"><PagesSection /></TabsContent>
      </Tabs>
    </div>
  );
}

function CompanySection() {
  const [data, setData] = useState<any>({ company_name: "My Company", shipping_times: [], couriers: [], social_links: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: row } = await supabase.from("company_info").select("*").maybeSingle();
      if (row) setData(row);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const { error } = data.id
      ? await supabase.from("company_info").update(data).eq("id", data.id)
      : await supabase.from("company_info").insert(data);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Salvato");
  };

  if (loading) return <Loader2 className="h-6 w-6 animate-spin mx-auto mt-12" />;

  const f = (k: string, label: string, type = "text") => (
    <div>
      <Label>{label}</Label>
      <Input type={type} value={data[k] ?? ""} onChange={(e) => setData({ ...data, [k]: e.target.value })} />
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dati aziendali</CardTitle>
        <CardDescription>Usati nelle pagine legali, footer e fatture</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {f("company_name", "Nome commerciale *")}
          {f("legal_name", "Ragione sociale")}
          {f("vat_number", "P.IVA")}
          {f("tax_code", "Codice Fiscale")}
          {f("rea_number", "REA")}
          {f("contact_email", "Email contatto", "email")}
          {f("support_email", "Email supporto", "email")}
          {f("contact_phone", "Telefono")}
          {f("whatsapp", "WhatsApp")}
          {f("business_hours", "Orari ufficio")}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {f("address_line1", "Indirizzo")}
          {f("address_line2", "Indirizzo (riga 2)")}
          {f("city", "Città")}
          {f("postal_code", "CAP")}
          {f("province", "Provincia")}
          {f("country", "Paese (ISO)")}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Soglia spedizione gratuita (€)</Label>
            <Input type="number" value={data.free_shipping_threshold ?? 0} onChange={(e) => setData({ ...data, free_shipping_threshold: parseFloat(e.target.value) || 0 })} />
          </div>
          <div>
            <Label>Finestra reso (giorni)</Label>
            <Input type="number" value={data.return_window_days ?? 30} onChange={(e) => setData({ ...data, return_window_days: parseInt(e.target.value) || 30 })} />
          </div>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salva azienda
        </Button>
      </CardContent>
    </Card>
  );
}

function PagesSection() {
  const [pages, setPages] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase.from("legal_pages").select("*").order("slug");
    setPages(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing.slug || !editing.title) return toast.error("Slug e titolo richiesti");
    const { error } = editing.id
      ? await supabase.from("legal_pages").update(editing).eq("id", editing.id)
      : await supabase.from("legal_pages").insert(editing);
    if (error) return toast.error(error.message);
    toast.success("Pagina salvata");
    setEditing(null);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Eliminare questa pagina?")) return;
    await supabase.from("legal_pages").delete().eq("id", id);
    load();
  };

  const seed = async (key: string) => {
    const titles: Record<string, string> = {
      privacy: "Privacy Policy", terms: "Termini & Condizioni", shipping: "Spedizioni",
      returns: "Resi & Rimborsi", cookies: "Cookie Policy",
    };
    setEditing({ slug: key, title: titles[key], body_markdown: LEGAL_TEMPLATES[key], is_published: true });
  };

  if (loading) return <Loader2 className="h-6 w-6 animate-spin mx-auto mt-12" />;

  if (editing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{editing.id ? "Modifica" : "Nuova"} pagina legale</CardTitle>
          <CardDescription>Markdown con placeholder <code className="text-xs bg-muted px-1">{`{{company_name}}`}</code>, <code className="text-xs bg-muted px-1">{`{{vat_number}}`}</code>, ecc.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Slug</Label>
              <Input value={editing.slug || ""} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} />
            </div>
            <div>
              <Label>Titolo</Label>
              <Input value={editing.title || ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Contenuto (Markdown)</Label>
            <Textarea rows={20} className="font-mono text-xs" value={editing.body_markdown || ""} onChange={(e) => setEditing({ ...editing, body_markdown: e.target.value })} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={editing.is_published} onCheckedChange={(v) => setEditing({ ...editing, is_published: v })} />
            <Label>Pubblicata</Label>
          </div>
          <div className="flex gap-2">
            <Button onClick={save}><Save className="h-4 w-4 mr-2" /> Salva</Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>Annulla</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Pagine legali</CardTitle>
          <CardDescription>Privacy, termini, resi, cookie. Genera da template e personalizza.</CardDescription>
        </div>
        <Button size="sm" onClick={() => setEditing({ slug: "", title: "", body_markdown: "", is_published: true })}>
          <Plus className="h-4 w-4 mr-1" /> Nuova
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground self-center">Template rapidi:</span>
          {Object.keys(LEGAL_TEMPLATES).map((k) => (
            <Button key={k} size="sm" variant="outline" onClick={() => seed(k)}>{k}</Button>
          ))}
        </div>
        <div className="space-y-2">
          {pages.map((p) => (
            <div key={p.id} className="flex items-center justify-between p-3 border rounded-md hover:bg-accent/40">
              <div>
                <div className="font-medium">{p.title}</div>
                <div className="text-xs text-muted-foreground">/{p.slug} {p.is_published ? "" : "• bozza"}</div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>Modifica</Button>
                <Button size="sm" variant="ghost" onClick={() => remove(p.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
          {pages.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Nessuna pagina. Usa i template qui sopra.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
