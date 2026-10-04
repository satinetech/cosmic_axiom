import { ChevronDown, ChevronUp, Download, Plus, Edit2, Trash2, Filter, Search } from "lucide-react";
import { useEffect, useState } from "react";
import NewFindingModal from "../components/NewFindingModal";
import FindingDetailsModal from "../components/FindingDetailsModal";
import DashboardLayout from "../layouts/DashboardLayout";

const Findings = () => {
    const [findings, setFindings] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingFinding, setEditingFinding] = useState(null);
    const [selectedFindingId, setSelectedFindingId] = useState(null);
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [token] = useState(localStorage.getItem("token"));
    const [search, setSearch] = useState("");
    const [sortKey, setSortKey] = useState("createdAt");
    const [sortOrder, setSortOrder] = useState("desc");
    const [severityFilter, setSeverityFilter] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(10);

    useEffect(() => {
        const fetchFindings = async () => {
            try {
                const response = await fetch(`${import.meta.env.VITE_SATELLITE_URL}/findings`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const data = await response.json();
                setFindings(data);
            } catch (err) {
                console.error("Failed to fetch findings", err);
            }
        };

        fetchFindings();
    }, [token]);

    // Returns { error } when the save is refused, so the dialog can stay open
    // and say why; nothing is added to the list unless it was actually saved.
    const handleSaveFinding = async (findingData) => {
        try {
            const response = editingFinding
                // Updates go to POST /findings/update with the id in the body:
                // that is the route satellite and library provide.
                ? await fetch(`${import.meta.env.VITE_SATELLITE_URL}/findings/update`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ ...findingData, id: editingFinding.id }),
                })
                : await fetch(`${import.meta.env.VITE_SATELLITE_URL}/findings`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify(findingData),
                });
            const saved = await response.json().catch(() => ({}));
            if (!response.ok) {
                return { error: saved.error || `The finding could not be saved (${response.status}).` };
            }
            if (editingFinding) {
                setFindings((prev) => prev.map(f => f.id === editingFinding.id ? saved : f));
                setEditingFinding(null);
            } else {
                setFindings((prev) => [saved, ...prev]);
            }
            setIsModalOpen(false);
            return {};
        } catch (err) {
            console.error("Failed to save finding", err);
            return { error: "The finding could not be saved. Check your connection and try again." };
        }
    };

    const handleEditFinding = (finding) => {
        setEditingFinding(finding);
        setIsModalOpen(true);
    };

    const handleDeleteFinding = async (findingId) => {
        if (!confirm("Are you sure you want to delete this finding?")) return;
        
        try {
            await fetch(`${import.meta.env.VITE_SATELLITE_URL}/findings/${findingId}`, {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            setFindings((prev) => prev.filter(f => f.id !== findingId));
        } catch (err) {
            console.error("Failed to delete finding", err);
        }
    };

    const handleTagClick = (tag) => setSearch(tag);

    const handleExportCSV = () => {
        const headers = ["Title", "Severity", "Reference", "Description", "Tags", "Created"];
        const rows = filteredFindings.map(f => [
            f.title,
            f.severity,
            f.reference || "",
            f.description,
            (f.tags || []).join(", "),
            new Date(f.createdAt).toLocaleDateString()
        ]);
        const csv = [headers, ...rows]
            .map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
            .join("\n");

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", "findings.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const severityCounts = Array.isArray(findings) ? findings.reduce((acc, f) => {
        // One malformed row must not blank the whole page.
        if (typeof f?.severity !== "string" || !f.severity) return acc;
        const key = f.severity.charAt(0).toUpperCase() + f.severity.slice(1).toLowerCase();
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {}) : {};


    const filteredFindings = findings
        .filter((f) => {
            const values = [f.title, f.description, f.severity, f.reference, ...(f.tags || [])];
            const matchesSearch = values.some((v) => v?.toLowerCase().includes(search.toLowerCase()));
            const matchesSeverity = !severityFilter || f.severity === severityFilter;
            return matchesSearch && matchesSeverity;
        })
        .sort((a, b) => {
            const aVal = a[sortKey];
            const bVal = b[sortKey];
            if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
            if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
            return 0;
        });

    // Pagination
    const totalPages = Math.ceil(filteredFindings.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedFindings = filteredFindings.slice(startIndex, startIndex + itemsPerPage);

    const clearFilters = () => {
        setSearch("");
        setSeverityFilter("");
        setSortKey("createdAt");
        setSortOrder("desc");
        setCurrentPage(1);
    };

    const toggleSort = (key) => {
        if (sortKey === key) {
            setSortOrder(sortOrder === "asc" ? "desc" : "asc");
        } else {
            setSortKey(key);
            setSortOrder("asc");
        }
    };

    const caret = (key) =>
        sortKey === key ? (sortOrder === "asc" ? <ChevronUp className="inline w-4 h-4 ml-1" /> : <ChevronDown className="inline w-4 h-4 ml-1" />) : "";

    return (
        <DashboardLayout>
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Findings Library</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Reusable finding templates ({filteredFindings.length} total). To add screenshots, add the finding to a report and use Manage Images in the Report Writer.
                    </p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={() => {
                            setEditingFinding(null);
                            setIsModalOpen(true);
                        }}
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                    >
                        <Plus size={18} />
                        New Finding
                    </button>
                    <button
                        onClick={handleExportCSV}
                        className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                    >
                        <Download size={18} />
                        Export CSV
                    </button>
                </div>
            </div>

            {/* Severity Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {["Critical", "High", "Medium", "Low"].map((level) => {
                    const count = severityCounts[level] || 0;
                    const isActive = severityFilter === level.toUpperCase();
                    return (
                        <div 
                            key={level} 
                            onClick={() => setSeverityFilter(isActive ? "" : level.toUpperCase())}
                            className={`rounded-xl p-4 text-center transition-all duration-200 cursor-pointer border-2 ${
                                level === "Critical"
                                    ? isActive ? "bg-red-600 text-white border-red-600 shadow-lg" : "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30"
                                    : level === "High"
                                        ? isActive ? "bg-orange-600 text-white border-orange-600 shadow-lg" : "bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800 hover:bg-orange-100 dark:hover:bg-orange-900/30"
                                        : level === "Medium"
                                            ? isActive ? "bg-yellow-600 text-white border-yellow-600 shadow-lg" : "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800 hover:bg-yellow-100 dark:hover:bg-yellow-900/30"
                                            : isActive ? "bg-blue-600 text-white border-blue-600 shadow-lg" : "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                            }`}
                        >
                            <div className="text-2xl font-bold mb-1">{count}</div>
                            <div className="text-sm font-medium">{level}</div>
                            {isActive && <div className="text-xs mt-1 opacity-90">Click to clear</div>}
                        </div>
                    );
                })}
            </div>

            {/* Search and Filters */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 mb-6">
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search findings by title, description, tags..."
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    <div className="flex gap-2">
                        <select
                            value={severityFilter}
                            onChange={(e) => setSeverityFilter(e.target.value)}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="">All Severities</option>
                            <option value="CRITICAL">Critical</option>
                            <option value="HIGH">High</option>
                            <option value="MEDIUM">Medium</option>
                            <option value="LOW">Low</option>
                        </select>
                        <button
                            onClick={clearFilters}
                            className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        >
                            <Filter size={16} />
                            Clear
                        </button>
                    </div>
                </div>
            </div>

            {/* Enhanced Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                {[
                                    { key: "title", label: "Title" },
                                    { key: "severity", label: "Severity" },
                                    { key: "reference", label: "Reference" },
                                    { key: "description", label: "Description" },
                                    { key: "tags", label: "Tags" },
                                    { key: "createdAt", label: "Created" },
                                ].map(({ key, label }) => (
                                    <th 
                                        key={key} 
                                        onClick={() => toggleSort(key)} 
                                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                                    >
                                        <div className="flex items-center gap-1">
                                            {label}
                                            {caret(key)}
                                        </div>
                                    </th>
                                ))}
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {paginatedFindings.map((f) => (
                                <tr key={f.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                    <td className="px-6 py-4">
                                        <button
                                            onClick={() => {
                                                setSelectedFindingId(f.id);
                                                setIsDetailsModalOpen(true);
                                            }}
                                            className="font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors text-left"
                                        >
                                            {f.title}
                                        </button>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                            f.severity === "CRITICAL"
                                                ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
                                                : f.severity === "HIGH"
                                                    ? "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300"
                                                    : f.severity === "MEDIUM"
                                                        ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
                                                        : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300"
                                        }`}>
                                            {f.severity}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                                        {f.reference || "-"}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 max-w-xs">
                                        <div className="truncate" title={f.description}>
                                            {f.description}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-wrap gap-1">
                                            {(f.tags || []).slice(0, 3).map((tag, idx) => (
                                                <span
                                                    key={idx}
                                                    onClick={() => handleTagClick(tag)}
                                                    className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300 cursor-pointer hover:bg-indigo-200 dark:hover:bg-indigo-800 transition-colors"
                                                >
                                                    {tag}
                                                </span>
                                            ))}
                                            {f.tags && f.tags.length > 3 && (
                                                <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                                                    +{f.tags.length - 3}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                        {new Date(f.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 text-sm font-medium">
                                        <div className="flex items-center gap-3">
                                            <button 
                                                onClick={() => handleEditFinding(f)}
                                                className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors flex items-center gap-1"
                                            >
                                                <Edit2 size={14} />
                                                Edit
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteFinding(f.id)}
                                                className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 transition-colors flex items-center gap-1"
                                            >
                                                <Trash2 size={14} />
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                
                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="bg-gray-50 dark:bg-gray-700 px-6 py-3 border-t border-gray-200 dark:border-gray-600">
                        <div className="flex items-center justify-between">
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                                Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, filteredFindings.length)} of {filteredFindings.length} results
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentPage(currentPage - 1)}
                                    disabled={currentPage === 1}
                                    className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    Previous
                                </button>
                                {Array.from({ length: totalPages }, (_, i) => i + 1)
                                    .filter(page => 
                                        page === 1 || 
                                        page === totalPages || 
                                        Math.abs(page - currentPage) <= 1
                                    )
                                    .map((page, idx, arr) => (
                                        <div key={page} className="flex items-center">
                                            {idx > 0 && arr[idx - 1] !== page - 1 && (
                                                <span className="px-2 text-gray-400">...</span>
                                            )}
                                            <button
                                                onClick={() => setCurrentPage(page)}
                                                className={`px-3 py-1 text-sm border rounded transition-colors ${
                                                    currentPage === page
                                                        ? "bg-indigo-600 border-indigo-600 text-white"
                                                        : "border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
                                                }`}
                                            >
                                                {page}
                                            </button>
                                        </div>
                                    ))
                                }
                                <button
                                    onClick={() => setCurrentPage(currentPage + 1)}
                                    disabled={currentPage === totalPages}
                                    className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <NewFindingModal
                isOpen={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false);
                    setEditingFinding(null);
                }}
                onSave={handleSaveFinding}
                initialData={editingFinding}
            />
            
            <FindingDetailsModal
                isOpen={isDetailsModalOpen}
                onClose={() => {
                    setIsDetailsModalOpen(false);
                    setSelectedFindingId(null);
                    // Refresh findings list in case of updates
                    const fetchFindings = async () => {
                        try {
                            const response = await fetch(`${import.meta.env.VITE_SATELLITE_URL}/findings`, {
                                headers: { Authorization: `Bearer ${token}` },
                            });
                            const data = await response.json();
                            setFindings(data);
                        } catch (err) {
                            console.error("Failed to fetch findings", err);
                        }
                    };
                    fetchFindings();
                }}
                findingId={selectedFindingId}
            />
        </DashboardLayout>
    );
};

export default Findings;
