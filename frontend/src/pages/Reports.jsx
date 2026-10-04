import { Edit3, Loader2, Calendar, Building2, FileText, Clock, CheckCircle, AlertCircle, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import DashboardLayout from "../layouts/DashboardLayout";

import { customerName } from "../utils/customerName";
function Reports() {
    const [reports, setReports] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [loadingReportId, setLoadingReportId] = useState(null);
    const navigate = useNavigate();

    // Helper function to get engagement status styling
    const getStatusStyles = (status) => {
        switch (status) {
            case 'COMPLETED':
                return {
                    icon: CheckCircle,
                    className: 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-900/20 dark:border-green-800'
                };
            case 'ACTIVE':
                return {
                    icon: AlertCircle,
                    className: 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/20 dark:border-blue-800'
                };
            case 'PLANNED':
                return {
                    icon: Clock,
                    className: 'text-yellow-600 bg-yellow-50 border-yellow-200 dark:text-yellow-400 dark:bg-yellow-900/20 dark:border-yellow-800'
                };
            case 'CANCELED':
                return {
                    icon: XCircle,
                    className: 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/20 dark:border-red-800'
                };
            default:
                return {
                    icon: FileText,
                    className: 'text-gray-600 bg-gray-50 border-gray-200 dark:text-gray-400 dark:bg-gray-900/20 dark:border-gray-800'
                };
        }
    };

    useEffect(() => {
        const fetchReports = async () => {
            try {
                const res = await fetch(`${import.meta.env.VITE_SATELLITE_URL}/reports`, {
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("token")}`,
                    },
                });

                if (!res.ok) throw new Error("Failed to load reports");

                const data = await res.json();
                setReports(data);
            } catch (err) {
                console.error("Error fetching reports:", err);
            }
        };

        fetchReports();
    }, []);

    const handleViewReport = async (reportId) => {
        setLoadingReportId(reportId);
        try {
            const res = await fetch(`${import.meta.env.VITE_SATELLITE_URL}/reports/${reportId}/generate-pdf`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ reportId })
            });

            if (!res.ok) throw new Error("PDF generation failed");
            const data = await res.json();
            console.log("PDF Generated at:", data.url);

            navigate(`/reports/${reportId}`);
        } catch (err) {
            console.error("Error generating PDF:", err);
            alert("Failed to generate PDF. Try again.");
            setLoadingReportId(null);
        }
    };

    const filteredReports = reports.filter((report) => {
        const title = report.title ?? "";
        const engagementName = report.engagement?.name ?? "";
        const customer = customerName(report.engagement);

        const query = searchQuery.toLowerCase();
        return (
            title.toLowerCase().includes(query) ||
            engagementName.toLowerCase().includes(query) ||
            customer.toLowerCase().includes(query)
        );
    });

    return (
        <DashboardLayout>
            {loadingReportId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                    <div className="flex flex-col items-center bg-white dark:bg-gray-800 px-6 py-4 rounded-lg shadow-md">
                        <Loader2 className="animate-spin w-6 h-6 text-indigo-500 mb-2" />
                        <p className="text-sm text-gray-800 dark:text-gray-200">Loading report...</p>
                    </div>
                </div>
            )}

            <div className="mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
                    <div>
                        <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Reports</h2>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                            Manage and track all your penetration testing reports
                        </p>
                    </div>
                    <Link
                        to="/reports/new"
                        className="mt-4 sm:mt-0 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium text-sm"
                    >
                        <FileText className="w-4 h-4" />
                        Create New Report
                    </Link>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative flex-1 max-w-md">
                        <input
                            type="text"
                            placeholder="Search by title, engagement, or customer..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 dark:bg-gray-900 dark:text-white dark:border-gray-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                        <svg className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                        {filteredReports.length} of {reports.length} reports
                    </span>
                </div>
            </div>

            {filteredReports.length === 0 ? (
                <div className="text-center py-12">
                    <FileText className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">No reports found</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {searchQuery ? "Try adjusting your search criteria" : "Get started by creating a new report"}
                    </p>
                    {!searchQuery && (
                        <div className="mt-6">
                            <Link
                                to="/reports/new"
                                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium text-sm"
                            >
                                <FileText className="w-4 h-4" />
                                Create Your First Report
                            </Link>
                        </div>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredReports.map((report) => {
                    const engagementStatus = report.engagement?.status;
                    const statusStyle = getStatusStyles(engagementStatus);
                    const StatusIcon = statusStyle.icon;
                    
                    return (
                        <div
                            key={report.id}
                            className="group relative bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden"
                        >
                            {/* Engagement Status Badge */}
                            <div className="absolute top-4 right-4">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${statusStyle.className}`}>
                                    <StatusIcon className="w-3.5 h-3.5" />
                                    {engagementStatus === 'PLANNED' ? 'Planned' :
                                     engagementStatus === 'ACTIVE' ? 'Active' :
                                     engagementStatus === 'COMPLETED' ? 'Completed' :
                                     engagementStatus === 'CANCELED' ? 'Canceled' :
                                     'No Status'}
                                </span>
                            </div>
                            
                            {/* Card Content */}
                            <div className="p-6">
                                {/* Header */}
                                <div className="mb-4">
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 pr-24">
                                        {report.title}
                                    </h3>
                                </div>
                                
                                {/* Metadata Section */}
                                <div className="space-y-3 mb-6">
                                    {/* Customer & Engagement */}
                                    <div className="flex items-start gap-3">
                                        <Building2 className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                                {customerName(report.engagement) || "No Customer"}
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                                {report.engagement?.name || "No Engagement"}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    {/* Dates */}
                                    <div className="flex items-start gap-3">
                                        <Calendar className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                                        <div className="flex-1 space-y-1">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-gray-500 dark:text-gray-400">Created</span>
                                                <span className="text-gray-700 dark:text-gray-300">
                                                    {report.createdAt ? new Date(report.createdAt).toLocaleDateString() : "N/A"}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-gray-500 dark:text-gray-400">Updated</span>
                                                <span className="text-gray-700 dark:text-gray-300">
                                                    {report.updatedAt ? new Date(report.updatedAt).toLocaleDateString() : "N/A"}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Actions */}
                                <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700">
                                    <button
                                        onClick={() => handleViewReport(report.id)}
                                        className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                                    >
                                        <FileText className="w-4 h-4" />
                                        View Report
                                    </button>
                                    {report.engagement?.id && (
                                        <Link
                                            to={`/report-writer/${report.id}`}
                                            title="Edit Report"
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
                                        >
                                            <Edit3 className="w-3.5 h-3.5" />
                                            Edit
                                        </Link>
                                    )}
                                </div>
                            </div>
                            
                            {/* Hover Accent */}
                            <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-indigo-500 to-purple-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-200 origin-left"></div>
                        </div>
                    );
                })}
                </div>
            )}
        </DashboardLayout>
    );
}

export default Reports;
