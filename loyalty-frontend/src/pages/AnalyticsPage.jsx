// File: AnalyticsPage.jsx

import { useState, useEffect } from "react";
import { authFetch } from "../utils/api";

const TIER_STYLES = {
  Bronze: "text-orange-700 bg-orange-50 dark:text-orange-300 dark:bg-orange-950",
  Silver: "text-gray-600 bg-gray-100 dark:text-gray-300 dark:bg-gray-800",
  Gold: "text-yellow-700 bg-yellow-50 dark:text-yellow-300 dark:bg-yellow-950",
  Platinum: "text-purple-700 bg-purple-50 dark:text-purple-300 dark:bg-purple-950",
};

function AnalyticsPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // NEW — Top Customers now has its own state + pagination, fetched
  // from a separate paginated endpoint instead of the summary's fixed top 5
  const [topCustomers, setTopCustomers] = useState([]);
  const [topLoading, setTopLoading] = useState(true);
  const [topPage, setTopPage] = useState(1);
  const [topTotalPages, setTopTotalPages] = useState(1);

  // Summary stats (revenue, redemption rate, etc) load once
  useEffect(() => {
    setLoading(true);
    authFetch("/api/analytics/summary")
      .then((res) => (res ? res.json() : null))
      .then(setStats)
      .catch(() => setError("Couldn't load analytics."))
      .finally(() => setLoading(false));
  }, []);

  // NEW — Top Customers table fetches its own page separately, so
  // Previous/Next only refetches this table
  useEffect(() => {
    setTopLoading(true);
    const params = new URLSearchParams();
    params.append("page", topPage);
    params.append("limit", 5);

    authFetch(`/api/analytics/top-customers?${params.toString()}`)
      .then((res) => (res ? res.json() : { data: [], pagination: { totalPages: 1 } }))
      .then((result) => {
        setTopCustomers(result?.data || []);
        setTopTotalPages(result?.pagination?.totalPages || 1);
      })
      .finally(() => setTopLoading(false));
  }, [topPage]);

  if (loading) return <p className="p-8 text-gray-400">Loading analytics…</p>;
  if (error) return <div className="p-8 text-red-600 bg-red-50 dark:bg-red-950 rounded-lg m-8">{error}</div>;
  if (!stats) return null;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">Analytics</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Program performance at a glance</p>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total revenue generated"
          value={`₹${stats.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
        />
        <StatCard label="Redemption rate" value={`${stats.redemptionRate}%`} />
        <StatCard label="Active members" value={stats.activeMembers} sub="last 30 days" />
        <StatCard
          label="Monthly growth"
          value={`${stats.monthlyGrowth > 0 ? "+" : ""}${stats.monthlyGrowth}%`}
          negative={stats.monthlyGrowth < 0}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <StatCard label="Points issued" value={stats.totalPointsIssued.toLocaleString()} />
        <StatCard label="Points redeemed" value={stats.totalPointsRedeemed.toLocaleString()} />
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-5">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">Top loyalty customers</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">By lifetime points</p>

        {topLoading ? (
          <div className="text-center py-6 text-gray-400 text-sm">Loading customers…</div>
        ) : topCustomers.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-sm">No customers yet.</div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                  <th className="py-2">#</th>
                  <th className="py-2">Customer</th>
                  <th className="py-2">Lifetime points</th>
                  <th className="py-2">Total spend</th>
                  <th className="py-2">Tier</th>
                </tr>
              </thead>
              <tbody>
                {topCustomers.map((c, i) => (
                  <tr key={c.id} className="border-b border-gray-50 dark:border-gray-800 last:border-none">
                    <td className="py-2 text-gray-400">{(topPage - 1) * 5 + i + 1}</td>
                    <td className="py-2 text-gray-900 dark:text-gray-100">{c.name}</td>
                    <td className="py-2 text-gray-900 dark:text-gray-100">{c.lifetimePoints.toLocaleString()}</td>
                    <td className="py-2 text-gray-900 dark:text-gray-100">₹{c.totalSpent.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td className="py-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TIER_STYLES[c.tier] || "bg-gray-100 text-gray-500"}`}>
                        {c.tier}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {topTotalPages > 1 && (
              <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  onClick={() => setTopPage((p) => Math.max(1, p - 1))}
                  disabled={topPage === 1}
                  className="text-sm text-purple-600 dark:text-purple-400 disabled:text-gray-300 dark:disabled:text-gray-600"
                >
                  ← Previous
                </button>
                <span className="text-xs text-gray-400">Page {topPage} of {topTotalPages}</span>
                <button
                  onClick={() => setTopPage((p) => Math.min(topTotalPages, p + 1))}
                  disabled={topPage === topTotalPages}
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

function StatCard({ label, value, sub, negative }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${negative ? "text-red-600" : "text-gray-900 dark:text-gray-100"}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

export default AnalyticsPage;
