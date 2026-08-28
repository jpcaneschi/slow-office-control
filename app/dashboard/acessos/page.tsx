import { redirect } from "next/navigation";

export default function LegacyAdminAccessPage() {
  redirect("/admin");
}
