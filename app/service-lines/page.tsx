import ServiceLineScreen from "./ServiceLinePage";

export default function ServiceLinesPage() {
  return (
    <ServiceLineScreen
      eyebrow="Service Lines"
      title="Service Lines"
      subtitle="Choose the service line you want to work in."
      actions={[
        { title: "DTI", href: "/service-lines/dti", detail: "DTI jobs and daily summaries" },
        { title: "Hardbanding", href: "/service-lines/hardbanding", detail: "Hardband jobs and reports" },
        { title: "CDT", href: "/service-lines/cdt", detail: "CDT workspace" },
        { title: "Tubing", href: "/service-lines/tubing", detail: "Tubing workspace" },
        { title: "Hotshot", href: "/service-lines/hotshot", detail: "Hotshot workspace" },
      ]}
    />
  );
}
