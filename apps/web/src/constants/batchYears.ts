/** Batch years for directory filters (newest first). */
const END = new Date().getUTCFullYear() + 1;
const START = 1960;
export const BATCH_YEARS: number[] = [];
for (let y = END; y >= START; y--) {
  BATCH_YEARS.push(y);
}
