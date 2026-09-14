// File: CustomerView.jsx
// Kya hai: Customer-facing dashboard — apne points, tier, rewards, aur history dekhne ke liye
// Kaha use hota hai: App.jsx mein "/customer" route pe

import { useState, useEffect } from "react";
import Section from "../components/Section";
import Row from "../components/Row";

const API = import.meta.env.VITE_API_URL;

function CustomerView() {
  const customerId = 1; // Abhi hardcoded — baad mein login se aayega

  const [customer, setCustomer] = useState(null);
  const [rewards, setRewards] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [message, setMessage] = useState("");

  const loadCustomer = () => {
    fetch(`${API}/api/customers/${customerId}`).then((res) => res.json()).then(setCustomer);
    fetch(`${API}/api/customers/${customerId}/transactions`).then((res) => res.json()).then(setTransactions);
  };

  useEffect(() => {
    loadCustomer();
    fetch(`${API}/api/rewards`).then((res) => res.json()).then(setRewards);
  }, []);

  const redeem = async (rewardId) => {
    const res = await fetch(`${API}/api/redemption`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, rewardId }),
    });
    const data = await res.json();

    if (data.error) {
      setMessage(data.error);
    } else {
      setMessage(`Redeemed! Code: ${data.redemption.generatedCode}`);
      loadCustomer();
    }
  };

  if (!customer) return <p className="p-8">Loading...</p>;

  return (
    <div className="max-w-2xl p-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Customer Dashboard</h1>

      {/* Points Summary */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <div className="text-sm text-gray-500 uppercase">Current Balance</div>
        <div className="text-4xl font-bold text-gray-900">{customer.currentPoints} pts</div>
        <div className="text-sm text-purple-600 font-medium mt-1">{customer.tier} Tier</div>
        <div className="flex gap-6 mt-4 pt-4 border-t border-gray-100 text-sm text-gray-600">
          <span>Lifetime: {customer.lifetimePoints} pts</span>
          <span>Redeemed: {customer.redeemedPoints} pts</span>
        </div>
      </div>

      {message && (
        <div className="bg-purple-50 text-purple-700 text-sm p-3 rounded-lg mb-6">
          {message}
        </div>
      )}

      <Section title="Available Rewards">
        {rewards.map((reward) => (
          <div key={reward.id} className="flex justify-between items-center border-b border-gray-100 pb-2">
            <span>{reward.name} — {reward.pointsCost} pts</span>
            <button
              onClick={() => redeem(reward.id)}
              className="bg-purple-600 text-white text-sm px-3 py-1 rounded-md hover:bg-purple-700"
            >
              Redeem
            </button>
          </div>
        ))}
      </Section>

      <div className="mt-6">
        <Section title="Transaction History">
          {transactions.map((t) => (
            <Row key={t.id} left={t.note} right={`${t.points > 0 ? "+" : ""}${t.points} pts`} />
          ))}
        </Section>
      </div>
    </div>
  );
}

export default CustomerView;