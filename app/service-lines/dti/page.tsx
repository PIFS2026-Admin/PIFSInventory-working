import ServiceLineScreen from "../ServiceLinePage";

export default function DtiServiceLinePage() {
  return (
    <ServiceLineScreen
      eyebrow="Service Lines"
      title="DTI"
      subtitle="Open the DTI workspace you need."
      backHref="/service-lines"
      actions={[
        { title: "DTI Management", href: "/dti" },
        { title: "Daily Summaries", href: "/dti-summary" },
        { title: "Field Audits", href: "/dti/field-audits" },
        { title: "Inspector Competency", href: "/dti/competency" },
      ]}
    />
  );
}
