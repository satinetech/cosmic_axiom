import { useState, useRef, useEffect } from "react";
import { X, Upload, Plus, Trash2, Save, FileText } from "lucide-react";

function ScopeModal({ isOpen, onClose, engagement, onScopeUpdated }) {
    const [scopes, setScopes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [bulkText, setBulkText] = useState("");
    const [showBulkInput, setShowBulkInput] = useState(false);
    const [newScope, setNewScope] = useState({ address: "", description: "", inScope: true });
    const fileInputRef = useRef(null);
    const token = localStorage.getItem("token");

    // Load scopes when modal opens
    useEffect(() => {
        if (isOpen && engagement?.id) {
            loadScopes();
        }
    }, [isOpen, engagement?.id]);

    const loadScopes = async () => {
        try {
            const response = await fetch(`${import.meta.env.VITE_SATELLITE_URL}/scope/engagement/${engagement.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();
            setScopes(data);
        } catch (error) {
            console.error("Failed to load scopes:", error);
        }
    };

    const handleAddScope = async () => {
        if (!newScope.address.trim()) return;

        try {
            const response = await fetch(`${import.meta.env.VITE_SATELLITE_URL}/scope`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    engagementId: engagement.id,
                    ...newScope
                })
            });

            if (response.ok) {
                const created = await response.json();
                setScopes(prev => [created, ...prev]);
                setNewScope({ address: "", description: "", inScope: true });
                onScopeUpdated?.();
            }
        } catch (error) {
            console.error("Failed to create scope:", error);
        }
    };

    const handleDeleteScope = async (scopeId) => {
        if (!confirm("Delete this scope entry?")) return;

        try {
            const response = await fetch(`${import.meta.env.VITE_SATELLITE_URL}/scope/${scopeId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.ok) {
                setScopes(prev => prev.filter(s => s.id !== scopeId));
                onScopeUpdated?.();
            }
        } catch (error) {
            console.error("Failed to delete scope:", error);
        }
    };

    const handleBulkUpload = async () => {
        if (!bulkText.trim()) return;

        setLoading(true);
        try {
            const addresses = bulkText
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            const response = await fetch(`${import.meta.env.VITE_SATELLITE_URL}/scope/bulk`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    engagementId: engagement.id,
                    addresses,
                    inScope: true
                })
            });

            if (response.ok) {
                const result = await response.json();
                alert(`Successfully created ${result.count} scope entries`);
                setBulkText("");
                setShowBulkInput(false);
                loadScopes();
                onScopeUpdated?.();
            } else {
                const error = await response.json();
                alert(`Error: ${error.error}`);
            }
        } catch (error) {
            console.error("Failed to bulk upload:", error);
            alert("Failed to upload scope entries");
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            setBulkText(e.target.result);
            setShowBulkInput(true);
        };
        reader.readAsText(file);
    };

    const toggleScopeStatus = async (scope) => {
        try {
            const response = await fetch(`${import.meta.env.VITE_SATELLITE_URL}/scope/${scope.id}`, {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    ...scope,
                    inScope: !scope.inScope
                })
            });

            if (response.ok) {
                const updated = await response.json();
                setScopes(prev => prev.map(s => s.id === scope.id ? updated : s));
                onScopeUpdated?.();
            }
        } catch (error) {
            console.error("Failed to update scope:", error);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
                <div className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75" onClick={onClose} />
                
                <div className="inline-block w-full max-w-4xl px-6 py-4 my-8 overflow-hidden text-left align-middle transition-all transform bg-white dark:bg-gray-800 shadow-xl rounded-lg">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            Scope Management - {engagement?.name}
                        </h3>
                        <button
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Add New Scope */}
                    <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                        <h4 className="font-medium mb-3">Add Single Entry</h4>
                        <form
                            className="flex flex-col md:flex-row gap-3"
                            onSubmit={(e) => { e.preventDefault(); handleAddScope(); }}
                        >
                            <input
                                type="text"
                                value={newScope.address}
                                onChange={(e) => setNewScope(prev => ({ ...prev, address: e.target.value }))}
                                placeholder="IP, domain or CIDR, e.g. 192.168.1.0/24"
                                aria-label="Address"
                                className="md:flex-[2] min-w-0 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono text-sm"
                            />
                            <input
                                type="text"
                                value={newScope.description}
                                onChange={(e) => setNewScope(prev => ({ ...prev, description: e.target.value }))}
                                placeholder="Description (optional)"
                                aria-label="Description"
                                className="md:flex-1 min-w-0 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            />
                            <select
                                value={newScope.inScope ? "in" : "out"}
                                onChange={(e) => setNewScope(prev => ({ ...prev, inScope: e.target.value === "in" }))}
                                aria-label="In or out of scope"
                                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            >
                                <option value="in">In scope</option>
                                <option value="out">Out of scope</option>
                            </select>
                            <button
                                type="submit"
                                disabled={!newScope.address.trim()}
                                className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                            >
                                <Plus className="w-4 h-4" />
                                Add
                            </button>
                        </form>
                    </div>

                    {/* Bulk Upload */}
                    <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                        <h4 className="font-medium mb-3">Bulk Upload</h4>
                        <div className="flex gap-3 mb-3">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".txt"
                                onChange={handleFileUpload}
                                className="hidden"
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                            >
                                <Upload className="w-4 h-4" />
                                Upload File
                            </button>
                            <button
                                onClick={() => setShowBulkInput(!showBulkInput)}
                                className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
                            >
                                <FileText className="w-4 h-4" />
                                Manual Entry
                            </button>
                        </div>

                        {showBulkInput && (
                            <div className="space-y-3">
                                <textarea
                                    value={bulkText}
                                    onChange={(e) => setBulkText(e.target.value)}
                                    placeholder="Enter one IP, domain, or subnet per line..."
                                    rows={8}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono text-sm"
                                />
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleBulkUpload}
                                        disabled={loading || !bulkText.trim()}
                                        className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                                    >
                                        <Save className="w-4 h-4" />
                                        {loading ? "Uploading..." : "Upload Entries"}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setBulkText("");
                                            setShowBulkInput(false);
                                        }}
                                        className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Scope List */}
                    <div>
                        <h4 className="font-medium mb-3">Current Scope ({scopes.length} entries)</h4>
                        <div className="max-h-96 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                            {scopes.length === 0 ? (
                                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                                    No scope entries yet. Add some addresses above.
                                </div>
                            ) : (
                                <table className="w-full">
                                    <thead className="bg-gray-50 dark:bg-gray-900">
                                        <tr>
                                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Status <span className="font-normal text-gray-400">(click to change)</span></th>
                                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Address</th>
                                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Description</th>
                                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                        {scopes.map(scope => (
                                            <tr key={scope.id} className="hover:bg-gray-50 dark:hover:bg-gray-900">
                                                <td className="px-4 py-2">
                                                    <button
                                                        onClick={() => toggleScopeStatus(scope)}
                                                        title={scope.inScope ? "In scope. Click to mark out of scope" : "Out of scope. Click to mark in scope"}
                                                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                                            scope.inScope 
                                                                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                                                : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                                        }`}
                                                    >
                                                        {scope.inScope ? "In Scope" : "Out of Scope"}
                                                    </button>
                                                </td>
                                                <td className="px-4 py-2 font-mono text-sm text-gray-900 dark:text-gray-100">
                                                    {scope.address}
                                                </td>
                                                <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                                                    {scope.description || "-"}
                                                </td>
                                                <td className="px-4 py-2">
                                                    <button
                                                        onClick={() => handleDeleteScope(scope.id)}
                                                        className="p-1 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ScopeModal;