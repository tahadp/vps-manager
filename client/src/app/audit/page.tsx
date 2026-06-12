"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Search, ChevronLeft, ChevronRight } from "lucide-react";

export default function AuditLogs() {
  const router = useRouter();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    fetchLogs(token);
  }, [router]);

  const fetchLogs = async (token: string) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/audit`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setLogs(await res.json());
      }
    } catch (err) {}
    setLoading(false);
  };

  const filteredLogs = logs.filter(log => {
    const query = searchQuery.toLowerCase();
    const action = log.action?.toLowerCase() || "";
    const target = log.target?.toLowerCase() || "";
    const user = (log.user?.email || log.userId || "").toLowerCase();
    return action.includes(query) || target.includes(query) || user.includes(query);
  });

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-text-muted">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mb-4" />
        Loading Audit Logs...
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto pb-12">
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-text-primary mb-2 flex items-center gap-3">
            <ShieldAlert className="w-8 h-8 text-brand" />
            Audit Logs
          </h1>
          <p className="text-text-secondary text-sm">
            Track all actions performed on your servers.
          </p>
        </div>

        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search action, target or user..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full glass-input pl-10 pr-4 py-2 rounded-xl text-sm text-text-primary placeholder:text-text-muted transition-colors outline-none border border-border-DEFAULT focus:border-brand"
          />
        </div>
      </header>

      <div className="bg-neutral-bg2/80 border border-border-subtle rounded-2xl overflow-hidden backdrop-blur-xl shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-neutral-bg3 border-b border-border-subtle text-xs uppercase text-text-muted tracking-wider">
              <tr>
                <th className="px-6 py-4 font-medium">Time</th>
                <th className="px-6 py-4 font-medium">Action</th>
                <th className="px-6 py-4 font-medium">Target</th>
                <th className="px-6 py-4 font-medium">User</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-text-muted">
                    No logs found matching your criteria.
                  </td>
                </tr>
              ) : (
                paginatedLogs.map(log => (
                  <tr key={log.id} className="hover:bg-neutral-bg3 transition-colors">
                    <td className="px-6 py-4 text-text-secondary">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-neutral-bg4 text-text-primary rounded text-xs font-mono border border-border-subtle inline-block">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-text-primary">
                      {log.target}
                    </td>
                    <td className="px-6 py-4 text-text-secondary">
                      {log.user?.email || log.userId}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-border-subtle bg-neutral-bg1/50">
            <span className="text-sm text-text-muted">
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredLogs.length)} of {filteredLogs.length} entries
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg bg-neutral-bg3 text-text-secondary hover:text-text-primary hover:bg-neutral-bg4 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-border-subtle"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="text-sm font-medium text-text-primary px-2">
                Page {currentPage} of {totalPages}
              </div>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg bg-neutral-bg3 text-text-secondary hover:text-text-primary hover:bg-neutral-bg4 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-border-subtle"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
