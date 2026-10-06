import {
    Book, ChevronLeft, ChevronRight,
    FileText, Handshake,
    LayoutDashboard,
    Moon,
    Settings,
    Shield,
    Sun,
    Users
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

// The current section is highlighted. NavLink matches nested paths, so an
// engagement's pages (/engagements/:id/...) highlight Engagements.
const navClass = ({ isActive }) =>
    `flex items-center gap-4 hover:text-indigo-500 ${isActive ? "text-indigo-600 dark:text-indigo-400 font-semibold" : ""}`;

const Sidebar = () => {
    const [collapsed, setCollapsed] = useState(false);
    const [isDarkMode, setIsDarkMode] = useState(() =>
        document.documentElement.classList.contains("dark")
    );

    const toggleSidebar = () => setCollapsed(!collapsed);

    const toggleTheme = () => {
        const html = document.documentElement;
        html.classList.toggle("dark");
        setIsDarkMode(!isDarkMode);
    };

    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add("dark");
        } else {
            document.documentElement.classList.remove("dark");
        }
    }, [isDarkMode]);

    return (
        <aside
            className={`${collapsed ? "w-20" : "w-64"
                } bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 h-screen p-4 flex flex-col transition-all duration-300 border-r border-gray-200 dark:border-gray-700`}
        >
            {/* Menu Items */}
            <nav className="flex flex-col gap-6 flex-grow">
                <div className="flex items-center gap-4 hover:text-indigo-500">
                    <button
                        onClick={toggleSidebar}
                        className="text-gray-600 dark:text-gray-300 hover:text-indigo-500"
                    >
                        {collapsed ? <ChevronRight size={24} /> : <ChevronLeft size={24} />}
                    </button>
                </div>

                <NavLink to="/dashboard" className={navClass}>
                    <LayoutDashboard size={20} />
                    {!collapsed && <span>Dashboard</span>}
                </NavLink>

                <NavLink to="/reports" className={navClass}>
                    <FileText size={20} />
                    {!collapsed && <span>Reports</span>}
                </NavLink>

                <NavLink to="/roe" className={navClass}>
                    <Shield size={20} />
                    {!collapsed && <span>Rules of Engagement</span>}
                </NavLink>

                <NavLink to="/findings" className={navClass}>
                    <Book size={20} />
                    {!collapsed && <span>Findings</span>}
                </NavLink>

                <NavLink to="/engagements" className={navClass}>
                    <Users size={20} />
                    {!collapsed && <span>Engagements</span>}
                </NavLink>

                <NavLink to="/customers" className={navClass}>
                    <Handshake size={20} />
                    {!collapsed && <span>Customers</span>}
                </NavLink>

                <NavLink to="/admin" className={navClass}>
                    <Settings size={20} />
                    {!collapsed && <span>System Admin</span>}
                </NavLink>
            </nav>

            {/* Light/Dark Mode Toggle */}
            <button
                onClick={toggleTheme}
                className="flex items-center gap-2 mt-auto text-sm hover:text-indigo-500 border-none"
            >
                {isDarkMode ? <Moon size={18} /> : <Sun size={18} />}
                {!collapsed && <span>{isDarkMode ? "Light Mode" : "Dark Mode"}</span>}
            </button>
        </aside>
    );
};

export default Sidebar;
