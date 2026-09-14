import { z } from "zod";

import {
  executionPlanSchema,
  intentSchema,
  intentStateTransitionSchema,
  policyEvaluationSchema,
  proofBundleSchema,
  recommendationSchema,
  transactionReceiptSchema,
} from "./contracts.js";

export const domainJsonSchemas = Object.freeze({
  intent: z.toJSONSchema(intentSchema),
  recommendation: z.toJSONSchema(recommendationSchema),
  policyEvaluation: z.toJSONSchema(policyEvaluationSchema),
  executionPlan: z.toJSONSchema(executionPlanSchema),
  transactionReceipt: z.toJSONSchema(transactionReceiptSchema),
  proofBundle: z.toJSONSchema(proofBundleSchema),
  intentStateTransition: z.toJSONSchema(intentStateTransitionSchema),
});
