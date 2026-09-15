// File: CustomersPage.jsx


import { useState, useEffect } from "react";
import { authFetch } from "../utils/api";

const API = import.meta.env.VITE_API_URL;

const TIERS = ["All", "Bronze", "Silver", "Gold", "Platinum"];

function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState("All");

const loadCustomers = () => {
  const params = new URLSearchParams();
  if (search) params.append("search", search);
  if (tier !== "All") params.append("tier", tier);

  authFetch(`/api/customers?${params.toString()}`)
    .then((res) => res && res.json())
    .then(setCustomers);
};

  // Jab bhi "search" ya "tier" badle, dobara fetch karo
  useEffect(() => {
    loadCustomers();
  }, [search, tier]);

  const tierColor = {
    Bronze: "text-orange-700 bg-orange-50",
    Silver: "text-gray-600 bg-gray-100",
    Gold: "text-yellow-700 bg-yellow-50",
    Platinum: "text-purple-700 bg-purple-50",
  };

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Customers</h1>

      {/* Search + Filter Bar */}
      <div className="flex gap-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          className="flex-1 border border-gray-300 rounded-md px-3 py-2"
        />
        <select
          value={tier}
          onChange={(e) => setTier(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2"
        >
          {TIERS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Customers List */}
      <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
        {customers.length === 0 && (
          <div className="p-6 text-center text-gray-400">No customers found.</div>
        )}

        {customers.map((c) => (
          <div key={c.id} className="flex justify-between items-center p-4">
            <div>
              <div className="text-gray-900 font-medium">{c.name}</div>
              <div className="text-sm text-gray-500">{c.email}</div>
            </div>

            <div className="flex items-center gap-4">
              <span
                className={`text-xs font-medium px-2 py-1 rounded-full ${tierColor[c.tier]}`}
              >
                {c.tier}
              </span>
              <span className="text-purple-600 font-medium w-20 text-right">
                {c.currentPoints} pts
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default CustomersPage;