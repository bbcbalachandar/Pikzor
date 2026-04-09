const express = require('express');
const router  = express.Router();
const Stripe  = require('stripe');

const config        = require('../config');
const db            = require('../db/db');
const { requireJwt } = require('../middleware/auth');
const logger        = require('../utils/logger');
const email         = require('../services/email');

const stripe = config.stripe.secretKey ? Stripe(config.stripe.secretKey) : null;

const PRICE_MAP = {
  starter: config.stripe.priceStarter,
  pro:     config.stripe.pricePro,
};

const PLAN_MAP = {}; // filled lazily: priceId → plan name

// ── POST /billing/checkout ─────────────────────────────────────────────────────
// Create a Stripe Checkout session. Returns { url } to redirect to.
router.post('/checkout', requireJwt, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Billing not configured' });

  const { plan } = req.body; // 'starter' | 'pro'
  const priceId = PRICE_MAP[plan];
  if (!priceId) return res.status(400).json({ error: 'Invalid plan. Choose starter or pro.' });

  try {
    const user = db.getUserById.get(req.user.id);

    // Reuse existing Stripe customer or create one
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email });
      customerId = customer.id;
      db.updateUserPlan.run({
        plan: user.plan,
        stripe_customer_id: customerId,
        stripe_subscription_id: user.stripe_subscription_id || null,
        id: user.id,
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer:             customerId,
      mode:                 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${config.baseUrl}/dashboard?upgraded=1`,
      cancel_url:  `${config.baseUrl}/dashboard?cancelled=1`,
      metadata:    { user_id: user.id, plan },
    });

    res.json({ url: session.url });
  } catch (err) {
    logger.error('[billing/checkout]', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ── POST /billing/portal ───────────────────────────────────────────────────────
// Open Stripe Customer Portal to manage/cancel subscription.
router.post('/portal', requireJwt, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Billing not configured' });

  const user = db.getUserById.get(req.user.id);
  if (!user.stripe_customer_id) {
    return res.status(400).json({ error: 'No billing account found' });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer:   user.stripe_customer_id,
      return_url: `${config.baseUrl}/dashboard`,
    });
    res.json({ url: session.url });
  } catch (err) {
    logger.error('[billing/portal]', err);
    res.status(500).json({ error: 'Failed to open billing portal' });
  }
});

// ── POST /billing/webhook ──────────────────────────────────────────────────────
// Stripe webhook — must use raw body (express.raw middleware applied in server.js).
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) return res.sendStatus(200);

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, config.stripe.webhookSecret);
  } catch (err) {
    logger.warn('[billing/webhook] signature verification failed', { message: err.message });
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode !== 'subscription') break;

        const userId = session.metadata?.user_id;
        const plan   = session.metadata?.plan;
        if (!userId || !plan) break;

        db.updateUserPlan.run({
          plan,
          stripe_customer_id:     session.customer,
          stripe_subscription_id: session.subscription,
          id: userId,
        });

        const user = db.getUserById.get(userId);
        if (user) email.sendUpgradeConfirmation(user.email, plan).catch(() => {});
        logger.info(`[billing/webhook] upgraded user ${userId} to ${plan}`);
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        // Find user by stripe_customer_id
        const user = db.db.prepare('SELECT * FROM users WHERE stripe_customer_id = ?').get(sub.customer);
        if (!user) break;

        // Determine plan from price ID
        const priceId = sub.items?.data?.[0]?.price?.id;
        const plan = Object.entries(PRICE_MAP).find(([, p]) => p === priceId)?.[0];
        if (!plan) break;

        const status = sub.status; // active, past_due, canceled, etc.
        if (status === 'active' || status === 'trialing') {
          db.updateUserPlan.run({
            plan,
            stripe_customer_id:     sub.customer,
            stripe_subscription_id: sub.id,
            id: user.id,
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub  = event.data.object;
        const user = db.db.prepare('SELECT * FROM users WHERE stripe_customer_id = ?').get(sub.customer);
        if (!user) break;

        db.updateUserPlan.run({
          plan: 'free',
          stripe_customer_id:     sub.customer,
          stripe_subscription_id: null,
          id: user.id,
        });
        logger.info(`[billing/webhook] downgraded user ${user.id} to free`);
        break;
      }
    }
  } catch (err) {
    logger.error('[billing/webhook] handler error', err);
  }

  res.sendStatus(200);
});

// ── GET /billing/status ────────────────────────────────────────────────────────
router.get('/status', requireJwt, (req, res) => {
  const user = db.getUserById.get(req.user.id);
  res.json({
    plan:                  user.plan,
    stripe_customer_id:    user.stripe_customer_id    || null,
    stripe_subscription_id: user.stripe_subscription_id || null,
  });
});

module.exports = router;
