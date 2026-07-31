import JourneyRequestDetail from "@/components/JourneyRequestDetail";
import ReceivedProposals from "@/components/ReceivedProposals";
export default function JourneyRequestPage({params}:{params:{id:string}}){return <><JourneyRequestDetail id={params.id}/><ReceivedProposals requestId={params.id}/></>}
