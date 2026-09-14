// File: api.js
// Kya hai: Har protected API call mein automatically token add karne wala helper
// Kaha use hota hai: RulesPage, RewardsPage, CustomersPage, App.jsx (Dashboard) mein


const API = import.meta.env.VITE_API_URL;

export async function authFetch(path, options = {}) {
  const token = localStorage.getItem("token");

  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  });

  // Agar token expire/invalid ho gaya, seedha login page pe bhej do
  if (res.status === 401) {
    localStorage.removeItem("token");
    window.location.href = "/login";
    return null;
  }

  return res;
}

export { API };