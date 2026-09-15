// File: RewardsPage.jsx


import { useState, useEffect } from "react";
import { authFetch } from "../utils/api";

const API = import.meta.env.VITE_API_URL;

const REWARD_TYPES = [
  "PERCENTAGE_DISCOUNT",
  "FIXED_DISCOUNT",
  "FREE_SHIPPING",
  "FREE_PRODUCT",
];

function RewardsPage() {
  const [rewards, setRewards] = useState([]);
  const [name, setName] = useState("");
  const [type, setType] = useState(REWARD_TYPES[0]);
  const [pointsCost, setPointsCost] = useState("");
  const [editingId, setEditingId] = useState(null);

const loadRewards = () => {
  authFetch("/api/rewards").then((res) => res && res.json()).then(setRewards);
};

  useEffect(() => {
    loadRewards();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const body = JSON.stringify({ name, type, pointsCost: Number(pointsCost) });

if (editingId) {
  await authFetch(`/api/rewards/${editingId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body,
  });
} else {
  await authFetch("/api/rewards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

    setName("");
    setType(REWARD_TYPES[0]);
    setPointsCost("");
    setEditingId(null);
    loadRewards();
  };

  const startEdit = (reward) => {
    setEditingId(reward.id);
    setName(reward.name);
    setType(reward.type);
    setPointsCost(reward.pointsCost);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName("");
    setType(REWARD_TYPES[0]);
    setPointsCost("");
  };

  const toggleReward = async (id) => {
  await authFetch(`/api/rewards/${id}/toggle`, { method: "PATCH" });
  loadRewards();
};

  const deleteReward = async (id) => {
  if (!confirm("Delete this reward?")) return;
  await authFetch(`/api/rewards/${id}`, { method: "DELETE" });
  loadRewards();
};

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Rewards</h1>

      {/* Add/Edit Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-gray-200 rounded-lg p-5 mb-6 flex gap-3 items-end flex-wrap"
      >
        <div className="flex-1 min-w-[160px]">
          <label className="text-xs text-gray-500">Reward Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-md px-3 py-2 mt-1"
            placeholder="e.g. Free Sample"
          />
        </div>

        <div className="min-w-[180px]">
          <label className="text-xs text-gray-500">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 mt-1"
          >
            {REWARD_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="w-32">
          <label className="text-xs text-gray-500">Points Cost</label>
          <input
            type="number"
            value={pointsCost}
            onChange={(e) => setPointsCost(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-md px-3 py-2 mt-1"
            placeholder="500"
          />
        </div>

        <button
          type="submit"
          className="bg-purple-600 text-white px-4 py-2 rounded-md font-medium hover:bg-purple-700"
        >
          {editingId ? "Update" : "+ Add Reward"}
        </button>
        {editingId && (
          <button type="button" onClick={cancelEdit} className="text-gray-500 px-3 py-2">
            Cancel
          </button>
        )}
      </form>

      {/* Rewards List */}
      <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
        {rewards.map((reward) => (
          <div key={reward.id} className="flex justify-between items-center p-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => toggleReward(reward.id)}
                className={`w-10 h-6 rounded-full transition-colors ${
                  reward.isActive ? "bg-purple-600" : "bg-gray-300"
                }`}
              >
                <div
                  className={`w-4 h-4 bg-white rounded-full transition-transform ${
                    reward.isActive ? "translate-x-5" : "translate-x-1"
                  }`}
                />
              </button>
              <div>
                <div className={reward.isActive ? "text-gray-900" : "text-gray-400"}>
                  {reward.name}
                </div>
                <div className="text-xs text-gray-400">{reward.type}</div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-purple-600 font-medium">{reward.pointsCost} pts</span>
              <button onClick={() => startEdit(reward)} className="text-sm text-blue-600">
                Edit
              </button>
              <button onClick={() => deleteReward(reward.id)} className="text-sm text-red-600">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default RewardsPage;