import fs from "fs";
import path from "path";
import Handlebars from "handlebars";
import { ChartJSNodeCanvas } from "chartjs-node-canvas";
import { renderHtml } from "../renderers/html.js";

const templatePath = path.resolve("templates/report.html");
const outputDir = path.resolve("generated");
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

// Handlebars helpers
Handlebars.registerHelper("ifCondition", function (v1, operator, v2, options) {
    switch (operator) {
        case "===": return v1 === v2 ? options.fn(this) : (options.inverse ? options.inverse(this) : '');
        case "!==": return v1 !== v2 ? options.fn(this) : (options.inverse ? options.inverse(this) : '');
        case ">": return v1 > v2 ? options.fn(this) : (options.inverse ? options.inverse(this) : '');
        case "<": return v1 < v2 ? options.fn(this) : (options.inverse ? options.inverse(this) : '');
        default: return options.inverse ? options.inverse(this) : '';
    }
});

// Keep the old name for backward compatibility, but this might be causing conflicts
Handlebars.registerHelper("ifCond", function (v1, operator, v2, options) {
    switch (operator) {
        case "===": return v1 === v2 ? options.fn(this) : (options.inverse ? options.inverse(this) : '');
        case "!==": return v1 !== v2 ? options.fn(this) : (options.inverse ? options.inverse(this) : '');
        case ">": return v1 > v2 ? options.fn(this) : (options.inverse ? options.inverse(this) : '');
        case "<": return v1 < v2 ? options.fn(this) : (options.inverse ? options.inverse(this) : '');
        default: return options.inverse ? options.inverse(this) : '';
    }
});

Handlebars.registerHelper("eq", function (a, b, options) {
    if (arguments.length === 3) {
        // Block helper usage: {{#eq a b}}...{{/eq}}
        return a === b ? options.fn(this) : (options.inverse ? options.inverse(this) : '');
    } else {
        // Inline helper usage: {{eq a b}}
        return a === b;
    }
});

Handlebars.registerHelper("toLowerCase", function (str) {
    return str ? str.toLowerCase() : '';
});

Handlebars.registerHelper("formatDate", function (date) {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
});

Handlebars.registerHelper("add", function(a, b) {
    return a + b;
});

Handlebars.registerHelper("formatEnum", function(str) {
    if (!str) return '';
    // Convert SNAKE_CASE to Title Case
    return str.split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
});

// Helper for checking if array contains value
Handlebars.registerHelper("contains", function(array, value) {
    if (!array || !Array.isArray(array)) return false;
    return array.includes(value);
});

// Helper for joining array values
Handlebars.registerHelper("join", function(array, separator) {
    if (!array || !Array.isArray(array)) return '';
    return array.join(separator || ', ');
});

// Helper for converting time to percentage of day
Handlebars.registerHelper("timeToPercent", function(timeString) {
    if (!timeString) return 0;
    const [hours, minutes] = timeString.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes;
    return (totalMinutes / (24 * 60)) * 100;
});

// Helper for calculating time duration as percentage
Handlebars.registerHelper("timeDuration", function(startTime, endTime) {
    if (!startTime || !endTime) return 0;
    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const [endHours, endMinutes] = endTime.split(':').map(Number);
    
    const startTotalMinutes = startHours * 60 + startMinutes;
    const endTotalMinutes = endHours * 60 + endMinutes;
    
    let duration = endTotalMinutes - startTotalMinutes;
    if (duration < 0) duration += 24 * 60; // Handle overnight periods
    
    return (duration / (24 * 60)) * 100;
});

// Helper for filtering arrays by property values
Handlebars.registerHelper("filterBy", function() {
    // Get all arguments
    const args = Array.prototype.slice.call(arguments);
    // Options is always the last argument
    const options = args[args.length - 1];
    
    // Extract parameters based on number of arguments
    const array = args[0];
    const property = args[1];
    const value = args[2];
    let property2, value2;
    
    // Check if we have a second property/value pair
    if (args.length > 5) {
        property2 = args[3];
        value2 = args[4];
    }
    
    if (!array) {
        // Return empty array to options.fn so it can handle the empty case
        return options.fn ? options.fn([]) : '';
    }
    
    if (!Array.isArray(array)) {
        console.warn('filterBy helper: expected array but got', typeof array);
        return options.inverse ? options.inverse(this) : '';
    }
    
    let filtered = array.filter(item => {
        if (property2 && value2 !== undefined) {
            // Two property filter
            return item[property] === value && item[property2] === value2;
        } else if (value === 'false') {
            // Handle boolean false
            return item[property] === false;
        } else if (value === 'true') {
            // Handle boolean true
            return item[property] === true;
        } else if (value && typeof value === 'string' && value.includes(',')) {
            // Handle multiple values (comma-separated)
            const values = value.split(',');
            return values.includes(item[property]);
        } else {
            // Single value filter
            return item[property] === value;
        }
    });
    
    if (filtered.length > 0) {
        return options.fn(filtered);
    } else {
        return options.inverse ? options.inverse(this) : '';
    }
});

// Helper for counting items in array
Handlebars.registerHelper("sum", function(array, property) {
    if (!array || !Array.isArray(array)) return 0;
    if (property) {
        return array.filter(item => item && item[property] === true).length;
    }
    return array.length;
});

// Helper for subtracting numbers
Handlebars.registerHelper("subtract", function(a, b) {
    return (a || 0) - (b || 0);
});

// Helper for counting items with specific property value
Handlebars.registerHelper("countWhere", function(array, property, value) {
    if (!array || !Array.isArray(array)) return 0;
    return array.filter(item => item[property] === value).length;
});

// SERVER-SIDE SECTION CONTENT GENERATOR
function generateSectionContent(type, section, engagement) {
    switch (type) {
        case 'AUTHORIZATION':
            return generateAuthorizationContent(section, engagement);
        case 'SCOPE':
            return generateScopeContent(section, engagement);
        case 'TESTING_WINDOW':
            return generateTestingWindowContent(section, engagement);
        case 'METHODOLOGY':
            return generateMethodologyContent(section, engagement);
        case 'RESTRICTIONS':
            return generateRestrictionsContent(section, engagement);
        case 'COMMUNICATION':
            return generateCommunicationContent(section, engagement);
        case 'EMERGENCY':
            return generateEmergencyContent(section, engagement);
        case 'LEGAL':
            return generateLegalContent(section, engagement);
        default:
            return `<p>Section content for ${type} would go here.</p>`;
    }
}

function generateAuthorizationContent(section, engagement) {
    const authorizingOfficial = section.data?.authorizingOfficial || '[AUTHORIZING OFFICIAL NAME]';
    const authorizingTitle = section.data?.authorizingTitle || '[OFFICIAL TITLE]';
    const authorizedDate = engagement.authorizedDate || engagement.createdAt;
    const customerName = engagement.customerName || engagement.customer || 'Not Specified';
    
    return `
        <div class="bg-white border border-gray-200 rounded-lg overflow-hidden keep-together">
            <div class="bg-amber-50 border-b border-amber-200 px-6 py-4">
                <h3 class="text-lg font-semibold text-amber-800 mb-2">ENGAGEMENT AUTHORIZATION</h3>
                <p class="text-gray-700 text-sm leading-relaxed">
                    This penetration testing engagement has been formally authorized by <strong>${customerName}</strong> 
                    through the execution of this Rules of Engagement document and associated service agreements.
                </p>
            </div>
            <div class="p-6">

                <div class="subsection">
                    <h4 class="text-md font-semibold text-gray-800 mb-3 border-b border-gray-300 pb-1">AUTHORIZING PARTY</h4>
                    <div class="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span class="font-medium text-gray-700">Name:</span>
                            <span class="ml-2 text-gray-800">${authorizingOfficial}</span>
                        </div>
                        <div>
                            <span class="font-medium text-gray-700">Title:</span>
                            <span class="ml-2 text-gray-800">${authorizingTitle}</span>
                        </div>
                        <div>
                            <span class="font-medium text-gray-700">Organization:</span>
                            <span class="ml-2 text-gray-800">${customerName}</span>
                        </div>
                        <div>
                            <span class="font-medium text-gray-700">Date of Authorization:</span>
                            <span class="ml-2 text-gray-800">${new Date(authorizedDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                        </div>
                    </div>
                </div>

                <div class="subsection content-box">
                    <h4 class="text-md font-semibold text-gray-800 mb-3 border-b border-gray-300 pb-1">AUTHORIZATION SCOPE</h4>
                    <p class="text-gray-800 mb-3">This authorization specifically covers:</p>
                    <ul class="list-disc list-inside text-gray-700 space-y-1 ml-4">
                        <li>Security assessment of designated systems and applications</li>
                        <li>${getEngagementTypeDescription(engagement.type)}</li>
                        <li>Controlled exploitation of identified vulnerabilities</li>
                        <li>Documentation and reporting of security findings</li>
                    </ul>
                </div>

                ${section.content ? `
                <div class="mt-6 pt-4 border-t border-gray-300">
                    <h4 class="text-md font-semibold text-gray-800 mb-3">ADDITIONAL AUTHORIZATION DETAILS</h4>
                    <div class="prose max-w-none">
                        <p class="text-gray-800 leading-relaxed">${section.content}</p>
                    </div>
                </div>
                ` : ''}
            </div>
        </div>
    `;
}

