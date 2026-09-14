// File: CustomerView.jsx
// What this is: The customer-facing dashboard — shows their points, tier, rewards, and history.
// Where it's used: App.jsx renders this on the "/customer" route.
//
// This version keeps the exact same data/behavior as before (same API calls, same redeem flow,
// same hardcoded customerId until real customer login exists) — only the visual layer changed
// to match the polished mock design (dark header banner, styled reward cards, progress bar).

import { useState, useEffect } from "react";

// Same env-based API URL used elsewhere in the app (local vs production).
const API = import.meta.env.VITE_API_URL;
// const API = "http://localhost:4000";   -- IGNORE ---

// Reward "type" -> badge color, purely presentational.
const TYPE_STYLES = {
  PERCENTAGE_DISCOUNT: "bg-purple-50 text-purple-700",
  FIXED_DISCOUNT: "bg-amber-50 text-amber-700",
  FREE_SHIPPING: "bg-green-50 text-green-700",
  FREE_PRODUCT: "bg-gray-100 text-gray-500",
};
const TYPE_LABELS = {
  PERCENTAGE_DISCOUNT: "% Discount",
  FIXED_DISCOUNT: "Fixed Discount",
  FREE_SHIPPING: "Free Shipping",
  FREE_PRODUCT: "Free Product",
};

// Simple tier thresholds just for the "progress to next tier" bar.
// This is a DISPLAY-ONLY estimate — it does not change the customer's actual tier in the database.
const TIER_THRESHOLDS = [
  { name: "Silver", min: 1000 },
  { name: "Gold", min: 5000 },
  { name: "Platinum", min: 15000 },
  { name: "Platinum+", min: 20000 },
];

function getNextTierInfo(lifetimePoints) {
  const next = TIER_THRESHOLDS.find((t) => lifetimePoints < t.min);
  if (!next) return null; // already at the top tier we track
  const prevMin = [...TIER_THRESHOLDS].reverse().find((t) => t.min <= lifetimePoints)?.min || 0;
  const progress = Math.min(
    100,
    Math.round(((lifetimePoints - prevMin) / (next.min - prevMin)) * 100)
  );
  return { label: next.name, pointsNeeded: next.min - lifetimePoints, progress };
}

