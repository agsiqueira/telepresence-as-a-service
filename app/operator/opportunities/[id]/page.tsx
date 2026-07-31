import ProposalManager from "@/components/ProposalManager";
export default function ProposalPage({params}:{params:{id:string}}){return <ProposalManager requestId={params.id}/>}
