// File: prisma/seed.js
// Kya hai: Ek command se saare purane test-data wapas daal deta hai
// (naya Postgres DB khaali hai, ye script usko fill karta hai)
// Kaise chalayein: node prisma/seed.js

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("Seeding loyalty rules...");
  await prisma.loyaltyRule.createMany({
    data: [
      { name: "Purchase", points: 10, isActive: true },   // har ₹100 spend pe 10 pts (webhook ke andar formula hai)
      { name: "Signup", points: 100, isActive: true },
      { name: "Birthday", points: 200, isActive: true },
      { name: "Review", points: 50, isActive: false },
      { name: "Referral", points: 300, isActive: true },
    ],
  });

  console.log("Seeding rewards...");
  await prisma.reward.createMany({
    data: [
      { name: "10% off order", type: "PERCENTAGE_DISCOUNT", pointsCost: 500, isActive: true },
      { name: "₹150 flat off", type: "FIXED_DISCOUNT", pointsCost: 350, isActive: true },
      { name: "Free shipping", type: "FREE_SHIPPING", pointsCost: 200, isActive: true },
      { name: "Free product — Mini Balm", type: "FREE_PRODUCT", pointsCost: 800, isActive: false },
    ],
  });

  console.log("Seeding a test customer...");
  await prisma.customer.create({
    data: {
      name: "Ananya Rao",
      email: "ananya@example.com",
      currentPoints: 4120,
      lifetimePoints: 18900,
      redeemedPoints: 14780,
      tier: "Platinum",
      // shopifyCustomerId jaan-bujhkar khaali chhoda hai — real webhook se aata hai,
      // manually set karna ho to Prisma Studio se ek real Shopify customer ID daal dena.
    },
  });

  console.log("Done. Seed data inserted into Postgres.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });