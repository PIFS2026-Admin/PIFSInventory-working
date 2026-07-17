import ServiceLineScreen from "../ServiceLinePage";

export default function DtiServiceLinePage() {
  return (
    <ServiceLineScreen
      eyebrow="Service Lines"
      title="DTI"
      subtitle="Open the DTI workspace you need."
      backHref="/service-lines"
      actions={[
        { title: "DTI Jobs", href: "/dti", detail: "Jobs, scorecards, red flags, and closeout" },
        { title: "Daily Summaries", href: "/dti-summary", detail: "Inspection summaries, print, email, and saved records" },
      ]}
    />
  );
}
