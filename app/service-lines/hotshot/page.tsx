import ServiceLineScreen from "../ServiceLinePage";

export default function HotshotServiceLinePage() {
  return (
    <ServiceLineScreen
      eyebrow="Service Lines"
      title="Hotshot"
      subtitle="Hotshot module workspace."
      backHref="/service-lines"
      actions={[
        { title: "Hotshot Buildout Pending", href: "/service-lines" },
      ]}
    />
  );
}
