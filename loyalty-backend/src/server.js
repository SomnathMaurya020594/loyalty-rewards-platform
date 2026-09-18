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

// Saves one activity log row to the database (used for API/WEBHOOK/ERROR events)
async function logActivity(type, event, detail = "") {
  try {
    await prisma.activityLog.create({ data: { type, event, detail: String(detail).slice(0, 500) } });
  } catch (err) {
    console.error("Failed to write activity log:", err.message);
  }
}

// Needed so express-rate-limit reads the real client IP behind Render's proxy
app.set("trust proxy", 1);

app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf; // keep the raw body too, needed for webhook signature check
  }
}));

app.use(helmet());

// Only allow requests from our own frontend and the Shopify store domain
const allowedOrigins = [
  process.env.FRONTEND_URL || "http://localhost:5173",
  `https://${process.env.SHOPIFY_STORE_URL}`,
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
}));

// Logs every API/webhook request that comes in
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

// Checks the JWT token on merchant-only routes
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

// Confirms a webhook request really came from Shopify (HMAC signature check)
function verifyShopifyWebhook(req) {
  const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
  const generatedHash = crypto
    .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(req.rawBody)
    .digest("base64");
  return generatedHash === hmacHeader;
}

// Works out which tier a customer belongs to, based on their lifetime points
async function calculateTierFromDb(lifetimePoints) {
  const tiers = await prisma.tier.findMany({
    where: { isActive: true },
    orderBy: { minPoints: "asc" },
  });
  let matched = "Bronze";
  for (const t of tiers) {
    if (lifetimePoints >= t.minPoints) matched = t.name;
  }
  console.log("[calculateTierFromDb] lifetimePoints:", lifetimePoints, "-> matched tier:", matched);
  return matched;
}

// Creates a real, one-time, customer-locked Shopify discount code
 

async function createShopifyDiscountCode(reward, shopifyCustomerId) {
  const code = "LOOP-" + Math.random().toString(36).substring(2, 8).toUpperCase();
 
  const customerSelection = shopifyCustomerId
    ? { customers: { add: [`gid://shopify/Customer/${shopifyCustomerId}`] } }
    : { all: true };
 
  console.log("[createShopifyDiscountCode] reward:", reward, "| shopifyCustomerId:", shopifyCustomerId, "| generated code:", code);
 
  // Work out what this code actually gives the customer, based on reward type
  let customerGets;
 
  if (reward.type === "FREE_PRODUCT" && reward.shopifyProductId) {
    // 100% off, but ONLY on the linked product
    customerGets = {
      value: { percentage: 1.0 },
      items: { products: { productsToAdd: [reward.shopifyProductId] } },
    };
  } else if (reward.type === "FIXED_DISCOUNT") {
    // A flat rupee amount off the whole order
    const amountOff = reward.discountValue || 0;
    customerGets = {
      value: {
        discountAmount: {
          amount: amountOff,
          appliesOnEachItem: false,
        },
      },
      items: { all: true },
    };
  } else if (reward.type === "PERCENTAGE_DISCOUNT") {
    // A percentage off the whole order
    const percentOff = (reward.discountValue || 10) / 100;
    customerGets = {
      value: { percentage: percentOff },
      items: { all: true },
    };
  } else {
    // FREE_SHIPPING and anything else — default small percentage for now.
    // NOTE: a true free-shipping code needs Shopify's separate
    // discountCodeFreeShippingCreate mutation, not this one. Documented as
    // a known limitation.
    customerGets = {
      value: { percentage: 0.1 },
      items: { all: true },
    };
  }
 
  console.log("[createShopifyDiscountCode] Final customerGets:", JSON.stringify(customerGets));
 
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
      customerGets,
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
  console.log("[createShopifyDiscountCode] Shopify response:", JSON.stringify(data));
 
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
  console.log("[POST /api/auth/login] Login attempt for email:", email);

  if (email !== process.env.ADMIN_EMAIL) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const isValid = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
  if (!isValid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: "8h" });
  console.log("[POST /api/auth/login] Login success for:", email);
  res.json({ token });
});

