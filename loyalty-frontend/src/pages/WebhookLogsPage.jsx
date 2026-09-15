// File: WebhookLogsPage.jsx

import { useState, useEffect } from "react";
import { authFetch } from "../utils/api";

const TYPE_STYLES = {
  WEBHOOK: "text-purple-700 bg-purple-50",
  API: "text-gray-600 bg-gray-100",
  ERROR: "text-red-700 bg-red-50",
};

function WebhookLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ALL");

  const loadLogs = () => {
    setLoading(true);
    authFetch("/api/logs")
      .then((res) => (res ? res.json() : []))
      .then(setLogs)
      .catch(() => setError("Couldn't load logs."))
      .finally(() => setLoading(false));
  };

  useEffect(loadLogs, []);

  const filtered = filter === "ALL" ? logs : logs.filter((l) => l.type === filter);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-1">
        <h1 className="text-3xl font-bold text-gray-900">Activity Logs</h1>
        <button onClick={loadLogs} className="text-sm text-purple-600">Refresh</button>
      </div>
      <p className="text-sm text-gray-500 mb-6">Recent webhook deliveries, API calls, and errors.</p>

      <div className="flex gap-2 mb-4">
        {["ALL", "WEBHOOK", "API", "ERROR"].map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium ${
              filter === t ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>}

      <div className="bg-white border border-gray-200 rounded-lg">
        {loading ? (
          <div className="p-6 text-center text-gray-400">Loading logs…</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-gray-400">No log entries yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Event</th>
                <th className="px-4 py-2">Detail</th>
                <th className="px-4 py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log) => (
                <tr key={log.id} className="border-b border-gray-50 last:border-none">
                  <td className="px-4 py-2">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${TYPE_STYLES[log.type] || "bg-gray-100 text-gray-500"}`}>
                      {log.type}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{log.event}</td>
                  <td className="px-4 py-2 text-gray-600">{log.detail || "—"}</td>
                  <td className="px-4 py-2 text-gray-400 text-xs">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default WebhookLogsPage;
