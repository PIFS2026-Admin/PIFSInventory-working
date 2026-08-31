import ServiceLineScreen from "../ServiceLinePage";

export default function TubingServiceLinePage() {
  return (
    <ServiceLineScreen
      eyebrow="Service Lines"
      title="Tubing"
      subtitle="Open the Tubing workspace you need."
      backHref="/service-lines"
      actions={[
        { title: "Daily Summaries", href: "/tubing-summary" },
        { title: "Drift Verification", href: "/tubing-drift-verification" },
      ]}
    />
  );
}
