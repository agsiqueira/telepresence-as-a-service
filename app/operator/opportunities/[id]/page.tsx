import { redirect } from "next/navigation";

export default function OpportunityPage({ params }: { params: { id: string } }) {
  redirect(`/operator/requests/${params.id}`);
}