// ═══════════════════════════════════════════════════════════
// LOGS
// ═══════════════════════════════════════════════════════════

app.get("/api/logs", requireAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, type } = req.query;
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Number(limit));
 
    console.log("[GET /api/logs] Query params:", { page: pageNum, limit: limitNum, type });
 
    const where = type && type !== "ALL" ? { type } : {};
 
    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.activityLog.count({ where }),
    ]);
 
    console.log("[GET /api/logs] Found", total, "total logs, returning page", pageNum);
 
    res.json({
      data: logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.max(1, Math.ceil(total / limitNum)),
      },
    });
  } catch (err) {
    console.log("[GET /api/logs] Error:", err.message);
    await logActivity("ERROR", "GET /api/logs", err.message);
    res.status(500).json({ error: "Failed to load logs" });
  }
});
 
// ═══════════════════════════════════════════════════════════
// LOYALTY RULES
// ═══════════════════════════════════════════════════════════

app.get("/api/rules", requireAuth, async (req, res) => {
  const rules = await prisma.loyaltyRule.findMany();
  console.log("[GET /api/rules] Returning", rules.length, "rules");
  res.json(rules);
});

app.post("/api/rules", requireAuth, async (req, res) => {
  try {
    const { name, points } = req.body;
    console.log("[POST /api/rules] Incoming data:", { name, points });

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Rule name is required" });
    }
    if (points === undefined || isNaN(Number(points)) || Number(points) <= 0) {
      return res.status(400).json({ error: "Points must be a positive number" });
    }
    const newRule = await prisma.loyaltyRule.create({ data: { name: name.trim(), points: Number(points) } });
    console.log("[POST /api/rules] Created rule:", newRule);
    res.status(201).json(newRule);
  } catch (err) {
    console.log("[POST /api/rules] Error:", err.message);
    await logActivity("ERROR", "POST /api/rules", err.message);
    res.status(500).json({ error: "Failed to create rule" });
  }
});

app.put("/api/rules/:id", requireAuth, async (req, res) => {
  const { name, points } = req.body;
  console.log("[PUT /api/rules/:id] id:", req.params.id, "| data:", { name, points });
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
  console.log("[PATCH /api/rules/:id/toggle] rule:", req.params.id, "-> isActive:", updated.isActive);
  res.json(updated);
});

