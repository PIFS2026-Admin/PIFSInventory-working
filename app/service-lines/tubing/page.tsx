import ServiceLineScreen from "../ServiceLinePage";

export default function TubingServiceLinePage() {
  return (
    <ServiceLineScreen
      eyebrow="Service Lines"
      title="Tubing"
      subtitle="Tubing module workspace."
      backHref="/service-lines"
      actions={[
        { title: "Work Board", href: "/service-lines/boards/tubing" },
        { title: "Tubing Buildout Pending", href: "/service-lines" },
      ]}
    />
  );
}
