"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface OnboardingCompletionProps {
  open: boolean;
  onDismiss: () => void;
}

export function OnboardingCompletion({
  open,
  onDismiss,
}: OnboardingCompletionProps) {
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (open) {
      // Delay confetti slightly for dramatic effect
      const timer = setTimeout(() => setShowConfetti(true), 200);
      return () => clearTimeout(timer);
    } else {
      setShowConfetti(false);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onDismiss()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center pb-4">
          {/* Animated icon */}
          <div className="mx-auto mb-4 relative">
            <div
              className={cn(
                "w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center",
                "transition-transform duration-500",
                showConfetti && "scale-110"
              )}
            >
              <CheckCircle2
                className={cn(
                  "h-10 w-10 text-primary",
                  "transition-all duration-500",
                  showConfetti && "scale-110"
                )}
              />
            </div>

            {/* Sparkle decorations */}
            {showConfetti && (
              <>
                <Sparkles
                  className={cn(
                    "absolute -top-2 -right-2 h-6 w-6 text-yellow-500",
                    "animate-in zoom-in fade-in duration-300"
                  )}
                />
                <Sparkles
                  className={cn(
                    "absolute -bottom-1 -left-3 h-5 w-5 text-yellow-500",
                    "animate-in zoom-in fade-in duration-500 delay-100"
                  )}
                />
                <Sparkles
                  className={cn(
                    "absolute top-0 -left-4 h-4 w-4 text-primary",
                    "animate-in zoom-in fade-in duration-500 delay-200"
                  )}
                />
              </>
            )}
          </div>

          <DialogTitle className="text-2xl font-bold">
            You&apos;re all set!
          </DialogTitle>
          <DialogDescription className="text-base mt-2">
            Congratulations! You&apos;ve completed the setup. Your account is now
            ready to help you manage your transactions and receipts.
          </DialogDescription>
        </DialogHeader>

        {/* Features unlocked */}
        <div className="bg-muted/50 rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-muted-foreground">
            What&apos;s next:
          </p>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
              <span>AI assistant ready to help categorize transactions</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
              <span>Automatic receipt matching enabled</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
              <span>Partner suggestions for faster bookkeeping</span>
            </li>
          </ul>
        </div>

        {/* Action button */}
        <Button onClick={onDismiss} className="w-full mt-4">
          Start using TaxStudio
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </DialogContent>
    </Dialog>
  );
}
