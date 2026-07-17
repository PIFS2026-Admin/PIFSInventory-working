import ServiceLineScreen from "./ServiceLinePage";

export default function ServiceLinesPage() {
  return (
    <ServiceLineScreen
      eyebrow="Service Lines"
      title="Service Lines"
      subtitle="Choose the service line you want to work in."
      actions={[
        { title: "DTI", href: "/service-lines/dti" },
        { title: "Hardbanding", href: "/service-lines/hardbanding" },
        { title: "CDT", href: "/service-lines/cdt" },
        { title: "Tubing", href: "/service-lines/tubing" },
        { title: "Hotshot", href: "/service-lines/hotshot" },
      ]}
    />
  );
}
