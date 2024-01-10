const Stripe = require('stripe');
const { PrismaClient } = require('@prisma/client');

/**
 * Synchronizes data between a database and the Stripe API.
 * Retrieves active products and prices from Stripe, deletes existing data in the database,
 * and inserts the new data. Prints the number of synced products and prices.
 *
 * @returns {Promise<void>} - A promise that resolves once the synchronization is complete.
 */
const sync = async () => {
  const prisma = new PrismaClient();
  try {
    console.log('Starting sync with Stripe');
    const stripe = getStripeInstance();

    // Get all active products and prices
    const [products, prices] = await Promise.all([
      stripe.products.list({ active: true }),
      stripe.prices.list({ active: true }),
    ]);

    if (prices.data.length > 0 && products.data.length > 0) {
      await cleanup(prisma);

      await seedProducts(products.data, prisma);
      await seedPrices(prices.data, prisma);

      await printStats(prisma);

      console.log('Sync completed successfully');
      process.exit(0);
    } else {
      if (prices.data.length === 0) {
        throw new Error('No prices found on Stripe');
      } else {
        throw new Error('No products found on Stripe');
      }
    }
  } catch (error) {
    console.error('Error syncing with Stripe:', error);
    process.exit(1);
  }
};

sync();

// handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

async function printStats(prisma) {
  const [productCount, priceCount] = await Promise.all([
    prisma.stripeProduct.count(),
    prisma.stripePrice.count(),
  ]);

  console.log('Products synced:', productCount);
  console.log('Prices synced:', priceCount);
}

async function cleanup(prisma) {
  // delete all prices from the database
  await prisma.stripePrice.deleteMany({});
  // Delete all products and prices from the database
  await prisma.stripeProduct.deleteMany({});
}

function getStripeInstance() {
  if (process.env.STRIPE_SECRET_KEY) {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2022-11-15',
      appInfo: {
        name: 'saas-starter-kit',
        version: '0.1.0',
      },
    });
    return stripe;
  } else {
    throw new Error('STRIPE_SECRET_KEY environment variable not set');
  }
}

async function seedPrices(prices, prisma) {
  for (const data of prices) {
    try {
      await prisma.stripePrice.create({
        data: {
          id: data.id,
          billingScheme: data.billing_scheme,
          created: new Date(data.created * 1000),
          currency: data.currency,
          customUnitAmount: data.custom_unit_amount
            ? data.custom_unit_amount.toString()
            : null,
          livemode: data.livemode,
          lookupKey: data.lookup_key,
          metadata: data.metadata,
          nickname: data.nickname,
          productId: data.product,
          recurring: data.recurring,
          tiersMode: data.tiers_mode ? data.tiers_mode.toString() : '',
          type: data.type,
          unitAmount: data.unit_amount ? data.unit_amount.toString() : null,
          unitAmountDecimal: data.unit_amount_decimal,
        },
      });
    } catch (error) {
      console.log(error);
    }
  }
}

async function seedProducts(products, prisma) {
  for (const data of products) {
    try {
      await prisma.stripeProduct.create({
        data: {
          id: data.id,
          description: data.description || '',
          features: (data.features || []).map((a) => a.name),
          image: data.images.length > 0 ? data.images[0] : '',
          metadata: data.metadata,
          name: data.name,
          unitLabel: data.unit_label,
          created: new Date(data.created * 1000),
        },
      });
    } catch (error) {
      console.log(error);
    }
  }
}