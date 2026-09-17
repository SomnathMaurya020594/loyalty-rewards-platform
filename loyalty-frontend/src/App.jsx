// File: App.jsx


import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Link, Navigate } from "react-router-dom";
import CustomerView from "./pages/CustomerView";
import RulesPage from "./pages/RulesPage";
import RewardsPage from "./pages/RewardsPage";
import CustomersPage from "./pages/CustomersPage";
import TiersPage from "./pages/TiersPage";
import LoginPage from "./pages/LoginPage";
import { authFetch } from "./utils/api";
import WebhookLogsPage from "./pages/WebhookLogsPage";
import AnalyticsPage from "./pages/AnalyticsPage";

const TIERS = ["All", "Bronze", "Silver", "Gold", "Platinum"];
const TIER_STYLES = {
  Bronze: "text-orange-700 bg-orange-50",
  Silver: "text-gray-600 bg-gray-100",
  Gold: "text-yellow-700 bg-yellow-50",
  Platinum: "text-purple-700 bg-purple-50",
};

function App() {
  return (
    <BrowserRouter>
      <nav className="bg-white border-b border-gray-200 px-8 py-4 flex gap-6 items-center">
        <Link to="/" className="font-medium text-gray-900">Merchant Dashboard</Link>       
        <Link to="/rules" className="font-medium text-gray-900">Rules</Link>
        <Link to="/rewards" className="font-medium text-gray-900">Rewards</Link>
        <Link to="/tiers" className="font-medium text-gray-900">Tiers</Link>
        <Link to="/analytics" className="font-medium text-gray-900">Analytics</Link>
          <Link to="/logs" className="font-medium text-gray-900">Webhook Logs</Link>
        {/* <Link to="/customers" className="font-medium text-gray-900">Customers</Link> */}
         {/* <Link to="/customer" className="font-medium text-gray-900">Customer View</Link> */}
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
        <Route path="/rules" element={localStorage.getItem("token") ? <RulesPage /> : <Navigate to="/login" />} />
        <Route path="/rewards" element={localStorage.getItem("token") ? <RewardsPage /> : <Navigate to="/login" />} />
        <Route path="/tiers" element={localStorage.getItem("token") ? <TiersPage /> : <Navigate to="/login" />} />
        <Route path="/analytics" element={localStorage.getItem("token") ? <AnalyticsPage /> : <Navigate to="/login" />} />
        <Route path="/logs" element={localStorage.getItem("token") ? <WebhookLogsPage /> : <Navigate to="/login" />} />
        {/* <Route path="/customers" element={localStorage.getItem("token") ? <CustomersPage /> : <Navigate to="/login" />} /> */}
          {/* <Route path="/customer" element={<CustomerView />} /> */}
      </Routes>
    </BrowserRouter>
  );
}

function MerchantDashboard() {
  const [rules, setRules] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState("All");
  const [custPage, setCustPage] = useState(1);
const [custTotalPages, setCustTotalPages] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.all([
      authFetch("/api/rules").then((r) => (r ? r.json() : [])),
      authFetch("/api/rewards").then((r) => (r ? r.json() : [])),
      authFetch("/api/tiers").then((r) => (r ? r.json() : [])),
      authFetch("/api/analytics/summary").then((r) => (r ? r.json() : null)),
      authFetch("/api/redemptions").then((r) => (r ? r.json() : [])),
    ])
      .then(([rulesData, rewardsData, tiersData, statsData, redemptionsData]) => {
        if (cancelled) return;
        setRules(rulesData || []);
        setRewards(rewardsData || []);
        setTiers((tiersData || []).sort((a, b) => a.minPoints - b.minPoints));
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

useEffect(() => {
  const timeout = setTimeout(() => {
    setCustomersLoading(true);
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (tier !== "All") params.append("tier", tier);
    params.append("page", custPage);

   authFetch(`/api/customers?${params.toString()}`)
  .then((res) => (res ? res.json() : { data: [], pagination: { totalPages: 1 } }))
  .then((result) => {
    setCustomers(result?.data || []);
    setCustTotalPages(result?.pagination?.totalPages || 1);
  })
  .finally(() => setCustomersLoading(false));
  }, 300);

  return () => clearTimeout(timeout);
}, [search, tier, custPage]);

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
      <div className="grid grid-cols-2 gap-8 mb-8">
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

      {/* Tiers panel — read-only preview here, full CRUD lives on the /tiers page */}
      <div className="mb-10">
        <Panel
          title="Loyalty Tiers"
          emptyText="No tiers configured — every customer defaults to Bronze. Set some up on the Tiers page."
          isEmpty={tiers.length === 0}
        >
          <div className="flex gap-3 flex-wrap py-1">
            {tiers.map((t) => (
              <span
                key={t.id}
                className={`text-xs font-medium px-3 py-1.5 rounded-full ${
                  TIER_STYLES[t.name] || "text-gray-600 bg-gray-100"
                } ${!t.isActive ? "opacity-40" : ""}`}
              >
                {t.name} — {t.minPoints.toLocaleString()}+ pts
              </span>
            ))}
          </div>
          <Link to="/tiers" className="text-xs text-purple-600 mt-3 inline-block">
            Manage tiers →
          </Link>
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

      {/* Customers panel */}
      <div className="mt-8 bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h3 className="font-semibold text-gray-900">Customers</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCustPage(1); }}
              placeholder="Search customers..."
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-48"
            />
            <select
              value={tier}
              onChange={(e) => { setTier(e.target.value); setCustPage(1); }}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
            >
              {TIERS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        {customersLoading ? (
          <div className="text-center py-6 text-gray-400 text-sm">Loading customers…</div>
        ) : customers.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-sm">
            {search || tier !== "All" ? "No customers match your search/filter." : "No customers yet."}
          </div>
) : (
  <>
    <div className="divide-y divide-gray-100">
      {customers.map((c) => (
        <div key={c.id} className="flex justify-between items-center py-2 text-sm">
          <span className="text-gray-800">{c.name} ({c.email})</span>
          <div className="flex items-center gap-3">
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                TIER_STYLES[c.tier] || "text-gray-600 bg-gray-100"
              }`}
            >
              {c.tier}
            </span>
            <span className="text-purple-600 font-medium">{c.currentPoints} pts</span>
          </div>
        </div>
      ))}
    </div>

    {custTotalPages > 1 && (
      <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-100">
        <button
          onClick={() => setCustPage((p) => Math.max(1, p - 1))}
          disabled={custPage === 1}
          className="text-sm text-purple-600 disabled:text-gray-300"
        >
          ← Previous
        </button>
        <span className="text-xs text-gray-400">Page {custPage} of {custTotalPages}</span>
        <button
          onClick={() => setCustPage((p) => Math.min(custTotalPages, p + 1))}
          disabled={custPage === custTotalPages}
          className="text-sm text-purple-600 disabled:text-gray-300"
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
        <div>{children}</div>
      )}
    </div>
  );
}

function Row({ left, right, muted }) {
  return (
    <div className={`flex justify-between items-center py-2 text-sm border-b border-gray-100 last:border-none ${muted ? "opacity-40" : ""}`}>
      <span className="text-gray-800">{left}</span>
      <span className="text-purple-600 font-medium">{right}</span>
    </div>
  );
}

export default App;