function generateScopeContent(section, engagement) {
    const scopes = engagement.scopes || [];
    const totalAssets = scopes.length;
    const inScopeAssets = scopes.filter(s => s.inScope).length;
    const criticalAssets = scopes.filter(s => s.criticality === 'CRITICAL').length;
    
    return `
        <div class="bg-white border border-gray-200 rounded-lg overflow-hidden compact-section">
            <div class="bg-blue-50 border-b border-blue-200 px-4 py-3">
                <h3 class="text-lg font-semibold text-blue-800 mb-1">ENGAGEMENT SCOPE DEFINITION</h3>
                <p class="text-gray-700 text-xs leading-tight">
                    ${getEngagementTypeName(engagement.type)} scope includes authorized systems for testing. 
                    Complete asset details in <strong>Appendix A</strong>.
                </p>
            </div>
            <div class="p-4">

                ${totalAssets > 0 ? `
                <div class="mb-4">
                    <h4 class="text-sm font-semibold text-gray-800 mb-2 border-b border-gray-300 pb-1">ASSET SUMMARY</h4>
                    <div class="grid grid-cols-4 gap-3 mb-3">
                        <div class="bg-green-50 border border-green-200 rounded p-2 text-center">
                            <div class="text-lg font-bold text-green-800">${totalAssets}</div>
                            <div class="text-xs text-green-600">Total</div>
                        </div>
                        <div class="bg-blue-50 border border-blue-200 rounded p-2 text-center">
                            <div class="text-lg font-bold text-blue-800">${inScopeAssets}</div>
                            <div class="text-xs text-blue-600">In Scope</div>
                        </div>
                        <div class="bg-red-50 border border-red-200 rounded p-2 text-center">
                            <div class="text-lg font-bold text-red-800">${totalAssets - inScopeAssets}</div>
                            <div class="text-xs text-red-600">Out of Scope</div>
                        </div>
                        <div class="bg-orange-50 border border-orange-200 rounded p-2 text-center">
                            <div class="text-lg font-bold text-orange-800">${criticalAssets}</div>
                            <div class="text-xs text-orange-600">Critical</div>
                        </div>
                    </div>
                </div>
                ` : `
                <div class="mb-4">
                    <h4 class="text-sm font-semibold text-gray-800 mb-2 border-b border-gray-300 pb-1">ASSET SUMMARY</h4>
                    <div class="border-l-4 border-yellow-400 bg-yellow-50 p-2">
                        <p class="text-gray-800 text-xs">
                            <strong>Note:</strong> Configure engagement scope to populate asset list.
                        </p>
                    </div>
                </div>
                `}

                <div class="mb-4">
                    <h4 class="text-sm font-semibold text-gray-800 mb-2 border-b border-gray-300 pb-1">SCOPE BOUNDARIES</h4>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="border border-gray-200 rounded p-3">
                            <h5 class="font-semibold text-green-700 mb-1 text-sm">IN SCOPE</h5>
                            <ul class="text-xs text-gray-700 space-y-0.5">
                                <li>• Assets marked "In Scope" (Appendix A)</li>
                                <li>• Client-owned systems</li>
                                <li>• Explicitly listed applications</li>
                                <li>• Defined network segments</li>
                            </ul>
                        </div>
                        <div class="border border-gray-200 rounded p-3">
                            <h5 class="font-semibold text-red-700 mb-1 text-sm">OUT OF SCOPE</h5>
                            <ul class="text-xs text-gray-700 space-y-0.5">
                                <li>• Assets marked "Out of Scope"</li>
                                <li>• Third-party systems</li>
                                <li>• Restricted production systems</li>
                                <li>• Unlisted systems</li>
                            </ul>
                        </div>
                    </div>
                </div>

                ${section.content ? `
                <div class="pt-3 border-t border-gray-300">
                    <h4 class="text-sm font-semibold text-gray-800 mb-2">ADDITIONAL DETAILS</h4>
                    <div class="text-xs text-gray-800 leading-relaxed">${section.content}</div>
                </div>
                ` : ''}

                <div class="mt-3 pt-2 border-t border-gray-200">
                    <p class="text-xs text-gray-600 italic">
                        <strong>Reference:</strong> Complete asset inventory with IP addresses, domains, and criticality ratings available in Appendix A.
                    </p>
                </div>
            </div>
        </div>
    `;
}

function generateTestingWindowContent(section, engagement) {
    const startDate = engagement.startDate ? new Date(engagement.startDate) : null;
    const endDate = engagement.endDate ? new Date(engagement.endDate) : null;
    const customerName = engagement.customerName || engagement.customer || 'the client';
    
    return `
        <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div class="bg-green-50 border-b border-green-200 px-6 py-4">
                <h3 class="text-lg font-semibold text-green-800 mb-2">TESTING SCHEDULE & WINDOWS</h3>
                <p class="text-gray-700 text-sm leading-relaxed">
                    This section defines the authorized testing periods, scheduling constraints, and operational 
                    windows for the ${getEngagementTypeName(engagement.type)} engagement with ${customerName}.
                    All testing activities must be conducted within these specified timeframes.
                </p>
            </div>
            <div class="p-6">

                <div class="mb-6">
                    <h4 class="text-md font-semibold text-gray-800 mb-3 border-b border-gray-300 pb-1">ENGAGEMENT TIMELINE</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="border border-gray-200 rounded-lg p-4">
                            <h5 class="font-semibold text-gray-800 mb-2">Start Date</h5>
                            <p class="text-lg text-gray-900">${startDate ? startDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'To Be Determined'}</p>
                            ${startDate ? `<p class="text-sm text-gray-600 mt-1">${startDate.toLocaleDateString('en-US', { weekday: 'long' })}</p>` : ''}
                        </div>
                        <div class="border border-gray-200 rounded-lg p-4">
                            <h5 class="font-semibold text-gray-800 mb-2">End Date</h5>
                            <p class="text-lg text-gray-900">${endDate ? endDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'To Be Determined'}</p>
                            ${endDate ? `<p class="text-sm text-gray-600 mt-1">${endDate.toLocaleDateString('en-US', { weekday: 'long' })}</p>` : ''}
                        </div>
                    </div>
                    ${startDate && endDate ? `
                    <div class="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <p class="text-gray-800">
                            <strong>Total Duration:</strong> ${Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))} days
                            ${engagement.budgetHours ? ` | <strong>Allocated Hours:</strong> ${engagement.budgetHours} hours` : ''}
                        </p>
                    </div>
                    ` : ''}
                </div>

                <div class="mb-6">
                    <h4 class="text-md font-semibold text-gray-800 mb-3 border-b border-gray-300 pb-1">PERMITTED TESTING HOURS</h4>
                    <div class="bg-white border border-gray-300 rounded-lg p-4">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h5 class="font-semibold text-gray-800 mb-3">Business Hours Testing</h5>
                                <div class="space-y-2 text-sm">
                                    <div class="flex justify-between">
                                        <span class="text-gray-600">Monday - Friday:</span>
                                        <span class="font-medium">9:00 AM - 5:00 PM</span>
                                    </div>
                                    <div class="flex justify-between">
                                        <span class="text-gray-600">Saturday - Sunday:</span>
                                        <span class="font-medium text-red-600">Restricted</span>
                                    </div>
                                    <div class="flex justify-between">
                                        <span class="text-gray-600">Time Zone:</span>
                                        <span class="font-medium">${engagement.timezone || 'Client Local Time'}</span>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <h5 class="font-semibold text-gray-800 mb-3">Extended Hours (if approved)</h5>
                                <div class="space-y-2 text-sm">
                                    <div class="flex justify-between">
                                        <span class="text-gray-600">Early Hours:</span>
                                        <span class="font-medium">7:00 AM - 9:00 AM</span>
                                    </div>
                                    <div class="flex justify-between">
                                        <span class="text-gray-600">Evening Hours:</span>
                                        <span class="font-medium">5:00 PM - 8:00 PM</span>
                                    </div>
                                    <div class="flex justify-between">
                                        <span class="text-gray-600">Authorization:</span>
                                        <span class="font-medium text-orange-600">Pre-approval Required</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="subsection content-box">
                    <h4 class="text-md font-semibold text-gray-800 mb-3 border-b border-gray-300 pb-1">TESTING PHASES</h4>
                    <div class="space-y-3">
                        <div class="border border-gray-200 rounded-lg p-4 content-box">
                            <h5 class="font-semibold text-gray-800 mb-2">Phase 1: Reconnaissance & Discovery</h5>
                            <ul class="text-sm text-gray-700 space-y-1">
                                <li>• Passive information gathering</li>
                                <li>• Network discovery and enumeration</li>
                                <li>• Service identification</li>
                                <li>• No intrusive testing during this phase</li>
                            </ul>
                        </div>
                        <div class="border border-gray-200 rounded-lg p-4 content-box">
                            <h5 class="font-semibold text-gray-800 mb-2">Phase 2: Vulnerability Assessment</h5>
                            <ul class="text-sm text-gray-700 space-y-1">
                                <li>• Automated vulnerability scanning</li>
                                <li>• Manual security testing</li>
                                <li>• Configuration review</li>
                                <li>• Coordination with IT team required</li>
                            </ul>
                        </div>
                        <div class="border border-gray-200 rounded-lg p-4 content-box">
                            <h5 class="font-semibold text-gray-800 mb-2">Phase 3: Exploitation & Validation</h5>
                            <ul class="text-sm text-gray-700 space-y-1">
                                <li>• Controlled exploitation attempts</li>
                                <li>• Proof-of-concept development</li>
                                <li>• Impact assessment</li>
                                <li>• Real-time coordination required</li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div class="subsection content-box">
                    <h4 class="text-md font-semibold text-gray-800 mb-3 border-b border-gray-300 pb-1">COMMUNICATION PROTOCOL</h4>
                    <div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <ul class="text-sm text-gray-700 space-y-2">
                            <li><strong>Daily Check-ins:</strong> Brief status updates at start and end of each testing day</li>
                            <li><strong>Critical Findings:</strong> Immediate notification for high/critical vulnerabilities</li>
                            <li><strong>System Impact:</strong> Real-time coordination for any tests that may affect operations</li>
                            <li><strong>Emergency Protocol:</strong> Immediate halt of testing if requested by client</li>
                        </ul>
                    </div>
                </div>

                ${section.content ? `
                <div class="mt-6 pt-4 border-t border-gray-300">
                    <h4 class="text-md font-semibold text-gray-800 mb-3">ADDITIONAL TESTING WINDOW DETAILS</h4>
                    <div class="prose max-w-none">
                        <p class="text-gray-800 leading-relaxed">${section.content}</p>
                    </div>
                </div>
                ` : ''}
            </div>
        </div>
    `;
}

