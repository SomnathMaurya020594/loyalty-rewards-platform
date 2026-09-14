// File: Row.jsx
// Kya hai: Ek simple row — left side text, right side text (jaise "Purchase — 10 pts")
// Kaha use hota hai: Rules, Rewards, Customers, Transaction history mein

function Row({ left, right }) {
  return (
    <div className="flex justify-between items-center border-b border-gray-100 pb-2">
      <span className="text-gray-800">{left}</span>
      <span className="text-purple-600 font-medium">{right}</span>
    </div>
  );
}

export default Row;