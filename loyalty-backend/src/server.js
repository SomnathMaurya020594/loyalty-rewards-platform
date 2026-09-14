const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();
const prisma = new PrismaClient();

app.set("trust proxy", 1); 
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf; // raw body ko bhi save kar liya, verification ke liye
  }
}));
app.use(cors());
app.use(helmet());

app.use(cors({
  // origin: process.env.FRONTEND_URL || "http://localhost:5173", // sirf apna frontend allow karo, sab nahi
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
}));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minute
  max: 200,                  // ek IP se max 200 requests / 15 min
  message: { error: "Too many requests, please try again later." },
});
app.use("/api/", apiLimiter);

// Login route pe alag, sakht limit (brute-force se bachne ke liye)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts, try again later." },
});

const PORT = process.env.PORT || 4000;

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "No token provided" });
  }
  const token = authHeader.split(" ")[1];
  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

app.get("/", (req, res) => {
  res.send("Server is running!");
});

app.post("/api/auth/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (email !== process.env.ADMIN_EMAIL) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const isValid = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
  if (!isValid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: "8h" });
  res.json({ token });
});

app.get("/api/rules", requireAuth, async (req, res) => {
  const rules = await prisma.loyaltyRule.findMany();
  res.json(rules);
});

app.post("/api/rules", requireAuth, async (req, res) => {
  const { name, points } = req.body;
  const newRule = await prisma.loyaltyRule.create({ data: { name, points } });
  res.json(newRule);
});

app.put("/api/rules/:id", requireAuth, async (req, res) => {
  const { name, points } = req.body;
  const updated = await prisma.loyaltyRule.update({
    where: { id: Number(req.params.id) },
    data: { name, points },
  });
  res.json(updated);
});

app.patch("/api/rules/:id/toggle", requireAuth, async (req, res) => {
  const rule = await prisma.loyaltyRule.findUnique({ where: { id: Number(req.params.id) } });
  const updated = await prisma.loyaltyRule.update({
    where: { id: Number(req.params.id) },
    data: { isActive: !rule.isActive },
  });
  res.json(updated);
});

app.delete("/api/rules/:id", requireAuth, async (req, res) => {
  await prisma.loyaltyRule.delete({ where: { id: Number(req.params.id) } });
  res.json({ success: true });
});

// GET /api/rewards is PUBLIC — customer dashboard needs to read the catalog
// without a merchant JWT. Only create/edit/delete/toggle stay protected.
app.get("/api/rewards", async (req, res) => {
  const rewards = await prisma.reward.findMany();
  res.json(rewards);
});

app.post("/api/rewards", requireAuth, async (req, res) => {
  const { name, type, pointsCost } = req.body;
  const newReward = await prisma.reward.create({ data: { name, type, pointsCost } });
  res.json(newReward);
});

app.put("/api/rewards/:id", requireAuth, async (req, res) => {
  const { name, type, pointsCost } = req.body;
  const updated = await prisma.reward.update({
    where: { id: Number(req.params.id) },
    data: { name, type, pointsCost },
  });
  res.json(updated);
});

app.patch("/api/rewards/:id/toggle", requireAuth, async (req, res) => {
  const reward = await prisma.reward.findUnique({ where: { id: Number(req.params.id) } });
  const updated = await prisma.reward.update({
    where: { id: Number(req.params.id) },
    data: { isActive: !reward.isActive },
  });
  res.json(updated);
});

app.delete("/api/rewards/:id", requireAuth, async (req, res) => {
  await prisma.reward.delete({ where: { id: Number(req.params.id) } });
  res.json({ success: true });
});

// Add these pieces to backend/src/server.js

// ─────────────────────────────────────────────────────────────
// 1. TIER MANAGEMENT ROUTES (merchant-only, same pattern as rules/rewards)
// Add these anywhere among the other route definitions.
// ─────────────────────────────────────────────────────────────