function generateMethodologyContent(section, engagement) {
    const methodology = engagement.methodology || 'COMPREHENSIVE';
    const engagementType = engagement.type || 'SECURITY_ASSESSMENT';
    const customerName = engagement.customerName || engagement.customer || 'the client';
    
    return `
        <div class="bg-white border border-gray-300 rounded-lg shadow-sm compact-section">
            <div class="bg-blue-50 border-b border-blue-200 px-4 py-3">
                <h3 class="text-lg font-semibold text-blue-900">Network Testing Methodology</h3>
                <p class="text-blue-700 text-sm mt-1">
                    ${getEngagementTypeName(engagementType)} following ${getEngagementTypeName(methodology)} methodology with industry-standard frameworks.
                </p>
            </div>
            <div class="p-4">

                <div class="mb-4">
                    <h4 class="text-sm font-semibold text-gray-800 mb-2 border-b border-blue-200 pb-1">METHODOLOGY OVERVIEW</h4>
                    <div class="bg-gray-50 border border-gray-200 rounded p-3">
                        <p class="text-sm text-gray-700 leading-relaxed">
                            ${getMethodologyDescription(methodology, engagementType)}
                        </p>
                    </div>
                </div>

                <div class="mb-4">
                    <h4 class="text-sm font-semibold text-gray-800 mb-2 border-b border-blue-200 pb-1">TESTING FRAMEWORK</h4>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="bg-white border border-blue-100 rounded p-3">
                            <h5 class="font-medium text-blue-800 mb-2 text-sm">Primary Standards</h5>
                            <ul class="text-xs text-gray-600 space-y-1">
                                <li>• OWASP Testing Guide</li>
                                <li>• NIST SP 800-115</li>
                                <li>• PTES (Penetration Testing Execution Standard)</li>
                                <li>• OSSTMM (Open Source Security Testing)</li>
                            </ul>
                        </div>
                        <div class="bg-white border border-blue-100 rounded p-3">
                            <h5 class="font-medium text-blue-800 mb-2 text-sm">Assessment Categories</h5>
                            <ul class="text-xs text-gray-600 space-y-1">
                                ${getTestingCategories(engagementType).map(category => `<li>• ${category}</li>`).join('')}
                            </ul>
                        </div>
                    </div>
                </div>

                <div class="mb-4">
                    <h4 class="text-sm font-semibold text-gray-800 mb-2 border-b border-blue-200 pb-1">TESTING PHASES</h4>
                    <div class="space-y-3">
                        ${getMethodologyPhases(methodology, engagementType).map((phase, index) => `
                        <div class="bg-white border border-gray-200 rounded p-3">
                            <div class="flex items-start space-x-3">
                                <div class="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center text-xs font-medium border border-blue-200">
                                    ${index + 1}
                                </div>
                                <div class="flex-1 min-w-0">
                                    <h5 class="font-medium text-gray-900 mb-1 text-sm">${phase.name}</h5>
                                    <p class="text-xs text-gray-600">${phase.description}</p>
                                </div>
                            </div>
                        </div>
                        `).join('')}
                    </div>
                </div>

                <div class="mb-4">
                    <h4 class="text-sm font-semibold text-gray-800 mb-2 border-b border-blue-200 pb-1">TOOLS & TECHNIQUES</h4>
                    <div class="grid grid-cols-3 gap-3">
                        <div class="bg-white border border-blue-100 rounded p-3">
                            <h5 class="font-medium text-blue-800 mb-2 text-xs">Automated Tools</h5>
                            <ul class="text-xs text-gray-600 space-y-0.5">
                                <li>• Vulnerability scanners</li>
                                <li>• Web app scanners</li>
                                <li>• Network discovery</li>
                                <li>• Config analyzers</li>
                            </ul>
                        </div>
                        <div class="bg-white border border-blue-100 rounded p-3">
                            <h5 class="font-medium text-blue-800 mb-2 text-xs">Manual Testing</h5>
                            <ul class="text-xs text-gray-600 space-y-0.5">
                                <li>• Business logic testing</li>
                                <li>• Authentication bypass</li>
                                <li>• Privilege escalation</li>
                                <li>• Custom exploits</li>
                            </ul>
                        </div>
                        <div class="bg-white border border-blue-100 rounded p-3">
                            <h5 class="font-medium text-blue-800 mb-2 text-xs">Validation</h5>
                            <ul class="text-xs text-gray-600 space-y-0.5">
                                <li>• Proof-of-concept</li>
                                <li>• Impact assessment</li>
                                <li>• False positive removal</li>
                                <li>• Risk validation</li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div class="mb-4">
                    <h4 class="text-sm font-semibold text-gray-800 mb-2 border-b border-amber-200 pb-1">RISK MANAGEMENT</h4>
                    <div class="bg-amber-50 border border-amber-200 rounded p-3">
                        <div class="grid grid-cols-1 gap-2 text-xs text-gray-700">
                            <div><span class="font-medium text-amber-800">Controlled Environment:</span> All testing with rollback procedures</div>
                            <div><span class="font-medium text-amber-800">Impact Minimization:</span> Production testing during maintenance windows</div>
                            <div><span class="font-medium text-amber-800">Data Protection:</span> No sensitive data access or modification</div>
                            <div><span class="font-medium text-amber-800">Service Availability:</span> No disruption of critical services</div>
                            <div><span class="font-medium text-amber-800">Escalation:</span> Immediate response to unexpected behavior</div>
                        </div>
                    </div>
                </div>

                ${section.content ? `
                <div class="pt-3 border-t border-blue-200">
                    <h4 class="text-sm font-semibold text-gray-800 mb-2">Additional Details</h4>
                    <div class="text-xs text-gray-700 leading-relaxed">${section.content}</div>
                </div>
                ` : ''}
            </div>
        </div>
    `;
}

function generateRestrictionsContent(section, engagement) {
    const customerName = engagement.customerName || engagement.customer || 'the client';
    const engagementType = engagement.type || 'SECURITY_ASSESSMENT';
    
    return `
        <div class="bg-white border border-gray-300 rounded-lg shadow-sm compact-section">
            <div class="bg-red-50 border-b border-red-200 px-4 py-3">
                <h3 class="text-lg font-semibold text-red-800">Network Testing Restrictions</h3>
                <p class="text-red-700 text-sm mt-1">
                    Critical restrictions for ${getEngagementTypeName(engagementType)} engagement. Violations may result in immediate termination.
                </p>
            </div>
            <div class="p-4">

                <div class="mb-4">
                    <h4 class="text-sm font-semibold text-gray-800 mb-2 border-b border-red-200 pb-1">PROHIBITED ACTIVITIES</h4>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="bg-white border border-red-100 rounded p-3">
                            <h5 class="font-medium text-red-800 mb-2 text-sm">Strictly Forbidden</h5>
                            <ul class="text-xs text-gray-600 space-y-0.5">
                                <li>• Denial of Service (DoS) attacks</li>
                                <li>• Data destruction or modification</li>
                                <li>• System or service disruption</li>
                                <li>• Malware/backdoor installation</li>
                                <li>• Unauthorized privilege escalation</li>
                                <li>• Out-of-scope system access</li>
                            </ul>
                        </div>
                        <div class="bg-white border border-amber-100 rounded p-3">
                            <h5 class="font-medium text-amber-800 mb-2 text-sm">Restricted Techniques</h5>
                            <ul class="text-xs text-gray-600 space-y-0.5">
                                <li>• Unlimited brute force attacks</li>
                                <li>• Resource exhaustion testing</li>
                                <li>• Social engineering attacks</li>
                                <li>• Physical security testing</li>
                                <li>• Wireless jamming</li>
                                <li>• Third-party targeting</li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div class="mb-4">
                    <h4 class="text-sm font-semibold text-gray-800 mb-2 border-b border-red-200 pb-1">DATA PROTECTION</h4>
                    <div class="bg-amber-50 border border-amber-200 rounded p-3">
                        <div class="grid grid-cols-2 gap-3 text-xs">
                            <div>
                                <h5 class="font-medium text-amber-800 mb-1">Prohibited Access</h5>
                                <ul class="text-gray-700 space-y-0.5">
                                    <li>• Personal identifiable information (PII)</li>
                                    <li>• Financial or payment data</li>
                                    <li>• Healthcare records</li>
                                    <li>• Proprietary business information</li>
                                </ul>
                            </div>
                            <div>
                                <h5 class="font-medium text-amber-800 mb-1">Data Handling Rules</h5>
                                <ul class="text-gray-700 space-y-0.5">
                                    <li>• No data exfiltration or copying</li>
                                    <li>• Screenshots only when necessary</li>
                                    <li>• Immediate deletion of sensitive data</li>
                                    <li>• Secure artifact handling</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="mb-4">
                    <h4 class="text-sm font-semibold text-gray-800 mb-2 border-b border-red-200 pb-1">OPERATIONAL LIMITS</h4>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="bg-gray-50 border border-gray-200 rounded p-3">
                            <h5 class="font-medium text-gray-800 mb-1 text-xs">Business Hours</h5>
                            <ul class="text-xs text-gray-600 space-y-0.5">
                                <li>• Critical testing in maintenance windows only</li>
                                <li>• Production DB requires approval</li>
                                <li>• Low-impact testing during business hours</li>
                                <li>• High-risk testing after hours</li>
                            </ul>
                        </div>
                        <div class="bg-gray-50 border border-gray-200 rounded p-3">
                            <h5 class="font-medium text-gray-800 mb-1 text-xs">Communication</h5>
                            <ul class="text-xs text-gray-600 space-y-0.5">
                                <li>• 24-hour notice for high-impact tests</li>
                                <li>• Real-time coordination for production</li>
                                <li>• Immediate incident notification</li>
                                <li>• Daily status updates</li>
                            </ul>
                        </div>
                    </div>
                </div>


                ${section.content ? `
                <div class="pt-3 border-t border-red-200">
                    <h4 class="text-sm font-semibold text-gray-800 mb-2">Additional Restrictions</h4>
                    <div class="text-xs text-gray-700 leading-relaxed">${section.content}</div>
                </div>
                ` : ''}

                <div class="mt-3 bg-gray-50 border border-gray-200 rounded p-3">
                    <p class="text-xs text-gray-600 italic leading-relaxed">
                        All parties acknowledge understanding and agreement to these restrictions. 
                        Clarifications should be addressed before testing commences.
                    </p>
                </div>
            </div>
        </div>
    `;
}

