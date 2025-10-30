/** Public API: writes
 *   public/data/tx/all_or_nothing_morning.csv
 *   public/data/tx/all_or_nothing_day.csv
 *   public/data/tx/all_or_nothing_evening.csv
 *   public/data/tx/all_or_nothing_night.csv
 * (paths can be overridden via env TX_AON_OUT_* or baseOutDir arg)
 */
export declare function buildTexasAllOrNothingCSVs(baseOutDir?: string): Promise<void>;
