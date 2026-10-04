import {
    AlertCircle,
    ArrowUp,
    ArrowDown,
    BookOpen,
    Check,
    ChevronDown,
    ChevronRight,
    Copy,
    Edit3,
    FileText,
    GripVertical,
    Info,
    Layers,
    Link,
    PlusCircle,
    RefreshCw,
    Save,
    Search,
    Settings,
    Shield,
    Trash2,
    X,
    Eye,
    Sparkles,
    Zap,
    Target,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    Building2,
    Briefcase,
    User,
    Mail,
    Phone,
    Calendar,
    Image,
    Upload,
    Download,
    Lightbulb,
    Plus
} from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import DashboardLayout from "../layouts/DashboardLayout";
import ConnectivityModal from "../components/ConnectivityModal";
import AffectedSystemsModal from "../components/AffectedSystemsModal";
import ImageManagementModal from "../components/ImageManagementModal";

function ReportWriter() {
    const { reportId } = useParams();
    const [token] = useState(localStorage.getItem("token"));

    // Core data
    const [report, setReport] = useState(null);
    const [engagement, setEngagement] = useState(null);
    const [customer, setCustomer] = useState(null);
    const [sections, setSections] = useState([]);
    const [findings, setFindings] = useState([]);
    const [scopes, setScopes] = useState([]);
    const [originalNarratives, setOriginalNarratives] = useState({});
    
    // UI state
    const [activeSection, setActiveSection] = useState("findings");
    const [editingFinding, setEditingFinding] = useState(null);
    const [editingField, setEditingField] = useState(null);
    const [showFindingLibrary, setShowFindingLibrary] = useState(false);
    const [showConnectivityModal, setShowConnectivityModal] = useState(false);
    const [showAffectedSystemsModal, setShowAffectedSystemsModal] = useState(false);
    const [selectedFindingForSystems, setSelectedFindingForSystems] = useState(null);
    const [showImageModal, setShowImageModal] = useState(false);
    const [selectedFindingForImages, setSelectedFindingForImages] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedSeverityFilter, setSelectedSeverityFilter] = useState("");
    const [isDragging, setIsDragging] = useState(false);
    const [draggedItem, setDraggedItem] = useState(null);
    const [dragOverItem, setDragOverItem] = useState(null);
    const [showPreview, setShowPreview] = useState(false);
    const [autoSaving, setAutoSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState(null);
    const [showCustomerInfo, setShowCustomerInfo] = useState(true);
    
    // AI prompt state
    const [showAiPrompt, setShowAiPrompt] = useState(false);
    const [aiPromptSection, setAiPromptSection] = useState("");
    const [aiPrompt, setAiPrompt] = useState("");
    const [generatingAi, setGeneratingAi] = useState(false);
    
    // Image management state
    const [findingImages, setFindingImages] = useState({});
    const [uploadingImage, setUploadingImage] = useState(null);
    const [editingImageId, setEditingImageId] = useState(null);
    const [editingImageField, setEditingImageField] = useState(null);
    
    const autoSaveTimerRef = useRef(null);
    const editInputRef = useRef(null);
    const fileInputRef = useRef(null);
    
    // AI Prompt Suggestions
    const promptSuggestions = {
        executive: [
            "Focus on high-level business risks and impact to the organization",
            "Emphasize critical and high severity findings with business context",
            "Include overall security posture assessment and key recommendations",
            "Highlight immediate action items and strategic improvements needed",
            "Keep it concise and suitable for C-level executives"
        ],
        methodology: [
            "Include OWASP, PTES, or NIST standards referenced during testing",
            "Describe both automated and manual testing approaches used",
            "Explain the phased approach taken (reconnaissance, scanning, exploitation, post-exploitation)",
            "Mention any limitations or constraints during the assessment",
            "Include details about testing windows and coordination with client teams"
        ],
        tools: [
            "List specific tools used for each phase of testing (e.g., Nmap, Burp Suite, Metasploit)",
            "Group tools by category (scanning, exploitation, post-exploitation, reporting)",
            "Include version numbers for compliance and reproducibility",
            "Mention any custom scripts or specialized techniques employed",
            "Explain why certain tools were chosen for this specific engagement"
        ],
        conclusion: [
            "Summarize the overall security posture and maturity level",
            "Prioritize remediation efforts based on risk and effort required",
            "Acknowledge positive security controls observed during testing",
            "Provide strategic recommendations for long-term security improvements",
            "Include next steps and recommendations for future assessments"
        ]
    };
    
    // Format date helper
    const formatEngagementDate = (dateString) => {
        if (!dateString) return 'Not set';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
        });
    };
    
    // Calculate engagement duration
    const getEngagementDuration = (startDate, endDate) => {
        if (!startDate || !endDate) return '';
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
    };

    useEffect(() => {
        loadData();
    }, [reportId, token]);

    const loadData = async () => {
        try {
            const headers = { Authorization: `Bearer ${token}` };

            const reportRes = await fetch(`${import.meta.env.VITE_SATELLITE_URL}/reports/${reportId}`, { headers });
            const reportData = await reportRes.json();
            setReport(reportData);
            
            // Store original narratives for reset functionality
            setOriginalNarratives({
                executiveSummary: reportData.executiveSummary || "",
                methodology: reportData.methodology || "",
                toolsAndTechniques: reportData.toolsAndTechniques || "",
                conclusion: reportData.conclusion || ""
            });

            const engRes = await fetch(`${import.meta.env.VITE_SATELLITE_URL}/engagement/${reportData.engagementId}`, { headers });
            const engagementData = await engRes.json();
            setEngagement(engagementData);

            const custRes = await fetch(`${import.meta.env.VITE_SATELLITE_URL}/customer`, { headers });
            const customers = await custRes.json();
            setCustomer(customers.find(c => c.id === engagementData.customerId) || null);

            const secRes = await fetch(`${import.meta.env.VITE_SATELLITE_URL}/reports/${reportId}/sections`, { headers });
            const secData = await secRes.json();
            
            // Ensure secData is an array before sorting
            const sectionsArray = Array.isArray(secData) ? secData : [];
            setSections(sectionsArray.sort((a, b) => a.position - b.position));

            // Load images for each finding
            const findingsWithImages = sectionsArray.filter(s => s.reportFinding?.id);
            for (const section of findingsWithImages) {
                await loadFindingImages(section.reportFinding.id);
            }

            // A list only if the request worked: an error body stored here would
            // replace the list, and the page's .filter calls would blank it.
            const listFrom = async (res, what) => {
                const data = await res.json().catch(() => null);
                if (res.ok && Array.isArray(data)) return data;
                console.error(`Failed to load ${what}:`, res.status, data);
                return [];
            };

            const findingRes = await fetch(`${import.meta.env.VITE_SATELLITE_URL}/findings`, { headers });
            setFindings(await listFrom(findingRes, "the finding library"));

            // Load scopes for the engagement
            if (engagementData?.id) {
                const scopeRes = await fetch(`${import.meta.env.VITE_SATELLITE_URL}/scope/engagement/${engagementData.id}`, { headers });
                setScopes(await listFrom(scopeRes, "the engagement's scope"));
            }
        } catch (err) {
            console.error("Failed to load data:", err);
        }
    };

    // Auto-save functionality
    const triggerAutoSave = () => {
        clearTimeout(autoSaveTimerRef.current);
        setAutoSaving(true);
        
        autoSaveTimerRef.current = setTimeout(async () => {
            await saveReport();
            setAutoSaving(false);
            setLastSaved(new Date());
        }, 2000);
    };

    const saveReport = async () => {
        try {
            // Save narrative sections
            await fetch(`${import.meta.env.VITE_SATELLITE_URL}/reports/${reportId}`, {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    executiveSummary: report.executiveSummary,
                    methodology: report.methodology,
                    toolsAndTechniques: report.toolsAndTechniques,
                    conclusion: report.conclusion
                })
            });

            // Save section positions
            for (let i = 0; i < sections.length; i++) {
                // Skip sections with temporary IDs or no ID
                if (!sections[i].id || sections[i].id.startsWith('temp-')) {
                    continue;
                }
                
                try {
                    await fetch(`${import.meta.env.VITE_SATELLITE_URL}/sections/${sections[i].id}`, {
                        method: "PUT",
                        headers: {
                            Authorization: `Bearer ${token}`,
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({ ...sections[i], position: i })
                    });
                } catch (err) {
                    console.error(`Failed to update section ${sections[i].id}:`, err);
                }
            }
        } catch (err) {
            console.error("Failed to save:", err);
        }
    };

    // Drag and drop handlers
    const handleDragStart = (e, index) => {
        setDraggedItem(index);
        setIsDragging(true);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e, index) => {
        e.preventDefault();
        setDragOverItem(index);
    };

    const handleDrop = (e, dropIndex) => {
        e.preventDefault();
        if (draggedItem === null) return;

        const newSections = [...sections];
        const draggedSection = newSections[draggedItem];
        
        newSections.splice(draggedItem, 1);
        newSections.splice(dropIndex, 0, draggedSection);
        
        setSections(newSections);
        setDraggedItem(null);
        setDragOverItem(null);
        setIsDragging(false);
        triggerAutoSave();
    };

    const handleDragEnd = () => {
        setDraggedItem(null);
        setDragOverItem(null);
        setIsDragging(false);
    };

    // Inline editing
    const startEdit = (sectionId, field) => {
        setEditingFinding(sectionId);
        setEditingField(field);
        setTimeout(() => editInputRef.current?.focus(), 100);
    };

    const handleInlineEdit = async (sectionId, field, value) => {
        // Update local state immediately
        setSections(prev => prev.map(section => {
            if (section.id === sectionId) {
                return {
                    ...section,
                    reportFinding: {
                        ...section.reportFinding,
                        [field]: value
                    }
                };
            }
            return section;
        }));

        // Find the section to get the finding ID
        const section = sections.find(s => s.id === sectionId);
        if (section?.reportFinding?.id) {
            try {
                // Update the finding in the database
                await fetch(`${import.meta.env.VITE_SATELLITE_URL}/sections/findings/${section.reportFinding.id}`, {
                    method: "PUT",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        [field]: value
                    })
                });
            } catch (err) {
                console.error("Failed to update finding:", err);
            }
        }
        
        triggerAutoSave();
    };

    const finishEdit = () => {
        setEditingFinding(null);
        setEditingField(null);
    };

    // Image management functions
    const loadFindingImages = async (reportFindingId) => {
        try {
            const response = await fetch(`${import.meta.env.VITE_SATELLITE_URL}/images/finding/${reportFindingId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
                const images = await response.json();
                setFindingImages(prev => ({
                    ...prev,
                    [reportFindingId]: images
                }));
            }
        } catch (err) {
            console.error("Failed to load finding images:", err);
        }
    };

    const uploadImage = async (reportFindingId, file, title, caption) => {
        try {
            setUploadingImage(reportFindingId);
            
            // Convert file to base64
            const base64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.readAsDataURL(file);
            });

            const response = await fetch(`${import.meta.env.VITE_SATELLITE_URL}/images`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    reportFindingId,
                    title: title || file.name,
                    caption: caption || "",
                    imageData: base64,
                    mimeType: file.type
                })
            });

            if (response.ok) {
                // Reload images for this finding
                await loadFindingImages(reportFindingId);
                return true;
            } else {
                throw new Error("Failed to upload image");
            }
        } catch (err) {
            console.error("Failed to upload image:", err);
            alert("Failed to upload image. Please try again.");
            return false;
        } finally {
            setUploadingImage(null);
        }
    };

    const updateImageMetadata = async (imageId, field, value) => {
        try {
            const response = await fetch(`${import.meta.env.VITE_SATELLITE_URL}/images/${imageId}`, {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ [field]: value })
            });

            if (response.ok) {
                // Update local state
                setFindingImages(prev => {
                    const updated = { ...prev };
                    Object.keys(updated).forEach(findingId => {
                        updated[findingId] = updated[findingId].map(img => 
                            img.id === imageId ? { ...img, [field]: value } : img
                        );
                    });
                    return updated;
                });
            }
        } catch (err) {
            console.error("Failed to update image:", err);
        }
    };

    const deleteImage = async (imageId, reportFindingId) => {
        if (!confirm("Are you sure you want to delete this image?")) return;
        
        try {
            const response = await fetch(`${import.meta.env.VITE_SATELLITE_URL}/images/${imageId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.ok) {
                // Remove from local state
                setFindingImages(prev => ({
                    ...prev,
                    [reportFindingId]: (prev[reportFindingId] || []).filter(img => img.id !== imageId)
                }));
            }
        } catch (err) {
            console.error("Failed to delete image:", err);
        }
    };


    // Add finding from template
    const addFindingFromTemplate = async (template) => {
        try {
            const res = await fetch(`${import.meta.env.VITE_SATELLITE_URL}/sections`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    reportId,
                    type: "finding",
                    title: template.title,
                    description: template.description,
                    severity: template.severity,
                    recommendation: template.recommendation,
                    impact: template.impact || "",
                    position: sections.length
                })
            });

            const created = await res.json();
            setSections(prev => [...prev, created]);
            setShowFindingLibrary(false);
            triggerAutoSave();
        } catch (err) {
            console.error("Error adding finding:", err);
        }
    };

    // Add connectivity section
    const addConnectivitySection = async (data) => {
        try {
            const res = await fetch(`${import.meta.env.VITE_SATELLITE_URL}/sections`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    reportId,
                    type: "connectivity",
                    title: data.title,
                    content: data.content,
                    position: sections.length
                })
            });

            if (!res.ok) {
                const error = await res.json();
                console.error("Failed to create connectivity section:", error);
                alert(`Failed to create section: ${error.error || 'Unknown error'}`);
                return;
            }

            const created = await res.json();
            setSections(prev => [...prev, created]);
            setShowConnectivityModal(false);
            triggerAutoSave();
        } catch (err) {
            console.error("Error adding connectivity section:", err);
            alert("Error adding connectivity section. Please try again.");
        }
    };

    const deleteFinding = async (sectionId) => {
        if (!confirm("Delete this finding?")) return;
        
        try {
            const response = await fetch(`${import.meta.env.VITE_SATELLITE_URL}/sections/${sectionId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (!response.ok) {
                const error = await response.json();
                console.error("Failed to delete section:", error);
                alert(`Failed to delete section: ${error.error || 'Unknown error'}`);
                return;
            }
            
            setSections(prev => prev.filter(s => s.id !== sectionId));
            triggerAutoSave();
        } catch (err) {
            console.error("Failed to delete:", err);
            alert("Error deleting section. Please try again.");
        }
    };

    const duplicateFinding = (section) => {
        const newSection = {
            ...section,
            id: `temp-${Date.now()}`,
            reportFinding: {
                ...section.reportFinding,
                title: `${section.reportFinding.title} (Copy)`
            }
        };
        setSections(prev => [...prev, newSection]);
        triggerAutoSave();
    };

    const resetNarrativeField = (field) => {
        setReport(prev => ({
            ...prev,
            [field]: originalNarratives[field]
        }));
        triggerAutoSave();
    };

    // AI Generation Functions
    const openAiPrompt = (sectionType) => {
        setAiPromptSection(sectionType);
        setAiPrompt("");
        setShowAiPrompt(true);
    };

    const generateAiContent = async () => {
        if (!aiPrompt.trim()) {
            alert("Please enter a prompt for AI generation");
            return;
        }

        setGeneratingAi(true);
        try {
            const response = await fetch(`${import.meta.env.VITE_SATELLITE_URL}/ai/generate/${reportId}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    prompt: aiPrompt,
                    sectionType: aiPromptSection,
                }),
            });

            if (!response.ok) throw new Error("Failed to generate AI content");

            const result = await response.json();
            
            // Update the appropriate field with AI-generated content
            const fieldMap = {
                executive: 'executiveSummary',
                methodology: 'methodology',
                tools: 'toolsAndTechniques',
                conclusion: 'conclusion'
            };

            setReport(prev => ({
                ...prev,
                [fieldMap[aiPromptSection]]: result.content
            }));

            triggerAutoSave();
            setShowAiPrompt(false);

        } catch (error) {
            console.error("AI generation failed:", error);
            alert("Failed to generate AI content. Please try again.");
        } finally {
            setGeneratingAi(false);
        }
    };

    // Handle affected systems save
    const handleAffectedSystemsSave = async (selectedSystems) => {
        if (!selectedFindingForSystems) return;

        try {
            // Update local state immediately
            setSections(prev => prev.map(section => {
                if (section.id === selectedFindingForSystems.id) {
                    return {
                        ...section,
                        reportFinding: {
                            ...section.reportFinding,
                            affectedSystems: selectedSystems
                        }
                    };
                }
                return section;
            }));

            // Update in database
            await fetch(`${import.meta.env.VITE_SATELLITE_URL}/sections/findings/${selectedFindingForSystems.reportFinding.id}`, {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    affectedSystems: selectedSystems
                })
            });

            triggerAutoSave();
        } catch (err) {
            console.error("Failed to save affected systems:", err);
            throw err;
        }
    };

    const getSeverityIcon = (severity) => {
        switch (severity) {
            case "CRITICAL":
                return <XCircle className="w-4 h-4 text-red-600" />;
            case "HIGH":
                return <AlertTriangle className="w-4 h-4 text-orange-600" />;
            case "MEDIUM":
                return <AlertCircle className="w-4 h-4 text-yellow-600" />;
            case "LOW":
                return <Info className="w-4 h-4 text-blue-600" />;
            default:
                return <Shield className="w-4 h-4 text-gray-600" />;
        }
    };

    const getSeverityColor = (severity) => {
        switch (severity) {
            case "CRITICAL":
                return "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800";
            case "HIGH":
                return "bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800";
            case "MEDIUM":
                return "bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800";
            case "LOW":
                return "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800";
            default:
                return "bg-gray-50 border-gray-200 dark:bg-gray-900/20 dark:border-gray-800";
        }
    };

    const filteredFindings = findings.filter(f => {
        const matchesSearch = !searchTerm || 
            f.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            f.description.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesSeverity = !selectedSeverityFilter || f.severity === selectedSeverityFilter;
        return matchesSearch && matchesSeverity;
    });

    // Generate HTML for preview
    const generateReportHTML = () => {
        // HTML escape function to prevent XSS
        const escapeHtml = (unsafe) => {
            if (!unsafe) return '';
            return String(unsafe)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        };

        // Deep escape object properties
        const escapeObject = (obj) => {
            if (!obj) return obj;
            if (typeof obj === 'string') return escapeHtml(obj);
            if (Array.isArray(obj)) return obj.map(escapeObject);
            if (typeof obj === 'object') {
                const escaped = {};
                for (const key in obj) {
                    escaped[key] = escapeObject(obj[key]);
                }
                return escaped;
            }
            return obj;
        };

        // Count findings by severity
        const findingSections = sections.filter(s => s.type?.toLowerCase() === "finding");
        const criticalCount = findingSections.filter(s => s.reportFinding?.severity === "CRITICAL").length;
        const highCount = findingSections.filter(s => s.reportFinding?.severity === "HIGH").length;
        const mediumCount = findingSections.filter(s => s.reportFinding?.severity === "MEDIUM").length;
        const lowCount = findingSections.filter(s => s.reportFinding?.severity === "LOW").length;
        const informationalCount = sections.filter(s => s.type?.toLowerCase() === "connectivity").length;

        // Format dates
        const formatDate = (date) => {
            if (!date) return new Date().toLocaleDateString();
            return new Date(date).toLocaleDateString();
        };

        // Prepare data for template - escape all user input
        const rawTemplateData = {
            report: {
                title: report?.title || "Penetration Testing Report",
                executiveSummary: report?.executiveSummary || "",
                methodology: report?.methodology || "",
                toolsAndTechniques: report?.toolsAndTechniques || "",
                conclusion: report?.conclusion || "",
                createdAt: formatDate(report?.createdAt),
                version: "1.0",
                criticalCount,
                highCount,
                mediumCount,
                lowCount,
                informationalCount,
                sections: sections.map(s => ({
                    ...s,
                    type: s.type.toUpperCase()
                }))
            },
            engagement: {
                customerName: customer?.name || "Client Organization",
                customer: customer?.name || "Client Organization",
                name: engagement?.name || "Security Assessment",
                type: engagement?.type || "Penetration Test",
                startDate: engagement?.startDate ? formatDate(engagement.startDate) : "N/A",
                endDate: engagement?.endDate ? formatDate(engagement.endDate) : "N/A",
                organization: "Security Testing Team",
                contactName: customer?.contacts?.find(c => c.isPrimary)?.name || "N/A",
                contactEmail: customer?.contacts?.find(c => c.isPrimary)?.email || "N/A",
                contactPhone: customer?.contacts?.find(c => c.isPrimary)?.phone || "N/A"
            },
            scopes: scopes || []
        };

        // Escape all data to prevent XSS
        const templateData = escapeObject(rawTemplateData);

        // Simple template replacement function
        const processTemplate = (template, data) => {
            let html = template;
            
            // Replace simple variables {{variable}}
            html = html.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
                const keys = path.trim().split('.');
                let value = data;
                for (const key of keys) {
                    value = value?.[key];
                }
                return value || '';
            });

            // Handle if conditions
            html = html.replace(/\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, condition, content) => {
                const keys = condition.trim().split('.');
                let value = data;
                for (const key of keys) {
                    value = value?.[key];
                }
                return value ? content : '';
            });

            // Handle if-else conditions
            html = html.replace(/\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, condition, ifContent, elseContent) => {
                const keys = condition.trim().split('.');
                let value = data;
                for (const key of keys) {
                    value = value?.[key];
                }
                return value ? ifContent : elseContent;
            });

            // Handle each loops for sections
            html = html.replace(/\{\{#each\s+report\.sections\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, content) => {
                return templateData.report.sections.map((section, index) => {
                    let sectionHtml = content;
                    
                    // Handle ifCond for FINDING type
                    sectionHtml = sectionHtml.replace(/\{\{#ifCond\s+type\s+"==="\s+"FINDING"\}\}([\s\S]*?)\{\{\/ifCond\}\}/g, (m, findingContent) => {
                        if (section.type === "FINDING") {
                            let result = findingContent;
                            
                            // Handle @first
                            result = result.replace(/\{\{#if\s+@first\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g, 
                                (m2, firstContent, otherContent) => index === 0 ? firstContent : otherContent
                            );
                            
                            // Replace section properties
                            result = result.replace(/\{\{reportFinding\.([^}]+)\}\}/g, (m2, prop) => {
                                return section.reportFinding?.[prop] || '';
                            });
                            
                            // Handle toLowerCase helper
                            result = result.replace(/\{\{toLowerCase\s+reportFinding\.([^}]+)\}\}/g, (m2, prop) => {
                                return (section.reportFinding?.[prop] || '').toLowerCase();
                            });
                            
                            return result;
                        }
                        return '';
                    });
                    
                    return sectionHtml;
                }).join('');
            });

            return html;
        };

        // HTML template
        const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${templateData.report.title}</title>
  <style>
    @media print {
      .page-break { page-break-before: always; }
      .no-break { page-break-inside: avoid; }
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.5;
      color: #1a202c;
      font-size: 13px;
      margin: 0;
      padding: 0;
    }
    
    /* Layout utilities */
    .h-screen { height: 100vh; }
    .flex { display: flex; }
    .flex-col { flex-direction: column; }
    .justify-center { justify-content: center; }
    .items-center { align-items: center; }
    .items-baseline { align-items: baseline; }
    .justify-between { justify-content: space-between; }
    .text-center { text-align: center; }
    .text-left { text-align: left; }
    .text-justify { text-align: justify; }
    .relative { position: relative; }
    .absolute { position: absolute; }
    .mx-auto { margin-left: auto; margin-right: auto; }
    
    /* Spacing utilities */
    .px-10 { padding-left: 2.5rem; padding-right: 2.5rem; }
    .py-8 { padding-top: 2rem; padding-bottom: 2rem; }
    .px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
    .py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
    .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
    .p-6 { padding: 1.5rem; }
    .p-4 { padding: 1rem; }
    .mb-6 { margin-bottom: 1.5rem; }
    .mb-8 { margin-bottom: 2rem; }
    .mb-3 { margin-bottom: 0.75rem; }
    .mb-4 { margin-bottom: 1rem; }
    .mb-2 { margin-bottom: 0.5rem; }
    .mt-6 { margin-top: 1.5rem; }
    .mt-8 { margin-top: 2rem; }
    .mt-4 { margin-top: 1rem; }
    .space-y-3 > * + * { margin-top: 0.75rem; }
    .space-y-6 > * + * { margin-top: 1.5rem; }
    .gap-2 { gap: 0.5rem; }
    .gap-4 { gap: 1rem; }
    
    /* Typography utilities */
    .text-4xl { font-size: 2.25rem; line-height: 2.5rem; }
    .text-3xl { font-size: 1.875rem; line-height: 2.25rem; }
    .text-2xl { font-size: 1.5rem; line-height: 2rem; }
    .text-xl { font-size: 1.25rem; line-height: 1.75rem; }
    .text-lg { font-size: 1.125rem; line-height: 1.75rem; }
    .text-base { font-size: 1rem; line-height: 1.5rem; }
    .text-sm { font-size: 0.875rem; line-height: 1.25rem; }
    .text-xs { font-size: 0.75rem; line-height: 1rem; }
    .font-bold { font-weight: 700; }
    .font-semibold { font-weight: 600; }
    .font-medium { font-weight: 500; }
    .leading-relaxed { line-height: 1.625; }
    .uppercase { text-transform: uppercase; }
    
    /* Color utilities */
    .text-gray-900 { color: #111827; }
    .text-gray-800 { color: #1f2937; }
    .text-gray-700 { color: #374151; }
    .text-gray-600 { color: #4b5563; }
    .text-gray-500 { color: #6b7280; }
    .text-gray-400 { color: #9ca3af; }
    .text-indigo-600 { color: #4f46e5; }
    .text-red-600 { color: #dc2626; }
    .text-orange-600 { color: #ea580c; }
    .text-yellow-600 { color: #ca8a04; }
    .text-blue-600 { color: #2563eb; }
    .text-green-600 { color: #16a34a; }
    .text-white { color: white; }
    .bg-gray-50 { background-color: #f9fafb; }
    .bg-gray-100 { background-color: #f3f4f6; }
    .bg-gray-200 { background-color: #e5e7eb; }
    .bg-white { background-color: white; }
    
    /* Border utilities */
    .border { border-width: 1px; }
    .border-b { border-bottom-width: 1px; }
    .border-gray-200 { border-color: #e5e7eb; }
    .rounded-lg { border-radius: 0.5rem; }
    .rounded-full { border-radius: 9999px; }
    .rounded { border-radius: 0.25rem; }
    
    /* Grid utilities */
    .grid { display: grid; }
    .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
    @media (min-width: 768px) {
      .md\\:grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .md\\:grid-cols-5 { grid-template-columns: repeat(5, minmax(0, 1fr)); }
    }
    
    /* Width utilities */
    .w-20 { width: 5rem; }
    .h-20 { height: 5rem; }
    .w-full { width: 100%; }
    .w-1\\/3 { width: 33.333333%; }
    .max-w-none { max-width: none; }
    
    /* List utilities */
    .list-disc { list-style-type: disc; }
    .list-inside { list-style-position: inside; }
    
    /* Position utilities */
    .top-8 { top: 2rem; }
    .right-8 { right: 2rem; }
    
    /* Other utilities */
    .overflow-x-auto { overflow-x: auto; }
    .overflow-hidden { overflow: hidden; }
    .min-w-full { min-width: 100%; }
    .truncate { 
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .divide-y > * + * { border-top-width: 1px; }
    .divide-gray-200 > * + * { border-color: #e5e7eb; }
    
    /* Prose styles */
    .prose { color: #374151; max-width: 65ch; }
    .prose p { margin-top: 1.25em; margin-bottom: 1.25em; }
    
    /* Custom component styles */
    .font-mono { font-family: 'Consolas', 'Monaco', 'Courier New', monospace; }
    
    .gradient-text {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      text-fill-color: transparent;
      display: inline-block;
    }
    
    .severity-critical { background-color: #dc2626; color: white; }
    .severity-high { background-color: #ea580c; color: white; }
    .severity-medium { background-color: #f59e0b; color: white; }
    .severity-low { background-color: #3b82f6; color: white; }
    .severity-info { background-color: #6b7280; color: white; }
    
    .section-header {
      border-bottom: 3px solid #e5e7eb;
      padding-bottom: 0.5rem;
      margin-bottom: 1.5rem;
    }
    
    .finding-box {
      border: 1px solid #e5e7eb;
      border-radius: 0.5rem;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      background-color: #f9fafb;
    }
    
    .evidence-box {
      background-color: #f3f4f6;
      border: 1px solid #d1d5db;
      border-radius: 0.375rem;
      padding: 1rem;
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      font-size: 0.875rem;
      overflow-x: auto;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0;
    }
    
    th, td {
      border: 1px solid #e5e7eb;
      padding: 0.75rem;
      text-align: left;
    }
    
    th {
      background-color: #f3f4f6;
      font-weight: 600;
    }
  </style>
</head>
<body class="text-gray-900">

  <!-- Cover Page -->
  <div class="h-screen flex flex-col justify-center items-center page-break relative">
    <div class="absolute top-8 right-8 text-sm text-gray-500">
      <span class="px-3 py-1 bg-gray-100 text-gray-700 rounded-full font-semibold">CONFIDENTIAL</span>
    </div>
    
    <div class="text-center">
      <div class="mb-6">
        <svg class="w-20 h-20 mx-auto text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
        </svg>
      </div>
      
      <h1 class="text-4xl font-bold mb-3 gradient-text">Penetration Testing Report</h1>
      <h2 class="text-xl text-gray-600 mb-8">${templateData.report.title}</h2>
    </div>
    
    <div class="w-[80%] bg-gray-50 rounded-lg p-6 mt-6">
      <table class="w-full text-left">
        <tr>
          <td class="font-semibold text-gray-700 py-2 w-1/3">Client Organization:</td>
          <td class="text-gray-900">${templateData.engagement.customerName}</td>
        </tr>
        <tr>
          <td class="font-semibold text-gray-700 py-2">Engagement Type:</td>
          <td class="text-gray-900">${templateData.engagement.type}</td>
        </tr>
        <tr>
          <td class="font-semibold text-gray-700 py-2">Testing Period:</td>
          <td class="text-gray-900">${templateData.engagement.startDate} to ${templateData.engagement.endDate}</td>
        </tr>
        <tr>
          <td class="font-semibold text-gray-700 py-2">Report Date:</td>
          <td class="text-gray-900">${templateData.report.createdAt}</td>
        </tr>
      </table>
    </div>
  </div>

  <!-- Table of Contents -->
  <div class="px-10 py-8 page-break">
    <h2 class="text-2xl font-bold mb-6 section-header">Table of Contents</h2>
    <div class="space-y-3">
      <div class="flex justify-between items-baseline">
        <span class="text-lg">1. Executive Summary</span>
        <span class="text-gray-500">3</span>
      </div>
      <div class="flex justify-between items-baseline">
        <span class="text-lg">2. Engagement Overview</span>
        <span class="text-gray-500">4</span>
      </div>
      <div class="flex justify-between items-baseline pl-6">
        <span class="text-base text-gray-700">2.1 Scope</span>
        <span class="text-gray-500">4</span>
      </div>
      <div class="flex justify-between items-baseline pl-6">
        <span class="text-base text-gray-700">2.2 Methodology</span>
        <span class="text-gray-500">5</span>
      </div>
      <div class="flex justify-between items-baseline">
        <span class="text-lg">3. Findings Summary</span>
        <span class="text-gray-500">6</span>
      </div>
      ${templateData.report.sections.filter(s => s.type === "CONNECTIVITY").length > 0 ? `
      <div class="flex justify-between items-baseline">
        <span class="text-lg">4. Network Connectivity Tests</span>
        <span class="text-gray-500">7</span>
      </div>
      ` : ''}
      <div class="flex justify-between items-baseline">
        <span class="text-lg">${templateData.report.sections.filter(s => s.type === "CONNECTIVITY").length > 0 ? '5' : '4'}. Detailed Findings</span>
        <span class="text-gray-500">${templateData.report.sections.filter(s => s.type === "CONNECTIVITY").length > 0 ? '8' : '7'}</span>
      </div>
      <div class="flex justify-between items-baseline">
        <span class="text-lg">${templateData.report.sections.filter(s => s.type === "CONNECTIVITY").length > 0 ? '6' : '5'}. Tools and Techniques</span>
        <span class="text-gray-500">X</span>
      </div>
      <div class="flex justify-between items-baseline">
        <span class="text-lg">${templateData.report.sections.filter(s => s.type === "CONNECTIVITY").length > 0 ? '7' : '6'}. Conclusion</span>
        <span class="text-gray-500">X</span>
      </div>
    </div>
  </div>

  <!-- Executive Summary -->
  ${templateData.report.executiveSummary ? `
  <div class="px-10 py-8 page-break">
    <h2 class="text-2xl font-bold mb-6 section-header">Executive Summary</h2>
    <div class="prose max-w-none">
      <p class="text-gray-800 leading-relaxed text-justify">${templateData.report.executiveSummary}</p>
    </div>
    
    <div class="mt-8 bg-gray-50 rounded-lg p-6">
      <h3 class="text-xl font-semibold mb-4">Key Statistics</h3>
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div class="text-center">
          <div class="text-3xl font-bold text-red-600">${templateData.report.criticalCount}</div>
          <div class="text-sm text-gray-600">Critical</div>
        </div>
        <div class="text-center">
          <div class="text-3xl font-bold text-orange-600">${templateData.report.highCount}</div>
          <div class="text-sm text-gray-600">High</div>
        </div>
        <div class="text-center">
          <div class="text-3xl font-bold text-yellow-600">${templateData.report.mediumCount}</div>
          <div class="text-sm text-gray-600">Medium</div>
        </div>
        <div class="text-center">
          <div class="text-3xl font-bold text-blue-600">${templateData.report.lowCount}</div>
          <div class="text-sm text-gray-600">Low</div>
        </div>
        <div class="text-center">
          <div class="text-3xl font-bold text-gray-600">${templateData.report.informationalCount}</div>
          <div class="text-sm text-gray-600">Info</div>
        </div>
      </div>
    </div>
  </div>
  ` : ''}

  <!-- Engagement Overview -->
  <div class="px-10 py-8 page-break">
    <h2 class="text-2xl font-bold mb-6 section-header">2. Engagement Overview</h2>
    
    <div class="mb-8">
      <h3 class="text-xl font-semibold mb-4">2.1 Scope</h3>
      <div class="bg-gray-50 rounded-lg p-4">
        <p class="text-gray-800 mb-2"><strong>Client:</strong> ${templateData.engagement.customerName}</p>
        <p class="text-gray-800 mb-2"><strong>Engagement:</strong> ${templateData.engagement.name}</p>
        <p class="text-gray-800 mb-2"><strong>Type:</strong> ${templateData.engagement.type}</p>
        <p class="text-gray-800 mb-2"><strong>Duration:</strong> ${templateData.engagement.startDate} - ${templateData.engagement.endDate}</p>
        ${templateData.scopes && templateData.scopes.length > 0 ? `
        <div class="mt-4">
          <p class="text-gray-800 font-semibold mb-2">In-Scope Systems:</p>
          ${templateData.scopes.length > 20 ? `
          <!-- For many entries, use a compact table format -->
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="border-b">
                  <th class="text-left py-1 pr-4 font-medium text-gray-700">Address/Target</th>
                  <th class="text-left py-1 font-medium text-gray-700">Description</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                ${templateData.scopes.filter(s => s.inScope !== false).map(scope => `
                <tr>
                  <td class="py-1 pr-4 text-gray-700 font-mono text-xs">${scope.address || ''}</td>
                  <td class="py-1 text-gray-600 text-xs">${scope.description || '-'}</td>
                </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          ` : `
          <!-- For fewer entries, use a more readable format -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            ${templateData.scopes.filter(s => s.inScope !== false).map(scope => `
            <div class="flex items-start gap-2 text-sm">
              <span class="text-gray-400">•</span>
              <div>
                <span class="font-mono text-gray-700">${scope.address || ''}</span>
                ${scope.description ? `<span class="text-gray-600 text-xs block">${scope.description}</span>` : ''}
              </div>
            </div>
            `).join('')}
          </div>
          `}
        </div>
        ` : ''}
      </div>
    </div>
    
    ${templateData.report.methodology ? `
    <div class="mb-8">
      <h3 class="text-xl font-semibold mb-4">2.2 Methodology</h3>
      <p class="text-gray-800 leading-relaxed">${templateData.report.methodology}</p>
    </div>
    ` : ''}
  </div>

  <!-- Findings Summary -->
  <div class="px-10 py-8 page-break">
    <h2 class="text-2xl font-bold mb-6 section-header">3. Findings Summary</h2>
    <div class="bg-gray-50 rounded-lg p-6">
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div class="text-center">
          <div class="text-3xl font-bold text-red-600">${templateData.report.criticalCount}</div>
          <div class="text-sm text-gray-600">Critical</div>
        </div>
        <div class="text-center">
          <div class="text-3xl font-bold text-orange-600">${templateData.report.highCount}</div>
          <div class="text-sm text-gray-600">High</div>
        </div>
        <div class="text-center">
          <div class="text-3xl font-bold text-yellow-600">${templateData.report.mediumCount}</div>
          <div class="text-sm text-gray-600">Medium</div>
        </div>
        <div class="text-center">
          <div class="text-3xl font-bold text-blue-600">${templateData.report.lowCount}</div>
          <div class="text-sm text-gray-600">Low</div>
        </div>
        <div class="text-center">
          <div class="text-3xl font-bold text-gray-600">${templateData.report.informationalCount}</div>
          <div class="text-sm text-gray-600">Info</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Connectivity Sections -->
  ${templateData.report.sections.filter(s => s.type === "CONNECTIVITY").length > 0 ? `
    ${templateData.report.sections.filter(s => s.type === "CONNECTIVITY").map((section, index) => `
      <div class="px-10 py-8 page-break">
        ${index === 0 ? '<h2 class="text-2xl font-bold mb-6 section-header">4. Network Connectivity Tests</h2>' : ''}
        <h3 class="text-xl font-semibold mb-4">${section.title || 'Connectivity Test Results'}</h3>
        <div class="evidence-box">
          <pre style="white-space: pre-wrap; word-wrap: break-word;">${section.content || ''}</pre>
        </div>
      </div>
    `).join('')}
  ` : ''}

  <!-- Detailed Findings -->
  ${templateData.report.sections.filter(s => s.type === "FINDING").map((section, index) => `
    <div class="px-10 py-8 ${index === 0 ? 'page-break' : 'page-break no-break'}">
      ${index === 0 ? `<h2 class="text-2xl font-bold mb-6 section-header">${templateData.report.sections.filter(s => s.type === "CONNECTIVITY").length > 0 ? '5' : '4'}. Detailed Findings</h2>` : ''}
      <div class="finding-box">
        <div class="flex items-start justify-between mb-4">
          <h3 class="text-xl font-bold text-gray-900">${section.reportFinding?.title || 'Untitled Finding'}</h3>
          <span class="px-3 py-1 rounded-full text-sm font-semibold severity-${(section.reportFinding?.severity || 'LOW').toLowerCase()}">
            ${section.reportFinding?.severity || 'LOW'}
          </span>
        </div>
        
        <div class="mb-6">
          <h4 class="font-semibold text-base mb-2 text-gray-800">Description</h4>
          <p class="text-gray-700 leading-relaxed">${section.reportFinding?.description || ''}</p>
        </div>
        
        ${section.reportFinding?.impact ? `
        <div class="mb-6">
          <h4 class="font-semibold text-base mb-2 text-gray-800">Impact</h4>
          <p class="text-gray-700 leading-relaxed">${section.reportFinding.impact}</p>
        </div>
        ` : ''}
        
        ${section.reportFinding?.affectedSystems && section.reportFinding.affectedSystems.length > 0 ? `
        <div class="mb-6">
          <h4 class="font-semibold text-base mb-2 text-gray-800">Affected Systems</h4>
          <ul class="list-disc list-inside text-gray-700">
            ${section.reportFinding.affectedSystems.map(system => `<li>${system}</li>`).join('')}
          </ul>
        </div>
        ` : ''}
        
        ${section.reportFinding?.recommendation ? `
        <div class="mb-6">
          <h4 class="font-semibold text-base mb-2 text-gray-800">Recommendation</h4>
          <p class="text-gray-700 leading-relaxed">${section.reportFinding.recommendation}</p>
        </div>
        ` : ''}
      </div>
    </div>
  `).join('')}

  <!-- Tools and Techniques -->
  ${templateData.report.toolsAndTechniques ? `
  <div class="px-10 py-8 page-break">
    <h2 class="text-2xl font-bold mb-6 section-header">${templateData.report.sections.filter(s => s.type === "CONNECTIVITY").length > 0 ? '6' : '5'}. Tools and Techniques</h2>
    <p class="text-gray-800 leading-relaxed mb-6">${templateData.report.toolsAndTechniques}</p>
  </div>
  ` : ''}

  <!-- Conclusion -->
  ${templateData.report.conclusion ? `
  <div class="px-10 py-8 page-break">
    <h2 class="text-2xl font-bold mb-6 section-header">${templateData.report.sections.filter(s => s.type === "CONNECTIVITY").length > 0 ? '7' : '6'}. Conclusion</h2>
    <p class="text-gray-800 leading-relaxed">${templateData.report.conclusion}</p>
  </div>
  ` : ''}

</body>
</html>`;

        return htmlTemplate;
    };

    return (
        <DashboardLayout>
            <div className="h-full flex flex-col">
                {/* Header */}
                <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
                    <div className="flex justify-between items-start">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                <Sparkles className="w-6 h-6 text-indigo-600" />
                                Report Workbench
                            </h1>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                {report?.title} • {customer?.name} • {engagement?.name}
                            </p>
                        </div>
                        <div className="flex items-center gap-4">
                            {autoSaving && (
                                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div>
                                    Saving...
                                </div>
                            )}
                            {lastSaved && !autoSaving && (
                                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                                    Saved {new Date(lastSaved).toLocaleTimeString()}
                                </div>
                            )}
                            <button
                                onClick={() => setShowPreview(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
                            >
                                <Eye className="w-4 h-4" />
                                Preview
                            </button>
                        </div>
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Sidebar */}
                    <div className="w-64 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
                        {/* Customer Info Panel */}
                        {customer && engagement && (
                            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                                <button
                                    onClick={() => setShowCustomerInfo(!showCustomerInfo)}
                                    className="w-full flex items-center justify-between text-left mb-3"
                                >
                                    <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Engagement Details
                                    </h3>
                                    {showCustomerInfo ? 
                                        <ChevronDown className="w-4 h-4 text-gray-400" /> : 
                                        <ChevronRight className="w-4 h-4 text-gray-400" />
                                    }
                                </button>
                                
                                {showCustomerInfo && (
                                    <div className="space-y-3 text-sm">
                                        <div>
                                            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-1">
                                                <Building2 className="w-3 h-3" />
                                                <span className="font-medium">Customer</span>
                                            </div>
                                            <p className="text-gray-900 dark:text-gray-100 ml-5">{customer.name}</p>
                                        </div>
                                        
                                        {customer.contacts?.find(c => c.isPrimary) && (
                                            <div>
                                                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-1">
                                                    <User className="w-3 h-3" />
                                                    <span className="font-medium">Primary Contact</span>
                                                </div>
                                                <div className="ml-5 space-y-1">
                                                    <p className="text-gray-900 dark:text-gray-100">
                                                        {customer.contacts.find(c => c.isPrimary).name}
                                                    </p>
                                                    <p className="text-gray-600 dark:text-gray-400 text-xs flex items-center gap-1">
                                                        <Mail className="w-3 h-3" />
                                                        {customer.contacts.find(c => c.isPrimary).email}
                                                    </p>
                                                    {customer.contacts.find(c => c.isPrimary).phone && (
                                                        <p className="text-gray-600 dark:text-gray-400 text-xs flex items-center gap-1">
                                                            <Phone className="w-3 h-3" />
                                                            {customer.contacts.find(c => c.isPrimary).phone}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                        
                                        <div>
                                            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-1">
                                                <Briefcase className="w-3 h-3" />
                                                <span className="font-medium">Engagement</span>
                                            </div>
                                            <div className="ml-5 space-y-1">
                                                <p className="text-gray-900 dark:text-gray-100">{engagement.name}</p>
                                                <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 mb-1">
                                                    <Calendar className="w-3 h-3" />
                                                    <span>{formatEngagementDate(engagement.startDate)} → {formatEngagementDate(engagement.endDate)}</span>
                                                    {engagement.startDate && engagement.endDate && (
                                                        <span className="text-gray-500 dark:text-gray-500 italic">
                                                            ({getEngagementDuration(engagement.startDate, engagement.endDate)})
                                                        </span>
                                                    )}
                                                </div>
                                                <span className={`inline-flex px-2 py-0.5 text-xs rounded-full ${
                                                    engagement.status === "Active" 
                                                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                                        : engagement.status === "Completed"
                                                        ? "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"
                                                        : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                                                }`}>
                                                    {engagement.status}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="p-4 space-y-1">
                            <button
                                onClick={() => setActiveSection("findings")}
                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                                    activeSection === "findings"
                                        ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
                                        : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                                }`}
                            >
                                <AlertCircle className="w-4 h-4" />
                                <span className="font-medium">Findings</span>
                                <span className="ml-auto text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded-full">
                                    {sections.filter(s => s.type?.toLowerCase() === "finding" || s.type?.toLowerCase() === "connectivity").length}
                                </span>
                            </button>
                            <button
                                onClick={() => setActiveSection("executive")}
                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                                    activeSection === "executive"
                                        ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
                                        : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                                }`}
                            >
                                <FileText className="w-4 h-4" />
                                <span className="font-medium">Executive Summary</span>
                            </button>
                            <button
                                onClick={() => setActiveSection("methodology")}
                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                                    activeSection === "methodology"
                                        ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
                                        : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                                }`}
                            >
                                <Target className="w-4 h-4" />
                                <span className="font-medium">Methodology</span>
                            </button>
                            <button
                                onClick={() => setActiveSection("tools")}
                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                                    activeSection === "tools"
                                        ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
                                        : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                                }`}
                            >
                                <Settings className="w-4 h-4" />
                                <span className="font-medium">Tools & Techniques</span>
                            </button>
                            <button
                                onClick={() => setActiveSection("conclusion")}
                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                                    activeSection === "conclusion"
                                        ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
                                        : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                                }`}
                            >
                                <CheckCircle2 className="w-4 h-4" />
                                <span className="font-medium">Conclusion</span>
                            </button>
                        </div>

                        {/* Finding Stats */}
                        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                                Finding Summary
                            </h3>
                            <div className="space-y-2">
                                {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map(severity => {
                                    const count = sections.filter(s => 
                                        s.type?.toLowerCase() === "finding" && s.reportFinding?.severity === severity
                                    ).length;
                                    return (
                                        <div key={severity} className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                {getSeverityIcon(severity)}
                                                <span className="text-sm text-gray-700 dark:text-gray-300">{severity}</span>
                                            </div>
                                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{count}</span>
                                        </div>
                                    );
                                })}
                                {/* Informational */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Info className="w-4 h-4 text-gray-600" />
                                        <span className="text-sm text-gray-700 dark:text-gray-300">INFORMATIONAL</span>
                                    </div>
                                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                        {sections.filter(s => s.type?.toLowerCase() === "connectivity").length}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
                        <div className="p-6">
                            {activeSection === "findings" && (
                                <div>
                                    <div className="flex justify-between items-center mb-6">
                                        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                                            Findings Management
                                        </h2>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setShowFindingLibrary(true)}
                                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
                                            >
                                                <PlusCircle className="w-4 h-4" />
                                                Add Finding
                                            </button>
                                            <button
                                                onClick={() => setShowConnectivityModal(true)}
                                                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                                            >
                                                <Link className="w-4 h-4" />
                                                Add Connectivity
                                            </button>
                                        </div>
                                    </div>

                                    {/* Findings List */}
                                    <div className="space-y-4">
                                        {sections.filter(s => s.type === "finding" || s.type === "FINDING" || s.type === "connectivity" || s.type === "CONNECTIVITY").map((section, index) => (
                                            <div
                                                key={section.id}
                                                className={`bg-white dark:bg-gray-800 rounded-xl border-2 transition-all ${
                                                    dragOverItem === index && isDragging
                                                        ? "border-indigo-500 scale-[1.02]"
                                                        : section.type === "connectivity" || section.type === "CONNECTIVITY"
                                                            ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800"
                                                            : getSeverityColor(section.reportFinding?.severity)
                                                }`}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, index)}
                                                onDragOver={(e) => handleDragOver(e, index)}
                                                onDrop={(e) => handleDrop(e, index)}
                                                onDragEnd={handleDragEnd}
                                            >
                                                <div className="p-6">
                                                    <div className="flex items-start gap-4">
                                                        <div className="cursor-move">
                                                            <GripVertical className="w-5 h-5 text-gray-400" />
                                                        </div>
                                                        <div className="flex-1 space-y-4">
                                                            {(section.type === "connectivity" || section.type === "CONNECTIVITY") ? (
                                                                <>
                                                                    {/* Connectivity Section */}
                                                                    <div>
                                                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                                                            <Link className="w-5 h-5 text-green-600" />
                                                                            {section.title || "Network Connectivity Tests"}
                                                                        </h3>
                                                                    </div>
                                                                    <div>
                                                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                                                                            Content
                                                                        </label>
                                                                        <textarea
                                                                            value={section.content || ""}
                                                                            onChange={(e) => {
                                                                                setSections(prev => prev.map(s => 
                                                                                    s.id === section.id 
                                                                                        ? { ...s, content: e.target.value }
                                                                                        : s
                                                                                ));
                                                                                triggerAutoSave();
                                                                            }}
                                                                            rows={8}
                                                                            className="w-full p-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-gray-100"
                                                                            placeholder="Document network connectivity tests, ports tested, results..."
                                                                        />
                                                                    </div>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    {/* Finding Section */}
                                                                    {/* Title */}
                                                                    <div>
                                                                        {editingFinding === section.id && editingField === 'title' ? (
                                                                            <input
                                                                                ref={editInputRef}
                                                                                type="text"
                                                                                value={section.reportFinding?.title || ''}
                                                                                onChange={(e) => handleInlineEdit(section.id, 'title', e.target.value)}
                                                                                onBlur={finishEdit}
                                                                                onKeyDown={(e) => e.key === 'Enter' && finishEdit()}
                                                                                className="w-full text-lg font-semibold bg-transparent border-b-2 border-indigo-500 outline-none"
                                                                            />
                                                                        ) : (
                                                                            <h3 
                                                                                onClick={() => startEdit(section.id, 'title')}
                                                                                className="text-lg font-semibold text-gray-900 dark:text-gray-100 cursor-pointer hover:text-indigo-600 flex items-center gap-2"
                                                                            >
                                                                                {getSeverityIcon(section.reportFinding?.severity)}
                                                                                {section.reportFinding?.title || 'Untitled Finding'}
                                                                                <Edit3 className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                                            </h3>
                                                                        )}
                                                                    </div>

                                                            {/* Severity */}
                                                            <div className="flex items-center gap-4">
                                                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Severity:</label>
                                                                <select
                                                                    value={section.reportFinding?.severity || 'MEDIUM'}
                                                                    onChange={(e) => handleInlineEdit(section.id, 'severity', e.target.value)}
                                                                    className="px-3 py-1 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                                                                >
                                                                    <option value="CRITICAL">Critical</option>
                                                                    <option value="HIGH">High</option>
                                                                    <option value="MEDIUM">Medium</option>
                                                                    <option value="LOW">Low</option>
                                                                </select>
                                                            </div>

                                                            {/* Description */}
                                                            <div>
                                                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                                                                    Description
                                                                </label>
                                                                {editingFinding === section.id && editingField === 'description' ? (
                                                                    <textarea
                                                                        ref={editInputRef}
                                                                        value={section.reportFinding?.description || ''}
                                                                        onChange={(e) => handleInlineEdit(section.id, 'description', e.target.value)}
                                                                        onBlur={finishEdit}
                                                                        rows={4}
                                                                        className="w-full p-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                                                                    />
                                                                ) : (
                                                                    <p 
                                                                        onClick={() => startEdit(section.id, 'description')}
                                                                        className="text-sm text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900 p-2 rounded-lg whitespace-pre-wrap"
                                                                    >
                                                                        {section.reportFinding?.description || ''}
                                                                    </p>
                                                                )}
                                                            </div>

                                                            {/* Recommendation */}
                                                            <div>
                                                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                                                                    Recommendation
                                                                </label>
                                                                {editingFinding === section.id && editingField === 'recommendation' ? (
                                                                    <textarea
                                                                        ref={editInputRef}
                                                                        value={section.reportFinding?.recommendation || ''}
                                                                        onChange={(e) => handleInlineEdit(section.id, 'recommendation', e.target.value)}
                                                                        onBlur={finishEdit}
                                                                        rows={3}
                                                                        className="w-full p-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                                                                    />
                                                                ) : (
                                                                    <p 
                                                                        onClick={() => startEdit(section.id, 'recommendation')}
                                                                        className="text-sm text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900 p-2 rounded-lg whitespace-pre-wrap"
                                                                    >
                                                                        {section.reportFinding?.recommendation || ''}
                                                                    </p>
                                                                )}
                                                            </div>

                                                            {/* Impact */}
                                                            {section.reportFinding?.impact && (
                                                                <div>
                                                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                                                                        Impact
                                                                    </label>
                                                                    {editingFinding === section.id && editingField === 'impact' ? (
                                                                        <textarea
                                                                            ref={editInputRef}
                                                                            value={section.reportFinding?.impact || ''}
                                                                            onChange={(e) => handleInlineEdit(section.id, 'impact', e.target.value)}
                                                                            onBlur={finishEdit}
                                                                            rows={2}
                                                                            className="w-full p-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                                                                        />
                                                                    ) : (
                                                                        <p 
                                                                            onClick={() => startEdit(section.id, 'impact')}
                                                                            className="text-sm text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900 p-2 rounded-lg whitespace-pre-wrap"
                                                                        >
                                                                            {section.reportFinding?.impact || ''}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            )}

                                                            {/* Affected Systems */}
                                                            <div>
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                                        Affected Systems
                                                                    </label>
                                                                    <button
                                                                        onClick={() => {
                                                                            setSelectedFindingForSystems(section);
                                                                            setShowAffectedSystemsModal(true);
                                                                        }}
                                                                        className="flex items-center gap-1 px-3 py-1 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
                                                                    >
                                                                        <Target className="w-3 h-3" />
                                                                        Manage
                                                                    </button>
                                                                </div>
                                                                <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                                                                    {(section.reportFinding?.affectedSystems || []).length > 0 ? (
                                                                        <div className="space-y-1">
                                                                            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                                                {section.reportFinding.affectedSystems.length} system{section.reportFinding.affectedSystems.length !== 1 ? 's' : ''} affected
                                                                            </div>
                                                                            <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                                                                                {section.reportFinding.affectedSystems.slice(0, 10).map((system, idx) => (
                                                                                    <span key={idx} className="inline-block px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 rounded text-xs font-mono">
                                                                                        {system}
                                                                                    </span>
                                                                                ))}
                                                                                {section.reportFinding.affectedSystems.length > 10 && (
                                                                                    <span className="inline-block px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded text-xs">
                                                                                        +{section.reportFinding.affectedSystems.length - 10} more
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <p className="text-sm text-gray-400 italic">No affected systems specified</p>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Supporting Evidence (Images) */}
                                                            {section.reportFinding?.id && (
                                                                <div>
                                                                    <div className="flex items-center justify-between mb-2">
                                                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                                            Supporting Evidence
                                                                        </label>
                                                                        <button
                                                                            onClick={() => {
                                                                                setSelectedFindingForImages(section);
                                                                                setShowImageModal(true);
                                                                            }}
                                                                            className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                                                                        >
                                                                            <Image className="w-3 h-3" />
                                                                            Manage Images
                                                                        </button>
                                                                    </div>
                                                                    <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                                                                        {(findingImages[section.reportFinding.id] || []).length > 0 ? (
                                                                            <div className="overflow-hidden border border-gray-200 dark:border-gray-600 rounded-lg">
                                                                                <table className="w-full">
                                                                                    <thead className="bg-gray-100 dark:bg-gray-800">
                                                                                        <tr>
                                                                                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                                                                                Preview
                                                                                            </th>
                                                                                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                                                                                Title
                                                                                            </th>
                                                                                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                                                                                Caption
                                                                                            </th>
                                                                                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                                                                                Actions
                                                                                            </th>
                                                                                        </tr>
                                                                                    </thead>
                                                                                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-600">
                                                                                        {findingImages[section.reportFinding.id].map((image) => (
                                                                                            <tr 
                                                                                                key={image.id}
                                                                                                className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                                                                                                onClick={() => {
                                                                                                    setSelectedFindingForImages(section);
                                                                                                    setShowImageModal(true);
                                                                                                }}
                                                                                            >
                                                                                                <td className="px-3 py-2">
                                                                                                    <img
                                                                                                        src={`data:${image.mimeType};base64,${image.imageData}`}
                                                                                                        alt={image.title}
                                                                                                        className="w-12 h-12 object-cover rounded border border-gray-200 dark:border-gray-600"
                                                                                                    />
                                                                                                </td>
                                                                                                <td className="px-3 py-2 text-sm font-medium text-gray-900 dark:text-white">
                                                                                                    {image.title}
                                                                                                </td>
                                                                                                <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 max-w-xs">
                                                                                                    <div className="truncate">
                                                                                                        {image.caption || 'No caption'}
                                                                                                    </div>
                                                                                                </td>
                                                                                                <td className="px-3 py-2 text-center">
                                                                                                    <button
                                                                                                        onClick={(e) => {
                                                                                                            e.stopPropagation();
                                                                                                            deleteImage(image.id, section.reportFinding.id);
                                                                                                        }}
                                                                                                        className="text-red-600 hover:text-red-700 text-xs"
                                                                                                        title="Delete image"
                                                                                                    >
                                                                                                        <Trash2 className="w-4 h-4" />
                                                                                                    </button>
                                                                                                </td>
                                                                                            </tr>
                                                                                        ))}
                                                                                    </tbody>
                                                                                </table>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="text-center py-8">
                                                                                <Image className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                                                                                <p className="text-sm text-gray-400 italic">No images added yet</p>
                                                                                <p className="text-xs text-gray-500 mt-1">Click "Manage Images" to upload supporting evidence</p>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                                </>
                                                            )}
                                                        </div>

                                                        {/* Actions */}
                                                        <div className="flex flex-col gap-2">
                                                            <button
                                                                onClick={() => duplicateFinding(section)}
                                                                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                                                                title="Duplicate"
                                                            >
                                                                <Copy className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => deleteFinding(section.id)}
                                                                className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                                                                title="Delete"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {sections.filter(s => s.type === "finding" || s.type === "FINDING" || s.type === "connectivity" || s.type === "CONNECTIVITY").length === 0 && (
                                        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600">
                                            <Target className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                                            <p className="text-gray-500 dark:text-gray-400 mb-2">No findings yet</p>
                                            <p className="text-sm text-gray-400 dark:text-gray-500">
                                                Add findings from the library to build your report
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Narrative Sections */}
                            {(activeSection === "executive" || activeSection === "methodology" || 
                              activeSection === "tools" || activeSection === "conclusion") && report && (
                                <div>
                                    <div className="flex justify-between items-center mb-6">
                                        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                                            {activeSection === "executive" && "Executive Summary"}
                                            {activeSection === "methodology" && "Methodology"}
                                            {activeSection === "tools" && "Tools & Techniques"}
                                            {activeSection === "conclusion" && "Conclusion"}
                                        </h2>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => openAiPrompt(activeSection)}
                                                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400 rounded-lg transition-colors"
                                            >
                                                <Sparkles className="w-4 h-4" />
                                                AI Generate
                                            </button>
                                            <button
                                                onClick={() => {
                                                    const fieldMap = {
                                                        executive: 'executiveSummary',
                                                        methodology: 'methodology',
                                                        tools: 'toolsAndTechniques',
                                                        conclusion: 'conclusion'
                                                    };
                                                    resetNarrativeField(fieldMap[activeSection]);
                                                }}
                                                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
                                            >
                                                <RefreshCw className="w-4 h-4" />
                                                Reset to Original
                                            </button>
                                        </div>
                                    </div>

                                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
                                        <textarea
                                            value={
                                                activeSection === "executive" ? report.executiveSummary || "" :
                                                activeSection === "methodology" ? report.methodology || "" :
                                                activeSection === "tools" ? report.toolsAndTechniques || "" :
                                                report.conclusion || ""
                                            }
                                            onChange={(e) => {
                                                const fieldMap = {
                                                    executive: 'executiveSummary',
                                                    methodology: 'methodology',
                                                    tools: 'toolsAndTechniques',
                                                    conclusion: 'conclusion'
                                                };
                                                setReport(prev => ({
                                                    ...prev,
                                                    [fieldMap[activeSection]]: e.target.value
                                                }));
                                                triggerAutoSave();
                                            }}
                                            rows={20}
                                            className="w-full p-4 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                            placeholder={`Enter ${activeSection} content...`}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Finding Library Modal */}
            {showFindingLibrary && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
                        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75" onClick={() => setShowFindingLibrary(false)} />
                        
                        <div className="inline-block w-full max-w-4xl px-6 py-4 my-8 overflow-hidden text-left align-middle transition-all transform bg-white dark:bg-gray-800 shadow-xl rounded-lg">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                    Finding Library
                                </h3>
                                <button
                                    onClick={() => setShowFindingLibrary(false)}
                                    className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Search and Filters */}
                            <div className="flex gap-4 mb-6">
                                <div className="flex-1 relative">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                    <input
                                        type="text"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="Search findings..."
                                        className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                    />
                                </div>
                                <select
                                    value={selectedSeverityFilter}
                                    onChange={(e) => setSelectedSeverityFilter(e.target.value)}
                                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                >
                                    <option value="">All Severities</option>
                                    <option value="CRITICAL">Critical</option>
                                    <option value="HIGH">High</option>
                                    <option value="MEDIUM">Medium</option>
                                    <option value="LOW">Low</option>
                                </select>
                            </div>

                            {/* Findings Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                                {filteredFindings.map(finding => (
                                    <div 
                                        key={finding.id}
                                        className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                                        onClick={() => addFindingFromTemplate(finding)}
                                    >
                                        <div className="flex items-start justify-between mb-2">
                                            <h4 className="font-medium text-gray-900 dark:text-gray-100">
                                                {finding.title}
                                            </h4>
                                            <div className="flex items-center gap-1">
                                                {getSeverityIcon(finding.severity)}
                                                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                                    {finding.severity}
                                                </span>
                                            </div>
                                        </div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                                            {finding.description}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Connectivity Modal */}
            <ConnectivityModal
                isOpen={showConnectivityModal}
                onClose={() => setShowConnectivityModal(false)}
                onAdd={addConnectivitySection}
            />

            {/* Affected Systems Modal */}
            <AffectedSystemsModal
                isOpen={showAffectedSystemsModal}
                onClose={() => {
                    setShowAffectedSystemsModal(false);
                    setSelectedFindingForSystems(null);
                }}
                finding={selectedFindingForSystems?.reportFinding}
                availableScopes={scopes}
                onSave={handleAffectedSystemsSave}
            />

            {/* Image Management Modal */}
            <ImageManagementModal
                isOpen={showImageModal}
                onClose={() => {
                    setShowImageModal(false);
                    setSelectedFindingForImages(null);
                }}
                images={selectedFindingForImages?.reportFinding?.id ? (findingImages[selectedFindingForImages.reportFinding.id] || []) : []}
                onUpload={uploadImage}
                onUpdate={updateImageMetadata}
                onDelete={deleteImage}
                uploading={selectedFindingForImages?.reportFinding?.id ? uploadingImage === selectedFindingForImages.reportFinding.id : false}
                reportFindingId={selectedFindingForImages?.reportFinding?.id}
            />

            {/* Preview Modal */}
            {showPreview && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
                        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75" onClick={() => setShowPreview(false)} />
                        
                        <div className="inline-block w-full max-w-7xl px-4 py-4 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg">
                            <div className="flex justify-between items-center mb-4 px-4">
                                <h3 className="text-lg font-semibold text-gray-900">
                                    Report Preview
                                </h3>
                                <button
                                    onClick={() => setShowPreview(false)}
                                    className="p-2 text-gray-400 hover:text-gray-600"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                                <iframe
                                    srcDoc={generateReportHTML()}
                                    className="w-full h-[80vh]"
                                    title="Report Preview"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* AI Prompt Modal */}
            {showAiPrompt && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
                        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75" onClick={() => !generatingAi && setShowAiPrompt(false)} />
                        
                        <div className="inline-block w-full max-w-2xl px-6 py-4 my-8 overflow-hidden text-left align-middle transition-all transform bg-white dark:bg-gray-800 shadow-xl rounded-lg">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                    <Sparkles className="w-5 h-5 inline mr-2 text-indigo-600" />
                                    AI Generate {aiPromptSection === "executive" && "Executive Summary"}
                                    {aiPromptSection === "methodology" && "Methodology"}
                                    {aiPromptSection === "tools" && "Tools & Techniques"}
                                    {aiPromptSection === "conclusion" && "Conclusion"}
                                </h3>
                                {!generatingAi && (
                                    <button
                                        onClick={() => setShowAiPrompt(false)}
                                        className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                )}
                            </div>

                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    What would you like the AI to focus on or include?
                                </label>
                                <textarea
                                    value={aiPrompt}
                                    onChange={(e) => setAiPrompt(e.target.value)}
                                    placeholder={`Example: "Focus on the business impact and critical vulnerabilities found during the assessment..."`}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                                    rows="6"
                                    disabled={generatingAi}
                                />
                            </div>

                            {/* Prompt Suggestions */}
                            <div className="mb-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <Lightbulb className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Suggested prompts (click to add):
                                    </label>
                                </div>
                                <div className="space-y-2 max-h-40 overflow-y-auto">
                                    {promptSuggestions[aiPromptSection]?.map((suggestion, index) => (
                                        <button
                                            key={index}
                                            onClick={() => {
                                                setAiPrompt(prev => {
                                                    const trimmedPrev = prev.trim();
                                                    if (trimmedPrev) {
                                                        return trimmedPrev + ". " + suggestion;
                                                    }
                                                    return suggestion;
                                                });
                                            }}
                                            disabled={generatingAi}
                                            className="w-full text-left p-2 text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50 flex items-start gap-2 group"
                                        >
                                            <Plus className="w-3 h-3 mt-0.5 flex-shrink-0 text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
                                            <span className="text-xs leading-relaxed">{suggestion}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => setShowAiPrompt(false)}
                                    disabled={generatingAi}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={generateAiContent}
                                    disabled={generatingAi || !aiPrompt.trim()}
                                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                                >
                                    {generatingAi ? (
                                        <>
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                            Generating...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="w-4 h-4" />
                                            Generate Content
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}

export default ReportWriter;