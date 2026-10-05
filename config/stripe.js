require('dotenv').config();
const Stripe = require('stripe');

// Only using secret key
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = { stripe };