import ServiceLineScreen from "../ServiceLinePage";

export default function HardbandingServiceLinePage() {
  return (
    <ServiceLineScreen
      eyebrow="Service Lines"
      title="Hardbanding"
      subtitle="Open Hardbanding production tools."
      backHref="/service-lines"
      actions={[
        { title: "Work Board", href: "/service-lines/boards/hardbanding" },
        { title: "Hardband Jobs", href: "/hardband" },
      ]}
    />
  );
}
