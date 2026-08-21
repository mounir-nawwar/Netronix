import express from 'express'
import { addToCart, getUserCart, updateCart, mergeCart } from '../controllers/cartController.js'
import authUser from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { addToCartSchema, updateCartSchema, getCartSchema, mergeCartSchema } from '../validators/cart.js'

const cartRouter = express.Router()

cartRouter.post('/get', authUser, validate(getCartSchema), getUserCart)
cartRouter.post('/add', authUser, validate(addToCartSchema), addToCart)
cartRouter.post('/update', authUser, validate(updateCartSchema), updateCart)
// The guest cart handed over at login, merged in one write (FE-009).
cartRouter.post('/merge', authUser, validate(mergeCartSchema), mergeCart)

export default cartRouter
