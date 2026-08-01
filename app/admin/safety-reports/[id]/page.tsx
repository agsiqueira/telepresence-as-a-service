import AdminSafetyReportDetail from "@/components/AdminSafetyReportDetail";
import AdminSafetyReportCoordination from "@/components/AdminSafetyReportCoordination";
export default function AdminSafetyReportPage({params}:{params:{id:string}}){return <><AdminSafetyReportDetail id={params.id}/><AdminSafetyReportCoordination id={params.id}/></>}
