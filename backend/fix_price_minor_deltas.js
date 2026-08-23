import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();
import Product from "./models/productModel.js";

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const products = await Product.find({});
  let count = 0;
  for (const p of products) {
    let modified = false;
    if (Array.isArray(p.inventoryV2)) {
      for (const entry of p.inventoryV2) {
        if (Number.isFinite(entry.priceDelta) && entry.priceDelta !== 0) {
          entry.priceMinorDelta = Math.round(entry.priceDelta * 100);
          modified = true;
        }
      }
    }
    if (modified) {
      p.markModified('inventoryV2');
      await p.save();
      count++;
    }
  }
  console.log(`Updated priceMinorDelta on ${count} products.`);
  process.exit(0);
}
run();