function generateCommunicationContent(section, engagement) {
    const customerName = engagement.customerName || engagement.customer || 'the client';
    const engagementType = engagement.type || 'SECURITY_ASSESSMENT';
    
    return `
        <div class="bg-white border border-gray-300 rounded-lg shadow-sm compact-section">
            <div class="bg-indigo-50 border-b border-indigo-200 px-4 py-3">
                <h3 class="text-lg font-semibold text-indigo-800">Communication Protocols</h3>
                <p class="text-indigo-700 text-sm mt-1">
                    Established communication channels and escalation procedures for ${getEngagementTypeName(engagementType)} engagement.
                </p>
            </div>
            <div class="p-4">

                <div class="mb-4">
                    <h4 class="text-sm font-semibold text-gray-800 mb-2 border-b border-indigo-200 pb-1">PRIMARY CONTACTS</h4>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="bg-white border border-indigo-100 rounded p-3">
                            <h5 class="font-medium text-indigo-800 mb-2 text-sm">Client Contact</h5>
                            <div class="text-xs text-gray-700 space-y-1">
                                <div><span class="font-medium">Name:</span> ${engagement.contactName || 'TBD'}</div>
                                <div><span class="font-medium">Title:</span> ${engagement.contactTitle || 'Technical Contact'}</div>
                                <div><span class="font-medium">Email:</span> ${engagement.contactEmail || 'contact@client.com'}</div>
                                ${engagement.contactPhone ? `<div><span class="font-medium">Phone:</span> ${engagement.contactPhone}</div>` : ''}
                                <div><span class="font-medium">Availability:</span> Business hours (9 AM - 5 PM)</div>
                            </div>
                        </div>
                        <div class="bg-white border border-indigo-100 rounded p-3">
                            <h5 class="font-medium text-indigo-800 mb-2 text-sm">Testing Team Lead</h5>
                            <div class="text-xs text-gray-700 space-y-1">
                                <div><span class="font-medium">Organization:</span> ${engagement.organization || 'Security Testing Team'}</div>
                                <div><span class="font-medium">Email:</span> lead@testingorg.com</div>
                                <div><span class="font-medium">Phone:</span> Available during testing</div>
                                <div><span class="font-medium">Emergency:</span> 24/7 during active testing</div>
                                <div><span class="font-medium">Response Time:</span> < 2 hours during business hours</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="mb-4">
                    <h4 class="text-sm font-semibold text-gray-800 mb-2 border-b border-indigo-200 pb-1">COMMUNICATION CHANNELS</h4>
                    <div class="grid grid-cols-3 gap-3">
                        <div class="bg-green-50 border border-green-200 rounded p-3">
                            <h5 class="font-medium text-green-800 mb-1 text-xs">Standard Updates</h5>
                            <ul class="text-xs text-gray-600 space-y-0.5">
                                <li>• Email notifications</li>
                                <li>• Daily status reports</li>
                                <li>• Weekly progress summaries</li>
                                <li>• Testing milestone updates</li>
                            </ul>
                        </div>
                        <div class="bg-amber-50 border border-amber-200 rounded p-3">
                            <h5 class="font-medium text-amber-800 mb-1 text-xs">High-Priority Issues</h5>
                            <ul class="text-xs text-gray-600 space-y-0.5">
                                <li>• Direct phone calls</li>
                                <li>• Immediate email alerts</li>
                                <li>• SMS notifications</li>
                                <li>• Secure messaging platform</li>
                            </ul>
                        </div>
                        <div class="bg-red-50 border border-red-200 rounded p-3">
                            <h5 class="font-medium text-red-800 mb-1 text-xs">Emergency Contact</h5>
                            <ul class="text-xs text-gray-600 space-y-0.5">
                                <li>• 24/7 emergency hotline</li>
                                <li>• Incident response team</li>
                                <li>• Management escalation</li>
                                <li>• Out-of-band communication</li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div class="mb-4">
                    <h4 class="text-sm font-semibold text-gray-800 mb-2 border-b border-indigo-200 pb-1">REPORTING SCHEDULE</h4>
                    <div class="bg-gray-50 border border-gray-200 rounded p-3">
                        <div class="grid grid-cols-2 gap-3 text-xs">
                            <div>
                                <h5 class="font-medium text-gray-800 mb-1">Regular Reports</h5>
                                <ul class="text-gray-700 space-y-0.5">
                                    <li>• <span class="font-medium">Daily:</span> End-of-day status email</li>
                                    <li>• <span class="font-medium">Weekly:</span> Comprehensive progress report</li>
                                    <li>• <span class="font-medium">Milestone:</span> Phase completion summaries</li>
                                    <li>• <span class="font-medium">Final:</span> Complete engagement report</li>
                                </ul>
                            </div>
                            <div>
                                <h5 class="font-medium text-gray-800 mb-1">Incident Reports</h5>
                                <ul class="text-gray-700 space-y-0.5">
                                    <li>• <span class="font-medium">Immediate:</span> Critical findings (< 1 hour)</li>
                                    <li>• <span class="font-medium">Same Day:</span> High-risk discoveries</li>
                                    <li>• <span class="font-medium">24 Hours:</span> Medium-risk issues</li>
                                    <li>• <span class="font-medium">Weekly:</span> Low-risk findings</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="mb-4">
                    <h4 class="text-sm font-semibold text-gray-800 mb-2 border-b border-indigo-200 pb-1">ESCALATION PROCEDURES</h4>
                    <div class="space-y-3">
                        <div class="bg-white border border-gray-200 rounded p-3">
                            <div class="flex items-start space-x-3">
                                <div class="flex-shrink-0 w-6 h-6 bg-green-100 text-green-800 rounded-full flex items-center justify-center text-xs font-medium border border-green-200">
                                    1
                                </div>
                                <div class="flex-1 min-w-0">
                                    <h5 class="font-medium text-gray-900 mb-1 text-sm">Level 1 - Technical Contact</h5>
                                    <p class="text-xs text-gray-600 mb-1">Initial contact for routine issues and standard communications</p>
                                    <div class="text-xs text-gray-500">Response Time: 2-4 hours during business hours</div>
                                </div>
                            </div>
                        </div>
                        <div class="bg-white border border-gray-200 rounded p-3">
                            <div class="flex items-start space-x-3">
                                <div class="flex-shrink-0 w-6 h-6 bg-amber-100 text-amber-800 rounded-full flex items-center justify-center text-xs font-medium border border-amber-200">
                                    2
                                </div>
                                <div class="flex-1 min-w-0">
                                    <h5 class="font-medium text-gray-900 mb-1 text-sm">Level 2 - Management</h5>
                                    <p class="text-xs text-gray-600 mb-1">Escalation for high-impact issues or unresponsive Level 1</p>
                                    <div class="text-xs text-gray-500">Response Time: 1-2 hours during business hours</div>
                                </div>
                            </div>
                        </div>
                        <div class="bg-white border border-gray-200 rounded p-3">
                            <div class="flex items-start space-x-3">
                                <div class="flex-shrink-0 w-6 h-6 bg-red-100 text-red-800 rounded-full flex items-center justify-center text-xs font-medium border border-red-200">
                                    3
                                </div>
                                <div class="flex-1 min-w-0">
                                    <h5 class="font-medium text-gray-900 mb-1 text-sm">Level 3 - Executive</h5>
                                    <p class="text-xs text-gray-600 mb-1">Emergency escalation for critical incidents or engagement threats</p>
                                    <div class="text-xs text-gray-500">Response Time: < 1 hour, 24/7 availability</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="mb-4">
                    <h4 class="text-sm font-semibold text-gray-800 mb-2 border-b border-indigo-200 pb-1">COMMUNICATION PROTOCOLS</h4>
                    <div class="bg-blue-50 border border-blue-200 rounded p-3">
                        <div class="text-xs text-gray-700 space-y-1">
                            <div><span class="font-medium text-blue-800">Confidentiality:</span> All communications marked as confidential and encrypted when required</div>
                            <div><span class="font-medium text-blue-800">Documentation:</span> All significant communications logged and archived</div>
                            <div><span class="font-medium text-blue-800">Authorization:</span> Only authorized personnel receive sensitive information</div>
                            <div><span class="font-medium text-blue-800">Time Zones:</span> All times referenced in ${customerName} local time zone</div>
                            <div><span class="font-medium text-blue-800">Language:</span> All communications in English unless otherwise specified</div>
                        </div>
                    </div>
                </div>

                ${section.content ? `
                <div class="pt-3 border-t border-indigo-200">
                    <h4 class="text-sm font-semibold text-gray-800 mb-2">Additional Communication Details</h4>
                    <div class="text-xs text-gray-700 leading-relaxed">${section.content}</div>
                </div>
                ` : ''}

                <div class="mt-3 bg-gray-50 border border-gray-200 rounded p-3">
                    <p class="text-xs text-gray-600 italic leading-relaxed">
                        Effective communication is critical to engagement success. All parties should adhere to these protocols 
                        to ensure timely information sharing and rapid issue resolution.
                    </p>
                </div>
            </div>
        </div>
    `;
}