app.get("/api/tiers", requireAuth, async (req, res) => {
  // Ordered by minPoints so the merchant sees them low-to-high, and so the
  // dynamic calculator below can rely on this same order.
  const tiers = await prisma.tier.findMany({ orderBy: { minPoints: "asc" } });
  res.json(tiers);
});

app.post("/api/tiers", requireAuth, async (req, res) => {
  const { name, minPoints } = req.body;
  const newTier = await prisma.tier.create({ data: { name, minPoints: Number(minPoints) } });
  res.json(newTier);
});

app.put("/api/tiers/:id", requireAuth, async (req, res) => {
  const { name, minPoints } = req.body;
  const updated = await prisma.tier.update({
    where: { id: Number(req.params.id) },
    data: { name, minPoints: Number(minPoints) },
  });
  res.json(updated);
});

app.patch("/api/tiers/:id/toggle", requireAuth, async (req, res) => {
  const tier = await prisma.tier.findUnique({ where: { id: Number(req.params.id) } });
  const updated = await prisma.tier.update({
    where: { id: Number(req.params.id) },
    data: { isActive: !tier.isActive },
  });
  res.json(updated);
});

app.delete("/api/tiers/:id", requireAuth, async (req, res) => {
  await prisma.tier.delete({ where: { id: Number(req.params.id) } });
  res.json({ success: true });
});

// Merchant manually pins a customer's tier — this also locks it, so the
// automatic calculation below will skip that customer from then on.
app.patch("/api/customers/:id/tier", requireAuth, async (req, res) => {
  const { tier, locked } = req.body;
  const updated = await prisma.customer.update({
    where: { id: Number(req.params.id) },
    data: { tier, tierLocked: locked ?? true },
  });
  res.json(updated);
});

// Merchant can unlock a customer's tier to let automatic calculation take over again.
app.patch("/api/customers/:id/tier/unlock", requireAuth, async (req, res) => {
  const updated = await prisma.customer.update({
    where: { id: Number(req.params.id) },
    data: { tierLocked: false },
  });
  res.json(updated);
});

// ─────────────────────────────────────────────────────────────
// 2. DYNAMIC TIER CALCULATION — reads from the Tier table instead of
// hardcoded thresholds. Called from the orders-paid webhook.
// Add this function near createShopifyDiscountCode, above the webhook route.
// ─────────────────────────────────────────────────────────────

async function calculateTierFromDb(lifetimePoints) {
  // All active tiers, lowest threshold first.
  const tiers = await prisma.tier.findMany({
    where: { isActive: true },
    orderBy: { minPoints: "asc" },
  });

  // Walk through and keep the highest tier the customer already qualifies for.
  // If no tiers are configured yet, fall back to "Bronze" so nothing breaks.
  let matched = "Bronze";
  for (const t of tiers) {
    if (lifetimePoints >= t.minPoints) {
      matched = t.name;
    }
  }
  return matched;
}

// ─────────────────────────────────────────────────────────────
// 3. WEBHOOK CHANGE — inside /webhooks/orders-paid, where the customer's
// points are updated, replace that block with this:
// ─────────────────────────────────────────────────────────────

/*
    const newLifetimePoints = customer.lifetimePoints + pointsEarned;

    // Only auto-update the tier if the merchant hasn't manually locked it.
    const newTier = customer.tierLocked
      ? customer.tier
      : await calculateTierFromDb(newLifetimePoints);

    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        currentPoints: customer.currentPoints + pointsEarned,
        lifetimePoints: newLifetimePoints,
        tier: newTier,
      },
    });
*/

app.get("/api/customers", requireAuth, async (req, res) => {
  const { search, tier } = req.query;
  const customers = await prisma.customer.findMany({
    where: {
      AND: [
        search
          ? { OR: [{ name: { contains: search } }, { email: { contains: search } }] }
          : {},
        tier ? { tier } : {},
      ],
    },
  });
  res.json(customers);
});

app.post("/api/customers", requireAuth, async (req, res) => {
  const { name, email } = req.body;
  const newCustomer = await prisma.customer.create({ data: { name, email } });
  res.json(newCustomer);
});

