// File: WebhookLogsPage.jsx

import { useState, useEffect } from "react";
import { authFetch } from "../utils/api";

const TYPE_STYLES = {
  WEBHOOK: "text-purple-700 bg-purple-50 dark:text-purple-300 dark:bg-purple-950",
  API: "text-gray-600 bg-gray-100 dark:text-gray-300 dark:bg-gray-800",
  ERROR: "text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-950",
};

function WebhookLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ALL");

  // NEW — pagination state, same pattern as the Customers panel
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Loads one page of logs from the backend, filtered by type if one is selected
  const loadLogs = () => {
    setLoading(true);
    setError("");

    const params = new URLSearchParams();
    params.append("page", page);
    params.append("limit", 20);
    if (filter !== "ALL") params.append("type", filter);

    authFetch(`/api/logs?${params.toString()}`)
      .then((res) => (res ? res.json() : { data: [], pagination: { totalPages: 1 } }))
      .then((result) => {
        setLogs(result?.data || []);
        setTotalPages(result?.pagination?.totalPages || 1);
      })
      .catch(() => setError("Couldn't load logs."))
      .finally(() => setLoading(false));
  };

  // Re-fetch whenever the page or the type filter changes
  useEffect(loadLogs, [page, filter]);

  // When the filter changes, always jump back to page 1 — otherwise you could
  // end up on a page that doesn't exist for the new filter
  const handleFilterChange = (t) => {
    setFilter(t);
    setPage(1);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-1">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Activity Logs</h1>
        <button onClick={loadLogs} className="text-sm text-purple-600 dark:text-purple-400">Refresh</button>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Recent webhook deliveries, API calls, and errors.</p>

      <div className="flex gap-2 mb-4">
        {["ALL", "WEBHOOK", "API", "ERROR"].map((t) => (
          <button
            key={t}
            onClick={() => handleFilterChange(t)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium ${
              filter === t
                ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-300 text-sm p-3 rounded-md mb-4">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
        {loading ? (
          <div className="p-6 text-center text-gray-400">Loading logs…</div>
        ) : logs.length === 0 ? (
          <div className="p-6 text-center text-gray-400">No log entries yet.</div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Event</th>
                  <th className="px-4 py-2">Detail</th>
                  <th className="px-4 py-2">When</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-50 dark:border-gray-800 last:border-none">
                    <td className="px-4 py-2">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${TYPE_STYLES[log.type] || "bg-gray-100 text-gray-500"}`}>
                        {log.type}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-800 dark:text-gray-200">{log.event}</td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{log.detail || "—"}</td>
                    <td className="px-4 py-2 text-gray-400 text-xs">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* NEW — Previous/Next pagination controls, same style as Customers panel */}
            {totalPages > 1 && (
              <div className="flex justify-between items-center px-4 py-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="text-sm text-purple-600 dark:text-purple-400 disabled:text-gray-300 dark:disabled:text-gray-600"
                >
                  ← Previous
                </button>
                <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="text-sm text-purple-600 dark:text-purple-400 disabled:text-gray-300 dark:disabled:text-gray-600"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default WebhookLogsPage;