function generateEmergencyContent(section, engagement) {
    const customerName = engagement.customerName || engagement.customer || 'the client';
    const engagementType = engagement.type || 'SECURITY_ASSESSMENT';
    
    return `
        <div class="bg-white border border-gray-300 rounded-lg shadow-sm compact-section">
            <div class="bg-red-50 border-b border-red-200 px-4 py-3">
                <h3 class="text-lg font-semibold text-red-800">Emergency Procedures</h3>
                <p class="text-red-700 text-sm mt-1">
                    Critical emergency procedures and 24/7 contact information for ${getEngagementTypeName(engagementType)} engagement incidents.
                </p>
            </div>
            <div class="p-4">

                <div class="mb-4">
                    <h4 class="text-sm font-semibold text-gray-800 mb-2 border-b border-red-200 pb-1">24/7 EMERGENCY CONTACTS</h4>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="bg-red-50 border border-red-200 rounded p-3">
                            <h5 class="font-medium text-red-800 mb-2 text-sm">Primary Technical Contact</h5>
                            <div class="text-xs text-gray-700 space-y-1">
                                <div><span class="font-medium">Name:</span> ${engagement.contactName || 'Emergency Technical Contact'}</div>
                                <div><span class="font-medium">Title:</span> ${engagement.contactTitle || 'Technical Point of Contact'}</div>
                                <div><span class="font-medium">Email:</span> ${engagement.contactEmail || 'emergency@client.com'}</div>
                                ${engagement.contactPhone ? `<div><span class="font-medium">Phone:</span> ${engagement.contactPhone}</div>` : '<div><span class="font-medium">Phone:</span> [Emergency Contact Number]</div>'}
                                <div><span class="font-medium">Availability:</span> 24/7 during testing period</div>
                                <div><span class="font-medium">Response Time:</span> < 15 minutes</div>
                            </div>
                        </div>
                        <div class="bg-red-50 border border-red-200 rounded p-3">
                            <h5 class="font-medium text-red-800 mb-2 text-sm">Testing Team Emergency Lead</h5>
                            <div class="text-xs text-gray-700 space-y-1">
                                <div><span class="font-medium">Organization:</span> ${engagement.organization || 'Security Testing Organization'}</div>
                                <div><span class="font-medium">Emergency Line:</span> +1-XXX-XXX-XXXX</div>
                                <div><span class="font-medium">Backup Contact:</span> emergency@testingorg.com</div>
                                <div><span class="font-medium">Escalation:</span> Incident Commander</div>
                                <div><span class="font-medium">Availability:</span> 24/7 during active testing</div>
                                <div><span class="font-medium">Response Time:</span> Immediate (< 5 minutes)</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="mb-4">
                    <h4 class="text-sm font-semibold text-gray-800 mb-2 border-b border-red-200 pb-1">EMERGENCY SCENARIOS</h4>
                    <div class="grid grid-cols-3 gap-3">
                        <div class="bg-red-100 border border-red-300 rounded p-3">
                            <h5 class="font-medium text-red-800 mb-1 text-xs">Critical System Impact</h5>
                            <ul class="text-xs text-gray-600 space-y-0.5">
                                <li>• System outages or crashes</li>
                                <li>• Service degradation</li>
                                <li>• Data corruption risks</li>
                                <li>• Network connectivity loss</li>
                            </ul>
                        </div>
                        <div class="bg-amber-100 border border-amber-300 rounded p-3">
                            <h5 class="font-medium text-amber-800 mb-1 text-xs">Security Incidents</h5>
                            <ul class="text-xs text-gray-600 space-y-0.5">
                                <li>• Unauthorized access detected</li>
                                <li>• Sensitive data exposure</li>
                                <li>• Malicious activity observed</li>
                                <li>• Breach indicators found</li>
                            </ul>
                        </div>
                        <div class="bg-orange-100 border border-orange-300 rounded p-3">
                            <h5 class="font-medium text-orange-800 mb-1 text-xs">Testing Emergencies</h5>
                            <ul class="text-xs text-gray-600 space-y-0.5">
                                <li>• Unintended system modification</li>
                                <li>• Testing tool malfunction</li>
                                <li>• Scope boundary violations</li>
                                <li>• Legal/compliance issues</li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div class="mb-4">
                    <h4 class="text-sm font-semibold text-gray-800 mb-2 border-b border-red-200 pb-1">IMMEDIATE RESPONSE PROCEDURES</h4>
                    <div class="space-y-3">
                        <div class="bg-white border border-red-200 rounded p-3">
                            <div class="flex items-start space-x-3">
                                <div class="flex-shrink-0 w-6 h-6 bg-red-100 text-red-800 rounded-full flex items-center justify-center text-xs font-medium border border-red-200">
                                    1
                                </div>
                                <div class="flex-1 min-w-0">
                                    <h5 class="font-medium text-red-800 mb-1 text-sm">STOP ALL TESTING</h5>
                                    <p class="text-xs text-gray-600 mb-1">Immediately cease all testing activities and secure testing environment</p>
                                    <div class="text-xs text-gray-500">Timeline: Immediate (< 1 minute)</div>
                                </div>
                            </div>
                        </div>
                        <div class="bg-white border border-amber-200 rounded p-3">
                            <div class="flex items-start space-x-3">
                                <div class="flex-shrink-0 w-6 h-6 bg-amber-100 text-amber-800 rounded-full flex items-center justify-center text-xs font-medium border border-amber-200">
                                    2
                                </div>
                                <div class="flex-1 min-w-0">
                                    <h5 class="font-medium text-amber-800 mb-1 text-sm">NOTIFY CONTACTS</h5>
                                    <p class="text-xs text-gray-600 mb-1">Contact primary technical contact and testing team lead immediately</p>
                                    <div class="text-xs text-gray-500">Timeline: Within 5 minutes</div>
                                </div>
                            </div>
                        </div>
                        <div class="bg-white border border-orange-200 rounded p-3">
                            <div class="flex items-start space-x-3">
                                <div class="flex-shrink-0 w-6 h-6 bg-orange-100 text-orange-800 rounded-full flex items-center justify-center text-xs font-medium border border-orange-200">
                                    3
                                </div>
                                <div class="flex-1 min-w-0">
                                    <h5 class="font-medium text-orange-800 mb-1 text-sm">DOCUMENT INCIDENT</h5>
                                    <p class="text-xs text-gray-600 mb-1">Record incident details, timeline, and potential impact</p>
                                    <div class="text-xs text-gray-500">Timeline: Within 15 minutes</div>
                                </div>
                            </div>
                        </div>
                        <div class="bg-white border border-blue-200 rounded p-3">
                            <div class="flex items-start space-x-3">
                                <div class="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center text-xs font-medium border border-blue-200">
                                    4
                                </div>
                                <div class="flex-1 min-w-0">
                                    <h5 class="font-medium text-blue-800 mb-1 text-sm">COORDINATE RESPONSE</h5>
                                    <p class="text-xs text-gray-600 mb-1">Work with client to assess damage and plan remediation</p>
                                    <div class="text-xs text-gray-500">Timeline: Within 30 minutes</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="mb-4">
                    <h4 class="text-sm font-semibold text-gray-800 mb-2 border-b border-red-200 pb-1">ESCALATION MATRIX</h4>
                    <div class="bg-gray-50 border border-gray-200 rounded p-3">
                        <div class="grid grid-cols-3 gap-3 text-xs">
                            <div>
                                <h5 class="font-medium text-gray-800 mb-1">Low Impact (< 15 min)</h5>
                                <ul class="text-gray-700 space-y-0.5">
                                    <li>• Technical contact notification</li>
                                    <li>• Email incident report</li>
                                    <li>• Continue with approval</li>
                                </ul>
                            </div>
                            <div>
                                <h5 class="font-medium text-gray-800 mb-1">Medium Impact (< 5 min)</h5>
                                <ul class="text-gray-700 space-y-0.5">
                                    <li>• Phone call to technical contact</li>
                                    <li>• Management notification</li>
                                    <li>• Incident assessment call</li>
                                </ul>
                            </div>
                            <div>
                                <h5 class="font-medium text-gray-800 mb-1">High Impact (< 1 min)</h5>
                                <ul class="text-gray-700 space-y-0.5">
                                    <li>• Immediate emergency line</li>
                                    <li>• Executive escalation</li>
                                    <li>• Crisis management activation</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="mb-4">
                    <h4 class="text-sm font-semibold text-gray-800 mb-2 border-b border-red-200 pb-1">COMMUNICATION PROTOCOLS</h4>
                    <div class="bg-blue-50 border border-blue-200 rounded p-3">
                        <div class="text-xs text-gray-700 space-y-1">
                            <div><span class="font-medium text-blue-800">Primary Channel:</span> Direct phone calls for all emergency communications</div>
                            <div><span class="font-medium text-blue-800">Backup Channel:</span> SMS and secure messaging if primary unavailable</div>
                            <div><span class="font-medium text-blue-800">Documentation:</span> All incidents logged in shared incident tracking system</div>
                            <div><span class="font-medium text-blue-800">Reporting:</span> Post-incident reports within 24 hours of resolution</div>
                            <div><span class="font-medium text-blue-800">Updates:</span> Status updates every 30 minutes during active incidents</div>
                        </div>
                    </div>
                </div>

                ${section.content ? `
                <div class="pt-3 border-t border-red-200">
                    <h4 class="text-sm font-semibold text-gray-800 mb-2">Additional Emergency Procedures</h4>
                    <div class="text-xs text-gray-700 leading-relaxed">${section.content}</div>
                </div>
                ` : ''}

                <div class="mt-3 bg-red-50 border border-red-200 rounded p-3">
                    <p class="text-xs text-gray-600 italic leading-relaxed">
                        <strong class="text-red-800">CRITICAL REMINDER:</strong> When in doubt, STOP testing and contact emergency personnel immediately. 
                        It is better to halt testing unnecessarily than to cause system damage or security incidents.
                    </p>
                </div>
            </div>
        </div>
    `;
}

