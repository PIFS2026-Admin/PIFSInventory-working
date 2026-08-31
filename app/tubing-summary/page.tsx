import DailySummaryPage, { type DailySummaryConfig } from "../dti-summary/DailySummaryPage";

const config: DailySummaryConfig = {
  serviceLine: "Tubing",
  tableName: "tubing_daily_summaries",
  summaryPrefix: "TU",
  summaryHref: "/tubing-summary",
  moduleHref: "/service-lines/tubing",
  moduleLabel: "Tubing",
  readableRoles: ["admin", "service_line_manager", "tubing_lead", "tubing_hand"],
  editableRoles: ["admin", "service_line_manager", "tubing_lead", "tubing_hand"],
};

export default function TubingDailySummaryPage() {
  return <DailySummaryPage config={config} />;
}
