import { redirect } from "next/navigation";

export default function ApplicationIndexPage({ params }: { params: { appId: string } }) {
  redirect(`/dashboard/${params.appId}/keys`);
}