function generateLegalContent(section, engagement) {
    const customerName = engagement.customerName || engagement.customer || 'the client';
    const engagementType = engagement.type || 'SECURITY_ASSESSMENT';
    
    return `
        <div class="bg-white border border-gray-300 rounded-lg shadow-sm compact-section">
            <div class="bg-gray-50 border-b border-gray-200 px-4 py-3">
                <h3 class="text-lg font-semibold text-gray-800">Legal & Compliance Considerations</h3>
                <p class="text-gray-700 text-sm mt-1">
                    Legal framework, regulatory compliance requirements, and violation consequences for ${getEngagementTypeName(engagementType)} engagement.
                </p>
            </div>
            <div class="p-4">

                <div class="mb-4">
                    <h4 class="text-sm font-semibold text-gray-800 mb-2 border-b border-gray-200 pb-1">REGULATORY COMPLIANCE</h4>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="bg-blue-50 border border-blue-200 rounded p-3">
                            <h5 class="font-medium text-blue-800 mb-2 text-sm">Data Protection & Privacy</h5>
                            <ul class="text-xs text-gray-700 space-y-0.5">
                                <li>• GDPR (General Data Protection Regulation)</li>
                                <li>• CCPA (California Consumer Privacy Act)</li>
                                <li>• HIPAA (Health Insurance Portability)</li>
                                <li>• PII protection requirements</li>
                                <li>• Data sovereignty regulations</li>
                                <li>• Cross-border data transfer restrictions</li>
                            </ul>
                        </div>
                        <div class="bg-blue-50 border border-blue-200 rounded p-3">
                            <h5 class="font-medium text-blue-800 mb-2 text-sm">Industry Standards</h5>
                            <ul class="text-xs text-gray-700 space-y-0.5">
                                <li>• PCI-DSS (Payment Card Industry)</li>
                                <li>• SOX (Sarbanes-Oxley Act)</li>
                                <li>• FISMA (Federal Information Security)</li>
                                <li>• ISO 27001/27002 compliance</li>
                                <li>• NIST Cybersecurity Framework</li>
                                <li>• Industry-specific regulations</li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div class="mb-4">
                    <h4 class="text-sm font-semibold text-gray-800 mb-2 border-b border-gray-200 pb-1">LEGAL AUTHORIZATION FRAMEWORK</h4>
                    <div class="bg-green-50 border border-green-200 rounded p-3">
                        <div class="grid grid-cols-2 gap-3 text-xs">
                            <div>
                                <h5 class="font-medium text-green-800 mb-1">Authorized Scope</h5>
                                <ul class="text-gray-700 space-y-0.5">
                                    <li>• Testing limited to ${customerName} owned systems</li>
                                    <li>• Only assets explicitly listed in scope</li>
                                    <li>• Geographic restrictions apply</li>
                                    <li>• Time-bound authorization window</li>
                                    <li>• Specific testing methodology approval</li>
                                </ul>
                            </div>
                            <div>
                                <h5 class="font-medium text-green-800 mb-1">Legal Protections</h5>
                                <ul class="text-gray-700 space-y-0.5">
                                    <li>• Contractual authorization from client</li>
                                    <li>• Rules of Engagement compliance</li>
                                    <li>• Professional liability coverage</li>
                                    <li>• Documented consent and approval</li>
                                    <li>• Limited scope engagement</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="mb-4">
                    <h4 class="text-sm font-semibold text-gray-800 mb-2 border-b border-gray-200 pb-1">LEGAL RESTRICTIONS</h4>
                    <div class="bg-red-50 border border-red-200 rounded p-3">
                        <div class="grid grid-cols-3 gap-3">
                            <div>
                                <h5 class="font-medium text-red-800 mb-1 text-xs">Prohibited Activities</h5>
                                <ul class="text-xs text-gray-600 space-y-0.5">
                                    <li>• Third-party system access</li>
                                    <li>• Unauthorized data access</li>
                                    <li>• Criminal activity simulation</li>
                                    <li>• Intellectual property theft</li>
                                    <li>• Privacy violations</li>
                                </ul>
                            </div>
                            <div>
                                <h5 class="font-medium text-red-800 mb-1 text-xs">Geographic Limits</h5>
                                <ul class="text-xs text-gray-600 space-y-0.5">
                                    <li>• Subject to local laws</li>
                                    <li>• Cross-border restrictions</li>
                                    <li>• Data residency requirements</li>
                                    <li>• Export control compliance</li>
                                    <li>• Jurisdiction-specific rules</li>
                                </ul>
                            </div>
                            <div>
                                <h5 class="font-medium text-red-800 mb-1 text-xs">Time Limitations</h5>
                                <ul class="text-xs text-gray-600 space-y-0.5">
                                    <li>• Authorization expiration</li>
                                    <li>• Business hours restrictions</li>
                                    <li>• Blackout period compliance</li>
                                    <li>• Notification requirements</li>
                                    <li>• Activity logging mandates</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="mb-4">
                    <h4 class="text-sm font-semibold text-gray-800 mb-2 border-b border-gray-200 pb-1">VIOLATION CONSEQUENCES</h4>
                    <div class="space-y-3">
                        <div class="bg-red-100 border border-red-300 rounded p-3">
                            <h5 class="font-medium text-red-800 mb-2 text-sm">Immediate Consequences</h5>
                            <div class="grid grid-cols-2 gap-3 text-xs">
                                <div>
                                    <span class="font-medium text-red-800">Testing Suspension:</span>
                                    <div class="text-gray-700 mt-1">Immediate halt of all testing activities upon any scope or legal violation</div>
                                </div>
                                <div>
                                    <span class="font-medium text-red-800">Access Revocation:</span>
                                    <div class="text-gray-700 mt-1">Termination of system access credentials and testing authorizations</div>
                                </div>
                            </div>
                        </div>
                        <div class="bg-amber-100 border border-amber-300 rounded p-3">
                            <h5 class="font-medium text-amber-800 mb-2 text-sm">Legal & Financial Consequences</h5>
                            <div class="grid grid-cols-2 gap-3 text-xs">
                                <div>
                                    <span class="font-medium text-amber-800">Civil Liability:</span>
                                    <div class="text-gray-700 mt-1">Exposure to civil lawsuits and damages for unauthorized activities</div>
                                </div>
                                <div>
                                    <span class="font-medium text-amber-800">Criminal Prosecution:</span>
                                    <div class="text-gray-700 mt-1">Potential criminal charges for violations of computer crime laws</div>
                                </div>
                            </div>
                        </div>
                        <div class="bg-orange-100 border border-orange-300 rounded p-3">
                            <h5 class="font-medium text-orange-800 mb-2 text-sm">Professional & Business Impact</h5>
                            <div class="grid grid-cols-2 gap-3 text-xs">
                                <div>
                                    <span class="font-medium text-orange-800">Remediation Costs:</span>
                                    <div class="text-gray-700 mt-1">Financial responsibility for system restoration and incident response</div>
                                </div>
                                <div>
                                    <span class="font-medium text-orange-800">Professional Standing:</span>
                                    <div class="text-gray-700 mt-1">Damage to professional reputation and potential industry sanctions</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="mb-4">
                    <h4 class="text-sm font-semibold text-gray-800 mb-2 border-b border-gray-200 pb-1">INCIDENT REPORTING REQUIREMENTS</h4>
                    <div class="bg-blue-50 border border-blue-200 rounded p-3">
                        <div class="text-xs text-gray-700 space-y-1">
                            <div><span class="font-medium text-blue-800">Immediate Notification:</span> Contact client technical contact within 15 minutes of any legal concern</div>
                            <div><span class="font-medium text-blue-800">Documentation:</span> Complete incident documentation including timeline, impact, and response actions</div>
                            <div><span class="font-medium text-blue-800">Legal Review:</span> Involve legal counsel for any potential compliance violations or unauthorized access</div>
                            <div><span class="font-medium text-blue-800">Regulatory Reporting:</span> Client responsible for regulatory notifications as required by applicable laws</div>
                            <div><span class="font-medium text-blue-800">Cooperation:</span> Full cooperation with investigations and regulatory inquiries</div>
                        </div>
                    </div>
                </div>

                ${section.content ? `
                <div class="pt-3 border-t border-gray-200">
                    <h4 class="text-sm font-semibold text-gray-800 mb-2">Additional Legal Considerations</h4>
                    <div class="text-xs text-gray-700 leading-relaxed">${section.content}</div>
                </div>
                ` : ''}

                <div class="mt-3 bg-gray-50 border border-gray-200 rounded p-3">
                    <p class="text-xs text-gray-600 italic leading-relaxed">
                        <strong class="text-gray-800">LEGAL DISCLAIMER:</strong> This document does not constitute legal advice. 
                        Organizations should consult with qualified legal counsel regarding specific compliance requirements 
                        and legal obligations in their jurisdiction. All parties acknowledge understanding of applicable 
                        laws and regulations governing cybersecurity testing activities.
                    </p>
                </div>
            </div>
        </div>
    `;
}

function getEngagementTypeDescription(type) {
    switch (type) {
        case 'NETWORK_PENTEST': return 'Network infrastructure penetration testing';
        case 'WEB_APP': return 'Web application security assessment';
        case 'CLOUD_SECURITY': return 'Cloud security evaluation';
        case 'SOCIAL_ENGINEERING': return 'Social engineering assessment';
        case 'WIRELESS': return 'Wireless network security testing';
        case 'PHYSICAL': return 'Physical security assessment';
        default: return 'Security testing activities';
    }
}

function getEngagementTypeName(type) {
    if (!type) return 'Security Assessment';
    return type.split('_').map(word => word.charAt(0) + word.slice(1).toLowerCase()).join(' ');
}

