/**
 * Automation Registry
 *
 * Central registry of all automation pipelines and steps.
 * This provides transparency into how transactions are matched
 * to partners and files automatically.
 *
 * IMPORTANT: Automation definitions are imported from /lib/matching/automation-defs.ts
 * which lives alongside the actual matching logic. This ensures the registry
 * stays in sync with the implementation.
 */

import type {
  AutomationPipeline,
  AutomationStep,
  PipelineId,
} from "@/types/automation";
import {
  ALL_PIPELINES,
  PARTNER_MATCH_CONFIG,
} from "@/lib/matching/automation-defs";

// Re-export config for use by matching functions
export { PARTNER_MATCH_CONFIG };

// Re-export all pipelines
export const AUTOMATION_PIPELINES = ALL_PIPELINES;

/**
 * Get a pipeline by its ID
 */
export function getPipelineById(id: PipelineId): AutomationPipeline | undefined {
  return AUTOMATION_PIPELINES.find((p) => p.id === id);
}

/**
 * Get all pipelines
 */
export function getAllPipelines(): AutomationPipeline[] {
  return AUTOMATION_PIPELINES;
}

/**
 * Get a specific step by ID across all pipelines
 */
export function getStepById(stepId: string): AutomationStep | undefined {
  for (const pipeline of AUTOMATION_PIPELINES) {
    const step = pipeline.steps.find((s) => s.id === stepId);
    if (step) return step;
  }
  return undefined;
}

/**
 * Get all steps for a specific integration
 */
export function getStepsForIntegration(
  integrationId: string
): AutomationStep[] {
  const steps: AutomationStep[] = [];
  for (const pipeline of AUTOMATION_PIPELINES) {
    steps.push(...pipeline.steps.filter((s) => s.integrationId === integrationId));
  }
  return steps;
}

/**
 * Get all integration IDs used by automations
 */
export function getRequiredIntegrations(): string[] {
  const integrations = new Set<string>();
  for (const pipeline of AUTOMATION_PIPELINES) {
    for (const step of pipeline.steps) {
      if (step.integrationId) {
        integrations.add(step.integrationId);
      }
    }
  }
  return Array.from(integrations);
}
