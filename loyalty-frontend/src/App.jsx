// File: App.jsx
// Kya hai: Main entry — routes + redesigned Merchant Dashboard (stat cards, recent redemptions)
// Yeh mock (loyalty-platform-mock.html) ke look se match karta hai, par real data + Tailwind se

import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Link, Navigate } from "react-router-dom";
import CustomerView from "./pages/CustomerView";
import RulesPage from "./pages/RulesPage";
import RewardsPage from "./pages/RewardsPage";
import CustomersPage from "./pages/CustomersPage";
import LoginPage from "./pages/LoginPage";
import { authFetch } from "./utils/api";

function App() {
  return (
    <BrowserRouter>
      <nav className="bg-white border-b border-gray-200 px-8 py-4 flex gap-6 items-center">
        <Link to="/" className="font-medium text-gray-900">Merchant Dashboard</Link>
        <Link to="/customer" className="font-medium text-gray-900">Customer View</Link>
        <Link to="/rules" className="font-medium text-gray-900">Rules</Link>
        <Link to="/rewards" className="font-medium text-gray-900">Rewards</Link>
        <Link to="/customers" className="font-medium text-gray-900">Customers</Link>
        <button
          onClick={() => {
            localStorage.removeItem("token");
            window.location.href = "/login";
          }}
          className="ml-auto text-red-600 text-sm"
        >
          Logout
        </button>
      </nav>

      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={localStorage.getItem("token") ? <MerchantDashboard /> : <Navigate to="/login" />} />
        <Route path="/customer" element={<CustomerView />} />
        <Route path="/rules" element={localStorage.getItem("token") ? <RulesPage /> : <Navigate to="/login" />} />
        <Route path="/rewards" element={localStorage.getItem("token") ? <RewardsPage /> : <Navigate to="/login" />} />
        <Route path="/customers" element={localStorage.getItem("token") ? <CustomersPage /> : <Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  );
}

function MerchantDashboard() {
  const [rules, setRules] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.all([
      authFetch("/api/rules").then((r) => (r ? r.json() : [])),
      authFetch("/api/rewards").then((r) => (r ? r.json() : [])),
      authFetch("/api/customers").then((r) => (r ? r.json() : [])),
      authFetch("/api/analytics/summary").then((r) => (r ? r.json() : null)),
      authFetch("/api/redemptions").then((r) => (r ? r.json() : [])),
    ])
      .then(([rulesData, rewardsData, customersData, statsData, redemptionsData]) => {
        if (cancelled) return;
        setRules(rulesData || []);
        setRewards(rewardsData || []);
        setCustomers(customersData || []);
        setStats(statsData);
        setRedemptions(redemptionsData || []);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load dashboard data. Please refresh.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Merchant Dashboard</h1>
        <p className="text-gray-400">Loading dashboard…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Merchant Dashboard</h1>
        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">{error}</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Merchant Dashboard</h1>
      <p className="text-sm text-gray-500 mb-8">Overview of your loyalty program</p>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4 mb-10">
        <StatCard label="Total Members" value={stats?.totalMembers ?? 0} />
        <StatCard label="Points Issued" value={stats?.totalPointsIssued ?? 0} />
        <StatCard label="Points Redeemed" value={stats?.totalPointsRedeemed ?? 0} />
        <StatCard label="Active Campaigns" value={stats?.activeCampaigns ?? 0} />
      </div>

      {/* Rules + Rewards side by side */}
      <div className="grid grid-cols-2 gap-8 mb-10">
        <Panel title="Loyalty Rules" emptyText="No rules yet." isEmpty={rules.length === 0}>
          {rules.map((rule) => (
            <Row key={rule.id} left={rule.name} right={`${rule.points} pts`} muted={!rule.isActive} />
          ))}
        </Panel>

        <Panel title="Rewards" emptyText="No rewards yet." isEmpty={rewards.length === 0}>
          {rewards.map((reward) => (
            <Row key={reward.id} left={reward.name} right={`${reward.pointsCost} pts`} muted={!reward.isActive} />
          ))}
        </Panel>
      </div>

      {/* Recent redemptions */}
      <Panel title="Recent Redemptions" emptyText="No redemptions yet." isEmpty={redemptions.length === 0}>
        <div className="overflow-x-auto -mx-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2">Reward</th>
                <th className="px-4 py-2">Points</th>
                <th className="px-4 py-2">Code</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {redemptions.slice(0, 10).map((r) => (
                <tr key={r.id} className="border-b border-gray-50 last:border-none">
                  <td className="px-4 py-2">{r.customer?.name ?? "—"}</td>
                  <td className="px-4 py-2">{r.reward?.name ?? "—"}</td>
                  <td className="px-4 py-2">{r.pointsSpent}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.generatedCode}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-full ${
                        r.status === "APPLIED"
                          ? "text-green-700 bg-green-50"
                          : "text-yellow-700 bg-yellow-50"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Customers preview */}
      <div className="mt-8">
        <Panel title="Customers" emptyText="No customers yet." isEmpty={customers.length === 0}>
          {customers.slice(0, 8).map((c) => (
            <Row
              key={c.id}
              left={`${c.name} (${c.email})`}
              right={`${c.currentPoints} pts · ${c.tier}`}
            />
          ))}
        </Panel>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
    </div>
  );
}

function Panel({ title, children, isEmpty, emptyText }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h3 className="font-semibold text-gray-900 mb-4">{title}</h3>
      {isEmpty ? (
        <div className="text-center py-6 text-gray-400 text-sm">{emptyText}</div>
      ) : (
        <div className="divide-y divide-gray-100">{children}</div>
      )}
    </div>
  );
}

function Row({ left, right, muted }) {
  return (
    <div className={`flex justify-between items-center py-2 text-sm ${muted ? "opacity-40" : ""}`}>
      <span className="text-gray-800">{left}</span>
      <span className="text-purple-600 font-medium">{right}</span>
    </div>
  );
}

export default App;
