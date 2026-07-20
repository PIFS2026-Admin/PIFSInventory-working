import ServiceLineScreen from "../ServiceLinePage";

export default function CdtServiceLinePage() {
  return (
    <ServiceLineScreen
      eyebrow="Service Lines"
      title="CDT"
      subtitle="CDT module workspace."
      backHref="/service-lines"
      actions={[
        { title: "Work Board", href: "/service-lines/boards/cdt" },
        { title: "CDT Buildout Pending", href: "/service-lines" },
      ]}
    />
  );
}
