import ServiceLineScreen from "../ServiceLinePage";

export default function HardbandingServiceLinePage() {
  return (
    <ServiceLineScreen
      eyebrow="Service Lines"
      title="Hardbanding"
      subtitle="Open Hardbanding production tools."
      backHref="/service-lines"
      actions={[
        { title: "Hardband Jobs", href: "/hardband", detail: "Work orders, serials, line items, and closeout" },
      ]}
    />
  );
}
