// File: AnalyticsPage.jsx


import { useState, useEffect } from "react";
import { authFetch } from "../utils/api";

const TIER_STYLES = {
  Bronze: "text-orange-700 bg-orange-50",
  Silver: "text-gray-600 bg-gray-100",
  Gold: "text-yellow-700 bg-yellow-50",
  Platinum: "text-purple-700 bg-purple-50",
};

function AnalyticsPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    authFetch("/api/analytics/summary")
      .then((res) => (res ? res.json() : null))
      .then(setStats)
      .catch(() => setError("Couldn't load analytics."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="p-8 text-gray-400">Loading analytics…</p>;
  if (error) return <div className="p-8 text-red-600 bg-red-50 rounded-lg m-8">{error}</div>;
  if (!stats) return null;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-1">Analytics</h1>
      <p className="text-sm text-gray-500 mb-6">Program performance at a glance</p>

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

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h3 className="font-semibold text-gray-900">Top loyalty customers</h3>
        <p className="text-xs text-gray-500 mb-4">By lifetime points</p>

        {stats.topCustomers.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-sm">No customers yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="py-2">#</th>
                <th className="py-2">Customer</th>
                <th className="py-2">Lifetime points</th>
                <th className="py-2">Total spend</th>
                <th className="py-2">Tier</th>
              </tr>
            </thead>
            <tbody>
              {stats.topCustomers.map((c, i) => (
                <tr key={c.name + i} className="border-b border-gray-50 last:border-none">
                  <td className="py-2 text-gray-400">{i + 1}</td>
                  <td className="py-2 text-gray-900">{c.name}</td>
                  <td className="py-2">{c.lifetimePoints.toLocaleString()}</td>
                  <td className="py-2">₹{c.totalSpent.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td className="py-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TIER_STYLES[c.tier] || "bg-gray-100 text-gray-500"}`}>
                      {c.tier}
                    </span>
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

function StatCard({ label, value, sub, negative }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${negative ? "text-red-600" : "text-gray-900"}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

export default AnalyticsPage;
