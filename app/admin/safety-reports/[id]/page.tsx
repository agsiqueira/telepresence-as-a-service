import AdminSafetyReportDetail from "@/components/AdminSafetyReportDetail";
import AdminSafetyReportCoordination from "@/components/AdminSafetyReportCoordination";
import AdminSafetyConversations from "@/components/AdminSafetyConversations";
export default function AdminSafetyReportPage({params}:{params:{id:string}}){return <><AdminSafetyReportDetail id={params.id}/><AdminSafetyReportCoordination id={params.id}/><AdminSafetyConversations id={params.id}/></>}
