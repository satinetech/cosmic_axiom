import { useEffect, useState } from "react";

import { DEFAULT_PROFILE, PROFILES, profileOf } from "../profiles";
const statusOptions = [
    { value: "PLANNED", label: "Planned" },
    { value: "ACTIVE", label: "Active" },
    { value: "COMPLETED", label: "Completed" },
    { value: "CANCELED", label: "Canceled" }
];

const typeOptions = [
    { value: "NETWORK_PENTEST", label: "Network Penetration Test" },
    { value: "WEB_APP_PENTEST", label: "Web Application Penetration Test" },
    { value: "MOBILE_APP_PENTEST", label: "Mobile Application Penetration Test" },
    { value: "API_PENTEST", label: "API Penetration Test" },
    { value: "CLOUD_SECURITY", label: "Cloud Security Assessment" },
    { value: "IOT_PENTEST", label: "IoT Penetration Test" },
    { value: "PHYSICAL_SECURITY", label: "Physical Security Assessment" },
    { value: "SOCIAL_ENGINEERING", label: "Social Engineering Assessment" },
    { value: "RED_TEAM", label: "Red Team Exercise" },
    { value: "PURPLE_TEAM", label: "Purple Team Exercise" },
    { value: "VULNERABILITY_ASSESSMENT", label: "Vulnerability Assessment" },
    { value: "COMPLIANCE_AUDIT", label: "Compliance Audit" }
];

const methodologyOptions = [
    { value: "BLACK_BOX", label: "Black Box" },
    { value: "GRAY_BOX", label: "Gray Box" },
    { value: "WHITE_BOX", label: "White Box" },
    { value: "HYBRID", label: "Hybrid" }
];

const riskToleranceOptions = [
    { value: "LOW", label: "Low" },
    { value: "MEDIUM", label: "Medium" },
    { value: "HIGH", label: "High" },
    { value: "CRITICAL", label: "Critical" }
];

const complianceOptions = [
    "SOC 2", "PCI-DSS", "HIPAA", "ISO 27001", "NIST", "FedRAMP", "GDPR", "SOX", "FISMA", "CMMC"
];

