const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

// ============================================
// VALIDATE ORDER PRICES
// ============================================
exports.validateOrderPrices = functions.firestore
    .document("orders/{orderId}")
    .onCreate(async (snap, context) => {
      const order = snap.data();
      const orderId = context.params.orderId;
      const db = admin.firestore();
      console.log(`Validating order ${orderId}...`);
      try {
        let calculatedTotal = 0;
        const invalidItems = [];
        // Validate each item
        for (const item of order.items) {
        // Fetch actual product from database
          const productDoc = await db.collection("products").doc(item.id).get();
          if (!productDoc.exists) {
            invalidItems.push(`Product ${item.id} not found`);
            continue;
          }
          const actualProduct = productDoc.data();
          const actualPrice = actualProduct.price;
          // Check if submitted price matches actual price
          if (Math.abs(item.price - actualPrice) > 0.01) {
            invalidItems.push(`Price mismatch for ${item.name}:
                 submitted ${item.price} DA, actual ${actualPrice} DA`);
          }
          // Check quantity is reasonable
          if (item.quantity > 100) {
            invalidItems.push(`Suspicious quantity for ${item.name}:
                 ${item.quantity}`);
          }
          calculatedTotal += actualPrice * item.quantity;
        }
        // Check if total matches
        if (Math.abs(calculatedTotal - order.total) > 0.01) {
          invalidItems.push(`Total mismatch: submitted ${order.total}
             DA, calculated ${calculatedTotal} DA`);
        }
        // If validation failed, mark order as suspicious
        if (invalidItems.length > 0) {
          console.error(`Order ${orderId} validation failed:`, invalidItems);
          await snap.ref.update({
            status: "canceled",
            validationErrors: invalidItems,
            validatedAt: admin.firestore.FieldValue.serverTimestamp()});
          // Optionally: Send notification to admin
          console.log(`Suspicious order ${orderId} auto-canceled`);
        } else {
          // Mark as validated
          await snap.ref.update({
            validated: true,
            validatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          console.log(`Order ${orderId} validated successfully`);
        }
      } catch (error) {
        console.error(`Error validating order ${orderId}:`, error);
        // Don't delete order on error, just log it
        await snap.ref.update({
          validationError: error.message,
          validatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    });

// ============================================
// RATE LIMITING (Prevent Spam Orders)
// ============================================
exports.checkOrderRateLimit = functions.firestore
    .document("orders/{orderId}")
    .onCreate(async (snap, context) => {
      const order = snap.data();
      const phone = order.customerPhone;
      const db = admin.firestore();
      // Check orders from same phone in last hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentOrders = await db.collection("orders")
          .where("customerPhone", "==", phone)
          .where("createdAt", ">", oneHourAgo.toISOString())
          .get();
      if (recentOrders.size > 5) {
        console.log(`Rate limit exceeded for ${phone}: ${recentOrders.size}
             orders in 1 hour`);
        await snap.ref.update({
          status: "canceled",
          cancelReason: "Rate limit exceeded",
        });
      }
    });
