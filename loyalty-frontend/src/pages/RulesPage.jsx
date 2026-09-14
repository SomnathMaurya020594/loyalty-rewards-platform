// File: RulesPage.jsx
// Kya hai: Loyalty Rules ka poora management page — Create, Edit, Delete, Toggle
// Kaha use hota hai: App.jsx mein "/rules" route pe

import { useState, useEffect } from "react";
import { authFetch } from "../utils/api";

const API = import.meta.env.VITE_API_URL;

function RulesPage() {
  const [rules, setRules] = useState([]);
  const [name, setName] = useState("");
  const [points, setPoints] = useState("");
  const [editingId, setEditingId] = useState(null); // null = naya add kar rahe, number = edit kar rahe

const loadRules = () => {
  authFetch("/api/rules").then((res) => res && res.json()).then(setRules);
};
  useEffect(() => {
    loadRules();
  }, []);

  // Add YA Edit — dono isी function se handle honge
  const handleSubmit = async (e) => {
    e.preventDefault(); // form ka default "page reload" rokta hai

 if (editingId) {
  await authFetch(`/api/rules/${editingId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, points: Number(points) }),
  });
} else {
  await authFetch("/api/rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, points: Number(points) }),
  });
}

    setName("");
    setPoints("");
    setEditingId(null);
    loadRules();
  };

  const startEdit = (rule) => {
    setEditingId(rule.id);
    setName(rule.name);
    setPoints(rule.points);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName("");
    setPoints("");
  };

const toggleRule = async (id) => {
  await authFetch(`/api/rules/${id}/toggle`, { method: "PATCH" });
  loadRules();
};
const deleteRule = async (id) => {
  if (!confirm("Delete this rule?")) return;
  await authFetch(`/api/rules/${id}`, { method: "DELETE" });
  loadRules();
};

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Loyalty Rules</h1>

      {/* Add/Edit Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-gray-200 rounded-lg p-5 mb-6 flex gap-3 items-end"
      >
        <div className="flex-1">
          <label className="text-xs text-gray-500">Rule Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-md px-3 py-2 mt-1"
            placeholder="e.g. Review"
          />
        </div>
        <div className="w-32">
          <label className="text-xs text-gray-500">Points</label>
          <input
            type="number"
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-md px-3 py-2 mt-1"
            placeholder="50"
          />
        </div>
        <button
          type="submit"
          className="bg-purple-600 text-white px-4 py-2 rounded-md font-medium hover:bg-purple-700"
        >
          {editingId ? "Update" : "+ Add Rule"}
        </button>
        {editingId && (
          <button
            type="button"
            onClick={cancelEdit}
            className="text-gray-500 px-3 py-2"
          >
            Cancel
          </button>
        )}
      </form>

      {/* Rules List */}
      <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
        {rules.map((rule) => (
          <div key={rule.id} className="flex justify-between items-center p-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => toggleRule(rule.id)}
                className={`w-10 h-6 rounded-full transition-colors ${
                  rule.isActive ? "bg-purple-600" : "bg-gray-300"
                }`}
              >
                <div
                  className={`w-4 h-4 bg-white rounded-full transition-transform ${
                    rule.isActive ? "translate-x-5" : "translate-x-1"
                  }`}
                />
              </button>
              <span className={rule.isActive ? "text-gray-900" : "text-gray-400"}>
                {rule.name}
              </span>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-purple-600 font-medium">{rule.points} pts</span>
              <button onClick={() => startEdit(rule)} className="text-sm text-blue-600">
                Edit
              </button>
              <button onClick={() => deleteRule(rule.id)} className="text-sm text-red-600">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default RulesPage;