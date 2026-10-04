import { useEffect, useState } from "react";
import { FileText, Shield, Cloud, AlertCircle } from "lucide-react";

import { customerName } from "../utils/customerName";
function NewRoEModal({ isOpen, onClose, onSubmit, engagement, isLoading = false }) {
    const [title, setTitle] = useState("");
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [templates, setTemplates] = useState([]);
    const [loadingTemplates, setLoadingTemplates] = useState(true);

    useEffect(() => {
        if (engagement) {
            const start = new Date(engagement.startDate).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
            });
            setTitle(`${customerName(engagement)} ${start} Rules of Engagement`);
        }
    }, [engagement]);

    useEffect(() => {
        if (isOpen) {
            fetchTemplates();
        }
    }, [isOpen]);

    const fetchTemplates = async () => {
        try {
            setLoadingTemplates(true);
            const res = await fetch(`${import.meta.env.VITE_SATELLITE_URL}/roe/templates/list`, {
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
            });
            if (res.ok) {
                const data = await res.json();
                setTemplates(data);
                // Select default template if available
                const defaultTemplate = data.find(t => t.isDefault);
                if (defaultTemplate) {
                    setSelectedTemplate(defaultTemplate.id);
                }
            }
        } catch (error) {
            console.error("Error fetching templates:", error);
        } finally {
            setLoadingTemplates(false);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({ title, templateId: selectedTemplate });
    };

    const getTemplateIcon = (templateName) => {
        if (templateName.toLowerCase().includes("network")) return Shield;
        if (templateName.toLowerCase().includes("web")) return FileText;
        if (templateName.toLowerCase().includes("cloud")) return Cloud;
        return FileText;
    };

    if (!isOpen || !engagement) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-2xl shadow-xl">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
                        <p className="text-gray-600 dark:text-gray-400">Creating RoE document...</p>
                    </div>
                ) : (
                    <>
                        <h3 className="text-xl font-semibold mb-6 text-gray-900 dark:text-gray-100">
                            Create Rules of Engagement
                        </h3>
                        <form onSubmit={handleSubmit}>
                            <div className="mb-6">
                                <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                                    RoE Document Title
                                </label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className="w-full px-3 py-2 border rounded-md text-gray-900 dark:text-white bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    required
                                />
                            </div>

                            <div className="mb-6">
                                <label className="block mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Select a Template
                                </label>
                                {loadingTemplates ? (
                                    <div className="text-center py-4">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                                    </div>
                                ) : templates.length === 0 ? (
                                    <div className="text-center py-8 bg-gray-50 dark:bg-gray-900 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
                                        <AlertCircle className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                                        <p className="text-gray-500 dark:text-gray-400">No templates available</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-3">
                                        {templates.map((template) => {
                                            const Icon = getTemplateIcon(template.name);
                                            return (
                                                <label
                                                    key={template.id}
                                                    className={`relative flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all ${
                                                        selectedTemplate === template.id
                                                            ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
                                                            : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500"
                                                    }`}
                                                >
                                                    <input
                                                        type="radio"
                                                        name="template"
                                                        value={template.id}
                                                        checked={selectedTemplate === template.id}
                                                        onChange={(e) => setSelectedTemplate(e.target.value)}
                                                        className="sr-only"
                                                        required
                                                    />
                                                    <Icon className="w-5 h-5 text-gray-500 dark:text-gray-400 mr-3 mt-0.5 flex-shrink-0" />
                                                    <div className="flex-1">
                                                        <div className="flex items-center">
                                                            <span className="font-medium text-gray-900 dark:text-gray-100">
                                                                {template.name}
                                                            </span>
                                                            {template.isDefault && (
                                                                <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded">
                                                                    Default
                                                                </span>
                                                            )}
                                                        </div>
                                                        {template.description && (
                                                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                                                {template.description}
                                                            </p>
                                                        )}
                                                    </div>
                                                    {selectedTemplate === template.id && (
                                                        <div className="absolute top-4 right-4">
                                                            <div className="w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center">
                                                                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                                </svg>
                                                            </div>
                                                        </div>
                                                    )}
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-4 py-2 text-sm rounded-md text-gray-700 dark:text-white bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={!selectedTemplate}
                                    className="px-4 py-2 text-sm rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
                                >
                                    Create RoE
                                </button>
                            </div>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
}

export default NewRoEModal;