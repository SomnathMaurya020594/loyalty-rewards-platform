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
import { useDarkMode } from "./hooks/useDarkMode"; // NEW — dark mode hook

const TIERS = ["All", "Bronze", "Silver", "Gold", "Platinum"];
const TIER_STYLES = {
  Bronze: "text-orange-700 bg-orange-50 dark:text-orange-300 dark:bg-orange-950",
  Silver: "text-gray-600 bg-gray-100 dark:text-gray-300 dark:bg-gray-800",
  Gold: "text-yellow-700 bg-yellow-50 dark:text-yellow-300 dark:bg-yellow-950",
  Platinum: "text-purple-700 bg-purple-50 dark:text-purple-300 dark:bg-purple-950",
};

function App() {
  // NEW — dark mode state, remembered across page reloads via localStorage
  const [isDark, setIsDark] = useDarkMode();

  return (
    <BrowserRouter>
      <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-8 py-4 flex gap-6 items-center">
        <Link to="/" className="font-medium text-gray-900 dark:text-gray-100">Merchant Dashboard</Link>
        <Link to="/rules" className="font-medium text-gray-900 dark:text-gray-100">Rules</Link>
        <Link to="/rewards" className="font-medium text-gray-900 dark:text-gray-100">Rewards</Link>
        <Link to="/tiers" className="font-medium text-gray-900 dark:text-gray-100">Tiers</Link>
        <Link to="/analytics" className="font-medium text-gray-900 dark:text-gray-100">Analytics</Link>
        <Link to="/logs" className="font-medium text-gray-900 dark:text-gray-100">Webhook Logs</Link>
        {/* <Link to="/customers" className="font-medium text-gray-900">Customers</Link> */}
        {/* <Link to="/customer" className="font-medium text-gray-900">Customer View</Link> */}

        {/* NEW — dark mode toggle button, sits in the nav bar itself */}
        <button
          onClick={() => setIsDark(!isDark)}
          className="ml-auto text-sm px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"
          title="Toggle dark mode"
        >
          {isDark ? "☀️ Light" : "🌙 Dark"}
        </button>

        <button
          onClick={() => {
            localStorage.removeItem("token");
            window.location.href = "/login";
          }}
          className="text-red-600 text-sm"
        >
          Logout
        </button>
      </nav>

      <div className="bg-white dark:bg-gray-900 min-h-screen">
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
      </div>
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

  // NEW — pagination state for the Recent Redemptions table
  const [redemptionsLoading, setRedemptionsLoading] = useState(true);
  const [redPage, setRedPage] = useState(1);
  const [redTotalPages, setRedTotalPages] = useState(1);

  // Everything except redemptions loads once on mount (rules/rewards/tiers/stats
  // don't need pagination, so they stay in this first Promise.all)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.all([
      authFetch("/api/rules").then((r) => (r ? r.json() : [])),
      authFetch("/api/rewards").then((r) => (r ? r.json() : [])),
      authFetch("/api/tiers").then((r) => (r ? r.json() : [])),
      authFetch("/api/analytics/summary").then((r) => (r ? r.json() : null)),
    ])
      .then(([rulesData, rewardsData, tiersData, statsData]) => {
        if (cancelled) return;
        setRules(rulesData || []);
        setRewards(rewardsData || []);
        setTiers((tiersData || []).sort((a, b) => a.minPoints - b.minPoints));
        setStats(statsData);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load dashboard data. Please refresh.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  // NEW — Recent Redemptions now fetches its own page separately, so
  // Previous/Next only refetches this table, not the whole dashboard
  useEffect(() => {
    setRedemptionsLoading(true);
    const params = new URLSearchParams();
    params.append("page", redPage);
    params.append("limit", 10);

    authFetch(`/api/redemptions?${params.toString()}`)
      .then((res) => (res ? res.json() : { data: [], pagination: { totalPages: 1 } }))
      .then((result) => {
        setRedemptions(result?.data || []);
        setRedTotalPages(result?.pagination?.totalPages || 1);
      })
      .finally(() => setRedemptionsLoading(false));
  }, [redPage]);

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
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-8">Merchant Dashboard</h1>
        <p className="text-gray-400">Loading dashboard…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-8">Merchant Dashboard</h1>
        <div className="bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-300 text-sm p-3 rounded-md">{error}</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Merchant Dashboard</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">Overview of your loyalty program</p>

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
                  TIER_STYLES[t.name] || "text-gray-600 bg-gray-100 dark:text-gray-300 dark:bg-gray-800"
                } ${!t.isActive ? "opacity-40" : ""}`}
              >
                {t.name} — {t.minPoints.toLocaleString()}+ pts
              </span>
            ))}
          </div>
          <Link to="/tiers" className="text-xs text-purple-600 dark:text-purple-400 mt-3 inline-block">
            Manage tiers →
          </Link>
        </Panel>
      </div>

      {/* Recent redemptions — now paginated (10 per page) */}
      <Panel title="Recent Redemptions" emptyText="No redemptions yet." isEmpty={!redemptionsLoading && redemptions.length === 0}>
        {redemptionsLoading ? (
          <div className="text-center py-6 text-gray-400 text-sm">Loading redemptions…</div>
        ) : (
          <>
            <div className="overflow-x-auto -mx-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                    <th className="px-4 py-2">Customer</th>
                    <th className="px-4 py-2">Reward</th>
                    <th className="px-4 py-2">Points</th>
                    <th className="px-4 py-2">Code</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {redemptions.map((r) => (
                    <tr key={r.id} className="border-b border-gray-50 dark:border-gray-800 last:border-none">
                      <td className="px-4 py-2 text-gray-800 dark:text-gray-200">{r.customer?.name ?? "—"}</td>
                      <td className="px-4 py-2 text-gray-800 dark:text-gray-200">{r.reward?.name ?? "—"}</td>
                      <td className="px-4 py-2 text-gray-800 dark:text-gray-200">{r.pointsSpent}</td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-800 dark:text-gray-200">{r.generatedCode}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`text-xs font-medium px-2 py-1 rounded-full ${
                            r.status === "APPLIED"
                              ? "text-green-700 bg-green-50 dark:text-green-300 dark:bg-green-950"
                              : "text-yellow-700 bg-yellow-50 dark:text-yellow-300 dark:bg-yellow-950"
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

            {redTotalPages > 1 && (
              <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  onClick={() => setRedPage((p) => Math.max(1, p - 1))}
                  disabled={redPage === 1}
                  className="text-sm text-purple-600 dark:text-purple-400 disabled:text-gray-300 dark:disabled:text-gray-600"
                >
                  ← Previous
                </button>
                <span className="text-xs text-gray-400">Page {redPage} of {redTotalPages}</span>
                <button
                  onClick={() => setRedPage((p) => Math.min(redTotalPages, p + 1))}
                  disabled={redPage === redTotalPages}
                  className="text-sm text-purple-600 dark:text-purple-400 disabled:text-gray-300 dark:disabled:text-gray-600"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </Panel>

      {/* Customers panel */}
      <div className="mt-8 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Customers</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCustPage(1); }}
              placeholder="Search customers..."
              className="border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md px-3 py-1.5 text-sm w-48"
            />
            <select
              value={tier}
              onChange={(e) => { setTier(e.target.value); setCustPage(1); }}
              className="border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md px-3 py-1.5 text-sm"
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
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {customers.map((c) => (
                <div key={c.id} className="flex justify-between items-center py-2 text-sm">
                  <span className="text-gray-800 dark:text-gray-200">{c.name} ({c.email})</span>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        TIER_STYLES[c.tier] || "text-gray-600 bg-gray-100 dark:text-gray-300 dark:bg-gray-800"
                      }`}
                    >
                      {c.tier}
                    </span>
                    <span className="text-purple-600 dark:text-purple-400 font-medium">{c.currentPoints} pts</span>
                  </div>
                </div>
              ))}
            </div>

            {custTotalPages > 1 && (
              <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  onClick={() => setCustPage((p) => Math.max(1, p - 1))}
                  disabled={custPage === 1}
                  className="text-sm text-purple-600 dark:text-purple-400 disabled:text-gray-300 dark:disabled:text-gray-600"
                >
                  ← Previous
                </button>
                <span className="text-xs text-gray-400">Page {custPage} of {custTotalPages}</span>
                <button
                  onClick={() => setCustPage((p) => Math.min(custTotalPages, p + 1))}
                  disabled={custPage === custTotalPages}
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

function StatCard({ label, value }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
      <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{value}</div>
    </div>
  );
}

function Panel({ title, children, isEmpty, emptyText }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-5">
      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">{title}</h3>
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
    <div className={`flex justify-between items-center py-2 text-sm border-b border-gray-100 dark:border-gray-800 last:border-none ${muted ? "opacity-40" : ""}`}>
      <span className="text-gray-800 dark:text-gray-200">{left}</span>
      <span className="text-purple-600 dark:text-purple-400 font-medium">{right}</span>
    </div>
  );
}

export default App;
