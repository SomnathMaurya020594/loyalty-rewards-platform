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

async function logActivity(type, event, detail = "") {
  try {
    await prisma.activityLog.create({ data: { type, event, detail: String(detail).slice(0, 500) } });
  } catch (err) {
    console.error("Failed to write activity log:", err.message);
  }
}

app.set("trust proxy", 1);

app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf; // raw body ko bhi save kar liya, verification ke liye
  }
}));

app.use(helmet());

// Sirf ek baar CORS setup — sirf apna frontend allow karo
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
}));

app.use((req, res, next) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/webhooks/")) {
    logActivity("API", `${req.method} ${req.path}`);
  }
  next();
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: "Too many requests, please try again later." },
});
app.use("/api/", apiLimiter);

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

function verifyShopifyWebhook(req) {
  const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
  const generatedHash = crypto
    .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(req.rawBody)
    .digest("base64");
  return generatedHash === hmacHeader;
}

async function calculateTierFromDb(lifetimePoints) {
  const tiers = await prisma.tier.findMany({
    where: { isActive: true },
    orderBy: { minPoints: "asc" },
  });
  let matched = "Bronze";
  for (const t of tiers) {
    if (lifetimePoints >= t.minPoints) matched = t.name;
  }
  return matched;
}

async function createShopifyDiscountCode(reward, shopifyCustomerId) {
  const code = "LOOP-" + Math.random().toString(36).substring(2, 8).toUpperCase();
  const percentage = reward.type === "PERCENTAGE_DISCOUNT" ? (reward.value || 10) / 100 : 0.1;

  const customerSelection = shopifyCustomerId
    ? { customers: { add: [`gid://shopify/Customer/${shopifyCustomerId}`] } }
    : { all: true };

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
      customerGets: { value: { percentage: percentage }, items: { all: true } },
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

// ═══════════════════════════════════════════════════════════
// ROOT + AUTH
// ═══════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════
// LOGS
// ═══════════════════════════════════════════════════════════

app.get("/api/logs", requireAuth, async (req, res) => {
  const logs = await prisma.activityLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json(logs);
});

// ═══════════════════════════════════════════════════════════
// LOYALTY RULES
// ═══════════════════════════════════════════════════════════

app.get("/api/rules", requireAuth, async (req, res) => {
  const rules = await prisma.loyaltyRule.findMany();
  res.json(rules);
});

app.post("/api/rules", requireAuth, async (req, res) => {
  try {
    const { name, points } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Rule name is required" });
    }
    if (points === undefined || isNaN(Number(points)) || Number(points) <= 0) {
      return res.status(400).json({ error: "Points must be a positive number" });
    }
    const newRule = await prisma.loyaltyRule.create({ data: { name: name.trim(), points: Number(points) } });
    res.status(201).json(newRule);
  } catch (err) {
    await logActivity("ERROR", "POST /api/rules", err.message);
    res.status(500).json({ error: "Failed to create rule" });
  }
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

// ═══════════════════════════════════════════════════════════
// REWARDS — GET is public (customer dashboard reads it without login)
// ═══════════════════════════════════════════════════════════

app.get("/api/rewards", async (req, res) => {
  const rewards = await prisma.reward.findMany();
  res.json(rewards);
});

app.post("/api/rewards", requireAuth, async (req, res) => {
  try {
    const { name, type, pointsCost } = req.body;
    const validTypes = ["PERCENTAGE_DISCOUNT", "FIXED_DISCOUNT", "FREE_SHIPPING", "FREE_PRODUCT"];
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Reward name is required" });
    }
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Type must be one of: ${validTypes.join(", ")}` });
    }
    if (pointsCost === undefined || isNaN(Number(pointsCost)) || Number(pointsCost) <= 0) {
      return res.status(400).json({ error: "Points cost must be a positive number" });
    }
    const newReward = await prisma.reward.create({ data: { name: name.trim(), type, pointsCost: Number(pointsCost) } });
    res.status(201).json(newReward);
  } catch (err) {
    await logActivity("ERROR", "POST /api/rewards", err.message);
    res.status(500).json({ error: "Failed to create reward" });
  }
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

// ═══════════════════════════════════════════════════════════
// TIERS
// ═══════════════════════════════════════════════════════════

app.get("/api/tiers", requireAuth, async (req, res) => {
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

app.patch("/api/customers/:id/tier", requireAuth, async (req, res) => {
  const { tier, locked } = req.body;
  const updated = await prisma.customer.update({
    where: { id: Number(req.params.id) },
    data: { tier, tierLocked: locked ?? true },
  });
  res.json(updated);
});

app.patch("/api/customers/:id/tier/unlock", requireAuth, async (req, res) => {
  const updated = await prisma.customer.update({
    where: { id: Number(req.params.id) },
    data: { tierLocked: false },
  });
  res.json(updated);
});

// ═══════════════════════════════════════════════════════════
// CUSTOMERS — GET list is paginated: { data, pagination }
// ═══════════════════════════════════════════════════════════

app.get("/api/customers", requireAuth, async (req, res) => {
  try {
    const { search, tier, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Number(limit));

    const where = {
      AND: [
        search
          ? { OR: [{ name: { contains: search } }, { email: { contains: search } }] }
          : {},
        tier ? { tier } : {},
      ],
    };

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.customer.count({ where }),
    ]);

    res.json({
      data: customers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.max(1, Math.ceil(total / limitNum)),
      },
    });
  } catch (err) {
    await logActivity("ERROR", "GET /api/customers", err.message);
    res.status(500).json({ error: "Failed to load customers" });
  }
});

app.post("/api/customers", requireAuth, async (req, res) => {
  try {
    const { name, email } = req.body;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Customer name is required" });
    }
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ error: "A valid email is required" });
    }
    const existing = await prisma.customer.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "A customer with this email already exists" });
    }
    const newCustomer = await prisma.customer.create({ data: { name: name.trim(), email } });
    res.status(201).json(newCustomer);
  } catch (err) {
    await logActivity("ERROR", "POST /api/customers", err.message);
    res.status(500).json({ error: "Failed to create customer" });
  }
});

// Public — customer dashboard reads its own data without a merchant JWT
app.get("/api/customers/:id", async (req, res) => {
  const customer = await prisma.customer.findUnique({
    where: { id: Number(req.params.id) },
  });
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  res.json(customer);
});

app.get("/api/customers/:id/transactions", async (req, res) => {
  const transactions = await prisma.transaction.findMany({
    where: { customerId: Number(req.params.id) },
    orderBy: { createdAt: "desc" },
  });
  res.json(transactions);
});

// ═══════════════════════════════════════════════════════════
// REDEMPTIONS
// ═══════════════════════════════════════════════════════════

app.get("/api/redemptions/:code", requireAuth, async (req, res) => {
  const redemption = await prisma.rewardRedemption.findFirst({
    where: { generatedCode: req.params.code },
    include: { customer: true, reward: true },
  });
  if (!redemption) return res.status(404).json({ error: "Code not found" });
  res.json(redemption);
});

app.get("/api/redemptions", requireAuth, async (req, res) => {
  const redemptions = await prisma.rewardRedemption.findMany({
    include: { customer: true, reward: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json(redemptions);
});

// Redemption does NOT touch tier/lifetimePoints/totalSpent — those only change
// when a customer EARNS points (orders-paid webhook). Redeeming only spends
// currentPoints and increases redeemedPoints.
app.post("/api/redemption", async (req, res) => {
  try {
    const { customerId, rewardId } = req.body;
    if (!customerId || !rewardId) {
      return res.status(400).json({ error: "customerId and rewardId are required" });
    }

    const customer = await prisma.customer.findUnique({ where: { id: Number(customerId) } });
    const reward = await prisma.reward.findUnique({ where: { id: Number(rewardId) } });

    if (!customer) return res.status(404).json({ error: "Customer not found" });
    if (!reward) return res.status(404).json({ error: "Reward not found" });
    if (!reward.isActive) return res.status(400).json({ error: "This reward is no longer active" });
    if (customer.currentPoints < reward.pointsCost) {
      return res.status(400).json({ error: "Not enough points" });
    }

    let code;
    try {
      code = await createShopifyDiscountCode(reward, customer.shopifyCustomerId);
    } catch (err) {
      await logActivity("ERROR", "createShopifyDiscountCode", err.message);
      code = "LOOP-" + Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    const updatedCustomer = await prisma.customer.update({
      where: { id: customer.id },
      data: {
        currentPoints: customer.currentPoints - reward.pointsCost,
        redeemedPoints: customer.redeemedPoints + reward.pointsCost,
      },
    });

    const redemption = await prisma.rewardRedemption.create({
      data: {
        customerId: customer.id,
        rewardId: reward.id,
        pointsSpent: reward.pointsCost,
        generatedCode: code,
        status: "PENDING",
      },
    });

    res.status(201).json({ redemption, remainingPoints: updatedCustomer.currentPoints });
  } catch (err) {
    await logActivity("ERROR", "POST /api/redemption", err.message);
    res.status(500).json({ error: "Failed to process redemption" });
  }
});

// ═══════════════════════════════════════════════════════════
// WEBHOOKS
// ═══════════════════════════════════════════════════════════

const processedWebhooks = [];

app.post("/webhooks/orders-paid", async (req, res) => {
  if (!verifyShopifyWebhook(req)) {
    console.log("Webhook verification FAILED — rejecting");
    await logActivity("WEBHOOK", "orders/paid", "HMAC verification failed");
    return res.status(401).send("Unauthorized");
  }

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

    // This is the ONLY place tier/totalSpent/lifetimePoints change — right here,
    // inside the webhook, with pointsEarned and totalPrice both in scope.
    const newLifetimePoints = customer.lifetimePoints + pointsEarned;
    const newTier = customer.tierLocked
      ? customer.tier
      : await calculateTierFromDb(newLifetimePoints);

    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        currentPoints: customer.currentPoints + pointsEarned,
        lifetimePoints: newLifetimePoints,
        totalSpent: customer.totalSpent + totalPrice,
        tier: newTier,
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
  await logActivity("WEBHOOK", "orders/paid", `Order #${orderId} processed`);
  res.json({ status: "processed" });
});

app.post("/webhooks/orders-create", async (req, res) => {
  if (!verifyShopifyWebhook(req)) {
    await logActivity("WEBHOOK", "orders/create", "HMAC verification failed");
    return res.status(401).send("Unauthorized");
  }
  await logActivity("WEBHOOK", "orders/create", `Order #${req.body.id} created`);
  res.json({ status: "logged" });
});

app.post("/webhooks/orders-cancelled", async (req, res) => {
  if (!verifyShopifyWebhook(req)) {
    await logActivity("WEBHOOK", "orders/cancelled", "HMAC verification failed");
    return res.status(401).send("Unauthorized");
  }
  await logActivity("WEBHOOK", "orders/cancelled", `Order #${req.body.id} cancelled`);
  res.json({ status: "logged" });
});

app.post("/webhooks/orders-refunded", async (req, res) => {
  if (!verifyShopifyWebhook(req)) {
    await logActivity("WEBHOOK", "orders/refunded", "HMAC verification failed");
    return res.status(401).send("Unauthorized");
  }

  try {
    const orderId = req.body.order_id || req.body.id;
    const earnTx = await prisma.transaction.findFirst({
      where: { note: { contains: `Order #${orderId}` }, type: "EARN" },
    });

    if (earnTx) {
      await prisma.customer.update({
        where: { id: earnTx.customerId },
        data: {
          currentPoints: { decrement: earnTx.points },
          lifetimePoints: { decrement: earnTx.points },
        },
      });
      await prisma.transaction.create({
        data: {
          customerId: earnTx.customerId,
          type: "REFUND_REVERSAL",
          points: -earnTx.points,
          note: `Refund for Order #${orderId}`,
        },
      });
      await logActivity("WEBHOOK", "orders/refunded", `Reversed ${earnTx.points} pts for order #${orderId}`);
    } else {
      await logActivity("WEBHOOK", "orders/refunded", `No matching earn transaction for order #${orderId}`);
    }
    res.json({ status: "processed" });
  } catch (err) {
    await logActivity("ERROR", "orders/refunded", err.message);
    res.status(500).json({ error: "Failed to process refund" });
  }
});

app.post("/webhooks/customers-create", async (req, res) => {
  if (!verifyShopifyWebhook(req)) {
    await logActivity("WEBHOOK", "customers/create", "HMAC verification failed");
    return res.status(401).send("Unauthorized");
  }

  try {
    const shopifyCustomerId = String(req.body.id);
    const existing = await prisma.customer.findUnique({ where: { shopifyCustomerId } });
    if (!existing) {
      await prisma.customer.create({
        data: {
          shopifyCustomerId,
          name: `${req.body.first_name || "Shopify"} ${req.body.last_name || "Customer"}`,
          email: req.body.email || `customer-${shopifyCustomerId}@unknown.com`,
        },
      });
      await logActivity("WEBHOOK", "customers/create", `Created customer ${shopifyCustomerId}`);
    }
    res.json({ status: "processed" });
  } catch (err) {
    await logActivity("ERROR", "customers/create", err.message);
    res.status(500).json({ error: "Failed to process customer creation" });
  }
});

app.post("/webhooks/app-uninstalled", async (req, res) => {
  if (!verifyShopifyWebhook(req)) {
    await logActivity("WEBHOOK", "app/uninstalled", "HMAC verification failed");
    return res.status(401).send("Unauthorized");
  }
  await logActivity("WEBHOOK", "app/uninstalled", `App uninstalled from ${req.body.domain || "store"}`);
  res.json({ status: "acknowledged" });
});

// ═══════════════════════════════════════════════════════════
// ANALYTICS
// ═══════════════════════════════════════════════════════════

app.get("/api/analytics/summary", requireAuth, async (req, res) => {
  try {
    const customers = await prisma.customer.findMany();
    const rules = await prisma.loyaltyRule.findMany({ where: { isActive: true } });

    const totalMembers = customers.length;
    const totalPointsIssued = customers.reduce((sum, c) => sum + c.lifetimePoints, 0);
    const totalPointsRedeemed = customers.reduce((sum, c) => sum + c.redeemedPoints, 0);
    const totalRevenue = customers.reduce((sum, c) => sum + (c.totalSpent || 0), 0);
    const activeCampaigns = rules.length;
    const redemptionRate =
      totalPointsIssued > 0 ? Number(((totalPointsRedeemed / totalPointsIssued) * 100).toFixed(1)) : 0;

    const topCustomers = [...customers]
      .sort((a, b) => b.lifetimePoints - a.lifetimePoints)
      .slice(0, 5)
      .map((c) => ({
        name: c.name,
        lifetimePoints: c.lifetimePoints,
        totalSpent: c.totalSpent || 0,
        tier: c.tier,
      }));

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentTransactions = await prisma.transaction.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { customerId: true },
      distinct: ["customerId"],
    });
    const activeMembers = recentTransactions.length;

    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const newThisMonth = customers.filter((c) => new Date(c.createdAt) >= startOfThisMonth).length;
    const newLastMonth = customers.filter(
      (c) => new Date(c.createdAt) >= startOfLastMonth && new Date(c.createdAt) < startOfThisMonth
    ).length;

    const monthlyGrowth =
      newLastMonth > 0
        ? Number((((newThisMonth - newLastMonth) / newLastMonth) * 100).toFixed(1))
        : newThisMonth > 0
        ? 100
        : 0;

    res.json({
      totalMembers,
      totalPointsIssued,
      totalPointsRedeemed,
      activeCampaigns,
      redemptionRate,
      totalRevenue,
      topCustomers,
      activeMembers,
      monthlyGrowth,
    });
  } catch (err) {
    await logActivity("ERROR", "GET /api/analytics/summary", err.message);
    res.status(500).json({ error: "Failed to load analytics" });
  }
});

// ═══════════════════════════════════════════════════════════
// GLOBAL ERROR HANDLER — must be last, before app.listen
// ═══════════════════════════════════════════════════════════

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  logActivity("ERROR", `${req.method} ${req.path}`, err.message);
  res.status(500).json({ error: "Something went wrong on our end" });
});

app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});