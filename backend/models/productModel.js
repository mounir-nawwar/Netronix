import mongoose from "mongoose";

const variantOptionSchema = new mongoose.Schema({
    name: { type: String, required: true },
    options: { type: Array, required: true }
}, { _id: false });

const productSchema = new mongoose.Schema({
    name: {type: String, required: true},
    description: {type: String, required: true},
    price: {type: Number, required: true},
    image: {type: Array, required: true},
    variants: {type: [variantOptionSchema], default: []},
    inventory: {type: Object, required: true, default: {}}, // Store quantity for each variant combination
    bestSeller: {type: Boolean},
    tags: {type: Array, default: []}, // Primary categorization method
    date: {type: Number, required: true}
})

const productModel = mongoose.models.product || mongoose.model("product", productSchema)

export default productModel