import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();
import Product from "./models/productModel.js";

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const products = await Product.find({ brand: "JBL" });
  for (const p of products) {
    console.log("Product:", p.name, "Base Price:", p.price, "Base Minor:", p.priceMinor);
    console.log("InventoryV2:", JSON.stringify(p.inventoryV2, null, 2));
  }
  process.exit(0);
}
run();
