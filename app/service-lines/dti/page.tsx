import ServiceLineScreen from "../ServiceLinePage";

export default function DtiServiceLinePage() {
  return (
    <ServiceLineScreen
      eyebrow="Service Lines"
      title="DTI"
      subtitle="Open the DTI workspace you need."
      backHref="/service-lines"
      actions={[
        { title: "Work Board", href: "/service-lines/boards/dti" },
        { title: "DTI Jobs", href: "/dti" },
        { title: "Daily Summaries", href: "/dti-summary" },
      ]}
    />
  );
}