app.get("/api/customers/:id", async (req, res) => {
  const customer = await prisma.customer.findUnique({
    where: { id: Number(req.params.id) },
  });
  res.json(customer);
});

app.get("/api/customers/:id/transactions", async (req, res) => {
  const transactions = await prisma.transaction.findMany({
    where: { customerId: Number(req.params.id) },
    orderBy: { createdAt: "desc" },
  });
  res.json(transactions);
});

// NEW — "kis customer ne kaunsa code liya" ka lookup.
// Merchant ke liye: reward code se poora redemption + customer + reward detail milta hai.
app.get("/api/redemptions/:code", requireAuth, async (req, res) => {
  const redemption = await prisma.rewardRedemption.findFirst({
    where: { generatedCode: req.params.code },
    include: { customer: true, reward: true },
  });
  if (!redemption) return res.status(404).json({ error: "Code not found" });
  res.json(redemption);
});

// NEW — merchant dashboard ke "recent redemptions" table ke liye poori list, latest pehle.
app.get("/api/redemptions", requireAuth, async (req, res) => {
  const redemptions = await prisma.rewardRedemption.findMany({
    include: { customer: true, reward: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json(redemptions);
});

app.post("/api/redemption", async (req, res) => {
  const { customerId, rewardId } = req.body;

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  const reward = await prisma.reward.findUnique({ where: { id: rewardId } });

  if (!customer) return res.status(404).json({ error: "Customer not found" });
  if (!reward) return res.status(404).json({ error: "Reward not found" });
  if (customer.currentPoints < reward.pointsCost) {
    return res.status(400).json({ error: "Not enough points" });
  }

  // Real Shopify discount code banane ki koshish karo — is specific customer ke liye locked
  let code;
  try {
    code = await createShopifyDiscountCode(reward, customer.shopifyCustomerId);
  } catch (err) {
    console.log("Shopify discount creation failed, using fallback code:", err.message);
    code = "LOOP-" + Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  const updatedCustomer = await prisma.customer.update({
    where: { id: customerId },
    data: {
      currentPoints: customer.currentPoints - reward.pointsCost,
      redeemedPoints: customer.redeemedPoints + reward.pointsCost,
    },
  });

  const redemption = await prisma.rewardRedemption.create({
    data: {
      customerId,
      rewardId,
      pointsSpent: reward.pointsCost,
      generatedCode: code,
      status: "PENDING", // checkout pe actually use hone ke baad webhook se "APPLIED" hoga
    },
  });

  res.json({ redemption, remainingPoints: updatedCustomer.currentPoints });
});

// Helper function — Shopify Admin GraphQL se real discount code banata hai.
// Agar shopifyCustomerId diya gaya hai to code sirf usi customer ke liye lock hota hai —
// warna koi bhi cart mein daal kar use kar lega.
async function createShopifyDiscountCode(reward, shopifyCustomerId) {
  const code = "LOOP-" + Math.random().toString(36).substring(2, 8).toUpperCase();

  // Percentage discount ke liye value 0-1 ke beech chahiye (0.10 = 10%)
  const percentage = reward.type === "PERCENTAGE_DISCOUNT" ? (reward.value || 10) / 100 : 0.1;

  const customerSelection = shopifyCustomerId
    ? { customers: { add: [`gid://shopify/Customer/${shopifyCustomerId}`] } }
    : { all: true }; // fallback — customer ka Shopify ID pata nahi to sabke liye khula rehta hai

  const mutation = `
    mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
        codeDiscountNode { id }
        userErrors { field message }
      }
    }
  `;

  const variables = {
    basicCodeDiscount: {
      title: `Loyalty Redemption - ${code}`,
      code: code,
      startsAt: new Date().toISOString(),
      customerSelection,
      customerGets: {
        value: { percentage: percentage },
        items: { all: true },
      },
      appliesOncePerCustomer: true,
      usageLimit: 1,
    },
  };

  const response = await fetch(
    `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2026-07/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
      },
      body: JSON.stringify({ query: mutation, variables }),
    }
  );

  const data = await response.json();

  if (data.data?.discountCodeBasicCreate?.userErrors?.length > 0) {
    throw new Error(data.data.discountCodeBasicCreate.userErrors[0].message);
  }

  return code;
}

const processedWebhooks = [];

app.post("/webhooks/orders-paid", async (req, res) => {
  // Step 0: HMAC signature verify karo (confirm Shopify se hi aaya hai)
  const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
  const generatedHash = crypto
    .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(req.rawBody)
    .digest("base64");

  if (generatedHash !== hmacHeader) {
    console.log("Webhook verification FAILED — rejecting");
    return res.status(401).send("Unauthorized");
  }

  console.log("Webhook verified! Real Shopify order received:", req.body);

  const webhookId = req.get("X-Shopify-Webhook-Id") || `sim-${Date.now()}`;

  if (processedWebhooks.includes(webhookId)) {
    return res.json({ status: "duplicate_ignored" });
  }

  const shopifyCustomerId = req.body.customer?.id;
  const orderId = req.body.id;
  const totalPrice = parseFloat(req.body.total_price);

  const purchaseRule = await prisma.loyaltyRule.findFirst({
    where: { name: "Purchase", isActive: true },
  });

  if (shopifyCustomerId && purchaseRule && !isNaN(totalPrice)) {
    const pointsEarned = Math.floor(totalPrice / 100) * purchaseRule.points;

    let customer = await prisma.customer.findUnique({
      where: { shopifyCustomerId: String(shopifyCustomerId) },
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          shopifyCustomerId: String(shopifyCustomerId),
          name: `${req.body.customer?.first_name || "Shopify"} ${req.body.customer?.last_name || "Customer"}`,
          email: req.body.customer?.email || `customer-${shopifyCustomerId}@unknown.com`,
        },
      });
    }

    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        currentPoints: customer.currentPoints + pointsEarned,
        lifetimePoints: customer.lifetimePoints + pointsEarned,
      },
    });

    await prisma.transaction.create({
      data: {
        customerId: customer.id,
        type: "EARN",
        points: pointsEarned,
        note: `Order #${orderId} — ₹${totalPrice}`,
      },
    });

    console.log(`Awarded ${pointsEarned} points to ${customer.name}`);
  }

  // NEW — is order mein koi loyalty discount code use hua tha kya?
  // Shopify order payload "discount_codes" array bhejta hai jisme customer ne
  // checkout pe jo code type kiya wo hota hai. Match karke apni DB mein "APPLIED" mark karo.
  const usedCodes = (req.body.discount_codes || []).map((d) => d.code);

  for (const usedCode of usedCodes) {
    const redemption = await prisma.rewardRedemption.findFirst({
      where: { generatedCode: usedCode, status: "PENDING" },
    });
    if (redemption) {
      await prisma.rewardRedemption.update({
        where: { id: redemption.id },
        data: { status: "APPLIED", orderId: String(orderId) },
      });
      console.log(`Redemption ${usedCode} marked APPLIED on order #${orderId}`);
    }
  }

  processedWebhooks.push(webhookId);
  res.json({ status: "processed" });
});

app.get("/api/analytics/summary", requireAuth, async (req, res) => {
  const customers = await prisma.customer.findMany();
  const rules = await prisma.loyaltyRule.findMany({ where: { isActive: true } });

  const totalMembers = customers.length;
  const totalPointsIssued = customers.reduce((sum, c) => sum + c.lifetimePoints, 0);
  const totalPointsRedeemed = customers.reduce((sum, c) => sum + c.redeemedPoints, 0);
  const activeCampaigns = rules.length;
  const redemptionRate =
    totalPointsIssued > 0 ? ((totalPointsRedeemed / totalPointsIssued) * 100).toFixed(1) : 0;

  res.json({
    totalMembers,
    totalPointsIssued,
    totalPointsRedeemed,
    activeCampaigns,
    redemptionRate: Number(redemptionRate),
  });
});

app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});