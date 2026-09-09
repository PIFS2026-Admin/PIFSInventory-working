import { redirect } from "next/navigation";

export default function FieldAuditsRedirect() {
  redirect("/dti?view=audits");
}
