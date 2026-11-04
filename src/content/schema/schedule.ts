/**
 * Schedule records (CONTENT_GUIDE §2.11, ARCHITECTURE §5.1): one sealed file
 * per month, `schedule/<yyyy-mm>.json`, plus the spare sets in `spares/`.
 * Daily numbers are never authored; they come from DAILY_EPOCH.
 */
import { z } from "zod";

import {
  DIFFICULTY_BANDS,
  agentId,
  isoDate,
  spareId,
  text,
} from "./primitives.ts";
import { ISSUE_SEVERITIES, RECORD_VERDICTS } from "./verification.ts";

/**
 * ARCHITECTURE §3.3's RoundType, without `ordering` (reserved, no v1
 * content). An mc, tf or comparison round names a sealed choice item of that
 * format (the AC-DLY-09 compositions of §5.6).
 */
export const ROUND_TYPES = [
  "mc",
  "tf",
  "comparison",
  "mystery",
  "encore",
] as const;
export type RoundType = (typeof ROUND_TYPES)[number];

export const RoundRecordSchema = z.strictObject({
  type: z.enum(ROUND_TYPES),
  difficulty: z.enum(DIFFICULTY_BANDS).nullable(),
  contentId: text,
});
export type RoundRecord = z.infer<typeof RoundRecordSchema>;

const dayCheckIssues = z.array(
  z.strictObject({
    type: text,
    severity: z.enum(ISSUE_SEVERITIES),
    note: text,
  }),
);

/**
 * The §10.6 day check: a fresh checker plays the whole Daily cold. The guide
 * (§2.11) names the date field `date`; ARCHITECTURE §5.1 shows `checkedAt`.
 * Both are accepted until the two documents agree.
 */
export const DayCheckSchema = z.union([
  z.strictObject({
    checker: agentId("fc"),
    date: isoDate,
    issues: dayCheckIssues,
    verdict: z.enum(RECORD_VERDICTS),
  }),
  z.strictObject({
    checker: agentId("fc"),
    checkedAt: isoDate,
    issues: dayCheckIssues,
    verdict: z.enum(RECORD_VERDICTS),
  }),
]);

export const DAILY_STATUSES = ["assembled", "frozen", "published"] as const;

/** + The spare sets ranked for a date (§10.7), each named once. */
export const SpareOrderSchema = z.array(spareId).superRefine((order, ctx) => {
  order.forEach((id, index) => {
    if (order.indexOf(id) !== index) {
      ctx.addIssue({
        code: "custom",
        path: [index],
        message: `${id} is ranked twice`,
      });
    }
  });
});

export const DailyRecordSchema = z.strictObject({
  date: isoDate,
  rounds: z.array(RoundRecordSchema).min(1),
  /** + (§10.7) */
  status: z.enum(DAILY_STATUSES),
  /** + The sum of its mysteries' predicted expected points (§8.3). */
  predictedPoints: z.number().min(0),
  /** + Null until the day check has run. */
  dayCheck: DayCheckSchema.nullable(),
  /**
   * + The spare sets for this date, fewest broken week and date rules
   * first (§2.11, §10.7). The release loads it into dailies.spare_order.
   * Optional in the file, so schedules written before the field existed
   * still parse; content:check warns on a main-track Daily without one
   * while spare sets exist (X30).
   */
  spareOrder: SpareOrderSchema.optional(),
});
export type DailyRecord = z.infer<typeof DailyRecordSchema>;

export const ScheduleMonthSchema = z
  .strictObject({
    track: z.enum(["main", "e2e"]),
    dailies: z.array(DailyRecordSchema),
  })
  .superRefine((month, ctx) => {
    month.dailies.forEach((daily, index) => {
      const previous = month.dailies[index - 1];
      if (previous && previous.date >= daily.date) {
        ctx.addIssue({
          code: "custom",
          path: ["dailies", index, "date"],
          message: "dailies are in date order, one per date",
        });
      }
    });
  });
export type ScheduleMonth = z.infer<typeof ScheduleMonthSchema>;

/**
 * A spare set (§10.7): the same round records, no date. `track` says which
 * schedule it backs; the release loads it into daily_spares on that track
 * (ARCHITECTURE §5.1.1).
 */
export const SpareSetSchema = z.strictObject({
  /** `spare.<NN>` (ARCHITECTURE §2.4); the file is spares/spare.<NN>.json. */
  id: spareId,
  track: z.enum(["main", "e2e"]),
  rounds: z.array(RoundRecordSchema).min(1),
  status: z.enum(["assembled", "frozen"]),
  predictedPoints: z.number().min(0),
  dayCheck: DayCheckSchema.nullable(),
});
export type SpareSet = z.infer<typeof SpareSetSchema>;
