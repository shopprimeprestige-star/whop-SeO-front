-- Sostituisce i contenuti delle pagine legali esistenti con versioni generiche senza placeholder
UPDATE public.legal_pages SET title = 'Privacy Policy', body_markdown = $$# Privacy Policy

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
Per maggiori informazioni consulta la Cookie Policy.$$ WHERE slug='privacy';

UPDATE public.legal_pages SET title = 'Termini e Condizioni', body_markdown = $$# Termini e Condizioni

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
Per qualsiasi controversia si applica la normativa europea a tutela del consumatore.$$ WHERE slug='terms';

UPDATE public.legal_pages SET title = 'Spedizioni', body_markdown = $$# Spedizioni

Spediamo gli ordini con corrieri tracciati in tutta Europa.

## Tempi di consegna
- 24-48h per la maggior parte delle destinazioni
- 3-5 giorni lavorativi per le aree più remote

## Costi
La spedizione è gratuita oltre la soglia indicata in fase di checkout. Sotto tale soglia viene applicato un contributo spese.

## Tracking
Una volta spedito, riceverai via email il codice di tracciamento per seguire la consegna in tempo reale.$$ WHERE slug='shipping';

UPDATE public.legal_pages SET title = 'Resi e Rimborsi', body_markdown = $$# Resi e Rimborsi

Hai a disposizione 30 giorni dalla consegna per restituire i prodotti acquistati.

## Come effettuare il reso
1. Contattaci tramite l'area dedicata sul sito indicando il numero d'ordine
2. Riceverai le istruzioni per la spedizione di reso
3. Spedisci il prodotto integro nella confezione originale

## Rimborsi
Il rimborso viene elaborato entro 14 giorni dalla ricezione del reso, sullo stesso metodo di pagamento utilizzato per l'acquisto.

## Prodotti non rimborsabili
Articoli personalizzati, sigillati per ragioni igieniche se aperti, e prodotti danneggiati per uso improprio.$$ WHERE slug='refunds';

-- Inserisce Cookie Policy se non presente
INSERT INTO public.legal_pages (slug, title, body_markdown, is_published)
SELECT 'cookies', 'Cookie Policy', $$# Cookie Policy

Questo sito utilizza cookie per garantire il corretto funzionamento e migliorare l'esperienza di navigazione.

## Tipologie di cookie
- **Tecnici**: necessari al funzionamento del sito (carrello, sessione, preferenze)
- **Analitici**: utilizzati in forma aggregata per misurare l'utilizzo del sito
- **Marketing**: solo previo consenso, per personalizzare comunicazioni e offerte

## Gestione del consenso
Puoi modificare le tue preferenze in qualsiasi momento dal banner cookie o dalle impostazioni del browser.

## Cookie di terze parti
Alcuni servizi (es. analytics, social media, pagamenti) impostano cookie di terze parti soggetti alle rispettive privacy policy.$$, true
WHERE NOT EXISTS (SELECT 1 FROM public.legal_pages WHERE slug='cookies');

-- Cancella le traduzioni cachate per le pagine legali (verranno rigenerate al prossimo run di traduzioni)
DELETE FROM public.translations WHERE entity_type='legal_page';