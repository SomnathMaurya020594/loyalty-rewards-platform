// File: TiersPage.jsx
// Kya hai: Merchant yahan loyalty tiers configure karta hai — Create, Edit, Delete, Enable/Disable.
// Bilkul RulesPage.jsx jaisa hi CRUD pattern hai, bas "points" ki jagah "minPoints" hai.
//
// Kaha use hota hai: App.jsx mein "/tiers" route pe.

import { useState, useEffect } from "react";
import { authFetch } from "../utils/api";

function TiersPage() {
  const [tiers, setTiers] = useState([]);
  const [name, setName] = useState("");
  const [minPoints, setMinPoints] = useState("");
  const [editingId, setEditingId] = useState(null); // null = creating new, else = editing this tier's id
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadTiers = () => {
    setLoading(true);
    authFetch("/api/tiers")
      .then((res) => (res ? res.json() : []))
      .then(setTiers)
      .catch(() => setError("Couldn't load tiers."))
      .finally(() => setLoading(false));
  };

  useEffect(loadTiers, []);

  const resetForm = () => {
    setName("");
    setMinPoints("");
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || minPoints === "") return;

    setError("");
    try {
      const isEditing = editingId !== null;
      const res = await authFetch(isEditing ? `/api/tiers/${editingId}` : "/api/tiers", {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, minPoints }),
      });
      if (!res.ok) throw new Error();
      resetForm();
      loadTiers();
    } catch {
      setError(editingId ? "Couldn't update the tier." : "Couldn't save the tier.");
    }
  };

  // Fills the form with an existing tier's values so the merchant can change and re-submit.
  const startEdit = (tier) => {
    setEditingId(tier.id);
    setName(tier.name);
    setMinPoints(String(tier.minPoints));
  };

  const toggleTier = async (id) => {
    await authFetch(`/api/tiers/${id}/toggle`, { method: "PATCH" });
    loadTiers();
  };

  const deleteTier = async (id) => {
    if (!window.confirm("Delete this tier? Customers already at this tier keep their current tier name until it's recalculated.")) {
      return;
    }
    await authFetch(`/api/tiers/${id}`, { method: "DELETE" });
    if (editingId === id) resetForm();
    loadTiers();
  };

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-1">Loyalty Tiers</h1>
      <p className="text-sm text-gray-500 mb-6">
        Configure how many lifetime points a customer needs to reach each tier.
        Tiers are applied automatically the next time a customer earns points —
        unless a customer's tier has been manually set on the Customers page.
      </p>

      {/* Create/Edit form — same form is reused for both, label changes based on editingId */}
      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-4 mb-6 flex gap-3 items-end">
        <div className="flex-1">
          <label className="text-xs text-gray-500 block mb-1">Tier Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Gold"
            className="w-full border border-gray-300 rounded-md px-3 py-2"
          />
        </div>
        <div className="w-40">
          <label className="text-xs text-gray-500 block mb-1">Min Lifetime Points</label>
          <input
            type="number"
            value={minPoints}
            onChange={(e) => setMinPoints(e.target.value)}
            placeholder="5000"
            className="w-full border border-gray-300 rounded-md px-3 py-2"
          />
        </div>
        <button
          type="submit"
          className="bg-purple-600 text-white px-4 py-2 rounded-md font-medium hover:bg-purple-700"
        >
          {editingId ? "Save Changes" : "+ Add Tier"}
        </button>
        {editingId && (
          <button
            type="button"
            onClick={resetForm}
            className="text-gray-500 px-3 py-2 text-sm"
          >
            Cancel
          </button>
        )}
      </form>

      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>}

      {/* List, ordered lowest threshold first so it reads like a ladder */}
      <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
        {loading ? (
          <div className="p-6 text-center text-gray-400">Loading tiers…</div>
        ) : tiers.length === 0 ? (
          <div className="p-6 text-center text-gray-400">
            No tiers configured yet — every customer defaults to "Bronze" until you add some.
          </div>
        ) : (
          [...tiers]
            .sort((a, b) => a.minPoints - b.minPoints)
            .map((t) => (
              <div
                key={t.id}
                className={`flex items-center gap-4 p-4 ${!t.isActive ? "opacity-40" : ""} ${
                  editingId === t.id ? "bg-purple-50" : ""
                }`}
              >
                <button
                  onClick={() => toggleTier(t.id)}
                  className={`w-9 h-5 rounded-full relative transition-colors ${t.isActive ? "bg-purple-600" : "bg-gray-300"}`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${t.isActive ? "left-4" : "left-0.5"}`}
                  />
                </button>
                <div className="flex-1">
                  <span className="font-medium text-gray-900">{t.name}</span>
                </div>
                <span className="text-purple-600 font-medium text-sm">{t.minPoints.toLocaleString()}+ pts</span>
                <button className="text-blue-600 text-sm" onClick={() => startEdit(t)}>Edit</button>
                <button className="text-red-600 text-sm" onClick={() => deleteTier(t.id)}>Delete</button>
              </div>
            ))
        )}
      </div>
    </div>
  );
}

export default TiersPage;
