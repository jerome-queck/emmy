# Supplied token review

Run `node scripts/agent.mjs token-review --file <private-capture.json>` on an explicitly supplied capture. It reads one ordinary UTF-8 JSON file of at most 256 KiB, returns its exact byte SHA-256 and the actual evaluation instant, and writes no files. It does not scrape telemetry or sessions, query billing, invoke workers, select models, change instructions or create schedules.

A minimal complete capture follows. Replace the synthetic timestamps and references with original source times and references from the review. The interval is half-open, including its start and excluding its end, and is interpreted as instants in Singapore. Timestamps accept UTC or Singapore's `+08:00` offset. Keep the complete objective cohort, failed work, retries, helpers and coordination in the supplied inventory. A fresh acquisition wrapper does not refresh the original review window or observed time.

```json
{
  "schemaVersion": 1,
  "reviewWindow": {
    "start": "2026-10-29T08:00:00+08:00",
    "end": "2026-10-29T09:00:00+08:00",
    "timeZone": "Asia/Singapore"
  },
  "maxEvidenceAgeHours": 24,
  "inventory": { "objectives": "complete", "attempts": "complete" },
  "evidence": [{
    "id": "source-1",
    "ref": "private:original-usage-and-outcome",
    "observedAt": "2026-10-29T08:59:00+08:00",
    "acquiredAt": "2026-10-29T09:00:00+08:00"
  }],
  "objectives": [{
    "id": "objective-1",
    "outcome": "verified-success",
    "evidenceIds": ["source-1"]
  }],
  "attempts": [{
    "id": "attempt-1",
    "objectiveId": "objective-1",
    "workerId": "worker-1",
    "kind": "worker",
    "evidenceIds": ["source-1"],
    "usage": { "basis": "measured", "unit": "tokens", "input": 100, "cachedInput": 40, "output": 20 },
    "cost": { "basis": "measured", "currency": "USD", "unit": "microdollar", "value": 25 }
  }],
  "observations": []
}
```

Inventory declarations accept `complete`, `partial`, or `unavailable`. Objective outcomes accept `verified-success`, `failed`, `pending`, or `unknown`. Every settled outcome and attempt needs references to eligible evidence. Both original observed and acquired times must meet the declared maximum age. Future, reversed, outside-window and stale evidence cannot establish complete cost. The original review window must also remain current. The default is not inferred; `maxEvidenceAgeHours` is required and must be 1 through 8760.

Each disjoint leaf attempt has a stable ID, objective ID and worker ID. Kinds are `worker`, `retry`, and `coordination`. Aggregate rows and extra fields such as `covers` are rejected. Include every failed objective's attempts, every retry, and all helper and coordination attempts. Duplicate IDs are rejected within each collection. Distinct IDs do not establish disjoint real-world accounting; that remains supplied evidence.

Usage and cost each declare `basis` as `measured`, `estimated`, or `unavailable`. Unavailable values have exactly `{ "basis": "unavailable", "reason": "What is missing" }`. Estimated values also require a nonempty `method` describing how they were derived. Measured and estimated usage require integer `input`, `cachedInput`, and `output` in `tokens`. Input includes the cached subset, so total usage is input plus output. Cached input cannot exceed input. Costs require a three-letter uppercase currency, an explicit common integer unit and a nonnegative safe integer `value`. Use zero only when measured zero is supported. Missing fields, floats and unsafe sums are invalid.

Complete cost per verified success is an exact rational pair. Its numerator includes every attempt in the complete cohort, including failed objectives. Its denominator counts supported verified successes. All outcomes must be settled and supported, inventories complete, and usage and costs measured and compatible. Zero successes, no attempts, partial inventories, missing or estimated values, and mixed cost currencies or units leave the metric unavailable. Known subtotals remain explicitly partial and grouped by basis and unit. A measured label is a supplied declaration, not authenticated provider billing. The checker does not infer prices, conversion rates or savings.

Observations contain `id`, `category`, `summary`, `evidenceIds`, and `attemptIds`. Supported categories are `repeated-reads-tools`, `retries`, `coordination`, `duplicate-instructions`, `stale-contradictory-context`, `truncation`, and `model-fit`. Supported observations produce `needs-review` opportunities. They never establish proven waste or authorize automatic model downgrades. Unsupported evidence produces `needs-evidence`. `tokenSavings` remains unavailable.

Exit 0 means `checked`, 3 means `needs-evidence` or `needs-review`, and 2 rejects malformed or operationally unreadable input. Duplicate decoded keys, unsafe object keys and nesting beyond the strict parser bound are rejected. Captures allow at most 1000 evidence rows, 500 objectives, 1000 attempts and 100 observations. IDs and references to IDs have at most 120 characters. Strings have at most 1600 characters, measurement units 40, and each reference list 100 entries. Assessment output is bounded to 512 KiB. Returned findings and subtotal groups are capped at 100 each, with full counts. The pure assessment preserves its input and sorts outputs deterministically. The digest binds exact input bytes; it does not establish source truth.

Run `node --test test/token-review.test.mjs` and `node scripts/verify-behavior.mjs --focus token-review`. These are behavioral checks of supplied captures, bounded file acquisition and reported accounting. They add no bounded formal claim to the existing coordination or publication model.