const NewEngagementModal = ({ isOpen, onClose, onSave, customers = [], initialData = null }) => {
    const [form, setForm] = useState({
        name: "",
        description: "",
        customerId: "",
        startDate: "",
        endDate: "",
        status: "PLANNED",
        profile: DEFAULT_PROFILE,
        type: "NETWORK_PENTEST",
        methodology: "BLACK_BOX",
        riskTolerance: "MEDIUM",
        complianceFrameworks: [],
        businessCriticalHours: { start: "", end: "", timezone: "EST" },
        criticalSystems: [],
        previousEngagements: [],
        budgetHours: "",
        maxConcurrentTesters: "",
    });

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                // Edit mode - populate with existing data
                setForm({
                    name: initialData.name || "",
                    description: initialData.description || "",
                    customerId: initialData.customerId || "",
                    startDate: initialData.startDate ? new Date(initialData.startDate).toISOString().split('T')[0] : "",
                    endDate: initialData.endDate ? new Date(initialData.endDate).toISOString().split('T')[0] : "",
                    status: initialData.status || "PLANNED",
                    profile: initialData.profile || DEFAULT_PROFILE,
                    type: initialData.type || "NETWORK_PENTEST",
                    methodology: initialData.methodology || "BLACK_BOX",
                    riskTolerance: initialData.riskTolerance || "MEDIUM",
                    complianceFrameworks: Array.isArray(initialData.complianceFrameworks) ? initialData.complianceFrameworks : [],
                    businessCriticalHours: initialData.businessCriticalHours || { start: "", end: "", timezone: "EST" },
                    criticalSystems: Array.isArray(initialData.criticalSystems) ? initialData.criticalSystems : [],
                    previousEngagements: Array.isArray(initialData.previousEngagements) ? initialData.previousEngagements : [],
                    budgetHours: initialData.budgetHours || "",
                    maxConcurrentTesters: initialData.maxConcurrentTesters || "",
                });
            } else {
                // Create mode - reset form
                setForm({
                    name: "",
                    description: "",
                    customerId: customers[0]?.id || "",
                    startDate: "",
                    endDate: "",
                    status: "PLANNED",
                    profile: DEFAULT_PROFILE,
                    type: "NETWORK_PENTEST",
                    methodology: "BLACK_BOX",
                    riskTolerance: "MEDIUM",
                    complianceFrameworks: [],
                    businessCriticalHours: "",
                    criticalSystems: [],
                    budgetHours: "",
                    maxConcurrentTesters: "",
                });
            }
        }
    }, [isOpen, initialData, customers]);

    const handleChange = (e) => {
        const { name, value, type } = e.target;
        if (type === 'number') {
            setForm((prev) => ({ ...prev, [name]: value ? parseInt(value) : "" }));
        } else {
            setForm((prev) => ({ ...prev, [name]: value }));
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!form.name || !form.customerId || !form.startDate || !form.endDate || !form.status) {
            alert("Please fill in all required fields");
            return;
        }
        
        const submitData = {
            ...form,
            budgetHours: form.budgetHours ? parseInt(form.budgetHours) : null,
            maxConcurrentTesters: form.maxConcurrentTesters ? parseInt(form.maxConcurrentTesters) : null,
            businessCriticalHours: (form.businessCriticalHours.start || form.businessCriticalHours.end) ? form.businessCriticalHours : null,
        };
        
        onSave(submitData);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <>
            <style>{`
                .checkbox-light {
                    appearance: none;
                    background-color: white !important;
                    border: 2px solid #d1d5db;
                    border-radius: 0.25rem;
                    width: 1rem;
                    height: 1rem;
                    position: relative;
                }
                .checkbox-light:checked {
                    background-color: #3b82f6 !important;
                    border-color: #3b82f6 !important;
                }
                .checkbox-light:checked::after {
                    content: '';
                    position: absolute;
                    left: 0.125rem;
                    top: 0rem;
                    width: 0.25rem;
                    height: 0.5rem;
                    border: solid white;
                    border-width: 0 2px 2px 0;
                    transform: rotate(45deg);
                }
                .checkbox-light:focus {
                    outline: none;
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.5);
                }
            `}</style>
            <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-full max-w-lg p-6">
                <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">
                    {initialData ? "Edit Engagement" : "New Engagement"}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Engagement Name <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            name="name"
                            value={form.name}
                            onChange={handleChange}
                            required
                            className="w-full p-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                        />
                    </div>

                    <div>
                        <label className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                        <textarea
                            name="description"
                            value={form.description}
                            onChange={handleChange}
                            rows="3"
                            placeholder="Brief description of the engagement..."
                            className="w-full p-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors resize-vertical"
                        />
                    </div>

                    <div>
                        <label className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Customer <span className="text-red-500">*</span></label>
                        <select
                            name="customerId"
                            value={form.customerId}
                            onChange={handleChange}
                            required
                            className="w-full p-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                        >
                            <option value="">Select a customer</option>
                            {customers.map((cust) => (
                                <option key={cust.id} value={cust.id}>
                                    {cust.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Start Date <span className="text-red-500">*</span></label>
                            <input
                                type="date"
                                name="startDate"
                                value={form.startDate}
                                onChange={handleChange}
                                required
                                className="w-full p-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                            />
                        </div>
                        <div className="flex-1">
                            <label className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">End Date <span className="text-red-500">*</span></label>
                            <input
                                type="date"
                                name="endDate"
                                value={form.endDate}
                                onChange={handleChange}
                                required
                                className="w-full p-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Status <span className="text-red-500">*</span></label>
                        <select
                            name="status"
                            value={form.status}
                            onChange={handleChange}
                            required
                            className="w-full p-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                        >
                            {statusOptions.map((status) => (
                                <option key={status.value} value={status.value}>
                                    {status.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Kind of engagement</label>
                        <select
                            name="profile"
                            value={form.profile}
                            onChange={handleChange}
                            className="w-full p-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                        >
                            {Object.values(PROFILES).map((profile) => (
                                <option key={profile.key} value={profile.key}>
                                    {profile.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {profileOf(form).usesTestingType && (
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Engagement Type</label>
                            <select
                                name="type"
                                value={form.type}
                                onChange={handleChange}
                                className="w-full p-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                            >
                                {typeOptions.map((type) => (
                                    <option key={type.value} value={type.value}>
                                        {type.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex-1">
                            <label className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Methodology</label>
                            <select
                                name="methodology"
                                value={form.methodology}
                                onChange={handleChange}
                                className="w-full p-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                            >
                                {methodologyOptions.map((methodology) => (
                                    <option key={methodology.value} value={methodology.value}>
                                        {methodology.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    )}

                    <div>
                        <label className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Risk Tolerance</label>
                        <select
                            name="riskTolerance"
                            value={form.riskTolerance}
                            onChange={handleChange}
                            className="w-full p-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                        >
                            {riskToleranceOptions.map((risk) => (
                                <option key={risk.value} value={risk.value}>
                                    {risk.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Budget Hours</label>
                            <input
                                type="number"
                                name="budgetHours"
                                value={form.budgetHours}
                                onChange={handleChange}
                                min="1"
                                placeholder="Total authorized testing hours"
                                className="w-full p-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                            />
                        </div>
                        <div className="flex-1">
                            <label className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Max Concurrent Testers</label>
                            <input
                                type="number"
                                name="maxConcurrentTesters"
                                value={form.maxConcurrentTesters}
                                onChange={handleChange}
                                min="1"
                                placeholder="Resource constraints"
                                className="w-full p-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Compliance Frameworks</label>
                        <div className="grid grid-cols-2 gap-2 p-3 border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-800/50 max-h-32 overflow-y-auto">
                            {complianceOptions.map((compliance) => (
                                <label key={compliance} className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={form.complianceFrameworks.includes(compliance)}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setForm(prev => ({
                                                    ...prev,
                                                    complianceFrameworks: [...prev.complianceFrameworks, compliance]
                                                }));
                                            } else {
                                                setForm(prev => ({
                                                    ...prev,
                                                    complianceFrameworks: prev.complianceFrameworks.filter(c => c !== compliance)
                                                }));
                                            }
                                        }}
                                        className="checkbox-light"
                                    />
                                    <span className="text-sm text-gray-700 dark:text-gray-300">{compliance}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Business Critical Hours</label>
                        <div className="grid grid-cols-3 gap-2">
                            <div>
                                <input
                                    type="time"
                                    value={form.businessCriticalHours.start}
                                    onChange={(e) => setForm(prev => ({
                                        ...prev,
                                        businessCriticalHours: { ...prev.businessCriticalHours, start: e.target.value }
                                    }))}
                                    className="w-full p-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                                    placeholder="Start time"
                                />
                            </div>
                            <div>
                                <input
                                    type="time"
                                    value={form.businessCriticalHours.end}
                                    onChange={(e) => setForm(prev => ({
                                        ...prev,
                                        businessCriticalHours: { ...prev.businessCriticalHours, end: e.target.value }
                                    }))}
                                    className="w-full p-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                                    placeholder="End time"
                                />
                            </div>
                            <div>
                                <select
                                    value={form.businessCriticalHours.timezone}
                                    onChange={(e) => setForm(prev => ({
                                        ...prev,
                                        businessCriticalHours: { ...prev.businessCriticalHours, timezone: e.target.value }
                                    }))}
                                    className="w-full p-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                                >
                                    <option value="EST">EST</option>
                                    <option value="CST">CST</option>
                                    <option value="MST">MST</option>
                                    <option value="PST">PST</option>
                                    <option value="UTC">UTC</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-300 dark:bg-gray-600 rounded text-gray-800 dark:text-white">
                            Cancel
                        </button>
                        <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-semibold">
                            {initialData ? "Update" : "Create"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
        </>
    );
};

export default NewEngagementModal;