app.delete("/api/rules/:id", requireAuth, async (req, res) => {
  console.log("[DELETE /api/rules/:id] Deleting rule:", req.params.id);
  await prisma.loyaltyRule.delete({ where: { id: Number(req.params.id) } });
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════
// REWARDS — GET is public (customer dashboard reads it without login)
// ═══════════════════════════════════════════════════════════

app.get("/api/rewards", async (req, res) => {
  const rewards = await prisma.reward.findMany();
  console.log("[GET /api/rewards] Returning", rewards.length, "rewards");
  res.json(rewards);
});

 
 
app.post("/api/rewards", requireAuth, async (req, res) => {
  try {
    const { name, type, pointsCost, shopifyProductId, discountValue } = req.body;
    console.log("[POST /api/rewards] Incoming data:", { name, type, pointsCost, shopifyProductId, discountValue });
 
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
 
    // A FREE_PRODUCT reward must be linked to a real Shopify product
    if (type === "FREE_PRODUCT" && !shopifyProductId) {
      return res.status(400).json({ error: "Please select a product for a Free Product reward" });
    }
 
    // PERCENTAGE_DISCOUNT and FIXED_DISCOUNT both need a discount number set
    if ((type === "PERCENTAGE_DISCOUNT" || type === "FIXED_DISCOUNT") &&
        (discountValue === undefined || isNaN(Number(discountValue)) || Number(discountValue) <= 0)) {
      return res.status(400).json({ error: "Please enter a discount value (percentage or amount)" });
    }
 
    const newReward = await prisma.reward.create({
      data: {
        name: name.trim(),
        type,
        pointsCost: Number(pointsCost),
        shopifyProductId: type === "FREE_PRODUCT" ? shopifyProductId : null,
        discountValue: (type === "PERCENTAGE_DISCOUNT" || type === "FIXED_DISCOUNT") ? Number(discountValue) : null,
      },
    });
 
    console.log("[POST /api/rewards] Created reward:", newReward);
    res.status(201).json(newReward);
  } catch (err) {
    console.log("[POST /api/rewards] Error:", err.message);
    await logActivity("ERROR", "POST /api/rewards", err.message);
    res.status(500).json({ error: "Failed to create reward" });
  }
});
 
app.put("/api/rewards/:id", requireAuth, async (req, res) => {
  const { name, type, pointsCost, shopifyProductId, discountValue } = req.body;
  console.log("[PUT /api/rewards/:id] id:", req.params.id, "| data:", { name, type, pointsCost, shopifyProductId, discountValue });
 
  const updated = await prisma.reward.update({
    where: { id: Number(req.params.id) },
    data: {
      name,
      type,
      pointsCost,
      shopifyProductId: type === "FREE_PRODUCT" ? shopifyProductId : null,
      discountValue: (type === "PERCENTAGE_DISCOUNT" || type === "FIXED_DISCOUNT") ? Number(discountValue) : null,
    },
  });
  res.json(updated);
});

app.patch("/api/rewards/:id/toggle", requireAuth, async (req, res) => {
  const reward = await prisma.reward.findUnique({ where: { id: Number(req.params.id) } });
  const updated = await prisma.reward.update({
    where: { id: Number(req.params.id) },
    data: { isActive: !reward.isActive },
  });
  console.log("[PATCH /api/rewards/:id/toggle] reward:", req.params.id, "-> isActive:", updated.isActive);
  res.json(updated);
});

app.delete("/api/rewards/:id", requireAuth, async (req, res) => {
  console.log("[DELETE /api/rewards/:id] Deleting reward:", req.params.id);
  await prisma.reward.delete({ where: { id: Number(req.params.id) } });
  res.json({ success: true });
});


async function fetchShopifyProducts() {
  const query = `
    query {
      products(first: 25) {
        edges {
          node {
            id
            title
            featuredImage { url }
          }
        }
      }
    }
  `;
 
  console.log("[fetchShopifyProducts] Calling Shopify Admin API for product list");
 
  const response = await fetch(
    `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2026-07/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
      },
      body: JSON.stringify({ query }),
    }
  );
 
  const data = await response.json();
  console.log("[fetchShopifyProducts] Shopify response:", JSON.stringify(data));
 
  if (!data.data?.products?.edges) {
    throw new Error("Could not load products from Shopify");
  }
 
  // Turn Shopify's nested edges/node shape into a simple flat list
  return data.data.products.edges.map((edge) => ({
    id: edge.node.id, // looks like "gid://shopify/Product/123456789"
    title: edge.node.title,
    image: edge.node.featuredImage?.url || null,
  }));
}
 
// GET /api/shopify/products — merchant-only, used when creating a FREE_PRODUCT reward
app.get("/api/shopify/products", requireAuth, async (req, res) => {
  try {
    const products = await fetchShopifyProducts();
    console.log("[GET /api/shopify/products] Returning", products.length, "products");
    res.json(products);
  } catch (err) {
    console.log("[GET /api/shopify/products] Error:", err.message);
    await logActivity("ERROR", "GET /api/shopify/products", err.message);
    res.status(500).json({ error: "Failed to load products from Shopify" });
  }
});

// ═══════════════════════════════════════════════════════════
// TIERS
// ═══════════════════════════════════════════════════════════

app.get("/api/tiers", requireAuth, async (req, res) => {
  const tiers = await prisma.tier.findMany({ orderBy: { minPoints: "asc" } });
  console.log("[GET /api/tiers] Returning", tiers.length, "tiers");
  res.json(tiers);
});

// UPDATED: now validates name + minPoints, and blocks duplicate tier names
app.post("/api/tiers", requireAuth, async (req, res) => {
  try {
    const { name, minPoints } = req.body;
    console.log("[POST /api/tiers] Incoming data:", { name, minPoints });

    // Name must be a real, non-empty string
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Tier name is required" });
    }

    // minPoints must be a valid number and cannot be negative
    if (minPoints === undefined || isNaN(Number(minPoints)) || Number(minPoints) < 0) {
      return res.status(400).json({ error: "Minimum points must be a number 0 or higher" });
    }

    // Don't allow two tiers with the same name (avoids confusing duplicates)
    const existingTier = await prisma.tier.findFirst({ where: { name: name.trim() } });
    if (existingTier) {
      return res.status(409).json({ error: "A tier with this name already exists" });
    }

    const newTier = await prisma.tier.create({
      data: { name: name.trim(), minPoints: Number(minPoints) },
    });

    console.log("[POST /api/tiers] Created tier:", newTier);
    res.status(201).json(newTier);
  } catch (err) {
    console.log("[POST /api/tiers] Error:", err.message);
    await logActivity("ERROR", "POST /api/tiers", err.message);
    res.status(500).json({ error: "Failed to create tier" });
  }
});

// UPDATED: now validates name + minPoints before updating
app.put("/api/tiers/:id", requireAuth, async (req, res) => {
  try {
    const { name, minPoints } = req.body;
    console.log("[PUT /api/tiers/:id] id:", req.params.id, "| data:", { name, minPoints });

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Tier name is required" });
    }
    if (minPoints === undefined || isNaN(Number(minPoints)) || Number(minPoints) < 0) {
      return res.status(400).json({ error: "Minimum points must be a number 0 or higher" });
    }

    const updated = await prisma.tier.update({
      where: { id: Number(req.params.id) },
      data: { name: name.trim(), minPoints: Number(minPoints) },
    });

    console.log("[PUT /api/tiers/:id] Updated tier:", updated);
    res.json(updated);
  } catch (err) {
    console.log("[PUT /api/tiers/:id] Error:", err.message);
    await logActivity("ERROR", "PUT /api/tiers/:id", err.message);
    res.status(500).json({ error: "Failed to update tier" });
  }
});

app.patch("/api/tiers/:id/toggle", requireAuth, async (req, res) => {
  const tier = await prisma.tier.findUnique({ where: { id: Number(req.params.id) } });
  const updated = await prisma.tier.update({
    where: { id: Number(req.params.id) },
    data: { isActive: !tier.isActive },
  });
  console.log("[PATCH /api/tiers/:id/toggle] tier:", req.params.id, "-> isActive:", updated.isActive);
  res.json(updated);
});

app.delete("/api/tiers/:id", requireAuth, async (req, res) => {
  console.log("[DELETE /api/tiers/:id] Deleting tier:", req.params.id);
  await prisma.tier.delete({ where: { id: Number(req.params.id) } });
  res.json({ success: true });
});

// UPDATED: now validates the tier name and checks that tier actually exists
app.patch("/api/customers/:id/tier", requireAuth, async (req, res) => {
  try {
    const { tier, locked } = req.body;
    console.log("[PATCH /api/customers/:id/tier] customerId:", req.params.id, "| data:", { tier, locked });

    if (!tier || typeof tier !== "string" || !tier.trim()) {
      return res.status(400).json({ error: "Tier name is required" });
    }

    // Only allow setting a tier that actually exists — stops a merchant from
    // accidentally assigning a customer to a tier name that was never created
    const tierExists = await prisma.tier.findFirst({ where: { name: tier.trim() } });
    if (!tierExists) {
      return res.status(400).json({ error: "This tier does not exist. Create it first." });
    }

    const updated = await prisma.customer.update({
      where: { id: Number(req.params.id) },
      data: { tier: tier.trim(), tierLocked: locked ?? true },
    });

    console.log("[PATCH /api/customers/:id/tier] Updated customer:", updated);
    res.json(updated);
  } catch (err) {
    console.log("[PATCH /api/customers/:id/tier] Error:", err.message);
    await logActivity("ERROR", "PATCH /api/customers/:id/tier", err.message);
    res.status(500).json({ error: "Failed to update customer tier" });
  }
});

app.patch("/api/customers/:id/tier/unlock", requireAuth, async (req, res) => {
  console.log("[PATCH /api/customers/:id/tier/unlock] customerId:", req.params.id);
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

    console.log("[GET /api/customers] Query params:", { search, tier, page: pageNum, limit: limitNum });

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

    console.log("[GET /api/customers] Found", total, "total customers, returning page", pageNum);

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
    console.log("[GET /api/customers] Error:", err.message);
    await logActivity("ERROR", "GET /api/customers", err.message);
    res.status(500).json({ error: "Failed to load customers" });
  }
});

app.post("/api/customers", requireAuth, async (req, res) => {
  try {
    const { name, email } = req.body;
    console.log("[POST /api/customers] Incoming data:", { name, email });

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
    console.log("[POST /api/customers] Created customer:", newCustomer);
    res.status(201).json(newCustomer);
  } catch (err) {
    console.log("[POST /api/customers] Error:", err.message);
    await logActivity("ERROR", "POST /api/customers", err.message);
    res.status(500).json({ error: "Failed to create customer" });
  }
});

// Public — customer dashboard reads its own data without a merchant JWT
app.get("/api/customers/:id", async (req, res) => {
  console.log("[GET /api/customers/:id] Looking up customer id:", req.params.id);
  const customer = await prisma.customer.findUnique({
    where: { id: Number(req.params.id) },
  });
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  res.json(customer);
});


app.get("/api/customers/by-shopify-id/:shopifyId", async (req, res) => {
  console.log("[GET /api/customers/by-shopify-id/:shopifyId] Looking up shopifyId:", req.params.shopifyId);
  const customer = await prisma.customer.findUnique({
    where: { shopifyCustomerId: req.params.shopifyId },
  });
  if (!customer) {
    // Not an error — this just means they haven't earned points yet
    // (no order has come through the webhook for them).
    console.log("[GET /api/customers/by-shopify-id/:shopifyId] No loyalty account found yet for:", req.params.shopifyId);
    return res.status(404).json({ error: "No loyalty account yet — place an order to start earning points!" });
  }
  console.log("[GET /api/customers/by-shopify-id/:shopifyId] Found customer:", customer);
  res.json(customer);
});


app.get("/api/customers/by-shopify-id/:shopifyId/redemptions", async (req, res) => {
  console.log("[GET .../redemptions] shopifyId:", req.params.shopifyId);
  const customer = await prisma.customer.findUnique({
    where: { shopifyCustomerId: req.params.shopifyId },
  });
  if (!customer) return res.json([]);

  const redemptions = await prisma.rewardRedemption.findMany({
    where: { customerId: customer.id },
    include: { reward: true },
    orderBy: { createdAt: "desc" },
  });
  console.log("[GET .../redemptions] Found", redemptions.length, "redemptions");
  res.json(redemptions);
});


app.get("/api/customers/by-shopify-id/:shopifyId/transactions", async (req, res) => {
  console.log("[GET .../transactions] shopifyId:", req.params.shopifyId);
  const customer = await prisma.customer.findUnique({
    where: { shopifyCustomerId: req.params.shopifyId },
  });
  if (!customer) return res.json([]);

  const transactions = await prisma.transaction.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: "desc" },
  });
  console.log("[GET .../transactions] Found", transactions.length, "transactions");
  res.json(transactions);
});

function convertToCsv(rows) {
  if (!rows || rows.length === 0) return "";
 
  const headers = Object.keys(rows[0]);
  const headerLine = headers.join(",");
 
  const dataLines = rows.map((row) =>
    headers
      .map((key) => {
        const value = row[key] === null || row[key] === undefined ? "" : String(row[key]);
        // Wrap in quotes if the value contains a comma, so the CSV stays valid
        const escaped = value.includes(",") ? `"${value.replace(/"/g, '""')}"` : value;
        return escaped;
      })
      .join(",")
  );
 
  return [headerLine, ...dataLines].join("\n");
}
 
