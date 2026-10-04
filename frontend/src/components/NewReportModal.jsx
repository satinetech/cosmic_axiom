import { useEffect, useState } from "react";

import { customerName } from "../utils/customerName";
function NewReportModal({ isOpen, onClose, onSubmit, engagement, isLoading = false }) {
    const [title, setTitle] = useState("");

    useEffect(() => {
        if (engagement) {
            const start = new Date(engagement.startDate).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
            });
            setTitle(`${customerName(engagement)} ${start} Pentest Report`);
        }
    }, [engagement]);

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(title);
    };

    if (!isOpen || !engagement) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md shadow-xl">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
                        <p className="text-gray-600 dark:text-gray-400">Creating report...</p>
                    </div>
                ) : (
                    <>
                        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
                            Create Report
                        </h3>
                        <form onSubmit={handleSubmit}>
                            <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                                Report Title
                            </label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full px-3 py-2 mb-4 border rounded-md text-gray-900 dark:text-white bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                required
                            />
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
                                    className="px-4 py-2 text-sm rounded-md text-white bg-indigo-600 hover:bg-indigo-700 transition"
                                >
                                    Create Report
                                </button>
                            </div>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
}

export default NewReportModal;
