import ProposalManager from "@/components/ProposalManager";

export default function RequestPage({ params }: { params: { id: string } }) {
  return <ProposalManager requestId={params.id} />;
}