// GET /api/customers/export — downloads all customers as a CSV file
app.get("/api/customers/export", requireAuth, async (req, res) => {
  try {
    console.log("[GET /api/customers/export] Generating customers CSV");
 
    const customers = await prisma.customer.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        currentPoints: true,
        lifetimePoints: true,
        redeemedPoints: true,
        totalSpent: true,
        tier: true,
        createdAt: true,
      },
    });
 
    const csv = convertToCsv(customers);
 
    console.log("[GET /api/customers/export] Exporting", customers.length, "customers");
 
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=customers.csv");
    res.send(csv);
  } catch (err) {
    console.log("[GET /api/customers/export] Error:", err.message);
    await logActivity("ERROR", "GET /api/customers/export", err.message);
    res.status(500).json({ error: "Failed to export customers" });
  }
});
 
// GET /api/redemptions/export — downloads all redemptions as a CSV file
app.get("/api/redemptions/export", requireAuth, async (req, res) => {
  try {
    console.log("[GET /api/redemptions/export] Generating redemptions CSV");
 
    const redemptions = await prisma.rewardRedemption.findMany({
      include: { customer: true, reward: true },
      orderBy: { createdAt: "desc" },
    });
 
    // Flatten the nested customer/reward objects into simple CSV columns
    const flatRows = redemptions.map((r) => ({
      id: r.id,
      customerName: r.customer?.name || "",
      customerEmail: r.customer?.email || "",
      rewardName: r.reward?.name || "",
      pointsSpent: r.pointsSpent,
      generatedCode: r.generatedCode,
      status: r.status,
      orderId: r.orderId || "",
      createdAt: r.createdAt,
    }));
 
    const csv = convertToCsv(flatRows);
 
    console.log("[GET /api/redemptions/export] Exporting", flatRows.length, "redemptions");
 
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=redemptions.csv");
    res.send(csv);
  } catch (err) {
    console.log("[GET /api/redemptions/export] Error:", err.message);
    await logActivity("ERROR", "GET /api/redemptions/export", err.message);
    res.status(500).json({ error: "Failed to export redemptions" });
  }
});

