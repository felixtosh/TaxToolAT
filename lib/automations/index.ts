/**
 * Automation System
 *
 * Provides transparency into the automatic matching algorithms
 * used for partner and file matching in transactions.
 *
 * ARCHITECTURE NOTE:
 * Automation definitions live in /lib/matching/automation-defs.ts alongside
 * the actual matching logic. This ensures the registry stays in sync with
 * the implementation. When you change matching thresholds or add new
 * automations, update that file.
 */

export {
  AUTOMATION_PIPELINES,
  PARTNER_MATCH_CONFIG,
  getPipelineById,
  getAllPipelines,
  getStepById,
  getStepsForIntegration,
  getRequiredIntegrations,
} from "./registry";
