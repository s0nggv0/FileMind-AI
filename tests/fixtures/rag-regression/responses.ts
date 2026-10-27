// Scripted adapter responses, written separately from the scoring gold. This is
// harness calibration, not model quality evidence. Never used for live answers.
export const scriptedResponses: Record<string, { text: string; documentId: string }[]> = {
  "long-tail": [{ text: "The Zephyr emergency reserve holds 47 sealed cells.", documentId: "long" }],
  compare: [{ text: "The North depot delivery window is 18 hours.", documentId: "north" }, { text: "The South depot delivery window is 30 hours.", documentId: "south" }],
  conflict: [{ text: "Cedar policy v1 requires retention for 12 days.", documentId: "old" }, { text: "Cedar policy v2 requires retention for 21 days.", documentId: "new" }, { text: "Policy v2 explicitly replaces policy v1.", documentId: "new" }, { text: "The two versions disagree on the retention period.", documentId: "new" }],
  shared: [{ text: "All transfers require a signed receipt.", documentId: "south" }],
  "image-text": [{ text: "The Iris panel displays pressure 64 kPa.", documentId: "ocr" }],
  "missing-fact": [], unrelated: [],
};
