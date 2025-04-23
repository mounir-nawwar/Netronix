import orderModel from '../models/orderModel.js';
import userModel from '../models/userModel.js';
import productModel from '../models/productModel.js';

// Guest order placement
const placeGuestOrder = async (req, res) => {
    try {
        const { items, amount, address } = req.body;

        // Check inventory availability before placing order
        for (const item of items) {
            const product = await productModel.findById(item.productId);
            
            if (!product) {
                return res.json({
                    success: false,
                    message: `Product not found: ${item.productId}`
                });
            }
            
            // Check if the size exists in inventory
            if (!product.inventory || !product.inventory[item.size]) {
                return res.json({
                    success: false,
                    message: `Size ${item.size} not available for product: ${product.name}`
                });
            }
            
            // Check if enough quantity is available
            if (product.inventory[item.size] < item.quantity) {
                return res.json({
                    success: false,
                    message: `Not enough inventory for ${product.name} in size ${item.size}. Available: ${product.inventory[item.size]}, Requested: ${item.quantity}`
                });
            }
        }

        // Update inventory for each product
        for (const item of items) {
            try {
                console.log(`Updating inventory for product: ${item.productId}, size: ${item.size}, quantity: ${item.quantity}`);
                
                // Use findOneAndUpdate to atomically update the inventory
                const updateResult = await productModel.findByIdAndUpdate(
                    item.productId,
                    { $inc: { [`inventory.${item.size}`]: -item.quantity } },
                    { new: true, runValidators: true }
                );
                
                if (!updateResult) {
                    console.log(`Product not found: ${item.productId}`);
                    continue;
                }
                
                console.log(`Inventory updated - Product: ${updateResult.name}, Size: ${item.size}, Updated inventory:`, updateResult.inventory);
            } catch (error) {
                console.error(`Error updating inventory for product ${item.productId}:`, error);
            }
        }

        // Find the highest current order number
        const lastOrder = await orderModel.findOne().sort('-orderNumber');
        const nextOrderNumber = lastOrder ? lastOrder.orderNumber + 1 : 1000;

        const orderData = {
            // No userId for guest orders
            orderNumber: nextOrderNumber,
            items,
            amount,
            address,
            paymentMethod: req.body.paymentMethod || 'COD',
            payment: false,
            date: new Date(),
            subtotal: req.body.subtotal || 0,
            delivery_fee: req.body.delivery_fee || 0,
            isGuestOrder: true
        }

        const newOrder = new orderModel(orderData);
        await newOrder.save();

        res.json({
            success: true,
            message: 'Order Placed Successfully',
            order: newOrder
        })

    } catch (error) {
        console.log(error);
        res.json({
            success: false,
            message: 'Order Placed Failed',
            error: error.message
        })
    }
}

// Placing orders using COD Method
const placeOrder = async (req, res) => {
    try {
        const { userId, items, amount, address } = req.body;

        // Check inventory availability before placing order
        for (const item of items) {
            const product = await productModel.findById(item.productId);
            
            if (!product) {
                return res.json({
                    success: false,
                    message: `Product not found: ${item.productId}`
                });
            }
            
            // Check if the size exists in inventory
            if (!product.inventory || !product.inventory[item.size]) {
                return res.json({
                    success: false,
                    message: `Size ${item.size} not available for product: ${product.name}`
                });
            }
            
            // Check if enough quantity is available
            if (product.inventory[item.size] < item.quantity) {
                return res.json({
                    success: false,
                    message: `Not enough inventory for ${product.name} in size ${item.size}. Available: ${product.inventory[item.size]}, Requested: ${item.quantity}`
                });
            }
        }

        // Update inventory for each product
        for (const item of items) {
            try {
                console.log(`Updating inventory for product: ${item.productId}, size: ${item.size}, quantity: ${item.quantity}`);
                
                // Use findOneAndUpdate to atomically update the inventory
                const updateResult = await productModel.findByIdAndUpdate(
                    item.productId,
                    { $inc: { [`inventory.${item.size}`]: -item.quantity } },
                    { new: true, runValidators: true }
                );
                
                if (!updateResult) {
                    console.log(`Product not found: ${item.productId}`);
                    continue;
                }
                
                console.log(`Inventory updated - Product: ${updateResult.name}, Size: ${item.size}, Updated inventory:`, updateResult.inventory);
            } catch (error) {
                console.error(`Error updating inventory for product ${item.productId}:`, error);
            }
        }

        // Find the highest current order number
        const lastOrder = await orderModel.findOne().sort('-orderNumber');
        const nextOrderNumber = lastOrder ? lastOrder.orderNumber + 1 : 1000;

        const orderData = {
            userId,
            orderNumber: nextOrderNumber,
            items,
            amount,
            address,
            paymentMethod: req.body.paymentMethod || 'COD',
            payment: false,
            date: new Date(),
            subtotal: req.body.subtotal || 0,
            delivery_fee: req.body.delivery_fee || 0
        }

        const newOrder = new orderModel(orderData);
        await newOrder.save();

        await userModel.findByIdAndUpdate(userId, { cartData: [] });

        res.json({
            success: true,
            message: 'Order Placed Successfully',
            order: newOrder
        })

    } catch (error) {
        console.log(error);
        res.json({
            success: false,
            message: 'Order Placed Failed',
            error: error.message
        })

    }
}