function generateScopeAppendix(engagement) {
    const scopes = engagement.scopes || [];
    
    if (scopes.length === 0) {
        return `
            <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                <p class="text-yellow-800">
                    <strong>Note:</strong> No assets have been configured for this engagement. 
                    Please add scope items in the Forge service to populate this appendix.
                </p>
            </div>
        `;
    }

    // Group scopes by type for better organization
    const scopesByType = {};
    scopes.forEach(scope => {
        const type = scope.assetType || 'OTHER';
        if (!scopesByType[type]) {
            scopesByType[type] = [];
        }
        scopesByType[type].push(scope);
    });

    // Calculate summary statistics first
    const inScopeCount = scopes.filter(s => s.inScope).length;
    const outOfScopeCount = scopes.length - inScopeCount;
    const criticalCount = scopes.filter(s => s.criticality === 'CRITICAL').length;
    const highCount = scopes.filter(s => s.criticality === 'HIGH').length;

    let appendixContent = `
        <!-- Summary Statistics at Top -->
        <div class="mb-4 bg-gray-50 border border-gray-200 rounded-lg p-3">
            <h3 class="text-sm font-semibold text-gray-800 mb-2 text-center">Asset Summary</h3>
            <div class="grid grid-cols-4 gap-2 text-center">
                <div>
                    <div class="text-lg font-bold text-gray-800">${scopes.length}</div>
                    <div class="text-xs text-gray-600">Total</div>
                </div>
                <div>
                    <div class="text-lg font-bold text-green-600">${inScopeCount}</div>
                    <div class="text-xs text-gray-600">In Scope</div>
                </div>
                <div>
                    <div class="text-lg font-bold text-red-600">${outOfScopeCount}</div>
                    <div class="text-xs text-gray-600">Out of Scope</div>
                </div>
                <div>
                    <div class="text-lg font-bold text-orange-600">${criticalCount + highCount}</div>
                    <div class="text-xs text-gray-600">Critical/High</div>
                </div>
            </div>
        </div>

        <div class="mb-4">
            <p class="text-sm text-gray-700 leading-relaxed">
                Complete inventory of all assets for the ${getEngagementTypeName(engagement.type)} engagement with ${engagement.customerName || 'the client'}.
                Assets are categorized by type, scope status, and criticality level.
            </p>
        </div>
    `;

    // Generate tables for each asset type
    Object.keys(scopesByType).forEach(type => {
        const assets = scopesByType[type];
        const typeTitle = getAssetTypeName(type);
        
        appendixContent += `
            <div class="mb-6">
                <h3 class="text-md font-semibold text-gray-800 mb-2 border-b border-gray-300 pb-1">
                    ${typeTitle} (${assets.length} asset${assets.length !== 1 ? 's' : ''})
                </h3>
                
                <div class="overflow-x-auto">
                    <table class="w-full border-collapse border border-gray-300">
                        <thead>
                            <tr class="bg-gray-100">
                                <th class="border border-gray-300 px-2 py-1 text-left font-semibold text-xs">Asset</th>
                                <th class="border border-gray-300 px-2 py-1 text-left font-semibold text-xs">Description</th>
                                <th class="border border-gray-300 px-2 py-1 text-center font-semibold text-xs">Status</th>
                                <th class="border border-gray-300 px-2 py-1 text-center font-semibold text-xs">Criticality</th>
                                <th class="border border-gray-300 px-2 py-1 text-left font-semibold text-xs">Notes</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        assets.forEach(asset => {
            const statusBadge = asset.inScope 
                ? '<span class="px-1 py-0.5 bg-green-100 text-green-800 text-xs font-semibold rounded">IN SCOPE</span>'
                : '<span class="px-1 py-0.5 bg-red-100 text-red-800 text-xs font-semibold rounded">OUT OF SCOPE</span>';
                
            const criticalityBadge = getCriticalityBadge(asset.criticality);
            
            // The scope data uses 'address' field for IP/domain values
            const assetIdentifier = asset.address || asset.target || asset.hostname || asset.domain || asset.ipAddress || asset.name || asset.value || 'N/A';
            
            appendixContent += `
                <tr class="hover:bg-gray-50">
                    <td class="border border-gray-300 px-2 py-1 font-mono text-xs">${assetIdentifier}</td>
                    <td class="border border-gray-300 px-2 py-1 text-xs">${asset.description || 'No description provided'}</td>
                    <td class="border border-gray-300 px-2 py-1 text-center">${statusBadge}</td>
                    <td class="border border-gray-300 px-2 py-1 text-center">${criticalityBadge}</td>
                    <td class="border border-gray-300 px-2 py-1 text-xs">${asset.notes || 'None'}</td>
                </tr>
            `;
        });

        appendixContent += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    });

    return appendixContent;
}

function getAssetTypeName(type) {
    switch (type) {
        case 'NETWORK': return 'Network Assets';
        case 'WEB_APPLICATION': return 'Web Applications';
        case 'API': return 'APIs';
        case 'DATABASE': return 'Databases';
        case 'MOBILE_APP': return 'Mobile Applications';
        case 'CLOUD_SERVICE': return 'Cloud Services';
        case 'IOT_DEVICE': return 'IoT Devices';
        case 'INFRASTRUCTURE': return 'Infrastructure';
        case 'OTHER': return 'Other Assets';
        default: return type || 'Other Assets';
    }
}

function getCriticalityBadge(criticality) {
    switch (criticality) {
        case 'CRITICAL':
            return '<span class="px-2 py-1 bg-red-100 text-red-800 text-xs font-semibold rounded">CRITICAL</span>';
        case 'HIGH':
            return '<span class="px-2 py-1 bg-orange-100 text-orange-800 text-xs font-semibold rounded">HIGH</span>';
        case 'MEDIUM':
            return '<span class="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-semibold rounded">MEDIUM</span>';
        case 'LOW':
            return '<span class="px-2 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded">LOW</span>';
        default:
            return '<span class="px-2 py-1 bg-gray-100 text-gray-800 text-xs font-semibold rounded">UNSPECIFIED</span>';
    }
}

function getMethodologyDescription(methodology, engagementType) {
    const descriptions = {
        'COMPREHENSIVE': 'A thorough, multi-phase approach combining automated scanning with extensive manual testing to identify both common and complex vulnerabilities.',
        'TARGETED': 'Focused testing on specific systems or vulnerabilities based on client priorities and known risk areas.',
        'COMPLIANCE': 'Structured testing aligned with regulatory requirements and compliance frameworks to ensure adherence to industry standards.',
        'RED_TEAM': 'Adversarial simulation testing that mimics real-world attack scenarios to test detection and response capabilities.',
        'ASSUMED_BREACH': 'Testing that assumes initial compromise and focuses on lateral movement, privilege escalation, and data access.',
        'BLACKBOX': 'External testing with no prior knowledge of internal systems, simulating an outside attacker perspective.',
        'WHITEBOX': 'Internal testing with full system knowledge and access, enabling comprehensive architecture review.',
        'GRAYBOX': 'Hybrid approach with limited internal knowledge, balancing realistic attack simulation with thorough coverage.'
    };
    
    return descriptions[methodology] || 'A structured security testing approach tailored to the specific requirements and risk profile of the engagement.';
}

function getTestingCategories(engagementType) {
    const categories = {
        'NETWORK_PENTEST': [
            'Network Infrastructure Assessment',
            'Firewall and IDS/IPS Testing',
            'Wireless Network Security',
            'VPN and Remote Access Testing',
            'Network Segmentation Analysis'
        ],
        'WEB_APP': [
            'OWASP Top 10 Vulnerabilities',
            'Authentication and Session Management',
            'Business Logic Testing',
            'API Security Assessment',
            'Client-Side Security Analysis'
        ],
        'CLOUD_SECURITY': [
            'Cloud Configuration Review',
            'Identity and Access Management',
            'Data Storage and Encryption',
            'Network Security Groups',
            'Container and Orchestration Security'
        ],
        'SOCIAL_ENGINEERING': [
            'Phishing Campaign Testing',
            'Physical Security Assessment',
            'Human Intelligence Gathering',
            'Awareness Training Validation',
            'Social Media Intelligence'
        ],
        'WIRELESS': [
            'Wi-Fi Network Assessment',
            'Bluetooth Security Testing',
            'Radio Frequency Analysis',
            'Rogue Access Point Detection',
            'Wireless Encryption Validation'
        ],
        'PHYSICAL': [
            'Physical Access Controls',
            'Badge and Biometric Systems',
            'CCTV and Surveillance',
            'Environmental Security',
            'Facility Perimeter Assessment'
        ]
    };
    
    return categories[engagementType] || [
        'General Security Assessment',
        'Vulnerability Identification',
        'Configuration Review',
        'Access Control Testing',
        'Data Protection Analysis'
    ];
}

function getMethodologyPhases(methodology, engagementType) {
    const basePhases = [
        {
            name: 'Planning & Reconnaissance',
            description: 'Information gathering and target identification through passive and active reconnaissance techniques.',
            activities: [
                'Scope verification and asset enumeration',
                'Open source intelligence (OSINT) gathering',
                'DNS enumeration and subdomain discovery',
                'Network topology mapping',
                'Technology stack identification'
            ]
        },
        {
            name: 'Scanning & Enumeration', 
            description: 'Detailed system analysis to identify services, versions, and potential attack vectors.',
            activities: [
                'Port scanning and service detection',
                'Vulnerability scanning and assessment', 
                'Web application crawling and mapping',
                'Directory and file enumeration',
                'Banner grabbing and version detection'
            ]
        },
        {
            name: 'Vulnerability Analysis',
            description: 'Deep analysis of identified vulnerabilities to understand exploitability and business impact.',
            activities: [
                'Manual vulnerability validation',
                'False positive elimination',
                'Attack vector analysis',
                'Business impact assessment',
                'Exploitation feasibility review'
            ]
        },
        {
            name: 'Exploitation & Testing',
            description: 'Controlled exploitation attempts to validate vulnerabilities and assess real-world impact.',
            activities: [
                'Proof-of-concept development',
                'Controlled exploitation attempts',
                'Privilege escalation testing',
                'Lateral movement simulation',
                'Data access validation'
            ]
        },
        {
            name: 'Post-Exploitation & Analysis',
            description: 'Assessment of post-compromise capabilities and long-term impact analysis.',
            activities: [
                'System access documentation',
                'Data classification and sensitivity review',
                'Persistence mechanism testing',
                'Network traversal assessment',
                'Evidence collection and documentation'
            ]
        },
        {
            name: 'Reporting & Remediation',
            description: 'Comprehensive documentation of findings with actionable remediation guidance.',
            activities: [
                'Technical findings documentation',
                'Business risk assessment',
                'Remediation priority ranking',
                'Executive summary preparation',
                'Remediation guidance development'
            ]
        }
    ];
    
    // Customize phases based on engagement type
    if (engagementType === 'WEB_APP') {
        basePhases[2].activities.push('OWASP testing methodology application');
        basePhases[3].activities.push('Session management testing');
    } else if (engagementType === 'NETWORK_PENTEST') {
        basePhases[1].activities.push('Network device enumeration');
        basePhases[3].activities.push('Network protocol exploitation');
    }
    
    return basePhases;
}

const generateChartImage = async (severityCounts) => {
    const width = 600;
    const height = 400;
    const chartNodeCanvas = new ChartJSNodeCanvas({ 
        width, 
        height,
        backgroundColour: 'white'
    });

    const configuration = {
        type: "bar",
        data: {
            labels: ["Critical", "High", "Medium", "Low"],
            datasets: [{
                label: "Number of Findings",
                data: [
                    severityCounts.Critical || 0,
                    severityCounts.High || 0,
                    severityCounts.Medium || 0,
                    severityCounts.Low || 0,
                ],
                backgroundColor: ["#dc2626", "#ea580c", "#f59e0b", "#3b82f6"],
                borderColor: ["#991b1b", "#c2410c", "#d97706", "#2563eb"],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Vulnerability Severity Distribution',
                    font: {
                        size: 16,
                        weight: 'bold'
                    }
                },
                legend: {
                    display: false
                }
            },
            scales: { 
                y: { 
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    },
                    grid: {
                        color: '#e5e7eb'
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    };

    return await chartNodeCanvas.renderToDataURL(configuration);
};

export async function generatePdf({ report, engagement, existingFilename = null }) {
    const html = fs.readFileSync(templatePath, "utf8");
    const template = Handlebars.compile(html);

    // Ensure engagement has customerName field
    if (!engagement.customerName && engagement.customer) {
        engagement.customerName = engagement.customer;
    }
    
    // Ensure engagement has type field
    if (!engagement.type) {
        engagement.type = engagement.engagementType || 'Penetration Test';
    }

    // Process sections - ensure all have uppercase type
    if (report.sections) {
        report.sections = report.sections.map(s => {
            // Check if finding is very long (might need page breaks)
            let isLongFinding = false;
            if (s.type === "FINDING" && s.reportFinding) {
                const finding = s.reportFinding;
                const totalLength = 
                    (finding.description?.length || 0) +
                    (finding.impact?.length || 0) +
                    (finding.recommendation?.length || 0) +
                    (finding.evidence?.length || 0);
                
                // If content is over 2000 chars or has many images, allow breaks
                isLongFinding = totalLength > 2000 || 
                    (finding.images && finding.images.length > 2);
            }
            
            return {
                ...s,
                type: s.type ? s.type.toUpperCase() : s.type,
                isLongFinding
            };
        });
    }
    
    // Process findings
    const findings = (report.sections || [])
        .filter(s => s.type === "FINDING" && s.reportFinding)
        .map(s => {
            // Ensure finding has all required fields
            const finding = s.reportFinding;
            return {
                ...finding,
                category: finding.category || 'General',
                status: finding.status || 'Open',
                references: finding.reference ? [finding.reference] : []
            };
        });
    
    // Check if report has connectivity sections
    const hasConnectivity = (report.sections || []).some(s => s.type === "CONNECTIVITY");

    // Count severities
    const severityCounts = {
        Critical: findings.filter(f => f.severity === "CRITICAL").length,
        High: findings.filter(f => f.severity === "HIGH").length,
        Medium: findings.filter(f => f.severity === "MEDIUM").length,
        Low: findings.filter(f => f.severity === "LOW").length,
    };
    
    // Count informational (connectivity sections)
    const informationalCount = (report.sections || []).filter(s => s.type === "CONNECTIVITY").length;

    // Add additional report data
    report.chartImage = await generateChartImage(severityCounts);
    report.findings = findings;
    report.criticalCount = severityCounts.Critical;
    report.highCount = severityCounts.High;
    report.mediumCount = severityCounts.Medium;
    report.lowCount = severityCounts.Low;
    report.informationalCount = informationalCount;
    report.hasConnectivity = hasConnectivity;
    report.version = report.version || '1.0';
    report.generatedDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    report.year = new Date().getFullYear();
    
    // Format dates
    if (engagement.startDate) {
        engagement.startDate = new Date(engagement.startDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
    if (engagement.endDate) {
        engagement.endDate = new Date(engagement.endDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
    if (report.createdAt) {
        report.createdAt = new Date(report.createdAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    const content = template({ report, engagement });

    return renderHtml({
        html: content,
        outputDir,
        filename: existingFilename,
        pdf: {
            format: "A4",
            printBackground: true,
            displayHeaderFooter: true,
            headerTemplate: `
                <div style="font-size:10px;text-align:center;width:100%;padding:0 1cm;color:#666;">
                    <span style="float:left;">${engagement.customerName || 'Confidential'}</span>
                    <span style="float:right;">${report.classification || 'CONFIDENTIAL'}</span>
                </div>`,
            footerTemplate: `
                <div style="font-size:10px;text-align:center;width:100%;color:#666;">
                    Page <span class="pageNumber"></span> of <span class="totalPages"></span>
                    <span style="margin-left:2em;">|</span>
                    <span style="margin-left:2em;">Generated by Cosmic Axiom</span>
                </div>`,
            margin: { 
                top: "1.5cm", 
                bottom: "1.5cm",
                left: "1.5cm",
                right: "1.5cm"
            },
        },
    });
}

export async function generateBriefingPdf({ report, engagement, existingFilename = null }) {
    const briefingTemplatePath = path.resolve("templates/briefing.html");
    const html = fs.readFileSync(briefingTemplatePath, "utf8");
    const template = Handlebars.compile(html);

    // Ensure engagement has customerName field
    if (!engagement.customerName && engagement.customer) {
        engagement.customerName = engagement.customer;
    }

    // Process findings
    const findings = (report.sections || [])
        .filter(s => s.type === "FINDING" && s.reportFinding)
        .map(s => s.reportFinding);

    // Filter findings by severity
    const criticalFindings = findings.filter(f => f.severity === "CRITICAL");
    const highFindings = findings.filter(f => f.severity === "HIGH");
    const mediumFindings = findings.filter(f => f.severity === "MEDIUM");
    const lowFindings = findings.filter(f => f.severity === "LOW");

    // Count severities
    const totalFindings = findings.length;
    const criticalCount = criticalFindings.length;
    const highCount = highFindings.length;
    const mediumCount = mediumFindings.length;
    const lowCount = lowFindings.length;

    // Calculate percentages
    const criticalPercent = totalFindings > 0 ? Math.round((criticalCount / totalFindings) * 100) : 0;
    const highPercent = totalFindings > 0 ? Math.round((highCount / totalFindings) * 100) : 0;
    const mediumPercent = totalFindings > 0 ? Math.round((mediumCount / totalFindings) * 100) : 0;
    const lowPercent = totalFindings > 0 ? Math.round((lowCount / totalFindings) * 100) : 0;

    // Get top categories
    const categoryCount = {};
    findings.forEach(f => {
        const cat = f.category || 'General';
        categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    });
    const topCategories = Object.entries(categoryCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([category, count]) => ({ category, count }));

    // Extract immediate and short-term actions
    const immediateActions = [
        ...criticalFindings.slice(0, 3).map(f => `Address ${f.title}`),
        ...highFindings.slice(0, 2).map(f => `Remediate ${f.title}`)
    ].filter(Boolean);
    
    const shortTermActions = [
        ...highFindings.slice(2, 4).map(f => `Plan remediation for ${f.title}`),
        ...mediumFindings.slice(0, 3).map(f => `Consider fixing ${f.title}`)
    ].filter(Boolean);

    // Format dates
    if (engagement.startDate) {
        engagement.startDate = new Date(engagement.startDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }
    if (engagement.endDate) {
        engagement.endDate = new Date(engagement.endDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }


    const templateData = {
        title: report.title,
        engagement,
        sections: report.sections.filter(s => s.type === "EXECUTIVE_SUMMARY"),
        totalFindings,
        criticalCount,
        highCount,
        mediumCount,
        lowCount,
        criticalPercent,
        highPercent,
        mediumPercent,
        lowPercent,
        criticalFindings,
        highFindings,
        topCategories,
        immediateActions,
        shortTermActions
    };

    const content = template(templateData);

    return renderHtml({
        html: content,
        outputDir,
        filename: existingFilename,
        prefix: "briefing-",
        pdf: {
            format: "A4",
            landscape: true,
            printBackground: true,
            margin: { 
                top: "0.5in", 
                bottom: "0.5in",
                left: "0.5in",
                right: "0.5in"
            },
        },
    });
}
export async function generateRoePdf({ roe, engagement, existingFilename = null }) {
    const roeTemplatePath = path.resolve("templates/roe.html");
    const html = fs.readFileSync(roeTemplatePath, "utf8");
    const template = Handlebars.compile(html);

    // Ensure engagement has customerName field
    if (!engagement.customerName && engagement.customer) {
        engagement.customerName = engagement.customer;
    }

    // SERVER-SIDE SECTION FILTERING - Process sections by type to avoid complex Handlebars conditionals
    let processedSections = [];
    
    if (roe.sections) {
        // Group sections by type for easier processing
        const sectionsByType = {};
        roe.sections.forEach(section => {
            const type = section.type ? section.type.toUpperCase() : 'GENERAL';
            if (!sectionsByType[type]) {
                sectionsByType[type] = [];
            }
            sectionsByType[type].push(section);
        });

        // Create processed sections with pre-rendered content
        Object.keys(sectionsByType).forEach(type => {
            sectionsByType[type].forEach(section => {
                let processedSection = {
                    ...section,
                    type: type,
                    renderedContent: generateSectionContent(type, section, engagement)
                };
                processedSections.push(processedSection);
            });
        });
    }
    
    roe.processedSections = processedSections;
    
    // Generate scope appendix content
    roe.scopeAppendix = generateScopeAppendix(engagement);

    // Add generated date and year
    roe.generatedDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    roe.year = new Date().getFullYear();
    
    // Format dates
    if (roe.createdAt) {
        roe.createdAt = new Date(roe.createdAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
    if (roe.approvedAt) {
        roe.approvedAt = new Date(roe.approvedAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
    if (roe.expiresAt) {
        roe.expiresAt = new Date(roe.expiresAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
    if (roe.authorizedDate) {
        roe.authorizedDate = new Date(roe.authorizedDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
    
    // Format engagement dates
    if (engagement.startDate) {
        engagement.startDate = new Date(engagement.startDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
    if (engagement.endDate) {
        engagement.endDate = new Date(engagement.endDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    const content = template({ roe, engagement });

    return renderHtml({
        html: content,
        outputDir,
        filename: existingFilename,
        prefix: "roe-",
        pdf: {
            format: "A4",
            printBackground: true,
            displayHeaderFooter: true,
            headerTemplate: `
                <div style="font-size:10px;text-align:center;width:100%;padding:0 1cm;color:#666;">
                    <span style="float:left;">${engagement.customerName || 'Confidential'}</span>
                    <span style="float:right;">Rules of Engagement - ${roe.classification || 'CONFIDENTIAL'}</span>
                </div>`,
            footerTemplate: `
                <div style="font-size:10px;text-align:center;width:100%;color:#666;">
                    Page <span class="pageNumber"></span> of <span class="totalPages"></span>
                    <span style="margin-left:2em;">|</span>
                    <span style="margin-left:2em;">Generated by Cosmic Axiom</span>
                </div>`,
            margin: { 
                top: "1.5cm", 
                bottom: "1.5cm",
                left: "1.5cm",
                right: "1.5cm"
            },
        },
    });
}