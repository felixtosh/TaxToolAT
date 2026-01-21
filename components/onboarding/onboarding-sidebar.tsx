"use client";

import { useRouter, usePathname } from "next/navigation";
import {
  Building2,
  Upload,
  Users,
  FileCheck,
  Check,
  ChevronRight,
  Loader2,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useOnboarding } from "@/hooks/use-onboarding";
import { OnboardingStepConfig, OnboardingStep } from "@/types/onboarding";

// Map icon names to components
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Building2,
  Upload,
  Users,
  FileCheck,
  User,
};

interface StepItemProps {
  step: OnboardingStepConfig;
  index: number;
  isCompleted: boolean;
  isCurrent: boolean;
  isInProgress: boolean;
  onNavigate: () => void;
}

function StepItem({
  step,
  index,
  isCompleted,
  isCurrent,
  isInProgress,
  onNavigate,
}: StepItemProps) {
  const Icon = iconMap[step.icon] || FileCheck;

  return (
    <div
      className={cn(
        "relative flex gap-3 p-3 rounded-lg transition-colors",
        isCurrent && "bg-primary/10 border border-primary/20",
        isCompleted && !isCurrent && "opacity-70"
      )}
    >
      {/* Step number / check icon */}
      <div
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
          isCompleted
            ? "bg-primary text-primary-foreground"
            : isCurrent
            ? "bg-primary/20 text-primary border-2 border-primary"
            : "bg-muted text-muted-foreground"
        )}
      >
        {isCompleted ? (
          <Check className="h-4 w-4" />
        ) : isInProgress ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          index + 1
        )}
      </div>

      {/* Step content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Icon className={cn(
            "h-4 w-4",
            isCurrent ? "text-primary" : "text-muted-foreground"
          )} />
          <span
            className={cn(
              "font-medium text-sm",
              isCurrent && "text-primary",
              isCompleted && "line-through"
            )}
          >
            {step.title}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
          {step.description}
        </p>

        {/* Navigate button or in-progress indicator for current step */}
        {isCurrent && (
          isInProgress ? (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-primary font-medium">
              <Loader2 className="h-3 w-3 animate-spin" />
              In progress...
            </div>
          ) : (
            <Button
              size="sm"
              className="mt-2 h-7 text-xs"
              onClick={onNavigate}
            >
              Go to step
              <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          )
        )}
      </div>
    </div>
  );
}

/**
 * Check if user is actively working on a step based on current pathname
 */
function isUserInProgressOnStep(stepId: OnboardingStep, pathname: string): boolean {
  switch (stepId) {
    case "set_identity":
      // User is on identity settings page
      return pathname === "/settings/identity";
    case "add_bank_account":
      // User is on sources page (adding account)
      return pathname === "/sources" || pathname === "/sources/connect";
    case "import_transactions":
      // User is on import page for any source
      return pathname.match(/^\/sources\/[^/]+\/import/) !== null;
    case "assign_partner":
      // User is on transactions page (assigning partner)
      return pathname === "/transactions";
    case "attach_file":
      // User is on transactions page (attaching file to transaction)
      // Note: /files page doesn't count as "in progress" since the step is about
      // attaching files TO transactions, not just viewing files
      return pathname === "/transactions";
    default:
      return false;
  }
}

export function OnboardingSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const {
    steps,
    currentStep,
    isStepCompleted,
    progress,
    loading,
  } = useOnboarding();

  const handleNavigate = (route: string) => {
    if (pathname !== route) {
      router.push(route);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b">
        <h2 className="font-semibold text-lg">Getting Started</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Complete these steps to set up your account
        </p>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span>Progress</span>
            <span>{progress.completed} of {progress.total} complete</span>
          </div>
          <Progress value={progress.percentage} className="h-2" />
        </div>
      </div>

      {/* Steps list */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
          {steps.map((step, index) => {
            const isCompleted = isStepCompleted(step.id);
            const isCurrent = currentStep === step.id;
            const isInProgress = isCurrent && isUserInProgressOnStep(step.id, pathname);

            return (
              <StepItem
                key={step.id}
                step={step}
                index={index}
                isCompleted={isCompleted}
                isCurrent={isCurrent}
                isInProgress={isInProgress}
                onNavigate={() => handleNavigate(step.route)}
              />
            );
          })}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-4 border-t">
        <p className="text-xs text-muted-foreground text-center">
          Complete all steps to unlock the full experience
        </p>
      </div>
    </div>
  );
}