//All Orders data for Admin
const allOrders = async (req, res) => {
    try {
        const orders = await orderModel.find({});
        
        // Enrich orders with product details
        const enrichedOrders = await Promise.all(orders.map(async (order) => {
            // Convert to plain object so we can modify it
            const orderObj = order.toObject();
            
            // Enrich each item with product details
            const enrichedItems = await Promise.all(orderObj.items.map(async (item) => {
                try {
                    // Find product details
                    const product = await productModel.findById(item.productId);
                    
                    if (product) {
                        // Return item with product details
                        return {
                            ...item,
                            name: product.name,
                            price: product.price,
                            image: Array.isArray(product.image) ? product.image[0] : product.image,
                            brand: product.brand
                        };
                    }
                    
                    return item; // Return original item if product not found
                } catch (err) {
                    console.log(`Error fetching product ${item.productId}:`, err);
                    return item; // Return original item on error
                }
            }));
            
            // Replace items with enriched items
            orderObj.items = enrichedItems;
            return orderObj;
        }));
        
        res.json({
            success: true,
            orders: enrichedOrders
        });

    } catch (error) {
        console.log(error);
        res.json({
            success: false,
            message: 'Order Fetching Failed',
            error: error.message
        });
    }
}

// User Order Data for Frontend
const userOrders = async (req, res) => {
    try {
        const { userId } = req.body;

        // Get all orders for this user
        const orders = await orderModel.find({ userId });
        
        // Enrich orders with product details
        const enrichedOrders = await Promise.all(orders.map(async (order) => {
            // Convert to plain object so we can modify it
            const orderObj = order.toObject();
            
            // Enrich each item with product details
            const enrichedItems = await Promise.all(orderObj.items.map(async (item) => {
                try {
                    // Find product details
                    const product = await productModel.findById(item.productId);
                    
                    if (product) {
                        // Return item with product details
                        return {
                            ...item,
                            name: product.name,
                            price: product.price,
                            image: Array.isArray(product.image) ? product.image[0] : product.image,
                            category: product.category,
                            subCategory: product.subCategory
                        };
                    }
                    
                    return item; // Return original item if product not found
                } catch (err) {
                    console.log(`Error fetching product ${item.productId}:`, err);
                    return item; // Return original item on error
                }
            }));
            
            // Replace items with enriched items
            orderObj.items = enrichedItems;
            return orderObj;
        }));
        
        res.json({
            success: true, 
            orders: enrichedOrders
        });

    } catch (error) {
        console.log(error);
        res.json({
            success: false,
            message: 'Order Fetching Failed',
            error: error.message
        });
    }
}


// Update Order Status from Admin Panel
const updateStatus = async (req, res) => {
    try {
        
        const { orderId, status } = req.body;
        const order = await orderModel.findByIdAndUpdate(orderId, { status });

        res.json({
            success: true,
            message: 'Order Status Updated Successfully',
            order
        })

    } catch (error) {
        console.log(error);
        res.json({
            success: false,
            message: 'Order Status Update Failed',
            error: error.message
        })
    }
}

export { placeOrder, allOrders, userOrders, updateStatus, placeGuestOrder };


