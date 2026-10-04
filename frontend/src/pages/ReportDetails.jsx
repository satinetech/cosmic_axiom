import { Download, FileText, Calendar, Building2, User, CheckCircle, AlertCircle, XCircle, ChevronLeft, ExternalLink, FileSpreadsheet, Loader2, RefreshCw, BookOpen, FileSearch, Shield, AlertTriangle, ClipboardList, Hash, ChevronDown, ChevronRight, Info } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import DashboardLayout from "../layouts/DashboardLayout";

import { customerName } from "../utils/customerName";
function ReportDetails() {
    const { reportid } = useParams();
    const navigate = useNavigate();
    const [report, setReport] = useState(null);
    const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("pdf");
    const [downloadingPdf, setDownloadingPdf] = useState(false);
    const [downloadingPpt, setDownloadingPpt] = useState(false);
    const [generatingPdf, setGeneratingPdf] = useState(false);
    const [sections, setSections] = useState([]);
    const [findingsExpanded, setFindingsExpanded] = useState(true);
    const [briefingPdfUrl, setBriefingPdfUrl] = useState(null);
    const [generatingBriefing, setGeneratingBriefing] = useState(false);
    const pdfIframeRef = useRef(null);
    const briefingIframeRef = useRef(null);

    // Note: PDF navigation removed as page numbers are dynamic
    // Users should use the built-in PDF viewer controls for navigation

    // Helper function to get status styling
    const getStatusStyles = (status) => {
        switch (status?.toLowerCase()) {
            case 'completed':
                return {
                    icon: CheckCircle,
                    className: 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-900/20 dark:border-green-800'
                };
            case 'in_progress':
                return {
                    icon: AlertCircle,
                    className: 'text-yellow-600 bg-yellow-50 border-yellow-200 dark:text-yellow-400 dark:bg-yellow-900/20 dark:border-yellow-800'
                };
            case 'draft':
                return {
                    icon: FileText,
                    className: 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/20 dark:border-blue-800'
                };
            default:
                return {
                    icon: XCircle,
                    className: 'text-gray-600 bg-gray-50 border-gray-200 dark:text-gray-400 dark:bg-gray-900/20 dark:border-gray-800'
                };
        }
    };

    const generatePdf = async () => {
        setGeneratingPdf(true);
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${import.meta.env.VITE_SATELLITE_URL}/reports/${reportid}/generate-pdf`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ reportId: reportid })
            });

            if (!res.ok) throw new Error("PDF generation failed");
            const data = await res.json();
            
            // Refresh the report data
            await fetchReportData();
        } catch (err) {
            console.error("Error generating PDF:", err);
            alert("Failed to generate PDF. Please try again.");
        } finally {
            setGeneratingPdf(false);
        }
    };

    const generateBriefingPdf = async () => {
        setGeneratingBriefing(true);
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${import.meta.env.VITE_SATELLITE_URL}/reports/${reportid}/generate-briefing`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ reportId: reportid })
            });

            if (!res.ok) throw new Error("Briefing generation failed");
            const data = await res.json();
            
            // Fetch the briefing PDF
            if (data.url) {
                const filename = data.url.split("/").pop();
                const briefingRes = await fetch(`${import.meta.env.VITE_SATELLITE_URL}/reports/pdf/${filename}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                
                if (briefingRes.ok) {
                    const blob = await briefingRes.blob();
                    const blobUrl = URL.createObjectURL(blob);
                    setBriefingPdfUrl(blobUrl);
                }
            }
        } catch (err) {
            console.error("Error generating briefing:", err);
            alert("Failed to generate briefing. Please try again.");
        } finally {
            setGeneratingBriefing(false);
        }
    };

    const fetchReportData = async () => {
        try {
            const token = localStorage.getItem("token");
            const headers = { Authorization: `Bearer ${token}` };

            // Step 1: Fetch report metadata
            const resReport = await fetch(`${import.meta.env.VITE_SATELLITE_URL}/reports/${reportid}`, { headers });
            const reportData = await resReport.json();
            setReport(reportData);

            // Step 2: Fetch report sections
            try {
                const resSections = await fetch(`${import.meta.env.VITE_SATELLITE_URL}/reports/${reportid}/sections`, { headers });
                if (resSections.ok) {
                    const sectionsData = await resSections.json();
                    setSections(sectionsData);
                }
            } catch (err) {
                console.error("Failed to load sections:", err);
            }

            // Step 3: Always generate/regenerate the PDF to ensure it's current
            try {
                const generateRes = await fetch(`${import.meta.env.VITE_SATELLITE_URL}/reports/${reportid}/generate-pdf`, {
                    method: "POST",
                    headers: {
                        ...headers,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ reportId: reportid })
                });

                if (generateRes.ok) {
                    const generateData = await generateRes.json();
                    const filename = generateData.url.split("/").pop();
                    
                    // Step 4: Fetch the generated PDF with authentication
                    const resPdf = await fetch(`${import.meta.env.VITE_SATELLITE_URL}/reports/pdf/${filename}`, {
                        method: "GET",
                        headers: {
                            Authorization: `Bearer ${token}`
                        },
                    });

                    if (resPdf.ok) {
                        const blob = await resPdf.blob();
                        
                        // Firefox often has issues with blob URLs in iframes, use data URL instead
                        const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
                        
                        if (isFirefox) {
                            const reader = new FileReader();
                            reader.onload = function() {
                                setPdfBlobUrl(reader.result);
                            };
                            reader.readAsDataURL(blob);
                        } else {
                            const blobUrl = URL.createObjectURL(blob);
                            setPdfBlobUrl(blobUrl);
                        }
                    } else {
                        console.error("Failed to fetch PDF:", resPdf.status, resPdf.statusText);
                    }
                }
            } catch (err) {
                console.error("Failed to generate/load PDF:", err);
            }

            setLoading(false);
        } catch (err) {
            console.error("Failed to load report:", err);
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReportData();
        
        // Cleanup blob URLs on unmount
        return () => {
            if (pdfBlobUrl) {
                URL.revokeObjectURL(pdfBlobUrl);
            }
            if (briefingPdfUrl) {
                URL.revokeObjectURL(briefingPdfUrl);
            }
        };
    }, [reportid]);

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center min-h-[60vh]">
                    <div className="text-center">
                        <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mx-auto mb-4" />
                        <p className="text-gray-600 dark:text-gray-400">Loading report details...</p>
                    </div>
                </div>
            </DashboardLayout>
        );
    }

    const statusStyle = report ? getStatusStyles(report.status) : null;
    const StatusIcon = statusStyle?.icon;

    return (
        <DashboardLayout>
            {/* Header with breadcrumb */}
            <div className="mb-8">
                <nav className="flex items-center text-sm text-gray-500 dark:text-gray-400 mb-4">
                    <Link to="/reports" className="hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1">
                        <ChevronLeft className="w-4 h-4" />
                        Reports
                    </Link>
                    <span className="mx-2">/</span>
                    <span className="text-gray-900 dark:text-gray-100">{report?.title || 'Loading...'}</span>
                </nav>
                
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                            {report?.title || 'Report Details'}
                        </h1>
                        {report && (
                            <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                                <span className="flex items-center gap-1">
                                    <Building2 className="w-4 h-4" />
                                    {customerName(report.engagement) || 'No Customer'}
                                </span>
                                <span className="flex items-center gap-1">
                                    <User className="w-4 h-4" />
                                    {report.engagement?.name || 'No Engagement'}
                                </span>
                                {statusStyle && (
                                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${statusStyle.className}`}>
                                        <StatusIcon className="w-3 h-3" />
                                        {report.status || 'Unknown'}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                    
                    {report?.engagement?.id && (
                        <Link
                            to={`/report-writer/${report.id}`}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium text-sm"
                        >
                            <FileText className="w-4 h-4" />
                            Edit Report
                        </Link>
                    )}
                </div>
            </div>

            {report ? (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Sidebar */}
                    <div className="lg:col-span-1 space-y-6">
                        {/* Report Information */}
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Report Information</h3>
                            
                            <dl className="space-y-4">
                                <div>
                                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Created</dt>
                                    <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100 flex items-center gap-1">
                                        <Calendar className="w-4 h-4 text-gray-400" />
                                        {new Date(report.createdAt).toLocaleDateString()}
                                    </dd>
                                </div>
                                
                                <div>
                                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Last Updated</dt>
                                    <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100 flex items-center gap-1">
                                        <Calendar className="w-4 h-4 text-gray-400" />
                                        {new Date(report.updatedAt).toLocaleDateString()}
                                    </dd>
                                </div>
                                
                                {report.sections && (
                                    <div>
                                        <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sections</dt>
                                        <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                                            {report.sections.length} sections
                                        </dd>
                                    </div>
                                )}
                            </dl>
                        </div>

                        {/* Actions */}
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Actions</h3>
                            
                            <div className="space-y-3">
                                {!pdfBlobUrl && !generatingPdf && (
                                    <button
                                        onClick={generatePdf}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium text-sm"
                                    >
                                        <FileText className="w-4 h-4" />
                                        Generate PDF
                                    </button>
                                )}
                                
                                {generatingPdf && (
                                    <div className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 font-medium text-sm">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Generating PDF...
                                    </div>
                                )}
                                
                                {pdfBlobUrl && (
                                    <>
                                        <a
                                            href={pdfBlobUrl}
                                            download={`${report.title.replace(/[^a-z0-9]/gi, '_')}.pdf`}
                                            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm"
                                        >
                                            <Download className="w-4 h-4" />
                                            Download PDF
                                        </a>
                                        
                                        <button
                                            onClick={generatePdf}
                                            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium text-sm"
                                        >
                                            <RefreshCw className="w-4 h-4" />
                                            Regenerate PDF
                                        </button>
                                    </>
                                )}
                                
                                {report.generatedPptUrl && (
                                    <a
                                        href={report.generatedPptUrl}
                                        download
                                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
                                    >
                                        <FileSpreadsheet className="w-4 h-4" />
                                        Download PowerPoint
                                    </a>
                                )}
                            </div>
                        </div>

                        {/* Report Contents */}
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                                <BookOpen className="w-5 h-5 text-indigo-600" />
                                Report Contents
                            </h3>
                            
                            <div className="space-y-2 text-sm">
                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                                    <Info className="w-3 h-3 inline mr-1" />
                                    Use the PDF viewer controls to navigate the document
                                </p>
                                
                                {/* Executive Summary */}
                                {report.executiveSummary && (
                                    <div className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                                        <FileText className="w-4 h-4 text-gray-400" />
                                        <div className="flex-1">
                                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Executive Summary</div>
                                        </div>
                                    </div>
                                )}
                                
                                {/* Engagement Overview */}
                                <div className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                                    <FileSearch className="w-4 h-4 text-gray-400" />
                                    <div className="flex-1">
                                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Engagement Overview</div>
                                    </div>
                                </div>
                                
                                {/* Findings Summary */}
                                <div className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                                    <ClipboardList className="w-4 h-4 text-gray-400" />
                                    <div className="flex-1">
                                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Findings Summary</div>
                                    </div>
                                </div>
                                
                                {/* Connectivity Tests */}
                                {sections && sections.filter(s => s.type === "CONNECTIVITY").length > 0 && (
                                    <div className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                                        <AlertCircle className="w-4 h-4 text-gray-400" />
                                        <div className="flex-1">
                                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                                Network Connectivity Tests ({sections.filter(s => s.type === "CONNECTIVITY").length})
                                            </div>
                                        </div>
                                    </div>
                                )}
                                
                                {/* Individual Findings - Collapsible */}
                                {sections && sections.filter(s => s.type === "FINDING").length > 0 && (
                                    <div className="mt-3">
                                        <button
                                            onClick={() => setFindingsExpanded(!findingsExpanded)}
                                            className="w-full flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded transition-colors"
                                        >
                                            <div className="flex items-center gap-2">
                                                <AlertTriangle className="w-4 h-4 text-gray-400" />
                                                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                                    Detailed Findings ({sections.filter(s => s.type === "FINDING").length})
                                                </span>
                                            </div>
                                            {findingsExpanded ? (
                                                <ChevronDown className="w-4 h-4 text-gray-400" />
                                            ) : (
                                                <ChevronRight className="w-4 h-4 text-gray-400" />
                                            )}
                                        </button>
                                        
                                        {findingsExpanded && (
                                            <div className="mt-2 space-y-1 max-h-64 overflow-y-auto pl-6">
                                                {sections.filter(s => s.type === "FINDING").map((section, index) => {
                                                    const severity = section.reportFinding?.severity || 'MEDIUM';
                                                    const severityColors = {
                                                        'CRITICAL': 'text-red-600 dark:text-red-400',
                                                        'HIGH': 'text-orange-600 dark:text-orange-400',
                                                        'MEDIUM': 'text-yellow-600 dark:text-yellow-400',
                                                        'LOW': 'text-blue-600 dark:text-blue-400'
                                                    };
                                                    
                                                    return (
                                                        <div key={section.id} className="flex items-start gap-2 p-2">
                                                            <Hash className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                                                            <div className="flex-1 min-w-0">
                                                                <div className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                                                                    {section.reportFinding?.title || `Finding ${index + 1}`}
                                                                </div>
                                                                <div className={`text-xs ${severityColors[severity]} font-medium`}>
                                                                    {severity}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                                
                                {/* Tools & Techniques */}
                                {report.toolsAndTechniques && (
                                    <div className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 mt-3">
                                        <Shield className="w-4 h-4 text-gray-400" />
                                        <div className="flex-1">
                                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Tools & Techniques</div>
                                        </div>
                                    </div>
                                )}
                                
                                {/* Conclusion */}
                                {report.conclusion && (
                                    <div className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                                        <FileText className="w-4 h-4 text-gray-400" />
                                        <div className="flex-1">
                                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Conclusion</div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Main content - Document Viewer */}
                    <div className="lg:col-span-3">
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                            {/* Tabs */}
                            <div className="border-b border-gray-200 dark:border-gray-700">
                                <nav className="flex">
                                    <button
                                        onClick={() => setActiveTab("pdf")}
                                        className={`
                                            px-6 py-3 text-sm font-medium border-b-2 transition-colors
                                            ${activeTab === "pdf" 
                                                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400" 
                                                : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:border-gray-300"
                                            }
                                        `}
                                    >
                                        <div className="flex items-center gap-2">
                                            <FileText className="w-4 h-4" />
                                            PDF Preview
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => setActiveTab("briefing")}
                                        className={`
                                            px-6 py-3 text-sm font-medium border-b-2 transition-colors
                                            ${activeTab === "briefing" 
                                                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400" 
                                                : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:border-gray-300"
                                            }
                                        `}
                                    >
                                        <div className="flex items-center gap-2">
                                            <ClipboardList className="w-4 h-4" />
                                            Briefing Version
                                        </div>
                                    </button>
                                    {report.generatedPptUrl && (
                                        <button
                                            onClick={() => setActiveTab("ppt")}
                                            className={`
                                                px-6 py-3 text-sm font-medium border-b-2 transition-colors
                                                ${activeTab === "ppt" 
                                                    ? "border-indigo-600 text-indigo-600 dark:text-indigo-400" 
                                                    : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:border-gray-300"
                                                }
                                            `}
                                        >
                                            <div className="flex items-center gap-2">
                                                <FileSpreadsheet className="w-4 h-4" />
                                                PowerPoint Preview
                                            </div>
                                        </button>
                                    )}
                                </nav>
                            </div>

                            {/* Content */}
                            <div className="relative">
                                {activeTab === "pdf" ? (
                                    pdfBlobUrl ? (
                                        <iframe
                                            ref={pdfIframeRef}
                                            src={pdfBlobUrl}
                                            className="w-full h-[calc(100vh-12rem)] border-0"
                                            title="PDF Report Preview"
                                        />
                                    ) : (
                                        <div className="flex items-center justify-center h-[calc(100vh-12rem)] bg-gray-50 dark:bg-gray-900">
                                            <div className="text-center">
                                                <FileText className="w-24 h-24 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                                                <p className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">
                                                    No PDF generated yet
                                                </p>
                                                <p className="text-sm text-gray-500 dark:text-gray-500 mb-6">
                                                    Loading PDF preview...
                                                </p>
                                                {generatingPdf && (
                                                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 font-medium text-sm">
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                        Generating PDF...
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                ) : activeTab === "briefing" ? (
                                    briefingPdfUrl ? (
                                        <iframe
                                            ref={briefingIframeRef}
                                            src={briefingPdfUrl}
                                            className="w-full h-[calc(100vh-12rem)] border-0"
                                            title="Briefing PDF Preview"
                                        />
                                    ) : (
                                        <div className="flex items-center justify-center h-[calc(100vh-12rem)] bg-gray-50 dark:bg-gray-900">
                                            <div className="text-center">
                                                <ClipboardList className="w-24 h-24 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                                                <p className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">
                                                    No briefing version generated yet
                                                </p>
                                                <p className="text-sm text-gray-500 dark:text-gray-500 mb-6">
                                                    Generate a briefing-ready PDF for presentations
                                                </p>
                                                {!generatingBriefing && (
                                                    <button
                                                        onClick={generateBriefingPdf}
                                                        className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium text-sm"
                                                    >
                                                        <ClipboardList className="w-4 h-4" />
                                                        Generate Briefing
                                                    </button>
                                                )}
                                                {generatingBriefing && (
                                                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 font-medium text-sm">
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                        Generating briefing...
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                ) : (
                                    report.generatedPptUrl ? (
                                        <iframe
                                            src={report.generatedPptUrl}
                                            className="w-full h-[calc(100vh-12rem)] border-0"
                                            title="PowerPoint Report Preview"
                                        />
                                    ) : (
                                        <div className="flex items-center justify-center h-[calc(100vh-12rem)] bg-gray-50 dark:bg-gray-900">
                                            <div className="text-center">
                                                <FileSpreadsheet className="w-24 h-24 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                                                <p className="text-lg font-medium text-gray-600 dark:text-gray-400">
                                                    No PowerPoint presentation available
                                                </p>
                                            </div>
                                        </div>
                                    )
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="text-center py-12">
                    <ExternalLink className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-lg font-medium text-gray-600 dark:text-gray-400">No report data available</p>
                    <Link
                        to="/reports"
                        className="mt-4 inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        Back to Reports
                    </Link>
                </div>
            )}
        </DashboardLayout>
    );
}

export default ReportDetails;
