import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";

export interface WizardStep {
  title: string;
  description?: string;
  /** ReactNode oppure una render-prop che riceve { next } per avanzare dallo step (usato con hideNav). */
  content: ReactNode | ((ctx: { next: () => void }) => ReactNode);
  /** Se false, il pulsante "Avanti" è disabilitato. Default: consentito. */
  valid?: boolean;
  /** Se true, nasconde i pulsanti di navigazione: lo step avanza chiamando next() dal contenuto. */
  hideNav?: boolean;
}

/**
 * Motore di avanzamento riutilizzabile.
 * Stato = un solo indice. Barra di progresso a segmenti + "Passo X di N".
 * In basso: Indietro (o "Annulla" al primo step) e Avanti (disabilitato se valid===false);
 * all'ultimo step il pulsante diventa finalLabel e chiama onComplete().
 */
export function Wizard({
  steps,
  onComplete,
  submitting = false,
  finalLabel = "Completa",
  onCancel,
}: {
  steps: WizardStep[];
  onComplete: () => void;
  submitting?: boolean;
  finalLabel?: string;
  onCancel?: () => void;
}) {
  const [index, setIndex] = useState(0);
  const total = steps.length;
  const clamped = Math.min(index, total - 1);
  const step = steps[clamped];
  const isLast = clamped === total - 1;

  const next = () => setIndex((i) => Math.min(i + 1, total - 1));
  const back = () => setIndex((i) => Math.max(i - 1, 0));

  const content = typeof step.content === "function" ? step.content({ next }) : step.content;
  const canAdvance = step.valid !== false;

  return (
    <div className="space-y-5">
      {/* Barra di progresso a segmenti + "Passo X di N" */}
      <div>
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Passo {clamped + 1} di {total}
          </span>
          <span className="font-medium text-foreground">{step.title}</span>
        </div>
        <div className="flex gap-1.5">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= clamped ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Contenuto step */}
      <div>
        <h3 className="text-base font-semibold">{step.title}</h3>
        {step.description && <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>}
        <div className="mt-4">{content}</div>
      </div>

      {/* Navigazione (nascosta sugli step hideNav) */}
      {!step.hideNav && (
        <div className="flex items-center justify-between border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={clamped === 0 ? onCancel : back}
            disabled={clamped === 0 && !onCancel}
          >
            {clamped === 0 ? (
              "Annulla"
            ) : (
              <>
                <ArrowLeft className="mr-1.5 h-4 w-4" /> Indietro
              </>
            )}
          </Button>
          <Button
            type="button"
            onClick={isLast ? onComplete : next}
            disabled={!canAdvance || (isLast && submitting)}
          >
            {isLast && submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {isLast ? (
              finalLabel
            ) : (
              <>
                Avanti <ArrowRight className="ml-1.5 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
