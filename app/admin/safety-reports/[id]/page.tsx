import AdminSafetyReportDetail from "@/components/AdminSafetyReportDetail";
import AdminSafetyReportCoordination from "@/components/AdminSafetyReportCoordination";
import AdminSafetyConversations from "@/components/AdminSafetyConversations";
import AdminSafetyRestrictions from "@/components/AdminSafetyRestrictions";
export default function AdminSafetyReportPage({params}:{params:{id:string}}){return <><AdminSafetyReportDetail id={params.id}/><AdminSafetyReportCoordination id={params.id}/><AdminSafetyRestrictions id={params.id}/><AdminSafetyConversations id={params.id}/></>}