function CustomerView() {
  const customerId = 1; // Hardcoded for now — will come from real customer login later

  const [customer, setCustomer] = useState(null);
  const [rewards, setRewards] = useState([]);
  const [transactions, setTransactions] = useState([]);

  // Redeem flow state — separate from page-load state so redeeming doesn't blank the whole page
  const [redeeming, setRedeeming] = useState(null); // which reward id is being redeemed right now
  const [lastRedeemedCode, setLastRedeemedCode] = useState(""); // shown clearly after a successful redeem
  const [message, setMessage] = useState(""); // success or error text

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadCustomer = () => {
    return Promise.all([
      fetch(`${API}/api/customers/${customerId}`).then((res) => res.json()),
      fetch(`${API}/api/customers/${customerId}/transactions`).then((res) => res.json()),
    ]).then(([customerData, transactionsData]) => {
      setCustomer(customerData);
      setTransactions(transactionsData);
    });
  };

  useEffect(() => {
    setLoading(true);
    setError("");
    Promise.all([loadCustomer(), fetch(`${API}/api/rewards`).then((res) => res.json()).then(setRewards)])
      .catch(() => setError("Couldn't load your dashboard right now. Please refresh."))
      .finally(() => setLoading(false));
  }, []);

  const redeem = async (rewardId) => {
    setMessage("");
    setLastRedeemedCode("");
    setRedeeming(rewardId);

    try {
      const res = await fetch(`${API}/api/redemption`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, rewardId }),
      });
      const data = await res.json();

      if (data.error) {
        setMessage(data.error);
      } else {
        // Show the generated discount code clearly — this is what the customer
        // actually needs to copy and use at Shopify checkout.
        setLastRedeemedCode(data.redemption.generatedCode);
        setMessage("Reward redeemed! Copy your code below and use it at checkout.");
        await loadCustomer();
      }
    } catch {
      setMessage("Something went wrong while redeeming. Please try again.");
    } finally {
      setRedeeming(null);
    }
  };

  if (loading) {
    return <p className="p-8 text-gray-400">Loading your dashboard…</p>;
  }

  if (error) {
    return <div className="p-8 text-red-600 bg-red-50 rounded-lg m-8">{error}</div>;
  }

  if (!customer) {
    return <p className="p-8 text-gray-400">No customer data found.</p>;
  }

  const nextTier = getNextTierInfo(customer.lifetimePoints);

  return (
    <div className="max-w-4xl p-8 mx-auto">
      {/* Dark header banner — welcome + current balance, matches the mock's hero section */}
      <div className="bg-gray-900 text-white rounded-xl p-6 mb-4 flex justify-between items-center flex-wrap gap-4">
        <div>
          <div className="text-xs text-gray-400">Welcome back</div>
          <div className="text-2xl font-bold mt-1">{customer.name}</div>
          <div className="text-xs text-amber-400 mt-2">● {customer.tier} member</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400">Current balance</div>
          <div className="text-4xl font-bold text-amber-400">{customer.currentPoints} pts</div>
        </div>
      </div>

      {/* Stat cards: lifetime / redeemed / next tier progress */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Lifetime points" value={customer.lifetimePoints.toLocaleString()} />
        <StatCard label="Redeemed points" value={customer.redeemedPoints.toLocaleString()} />
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-xs text-gray-500">Next tier</div>
          {nextTier ? (
            <>
              <div className="text-sm font-semibold text-gray-900 mt-2">
                {nextTier.pointsNeeded.toLocaleString()} pts to {nextTier.label}
              </div>
              <div className="w-full h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full"
                  style={{ width: `${nextTier.progress}%` }}
                />
              </div>
            </>
          ) : (
            <div className="text-sm font-semibold text-gray-900 mt-2">Top tier reached 🎉</div>
          )}
        </div>
      </div>

      {/* Redeem feedback — success (with code) or error, right above the rewards so it's not missed */}
      {message && (
        <div
          className={`text-sm p-3 rounded-lg mb-4 ${
            lastRedeemedCode ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
          }`}
        >
          <div>{message}</div>
          {lastRedeemedCode && (
            <div className="mt-2 font-mono text-base font-semibold tracking-wide bg-white border border-green-200 rounded px-3 py-1 inline-block">
              {lastRedeemedCode}
            </div>
          )}
        </div>
      )}

      {/* Available rewards */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h3 className="font-semibold text-gray-900">Available rewards</h3>
        <p className="text-xs text-gray-500 mb-4">Redeem your points</p>

        {rewards.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-sm">No rewards available right now.</div>
        ) : (
          <div className="grid grid-cols-4 gap-3">
            {rewards.map((reward) => {
              const canAfford = customer.currentPoints >= reward.pointsCost;
              const isRedeemingThis = redeeming === reward.id;
              return (
                <div
                  key={reward.id}
                  className={`border border-gray-200 rounded-lg p-3 ${!canAfford ? "opacity-50" : ""}`}
                >
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded-full ${
                      TYPE_STYLES[reward.type] || "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {TYPE_LABELS[reward.type] || reward.type}
                  </span>
                  <div className="text-sm font-semibold text-gray-900 mt-2">{reward.name}</div>
                  <div className="text-xs text-gray-500 mb-3">{reward.pointsCost} pts</div>
                  <button
                    onClick={() => redeem(reward.id)}
                    disabled={!canAfford || isRedeemingThis}
                    className="w-full bg-amber-600 text-white text-sm py-1.5 rounded-md hover:bg-amber-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
                  >
                    {isRedeemingThis ? "Redeeming…" : canAfford ? "Redeem" : "Not enough points"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Transaction history */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h3 className="font-semibold text-gray-900 mb-4">Transaction history</h3>
        {transactions.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-sm">No transactions yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="py-2">Date</th>
                <th className="py-2">Description</th>
                <th className="py-2">Points</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-b border-gray-50 last:border-none">
                  <td className="py-2 text-gray-500">
                    {new Date(t.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-2">{t.note}</td>
                  <td className={`py-2 font-medium ${t.points > 0 ? "text-green-600" : "text-red-600"}`}>
                    {t.points > 0 ? "+" : ""}
                    {t.points} pts
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

// Small reusable stat card, same pattern used elsewhere in the app.
function StatCard({ label, value }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
    </div>
  );
}

export default CustomerView;
