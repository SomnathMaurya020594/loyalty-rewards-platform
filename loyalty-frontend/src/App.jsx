// File: App.jsx
// Kya hai: Main entry — batata hai kaunsa URL pe kaunsa page dikhana hai
// "/" → Merchant Dashboard, "/customer" → Customer Dashboard

import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import CustomerView from "./pages/CustomerView";
import Section from "./components/Section";
import Row from "./components/Row";
import RulesPage from "./pages/RulesPage";
import RewardsPage from "./pages/RewardsPage";
import CustomersPage from "./pages/CustomersPage";
import { Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import { authFetch } from "./utils/api";

const API = "http://localhost:4000";

function App() {
  return (
    <BrowserRouter>
      <nav className="bg-white border-b border-gray-200 px-8 py-4 flex gap-6">
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

// Abhi ke liye Merchant Dashboard yahi rakha hai — agle step mein isko bhi
// pages/ folder mein nikalenge (RulesPage, RewardsPage, alag-alag)
function MerchantDashboard() {
  const [rules, setRules] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [stats, setStats] = useState(null);

useEffect(() => {
  authFetch("/api/rules").then((res) => res && res.json()).then(setRules);
  authFetch("/api/rewards").then((res) => res && res.json()).then(setRewards);
  authFetch("/api/customers").then((res) => res && res.json()).then(setCustomers);
  authFetch("/api/analytics/summary").then((res) => res && res.json()).then(setStats);
}, []);

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Merchant Dashboard</h1>

      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-10">
          <StatCard label="Total Members" value={stats.totalMembers} />
          <StatCard label="Points Issued" value={stats.totalPointsIssued} />
          <StatCard label="Points Redeemed" value={stats.totalPointsRedeemed} />
          <StatCard label="Active Campaigns" value={stats.activeCampaigns} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-8">
        <Section title="Loyalty Rules">
          {rules.map((rule) => (
            <Row key={rule.id} left={rule.name} right={`${rule.points} pts`} />
          ))}
        </Section>

        <Section title="Rewards">
          {rewards.map((reward) => (
            <Row key={reward.id} left={reward.name} right={`${reward.pointsCost} pts`} />
          ))}
        </Section>
      </div>

      <div className="mt-8">
        <Section title="Customers">
          {customers.map((c) => (
            <Row key={c.id} left={`${c.name} (${c.email})`} right={`${c.currentPoints} pts · ${c.tier}`} />
          ))}
        </Section>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-xs text-gray-500 uppercase">{label}</div>
      <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
    </div>
  );
}

export default App;