// ═══════════════════════════════════════════════════════════
// REDEMPTIONS
// ═══════════════════════════════════════════════════════════

app.get("/api/redemptions/:code", requireAuth, async (req, res) => {
  console.log("[GET /api/redemptions/:code] Looking up code:", req.params.code);
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
  console.log("[GET /api/redemptions] Returning", redemptions.length, "redemptions");
  res.json(redemptions);
});

// Redemption does NOT touch tier/lifetimePoints/totalSpent — those only change
// when a customer EARNS points (orders-paid webhook). Redeeming only spends
// currentPoints and increases redeemedPoints.
app.post("/api/redemption", async (req, res) => {
  try {
    const { customerId, rewardId, shopifyCustomerId } = req.body;
    console.log("[POST /api/redemption] Incoming data:", { customerId, rewardId, shopifyCustomerId });

    // At least one way to identify the customer is required, plus a rewardId.
    if ((!customerId && !shopifyCustomerId) || !rewardId) {
      return res.status(400).json({ error: "customerId (or shopifyCustomerId) and rewardId are required" });
    }

    // Look up the customer by whichever identifier was provided.
    const customer = customerId
      ? await prisma.customer.findUnique({ where: { id: Number(customerId) } })
      : await prisma.customer.findUnique({ where: { shopifyCustomerId: String(shopifyCustomerId) } });

    const reward = await prisma.reward.findUnique({ where: { id: Number(rewardId) } });

    console.log("[POST /api/redemption] Found customer:", customer, "| Found reward:", reward);

    if (!customer) return res.status(404).json({ error: "Customer not found" });
    if (!reward) return res.status(404).json({ error: "Reward not found" });
    if (!reward.isActive) return res.status(400).json({ error: "This reward is no longer active" });
    if (customer.currentPoints < reward.pointsCost) {
      return res.status(400).json({ error: "Not enough points" });
    }

    // Try to generate a real, customer-locked Shopify discount code.
    // If that fails for any reason, fall back to a random local code so the
    // redemption still completes (this is logged as an error for visibility).
    let code;
    try {
      code = await createShopifyDiscountCode(reward, customer.shopifyCustomerId);
    } catch (err) {
      console.log("[POST /api/redemption] Shopify discount code creation failed, using fallback code. Error:", err.message);
      await logActivity("ERROR", "createShopifyDiscountCode", err.message);
      code = "LOOP-" + Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    // Deduct the reward's cost from the customer's spendable balance, and
    // add it to their redeemed-points total (used for redemption-rate analytics).
    const updatedCustomer = await prisma.customer.update({
      where: { id: customer.id },
      data: {
        currentPoints: customer.currentPoints - reward.pointsCost,
        redeemedPoints: customer.redeemedPoints + reward.pointsCost,
      },
    });

    // Record the redemption itself — status starts PENDING and later flips to
    // APPLIED by the orders-paid webhook once the code is actually used at checkout.
    const redemption = await prisma.rewardRedemption.create({
      data: {
        customerId: customer.id,
        rewardId: reward.id,
        pointsSpent: reward.pointsCost,
        generatedCode: code,
        status: "PENDING",
      },
    });

    console.log("[POST /api/redemption] Redemption created:", redemption, "| remainingPoints:", updatedCustomer.currentPoints);
    res.status(201).json({ redemption, remainingPoints: updatedCustomer.currentPoints });
  } catch (err) {
    console.log("[POST /api/redemption] Error:", err.message);
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
  console.log("[webhooks/orders-paid] webhookId:", webhookId, "| order id:", req.body.id);

  if (processedWebhooks.includes(webhookId)) {
    console.log("[webhooks/orders-paid] Duplicate webhook, ignoring:", webhookId);
    return res.json({ status: "duplicate_ignored" });
  }

  const shopifyCustomerId = req.body.customer?.id;
  const orderId = req.body.id;
  const totalPrice = parseFloat(req.body.total_price);

  const purchaseRule = await prisma.loyaltyRule.findFirst({
    where: { name: "Purchase", isActive: true },
  });

  console.log("[webhooks/orders-paid] shopifyCustomerId:", shopifyCustomerId, "| totalPrice:", totalPrice, "| purchaseRule:", purchaseRule);

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
      console.log("[webhooks/orders-paid] New customer created from webhook:", customer);
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

    console.log(`[webhooks/orders-paid] Awarded ${pointsEarned} points to ${customer.name} | new tier: ${newTier}`);
  }

  const usedCodes = (req.body.discount_codes || []).map((d) => d.code);
  console.log("[webhooks/orders-paid] Discount codes used on this order:", usedCodes);

  for (const usedCode of usedCodes) {
    const redemption = await prisma.rewardRedemption.findFirst({
      where: { generatedCode: usedCode, status: "PENDING" },
    });
    if (redemption) {
      await prisma.rewardRedemption.update({
        where: { id: redemption.id },
        data: { status: "APPLIED", orderId: String(orderId) },
      });
      console.log(`[webhooks/orders-paid] Redemption ${usedCode} marked APPLIED on order #${orderId}`);
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
  console.log("[webhooks/orders-create] Order created:", req.body.id);
  await logActivity("WEBHOOK", "orders/create", `Order #${req.body.id} created`);
  res.json({ status: "logged" });
});

app.post("/webhooks/orders-cancelled", async (req, res) => {
  if (!verifyShopifyWebhook(req)) {
    await logActivity("WEBHOOK", "orders/cancelled", "HMAC verification failed");
    return res.status(401).send("Unauthorized");
  }
  console.log("[webhooks/orders-cancelled] Order cancelled:", req.body.id);
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
    console.log("[webhooks/orders-refunded] Refund for order:", orderId);

    const earnTx = await prisma.transaction.findFirst({
      where: { note: { contains: `Order #${orderId}` }, type: "EARN" },
    });

    console.log("[webhooks/orders-refunded] Matching earn transaction:", earnTx);

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
    console.log("[webhooks/orders-refunded] Error:", err.message);
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
    console.log("[webhooks/customers-create] shopifyCustomerId:", shopifyCustomerId);

    const existing = await prisma.customer.findUnique({ where: { shopifyCustomerId } });

    if (!existing) {
      // Look up the "Signup" rule — same pattern as the "Purchase" rule lookup
      // in the orders-paid webhook.
      const signupRule = await prisma.loyaltyRule.findFirst({
        where: { name: "Signup", isActive: true },
      });
      const signupPoints = signupRule ? signupRule.points : 0;

      const newCustomer = await prisma.customer.create({
        data: {
          shopifyCustomerId,
          name: `${req.body.first_name || "Shopify"} ${req.body.last_name || "Customer"}`,
          email: req.body.email || `customer-${shopifyCustomerId}@unknown.com`,
          currentPoints: signupPoints,
          lifetimePoints: signupPoints,
          tier: signupPoints > 0 ? await calculateTierFromDb(signupPoints) : "Bronze",
        },
      });

      console.log("[webhooks/customers-create] New customer created:", newCustomer, "| signupPoints:", signupPoints);

      // Record it as a transaction too, so it shows up in their history —
      // same as any other points-earning event.
      if (signupPoints > 0) {
        await prisma.transaction.create({
          data: {
            customerId: newCustomer.id,
            type: "EARN",
            points: signupPoints,
            note: "Signup bonus",
          },
        });
      }

      await logActivity("WEBHOOK", "customers/create", `Created customer ${shopifyCustomerId}, awarded ${signupPoints} signup pts`);
    } else {
      console.log("[webhooks/customers-create] Customer already exists, skipping:", shopifyCustomerId);
    }
    res.json({ status: "processed" });
  } catch (err) {
    console.log("[webhooks/customers-create] Error:", err.message);
    await logActivity("ERROR", "customers/create", err.message);
    res.status(500).json({ error: "Failed to process customer creation" });
  }
});

app.post("/webhooks/app-uninstalled", async (req, res) => {
  if (!verifyShopifyWebhook(req)) {
    await logActivity("WEBHOOK", "app/uninstalled", "HMAC verification failed");
    return res.status(401).send("Unauthorized");
  }
  console.log("[webhooks/app-uninstalled] App uninstalled from:", req.body.domain);
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

    const summary = {
      totalMembers,
      totalPointsIssued,
      totalPointsRedeemed,
      activeCampaigns,
      redemptionRate,
      totalRevenue,
      topCustomers,
      activeMembers,
      monthlyGrowth,
    };

    console.log("[GET /api/analytics/summary] Computed summary:", summary);
    res.json(summary);
  } catch (err) {
    console.log("[GET /api/analytics/summary] Error:", err.message);
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