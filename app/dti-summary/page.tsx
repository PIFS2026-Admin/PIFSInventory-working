import DailySummaryPage, { type DailySummaryConfig } from "./DailySummaryPage";

const config: DailySummaryConfig = {
  serviceLine: "DTI",
  tableName: "dti_daily_summaries",
  summaryPrefix: "DTI",
  summaryHref: "/dti-summary",
  moduleHref: "/dti",
  moduleLabel: "DTI Jobs",
  readableRoles: ["admin", "dti_superintendent", "dti_inspector", "dti_lead", "level_2_inspector"],
  editableRoles: ["admin", "dti_superintendent", "dti_inspector", "dti_lead", "level_2_inspector"],
  showDtiPerformance: true,
};

export default function DtiDailySummaryPage() {
  return <DailySummaryPage config={config} />;
}
