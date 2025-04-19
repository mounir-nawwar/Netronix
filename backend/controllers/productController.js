import {v2 as cloudinary} from 'cloudinary';
import productModel from '../models/productModel.js';
import mongoose from 'mongoose';

// Function for adding Products
const addProduct = async(req,res) =>{
    try {
        
        const {name, description, price, variants, bestSeller, inventory, tags, brand} = req.body;

        const image1 = req.files.image1 && req.files.image1[0];
        const image2 = req.files.image2 && req.files.image2[0];
        const image3 = req.files.image3 && req.files.image3[0];
        const image4 = req.files.image4 && req.files.image4[0];

        const images = [image1, image2, image3, image4].filter(item => item !== undefined);

        let imagesUrl = await Promise.all(
            images.map(async(item) => {
                let result = await cloudinary.uploader.upload(item.path, {resource_type: 'image'})
                console.log("Cloudinary Upload Result:", result);
                return result.secure_url
            })
        )

        // Parse variants and create inventory object
        const parsedVariants = variants ? JSON.parse(variants) : [];
        const parsedInventory = inventory ? JSON.parse(inventory) : {};
        const parsedTags = tags ? JSON.parse(tags) : [];
        
        // Ensure tags exist (required for categorization)
        if (parsedTags.length === 0) {
            return res.json({success: false, message: "At least one tag is required for product categorization"});
        }
        
        const productData = {
            name,
            description,
            price: Number(price),
            brand: brand || "", // Add brand with fallback to empty string
            bestSeller: bestSeller === 'true',
            variants: parsedVariants,
            inventory: parsedInventory,
            tags: parsedTags,
            image: imagesUrl,
            date: Date.now()
        }

        console.log(productData);
        
        const product= new productModel(productData);
        await product.save();

        res.json({success:true, message: "Product Added Successfully"})
        

    } catch (error) {
        console.log(error);
        res.json({success:false, message: error.message})
    }
}

// Function for listing Products
const listProduct = async(req,res) =>{
    try {
        
        const products = await productModel.find({});
        res.json({success: true, products})

    } catch (error) {
        console.log(error);
        res.json({success: false, message: error.message})
        
    }

}

// Function for removing Products
const removeProduct = async(req,res) =>{
    try {

        await productModel.findByIdAndDelete(req.body.id)
        res.json({success: true, message:"Product Removed"})
        
    } catch (error) {
        console.log(error);
        res.json({success: false, message: error.message})
    }

}

// Function for single Product info
const singleProduct = async(req,res) =>{

    try {
        
        const {productId} = req.body
        const product = await productModel.findById(productId)
        res.json({success: true, product})

    } catch (error) {
        console.log(error);
        res.json({success: false, message: error.message})
    }

}

// Function to update product inventory
const updateInventory = async(req, res) => {
    try {
        const { productId, variantKey, quantity } = req.body;
        
        if (!productId || !variantKey) {
            return res.json({ success: false, message: "Missing productId or variantKey" });
        }

        // Use direct MongoDB update for more reliable updates
        const parsedQuantity = parseInt(quantity) || 0;
        
        // Build the update document
        const updateDoc = { 
            $set: { [`inventory.${variantKey}`]: parsedQuantity } 
        };
        
        // Get direct access to the MongoDB collection
        const collection = productModel.collection;
        
        // Perform a direct update to the database
        const result = await collection.updateOne(
            { _id: new mongoose.Types.ObjectId(productId) },
            updateDoc
        );
        
        if (result.matchedCount === 0) {
            return res.json({ success: false, message: "Product not found" });
        }
        
        // Fetch the updated product to return in response
        const updatedProduct = await productModel.findById(productId).lean();
        
        if (!updatedProduct) {
            return res.json({ success: false, message: "Product not found after update" });
        }
        
        res.json({ 
            success: true, 
            message: "Inventory updated successfully",
            product: {
                _id: updatedProduct._id,
                name: updatedProduct.name,
                inventory: updatedProduct.inventory
            }
        });
    } catch (error) {
        console.error('Error updating inventory:', error);
        res.json({ success: false, message: error.message || "Error updating inventory" });
    }
}

// Function to check product inventory
const checkInventory = async(req, res) => {
    try {
        const { productId } = req.body;
        
        if (!productId) {
            return res.json({ success: false, message: "Missing productId parameter" });
        }
        
        // Get fresh data directly from database with no cache
        const product = await productModel.findById(productId).lean();
        
        if (!product) {
            return res.json({ success: false, message: "Product not found" });
        }
        
        res.json({
            success: true,
            product: {
                _id: product._id,
                name: product.name,
                inventory: product.inventory || {}
            }
        });
    } catch (error) {
        console.error('Error checking inventory:', error);
        res.json({ success: false, message: error.message || "Error checking inventory" });
    }
}

// Function to get products by tag
const getProductsByTag = async(req, res) => {
    try {
        const { tag } = req.params;
        
        const products = await productModel.find({ tags: tag });
        
        res.json({
            success: true,
            products
        });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

// Function to get all available tags
const getAllTags = async(req, res) => {
    try {
        const products = await productModel.find({});
        const tagsSet = new Set();
        
        products.forEach(product => {
            if (product.tags && Array.isArray(product.tags)) {
                product.tags.forEach(tag => tagsSet.add(tag));
            }
        });
        
        const tags = Array.from(tagsSet);
        
        res.json({
            success: true,
            tags
        });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

// Function to get best seller products
const getBestSellerProducts = async(req, res) => {
    try {
        const products = await productModel.find({ bestSeller: true });
        
        res.json({
            success: true,
            products
        });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

export {listProduct, addProduct, removeProduct, singleProduct, updateInventory, checkInventory, getProductsByTag, getAllTags, getBestSellerProducts}