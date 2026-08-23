import mongoose from "mongoose";
import Product from "./models/productModel.js";

import dotenv from "dotenv"; dotenv.config(); const uri = process.env.MONGODB_URI;

const newProducts = [
  {
    "brand": "JBL",
    "name": "JBL Tune 720BT Wireless Over-Ear Headphones",
    "description": "High-quality wireless over-ear headphones featuring JBL Pure Bass sound, up to 76 hours of battery life, and speed charge capabilities.",
    "price": 79.95,
    "tags": ["audio", "headphones", "wireless", "bluetooth"],
    "date": Date.now(),
    "image": ["https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg"],
    "variants": [
      {
        "name": "Color",
        "options": ["Black", "Blue", "White"]
      }
    ],
    "inventoryV2": [
      { "options": { "Color": "Black" }, "quantity": 50, "priceDelta": 0 },
      { "options": { "Color": "Blue" }, "quantity": 30, "priceDelta": 5.00 },
      { "options": { "Color": "White" }, "quantity": 25, "priceDelta": 5.00 }
    ]
  },
  {
    "brand": "Lenovo",
    "name": "Lenovo ThinkPad T14 Gen 4",
    "description": "Durable and powerful business laptop powered by Intel Core processors. Features a 14-inch display, robust security options, and all-day battery life.",
    "price": 1299.00,
    "tags": ["laptop", "business", "thinkpad", "windows"],
    "date": Date.now(),
    "image": ["https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg"],
    "variants": [
      {
        "name": "RAM",
        "options": ["16GB", "32GB"]
      },
      {
        "name": "Storage",
        "options": ["512GB", "1TB"]
      }
    ],
    "inventoryV2": [
      { "options": { "RAM": "16GB", "Storage": "512GB" }, "quantity": 20, "priceDelta": 0 },
      { "options": { "RAM": "16GB", "Storage": "1TB" }, "quantity": 15, "priceDelta": 150.00 },
      { "options": { "RAM": "32GB", "Storage": "512GB" }, "quantity": 10, "priceDelta": 200.00 },
      { "options": { "RAM": "32GB", "Storage": "1TB" }, "quantity": 5, "priceDelta": 350.00 }
    ]
  },
  {
    "brand": "Apple",
    "name": "Apple MacBook Air 13-inch (M3)",
    "description": "Supercharged by the M3 chip, the 13-inch MacBook Air is an incredibly thin and light laptop that delivers blazing-fast performance.",
    "price": 1099.00,
    "tags": ["laptop", "macbook", "apple", "m3"],
    "date": Date.now(),
    "image": ["https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg"],
    "variants": [
      {
        "name": "Memory",
        "options": ["8GB", "16GB", "24GB"]
      },
      {
        "name": "Storage",
        "options": ["256GB", "512GB"]
      }
    ],
    "inventoryV2": [
      { "options": { "Memory": "8GB", "Storage": "256GB" }, "quantity": 40, "priceDelta": 0 },
      { "options": { "Memory": "8GB", "Storage": "512GB" }, "quantity": 30, "priceDelta": 200.00 },
      { "options": { "Memory": "16GB", "Storage": "256GB" }, "quantity": 25, "priceDelta": 200.00 },
      { "options": { "Memory": "16GB", "Storage": "512GB" }, "quantity": 20, "priceDelta": 400.00 },
      { "options": { "Memory": "24GB", "Storage": "256GB" }, "quantity": 10, "priceDelta": 400.00 },
      { "options": { "Memory": "24GB", "Storage": "512GB" }, "quantity": 5, "priceDelta": 600.00 }
    ]
  },
  {
    "brand": "JBL",
    "name": "JBL Charge 5 Portable Bluetooth Speaker",
    "description": "Take the party with you no matter what the weather. The JBL Charge 5 speaker delivers bold JBL Original Pro Sound, with its optimized long excursion driver, separate tweeter and dual pumping JBL bass radiators.",
    "price": 149.95,
    "tags": ["audio", "speaker", "wireless", "bluetooth", "waterproof"],
    "date": Date.now(),
    "image": ["https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg"],
    "variants": [
      {
        "name": "Color",
        "options": ["Black", "Squad Camo", "Red"]
      }
    ],
    "inventoryV2": [
      { "options": { "Color": "Black" }, "quantity": 85, "priceDelta": 0 },
      { "options": { "Color": "Squad Camo" }, "quantity": 40, "priceDelta": 10.00 },
      { "options": { "Color": "Red" }, "quantity": 60, "priceDelta": 0 }
    ]
  },
  {
    "brand": "Lenovo",
    "name": "Lenovo Yoga 9i 2-in-1",
    "description": "Premium 14-inch 2-in-1 touchscreen laptop with a flexible 360-degree hinge, brilliant OLED display, and Bowers & Wilkins rotating soundbar. Intel Evo platform certified.",
    "price": 1499.99,
    "tags": ["laptop", "2-in-1", "touchscreen", "yoga", "premium"],
    "date": Date.now(),
    "image": ["https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg"],
    "variants": [
      {
        "name": "Display",
        "options": ["2.8K OLED", "4K OLED"]
      },
      {
        "name": "Storage",
        "options": ["512GB", "1TB"]
      }
    ],
    "inventoryV2": [
      { "options": { "Display": "2.8K OLED", "Storage": "512GB" }, "quantity": 25, "priceDelta": 0 },
      { "options": { "Display": "2.8K OLED", "Storage": "1TB" }, "quantity": 18, "priceDelta": 150.00 },
      { "options": { "Display": "4K OLED", "Storage": "512GB" }, "quantity": 12, "priceDelta": 200.00 },
      { "options": { "Display": "4K OLED", "Storage": "1TB" }, "quantity": 8, "priceDelta": 350.00 }
    ]
  },
  {
    "brand": "Apple",
    "name": "Apple MacBook Pro 14-inch (M4)",
    "description": "The ultimate pro laptop featuring the advanced M4 chip for extreme workflows. Stunning Liquid Retina XDR display, wide array of ports, and exceptional battery performance.",
    "price": 1599.00,
    "tags": ["laptop", "macbook pro", "apple", "m4", "macos", "professional"],
    "date": Date.now(),
    "image": ["https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg"],
    "variants": [
      {
        "name": "Chip",
        "options": ["M4 Pro (12-core)", "M4 Max (14-core)"]
      },
      {
        "name": "Memory",
        "options": ["18GB", "36GB"]
      }
    ],
    "inventoryV2": [
      { "options": { "Chip": "M4 Pro (12-core)", "Memory": "18GB" }, "quantity": 30, "priceDelta": 0 },
      { "options": { "Chip": "M4 Pro (12-core)", "Memory": "36GB" }, "quantity": 20, "priceDelta": 400.00 },
      { "options": { "Chip": "M4 Max (14-core)", "Memory": "18GB" }, "quantity": 15, "priceDelta": 600.00 },
      { "options": { "Chip": "M4 Max (14-core)", "Memory": "36GB" }, "quantity": 10, "priceDelta": 1000.00 }
    ]
  }
];

async function run() {
  try {
    await mongoose.connect(uri);
    console.log("Connected to MongoDB.");
    
    // Convert generic objects into Product Model documents to trigger pre('validate') hooks
    const docs = newProducts.map(p => new Product(p));
    
    // Save each document properly to ensure legacy sync and price calculations are correctly handled
    for (const doc of docs) {
      await doc.save();
    }
    
    console.log(`Successfully inserted ${docs.length} products with variants and priceDeltas!`);
  } catch (err) {
    console.error("Error inserting products:", err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
