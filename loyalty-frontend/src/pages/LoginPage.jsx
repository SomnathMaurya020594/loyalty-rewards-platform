// File: LoginPage.jsx


import { useState } from "react";
import { useNavigate } from "react-router-dom";

const API = import.meta.env.VITE_API_URL;

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate(); // page redirect karne ke liye

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    const res = await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (data.token) {
  localStorage.setItem("token", data.token);
  window.location.href = "/";   // navigate() ki jagah, poora reload
} else {
  setError(data.error || "Login failed");
}
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form
        onSubmit={handleLogin}
        className="bg-white border border-gray-200 rounded-lg p-8 w-full max-w-sm"
      >
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Merchant Login</h1>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm p-2 rounded-md mb-4">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label className="text-xs text-gray-500">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-md px-3 py-2 mt-1"
          />
        </div>

        <div className="mb-6">
          <label className="text-xs text-gray-500">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-md px-3 py-2 mt-1"
          />
        </div>

        <button
          type="submit"
          className="w-full bg-purple-600 text-white py-2 rounded-md font-medium hover:bg-purple-700"
        >
          Login
        </button>
      </form>
    </div>
  );
}

export default LoginPage;