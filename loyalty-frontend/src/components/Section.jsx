// File: Section.jsx
// Kya hai: Ek safed card jo ek title + andar ka content dikhata hai (wrapper)
// Kaha use hota hai: Har page mein (Rules, Rewards, Customers, CustomerView)

function Section({ title, children }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export default Section;